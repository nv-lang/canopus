#!/usr/bin/env python3
"""One resident ACP agent and a bounded, in-memory replay stream."""

import argparse
import asyncio
import base64
from collections import deque
import hmac
import ipaddress
import json
from pathlib import Path
import time
import uuid

MAX_LINE = 1024 * 1024
RETENTION = 16 * 1024 * 1024


def encode(frame):
    return json.dumps(frame, separators=(",", ":")).encode() + b"\n"


class Proxy:
    def __init__(self, agent, key):
        self.agent = agent
        self.key = key
        self.instance = uuid.uuid4().hex
        self.started = time.monotonic()
        self.seq = 0
        self.frames = deque()
        self.retained_bytes = 0
        self.changed = asyncio.Event()
        self.attached = False

    def log(self, event, **fields):
        print(encode({"ms": self.ms(), "event": event, **fields}).decode().rstrip(), flush=True)

    def ms(self):
        return round((time.monotonic() - self.started) * 1000)

    async def record(self):
        while line := await self.agent.stdout.readline():
            self.seq += 1
            frame = encode({
                "seq": self.seq, "proxy_ms": self.ms(),
                "acp": base64.b64encode(line).decode("ascii"),
            })
            self.frames.append(frame)
            self.retained_bytes += len(frame)
            while self.retained_bytes > RETENTION:
                self.retained_bytes -= len(self.frames.popleft())
            self.changed.set()

    async def replay(self, writer, after):
        while True:
            first = self.seq - len(self.frames) + 1
            if after + 1 < first:
                writer.write(encode({"error": "cursor_expired"}))
                await writer.drain()
                return
            if after == self.seq:
                self.changed.clear()
                await self.changed.wait()
                continue
            writer.write(self.frames[after + 1 - first])
            await writer.drain()
            after += 1

    async def forward(self, reader):
        while line := await reader.readline():
            frame = json.loads(line)
            payload = base64.b64decode(frame["acp"], validate=True)
            if len(payload) > MAX_LINE or not payload.endswith(b"\n") or payload.count(b"\n") != 1:
                raise ValueError("invalid ACP line")
            if json.loads(payload).get("jsonrpc") != "2.0":
                raise ValueError("invalid JSON-RPC version")
            self.agent.stdin.write(payload)
            await self.agent.stdin.drain()

    async def handle(self, reader, writer):
        tasks = []
        accepted = False
        try:
            hello = json.loads(await asyncio.wait_for(reader.readline(), 5))
            after = hello.get("after")
            key = hello.get("key")
            instance = hello.get("instance")
            error = None
            if not isinstance(key, str) or not hmac.compare_digest(key.encode(), self.key):
                error = "unauthorized"
            elif hello.get("version") != 1:
                error = "version_mismatch"
            elif self.attached:
                error = "client_attached"
            elif instance != self.instance and not (instance is None and after == 0):
                error = "wrong_instance"
            elif type(after) is not int or after < 0 or after > self.seq:
                error = "invalid_cursor"
            elif after < self.seq - len(self.frames):
                error = "cursor_expired"
            if error:
                writer.write(encode({"error": error}))
                await writer.drain()
                return

            self.attached = accepted = True
            self.log("attach", after=after, head=self.seq, agent_pid=self.agent.pid)
            writer.write(encode({"instance": self.instance, "head": self.seq}))
            await writer.drain()
            tasks = [
                asyncio.create_task(self.replay(writer, after)),
                asyncio.create_task(self.forward(reader)),
            ]
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        except (OSError, TimeoutError, ValueError, AttributeError):
            pass
        finally:
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            if accepted:
                self.attached = False
                self.log("detach", head=self.seq, agent_pid=self.agent.pid)
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass


async def main(args):
    key = args.key_file.read_bytes().strip()
    if len(key) < 32:
        raise SystemExit("Use a private file with at least 32 random ASCII characters")
    address = ipaddress.ip_address(args.bind)
    if address.is_unspecified or address.is_multicast:
        raise SystemExit("Bind explicitly to a loopback or a WireGuard address")
    agent = await asyncio.create_subprocess_exec(
        *args.agent, cwd=args.cwd, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, limit=MAX_LINE,
    )
    proxy = Proxy(agent, key)
    try:
        server = await asyncio.start_server(proxy.handle, args.bind, args.port, limit=2 * MAX_LINE)
        async with server:
            proxy.log("listening", port=args.port, agent_pid=agent.pid)
            await proxy.record()
        code = await agent.wait()
        proxy.log("agent_exit", code=code)
        raise SystemExit(1)
    finally:
        if agent.returncode is None:
            agent.kill()
            await agent.wait()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--cwd", required=True)
    parser.add_argument("agent", nargs="+")
    asyncio.run(main(parser.parse_args()))
