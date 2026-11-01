// 281 (089/WC-2 slice): a normal submit must not break an existing verified question (node >= 24):
//   node test/crew-question-lifecycle.test.mjs
// The scope of a question is the STABLE identity of the assignment (project/n/qid/goal/boundaries/criteria/route/
// branch/author/executor); the delivery status (running -> submitted), the rework counters and the reviewer are the
// normal lifecycle and must not change the scope. Red probe: run before the patch — the same verified verdict is
// blocked after submit, the legacy-digest record is blocked. Green: the SAME verdict resolves and is delivered once;
// the legacy digest, PROVEN by re-computation over the unchanged boundaries (only lifecycle fields vary), is
// refreshed with the evidence recorded; the actual text/unknown/no-workScope record (resolve refused before the
// verdict was saved) recovers through observe -> routing -> resolve with freshly verified sources — no scope
// auto-adopt, no invented answer, no repeated POST. Negative controls: a genuinely different assignment, REAL
// boundary changes at the same qid/holder (repair refuses, the stored scope stands, POST = 0), a new source SHA, an
// owner decision, unknown transport, repeated delivery.
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-question-lifecycle-"))
for (const k of ["XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TEMP", "TMP", "TMPDIR"]) process.env[k] = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
globalThis.fetch = async () => { throw new Error("unexpected real transport") }

const core = await import("../core.ts")
const { QuestionRouter, questionId } = await import("../question-router.ts")
const { digest } = await import("../question-routing.ts")
const { createTask, loadTask, saveTask } = await import("../tasks.ts")
const { closedHits } = await import("../form-auto.ts")

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

const root = path.join(tmp, "repo")
mkdirSync(path.join(root, "doc"), { recursive: true })
const sourceText = "Фикстура: проверенный артефакт жизненного цикла вопроса; разрешений владельца не выдаёт."
writeFileSync(path.join(root, "doc", "source.md"), sourceText)
const source = { path: "doc/source.md", sha256: digest(sourceText), quote: sourceText }

const WORKER = "ses_life_worker"
const INTEG = "ses_life_integrator"
core.saveCard({ session: WORKER, role: "worker", auto: false, title: WORKER, directory: root, repo: "repo", project: "proj", pid: process.pid, updated: Date.now() })
core.saveCard({ session: INTEG, role: "integrator", auto: false, title: INTEG, directory: root, repo: "repo", project: "proj", pid: process.pid, updated: Date.now() })
core.takeExclusive("proj.integrator", "integrator", INTEG, false)

const task = createTask({ project: "proj", title: "life", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: INTEG, author_role: "proj.integrator", qid: "q_life_task", status: "running", kind: "assign", directory: root, executor: WORKER, route: "small" })
core.saveCard({ ...core.readJson(core.cardFile(WORKER)), task: { project: "proj", n: task.n } })

const host = {
  projects: [], defaultDir: root,
  touch: async (sid) => core.readJson(core.cardFile(sid)),
  isChild: () => false, posted: () => {}, picked: () => {}, roleTaken: () => {}, startTask: async () => ({}), doctor: async () => [],
  questionInspectText: async () => ({ state: "pending" }),
  questionRecoveryState: async () => "absent_idle",
}
const tools = core.makeTools(host)
const qtool = tools.find((t) => t.name === "crew_question")
const ttool = tools.find((t) => t.name === "crew_task")
const closed = (text) => closedHits(text).length > 0 || /(?:^|\n)\s*Тип:\s*gate\b/i.test(text)
const router = () => core.questionRouterFor(host, closed)
const letters = (to) => {
  const dir = path.join(core.INBOX, core.safeKey(to))
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []
}
const byQid = (qid) => router().list().find((r) => r.qid === qid)

// ---------------------------------------------------------------- the real lifecycle: ask (running) -> submit -> resolve -> delivery of THE SAME verdict
const asked = await qtool.execute({ action: "ask", text: "Где проверенный артефакт жизненного цикла?", context: "Нужен факт, не новое разрешение." }, WORKER)
ok(/id [a-f0-9]{64}/.test(asked.content), "ask opens the routed question")
const rec0 = router().list().find((r) => r.session === WORKER && r.channel === "text")
ok(rec0?.workScope?.assignment === "q_life_task", "the work scope of the running assignment is recorded")
// the normal lifecycle: the executor submits the work BEFORE the verified verdict arrives
await ttool.execute({ action: "submit", n: task.n, text: "Сделано, проверено." }, WORKER)
ok(loadTask("proj", task.n).status === "submitted", "submit is the normal lifecycle transition")
const resolved = await qtool.execute({ action: "resolve", id: rec0.id, epoch: rec0.epoch, text: "Артефакт приведён в проверенном источнике.", sources: [source] }, INTEG)
ok(/answer_queued|ready/.test(resolved.content) && !/\[scope\]/.test(resolved.content), `the SAME verified verdict resolves after submit (got: ${resolved.content.slice(0, 90)})`)
await router().tick()
const rec1 = byQid(rec0.qid)
ok(rec1?.status === "answer_queued", "the record is answer_queued, not blocked")
const answerLetters = letters(WORKER).filter((f) => f.includes("question-answer"))
ok(answerLetters.length === 1, "the verified verdict is delivered after submit (no scope break)")
await router().tick()
ok(letters(WORKER).filter((f) => f.includes("question-answer")).length === 1, "repeated ticks deliver once")
const acked = await qtool.execute({ action: "ack", id: rec0.id }, WORKER)
ok(/answered/.test(acked.content), "the original recipient acks; the question closes")

// ---------------------------------------------------------------- a legacy record: workScope digest of the old (lifecycle-full) field list
const legacyDigest = digest(JSON.stringify(["proj", task.n, "q_life_task", "g", "", "c", "running", "small", undefined, INTEG, "proj.integrator", WORKER, undefined, 0, 0]))
const legacyQid = "qlegacy281"
const legacyId = questionId({ project: "proj", session: WORKER, channel: "text", qid: legacyQid })
const legacyDir = path.join(core.BASE, "question-routing")
mkdirSync(legacyDir, { recursive: true })
writeFileSync(path.join(legacyDir, `${legacyId}.json`), JSON.stringify({
  v: 1, id: legacyId, revision: 0, epoch: 0, status: "ready", created: Date.now(), updated: Date.now(), deadline: Date.now() + 600_000,
  project: "proj", task: task.n, session: WORKER, channel: "text", qid: legacyQid, text: "Прежний вопрос со scope по старым полям", context: "контекст",
  source: { kind: "text", id: legacyQid, at: Date.now() }, answer: "Прежний проверенный вердикт.", sources: [source],
  target: INTEG, receivedAt: Date.now(), workScope: { assignment: "q_life_task", digest: legacyDigest },
}, null, 2))
await router().tick()
const legacyRec = router().get(legacyId)
ok(legacyRec?.status === "answer_queued", "the legacy-digest record of the SAME assignment is delivered (supported refresh), not blocked")
ok(legacyRec?.workScope?.digest !== legacyDigest && (legacyRec?.why ?? "").includes("281"), "the refresh to the stable identity is recorded as evidence")
await router().tick()
ok(letters(WORKER).filter((f) => f.includes("question-answer")).length === 2, "the legacy answer is delivered once (no duplicate POST)")

// ---------------------------------------------------------------- the ACTUAL current record shape (089/WC-2):
// channel text, unknown, NO workScope and NO stored answer — the original resolve was refused BEFORE the verified
// verdict was saved. Supported path: the previous outcome is re-checked (observe), the question returns to routing,
// the responsible integrator resolves with freshly verified sources. No scope auto-adopt (there is no stored
// boundary evidence), no invented answer, no repeated POST.
const lateQid = "qlate281"
const lateId = questionId({ project: "proj", session: WORKER, channel: "text", qid: lateQid })
writeFileSync(path.join(legacyDir, `${lateId}.json`), JSON.stringify({
  v: 1, id: lateId, revision: 0, epoch: 1, status: "unknown", created: Date.now(), updated: Date.now(), deadline: Date.now() + 600_000,
  project: "proj", task: task.n, session: WORKER, channel: "text", qid: lateQid, text: "Актуальный вопрос, чей resolve отказал до сохранения ответа", context: "контекст",
  source: { kind: "text", id: lateQid, at: Date.now() }, target: INTEG, receivedAt: Date.now(),
  why: "исход исходного вопроса неизвестен; только сверка, без повторной постановки",
}, null, 2))
await router().tick()
const lateRec = router().get(lateId)
ok(lateRec?.status === "routing" && lateRec.observed?.state === "pending", "the actual text/unknown record: previous outcome re-checked, back to routing")
ok(lateRec?.workScope === undefined, "no auto-adopt of a scope without stored boundary evidence")
const lateResolve = await qtool.execute({ action: "resolve", id: lateId, epoch: lateRec.epoch, text: "Проверенный вердикт восстановлен заново по тому же id/qid.", sources: [source] }, INTEG)
ok(/answer_queued|ready/.test(lateResolve.content) && !/\[scope\]/.test(lateResolve.content), `the SAME question resolves through the supported path (got: ${lateResolve.content.slice(0, 80)})`)
await router().tick()
ok(letters(WORKER).filter((f) => f.includes(`question-answer-${lateId}`)).length === 1, "the recovered verdict is delivered once")
await router().tick()
ok(letters(WORKER).filter((f) => f.includes(`question-answer-${lateId}`)).length === 1, "no duplicate delivery of the recovered verdict")

// ---------------------------------------------------------------- negative controls
// a genuinely different assignment: the refresh must not attach it
const otherQid = "qother281"
const otherId = questionId({ project: "proj", session: WORKER, channel: "text", qid: otherQid })
writeFileSync(path.join(legacyDir, `${otherId}.json`), JSON.stringify({
  v: 1, id: otherId, revision: 0, epoch: 0, status: "ready", created: Date.now(), updated: Date.now(), deadline: Date.now() + 600_000,
  project: "proj", task: task.n, session: WORKER, channel: "text", qid: otherQid, text: "Вопрос другого поручения", context: "контекст",
  source: { kind: "text", id: otherQid, at: Date.now() }, answer: "Чужой вердикт.", sources: [source],
  target: INTEG, receivedAt: Date.now(), workScope: { assignment: "q_life_OTHER", digest: legacyDigest },
}, null, 2))
await router().tick()
const otherRec = router().get(otherId)
ok(otherRec?.status === "blocked" && otherRec?.workScope?.assignment === "q_life_OTHER", "a different assignment is not refreshed or delivered")
// a new source SHA is refused
const asked2 = await qtool.execute({ action: "ask", text: "Ещё один рабочий вопрос?", context: "контекст" }, WORKER)
const rec2 = router().list().find((r) => r.qid !== rec0.qid && r.session === WORKER && r.channel === "text" && r.status === "routing")
const badSha = await qtool.execute({ action: "resolve", id: rec2.id, epoch: rec2.epoch, text: "Ответ с другим источником.", sources: [{ ...source, sha256: "0".repeat(64) }] }, INTEG)
ok(/source|источник/i.test(badSha.content), "a new source SHA is refused")
// an owner decision is not resolved by the integrator
const ownerQid = "qowner281"
const ownerId = questionId({ project: "proj", session: WORKER, channel: "text", qid: ownerQid })
writeFileSync(path.join(legacyDir, `${ownerId}.json`), JSON.stringify({
  v: 1, id: ownerId, revision: 0, epoch: 0, status: "owner", created: Date.now(), updated: Date.now(), deadline: Date.now() + 600_000,
  project: "proj", task: task.n, session: WORKER, channel: "text", qid: ownerQid, text: "Настоящее решение владельца", context: "контекст",
  source: { kind: "text", id: ownerQid, at: Date.now() }, target: INTEG, decision: "решение владельца",
}, null, 2))
const ownerResolve = await qtool.execute({ action: "resolve", id: ownerId, epoch: 0, text: "Интегратор подменяет.", sources: [source] }, INTEG)
ok(/owner|владельц/i.test(ownerResolve.content), "an owner-gate record is not resolved by the integrator")
await router().tick()
ok(!letters(WORKER).some((f) => f.includes(`question-answer-${ownerId}`)), "no delivery of an unsettled owner decision")
// unknown transport: no POST, the record stays safe
const unknownQid = "qunknown281"
const unknownId = questionId({ project: "proj", session: WORKER, channel: "form", qid: unknownQid })
writeFileSync(path.join(legacyDir, `${unknownId}.json`), JSON.stringify({
  v: 1, id: unknownId, revision: 0, epoch: 1, status: "unknown", created: Date.now(), updated: Date.now(), deadline: Date.now() + 600_000,
  project: "proj", task: task.n, session: WORKER, channel: "form", qid: unknownQid, text: "Неизвестный transport", context: "контекст",
  source: { kind: "form", id: "frm_unknown", at: Date.now() }, form: { id: "frm_unknown", fingerprint: "fp", field: "q0" },
  answer: "Ответ без подтверждённого recovery state.", sources: [source], target: INTEG, receivedAt: Date.now(),
}, null, 2))
const hostUnknown = { ...host, questionRecoveryState: async () => "unknown" }
await core.questionRouterFor(hostUnknown, closed).tick()
const unknownRec = core.questionRouterFor(host, closed).get(unknownId)
ok(unknownRec?.status === "unknown" && !unknownRec.recovery, "unknown transport: no recovery letter, the record stays safe")
ok(!letters(WORKER).some((f) => f.includes(`question-recovery-${unknownId}`)), "unknown transport: no POST")

// ---------------------------------------------------------------- negative (integrator, 23:21): same qid/holder,
// boundaries A recorded at ask; then the REAL boundaries change (goal A -> B). The repair MUST refuse: the stored
// scope stands, the record is not silently repaired, no delivery (POST = 0). The neighbouring positive above changed
// ONLY the lifecycle (running -> submitted) with the boundaries intact.
const chAsked = await qtool.execute({ action: "ask", text: "Вопрос, заданный до смены границ?", context: "контекст" }, WORKER)
const chId = /id ([a-f0-9]{64})/.exec(chAsked.content)?.[1]
const chBefore = chId ? router().get(chId) : undefined
ok(chBefore?.workScope?.digest, "the scope of boundaries A is recorded")
saveTask({ ...loadTask("proj", task.n), goal: "g2: изменённые границы поручения" })
const chResolve = await qtool.execute({ action: "resolve", id: chId, epoch: chBefore.epoch, text: "Поздний ответ после смены границ.", sources: [source] }, INTEG)
ok(/\[scope\]/.test(chResolve.content), "the repair REFUSES after the real boundaries changed (same qid/holder)")
const chAfter = router().get(chId)
ok(chAfter?.workScope?.digest === chBefore.workScope.digest && chAfter.status === "routing", "the stored scope stands; the record is not silently repaired")
ok(!letters(WORKER).some((f) => f.includes(`question-answer-${chId}`)), "POST = 0 for the changed-boundaries question")

console.log(failures ? `FAILURES: ${failures}` : "crew-question-lifecycle.test ok")
process.exit(failures ? 1 : 0)
