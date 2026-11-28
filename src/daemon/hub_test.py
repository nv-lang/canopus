"""Exercise the installed stdio hub with an agent owned by the daemon."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from ipaddress import IPv4Address
import json
import os
from pathlib import Path
import secrets
import selectors
import socket
import subprocess
import sys
import tempfile
import time


def fake_agent():
    def send(**message):
        print(json.dumps(dict(jsonrpc="2.0", **message)), flush=True)

    def chunk(text):
        send(method="session/update", params={
            "sessionId": "daemon-test-session",
            "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": text}},
        })

    interrupted = None
    for line in sys.stdin:
        request = json.loads(line)
        method = request["method"]
        if method == "initialize":
            result = dict(protocolVersion=1, agentInfo={"name": "daemon-test", "version": "1"})
        elif method == "session/new":
            assert Path(request["params"]["cwd"]).samefile(Path.cwd())
            result = dict(sessionId="daemon-test-session")
        elif method == "session/prompt":
            assert request["params"]["sessionId"] == "daemon-test-session"
            Path("agent-parent").write_text(str(os.getppid()))
            prompt = json.dumps(request["params"]["prompt"], ensure_ascii=False)
            with Path("agent-prompts").open("a") as transcript:
                transcript.write(json.dumps({"pid": os.getpid(), "rpc": request["id"], "prompt": prompt}) + "\n")
            chunk("daemon-echo")
            if "urgent correction" not in prompt and ("interrupt-probe" in prompt or "interrupt-refusal-probe" in prompt):
                interrupted = request["id"], "interrupt-refusal-probe" in prompt
                continue
            if "restart-probe" in prompt:
                wait_for(lambda: Path("continue-turn").exists())
                chunk("after-restart")
            if "remote-break-probe" in prompt:
                wait_for(lambda: Path("continue-turn").exists())
                chunk("after-break")
            result = dict(stopReason="end_turn")
        elif method == "session/cancel":
            assert request["params"]["sessionId"] == "daemon-test-session"
            rpc, refused = interrupted
            interrupted = None
            if refused:
                send(id=None, error={"code": -32600, "message": "refused by fixture"})
                chunk("original finished")
                send(id=rpc, result=dict(stopReason="end_turn"))
            else:
                send(id=rpc, result=dict(stopReason="cancelled"))
                chunk("discarded after cancel")
                send(id=rpc, result=dict(stopReason="end_turn"))
            continue
        else:
            raise AssertionError(method)
        send(id=request["id"], result=result)
        if method == "session/prompt":
            Path("turn-complete").touch()


class Lines:
    def __init__(self, pipe):
        self.pipe = pipe
        self.pending = b""

    def until(self, predicate, timeout=20):
        deadline = time.monotonic() + timeout
        seen = []
        with selectors.DefaultSelector() as selector:
            selector.register(self.pipe, selectors.EVENT_READ)
            while time.monotonic() < deadline:
                if b"\n" not in self.pending:
                    if not selector.select(max(0, deadline - time.monotonic())):
                        break
                    chunk = os.read(self.pipe.fileno(), 65536)
                    if not chunk:
                        break
                    self.pending += chunk
                    continue
                line, self.pending = self.pending.split(b"\n", 1)
                text = line.decode()
                seen.append(text)
                if predicate(text):
                    return text, seen
        raise AssertionError(f"missing response from process: {seen[-8:]}")


def wait_for(check, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.02)
    raise AssertionError("timed out waiting for the fixture")


@contextmanager
def running_hub(path, config, root):
    with subprocess.Popen(
        [path, "--config", config], stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=root,
    ) as hub:
        try:
            lines = Lines(hub.stdout)
            lines.until(lambda line: line == "ready")

            def page(kind, **fields):
                wire = json.dumps(dict(kind=kind, trace="fixture-session", input=fields))
                hub.stdin.write(f"msg\t1\t{wire}\n".encode())
                hub.stdin.flush()

            hub.stdin.write(b"open\t1\n")
            hub.stdin.flush()
            yield hub, lines, page
        finally:
            if hub.poll() is None:
                try:
                    hub.communicate(b"quit\n", timeout=10)
                except subprocess.TimeoutExpired:
                    hub.kill()
                    hub.communicate()


def page_event(line):
    return json.loads(line.split("\t", 1)[1])


def lose_ack(session_dir, legacy=False):
    inbox = session_dir / "inbox"
    rows = [json.loads(line) for line in inbox.read_text().splitlines()]
    seq = next(
        event["seq"] for row in rows if row["t"] == "daemon" for event in row["events"]
        if event["name"] == "agent_chunk" and event["input"] == "daemon-echo"
    )
    ack = next(i for i, row in enumerate(rows) if row["t"] == "ack" and row["seq"] == seq)
    rows.pop(ack)
    if legacy:
        for row in rows:
            if row["t"] == "daemon":
                del row["state"]["daemon_id"]
    # Model a lost acknowledgement and the beginning of a record torn by the crash.
    inbox.write_text("".join(json.dumps(row) + "\n" for row in rows) + '{"t":"daemon",')


def interrupt_turn(lines, page, session_dir, original, refused):
    page("user_message", text="urgent correction", urgent=True)
    _, frames = lines.until(lambda line: '"kind":"agent_done"' in line)
    if refused:
        _, later = lines.until(lambda line: '"kind":"agent_done"' in line)
        frames.extend(later)
    events = [page_event(line) for line in frames if "\t" in line]
    kinds = [event["kind"] for event in events]
    done = [event["input"]["turn"] for event in events if event["kind"] == "agent_done"]
    prompts = [json.loads(line) for line in (session_dir / "agent-prompts").read_text().splitlines()]
    assert len(prompts) == 2 and prompts[0]["pid"] == prompts[1]["pid"], prompts
    assert prompts[0]["rpc"] < prompts[1]["rpc"] and "urgent correction" in prompts[1]["prompt"], prompts
    if refused:
        assert done[0] == original["input"]["turn"] and done[1] != done[0], events
        assert kinds.count("turn_interrupt_queued") == 1 and "cancel" not in kinds and "turn_resume" not in kinds, events
        queued = next(event for event in events if event["kind"] == "turn_interrupt_queued")
        assert "-32600" in queued["input"]["reason"], queued
    else:
        assert done[0] != original["input"]["turn"], events
        assert kinds.index("cancel") < kinds.index("turn_resume"), events
        resumed = next(event for event in events if event["kind"] == "turn_resume")
        assert resumed["input"]["previous_turn"] == original["input"]["turn"], resumed
        assert resumed["input"]["turn"] == done[0], resumed
        assert "interrupt-probe" in prompts[1]["prompt"] and "daemon-echo" in prompts[1]["prompt"], prompts
        assert "discarded after cancel" not in "\n".join(frames), frames
        inbox = [json.loads(line) for line in (session_dir / "inbox").read_text().splitlines()]
        assert any(
            event["name"] == "agent_refused" and event["input"] == "StoppedByHuman"
            and event["wire"] == row["state"]["wire"] and event["wire"] > 0
            for row in inbox if row["t"] == "daemon" for event in row["events"]
        ), "the terminal reply must survive a restart at the frame boundary"


@contextmanager
def daemon_endpoint(canopus, root, key_file, remote, agent_dir):
    if remote:
        host, port, source, daemon_id = remote
        keys = key_file.parent / "daemon-keys"
        keys.mkdir(mode=0o700)
        selected = keys / f"{daemon_id}.key"
        selected.touch(mode=0o600)
        selected.write_bytes(source.read_bytes())
        fixture_key = keys / "unreachable.key"
        fixture_key.touch(mode=0o600)
        fixture_key.write_text(secrets.token_hex(32))
        yield {"id": daemon_id, "host": host, "port": port, "cwd": str(agent_dir)}, None
        return
    key_file.write_text(secrets.token_hex(32))
    with subprocess.Popen(
        [canopus, "daemon", "--port", "0", "--key-file", key_file],
        stdout=subprocess.PIPE, cwd=root,
    ) as daemon:
        try:
            ready, _ = Lines(daemon.stdout).until(lambda line: line.startswith("canopus daemon listening on 127.0.0.1:"))
            yield {"port": int(ready.rsplit(":", 1)[1])}, daemon.pid
        finally:
            if daemon.poll() is None:
                daemon.terminate()
                try:
                    daemon.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    daemon.kill()
                    daemon.wait()


@contextmanager
def drop_local_tcp(host, port):
    # A connection to this machine's own WG address is routed via lo.
    # Only drop outbound packets from the current user to the test endpoint.
    expires = (datetime.now(timezone.utc) + timedelta(seconds=45)).strftime("%Y-%m-%dT%H:%M:%S")
    rule = [
        "-o", "lo", "-p", "tcp", "-d", host, "--dport", str(port),
        "-m", "owner", "--uid-owner", str(os.getuid()),
        "-m", "time", "--datestop", expires,
        "-m", "comment", "--comment", f"canopus-329-{os.getpid()}", "-j", "DROP",
    ]
    iptables = ["sudo", "-n", "iptables", "-w", "5"]
    subprocess.run([*iptables, "-I", "OUTPUT", "1", *rule], check=True)
    try:
        yield
    finally:
        subprocess.run([*iptables, "-D", "OUTPUT", *rule], check=True)


def daemon_records(session_dir):
    rows = [json.loads(line) for line in (session_dir / "inbox").read_text().splitlines()]
    return [row for row in rows if row["t"] == "daemon"]


def finish_remote_break(lines, session_dir, agent_dir, endpoint, original):
    host, port = endpoint["host"], endpoint["port"]
    before = daemon_records(session_dir)[-1]["state"]["wire"]
    assert before > 0
    with drop_local_tcp(host, port):
        down_at = time.monotonic()
        try:
            with socket.create_connection((host, port), timeout=0.5):
                raise AssertionError("the daemon still accepts local TCP during DROP")
        except TimeoutError:
            pass
        (agent_dir / "continue-turn").touch()
        wait_for(lambda: (agent_dir / "turn-complete").exists())
        agent_finished_at = time.monotonic()
        time.sleep(max(0, down_at + 30 - agent_finished_at))
        assert daemon_records(session_dir)[-1]["state"]["wire"] == before, "hub received frames during DROP"
    up_at = time.monotonic()
    _, frames = lines.until(
        lambda line: '"kind":"agent_done"' in line or '"kind":"agent_refused"' in line,
        timeout=12,
    )
    caught_up_at = time.monotonic()
    events = [page_event(line) for line in frames if "\t" in line]
    assert events[-1]["kind"] == "agent_done", events
    assert events[-1]["input"]["turn"] == original["input"]["turn"], events
    assert [event["input"]["text"] for event in events if event["kind"] == "agent_chunk"] == ["after-break"]
    states = sorted({row["state"]["wire"] for row in daemon_records(session_dir) if row["state"]["wire"] > before})
    assert states == [before + 1, before + 2], states
    assert {row["state"]["daemon_id"] for row in daemon_records(session_dir)} == {endpoint["id"]}
    print(
        f"DROP {up_at - down_at:.3f}s; agent finished at +{agent_finished_at - down_at:.3f}s; "
        f"replay {before} -> {states[-1]} and same turn done in {caught_up_at - up_at:.3f}s after restore"
    )


def next_turn(lines, page, agent_dir):
    page("user_message", turn="next-turn", text="same agent for next turn")
    lines.until(lambda line: '"kind":"agent_done"' in line)
    prompts = [json.loads(line) for line in (agent_dir / "agent-prompts").read_text().splitlines()]
    assert len(prompts) == 2 and prompts[0]["pid"] == prompts[1]["pid"]
    assert prompts[1]["rpc"] > prompts[0]["rpc"]
    return prompts[0]["pid"]


def remove_fixture(lines, page, agent_pid):
    page("session_delete")
    lines.until(lambda line: '"kind":"session_deleted"' in line)
    wait_for(lambda: not Path(f"/proc/{agent_pid}").exists())


def smoke(canopus, hub_binary, root, restart=False, late_ack=False, graceful=False, interrupt=None,
          remote=None, remote_break=False):
    repo = Path(__file__).resolve().parents[2]
    (root / "machines").symlink_to(repo / "machines", target_is_directory=True)
    (root / "target").mkdir()
    hub_path = root / "target" / "canopus-hub"
    hub_path.symlink_to(hub_binary)
    state = root / "state"
    state.mkdir()
    key_file = state / "daemon.key"
    key_file.touch(mode=0o600)
    config = root / "config.json"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    config.write_text(json.dumps({"port": port, "agents": [{
        "id": "fixture", "label": "Fixture", "program": sys.executable,
        "args": [str(Path(__file__).resolve()), "--agent"], "ask": "off",
    }]}))
    session_dir = root / "data/sessions/fixture-session"
    agent_dir = session_dir
    if remote:
        agent_dir = root / "daemon-work"
        agent_dir.mkdir()
    with daemon_endpoint(canopus, root, key_file, remote, agent_dir) as (endpoint, pid):
        daemon_config = state / "daemon.json"
        if remote:
            with socket.socket() as unused:
                unused.bind(("127.0.0.1", 0))
                rejected = {"id": "unreachable", "host": "127.0.0.1", "port": unused.getsockname()[1]}
            inventory = [rejected, endpoint] if remote_break else [endpoint, rejected]
            daemon_config.write_text(json.dumps({"daemons": inventory}))
        else:
            daemon_config.write_text(json.dumps(endpoint))
        with running_hub(hub_path, config, root) as (hub, lines, page):
            choice = {"daemon_id": endpoint["id"]} if remote_break else {}
            page("session_created", name="Daemon fixture", agent="fixture", **choice)
            created, _ = lines.until(lambda line: '"kind":"session_created"' in line)
            if remote:
                assert page_event(created)["input"]["daemon_id"] == endpoint["id"]
            text = interrupt or ("restart-probe" if restart else "Check the managed transport")
            if remote_break:
                text = "remote-break-probe"
            page("user_message", turn="fixture-turn", text=text)
            _, events = lines.until(lambda line: '"kind":"agent_chunk"' in line and "daemon-echo" in line)
            parent = int((agent_dir / "agent-parent").read_text())
            if pid is not None:
                assert parent == pid
            original = page_event(events[-1])
            if interrupt:
                interrupt_turn(lines, page, session_dir, original, interrupt == "interrupt-refusal-probe")
                return
            if remote_break:
                finish_remote_break(lines, session_dir, agent_dir, endpoint, original)
                assert int((agent_dir / "agent-parent").read_text()) == parent
                agent_pid = next_turn(lines, page, agent_dir)
                remove_fixture(lines, page, agent_pid)
                return
            if not restart:
                lines.until(lambda line: '"kind":"agent_done"' in line)
                return

            transcript = (agent_dir / "agent-prompts").read_text()
            if graceful:
                hub.communicate(b"quit\n", timeout=10)
                assert hub.returncode == 0
            else:
                hub.kill()
                hub.wait(timeout=5)
            if late_ack:
                lose_ack(session_dir, legacy=not remote)
            if remote:
                daemon_config.write_text(json.dumps({"daemons": [rejected, endpoint]}))
            (agent_dir / "continue-turn").touch()
            wait_for(lambda: (agent_dir / "turn-complete").exists())

        restarting_at = time.monotonic()
        with running_hub(hub_path, config, root) as (hub, lines, page):
            _, events = lines.until(lambda line: '"kind":"agent_done"' in line, timeout=12)
            caught_up = []
            for line in events:
                if "\t" in line:
                    payload = page_event(line)
                    caught_up.extend(payload if isinstance(payload, list) else [payload])
            last = caught_up[-1]
            assert last["input"]["turn"] == original["input"]["turn"], caught_up
            for chunk in ("daemon-echo", "after-restart"):
                assert sum(event["kind"] == "agent_chunk" and event["input"]["text"] == chunk for event in caught_up) == 1
            assert sum(event["kind"] == "agent_done" for event in caught_up) == 1
            assert (agent_dir / "agent-prompts").read_text() == transcript
            restarted_in = time.monotonic() - restarting_at
            agent_pid = next_turn(lines, page, agent_dir)
            if remote:
                assert int((agent_dir / "agent-parent").read_text()) == parent
                assert daemon_records(session_dir)[-1]["state"]["daemon_id"] == endpoint["id"]
                print(f"hub restarted and same turn completed in {restarted_in:.3f}s; agent PID {agent_pid}")
                print(f"restored daemon {endpoint['id']} with unreachable daemon first in the inventory")
                remove_fixture(lines, page, agent_pid)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("canopus", nargs="?", type=Path)
    parser.add_argument("hub", nargs="?", type=Path)
    parser.add_argument("--agent", action="store_true")
    parser.add_argument("--restart", action="store_true")
    parser.add_argument("--late-ack", action="store_true")
    parser.add_argument("--graceful", action="store_true")
    parser.add_argument("--interrupt", choices=["accepted", "refused"])
    parser.add_argument("--remote-host", type=IPv4Address)
    parser.add_argument("--remote-port", type=int)
    parser.add_argument("--remote-key-file", type=Path)
    parser.add_argument("--remote-daemon-id", default="selectel")
    parser.add_argument("--remote-break", action="store_true")
    options = parser.parse_args()
    if options.agent:
        fake_agent()
    else:
        if options.canopus is None or options.hub is None:
            parser.error("the Canopus and hub binaries are required")
        remote = None
        if options.remote_host is not None:
            if not (options.remote_port and 1 <= options.remote_port <= 65535 and options.remote_key_file):
                parser.error("--remote-host requires --remote-port and --remote-key-file")
            if options.remote_host.is_unspecified:
                parser.error("--remote-host requires a specific local IPv4 address")
            if not options.remote_daemon_id or set(options.remote_daemon_id) - set("abcdefghijklmnopqrstuvwxyz0123456789-_") or options.remote_daemon_id == "unreachable":
                parser.error("--remote-daemon-id requires a distinct file-safe ID")
            with socket.socket() as probe:
                probe.bind((str(options.remote_host), 0))
            remote = str(options.remote_host), options.remote_port, options.remote_key_file, options.remote_daemon_id
            if options.interrupt or options.remote_break == bool(options.restart or options.late_ack or options.graceful):
                parser.error("choose remote --remote-break or a restart mode")
        elif options.remote_break or options.remote_port is not None or options.remote_key_file is not None:
            parser.error("remote options require --remote-host")
        interrupt = {"accepted": "interrupt-probe", "refused": "interrupt-refusal-probe"}.get(options.interrupt)
        with tempfile.TemporaryDirectory(prefix="canopus-daemon-hub-") as temporary:
            smoke(
                options.canopus.resolve(), options.hub.resolve(), Path(temporary),
                restart=options.restart or options.late_ack or options.graceful,
                late_ack=options.late_ack, graceful=options.graceful, interrupt=interrupt,
                remote=remote, remote_break=options.remote_break,
            )
        print(f"hub over {'remote' if remote else 'local'} daemon: passed")
