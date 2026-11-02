// Self-test of the external/done provenance in the drive lifecycle, task 281 (node >= 24):
//   node test/crew-coordinate-provenance.test.mjs
// A task in a drive's registration lifecycle that ends EXTERNALLY (a bare status "done"/"accepted" written from
// outside, without the acceptance ACT — the accepted history event that both accept paths of core.ts write) is NOT
// an acceptance: the drive ends as a visible terminal failure (normal task), an unprovenanced bare "accepted" opens
// the owner gate instead of a silent completion, and an external-done epic branch unlocks no dependency. The
// POSITIVE side — a task/epic finished through the REAL runtime acceptance lifecycle completes by evidence,
// including a drive registered after the finish — is proven by crew-coordinate-lifecycle.test.mjs through the real
// plugin tools and a real git project; no hand-written accepted events stand in for the act here. Real adapters
// (mailbox/history) over an isolated fixture; no real transport. Red probes: run once with coordinate.ts moved
// away — every cell red; with the pre-fix accepted() (bare status, no provenance) the ext-done/ext-accepted/branch
// cells are red (captured 2026-11-02).
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-coordinate-provenance-"))
process.env.XDG_DATA_HOME = tmp
// Native fixtures never touch the owner's state: the whole mailbox and DB are this tmp tree.
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

const AUTH = "sesPROVAUTH"
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
/** A bare external end: the status is written from outside, NO acceptance act (no accepted history event). */
const externalStatus = (t, status) => {
  const f = tasks.loadTask("proj", t.n)
  f.status = status
  tasks.saveTask(f)
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
  openGate: () => {}, // idempotent stub: the gate record is durable; this fixture does not route the question
  save: (t) => tasks.saveTask(t),
  say: () => {},
})
const tick = () => coord.coordinateTick(deps(), Date.now(), { maxTasks: 8, maxActions: 8, maxIO: 32 })

if (!coord) {
  ok(false, "coordinate module exists")
} else {
  // ------------------------------------------------------------------ external "done" mid-drive is not an acceptance
  const t1 = mkTask("EXTDONE")
  coord.startDrive(t1, "crew-normal-task@1", AUTH)
  tasks.saveTask(t1)
  await tick() // the real start step is receipted
  ok(letters(t1.executor).length === 1, "ext-done: the drive started with one real letter")
  externalStatus(t1, "done") // ended from outside: no acceptance act in the record
  await tick()
  const d1 = coord.loadDrive("proj", t1.n)
  ok(!!d1.failed && !d1.done && /from outside: not an evidence-backed completion/.test(d1.failed?.reason ?? ""), "ext-done: an external done without the acceptance act ends the drive as a terminal failure, not a completion")
  ok(!letters(AUTH).some((f) => f.includes("-done")), "ext-done: no completion letter is posted")
  const termLetters = letters(AUTH).filter((f) => f.includes("terminal")).length
  ok(termLetters === 1, "ext-done: the author gets one visible terminal letter")
  await tick()
  ok(letters(AUTH).filter((f) => f.includes("terminal")).length === termLetters, "ext-done: the terminal letter is not repeated")

  // ------------------------------------------------------------------ external bare "accepted" is not an acceptance either
  const t2 = mkTask("EXTACC")
  coord.startDrive(t2, "crew-normal-task@1", AUTH)
  tasks.saveTask(t2)
  await tick()
  externalStatus(t2, "accepted") // the status word alone, without the act
  await tick()
  await tick()
  const d2 = coord.loadDrive("proj", t2.n)
  ok(!d2.done && !letters(AUTH).some((f) => f.includes(`-${t2.n}-done`)), "ext-accepted: a bare accepted status without the act completes nothing")
  ok(!!d2.gate || d2.blockers.length > 0, "ext-accepted: the unprovenanced end stays visible (owner gate/blocker), not a silent completion")

  // ------------------------------------------------------------------ epic: an external done branch unlocks no dependency
  const b1 = mkTask("BRANCH1")
  const b2 = mkTask("BRANCH2")
  const epic = mkTask("EPICPROV", { parts: [b1.n, b2.n] })
  coord.startDrive(epic, "crew-dependency-epic@1", AUTH, { [b2.n]: [b1.n] })
  tasks.saveTask(epic)
  await tick()
  ok(letters(b1.executor).length === 1, "branch: the independent branch is kicked")
  externalStatus(b1, "done") // branch 1 ends externally, without the acceptance act
  await tick()
  ok(!letters(b2.executor).length, "branch: an external done branch does NOT unlock its dependent")
  ok(!coord.loadDrive("proj", epic.n).done, "branch: the epic is not completed by an external done")
}

console.log(failures ? `FAILURES: ${failures}` : "crew-coordinate-provenance.test ok")
process.exit(failures ? 1 : 0)
