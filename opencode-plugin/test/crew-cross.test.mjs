// Self-test of work across projects (plan 002, Ph.5; node >= 24):  node test/crew-cross.test.mjs
// - inbound of the receiving project: integrator (default: from another project only to its integrator), any, none;
//   a refused letter names the address to use;
// - an order: alpha's integrator orders work from beta's integrator (crew_task order); beta takes it with its own
//   task (crew_spawn {parent: "alpha#N"}); the order follows that task: cleanup -> the order is done (a quiet summary
//   to alpha's integrator), cancelled -> a call; no session and no title marks for the order.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-cross-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
delete process.env.CREW_HARNESS_PRESENCE
const dirA = path.join(tmp, "alpha")
const dirB = path.join(tmp, "beta")
for (const d of [dirA, dirB]) mkdirSync(path.join(d, ".opencode"), { recursive: true })
const inbound = (v) => writeFileSync(path.join(dirB, ".opencode", "crew-harness.json"), JSON.stringify(v ? { inbound: v, allow_default_models: true } : { allow_default_models: true }))
inbound(undefined)

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const updates = []
const dirOf = { sesAINT: dirA, sesAWRK: dirA, sesBINT: dirB, sesBWRK: dirB }
const ctx = {
  location: { directory: tmp },
  options: { projects: { alpha: dirA, beta: dirB } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf[sessionID] ?? dirB }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => ({ id: req.id }),
    update: async (req) => updates.push(req),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const WPID = 727272
const tabs = Object.keys(dirOf).map((sessionID) => ({ sessionID, active: false, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const s of Object.keys(dirOf)) {
  await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: s } })
}
await call("crew_role", "sesAINT", { role: "integrator" })
await call("crew_role", "sesBINT", { role: "integrator" })

// 1. inbound: integrator (default)
const toWorker = await call("crew_send", "sesAINT", { to: "beta.worker", text: "сделай X" })
cell("inbound integrator: a letter to another project's worker is refused, naming the integrator", /только интегратору/.test(toWorker) && /beta\.integrator/.test(toWorker), toWorker)
const toSession = await call("crew_send", "sesAINT", { to: "sesBWRK", text: "сделай X" })
cell("... by session id too", /только интегратору/.test(toSession), toSession)
const toAll = await call("crew_send", "sesAINT", { to: "beta.all", text: "всем" })
cell("... and to beta.all", /только интегратору/.test(toAll), toAll)
const toInt = await call("crew_send", "sesAINT", { to: "beta.integrator", text: "вопрос интегратору" })
await wait()
cell("a letter to beta's integrator goes", /Отправлено/.test(toInt) && got("sesBINT", "вопрос интегратору").length === 1, toInt)
const own = await call("crew_send", "sesAWRK", { to: "sesAINT", text: "своему" })
cell("the own project is not limited", /Отправлено/.test(own), own)
inbound("any")
const anyOk = await call("crew_send", "sesAINT", { to: "beta.worker", text: "можно всем" })
cell("inbound any: a worker of beta may be written to", /Отправлено/.test(anyOk), anyOk)
inbound("none")
const none = await call("crew_send", "sesAINT", { to: "beta.integrator", text: "нельзя" })
cell("inbound none: even the integrator is refused", /inbound: none/.test(none), none)
inbound(undefined)

// 2. an order
const ord = await call("crew_task", "sesAINT", { action: "order", to: "beta.integrator", title: "библиотека", goal: "добавить функцию в beta", criteria: "тест зелёный" })
const order = tasks.loadTask("alpha", 1)
await wait()
cell("the order is recorded in alpha's journal (no session)", order?.kind === "order" && order.order_to === "beta" && !order.executor && /Заказ 001/.test(ord), JSON.stringify(order))
const letter = got("sesBINT", "ЗАКАЗ проекта alpha 001")
cell("beta's integrator gets the order with the parent to use", letter.length === 1 && letter[0].text.includes('parent: "alpha#1"'), letter[0]?.text)
const notMine = await call("crew_task", "sesAWRK", { action: "order", to: "beta.integrator", goal: "g", criteria: "c" })
cell("only the integrator orders", /только интегратор/.test(notMine), notMine)
const sp = await call("crew_spawn", "sesBINT", { title: "функция", goal: "сделать функцию", criteria: "тест", parent: "alpha#1" })
const child = tasks.loadTask("beta", 1)
cell("beta's task carries the parent; the order knows its child", child?.parent?.project === "alpha" && tasks.loadTask("alpha", 1).child?.n === 1 && tasks.loadTask("alpha", 1).history.some((h) => /принят в работу в beta: 001/.test(h.note ?? "")), sp)
const linkedOrder = tasks.loadTask("alpha", 1)
const linkedChild = tasks.loadTask("beta", 1)
const reconcileInput = { action: "reconcile", order_project: "alpha", order_n: 1, child_n: 1, expected_order_version: tasks.taskVersion(linkedOrder), expected_child_version: tasks.taskVersion(linkedChild), expected_order_status: linkedOrder.status, expected_child_status: linkedChild.status }
const repeatLink = await call("crew_task", "sesBINT", reconcileInput)
cell("145 reconcile: exact already-linked pair repeats idempotently", /повтор, идемпотентно/.test(repeatLink) && tasks.loadTask("alpha", 1).child?.n === 1, repeatLink)
const versionBefore = tasks.taskVersion(tasks.loadTask("beta", 1))
const updatedBefore = tasks.loadTask("beta", 1).updated
const realNow = Date.now
Date.now = () => updatedBefore // force two substantive writes to share the same millisecond token
try { tasks.taskEvent(tasks.loadTask("beta", 1), "test", undefined, "same-millisecond content change") } finally { Date.now = realNow }
const sameMsChild = tasks.loadTask("beta", 1)
const versionAfter = tasks.taskVersion(sameMsChild)
const staleLink = await call("crew_task", "sesBINT", { ...reconcileInput, expected_child_version: versionBefore })
cell("145 same-ms stale version: record content changes while updated/status stay fixed and old fingerprint fails closed", sameMsChild.updated === updatedBefore && sameMsChild.status === "running" && versionBefore !== versionAfter && /^[a-f0-9]{64}$/.test(versionAfter) && tasks.taskVersion(tasks.loadTask("beta", 1)) === versionAfter && /expected version/.test(staleLink), staleLink)
const relationAudit = await call("crew_task", "sesAINT", { action: "show", n: 1 })
cell("145 reconciliation refusal is retained in task show audit", /аудит связи/.test(relationAudit) && /expected version/.test(relationAudit), relationAudit)
const versionShow = await call("crew_task", "sesBINT", { action: "show", n: 1 })
cell("145 show exposes exact stable fingerprint, updated, raw status and reciprocal parent", versionShow.includes(`версия: ${versionAfter}; updated: ${updatedBefore}; status: running; parent: alpha#1; child: —`), versionShow)
await call("crew_task", "sesAINT", { action: "order", to: "beta.integrator", title: "частичный сбой", goal: "восстановить exact link", criteria: "две стороны" })
const interruptedChild = tasks.createTask({ project: "beta", title: "синтетическая reviewing задача", goal: "не завершена", criteria: "только связь", priority: "P2", tier: "light", role: "worker", author: "sesBINT", author_role: "beta.integrator", qid: "q-interrupted", status: "reviewing", kind: "spawn", directory: dirB })
const interruptedOrder = tasks.loadTask("alpha", 2)
const interruptedBefore = tasks.loadTask("beta", interruptedChild.n)
const pendingFile = path.join(tasks.TASKS, ".relation-pending.json")
writeFileSync(pendingFile, JSON.stringify({ order: { project: "alpha", n: 2 }, child: { project: "beta", n: interruptedChild.n }, expected: { orderVersion: tasks.taskVersion(interruptedOrder), childVersion: tasks.taskVersion(interruptedBefore) }, by: "test", at: Date.now() }))
const clockBeforePartial = Date.now
Date.now = () => interruptedBefore.updated + 1000
try {
  interruptedChild.parent = { project: "alpha", n: 2 }
  tasks.taskEvent(interruptedChild, "test", undefined, `связь с заказом alpha 2 записана; операция alpha#2→beta#${interruptedChild.n}`) // synthetic crash point: child pointer/history durable, order pointer absent
} finally { Date.now = clockBeforePartial }
const interruptedCurrent = tasks.loadTask("beta", interruptedChild.n)
const recoveryInput = { action: "reconcile", order_project: "alpha", order_n: 2, child_n: interruptedChild.n, expected_order_version: tasks.taskVersion(interruptedOrder), expected_child_version: tasks.taskVersion(interruptedCurrent), expected_order_status: "running", expected_child_status: "reviewing" }
const staleRecovery = await call("crew_task", "sesBINT", { ...recoveryInput, expected_child_version: tasks.taskVersion(interruptedBefore) })
cell("145 partial-write recovery refuses the stale pre-write tuple", /expected version fingerprints/.test(staleRecovery) && !tasks.loadTask("alpha", 2).child, staleRecovery)
const preview = await call("crew_task", "sesBINT", { ...recoveryInput, dry_run: true })
cell("145 partial-write dry-run: refreshed current versions validate the journaled exact intent", /Проверка без записи/.test(preview) && !tasks.loadTask("alpha", 2).child && tasks.loadTask("beta", interruptedChild.n).status === "reviewing" && interruptedCurrent.updated === interruptedBefore.updated + 1000, preview)
const relationLock = path.join(tasks.TASKS, ".relation-lock")
mkdirSync(relationLock, { recursive: true })
writeFileSync(path.join(relationLock, "owner.json"), JSON.stringify({ pid: process.pid, at: Date.now() }))
const lockedAttempt = await call("crew_task", "sesBINT", recoveryInput)
cell("145 race probe: a concurrent relation lock fails closed without writing the order", /другая операция связи/.test(lockedAttempt) && !tasks.loadTask("alpha", 2).child, lockedAttempt)
rmSync(relationLock, { recursive: true, force: true })
const recovered = await call("crew_task", "sesBINT", recoveryInput)
cell("145 partial-write recovery: rolls exact pair forward, reviewing remains open", /Связь восстановлена/.test(recovered) && tasks.loadTask("alpha", 2).child?.n === interruptedChild.n && tasks.loadTask("alpha", 2).status === "running" && tasks.loadTask("beta", interruptedChild.n).status === "reviewing", recovered)
const beforeConflictOrder = tasks.loadTask("alpha", 1)
const beforeConflictChild = tasks.loadTask("beta", interruptedChild.n)
const wrongChild = await call("crew_task", "sesBINT", { action: "reconcile", order_project: "alpha", order_n: 1, child_n: interruptedChild.n, expected_order_version: tasks.taskVersion(beforeConflictOrder), expected_child_version: tasks.taskVersion(beforeConflictChild), expected_order_status: beforeConflictOrder.status, expected_child_status: beforeConflictChild.status })
cell("145 conflicting exact endpoints fail closed without replacing either link", /конфликтующ|уже связ/.test(wrongChild) && tasks.loadTask("alpha", 1).child?.n === 1 && tasks.loadTask("beta", interruptedChild.n).parent?.n === 2, wrongChild)
const workerReconcile = await call("crew_task", "sesBWRK", { action: "reconcile", order_project: "alpha", order_n: 1, child_n: 1 })
cell("145 reconcile remains integrator-only", /только интегратор/.test(workerReconcile), workerReconcile)
const wrongParent = await call("crew_spawn", "sesBINT", { title: "x", goal: "g", criteria: "c", parent: "alpha#99" })
cell("an unknown parent is refused", /Заказа alpha#99/.test(wrongParent), wrongParent)

// 3. beta's task is cleaned up (as the reviewer would) -> the order is done; alpha's integrator gets a quiet summary
const completed = tasks.loadTask("beta", 1)
tasks.taskEvent(completed, "test", "accepted", "принята; synthetic merged commit")
completed.merged_head = "abcdef0123456789"
tasks.saveTask(completed)
tasks.taskEvent(completed, "test", "done", "synthetic cleanup")
const quietSummaryTo = core.propagateToParent(tasks.loadTask("beta", 1))
cell("the order is done when beta's task is cleaned up", tasks.loadTask("alpha", 1).status === "done", JSON.stringify(tasks.loadTask("alpha", 1).history))
cell("alpha's integrator gets a quiet summary", quietSummaryTo.includes("sesAINT"), JSON.stringify(quietSummaryTo))
cell("no titles of integrators were touched", !updates.some((u) => u.sessionID === "sesAINT" || u.sessionID === "sesBINT"), JSON.stringify(updates))

// 4. a cancelled child -> a call to the orderer
await call("crew_task", "sesAINT", { action: "order", to: "beta.integrator", title: "второй", goal: "g2", criteria: "c2" })
await call("crew_spawn", "sesBINT", { title: "второй", goal: "g2", criteria: "c2", parent: "alpha#3" })
await call("crew_task", "sesBINT", { action: "cancel", n: 3, text: "не будем" })
await wait()
cell("a cancelled child wakes the orderer with a call", got("sesAINT", "Заказ 003 «второй»").some((d) => !d.synthetic && d.text.includes("задачу beta 003 отменили")), JSON.stringify(got("sesAINT", "Заказ 003")))

// 5. Legacy accepted/done evidence: merged_head exists while commit is absent.
await call("crew_task", "sesAINT", { action: "order", to: "beta.integrator", title: "legacy done", goal: "synthetic accepted task", criteria: "accepted and landed" })
const legacyDone = tasks.createTask({ project: "beta", title: "legacy shape", goal: "done", criteria: "accepted", priority: "P2", tier: "light", role: "worker", author: "sesBINT", author_role: "beta.integrator", qid: "q-legacy", status: "running", kind: "spawn", directory: dirB })
tasks.taskEvent(legacyDone, "test-reviewer", "accepted", "accepted legacy synthetic evidence")
legacyDone.merged_head = "fedcba9876543210"
tasks.saveTask(legacyDone)
tasks.taskEvent(legacyDone, "test-reviewer", "done", "legacy synthetic cleanup")
const legacyOrder = tasks.loadTask("alpha", 4)
const legacyCurrent = tasks.loadTask("beta", legacyDone.n)
const legacyRecovery = await call("crew_task", "sesBINT", { action: "reconcile", order_project: "alpha", order_n: 4, child_n: legacyDone.n, expected_order_version: tasks.taskVersion(legacyOrder), expected_child_version: tasks.taskVersion(legacyCurrent), expected_order_status: "running", expected_child_status: "done", evidence: legacyCurrent.merged_head })
cell("145 legacy done evidence: merged_head without commit plus accepted history may close only the linked exact order", /Связь восстановлена/.test(legacyRecovery) && !("commit" in legacyCurrent) && tasks.loadTask("alpha", 4).status === "done", legacyRecovery)

await call("crew_task", "sesAINT", { action: "order", to: "beta.integrator", title: "race", goal: "one child only", criteria: "one reciprocal pair" })
const raceA = tasks.createTask({ project: "beta", title: "race A", goal: "child", criteria: "same order", priority: "P2", tier: "light", role: "worker", author: "sesBINT", author_role: "beta.integrator", qid: "q-race-a", status: "running", kind: "spawn", directory: dirB })
const raceB = tasks.createTask({ project: "beta", title: "race B", goal: "child", criteria: "same order", priority: "P2", tier: "light", role: "worker", author: "sesBINT", author_role: "beta.integrator", qid: "q-race-b", status: "running", kind: "spawn", directory: dirB })
const raceOrder = tasks.loadTask("alpha", 5)
const raceOne = { task: raceA, current: tasks.loadTask("beta", raceA.n) }
const raceTwo = { task: raceB, current: tasks.loadTask("beta", raceB.n) }
const runRelationChild = ({ task, current }) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [path.join(import.meta.dirname, "relation-child.mjs"), "alpha", "5", "beta", String(task.n), tasks.taskVersion(raceOrder), tasks.taskVersion(current)], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] })
  let out = "", err = ""
  p.stdout.on("data", (x) => out += x)
  p.stderr.on("data", (x) => err += x)
  p.on("error", reject)
  p.on("close", (code) => code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err)))
})
const raceResults = await Promise.all([runRelationChild(raceOne), runRelationChild(raceTwo)])
const raceWinner = tasks.loadTask("alpha", 5).child?.n
cell("145 interprocess race: exactly one competing child commits the order pointer", raceResults.filter((r) => r.ok).length === 1 && [raceA.n, raceB.n].includes(raceWinner) && tasks.loadTask("beta", raceWinner)?.parent?.n === 5 && !tasks.loadTask("beta", raceWinner === raceA.n ? raceB.n : raceA.n)?.parent, JSON.stringify({ raceResults, raceWinner }))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-cross.test: FAIL ${fail}` : "crew-cross.test ok")
process.exit(fail ? 1 : 0)
