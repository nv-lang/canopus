import { writeFixtureFile } from "./fixture-settings.mjs"
// Self-test of the whole flow of the question-answering modes in the running plugin (task 007; node >= 24):
//   node test/canopus-answer-flow.test.mjs
// The heaviest of the answer tests: the real plugin (index.ts) over a real sqlite database of turns, a fake OpenCode host and one
// window with the tabs. A tab ends a turn with a question block; the pass of the status (syncStatus) decides before the block of the
// notices: the question is closed by its recommendation (a letter, a record "дан", no notice "ждёт вас"), or it stays with the owner
// (one notice with the rest). The cells of the tab of the owner are here; the cells of the task sessions join in the next step.
// Run alone, last. The code comes from CANOPUS_PLUGIN_DIR (a copy with stubs) or from the folder above.
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { harness, load, reporter } from "./answer-harness.mjs"

const R = reporter("canopus-answer-flow.test")
const cell = R.cell
const NL = String.fromCharCode(10)
const SIDS = Array.from({ length: 40 }, (_, i) => `sesFlow${String(i + 1).padStart(2, "0")}`)
const H = await harness("canopus-answer-flow", { sessions: [...SIDS, 'sesAuthor1'], ownLog: true, settings: { owner_reminder_min: 1 } })
const core0 = () => H.core
// the module of the journal may be absent (the base of the proof of red): then there are no records and the cells that need them fail
const A = await load("answer.ts").catch(() => ({ ANSWERS: path.join(core0().BASE, "answers"), readRecords: () => [] }))
const { core } = H
let n = 0
const nextSid = () => SIDS[n++]
const LETTER = "⚙ 10:00 · canopus → x (служебное, не отвечай)" + NL + "ответ"

/** one block of the form of the Canon plus the lines of the type and the permission; the line with "?" last: the old pass sees it */
const block = (o = {}) =>
  [
    `В-${o.n ?? "01"} ${o.q ?? "Какой формат писать?"}`,
    ...(o.type === null ? [] : [`Тип: ${o.type ?? "requirements"}`]),
    ...(o.extra ?? []),
    ...(o.rec === null ? [] : [`Рекомендация: ${o.rec ?? "формат json, он проще читается"}`]),
    ...(o.flag === null ? [] : [o.flag ?? "Автоответ: допустим"]),
  ].join(NL)
const SEEN = "Согласны с рекомендацией?" // a last line with "?" so that the old pass of the owner's tab would notify
const modes = (map, more = {}) => H.setSettings({ owner_reminder_min: 1, ...(map ? { answer_mode: map } : {}), ...more })
// the notices "waits for you" of a session; the notices about delivered letters ("✉ ...") are another matter
const noticesOf = (sid) => H.notices().filter((x) => x.sessionID === sid && /ждёт вас$/.test(x.title))
const recsOf = (sid, kind) => A.readRecords(sid).filter((r) => !kind || r.kind === kind)
const stFile = (sid) => {
  try {
    return JSON.parse(readFileSync(path.join(H.status.STATUS, `${sid}.json`), "utf8"))
  } catch {
    return undefined
  }
}
/** a turn of a new tab; waits until the passes of the status have had their say */
// ready(sid): what must have appeared by the end of the wait; awaited as a condition (up to 60 s), because a fixed 1.3 s is too short for
// a loaded machine (task 085). Without it the old pause alone: the cells that expect "nothing happens" have nothing to wait for.
const go = async (text, { settings = undefined, user = "поехали", afterRows, wait = 1300, at, ready } = {}) => {
  if (settings !== undefined) settings()
  const sid = nextSid()
  await H.turn(sid, text, { user, afterRows, ...(at ? { at } : {}) })
  await H.wait(wait)
  if (ready) await H.until(() => ready(sid), 60_000)
  return sid
}
const hasN = (s, n = 1) => noticesOf(s).length >= n
const hasA = (s, n = 1) => recsOf(s, "a").length >= n
const lettersText = (sid) => H.letters(sid).map((l) => l.text).join(NL + "---" + NL)

// ---- AC-01: no keys: the old path, even when the text has the lines of the form ---------------------------------------
{
  const sid = await go([block(), SEEN].join(NL), { settings: () => modes(null), ready: (s) => hasN(s) && stFile(s)?.state === "owner" })
  const nt = noticesOf(sid)
  cell("AC-01 строки без ключей", nt.length === 1 && /ждёт вас$/.test(nt[0].title) && /Согласны с рекомендацией\?/.test(nt[0].message) && stFile(sid)?.state === "owner" && recsOf(sid).length === 0 && H.letters(sid).length === 0, JSON.stringify([nt, stFile(sid)?.state, recsOf(sid).length]))
}

// ---- AC-02: a tab of the owner, the turn started by the owner's word, no word after the end ---------------------------
{
  const sid = await go([block({ extra: ["Срок: 30 мин", "Адресат: владелец"] }), SEEN].join(NL), { settings: () => modes({ requirements: "recommendations" }), ready: (s) => hasA(s) && H.letters(s).length >= 1 })
  const a = recsOf(sid, "a")
  const lt = lettersText(sid)
  cell("AC-02", a.length === 1 && a[0].state === "дан" && /не слово владельца/.test(lt) && /формат json/.test(lt) && noticesOf(sid).length === 0, JSON.stringify([a.map((r) => r.state), noticesOf(sid), lt.slice(0, 200)]))
  await H.wait(800)
  cell("AC-02 второй проход", recsOf(sid, "a").length === 1 && recsOf(sid, "r").length === 0 && noticesOf(sid).length === 0 && H.letters(sid).length === 1, JSON.stringify([recsOf(sid).length, noticesOf(sid).length, H.letters(sid).length]))
}
{
  const sid = await go([block({ extra: ["Затрагивает: REQ-04, AC-29", "Влияет: на надёжность разбора", "Адресат: nova.integrator", "Срок: 2026-10-15"] }), SEEN].join(NL), { settings: () => modes({ requirements: "recommendations" }), ready: (s) => hasA(s) })
  cell("AC-02 поля", recsOf(sid, "a").length === 1 && noticesOf(sid).length === 0, JSON.stringify([recsOf(sid), noticesOf(sid)]))
}
{
  const sid = await go([block({ flag: null }), SEEN].join(NL), { settings: () => modes({ requirements: "recommendations" }), ready: (s) => hasN(s) })
  const nt = noticesOf(sid)
  cell("AC-02 без признака", recsOf(sid, "a").length === 0 && nt.length === 1 && /ждёт вас$/.test(nt[0].title) && !/не слово владельца/.test(lettersText(sid)), JSON.stringify([recsOf(sid), nt]))
}

// ---- AC-03: the type against the keys ----------------------------------------------------------------------------------
{
  const text = [block({ type: "plan" }), SEEN].join(NL)
  const a = await go(text, { settings: () => modes({ requirements: "recommendations" }), ready: (s) => hasN(s) })
  cell("AC-03 a", recsOf(a, "a").length === 0 && noticesOf(a).length === 1 && /ждёт вас$/.test(noticesOf(a)[0].title), JSON.stringify([recsOf(a), noticesOf(a)]))
  const b = await go(text, { settings: () => modes({ default: "recommendations" }), ready: (s) => hasA(s) })
  cell("AC-03 b", recsOf(b, "a").length === 1 && noticesOf(b).length === 0, JSON.stringify([recsOf(b), noticesOf(b)]))
  const c = await go(text, { settings: () => modes({ plan: "owner", default: "recommendations" }), ready: (s) => hasN(s) })
  cell("AC-03 c", recsOf(c, "a").length === 0 && noticesOf(c).length === 1 && /ждёт вас$/.test(noticesOf(c)[0].title), JSON.stringify([recsOf(c), noticesOf(c)]))
}

// ---- AC-04: a pack of three; endsWithQuestion of the pack sees no question -----------------------------------------------
const PACK3 = [block({ n: "01", q: "Первый вопрос?", type: "implementation", rec: "делаем по первому варианту" }), "", block({ n: "02", q: "Второй вопрос?", type: "implementation", rec: null }), "", block({ n: "03", q: "Третий вопрос?", type: "gate", rec: "делаем по третьему варианту" })].join(NL)
{
  cell("AC-04 пакет не виден endsWithQuestion", H.status.endsWithQuestion(PACK3) === undefined, String(H.status.endsWithQuestion(PACK3)))
  const sid = await go(PACK3, { settings: () => modes({ default: "recommendations" }), ready: (s) => hasA(s) && hasN(s) })
  const lt = lettersText(sid)
  const nt = noticesOf(sid)
  cell("AC-04", recsOf(sid, "a").length === 1 && recsOf(sid, "a")[0].qn === 1 && /В-02/.test(lt) && /В-03/.test(lt) && /жди слов владельца/.test(lt) && nt.length === 1 && /В-02/.test(nt[0].message) && /В-03/.test(nt[0].message), JSON.stringify([recsOf(sid).map((r) => [r.kind, r.qn]), nt, lt.slice(0, 600)]))
}

// ---- AC-06: default: recommendations closes a question of the form with the permission written in capitals and a dot --------
{
  const sid = await go([block({ type: "implementation", flag: "Автоответ: Допустим." }), SEEN].join(NL), { settings: () => modes({ default: "recommendations" }), ready: (s) => hasA(s) })
  cell("AC-06 default recommendations", recsOf(sid, "a").length === 1 && noticesOf(sid).length === 0, JSON.stringify([recsOf(sid), noticesOf(sid)]))
}

// ---- AC-11: the owner's word -------------------------------------------------------------------------------------------
{
  const text = [block({ type: "implementation" }), SEEN].join(NL)
  const a = await go(text, { settings: () => modes({ default: "recommendations" }), afterRows: (at, s) => H.ownerSays(s, "я сам отвечу", at + 1) })
  cell("AC-11 a", recsOf(a).length === 0 && noticesOf(a).length === 0 && H.letters(a).length === 0, JSON.stringify([recsOf(a), noticesOf(a), H.letters(a).length]))
  const b = await go(text, { settings: () => modes({ default: "recommendations" }), user: "поехали", ready: (s) => hasA(s) })
  cell("AC-11 b вкладка", recsOf(b, "a").length === 1 && recsOf(b, "a")[0].state === "дан", JSON.stringify(recsOf(b)))
  const m = await go(text, { settings: () => modes({ default: "recommendations" }), user: LETTER, at: Date.now() - 400_000, afterRows: (at, s) => H.ownerSays(s, "✉ 10:01 · письмо соседа", at + 1), ready: (s) => hasA(s) })
  cell("AC-11 метка", recsOf(m, "a").length === 1, JSON.stringify([recsOf(m), noticesOf(m)]))
}

// ---- AC-14: a pack at the limit ----------------------------------------------------------------------------------------
{
  const three = [1, 2, 3].map((i) => block({ n: `0${i}`, q: `Вопрос номер ${i}?`, type: "implementation", rec: `делаем по варианту ${i}` })).join(NL + NL)
  const sid = await go(three, { settings: () => modes({ default: "recommendations" }, { answer_max: 2 }), ready: (s) => recsOf(s, "a").length >= 2 && noticesOf(s).length >= 1 })
  const nt = noticesOf(sid)
  cell("AC-14 пакет", recsOf(sid, "a").map((r) => r.qn).join() === "1,2" && nt.length === 1 && /В-03/.test(nt[0].message) && /предел автоответов/.test(nt[0].message), JSON.stringify([recsOf(sid).map((r) => [r.kind, r.qn]), nt]))
  const two = [1, 2].map((i) => block({ n: `0${i}`, q: `Вопрос номер ${i}?`, type: "implementation", rec: `делаем по варианту ${i}` })).join(NL + NL)
  const s2 = await go(two, { settings: () => modes({ default: "recommendations" }, { answer_max: 2 }), ready: (s) => hasA(s, 2) })
  const before = JSON.stringify(recsOf(s2).map((r) => [r.id, r.answeredAt, r.state]))
  await H.wait(1200)
  cell("AC-14 пакет повтор", recsOf(s2, "a").length === 2 && recsOf(s2, "r").length === 0 && before === JSON.stringify(recsOf(s2).map((r) => [r.id, r.answeredAt, r.state])) && noticesOf(s2).length === 0, JSON.stringify([before, noticesOf(s2)]))
}

// ---- AC-30: the owner's tab: the rest of a pack ------------------------------------------------------------------------
{
  // а: no keys: silence as now (the pack is not seen by endsWithQuestion)
  const a = await go(PACK3, { settings: () => modes(null) })
  cell("AC-30 а", noticesOf(a).length === 0 && recsOf(a).length === 0 && H.letters(a).length === 0 && stFile(a)?.state !== "owner", JSON.stringify([noticesOf(a), stFile(a)?.state]))
  // б: one notice with the rest, the repeat after owner_reminder_min, the owner's word after the end lifts the mark and the repeat
  const sid = await go(PACK3, { settings: () => modes({ default: "recommendations" }), ready: (s) => hasN(s) && recsOf(s, "r").length >= 1 })
  const first = noticesOf(sid)
  const rest = recsOf(sid, "r")[0]
  if (!rest) cell("AC-30 б", false, "no mark of the rest in the journal")
  else {
    const f = path.join(A.ANSWERS, `${rest.id}.json`)
    const j = JSON.parse(readFileSync(f, "utf8"))
    j.remindedAt = Date.now() - 2 * 60_000 // two minutes ago: the repeat is due (owner_reminder_min is 1)
    writeFixtureFile(f, JSON.stringify(j))
    await H.until(() => noticesOf(sid).length >= 2, 60_000)
    const repeated = noticesOf(sid).length
    H.ownerSays(sid, "отвечаю сам", Date.now())
    await H.until(() => recsOf(sid, "r")[0]?.state === "снято: владелец написал", 60_000) // the lift is awaited; the pause below is for "no new notice"
    const lifted = recsOf(sid, "r")[0]
    const afterLift = noticesOf(sid).length
    writeFixtureFile(f, JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), remindedAt: Date.now() - 2 * 60_000 }))
    await H.wait(1200)
    cell("AC-30 б", first.length === 1 && /В-02/.test(first[0].message) && /В-03/.test(first[0].message) && /ждёт вас$/.test(first[0].title) && repeated === 2 && lifted?.state === "снято: владелец написал" && noticesOf(sid).length === afterLift, JSON.stringify([first.length, repeated, lifted?.state, afterLift, noticesOf(sid).length]))
  }
}
{
  // г: no question has a recommendation: a notice with the text of the rest
  const sid = await go([block({ n: "01", q: "Первый вопрос?", type: "implementation", rec: null }), "", block({ n: "02", q: "Второй вопрос?", type: "plan", rec: "—" })].join(NL), { settings: () => modes({ default: "recommendations" }), ready: (s) => hasN(s) })
  const nt = noticesOf(sid)
  cell("AC-30 г", recsOf(sid, "a").length === 0 && nt.length === 1 && /В-01/.test(nt[0].message) && /В-02/.test(nt[0].message) && /нет рекомендации/.test(nt[0].message), JSON.stringify([recsOf(sid), nt]))
  // д: modes on, no block-question: the old path (the "?" stands only in the value of a field: the old pass notifies, the parse does not)
  const d = await go(["Отчёт.", "Тип: plan", "Рекомендация: так записано в Каноне?"].join(NL), { settings: () => modes({ default: "recommendations" }), ready: (s) => hasN(s) })
  cell("AC-30 д", recsOf(d).length === 0 && noticesOf(d).length === 1 && /ждёт вас$/.test(noticesOf(d)[0].title) && /Каноне\?/.test(noticesOf(d)[0].message), JSON.stringify([recsOf(d), noticesOf(d)]))
  // е: a type with the mode owner in the key joins the rest
  const e = await go([block({ n: "01", q: "Первый вопрос?", type: "implementation" }), "", block({ n: "02", q: "Второй вопрос?", type: "plan" })].join(NL), { settings: () => modes({ implementation: "recommendations", plan: "owner" }), ready: (s) => hasA(s) && hasN(s) })
  cell("AC-30 е", recsOf(e, "a").length === 1 && noticesOf(e).length === 1 && /В-02/.test(noticesOf(e)[0].message) && /режим owner для типа/.test(noticesOf(e)[0].message), JSON.stringify([recsOf(e).map((r) => [r.kind, r.qn]), noticesOf(e)]))
  // ж: a mixed pack with a block of a question mark only
  const z = await go([block({ n: "01", q: "Первый вопрос?", type: "implementation" }), "", "В-02 Что дальше делаем?"].join(NL), { settings: () => modes({ default: "recommendations" }), ready: (s) => hasA(s) && hasN(s) })
  cell("AC-30 ж", recsOf(z, "a").length === 1 && noticesOf(z).length === 1 && /В-02/.test(noticesOf(z)[0].message) && /блок без полей/.test(noticesOf(z)[0].message), JSON.stringify([recsOf(z).map((r) => [r.kind, r.qn]), noticesOf(z)]))
  // з: a mixed pack of short blocks, the last question is seen by endsWithQuestion: exactly one notice, no old one
  const pk = [block({ n: "01", q: "Первый вопрос?", type: "implementation" }), "", "В-02 Второй вопрос без полей?"].join(NL)
  const zz = await go(pk, { settings: () => modes({ default: "recommendations" }), ready: (s) => hasN(s) })
  cell("AC-30 з", H.status.endsWithQuestion(pk) !== undefined && noticesOf(zz).length === 1 && /В-02/.test(noticesOf(zz)[0].message) && /блок без полей/.test(noticesOf(zz)[0].message), JSON.stringify([H.status.endsWithQuestion(pk), noticesOf(zz)]))
  // и: a block of the type, the permission and a recommendation but no "?" at the end of a line
  const i = await go(["В-01 Выбор формата", "Тип: implementation", "Рекомендация: json", "Автоответ: допустим"].join(NL), { settings: () => modes({ default: "recommendations" }), ready: (s) => hasN(s) })
  cell("AC-30 и", recsOf(i, "a").length === 0 && noticesOf(i).length === 1 && /нет «\?» в конце строки/.test(noticesOf(i)[0].message), JSON.stringify([recsOf(i), noticesOf(i)]))
  // к: a question in the text before the first identifier joins the rest and gets no answer
  const k = await go(["Сначала скажи, делаем ли мы это?", "", block({ n: "01", q: "Первый вопрос?", type: "implementation" })].join(NL), { settings: () => modes({ default: "recommendations" }), ready: (s) => hasA(s) && hasN(s) })
  cell("AC-30 к", recsOf(k, "a").length === 1 && recsOf(k, "a")[0].qn === 1 && noticesOf(k).length === 1 && /делаем ли мы это/.test(noticesOf(k)[0].message), JSON.stringify([recsOf(k).map((r) => [r.kind, r.qn]), noticesOf(k)]))
}

// ---- the task sessions (nudge): a session started by canopus_spawn ends a turn with a question -------------------------------
const AUTHOR = "sesAuthor1"
await H.open(AUTHOR)
await H.call('canopus_role', AUTHOR, { role: 'integrator' })
H.msg(AUTHOR, 'idle', { outcome: 'succeeded' })
const routeOf = sid => core.questionRouterFor({}).list().find(r => r.session === sid && r.channel === 'text')
const routedFact = sid => { const r = routeOf(sid); return r?.target === AUTHOR && r.status === 'routing' && !r.answer && recsOf(sid, 'a').length === 0 }
/** a task session: a card of a spawned task with its task and the obligation to the author; returns the ids */
const taskSession = (extra = {}, fields = {}) => {
  const sid = nextSid()
  const t = H.tasks.createTask({ project: "proj", title: "задача", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: AUTHOR, author_role: "proj.integrator", qid: `q-${sid}`, status: "running", kind: "spawn", directory: H.proj, executor: sid, ...fields })
  const now = Date.now()
  core.saveCard({ session: sid, role: "worker", auto: false, title: sid, directory: H.proj, repo: "proj", project: "proj", pid: process.pid, updated: now, task: { project: "proj", n: t.n }, spawned: { by: AUTHOR, task: "задача", tier: "light", status: "running", at: now - 60_000, qid: `q-${sid}` }, ...extra })
  core.addObligation(sid, { qid: `q-${sid}`, from_session: AUTHOR, from_role: "proj.integrator", at: now - 60_000, nudges: 0, task: undefined })
  return { sid, t }
}
const oblig = (sid) => core.obligationsOf(sid)
const toAuthor = () => H.letters(AUTHOR)
const forAuthor = (sid, re) => toAuthor().filter((l) => String(l.id).includes(sid) && re.test(String(l.id)))
// o.ready: what must have appeared (awaited as a condition, up to 60 s, after the pause; task 088)
const sessionTurn = async (sid, text, o = {}) => {
  const { ready, wait, ...rest } = o
  await H.turn(sid, text, { user: LETTER, ...rest })
  await H.wait(wait ?? 1300)
  if (ready) await H.until(() => ready(sid), 60_000)
}
const noWake = (sid) => H.letters(sid).filter((l) => /Не завершено/.test(l.text)).length === 0 && toAuthor().filter((l) => String(l.id).startsWith(`ask-${sid}`)).length === 0

{
  modes({ default: "recommendations" })
  const { sid, t } = taskSession()
  await sessionTurn(sid, [block({ type: "implementation" }), SEEN].join(NL), { ready: routedFact })
  const o = oblig(sid)[0]
  const t2 = H.tasks.loadTask("proj", t.n)
  cell("AC-10 ADR-0017 task: original fact routed, no fabricated Recommended/history, obligation preserved", routedFact(sid) && noWake(sid) && o.nudges === 0 && (o.empty ?? 0) === 0 && !o.stuck && o.qid === `q-${sid}` && routeOf(sid).task === t.n && !t2.history.some(h => /answer_mode/.test(h.note ?? '')) && toAuthor().some(l => l.text.includes(routeOf(sid).id)), JSON.stringify([routeOf(sid), oblig(sid)]))
}
{
  modes({ default: "recommendations" })
  const { sid } = taskSession()
  await sessionTurn(sid, PACK3, { ready: routedFact })
  const lt = lettersText(sid)
  const rest = forAuthor(sid, /^answer-rest-/)
  cell("AC-10 pack: no partial guessed autoanswer; original questions/gate retained for source/provenance", routedFact(sid) && routeOf(sid).text === PACK3 && /В-02/.test(routeOf(sid).text) && /Тип: gate/.test(routeOf(sid).text) && noWake(sid) && noticesOf(sid).length === 0 && !/answer_mode/.test(lt), JSON.stringify([routeOf(sid), noticesOf(sid)]))
  const id = rest[0]?.id
  await H.wait(1200)
  cell("AC-30 в durable route replay, not legacy partial-answer rest", routedFact(sid) && toAuthor().filter(l => l.id === `question-route-${routeOf(sid).id}-${routeOf(sid).epoch}`).length === 1 && noticesOf(sid).length === 0 && oblig(sid)[0].nudges === 0 && (oblig(sid)[0].empty ?? 0) === 0, JSON.stringify([routeOf(sid).id, oblig(sid)]))
}
{
  modes({ default: "recommendations" })
  const { sid } = taskSession()
  await sessionTurn(sid, ["В-01 Выбор формата", "Тип: implementation", "Рекомендация: json", "Автоответ: допустим"].join(NL), { ready: routedFact })
  const rest = forAuthor(sid, /^answer-rest-/)
  cell("AC-30 task block without question mark keeps original source, not guessed recommendation", routedFact(sid) && routeOf(sid).text.includes('В-01 Выбор формата') && routeOf(sid).sources === undefined, JSON.stringify(routeOf(sid)))
}
{
  modes({ default: "recommendations" })
  const { sid } = taskSession()
  const pk = [block({ n: "01", q: "Первый вопрос?", type: "implementation" }), "", "В-02 Второй вопрос без полей?"].join(NL)
  await sessionTurn(sid, pk, { ready: routedFact })
  cell("AC-30 short task pack retains every question with no duplicate legacy ask", routedFact(sid) && routeOf(sid).text === pk && toAuthor().filter((l) => String(l.id).startsWith(`ask-${sid}`)).length === 0 && noWake(sid), JSON.stringify(routeOf(sid)))
}
{
  // started by the owner's word: the answer comes before the condition !turn?.owner
  modes({ default: "recommendations" })
  const { sid } = taskSession()
  await sessionTurn(sid, [block({ type: "implementation" }), SEEN].join(NL), { user: "поехали", ready: routedFact })
  cell("AC-11 owner-started task is still routed; it is not permission to guess", routedFact(sid), JSON.stringify(routeOf(sid)))
}
{
  // review sessions and task-plan sessions
  modes({ default: "recommendations" })
  const rv = taskSession({ review: { project: "proj", n: 1 } })
  await sessionTurn(rv.sid, [block({ q: "Вливай?", type: "implementation", rec: "да" }), SEEN].join(NL))
  const rv2 = taskSession({ review: { project: "proj", n: 1 } })
  await sessionTurn(rv2.sid, [block({ q: "Задача готова, всё зелёное, закрываем?", type: "implementation", rec: "закрываем" }), SEEN].join(NL), { ready: routedFact })
  const pl = taskSession({}, { plan: { n: "7", file: "docs/plans/7-x.md", source: "s", rounds: [], clean: 0 } })
  await sessionTurn(pl.sid, [block({ q: "Согласовать план?", type: "requirements", rec: "да" }), SEEN].join(NL), { ready: routedFact })
  const ok = taskSession({}, { plan: { n: "8", file: "docs/plans/8-x.md", source: "s", rounds: [], clean: 0 } })
  await sessionTurn(ok.sid, [block({ q: "Как назвать раздел?", type: "requirements", rec: "Контекст" }), SEEN].join(NL), { ready: routedFact })
  // task 097: the acceptance session is NOT an exception any more (owner, 2026-10-19): a question without the words of the gates is answered, the words still rest
  cell("AC-05 review is no blanket owner exception; all task questions route with gates retained", [rv.sid, rv2.sid, pl.sid].every(routedFact) && routeOf(rv.sid).text.includes('Вливай?') && routeOf(pl.sid).text.includes('Согласовать план?'), JSON.stringify([routeOf(rv.sid), routeOf(rv2.sid), routeOf(pl.sid)]))
  cell("AC-05 д naming a section still needs a checked source, not Recommended", routedFact(ok.sid), JSON.stringify(routeOf(ok.sid)))
}

// ---- AC-16: the answer changes nothing of the task ---------------------------------------------------------------------
{
  modes({ default: "recommendations" })
  const snapOf = (t) => JSON.stringify({ status: t.status, rework: t.rework, syncs: t.syncs, plan: t.plan && { rounds: t.plan.rounds, clean: t.plan.clean, stuck: t.plan.stuck }, qid: t.qid, attempt: t.attempt })
  const a = taskSession({}, { status: "rework", rework: 2, syncs: 3 })
  const b = taskSession({}, { plan: { n: "9", file: "docs/plans/9-x.md", source: "s", rounds: [{ at: 1, found: 2 }], clean: 1, stuck: false } })
  const before = [snapOf(H.tasks.loadTask("proj", a.t.n)), snapOf(H.tasks.loadTask("proj", b.t.n))]
  await sessionTurn(a.sid, [block({ type: "implementation" }), SEEN].join(NL), { ready: routedFact })
  await sessionTurn(b.sid, [block({ type: "requirements", q: "Как назвать раздел?" }), SEEN].join(NL), { ready: routedFact })
  const after = [snapOf(H.tasks.loadTask("proj", a.t.n)), snapOf(H.tasks.loadTask("proj", b.t.n))]
  cell("AC-16 routing snapshot: no fabricated task answer or task/plan mutation", routedFact(a.sid) && routedFact(b.sid) && before.join() === after.join(), JSON.stringify([before, after]))
}

// ---- AC-15: the approval of plans is not touched by the modes ----------------------------------------------------------------
{
  modes({ default: "recommendations" })
  const t = H.tasks.createTask({ project: "proj", title: "план 11: проверка", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: AUTHOR, author_role: "proj.integrator", qid: "q-plan11", status: "approval", kind: "spawn", directory: H.proj, plan: { n: "11", file: "docs/plans/11-x.md", source: "s", rounds: [], clean: 2 } })
  cell('AC-15 default plan approver remains owner', H.cfg().planApprover === 'owner', H.cfg().planApprover)
  await H.until(() => H.notices().some((x) => /План 11 ждёт согласования/.test(x.title)), 60_000)
  const ownerPlanNotice = H.notices().some(x => /План 11 ждёт согласования/.test(x.title))
  if (!ownerPlanNotice) console.log('plan owner diagnostic:', readFileSync(path.join(H.tmp, 'opencode-plugins.log'), 'utf8').split('\n').filter(l => /applyApprovals|pass step|slow step/.test(l)).slice(-12).join('\n'), JSON.stringify({ windows: core.liveWindows(), task: H.tasks.loadTask('proj', t.n) }))
  const t1 = H.tasks.loadTask("proj", t.n)
  modes({ default: "recommendations" }, { plan_approver: "integrator" })
  const t2 = H.tasks.createTask({ project: "proj", title: "план 12: проверка", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: AUTHOR, author_role: "proj.integrator", qid: "q-plan12", status: "approval", kind: "spawn", directory: H.proj, plan: { n: "12", file: "docs/plans/12-x.md", source: "s", rounds: [], clean: 2 } })
  await H.until(() => toAuthor().some((l) => /^plan-approve-/.test(String(l.id))), 60_000)
  cell("AC-15 планы", ownerPlanNotice && t1.status === "approval" && !t1.plan.approval && toAuthor().some((l) => /^plan-approve-proj-\d+-12-|^plan-approve-proj-/.test(String(l.id))) && H.tasks.loadTask("proj", t2.n).status === "approval", JSON.stringify([ownerPlanNotice, H.notices().map((x) => x.title), toAuthor().map((l) => l.id), t1.status, t1.plan, H.cfg().planApprover]))
}

R.done(H)
