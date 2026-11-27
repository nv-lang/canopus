"""Run the local transport probe against a `nova build src/canopus.nv` binary."""

import argparse
import base64
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


def agent():
    for line in sys.stdin.buffer:
        request = json.loads(line)
        if request["method"] == "burst":
            sys.stdout.buffer.write(b'{"jsonrpc":"2.0","method":"more"}\n' * 4100)
            sys.stdout.buffer.flush()
            Path("burst-done").touch()
            continue
        assert line.endswith(b"\r\n"), line
        assert os.environ["CANOPUS_PROBE"] == "set-by-daemon"
        for index, frame in enumerate((
            b'{"jsonrpc":"2.0","method":"session/update","params":{"text":"a"}}\r\n',
            b'{"jsonrpc":"2.0","method":"session/update","params":{"text":"b"}}\n',
            b'{"jsonrpc":"2.0","id":42,"result":{"stopReason":"end_turn"}}\r\n',
        )):
            sys.stdout.buffer.write(frame)
            sys.stdout.buffer.flush()
            if index == 0:
                wait_until(lambda: Path("continue-turn").exists())
        Path("turn-done").touch()


def wait_until(check, timeout=8):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = check()
        if result:
            return result
        time.sleep(0.02)
    raise AssertionError("timed out waiting for daemon or agent")


def probe(binary, root):
    key = secrets.token_hex(32)
    key_file = root / "key"
    key_file.write_text(key)
    key_file.chmod(0o600)
    with subprocess.Popen(
        [binary, "daemon", "--port", "0", "--key-file", str(key_file)],
        stdout=subprocess.PIPE,
        start_new_session=True,
    ) as daemon:
        instance = None
        owner = "hub-one"
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(daemon.stdout, selectors.EVENT_READ)
                assert selector.select(15), "daemon did not announce its port"
                address = daemon.stdout.readline().decode().strip().split()[-1]
            host, port = address.rsplit(":", 1)
            assert host == "127.0.0.1", address

            def call(op, **fields):
                msg = dict(op=op, version=1, key=key, session="test-agent", owner="hub-one")
                msg.update(fields)
                with socket.create_connection((host, int(port)), timeout=8) as sock:
                    sock.sendall(json.dumps(msg).encode() + b"\n")
                    with sock.makefile("rb") as response:
                        return json.loads(response.readline())

            assert call("start", key="invalid")["error"] == "unauthorized"
            assert call("start", version=2)["error"] == "wrong_version"
            started = call(
                "start",
                program=sys.executable,
                args=[str(Path(__file__).resolve()), "--agent"],
                cwd=str(root),
                env=[dict(key="CANOPUS_PROBE", value="set-by-daemon")],
            )
            instance = started["instance"]
            assert call("start")["pid"] == started["pid"]
            assert call("poll", instance="old", after=0)["error"] == "wrong_instance"
            assert call("poll", instance=instance, after=1)["error"] == "cursor_ahead"
            assert call("poll", instance=instance, after=-1)["error"] == "invalid_cursor"
            assert call("poll", instance=instance, after=0, owner="hub-two")["error"] == "busy"

            prompt = base64.b64encode(b'{"jsonrpc":"2.0","id":42,"method":"session/prompt"}\r\n').decode()
            assert call("send", instance=instance, data=prompt)["instance"] == instance
            first = wait_until(lambda: call("poll", instance=instance, after=0)["frames"])
            assert [f["seq"] for f in first] == [1], first
            assert base64.b64decode(first[0]["data"]).endswith(b"\r\n")
            (root / "continue-turn").touch()
            wait_until(lambda: (root / "turn-done").exists())

            def attach():
                response = call("poll", instance=instance, after=1, owner="hub-two")
                if response.get("error") == "busy":
                    return None
                return response

            caught_up = wait_until(attach)
            owner = "hub-two"
            assert caught_up["pid"] == started["pid"]
            assert caught_up["head"] == 3
            assert [f["seq"] for f in caught_up["frames"]] == [2, 3]
            final = base64.b64decode(caught_up["frames"][-1]["data"])
            assert final.endswith(b"\r\n")
            assert json.loads(final) == {"jsonrpc": "2.0", "id": 42, "result": {"stopReason": "end_turn"}}
            assert call("poll", instance=instance, after=3, owner="hub-two")["frames"] == []
            assert call("send", instance=instance, owner="hub-two", data="broken?")["error"] == "invalid_frame"

            burst = base64.b64encode(b'{"method":"burst"}\n').decode()
            assert call("send", instance=instance, owner="hub-two", data=burst)["instance"] == instance
            wait_until(lambda: (root / "burst-done").exists())
            wait_until(lambda: call("poll", instance=instance, after=4103, owner="hub-two").get("head") == 4103, timeout=30)
            assert call("poll", instance=instance, after=1, owner="hub-two")["error"] == "cursor_expired"
            assert call("stop", instance=instance, owner="hub-two")["instance"] == instance

            def stopped():
                response = call("poll", instance=instance, after=4103, owner="hub-two")
                return response if {f["kind"] for f in response.get("frames", [])} == {"exit", "eof"} else None

            wait_until(stopped)
            assert call("send", instance=instance, owner="hub-two", data=prompt)["error"] == "agent_closed"
        finally:
            if instance is not None and daemon.poll() is None:
                try:
                    call("stop", instance=instance, owner=owner)
                except (OSError, ValueError):
                    pass
            daemon.terminate()
            daemon.wait(timeout=5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", nargs="?", type=Path)
    parser.add_argument("--agent", action="store_true")
    options = parser.parse_args()
    if options.agent:
        agent()
    else:
        if options.binary is None:
            parser.error("the Canopus binary is required")
        with tempfile.TemporaryDirectory(prefix="canopus-daemon-") as tmp:
            probe(str(options.binary.resolve()), Path(tmp))
        print("local daemon transport: passed")
