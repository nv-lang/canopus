// Task 327. A temporary hub and a real worktree feed the production reducer and view.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { initialModel, reduce } from "../../web/state.js";
import { createView } from "../../web/view.js";
import { createFakeDocument } from "../../web/test/fake-dom.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const suffix = process.platform === "win32" ? ".exe" : "";
const binary = resolve(process.argv[2] ?? "target/canopus.exe");
const fixture = join(root, "src/acp/testdata/fake_agent.mjs");
const dir = await mkdtemp(join(tmpdir(), "canopus-file-diff-test-"));
const repo = join(dir, "project");
const config = join(dir, "server.json");

let front;
let exited;
let page;
let log = "";
const events = [];
let serial = 0;
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });

async function waitFor(predicate, label) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const result = await predicate();
        if (result) return result;
        assert.equal(front.exitCode, null, log);
        await delay(25);
    }
    assert.fail(`Timed out waiting for ${label}\n${JSON.stringify(events.slice(-8))}\n${log}`);
}

function send(kind, trace, input) {
    page.send(JSON.stringify({ id: `fixture-${++serial}`, step: 0, time: Date.now(), kind, trace, input }));
}

async function turn(trace, text) {
    const start = events.length;
    send("user_message", trace, { text });
    const done = await waitFor(() => events.slice(start).find((e) => e.trace === trace && e.kind === "agent_done"), text);
    assert.ok(done.input.turn);
    // A history request handled by the hub after this turn is a delivery barrier for live events.
    const barrier = events.length;
    send("session_history_get", trace, {});
    const history = await waitFor(() => events.slice(barrier).find((e) => e.trace === trace && e.kind === "session_history"), "history");
    const fresh = events.slice(start);
    assert.ok(!fresh.some((e) => e.trace === trace && (e.kind === "error" || e.kind === "agent_refused")));
    const diffs = fresh.filter((e) => e.trace === trace && e.kind === "file_diff");
    for (const event of diffs) {
        assert.equal(event.input.turn, done.input.turn);
        assert.ok(Number.isInteger(event.step));
        assert.deepEqual(Object.keys(event.input).sort(), ["added", "path", "removed", "turn"]);
        assert.deepEqual(history.entries.find((entry) => entry.id === event.id), event);
    }
    return diffs.map(({ input: { path, added, removed } }) => [path, added, removed]);
}

try {
    // The standalone server locates web and machine resources beside its binary.
    const install = join(dir, "install");
    const program = join(install, `canopus${suffix}`);
    await mkdir(install);
    await copyFile(binary, program);
    for (const [name, origin] of [["web", "src/web"], ["machines", "machines"]]) {
        await symlink(join(root, origin), join(install, name), "junction");
    }
    await mkdir(repo);
    git("init", "-b", "main");
    await writeFile(join(repo, "one.txt"), "before one\n");
    await writeFile(join(repo, "two.txt"), "before two\n");
    git("add", "--", "one.txt", "two.txt");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "Initial files");

    const listener = createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const { port } = listener.address();
    await new Promise((done) => listener.close(done));
    const url = `http://127.0.0.1:${port}`;
    await writeFile(config, JSON.stringify({
        port, store: "files", voice: false,
        agents: [{ id: "opencode", label: "Fixture", program: process.execPath, args: [fixture, "--live", "--file-diff-fixture"] }],
    }));
    front = spawn(program, ["--config", config, "serve"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    exited = once(front, "exit");
    front.stdout.on("data", (chunk) => { log += chunk; });
    front.stderr.on("data", (chunk) => { log += chunk; });
    await waitFor(async () => (await fetch(`${url}/health`, { signal: AbortSignal.timeout(300) }).catch(() => null))?.ok, "health");
    const project = await fetch(`${url}/api/projects`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fixture", folders: [{ path: repo, branch: "main", worktree: true }] }),
    });
    const body = await project.json();
    assert.equal(project.status, 201, JSON.stringify(body));
    page = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    page.addEventListener("message", ({ data }) => { events.push(...[JSON.parse(data)].flat()); });
    await once(page, "open");
    const trace = "with-tree";
    send("session_created", trace, { name: "Diff test", agent: "opencode", project_id: body.id, folder: repo, source_branch: "refs/heads/main", worktree: true });
    await waitFor(() => events.find((event) => event.trace === trace && event.kind === "session_created"), "tree session");

    const two = await turn(trace, "edit-two");
    assert.deepEqual(two, [["one.txt", 1, 1], ["two.txt", 2, 1]]);
    assert.deepEqual(await turn(trace, "no-edits"), []);
    assert.deepEqual(await turn(trace, "create-file"), [["new file.txt", 2, 0]]);
    assert.deepEqual(await turn(trace, "edit-again"), [["one.txt", 1, 0]]);
    assert.deepEqual(await turn(trace, "no-edits"), []);

    const doc = createFakeDocument();
    const refs = {};
    for (const name of ["app", "side", "main", "rail", "status", "overlay"]) {
        refs[name] = doc.createElement("div");
        doc.body.append(refs[name]);
    }
    const view = createView(doc, refs, {
        agents: [{ id: "opencode" }], now: () => 0, handlers: { queued: () => 0, queuedItems: () => [] },
        fetchDiff: (session, path) => fetch(`${url}/api/session-diff/${session}?path=${encodeURIComponent(path)}`).then((reply) => reply.json()),
    });
    const model = events.reduce((state, event) => reduce(state, event), initialModel());
    view.render(model, { selected: trace, projects: [], pins: {}, theme: "system" }, { state: "connected" });
    assert.deepEqual(refs.main.querySelectorAll(".diffs").map((card) => card.querySelector(".card-title").textContent),
        ["Изменено файлов: 2", "Изменено файлов: 1", "Изменено файлов: 1"]);
    const button = refs.main.querySelector(".diff-view-btn");
    assert.equal(button?.textContent, "Показать дифф");
    button.click();
    const patch = await waitFor(() => refs.main.querySelector(".diff-patch"), "diff from the hub");
    assert.ok(patch.querySelector(".diff-line.add"));
    assert.ok(patch.querySelector(".diff-line.del"));

    const projectless = "without-tree";
    send("session_created", projectless, { name: "Projectless", agent: "opencode", worktree: true });
    await waitFor(() => events.find((event) => event.trace === projectless && event.kind === "session_created"), "projectless session");
    assert.deepEqual(await turn(projectless, "create-file"), []);
    console.log("PASS file_diff counters, turn isolation, history and live feed cards");
} finally {
    page?.close();
    if (front && front.exitCode === null) {
        front.kill();
        await Promise.race([exited, delay(3000)]);
        if (front.exitCode === null && front.signalCode === null) {
            front.kill("SIGKILL");
            await exited;
        }
    }
    await rm(dir, { recursive: true, force: true });
}
