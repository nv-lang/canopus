// P1 279: a common author's read on B must never close A's health episode.
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-health-correlation-"))
process.env.XDG_DATA_HOME = process.env.XDG_STATE_HOME = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "native.db")
const core = await import("../core.ts")
const iw = await import("../idle-watch.ts")
const db = new DatabaseSync(process.env.CREW_HARNESS_DB)
db.exec("create table session_v2 (id text primary key, directory text); create table session_message (id text, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
db.prepare("insert into session_v2 values (?, ?)").run("sesAUTHOR", tmp)
const now = 1_000_000, MIN = 60_000
const make = n => ({ project: "p", n, title: `диагностика ${n}`, status: "running", kind: "spawn", author: "sesAUTHOR", executor: `sesEXEC${n}`, directory: tmp, folder: `tasks/${n}`, worktree: path.join(tmp, `work-${n}`), created: 1, history: [] })
const tasks = [make(1), make(2)]
for (const t of tasks) mkdirSync(t.worktree, { recursive: true })
const letters = []
const d = { cfg: () => ({ ...iw.DEFAULT_STEP, termMin: 0 }), task: (_p, n) => tasks.find(t => t.n === n), tasks: () => tasks, turnGoing: () => false, formOpen: () => false, externalRun: () => false, letter: (to, id, text) => letters.push({ to, id, text }), notice: () => {}, health: t => ({ failed: true, fingerprint: `native-${t.n}`, source: { session: t.executor, nativeIdle: now - 1 }, why: "native failed" }) }
let checks = 0
const cell = (name, fn) => { fn(); checks++; console.log(`ok ${name}`) }
const rec = n => iw.readRecord("p", n)
try {
  iw.watchTick(tasks, d, now)
  const text = letters.map(l => l.text).join("\n")
  db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run("msg_health_batch", "sesAUTHOR", "user", 1, now + 1, now + 1, JSON.stringify({ text }))
  const setTool = (file, name = "read", status = "completed") => {
    db.prepare("delete from session_message where seq = 2").run()
    db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run("msg_diagnostic", "sesAUTHOR", "assistant", 2, now + 2, now + 2, JSON.stringify({ content: [{ id: "tool-specific", type: "tool", name, time: { created: now + 2 }, state: { status, input: { filePath: file } } }] }))
  }
  const proof = t => core.diagnosticWorkAfter("sesAUTHOR", now, { task: t, fingerprint: rec(t.n).health.fingerprint, healthId: rec(t.n).health.letter, nativeMessage: "msg_health_batch", text })
  setTool(path.join(tasks[1].worktree, "ci-failure.log"))
  const b = await proof(tasks[1])
  const a = await proof(tasks[0])
  cell("completed read of B is correlated to B", () => assert.ok(b))
  cell("same author/new timestamp/health batch does NOT lend B's tool to A", () => assert.equal(a, undefined))
  setTool(path.join(tasks[0].worktree, "AGENTS.md"))
  const instructions = await proof(tasks[0])
  cell("reading generic AGENTS is not task diagnosis", () => assert.equal(instructions, undefined))
  setTool(path.join(tasks[0].worktree, "ci-failure.log"), "crew_send")
  const status = await proof(tasks[0])
  cell("a status letter is not a diagnostic tool action", () => assert.equal(status, undefined))
  setTool(path.join(tasks[0].worktree, "ci-failure.log"), "read", "running")
  const pending = await proof(tasks[0])
  cell("an unfinished read is not a completed diagnosis", () => assert.equal(pending, undefined))
  setTool(path.join(tasks[0].worktree, "ci-failure.log"))
  const own = await proof(tasks[0])
  const wrong = await core.diagnosticWorkAfter("sesAUTHOR", now, { task: tasks[0], fingerprint: "previous-episode", healthId: rec(1).health.letter, nativeMessage: "msg_health_batch", text })
  cell("current own-task artifact action has an exact source", () => { assert.ok(own); assert.match(own, /msg_diagnostic/); assert.match(own, /tool-specific/) })
  cell("a different health fingerprint cannot reuse the same action", () => assert.equal(wrong, undefined))
  iw.watchTick(tasks, { ...d, diagnosed: t => t.n === 1 ? { by: "sesAUTHOR", proof: own } : undefined }, now + 3)
  cell("diagnostic reaction A affects only A and does not claim cause recovery", () => { assert.ok(rec(1).health.diagnosed); assert.equal(rec(2).health.diagnosed, undefined); assert.ok(rec(1).health); assert.equal(rec(1).healthRecovered, undefined) })
  const before = letters.length
  const result = iw.noteStep({ n: 1, health_blocker: "нет полномочий на rerun", minutes: 1 }, { session: "sesAUTHOR", project: "p" }, d, now + MIN)
  cell("blocker names responsible and bounded next-check", () => { assert.ok(result.ok); assert.equal(rec(1).health.responsible, "sesAUTHOR"); assert.equal(rec(1).health.blocker.nextCheck, now + 2 * MIN) })
  const same = iw.noteStep({ n: 1, health_blocker: "нет полномочий на rerun", minutes: 30 }, { session: "sesAUTHOR", project: "p" }, d, now + MIN + 1)
  cell("repeating a blocker does not move its deadline", () => { assert.equal(same.ok, false); assert.equal(rec(1).health.deadline, now + 2 * MIN) })
  iw.watchTick([tasks[0]], d, now + 2 * MIN + 1)
  cell("overdue blocker escalates instead of silencing health forever", () => { assert.equal(letters.length, before + 1); assert.ok(rec(1).health.escalated); assert.equal(rec(1).health.blocker.reason, "нет полномочий на rerun") })
  // An unrelated native request after the notification cannot borrow its tools.
  db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run("msg_other_user", "sesAUTHOR", "user", 1.5, now + 1, now + 1, JSON.stringify({ text: "задача B" }))
  const otherTurn = await proof(tasks[0])
  cell("a later unrelated input boundary invalidates diagnostic attribution", () => assert.equal(otherTurn, undefined))
} finally { db.close(); rmSync(tmp, { recursive: true, force: true }) }
console.log(`crew-health-correlation: ${checks} checks`)
