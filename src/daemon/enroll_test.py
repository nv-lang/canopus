"""Acceptance test for daemon enrollment through an isolated Canopus front."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
import json
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from hub_test import Lines, wait_for


def free_port(host="127.0.0.1"):
    with socket.socket() as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def api(port, path, payload=None, status=200, headers=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = Request(f"http://127.0.0.1:{port}{path}", body, {"Content-Type": "application/json", **(headers or {})})
    try:
        response = urlopen(req, timeout=10)
    except HTTPError as error:
        response = error
    with response:
        assert response.status == status, (response.status, status)
        return json.load(response)


def exchange(host, port, request):
    with socket.create_connection((host, port), timeout=5) as sock:
        sock.sendall(json.dumps(request).encode() + b"\n")
        with sock.makefile("rb") as reply:
            return json.loads(reply.readline())


def wire(host, port, daemon_id, key):
    return exchange(host, port, dict(version=1, daemon_id=daemon_id, key=key, op="ping"))


def redeem(port, daemon_id, enroll_key):
    return exchange("127.0.0.1", port, dict(version=1, op="enroll", id=daemon_id, enroll_key=enroll_key))


def open_page(spawn, port):
    page = spawn(["node", "-e", """
        const ws = new WebSocket('ws://127.0.0.1:' + process.argv[1] + '/ws');
        ws.addEventListener('open', () => console.log('ready'));
        ws.addEventListener('message', ({ data }) => {
            const value = JSON.parse(data);
            for (const event of Array.isArray(value) ? value : [value]) console.log(JSON.stringify(event));
        });
        require('node:readline').createInterface({ input: process.stdin })
            .on('line', line => ws.send(line));
    """, str(port)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    lines = Lines(page.stdout)
    lines.until(lambda line: line == "ready")

    def send(kind, **fields):
        trace = fields.pop("trace", "enroll-session")
        message = dict(id=secrets.token_hex(8), trace=trace, step=0, kind=kind, input=fields, time=int(time.time() * 1000))
        page.stdin.write(json.dumps(message).encode() + b"\n")
        page.stdin.flush()

    return lines, send


def main(binary, host="127.0.0.1"):
    repo = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix="canopus-enrollment-") as temp, ExitStack() as stack:
        root = Path(temp)
        port = free_port()
        socket_port = free_port(host)
        config = root / "config.json"
        config.write_text(json.dumps(dict(port=port, store="files", voice=False, agents=[{
            "id": "fixture", "label": "Fixture", "program": sys.executable,
            "args": [str(Path(__file__).with_name("hub_test.py").resolve()), "--agent"], "ask": "off",
        }])))
        state = root / "state"

        def spawn(command, **kwargs):
            proc = subprocess.Popen(command, cwd=kwargs.pop("cwd", root), **kwargs)
            stack.callback(proc.wait, 10)
            stack.callback(proc.terminate)
            return proc

        front = spawn([binary, "serve", "--config", str(config)], cwd=repo, stderr=subprocess.PIPE)
        Lines(front.stderr).until(lambda line: "listening on" in line)
        assert api(port, "/api/daemons")["daemons"] == []
        issue = "/api/daemons/issue"
        good = dict(id="fixture", host=host, port=socket_port, cwd=str(root))
        expiring = dict(id="expiry", host=host, port=free_port(host))
        request_at = int(time.time() * 1000)
        first = api(port, issue, good)
        enroll_port = first["enroll_port"]
        assert enroll_port != port
        assert request_at + 899_000 <= first["expires_at"] <= request_at + 901_000
        assert api(port, "/api/daemons")["daemons"] == []
        second = api(port, issue, good)
        assert first["enroll_key"] != second["enroll_key"]
        assert redeem(enroll_port, "fixture", first["enroll_key"])["code"] == "invalid_enroll_key"

        expired = api(port, issue, expiring)
        row = state / "daemon-enrollment" / "expiry.json"
        data = json.loads(row.read_text())
        data["expires_at"] = int(time.time() * 1000) - 1
        row.write_text(json.dumps(data))
        assert redeem(enroll_port, "expiry", expired["enroll_key"])["code"] == "expired_enroll_key"

        # Two clients may present the same outstanding token concurrently.
        race = dict(id="race", host=host, port=free_port(host))
        bootstrap = api(port, issue, race)
        rejected = exchange("127.0.0.1", enroll_port, dict(version=1, op="revoke", id="race"))
        assert rejected["error"] == "invalid_request"
        assert api(port, issue, race, 403, {"Host": "foreign.example"})["code"] == "forbidden_host"
        assert api(port, issue, race, 403, {"Origin": "http://foreign.example"})["code"] == "forbidden_origin"
        with ThreadPoolExecutor(2) as pool:
            replies = list(pool.map(lambda _: redeem(enroll_port, "race", bootstrap["enroll_key"]), range(2)))
        assert sum("key" in reply for reply in replies) == 1
        assert sum(reply.get("code") == "invalid_enroll_key" for reply in replies) == 1
        api(port, "/api/daemons/revoke", dict(id="race"))
        inventory = api(port, "/api/daemons")
        assert inventory["daemons"] == []
        retired = next(machine for machine in inventory["machines"] if machine["id"] == "race")
        assert retired["status"] == "revoked" and retired["revocation"] == "pending"
        late_key = next(reply["key"] for reply in replies if "key" in reply)
        late_key_file = root / "late.key"
        late_key_file.touch(mode=0o600)
        late_key_file.write_text(late_key)
        late_daemon = spawn([binary, "daemon", "--id", "race", "--bind", host, "--port", str(race["port"]),
                             "--key-file", str(late_key_file)], stdout=subprocess.PIPE)
        Lines(late_daemon.stdout).until(lambda line: "listening on" in line)
        wait_for(lambda: wire(host, race["port"], "race", late_key).get("error") == "revoked")

        bootstrap_file = root / "bootstrap"
        bootstrap_file.touch(mode=0o600)
        bootstrap_file.write_text(second["enroll_key"])
        key_file = root / "daemon.key"
        command = [binary, "daemon", "--id", "fixture", "--bind", host, "--port", str(socket_port), "--key-file", str(key_file)]
        daemon = spawn(command + ["--enroll-hub-port", str(enroll_port), "--enroll-key-file", str(bootstrap_file)], stdout=subprocess.PIPE)
        Lines(daemon.stdout).until(lambda line: "listening on" in line)
        key = key_file.read_text().strip()
        assert len(key) == 64 and key != second["enroll_key"]
        assert key_file.stat().st_mode & 0o777 == 0o600
        assert redeem(enroll_port, "fixture", second["enroll_key"])["code"] == "invalid_enroll_key"
        assert wire(host, socket_port, "fixture", key)["version"] == 1

        def online():
            listing = api(port, "/api/daemons")
            return listing["daemons"] == ["fixture"] and any(
                machine["id"] == "fixture" and machine["status"] == "online" and machine["last_contact"] > 0
                for machine in listing["machines"]
            )
        wait_for(online)
        assert key not in json.dumps(api(port, "/api/daemons"))
        lines, send = open_page(spawn, port)
        send("session_created", name="Enrollment acceptance", agent="fixture", daemon_id="fixture")
        created, _ = lines.until(lambda line: json.loads(line).get("kind") == "session_created")
        assert json.loads(created)["input"]["daemon_id"] == "fixture"
        send("user_message", text="restart-probe", turn="revocation-test")
        lines.until(lambda line: "agent_chunk" in line and "daemon-echo" in line)
        assert int((root / "agent-parent").read_text()) == daemon.pid
        agent_pid = json.loads((root / "agent-prompts").read_text().splitlines()[0])["pid"]
        api(port, "/api/daemons/revoke", dict(id="fixture"))
        assert api(port, "/api/daemons")["daemons"] == []
        def revoked_turn(line):
            return '"kind":"agent_refused"' in line and '"reason":"daemon_revoked"' in line
        lines.until(revoked_turn, timeout=10)
        reopened, _ = open_page(spawn, port)
        reopened.until(revoked_turn, timeout=10)
        send("session_created", trace="revoked-session", name="Rejected", agent="fixture", daemon_id="fixture")
        lines.until(lambda line: "revoked-session" in line and "was revoked" in line, timeout=10)
        assert redeem(enroll_port, "fixture", second["enroll_key"])["code"] == "daemon_revoked"
        wait_for(lambda: wire(host, socket_port, "fixture", key).get("error") == "revoked")
        wait_for(lambda: not Path(f"/proc/{agent_pid}").exists(), timeout=4)
        daemon.terminate()
        daemon.wait(10)
        daemon = spawn(command, stdout=subprocess.PIPE)
        Lines(daemon.stdout).until(lambda line: "listening on" in line)
        assert wire(host, socket_port, "fixture", key)["error"] == "revoked"
    print("daemon enrollment, TTL, reissue, concurrent redemption and durable revocation: OK")


if __name__ == "__main__":
    main(str(Path(sys.argv[1]).resolve()), *sys.argv[2:])
