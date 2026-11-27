"""Exercise the installed stdio hub with an agent owned by the local daemon."""

import argparse
from contextlib import contextmanager
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

    for line in sys.stdin:
        request = json.loads(line)
        method = request["method"]
        if method == "initialize":
            result = dict(protocolVersion=1, agentInfo={"name": "daemon-test", "version": "1"})
        elif method == "session/new":
            result = dict(sessionId="daemon-test-session")
        elif method == "session/prompt":
            assert request["params"]["sessionId"] == "daemon-test-session"
            Path("agent-parent").write_text(str(os.getppid()))
            with Path("agent-prompts").open("a") as transcript:
                transcript.write(json.dumps({"pid": os.getpid(), "rpc": request["id"]}) + "\n")
            chunk("daemon-echo")
            if "restart-probe" in json.dumps(request["params"]["prompt"]):
                wait_for(lambda: Path("continue-turn").exists())
                chunk("after-restart")
            result = dict(stopReason="end_turn")
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


def lose_ack(session_dir):
    inbox = session_dir / "inbox"
    rows = [json.loads(line) for line in inbox.read_text().splitlines()]
    seq = next(
        event["seq"] for row in rows if row["t"] == "daemon" for event in row["events"]
        if event["name"] == "agent_chunk" and event["input"] == "daemon-echo"
    )
    ack = next(i for i, row in enumerate(rows) if row["t"] == "ack" and row["seq"] == seq)
    rows.pop(ack)
    # Model a lost acknowledgement and the beginning of a record torn by the crash.
    inbox.write_text("".join(json.dumps(row) + "\n" for row in rows) + '{"t":"daemon",')


def smoke(canopus, hub_binary, root, restart=False, late_ack=False, graceful=False):
    repo = Path(__file__).resolve().parents[2]
    (root / "machines").symlink_to(repo / "machines", target_is_directory=True)
    (root / "target").mkdir()
    hub_path = root / "target" / "canopus-hub"
    hub_path.symlink_to(hub_binary)
    state = root / "state"
    state.mkdir()
    key_file = state / "daemon.key"
    key_file.touch(mode=0o600)
    key_file.write_text(secrets.token_hex(32))
    config = root / "config.json"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    config.write_text(json.dumps({"port": port, "agents": [{
        "id": "fixture", "label": "Fixture", "program": sys.executable,
        "args": [str(Path(__file__).resolve()), "--agent"], "ask": "off",
    }]}))
    with subprocess.Popen(
        [canopus, "daemon", "--port", "0", "--key-file", key_file],
        stdout=subprocess.PIPE, cwd=root,
    ) as daemon:
        try:
            ready, _ = Lines(daemon.stdout).until(lambda line: line.startswith("canopus daemon listening on 127.0.0.1:"))
            (state / "daemon.json").write_text(json.dumps({"port": int(ready.rsplit(":", 1)[1])}))
            session_dir = root / "data/sessions/fixture-session"
            with running_hub(hub_path, config, root) as (hub, lines, page):
                page("session_created", name="Daemon fixture", agent="fixture")
                lines.until(lambda line: '"kind":"session_created"' in line)
                page("user_message", turn="fixture-turn", text="restart-probe" if restart else "Check the managed transport")
                _, events = lines.until(lambda line: '"kind":"agent_chunk"' in line and "daemon-echo" in line)
                assert int((session_dir / "agent-parent").read_text()) == daemon.pid
                if not restart:
                    lines.until(lambda line: '"kind":"agent_done"' in line)
                    return

                original = page_event(events[-1])
                transcript = (session_dir / "agent-prompts").read_text()
                if graceful:
                    hub.communicate(b"quit\n", timeout=10)
                    assert hub.returncode == 0
                else:
                    hub.kill()
                    hub.wait(timeout=5)
                if late_ack:
                    lose_ack(session_dir)
                (session_dir / "continue-turn").touch()
                wait_for(lambda: (session_dir / "turn-complete").exists())

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
                assert (session_dir / "agent-prompts").read_text() == transcript

                page("user_message", turn="next-turn", text="same agent after restart")
                lines.until(lambda line: '"kind":"agent_done"' in line)
                prompts = [json.loads(line) for line in (session_dir / "agent-prompts").read_text().splitlines()]
                assert len(prompts) == 2 and prompts[0]["pid"] == prompts[1]["pid"]
                assert prompts[1]["rpc"] > prompts[0]["rpc"]
        finally:
            if daemon.poll() is None:
                daemon.terminate()
                try:
                    daemon.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    daemon.kill()
                    daemon.wait()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("canopus", nargs="?", type=Path)
    parser.add_argument("hub", nargs="?", type=Path)
    parser.add_argument("--agent", action="store_true")
    parser.add_argument("--restart", action="store_true")
    parser.add_argument("--late-ack", action="store_true")
    parser.add_argument("--graceful", action="store_true")
    options = parser.parse_args()
    if options.agent:
        fake_agent()
    else:
        if options.canopus is None or options.hub is None:
            parser.error("the Canopus and hub binaries are required")
        with tempfile.TemporaryDirectory(prefix="canopus-daemon-hub-") as temporary:
            smoke(
                options.canopus.resolve(), options.hub.resolve(), Path(temporary),
                restart=options.restart or options.late_ack or options.graceful,
                late_ack=options.late_ack, graceful=options.graceful,
            )
        print("hub over local daemon: passed")
