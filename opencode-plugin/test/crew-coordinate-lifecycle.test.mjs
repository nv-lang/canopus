// Real-lifecycle reproduction of the two 281 acceptance gaps (node >= 24):
//   node test/crew-coordinate-lifecycle.test.mjs
// Everything here goes through the REAL core/runtime registration and acceptance lifecycle — the real plugin tools
// (fixture-plugin: crew_spawn, crew_task submit/drive/accept) over a REAL git project and the real mailbox; the
// acceptance act is the real crew_task accept of the integrator by the owner's word after the real merge, never a
// hand-written history event.
// L1 (initial external/done registration entry): a task that ended OUTSIDE the drive through the real runtime
//   (submit -> merge -> accept -> done) BEFORE registration: crew_task drive attaches and the first tick completes
//   by the existing evidence — no work step is executed for a finished task.
// L2 (control): a running task driven and then really accepted mid-drive completes by evidence.
// B  (parent epic acceptance evidence): the branches done through the real lifecycle do NOT complete the epic —
//   the real owner gate opens for the PARENT; the epic completes only after the parent's own real acceptance,
//   the evidence names the branches AND the parent record.
// E  (the original registration AC): a number taken by an agent OUTSIDE OpenCode is registered by the REAL
//   scripts/task-number.mjs (kind external / status done / author external — the registration line, no acceptance
//   act) in a fully isolated linked git worktree and env: the real workflow attachment (crew_task drive) PRESERVES
//   the registration as it is and continues observably (a registration letter with a receipt to the author; the
//   drive's own steps/receipts). For the normal policy an external done without the act ends as a VISIBLE terminal
//   outcome with a letter — never a silent evidence completion, never a vanished registration; the owner's word
//   without the question path applies nothing (drive-decide is refused). As an epic dependency the external/done
//   branch unlocks no dependent, the kick to the executor-less branch is ONE observable addressed blocker (never
//   an accumulation), and the unfinished epic never completes falsely.
// E3 (the remaining AC, duty letter 2026-11-02 05:46): the registered unfinished PARENT epic ITSELF — the real
//   scripts/task-number.mjs record (external/done, no acceptance act) with EXISTING branches: the drive attaches
//   preserving the registration, the existing independent branch is really continued (kick with a receipt), the
//   really finished branch unlocks the dependent, and the branches done open the PARENT's own acceptance gate —
//   the external parent is never completed by the branches alone and never terminally ended while it can continue.
//   (E2's spawned parent + external dependency and the normal drive's terminal letter are other scenarios, not a
//   replacement for this one.)
// Red probes: run once with coordinate.ts moved away — every cell red; on the pre-fix source the L1 cells (the
// registration is refused / a start letter goes to the finished task), the B gate/evidence cells and the E cells
// (the registration refused at the entry, no observable continuation, the blocker accumulates) are red
// (captured 2026-11-02).
import "./native-isolation.mjs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-coordinate-lifecycle-"))
process.env.XDG_DATA_HOME = tmp
process.env.XDG_STATE_HOME = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_POLL_MS = "50"
// The plugin's own coordWatch is parked (an hour): the scenario drives coordinateTick itself, step by step.
process.env.CREW_HARNESS_COORD_MS = "3600000"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_PRESENCE = "all"

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const BASE = { root: "..", worktrees: "worktrees", worktree_name: "{repo}-{n}-{slug}", branch_name: "task/{n}-{slug}", cleanup: "none", allow_default_models: true, inflight_limit: 30, spawn_limits: { worker: 20, reviewer: 0 } }
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify(BASE))
git(proj, "init", "-q", "-b", "main")
git(proj, "config", "user.name", "Owner Test")
git(proj, "config", "user.email", "owner@test")
writeFileSync(path.join(proj, "a.txt"), "a\n")
git(proj, "add", "-A")
git(proj, "commit", "-q", "-m", "init")

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const { QuestionRouter } = await import("../question-router.ts")
const mod = await import("./fixture-plugin.mjs")
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

const tools = {}
const hooks = {}
const events = {}
const ctx = {
  location: { directory: tmp },
  options: { projects: { proj } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (req) => ({ id: req.id }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content

const INTEG = "sesLINTEG"
await hooks.context({ sessionID: INTEG, system: [], model: { id: "x", providerID: "y" } })
await events["session.idle"]({ properties: { sessionID: INTEG } })
await call("crew_role", INTEG, { role: "integrator" })

// The VERIFIED question path of the owner gates: the real QuestionRouter over the isolated tree (281/280).
const gateRouter = new QuestionRouter(path.join(tmp, "gate-router"), {
  target: () => INTEG,
  inspect: async () => ({ state: "pending" }),
  verify: async (_r, sources) => sources,
  closed: () => false,
  post: (to, text, id, replyTo) => {
    if (!core.letterExistsFor(to, id)) core.postLetter(to, { id, from_role: core.PLUGIN_SENDER, from_session: core.PLUGIN_SENDER, to, time: Date.now(), text, ...(replyTo ? { reply_to: replyTo } : {}) })
  },
  reply: async () => ({ state: "unknown", why: "no native form in this fixture" }),
})

const letters = (to) => {
  const dir = path.join(core.INBOX, core.safeKey(to))
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []
}
/** Letters posted by the DRIVE (id prefix drive-...): the spawn's own task letter is not the drive's work. */
const driveLetters = (to) => letters(to).filter((f) => f.startsWith("drive-"))
// The tick deps are the REAL runtime adapters: the real mailbox (postLetter/letterExistsFor), the real task
// records/history, the real QuestionRouter for the owner gates.
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
  openGate: (d, gate, qid, question) =>
    gateRouter.open({ qid, project: d.project, task: d.n, session: tasks.loadTask(d.project, d.n)?.author ?? INTEG, channel: "text", text: question, context: `drive ${d.policy.id}@${d.policy.version}, gate ${gate}`, source: { kind: "text", id: qid, at: Date.now() } }),
  save: (t) => tasks.saveTask(t),
  say: () => {},
})
const tick = () => coord.coordinateTick(deps(), Date.now(), { maxTasks: 8, maxActions: 8, maxIO: 32 })
const tickUntil = async (pred, max = 6) => {
  for (let i = 0; i < max; i++) {
    await tick()
    if (pred()) return true
  }
  return pred()
}

const SWORD = "«сделай X мгновенно» (владелец, 2026-11-02, чат жизненного цикла)"
const ACCEPT = "«проверил на контуре, принимаю» (владелец, 2026-11-02, чат жизненного цикла)"
const spawnSmall = async (title) => {
  const r = await call("crew_spawn", INTEG, { title, goal: "g", criteria: "c", owner_words: "- «x» (владелец, 2026-11-02)", result: "код proj/", route: "small", route_word: SWORD, route_word_date: "2026-11-02", estimate: "5 мин" })
  const t = tasks.listTasks("proj").find((x) => x.title === title)
  return { r, t }
}
/** The REAL acceptance lifecycle of the runtime: the executor submits, the branch lands, the integrator accepts
 *  by the owner's word (cleanup: none — the accept ends in done). No hand-written history events. */
const reallyFinish = async (t) => {
  const sub = await call("crew_task", t.executor, { action: "submit", n: t.n, text: `сделано: работа ${t.n}; проверено: контур` })
  assert(!/Не|отказ/i.test(sub) || /сдана/.test(sub), `submit of ${t.n}: ${sub}`)
  git(proj, "merge", "--ff", t.branch)
  const acc = await call("crew_task", INTEG, { action: "accept", n: t.n, text: ACCEPT })
  assert(/принята/.test(acc), `accept of ${t.n}: ${acc}`)
  return tasks.loadTask("proj", t.n)
}

try {
  if (!coord) {
    ok(false, "coordinate module exists")
  } else {
    // ------------------------------------------------------------------ L1: initial external/done registration entry
    const s1 = await spawnSmall("Финиш до ведения")
    ok(!!s1.t, "L1: the task is spawned through the real crew_spawn")
    const f1 = await reallyFinish(s1.t)
    ok(f1.status === "done" && f1.history.some((h) => h.status === "accepted"), "L1: the task ended outside any drive through the real runtime (submit -> merge -> accept -> done), the act is in the record")
    const reg1 = await call("crew_task", INTEG, { action: "drive", n: s1.t.n, policy: "crew-normal-task@1" })
    ok(/автоматическое ведение/.test(reg1), "L1: the registration entry (real crew_task drive) attaches to the evidence-finished task")
    await tickUntil(() => !!coord.loadDrive("proj", s1.t.n)?.done)
    const d1 = coord.loadDrive("proj", s1.t.n)
    ok(!!d1?.done && d1.done.evidence.includes("status done"), "L1: the first pass completes the drive by the EXISTING evidence of the record")
    ok(driveLetters(s1.t.executor).length === 0, "L1: no work step is executed for a finished task (no start letter to its executor)")
    ok(letters(INTEG).filter((f) => f.includes("-done")).length === 1, "L1: the author gets exactly one completion letter")

    // ------------------------------------------------------------------ L2 (control): real acceptance mid-drive
    const s2 = await spawnSmall("Финиш в ходе ведения")
    const reg2 = await call("crew_task", INTEG, { action: "drive", n: s2.t.n, policy: "crew-normal-task@1" })
    ok(/автоматическое ведение/.test(reg2), "L2: the drive attaches to the running task")
    await tick()
    ok(driveLetters(s2.t.executor).filter((f) => f.includes("s_work_start")).length === 1, "L2: the real start letter went to the executor")
    const f2 = await reallyFinish(s2.t)
    ok(f2.status === "done", "L2: the task is really accepted mid-drive")
    await tickUntil(() => !!coord.loadDrive("proj", s2.t.n)?.done)
    const d2 = coord.loadDrive("proj", s2.t.n)
    ok(!!d2?.done && d2.done.evidence.includes("status done") && d2.done.evidence.includes("report sha256"), "L2: the drive completes by the real acceptance evidence")

    // ------------------------------------------------------------------ B: parent epic acceptance evidence
    const b1 = (await spawnSmall("Ветка эпика 1")).t
    const b2 = (await spawnSmall("Ветка эпика 2")).t
    const epic = (await spawnSmall("Родительский эпик")).t
    const regE = await call("crew_task", INTEG, { action: "drive", n: epic.n, policy: "crew-dependency-epic@1", text: `needs: ${b2.n}<=${b1.n}` })
    ok(/автоматическое ведение/.test(regE), "B: the epic drive attaches through the real registration entry with the dependency edge")
    await tick()
    ok(driveLetters(b1.executor).filter((f) => f.includes(`kick-${b1.n}`)).length === 1 && driveLetters(b2.executor).length === 0, "B: the independent branch is kicked, the dependent waits (dependencies before actions)")
    await reallyFinish(b1)
    await tickUntil(() => driveLetters(b2.executor).some((f) => f.includes(`kick-${b2.n}`)))
    ok(driveLetters(b2.executor).filter((f) => f.includes(`kick-${b2.n}`)).length === 1, "B: the really finished dependency unlocks the dependent branch")
    await reallyFinish(b2)
    const gateLettersBefore = letters(INTEG).filter((f) => f.includes("gate")).length
    await tick()
    await tick()
    const dE = coord.loadDrive("proj", epic.n)
    ok(!dE?.done, "B: the branches done do NOT complete the epic — the parent's own acceptance is required")
    ok(dE?.gate?.id === "accept", "B: the real owner gate opens for the PARENT epic")
    ok(letters(INTEG).filter((f) => f.includes("gate")).length === gateLettersBefore + 1, "B: exactly one gate letter to the author")
    ok(gateRouter.list().some((r) => r.qid === dE?.gate?.qid), "B: the gate question is a durable record of the real QuestionRouter under the gate qid")
    await reallyFinish(epic)
    await tickUntil(() => !!coord.loadDrive("proj", epic.n)?.done)
    const dEf = coord.loadDrive("proj", epic.n)
    ok(!!dEf?.done && dEf.done.evidence.includes(`${b1.n} done`) && dEf.done.evidence.includes(`${b2.n} done`) && /parent .*status done/.test(dEf.done.evidence), "B: the epic completes only after the parent's real acceptance; the evidence names the branches AND the parent record")

    // ------------------------------------------------------------------ E: the original registration AC — external/done via the REAL script
    // The number is taken by an agent OUTSIDE OpenCode through the standard scripts/task-number.mjs in a fully
    // isolated linked git worktree with the isolated env — the record (kind external / status done / author
    // external, no acceptance act) lands in the same isolated store the plugin of this fixture reads.
    const wtExt = path.join(tmp, "wt-ext")
    git(proj, "worktree", "add", "--detach", wtExt, "HEAD")
    const script = fileURLToPath(new URL("../../scripts/task-number.mjs", import.meta.url))
    const extOut = JSON.parse(execFileSync(process.execPath, [script, "--dir", wtExt, "--title", "Внешняя регистрация", "--project", "proj"], { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] }).trim())
    const xt = tasks.loadTask("proj", extOut.n)
    ok(!!xt && xt.kind === "external" && xt.status === "done" && xt.author === "external" && !xt.history.some((h) => h.status === "accepted"), "E: the real task-number.mjs registers the external number as done WITHOUT any acceptance act")
    const regX = await call("crew_task", INTEG, { action: "drive", n: xt.n, policy: "crew-normal-task@1" })
    ok(/поставлена на автоматическое ведение/.test(regX) && /регистрация[^\n]*сохранена как есть/.test(regX), "E: the workflow attachment accepts the external registration entry and PRESERVES the registration as it is")
    const xt2 = tasks.loadTask("proj", xt.n)
    ok(xt2.kind === "external" && xt2.status === "done" && xt2.author === "external" && !xt2.history.some((h) => h.status === "accepted"), "E: the registration line is kept (kind external / status done / author external, still no acceptance act)")
    const regLetter = letters("external").find((f) => f.startsWith(`drive-proj-${xt.n}-registration-`))
    ok(!!regLetter, "E: the observable continuation of the existing actions — the registration letter with a receipt lands in the author's real mailbox")
    await tick()
    const dX = coord.loadDrive("proj", xt.n)
    ok(!!dX?.failed && !dX.done, "E: the external done without the act ends as a VISIBLE terminal outcome — never a silent evidence completion")
    ok(letters("external").filter((f) => f.startsWith(`drive-proj-${xt.n}-terminal`)).length === 1, "E: exactly one terminal letter to the author")
    const dNo = await call("crew_task", INTEG, { action: "drive-decide", n: xt.n, qid: "q-any", text: "принять", quote: "«принимаю» (владелец, 2026-11-02)" })
    ok(/не применено|не найден/i.test(dNo), "E: the owner's word outside the verified question path applies nothing (no gate, no drive-decide)")

    // the external/done registration as an epic dependency: no false unlock, no false completion, one addressed blocker
    const b3 = (await spawnSmall("Зависимая ветка")).t
    const epic2 = (await spawnSmall("Эпик с внешней веткой")).t
    const regE2 = await call("crew_task", INTEG, { action: "drive", n: epic2.n, policy: "crew-dependency-epic@1", text: `needs: ${b3.n}<=${xt.n}` })
    ok(/автоматическое ведение/.test(regE2), "E: the epic drive attaches with the external/done registration as the dependency")
    const rE1 = await tick()
    const rE2 = await tick()
    const dE2 = coord.loadDrive("proj", epic2.n)
    ok(driveLetters(b3.executor).length === 0, "E: the external/done branch (no acceptance act) does NOT unlock the dependent branch")
    ok(!dE2?.done, "E: the unfinished epic with the unprovenanced external branch does not falsely complete")
    const noExec = dE2?.blockers.filter((b) => b.id === "no-executor") ?? []
    ok(noExec.length === 1 && /адресат/.test(noExec[0]?.reason ?? ""), "E: the kick to the executor-less external branch is ONE observable addressed blocker, never an accumulation")
    ok([...rE1.blockers, ...rE2.blockers].some((l) => l.includes("no executor")), "E: the addressed blocker is observable in the tick result")

    // ------------------------------------------------------------------ E3: the registered unfinished PARENT epic itself (external/done) with existing branches
    // The REAL scripts/task-number.mjs registers the parent epic number in a fully isolated linked worktree/env;
    // the branches are existing real spawned tasks. The drive must continue them and require the parent's own
    // acceptance — a terminal letter of a normal drive is NOT the continuation of such an epic.
    const wtExt2 = path.join(tmp, "wt-ext-epic")
    git(proj, "worktree", "add", "--detach", wtExt2, "HEAD")
    const extEpicOut = JSON.parse(execFileSync(process.execPath, [script, "--dir", wtExt2, "--title", "Внешний родительский эпик", "--project", "proj"], { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] }).trim())
    const xe = tasks.loadTask("proj", extEpicOut.n)
    ok(!!xe && xe.kind === "external" && xe.status === "done" && xe.author === "external" && !xe.history.some((h) => h.status === "accepted"), "E3: the real task-number.mjs registers the PARENT epic itself as external/done without the acceptance act")
    const b4 = (await spawnSmall("Ветка внешнего эпика 1")).t
    const b5 = (await spawnSmall("Ветка внешнего эпика 2")).t
    const regE3 = await call("crew_task", INTEG, { action: "drive", n: xe.n, policy: "crew-dependency-epic@1", text: `needs: ${b5.n}<=${b4.n}` })
    ok(/поставлена на автоматическое ведение/.test(regE3) && /регистрация[^\n]*сохранена как есть/.test(regE3), "E3: the epic drive attaches to the external parent registration and PRESERVES it as it is")
    const xe2 = tasks.loadTask("proj", xe.n)
    ok(xe2.kind === "external" && xe2.status === "done" && xe2.author === "external" && !xe2.history.some((h) => h.status === "accepted"), "E3: the parent record is unchanged by the attachment (kind/status/author kept, still no acceptance act)")
    ok(letters("external").some((f) => f.startsWith(`drive-proj-${xe.n}-registration-`)), "E3: the registration letter with a receipt lands in the external author's real mailbox")
    await tick()
    ok(driveLetters(b4.executor).some((f) => f.includes(`kick-${b4.n}`)) && driveLetters(b5.executor).length === 0, "E3: real continuation — the existing independent branch is kicked with a receipt, the dependent waits")
    const dE3a = coord.loadDrive("proj", xe.n)
    ok(!!dE3a && !dE3a.done && !dE3a.failed, "E3: the external parent is neither completed nor terminally ended while its branches run")
    await reallyFinish(b4)
    await tickUntil(() => driveLetters(b5.executor).some((f) => f.includes(`kick-${b5.n}`)))
    ok(driveLetters(b5.executor).filter((f) => f.includes(`kick-${b5.n}`)).length === 1, "E3: the really finished branch unlocks the dependent — the drive continues the existing branches")
    await reallyFinish(b5)
    await tick()
    await tick()
    const dE3 = coord.loadDrive("proj", xe.n)
    ok(!!dE3 && !dE3.done && !dE3.failed && dE3.gate?.id === "accept", "E3: the branches done open the PARENT's own acceptance gate — the external parent is not completed by the branches and not terminally ended")
    ok(letters("external").filter((f) => f.includes(`-${xe.n}-gate`)).length === 1, "E3: exactly one gate letter to the external author")
    ok(gateRouter.list().some((r) => r.qid === dE3?.gate?.qid), "E3: the parent's gate is a durable record of the real QuestionRouter under the gate qid")
  }
} finally {
  await stop()
  coord?.resetCoordinateTick?.()
  rmSync(tmp, { recursive: true, force: true })
}

console.log(failures ? `FAILURES: ${failures}` : "crew-coordinate-lifecycle.test ok")
process.exit(failures ? 1 : 0)
