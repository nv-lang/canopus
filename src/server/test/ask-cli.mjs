// Task 328. Run against a built canopus with a test agent and an isolated instance.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const binary = resolve(process.argv[2] ?? (process.platform === "win32" ? "target/canopus.exe" : "target/canopus"));
const fixture = fileURLToPath(new URL("../../acp/testdata/fake_agent.mjs", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "canopus-ask-test-"));
const config = join(dir, "config.json");
const hubLog = join(dir, "hub.log");
const streamMarker = join(dir, "agent-streaming");

async function listener(onConnection) {
    const server = createServer(onConnection);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return server;
}

async function stopListening(server) {
    await new Promise((done) => server.close(done));
}

async function writeConfig(port) {
    await writeFile(config, JSON.stringify({
        port,
        store: "files",
        voice: false,
        agents: [{
            id: "fixture",
            label: "Test agent",
            program: process.execPath,
            args: [fixture, "--live", "--user-echo", `--stream-marker=${streamMarker}`],
        }],
    }));
}

function run(args, onChunk = () => {}) {
    const child = spawn(binary, ["--config", config, ...args], {
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 40_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
        onChunk(chunk, child);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    return once(child, "close").then(([code]) => ({ code, stdout, stderr }));
}

async function expectAsk(code, args, diagnosis) {
    const result = await run(["ask", ...args]);
    assert.equal(result.code, code, JSON.stringify(result));
    if (diagnosis) assert.match(result.stderr, diagnosis);
    return result;
}

async function waitForHub(port, hub) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        assert.equal(hub.exitCode, null, "test hub exited before it became ready");
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(300),
        }).catch(() => null);
        if (response?.ok) {
            await response.text();
            return;
        }
        await delay(50);
    }
    throw new Error("test hub did not become ready");
}

async function checkWebFeed(port, session) {
    const page = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let sawCli = false;
    let pageTurn = "";
    let answer = "";
    let timeout;
    try {
        await new Promise((done, fail) => {
            timeout = setTimeout(() => fail(new Error(`Web feed did not settle: ${JSON.stringify({ sawCli, pageTurn, answer })}`)), 10_000);
            page.addEventListener("error", () => fail(new Error("could not open the test web feed")));
            page.addEventListener("message", ({ data }) => {
                try {
                    const message = JSON.parse(data);
                    for (const event of Array.isArray(message) ? message : [message]) {
                        if (event.trace !== session) continue;
                        const { turn, text } = event.input ?? {};
                        if (event.kind === "user_message" && text === "повтор CLI" && !sawCli) {
                            sawCli = true;
                            page.send(JSON.stringify({ kind: "user_message", trace: session, input: { text: "browser probe" } }));
                        }
                        if (event.kind === "user_message" && text === "browser probe") pageTurn = turn;
                        if (!pageTurn || pageTurn !== turn) continue;
                        if (event.kind === "agent_chunk") answer += text;
                        if (event.kind === "agent_done") {
                            assert.ok(sawCli, "the page did not see the CLI message");
                            assert.match(answer, /browser probe/);
                            done();
                        }
                    }
                } catch (error) {
                    fail(error);
                }
            });
        });
    } finally {
        clearTimeout(timeout);
        page.close();
    }
}

let hub;
let hubExit;
let logFile;
try {
    const reserved = await listener();
    const port = reserved.address().port;
    await stopListening(reserved);
    await writeConfig(port);

    await expectAsk(2, ["--unknown", "hello"], /unknown flag: --unknown/);
    const firstAttempt = Date.now();
    await expectAsk(3, ["--agent", "fixture", "hello"], new RegExp(`127\\.0\\.0\\.1:${port}`));
    assert.ok(Date.now() - firstAttempt < 5000, "a closed loopback port must fail promptly");
    console.log("PASS unknown flag and stopped hub");

    const sockets = new Set();
    const silent = await listener((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
    });
    try {
        await writeConfig(silent.address().port);
        const started = Date.now();
        await expectAsk(3, ["--agent", "fixture", "hello"], /timeout:.*handshake/);
        assert.ok(Date.now() - started < 15000, "the silent listener must hit the handshake deadline");
    } finally {
        for (const socket of sockets) socket.destroy();
        await stopListening(silent);
    }
    console.log("PASS silent WebSocket handshake times out");

    await writeConfig(port);
    logFile = await open(hubLog, "w");
    hub = spawn(binary, ["--config", config, "serve"], {
        cwd: dir,
        stdio: ["ignore", "ignore", logFile.fd],
        detached: process.platform !== "win32",
    });
    hubExit = once(hub, "close").catch(() => {});
    await waitForHub(port, hub);

    const missing = await expectAsk(4, ["--session", "missing-328", "hello"], /not_found:.*missing-328/);
    assert.equal(missing.stdout, "");
    await expectAsk(4, ["--agent", "missing-agent", "hello"], /invalid_parameter:.*missing-agent/);
    console.log("PASS missing session and unknown agent report API codes");

    const created = await expectAsk(0, ["--agent", "fixture", "--model", "fake-model-b", "mode"]);
    assert.match(created.stdout, /model: fake-model-b /);
    const session = created.stderr.match(/\bsession (ask-[0-9a-f]+)\b/)?.[1];
    assert.ok(session, "new session ID must be on stderr");
    const resumed = await expectAsk(0, ["--session", session, "--model", "fake-model", "mode"]);
    assert.match(resumed.stdout, /model: fake-model /);
    const echoed = await expectAsk(0, ["--session", session, "--agent", "fixture", "повтор CLI"]);
    assert.match(echoed.stdout, /повтор CLI/);
    const refused = await expectAsk(5, ["--session", session, "refuse"], /ModelRefused/);
    assert.equal(refused.stdout, "");
    console.log("PASS model selection, session continuation and agent refusal");

    let streamed = false;
    const answer = await run(["ask", "--session", session, "burst"], (_chunk, child) => {
        if (child.exitCode === null && existsSync(streamMarker)) streamed = true;
    });
    assert.equal(answer.code, 0, JSON.stringify(answer));
    assert.ok(streamed, "stdout must arrive while the agent is still producing its answer");
    assert.ok(answer.stdout.startsWith("b0;") && answer.stdout.endsWith("b255;"));
    await checkWebFeed(port, session);
    console.log("PASS streamed stdout and shared web feed");
} catch (error) {
    console.error(await readFile(hubLog, "utf8").catch(() => ""));
    throw error;
} finally {
    if (hub?.pid && hub.exitCode === null) {
        if (process.platform === "win32") hub.kill();
        else {
            try { process.kill(-hub.pid, "SIGTERM"); }
            catch (error) { if (error.code !== "ESRCH") throw error; }
        }
    }
    await hubExit;
    await logFile?.close();
    await rm(dir, { recursive: true, force: true });
}
