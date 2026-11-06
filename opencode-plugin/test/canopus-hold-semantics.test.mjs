import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import path from "node:path"
import os from "node:os"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-hold-semantics-"))
process.env.XDG_DATA_HOME = tmp
process.env.CANOPUS_HOME = path.join(process.env.XDG_DATA_HOME, "opencode")
const iw = await import("../idle-watch.ts")
const MIN = 60_000, now = 1_000_000
let checks = 0
const cell = (name, fn) => { fn(); checks++; console.log(`ok ${name}`) }
const mk = n => ({ project: "p", n, title: "диагностика CI", status: "running", kind: "spawn", author: "sesAUTHOR", executor: "sesWORKER", created: 1, history: [] })
const tasks = [mk(1), mk(2), mk(3), mk(4)]
const messages = [], notices = []
const deps = { dir: tmp, cfg: () => ({ ...iw.DEFAULT_STEP, termMin: 0 }), task: (_p, n) => tasks.find(t => t.n === n), tasks: () => tasks, turnGoing: () => true, formOpen: () => true, externalRun: () => true, ownerHolds: () => true, letter: (to, id, text) => messages.push({ to, id, text }), notice: (...v) => notices.push(v) }
const note = (n, input, at = now, session = "sesAUTHOR") => iw.noteStep({ n, ...input }, { session, project: "p" }, deps, at)
const hold = n => iw.readRecord("p", n, tmp)?.hold
const who = "владелец, 2026-11-01, тест: явное решение"
try {
  assert.equal(note(1, { hold: "HOLD", who }).ok, true)
  assert.equal(note(2, { hold: "HOLD", hold_scope: "execution", who }).ok, true)
  assert.equal(note(3, { hold: "HOLD", hold_scope: "external", hold_gate: true, wait_id: "ci-current", minutes: 45, who }).ok, true)
  assert.equal(note(4, { hold: "HOLD", hold_scope: "gate", who }).ok, true)
  cell("legacy is explicit, conservative and not migrated", () => { assert.equal(iw.holdScope(hold(1)), "legacy"); assert.equal(hold(1).scope, undefined); assert.ok(iw.executionHeld(hold(1))) })
  cell("external wait permits already-authorized diagnosis but keeps gate block", () => { assert.equal(iw.executionHeld(hold(3)), false); assert.ok(iw.gateHeld(hold(3))); assert.equal(iw.executionHeld(hold(4)), false); assert.ok(iw.gateHeld(hold(4))) })
  cell("external hold requires a correlation ID", () => assert.equal(note(4, { hold: "HOLD", hold_scope: "external", who }).ok, false))
  const before = structuredClone(hold(3))
  cell("late terminal from previous CI run is ignored", () => assert.equal(iw.externalResult("p", 3, "ci-old", "timeout", "источник: fixture", now + MIN, tmp), false))
  assert.equal(note(3, { wait_id: "ci-current", wait_result: "timeout", reason: "источник: синтетический terminal CI" }, now + 45 * MIN, "sesWORKER").ok, true)
  iw.watchTick(tasks, deps, now + 45 * MIN)
  cell("CI timeout escapes all ordinary-step suppressors and alerts responsible author", () => { assert.equal(messages.length, 1); assert.equal(messages[0].to, "sesAUTHOR"); assert.match(messages[0].text, /timeout/); assert.match(messages[0].text, /запрет приёмки\/слияния/); assert.equal(notices.length, 1) })
  cell("terminal event preserves external and gate decisions", () => { assert.equal(hold(3).scope, before.scope); assert.equal(hold(3).gate, true); assert.equal(hold(3).who, before.who); assert.ok(iw.gateHeld(hold(3))) })
  iw.watchTick(tasks, deps, now + 46 * MIN)
  cell("health alert is not repeated each pass", () => assert.equal(messages.length, 1))
  iw.watchTick(tasks, deps, now + 61 * MIN)
  cell("status/wake alone does not acknowledge diagnosis; bounded escalation", () => { assert.equal(messages.length, 2); assert.match(messages[1].text, /не подтверждена/); assert.match(messages[1].text, /разбужен/) })
  cell("explicit diagnostic blocker is accepted without releasing gate", () => { assert.ok(note(3, { health_blocker: "нет разрешения на CI rerun; проверяю доступный лог" }, now + 62 * MIN).ok); assert.ok(iw.gateHeld(hold(3))) })
  const frozen = [structuredClone(hold(1)), structuredClone(hold(2))]
  iw.watchTick(tasks.slice(0, 2), { ...deps, health: t => ({ failed: true, fingerprint: `failure-${t.n}`, why: "native failed" }) }, now + 63 * MIN)
  cell("execution pause and legacy HOLD do not hide native failures", () => { assert.equal(messages.length, 4); assert.deepEqual(hold(1), frozen[0]); assert.deepEqual(hold(2), frozen[1]); assert.ok(iw.executionHeld(hold(1))); assert.ok(iw.executionHeld(hold(2))) })
  cell("emergencies remain visible in rows/sidebar/doctor under HOLD", () => { const view = { dir: tmp, taskOf: (_p, n) => tasks.find(t => t.n === n) }; assert.ok(iw.stepRows(now, view).some(r => r.tone === "error")); assert.ok(iw.stepSideRows(now, view).some(r => r.tone === "error")); assert.ok(iw.stepProblems(now, view).some(x => /аварийная/.test(x))) })
  assert.ok(note(4, { hold: "HOLD", hold_scope: "external", wait_id: "ci-no-event", minutes: 1, who }).ok)
  iw.watchTick([tasks[3]], deps, now + 2 * MIN)
  cell("missed external check deadline is health failure even without terminal event", () => assert.match(messages.at(-1).text, /срок проверки результата истёк/))
  cell("ordinary reason/done never removes execution pause", () => { note(2, { reason: "диагностика", done: true }); assert.deepEqual(hold(2), frozen[1]) })
  const preserved = structuredClone(hold(3))
  iw.watchTick([tasks[2]], { ...deps, health: () => ({ failed: false, fingerprint: "healthy", why: "old succeeded" }) }, now + 64 * MIN)
  cell("old healthy outcome or a status does not close emergency diagnosis", () => assert.ok(iw.readRecord("p", 3, tmp).health))
  iw.watchTick([tasks[2]], { ...deps, recovered: () => "проверенный новый успешный внешний результат связанного эпизода после диагностики" }, now + 65 * MIN)
  cell("verified cause recovery closes health without changing external/gate", () => { assert.equal(iw.readRecord("p", 3, tmp).health, undefined); assert.deepEqual(hold(3), preserved); assert.ok(iw.readRecord("p", 3, tmp).healthRecovered) })
  iw.watchTick([tasks[2]], deps, now + 66 * MIN)
  cell("old terminal fingerprint does not reopen recovered emergency", () => assert.equal(iw.readRecord("p", 3, tmp).health, undefined))
  cell("unknown persisted scope is safe legacy, not executable external wait", () => { assert.equal(iw.holdScope({ kind: "HOLD", scope: "future-scope" }), "legacy"); assert.ok(iw.executionHeld({ kind: "HOLD", scope: "future-scope" })); assert.ok(iw.gateHeld({ kind: "HOLD", scope: "future-scope" })) })
} finally { rmSync(tmp, { recursive: true, force: true }) }
console.log(`canopus-hold-semantics: ${checks} checks`)
