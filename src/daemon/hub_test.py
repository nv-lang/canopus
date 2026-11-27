"""Exercise the installed stdio hub with an agent owned by the local daemon."""

import argparse
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
            send(method="session/update", params={
                "sessionId": "daemon-test-session",
                "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "daemon-echo"}},
            })
            result = dict(stopReason="end_turn")
        else:
            raise AssertionError(method)
        send(id=request["id"], result=result)


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


def smoke(canopus, hub_binary, root):
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
            with subprocess.Popen(
                [hub_path, "--config", config], stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=root,
            ) as hub:
                try:
                    lines = Lines(hub.stdout)
                    lines.until(lambda line: line == "ready")

                    def page(kind, **fields):
                        wire = json.dumps(dict(kind=kind, trace="fixture-session", input=fields))
                        hub.stdin.write(f"msg\t1\t{wire}\n".encode())
                        hub.stdin.flush()

                    hub.stdin.write(b"open\t1\n")
                    page("session_created", name="Daemon fixture", agent="fixture")
                    lines.until(lambda line: '"kind":"session_created"' in line)
                    page("user_message", turn="fixture-turn", text="Check the managed transport")
                    _, events = lines.until(lambda line: '"kind":"agent_done"' in line)
                    assert any('"kind":"agent_chunk"' in line and "daemon-echo" in line for line in events), events
                    assert int((root / "data/sessions/fixture-session/agent-parent").read_text()) == daemon.pid
                finally:
                    if hub.poll() is None:
                        try:
                            hub.communicate(b"quit\n", timeout=10)
                        except subprocess.TimeoutExpired:
                            hub.kill()
                            hub.communicate()
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
    options = parser.parse_args()
    if options.agent:
        fake_agent()
    else:
        if options.canopus is None or options.hub is None:
            parser.error("the Canopus and hub binaries are required")
        with tempfile.TemporaryDirectory(prefix="canopus-daemon-hub-") as temporary:
            smoke(options.canopus.resolve(), options.hub.resolve(), Path(temporary))
        print("hub over local daemon: passed")
