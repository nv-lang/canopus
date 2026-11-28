#!/usr/bin/env python3
"""Exercise a Kimi ACP turn across a controlled TCP disconnect."""

import argparse
import base64
import json
from pathlib import Path
import socket
import sys
import time
from contextlib import contextmanager

PROMPT_ID = 4
FOLLOWUP_ID = 5
END_MARKER = "CANOPUS-325-DONE"
FOLLOWUP_MARKER = "CANOPUS-325-AGAIN"


class Probe:
    def __init__(self, args):
        self.args = args
        key_file = args.key_file
        self.key = (sys.stdin.read() if key_file == "-" else Path(key_file).read_text()).strip()
        self.started = time.monotonic()
        self.after = 0
        self.instance = None
        self.deadline = 0
        self.finished = False
        self.first_approved = False
        self.finished_in_replay = False
        self.commands = ["sleep 7", "sleep 42"] if args.case == "running" else ["sleep 7"]

    def log(self, event, **fields):
        print(json.dumps({"t": round(time.monotonic() - self.started, 3), "event": event, **fields}), flush=True)

    @contextmanager
    def attach(self):
        with socket.create_connection((self.args.host, self.args.port), timeout=5) as self.socket:
            with self.socket.makefile("rb") as self.reader:
                self.send({"version": 1, "key": self.key, "instance": self.instance, "after": self.after})
                hello = self.read()
                if "error" in hello:
                    raise RuntimeError(hello["error"])
                if self.instance is not None and self.instance != hello["instance"]:
                    raise RuntimeError("proxy instance changed")
                self.instance = hello["instance"]
                self.log("attached", after=self.after, head=hello["head"])
                yield hello["head"]

    def send(self, frame):
        self.socket.sendall(json.dumps(frame).encode() + b"\n")

    def read(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("probe deadline elapsed")
        self.socket.settimeout(remaining)
        line = self.reader.readline()
        if not line:
            raise EOFError("proxy closed the stream")
        return json.loads(line)

    def rpc(self, **fields):
        raw = json.dumps({"jsonrpc": "2.0", **fields}).encode() + b"\n"
        self.send({"acp": base64.b64encode(raw).decode("ascii")})

    def call(self, number, method, **params):
        self.log("request", method=method, id=number)
        self.rpc(id=number, method=method, params=params)

    def prompt(self, number, session, text):
        self.call(number, "session/prompt", sessionId=session, prompt=[{"type": "text", "text": text}])

    def receive(self):
        frame = self.read()
        if "error" in frame:
            raise RuntimeError(frame["error"])
        if frame["seq"] != self.after + 1:
            raise RuntimeError("sequence gap or duplicate")
        rpc = json.loads(base64.b64decode(frame["acp"], validate=True))
        self.after = frame["seq"]
        if "method" in rpc and "id" in rpc:
            self.reply(rpc, frame["proxy_ms"])
        return rpc, frame["proxy_ms"]

    def reply(self, rpc, proxy_ms):
        method = rpc["method"]
        if method != "session/request_permission":
            self.rpc(id=rpc["id"], error={"code": -32601, "message": "method not supported"})
            return
        params = rpc["params"]
        call = params["toolCall"]
        # Kimi ACP 2.8.1 describes Bash approvals in the content of the call.
        details = [item.get("content", {}).get("text") for item in call.get("content", [])]
        command = next(
            (candidate for candidate in self.commands
             if call.get("title") == "Bash" and details == [f"Requesting approval to Running: {candidate}"]),
            None,
        )
        kind = "allow_once" if command in self.commands else "reject_once"
        selected = next((item for item in params.get("options", []) if item["kind"] == kind), None)
        self.log("permission", command=command, choice=kind if selected else "cancelled", seq=self.after, proxy_ms=proxy_ms)
        outcome = {"outcome": "cancelled"}
        if selected:
            outcome = {"outcome": "selected", "optionId": selected["optionId"]}
        self.rpc(id=rpc["id"], result={"outcome": outcome})
        if command == self.commands[0] and selected and kind == "allow_once":
            self.first_approved = True

    def result(self, number):
        while True:
            rpc, proxy_ms = self.receive()
            if "method" not in rpc and rpc.get("id") == number:
                if "error" in rpc:
                    error = rpc["error"]
                    detail = error.get("data")
                    code = detail.get("code") if isinstance(detail, dict) else None
                    raise RuntimeError(f"ACP request {number} failed ({error['code']}, {code})")
                return rpc["result"], proxy_ms

    def run(self):
        self.deadline = time.monotonic() + 180
        with self.attach():
            self.call(1, "initialize", protocolVersion=1, clientCapabilities={
                "fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False,
            }, clientInfo={"name": "canopus-probe", "version": "0.1.0"})
            init, _ = self.result(1)
            info = init.get("agentInfo", {})
            self.log("initialized", version=init.get("protocolVersion"), agent_version=info.get("version"))
            if any(method["id"] == "login" for method in init.get("authMethods", [])):
                self.call(2, "authenticate", methodId="login")
                self.result(2)
            self.call(3, "session/new", cwd=self.args.cwd, mcpServers=[])
            session = self.result(3)[0]["sessionId"]
            instructions = " Then run exactly `sleep 42` as a separate shell tool call with a 60-second timeout." if self.args.case == "running" else ""
            self.prompt(PROMPT_ID, session,
                        "Run exactly `sleep 7` in your shell tool first." + instructions
                        + f" After the command(s), reply with just {END_MARKER}. Do not read or change any files.")
            text = []
            while True:
                rpc, proxy_ms = self.receive()
                self.update(rpc, session, text)
                if self.first_approved:
                    self.log("first_tool_approved", seq=self.after, proxy_ms=proxy_ms)
                    break
                if "method" not in rpc and rpc.get("id") == PROMPT_ID:
                    raise RuntimeError("turn ended before the first tool was approved")
            self.socket.shutdown(socket.SHUT_RDWR)
            disconnected = time.monotonic()
            self.log("tcp_closed", after=self.after)

        cursor = self.after
        time.sleep(max(0, disconnected + 30 - time.monotonic()))
        self.log("reconnect", after=cursor, offline_s=round(time.monotonic() - disconnected, 3))
        with self.attach() as head:
            if head <= cursor:
                raise RuntimeError("nothing was buffered while disconnected")
            while self.after < head:
                self.turn_frame(session, text, replay=True)
            self.log("caught_up", seq=self.after, replayed=head - cursor)
            while not self.finished:
                self.turn_frame(session, text, replay=False)
            if self.finished_in_replay != (self.args.case == "finished"):
                raise RuntimeError("turn completed on the wrong side of reconnect for this case")
            if END_MARKER not in "".join(text):
                raise RuntimeError("missing final marker")
            self.prompt(FOLLOWUP_ID, session, f"Reply with just {FOLLOWUP_MARKER}. Do not use tools.")
            followup = []
            while True:
                rpc, proxy_ms = self.receive()
                self.update(rpc, session, followup)
                if "method" not in rpc and rpc.get("id") == FOLLOWUP_ID:
                    if rpc.get("result", {}).get("stopReason") != "end_turn" or FOLLOWUP_MARKER not in "".join(followup):
                        raise RuntimeError("follow-up failed")
                    self.log("followup_done", seq=self.after, proxy_ms=proxy_ms, stop="end_turn")
                    return

    def update(self, rpc, session, text):
        if rpc.get("method") != "session/update":
            return None
        params = rpc["params"]
        if params["sessionId"] != session:
            raise RuntimeError("session changed")
        update = params["update"]
        if update.get("sessionUpdate") == "agent_message_chunk":
            text.append(update.get("content", {}).get("text", ""))

    def turn_frame(self, session, text, *, replay):
        rpc, proxy_ms = self.receive()
        self.update(rpc, session, text)
        if "method" not in rpc and rpc.get("id") == PROMPT_ID:
            if rpc.get("result", {}).get("stopReason") != "end_turn":
                raise RuntimeError("original turn did not end successfully")
            self.finished = True
            self.finished_in_replay = replay
            self.log("prompt_done", seq=self.after, proxy_ms=proxy_ms, replay=replay, stop="end_turn")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--key-file", required=True)
    parser.add_argument("--cwd", required=True, help="Path on the agent's host")
    parser.add_argument("--case", choices=("running", "finished"), required=True)
    Probe(parser.parse_args()).run()
