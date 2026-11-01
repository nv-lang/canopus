// Self-test of the dependency-epic workflow, task 281 (node >= 24):  node test/crew-coordinate-epic.test.mjs
// An epic drive (policy crew-dependency-epic@1, a different id than crew-normal-task@1) drives its branches: the
// dependencies are checked BEFORE any action, an addressed blocker of one branch never stops the independent ones,
// and the completion is evidence-backed by the branch records. Real adapters (mailbox/history) over an isolated
// fixture; no real transport. Red probe: run once with coordinate.ts moved away — every cell red.
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-coordinate-epic-"))
process.env.XDG_DATA_HOME = tmp
process.env.XDG_STATE_HOME = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "opencode.db")
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
let coord
try {
  coord = await import("../coordinate.ts")
} catch (e) {
  coord = undefined
}

let failures = 0
const ok = (cond, name) => {
  let pass = true
  try { assert(cond, name) } catch { pass = false }
  if (pass) console.log(`ok   ${name}`)
  else {
    failures++
    console.log(`FAIL ${name}`)
  }
}

const AUTH = "sesEPICAUTH"
core.saveCard({ session: AUTH, role: "integrator", auto: false, title: AUTH, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
function mkTask(name, patch = {}) {
  const id = `ses_${name}`
  core.saveCard({ session: id, role: "worker", auto: false, title: id, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
  const t = tasks.createTask({ project: "proj", title: `work ${name}`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: AUTH, author_role: "proj.integrator", qid: `q-${name}`, status: "running", kind: "assign", directory: proj, executor: id })
  Object.assign(t, patch)
  tasks.saveTask(t)
  return t
}
const letters = (to) => {
  const dir = path.join(core.INBOX, core.safeKey(to))
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []
}
const deps = () => ({
  task: (p, n) => tasks.loadTask(p, n),
  letter: (to, id, text) => {
    if (core.letterExistsFor(to, id)) return false
    core.postLetter(to, { id, from_role: core.PLUGIN_SENDER, from_session: core.PLUGIN_SENDER, to, time: Date.now(), text })
    return true
  },
  note: (t, text) => {
    const fresh = tasks.loadTask(t.project, t.n)
    if (fresh) tasks.taskEvent(fresh, core.PLUGIN_SENDER, undefined, text)
  },
  known: (to, receipt) => core.letterExistsFor(to, receipt),
  save: (t) => tasks.saveTask(t),
  say: () => {},
})
const tick = () => coord.coordinateTick(deps(), Date.now(), { maxTasks: 8, maxActions: 8, maxIO: 32 })
const setStatus = (t, status) => {
  const f = tasks.loadTask("proj", t.n)
  // a branch succeeds only by its recorded acceptance act (281: external/done is not acceptance): the fixture
  // records the act as the real accept paths do before the accepted/done status
  if ((status === "accepted" || status === "done") && !f.history.some((h) => h.status === "accepted")) f.history.push({ at: Date.now(), by: AUTH, status: "accepted", note: "принята: акт приёмщика (fixture)" })
  f.status = status
  tasks.saveTask(f)
}

if (!coord) {
  ok(false, "coordinate module exists")
} else {
  // epic with three branches: 3 needs 2, 4 is independent
  const b2 = mkTask("B2")
  const b3 = mkTask("B3")
  const b4 = mkTask("B4")
  const epic = mkTask("EPIC", { parts: [b2.n, b3.n, b4.n] })
  const started = coord.startDrive(epic, "crew-dependency-epic@1", AUTH, { [b3.n]: [b2.n] })
  ok(started.ok && epic.drive?.version === "1", "the epic drive attaches with its own policy id/version")
  tasks.saveTask(epic)

  // branch 2 has an ADDRESSED blocker before the first pass: it stops neither the independent branch nor the dependency check
  const d0 = coord.loadDrive("proj", epic.n)
  d0.blockers.push({ id: `branch-${b2.n}`, at: Date.now(), reason: "ветка 2: адресный блокер (ждёт артефакт автора)" })
  coord.saveDrive(d0)

  await tick()
  ok(letters(b4.executor).length === 1, "the independent branch continues despite the blocker of another branch")
  ok(!letters(b2.executor).length, "the blocked branch gets no action")
  ok(!letters(b3.executor).length, "dependencies are checked before actions: branch 3 waits for branch 2")

  // restart posts nothing twice
  await tick()
  ok(letters(b4.executor).length === 1, "no duplicate kick after a restart")

  // the blocker is cleared and branch 2 finishes; branch 3 becomes eligible
  const d1 = coord.loadDrive("proj", epic.n)
  d1.blockers.find((b) => b.id === `branch-${b2.n}`).cleared = Date.now()
  coord.saveDrive(d1)
  setStatus(b2, "done")
  await tick()
  ok(!letters(b2.executor).length, "branch 2 finished externally: no kick is needed or posted")
  ok(letters(b3.executor).length === 1, "branch 3 is unlocked by the finished dependency")
  setStatus(b4, "accepted")
  setStatus(b3, "done")
  await tick()
  const df = coord.loadDrive("proj", epic.n)
  ok(!!df.done && df.done.evidence.includes(`${b2.n} done`) && df.done.evidence.includes(`${b3.n} done`) && df.done.evidence.includes(`${b4.n} accepted`), "evidence-backed completion of the epic by the branch records")
  const doneLetters = letters(AUTH).filter((f) => f.includes("done"))
  await tick()
  ok(doneLetters.length === 1 && letters(AUTH).filter((f) => f.includes("done")).length === 1, "the completion letter once, nothing accumulates")

  // every open branch blocked -> one visible blocker, not a silent stall
  const c1 = mkTask("C1")
  const c2 = mkTask("C2")
  const epic2 = mkTask("EPIC2", { parts: [c1.n, c2.n] })
  coord.startDrive(epic2, "crew-dependency-epic@1", AUTH, { [c2.n]: [c1.n] })
  tasks.saveTask(epic2)
  const e2 = coord.loadDrive("proj", epic2.n)
  e2.blockers.push({ id: `branch-${c1.n}`, at: Date.now(), reason: "ветка 1: блокер" }, { id: `branch-${c2.n}`, at: Date.now(), reason: "ветка 2: блокер" })
  coord.saveDrive(e2)
  const r2 = await tick()
  ok(r2.blockers.some((l) => l.includes("every open branch is blocked")), "all branches blocked: a visible blocker")
  const blockedLetters = letters(AUTH).filter((f) => f.includes("blocked"))
  await tick()
  ok(letters(AUTH).filter((f) => f.includes("blocked")).length === blockedLetters.length, "the blocker letter is not repeated")

  // an external cancel of the epic: terminal, not a completion
  setStatus(epic2, "cancelled")
  await tick()
  const e2f = coord.loadDrive("proj", epic2.n)
  ok(!!e2f.failed && !e2f.done, "a cancelled epic ends as a terminal failure, not an acceptance")
}

console.log(failures ? `FAILURES: ${failures}` : "crew-coordinate-epic.test ok")
process.exit(failures ? 1 : 0)
