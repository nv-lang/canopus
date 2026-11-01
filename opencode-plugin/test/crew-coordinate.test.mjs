// Self-test of the bounded coordination tick, task 281 (node >= 24):  node test/crew-coordinate.test.mjs
// An allowed task is driven to an evidence-backed completion or a real owner gate: durable intention/receipt/result,
// a versioned workflow policy from the closed registry (an untrusted one is never executed: a visible blocker),
// one gate question for the original qid (restart/timeout/duplicate/late answer never re-ask and never re-post),
// unknown outcomes rechecked a bounded number of times, external terminal is not an acceptance, the pass is bounded
// and never overlaps itself. The adapters are the REAL existing runtime ones (core.postLetter/letterExistsFor,
// tasks history) over an isolated fixture mailbox; the owner gate opens a durable record of the REAL QuestionRouter
// and the decision's authority is ONLY its terminal record with an answer. Red probes: run once with coordinate.ts
// moved away — every cell red; with the quote-only applyDriveDecision (no terminal-record check) the forged-quote
// cell and the three cells after it are red (captured 2026-11-02).
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-coordinate-"))
process.env.XDG_DATA_HOME = tmp
// Native fixtures never touch the owner's state: the whole mailbox and DB are this tmp tree.
process.env.XDG_STATE_HOME = tmp
const dbPath = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_DB = dbPath
delete process.env.CREW_HARNESS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const { QuestionRouter } = await import("../question-router.ts")
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

const AUTH = "sesCOORAUTH"
core.saveCard({ session: AUTH, role: "integrator", auto: false, title: AUTH, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })

// The VERIFIED question path of the drive gates: the real QuestionRouter over an isolated dir. The full intake ->
// trusted decision -> adapter -> receipt/result runs through its actual methods; a bare quote is never an authority.
const gateRouter = new QuestionRouter(path.join(tmp, "gate-router"), {
  target: () => AUTH,
  inspect: async () => ({ state: "pending" }),
  verify: async (_r, sources) => sources,
  closed: () => false,
  post: (to, text, id, replyTo) => {
    if (!core.letterExistsFor(to, id)) core.postLetter(to, { id, from_role: core.PLUGIN_SENDER, from_session: core.PLUGIN_SENDER, to, time: Date.now(), text, ...(replyTo ? { reply_to: replyTo } : {}) })
  },
  reply: async () => ({ state: "unknown", why: "no native form in this fixture" }),
})
const gateAnswer = (qid) => {
  const r = gateRouter.list().find((x) => x.qid === qid)
  return r && ["answered", "settled"].includes(r.status) && typeof r.answer === "string" && r.answer.trim() ? { answer: r.answer, at: r.updated } : undefined
}

let seq = 0
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
const says = []
const deps = (over = {}) => ({
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
  openGate: (d, gate, qid, question) =>
    gateRouter.open({ qid, project: d.project, task: d.n, session: tasks.loadTask(d.project, d.n)?.executor ?? AUTH, channel: "text", text: question, context: `drive ${d.policy.id}@${d.policy.version}, gate ${gate}`, source: { kind: "text", id: qid, at: Date.now() } }),
  save: (t) => tasks.saveTask(t),
  say: (l) => says.push(l),
  ...over,
})
const tick = (d, now, limits, signal) => coord.coordinateTick(d ?? deps(), now ?? Date.now(), limits ?? { maxTasks: 4, maxActions: 8, maxIO: 24 }, signal)

// ------------------------------------------------------------------ untrusted policy
if (!coord) {
  ok(false, "coordinate module exists")
} else {
  const t0 = mkTask("UNTRUSTED")
  const refused = coord.startDrive(t0, "evil-policy@9", AUTH)
  ok(!refused.ok && /не в доверенном реестре/.test(refused.why), "an unknown policy is refused at attach")
  // a forged drive record with an unknown policy on disk: never executed, a visible blocker instead
  coord.saveDrive({ project: "proj", n: t0.n, policy: { id: "evil-policy", version: "9" }, by: "x", started: Date.now(), updated: Date.now(), phase: "start", steps: [], decisions: [], blockers: [] })
  const t0f = tasks.loadTask("proj", t0.n)
  t0f.drive = { policy: "evil-policy", version: "9", at: Date.now(), by: "x" }
  tasks.saveTask(t0f)
  const r0 = await tick()
  const d0 = coord.loadDrive("proj", t0.n)
  ok(d0.blockers.some((b) => b.id === "untrusted-policy"), "a forged untrusted policy drive gets a visible blocker")
  ok(!letters(t0.executor).length && !letters(AUTH).length, "an untrusted policy executes nothing")
  ok(r0.blockers.length === 1, "the blocker is observable in the tick result")

  // ------------------------------------------------------------------ normal workflow end-to-end
  const t1 = mkTask("NORMAL")
  const started = coord.startDrive(t1, "crew-normal-task@1", AUTH)
  ok(started.ok && t1.drive?.policy === "crew-normal-task", "drive attaches with the versioned policy mark")
  tasks.saveTask(t1)
  ok(!(await tick()).actions || letters(t1.executor).length === 1, "step 1: one real start letter to the executor")
  const s1 = coord.loadDrive("proj", t1.n).steps[0]
  ok(s1.id === "s:work:start" && s1.state === "done" && s1.receipt && core.letterExistsFor(t1.executor, s1.receipt), "durable intention -> receipt of the real adapter")
  ok(tasks.loadTask("proj", t1.n).status === "running", "enqueue is not received/started: the task record is not touched")

  // restart: a second pass posts nothing again
  const r1b = await tick()
  ok(r1b.actions === 0 && letters(t1.executor).length === 1, "restart/retry: no second POST of the start letter")

  // the executor submits a report
  const t1r = tasks.loadTask("proj", t1.n)
  t1r.report = "done: the thing; checked: so"
  t1r.status = "submitted"
  tasks.saveTask(t1r)
  await tick()
  const t1h = tasks.loadTask("proj", t1.n)
  ok(t1h.history.some((h) => h.note?.includes("[drive report]") && h.note.includes("report sha256")), "the report evidence note with hash lands in the history")

  // no reviewer: the real owner gate opens once
  await tick()
  const d1 = coord.loadDrive("proj", t1.n)
  ok(d1.gate?.id === "accept" && d1.gate.qid.startsWith("gq"), "the acceptance gate opens with a qid")
  const gateLetters = letters(AUTH).filter((f) => f.includes("gate"))
  ok(gateLetters.length === 1, "exactly one gate letter to the author")
  const gateQid = d1.gate.qid

  // restart/timeout: no second prompt, the gate stays
  const r1c = await tick(undefined, Date.now() + 7 * 24 * 3600_000)
  ok(r1c.actions === 0 && letters(AUTH).filter((f) => f.includes("gate")).length === 1 && coord.loadDrive("proj", t1.n).gate, "timeout and restart re-ask nothing: one prompt only")

  // a recommendation without the owner's word is not an authority
  const noQuote = coord.applyDriveDecision("proj", t1.n, gateQid, "принять", "", AUTH, gateAnswer)
  ok(!noQuote.ok && /полномочием/.test(noQuote.why) && coord.loadDrive("proj", t1.n).gate?.qid === gateQid, "a recommendation without a quote applies nothing")
  // a forged quote WITHOUT the verified terminal record: the gate stands (RED control)
  const forged = coord.applyDriveDecision("proj", t1.n, gateQid, "принять", "«принимай» (владелец, 2026-11-01, чат)", AUTH, gateAnswer)
  ok(!forged.ok && /терминальной проверенной записи/.test(forged.why) && coord.loadDrive("proj", t1.n).gate?.qid === gateQid, "a quote without the terminal verified record clears nothing")
  // a decision for a gate that is not open: the real ceiling is not bypassed
  const wrongQid = coord.applyDriveDecision("proj", t1.n, "gqOTHER", "принять", "владелец, 2026-11-01", AUTH, gateAnswer)
  ok(!wrongQid.ok && /не обходится|ворот/.test(wrongQid.why), "a decision for a not-open gate is refused")

  // the trusted decision arrives through the REAL question path of the ORIGINAL qid:
  // intake (the durable record of the gate) -> responsible resolve with sources -> adapter -> receipt -> terminal
  const grec = gateRouter.list().find((r) => r.qid === gateQid)
  ok(grec?.status === "routing", "the gate opened a durable question record under the original qid")
  await gateRouter.tick() // routed to the responsible
  const gr = gateRouter.get(grec.id)
  await gateRouter.resolve(gr.id, AUTH, gr.epoch, "принимай (владелец, 2026-11-01, чат)", [{ path: "doc/word.md", sha256: "0".repeat(64), quote: "принимай" }])
  await gateRouter.tick() // the answer letter is posted to the original addressee
  gateRouter.ack(gr.id, gateRouter.get(gr.id).session)
  ok(gateRouter.get(gr.id).status === "answered", "the question record of the original qid is terminal with the answer")

  // the actually accepted decision applies to the ORIGINAL qid, exactly once, without a repeated form/POST
  const gateLettersBefore = letters(AUTH).filter((f) => f.includes("gate")).length
  const applied = coord.applyDriveDecision("proj", t1.n, gateQid, "принять задачу", "«принимай» (владелец, 2026-11-01, чат)", AUTH, gateAnswer)
  ok(applied.ok && !coord.loadDrive("proj", t1.n).gate, "the verified decision applies to the original qid and clears the gate")
  ok(letters(AUTH).filter((f) => f.includes("gate")).length === gateLettersBefore, "no repeated form/POST of the gate")
  const dup = coord.applyDriveDecision("proj", t1.n, gateQid, "принять задачу", "«принимай» (владелец, 2026-11-01, чат)", AUTH, gateAnswer)
  ok(!dup.ok && coord.loadDrive("proj", t1.n).decisions[0].duplicates === 1, "a duplicate decision is recorded and changes nothing")
  const d1d = coord.loadDrive("proj", t1.n).decisions[0]
  ok(d1d.qid === gateQid && d1d.hash.length === 64 && d1d.quote.includes("владелец") && d1d.decision.includes("принимай"), "the decision keeps qid + sha256 + quote evidence and the RECORDED answer")

  // the continuation: the verified decision is delivered to the acceptor by a real adapter step with a receipt —
  // never an automatic acceptance
  await tick()
  const d1c = coord.loadDrive("proj", t1.n)
  const cont = d1c.steps.find((s) => s.id === `s:acceptance:decision-${gateQid}`)
  ok(cont?.state === "done" && cont.receipt && core.letterExistsFor(AUTH, cont.receipt), "the decision goes to the acceptor as a durable step with a receipt")
  ok(tasks.loadTask("proj", t1.n).status === "submitted", "no auto-acceptance: the task record waits for the acceptor")

  // acceptance is by the task record, then the drive completes with evidence
  const t1a = tasks.loadTask("proj", t1.n)
  t1a.status = "accepted"
  tasks.saveTask(t1a)
  await tick()
  const d1f = coord.loadDrive("proj", t1.n)
  ok(d1f.done?.evidence.includes("status accepted") && d1f.done.evidence.includes("report sha256"), "evidence-backed completion")
  const doneLetters = letters(AUTH).filter((f) => f.includes("done"))
  await tick()
  ok(doneLetters.length === 1 && letters(AUTH).filter((f) => f.includes("done")).length === 1, "the completion letter is posted once, a later pass adds nothing")

  // late input after the terminal end: a safe blocker keeps the evidence
  const late = coord.applyDriveDecision("proj", t1.n, "gqLATE", "позднее", "владелец, 2026-11-01", AUTH)
  ok(!late.ok && coord.loadDrive("proj", t1.n).blockers.some((b) => b.id === "late-decision-gqLATE"), "late input stays a safe blocker")

  // ------------------------------------------------------------------ external terminal is not an acceptance
  const t2 = mkTask("CANCELLED")
  coord.startDrive(t2, "crew-normal-task@1", AUTH)
  tasks.saveTask(t2)
  await tick()
  const t2c = tasks.loadTask("proj", t2.n)
  t2c.status = "cancelled"
  tasks.saveTask(t2c)
  await tick()
  const d2 = coord.loadDrive("proj", t2.n)
  ok(!!d2.failed && !d2.done && /not an acceptance/.test(d2.failed.reason), "external terminal ends the drive without acceptance")
  const termCount = letters(AUTH).filter((f) => f.includes("terminal")).length
  await tick()
  ok(letters(AUTH).filter((f) => f.includes("terminal")).length === termCount, "the terminal letter is not repeated")

  // ------------------------------------------------------------------ unknown outcome: bounded recheck, never a blind retry
  const t3 = mkTask("UNKNOWN")
  coord.startDrive(t3, "crew-normal-task@1", AUTH)
  tasks.saveTask(t3)
  let posts = 0
  const boom = deps({
    letter: (to, id, text) => {
      posts++
      throw new Error("transport exploded after the intention")
    },
  })
  await tick(boom)
  const d3a = coord.loadDrive("proj", t3.n)
  ok(d3a.steps[0].state === "unknown" && posts === 1, "a thrown adapter leaves one durable unknown intention")
  for (let i = 0; i < 5; i++) await tick() // the normal deps recheck: the letter is not there
  const d3b = coord.loadDrive("proj", t3.n)
  ok(posts === 1, "the recheck never re-posts (no second action)")
  ok((d3b.steps[0].rechecks ?? 0) === coord.RECHECK_MAX && d3b.blockers.some((b) => b.id.startsWith("unknown-")), "unknown is rechecked a bounded number of times, then a blocker")

  // ------------------------------------------------------------------ a policy can never emit an owner-protected action
  coord.registerPolicy({ id: "test-evil", version: "1", phases: ["x"], decide: () => ({ kind: "step", phase: "x", step: { key: "k", action: "push", to: "author", text: "push now" } }) })
  const t4 = mkTask("EVIL")
  const okE = coord.startDrive(t4, "test-evil@1", AUTH)
  tasks.saveTask(t4)
  ok(okE.ok, "a registered policy attaches (the registry is the trust boundary)")
  await tick(undefined, undefined, { maxTasks: 20, maxActions: 20, maxIO: 60 })
  const d4 = coord.loadDrive("proj", t4.n)
  ok(d4.blockers.some((b) => b.id.startsWith("forbidden-")) && !letters(AUTH).some((f) => f.includes("test-evil")), "a step outside letter|note is a blocker, never executed")

  // ------------------------------------------------------------------ bounded pass, no overlap, cancellation
  const many = []
  for (let i = 0; i < 6; i++) {
    const tm = mkTask(`MANY${i}`)
    coord.startDrive(tm, "crew-normal-task@1", AUTH)
    tasks.saveTask(tm)
    many.push(tm)
  }
  const rb = await tick(undefined, undefined, { maxTasks: 2, maxActions: 8, maxIO: 24 })
  ok(rb.processed === 2, "the pass is bounded by maxTasks")
  const rc = await tick(undefined, undefined, { maxTasks: 8, maxActions: 1, maxIO: 24 })
  ok(rc.actions <= 1, "the pass is bounded by maxActions")
  let inner
  // a reentrant pass started from inside the running pass returns at once and does nothing
  const reent2 = deps({
    task: (p, n) => {
      const t = tasks.loadTask(p, n)
      if (t?.drive && !inner) inner = coord.coordinateTick(deps(), Date.now(), { maxTasks: 4, maxActions: 8, maxIO: 24 })
      return t
    },
  })
  await tick(reent2)
  const innerRes = await inner
  ok(innerRes?.skipped === "overlap", "a nested pass is skipped: no overlapping continuations, nothing accumulates")
  const rx = await tick(undefined, undefined, { maxTasks: 8, maxActions: 8, maxIO: 24 }, { aborted: true })
  ok(rx.skipped === "cancelled" && rx.actions === 0, "cancellation stops the pass without side effects")
}

console.log(failures ? `FAILURES: ${failures}` : "crew-coordinate.test ok")
process.exit(failures ? 1 : 0)
