// Regression 279: isolated V2 service, no live requests, prompts or sessions.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { allowNativeRegistry } from "./native-isolation.mjs"
import { DatabaseSync } from "node:sqlite"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-native-recovery-"))
process.env.XDG_DATA_HOME = tmp
process.env.CANOPUS_HOME = path.join(process.env.XDG_DATA_HOME, "opencode")
process.env.XDG_STATE_HOME = tmp
process.env.CANOPUS_DB = path.join(tmp, "native.db")
process.env.CANOPUS_POLL_MS = "50"
process.env.CANOPUS_STATUS_MS = "50"
mkdirSync(path.join(tmp, "opencode"), { recursive: true })
writeFileSync(path.join(tmp, "opencode", "service.json"), JSON.stringify({ url: "http://native.invalid", password: randomUUID() }))
allowNativeRegistry(path.join(tmp, "opencode", "service.json"))
const core = await import("../core.ts")
const { readNative } = await import("../native-state.ts")
const { readWake } = await import("../wake-delivery.ts")
const tasks = await import("../tasks.ts")
const iw = await import("../idle-watch.ts")
let fail = 0
const cell = (name, ok, detail = "") => { console.log(`${ok ? "ok" : "FAIL"} ${name}${ok ? "" : " :: " + detail}`); if (!ok) fail++ }
const wait = ms => new Promise(r => setTimeout(r, ms))
const until = async (condition, ms = 5000) => { const end = Date.now() + ms; while (!condition() && Date.now() < end) await wait(20) }
const start = Date.now() - 60_000
let active = {}
const projected = new Map()
const unknown = new Set()
const info = sessionID => ({ id: sessionID, location: { directory: tmp }, time: { created: start - 100, updated: start, idle: start }, outcome: "failed" })
const db = new DatabaseSync(process.env.CANOPUS_DB)
db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer, idle_outcome text); create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
db.prepare("insert into session_v2 values (?, ?, ?, null, null, ?, null, null, ?)").run("sesSTALE", tmp, "fixture", start, "failed")
db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run("msg_old_tool", "sesSTALE", "assistant", 1, start - 1000, start - 1000, JSON.stringify({ content: [{ type: "tool", name: "read", time: { created: start - 1000 }, state: { status: "running" } }] }))
const originalFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  const u = new URL(url)
  if (u.hostname !== "native.invalid") throw new Error("live request forbidden in regression")
  if (u.pathname === "/api/info") return Response.json({ version: "2.0.26", pid: process.pid })
  if (u.pathname === "/api/session/active") return Response.json({ data: active })
  if (u.pathname.endsWith("/inbox")) return Response.json({ data: [] })
  const segment = /^\/api\/session\/([^/]+)\/message(?:\/([^/]+))?$/.exec(u.pathname)
  if (segment) {
    const timeline = projected.get(segment[1]) ?? []
    if (!segment[2]) return Response.json({ data: timeline, cursor: {} })
    const message = timeline.find(m => m.id === segment[2])
    return message ? Response.json({ data: message }) : new Response("", { status: 404 })
  }
  if (unknown.has(u.pathname.split("/").at(-1))) return Response.json({ data: { schema: "unsupported" } })
  return Response.json({ data: info(u.pathname.split("/").at(-1)) })
}
const hooks = {}, tools = {}, events = {}, prompts = []
let interrupts = 0
const ctx = {
  location: { directory: tmp },
  session: {
    get: async ({ sessionID }) => info(sessionID),
    hook: async (name, cb) => { hooks[name] = cb },
    prompt: async input => { const at = Date.now(); prompts.push({ ...input, fixtureAt: at }); return { id: input.id ?? "msg_accepted", sessionID: input.sessionID, time: { created: at }, type: "user", payload: { text: input.text }, delivery: "queue" } },
    interrupt: async () => { interrupts++; return { interrupted: true } },
  },
  tool: { transform: async fn => fn({ add: t => { tools[t.name] = t } }) },
  events: { on: async (name, cb) => { events[name] = cb } },
}
const stop = await (await import("../index.ts")).default.setup(ctx)
try {
  const card = { session: "sesSTALE", role: "worker", directory: tmp, repo: "p", project: "p", pid: process.pid, updated: start, busy: true, busySince: start - 1000, spawned: { by: "sesAUTHOR", task: "fixture", tier: "medium", status: "running", at: start - 2000 } }
  cell("legacy transcript would still call the orphaned tool an open turn", await core.openTurn(card.session))
  core.saveCard(card)
  core.postLetter(card.session, { id: "stale-letter", from_role: "p.integrator", from_session: "sesAUTHOR", to: card.session, time: Date.now(), text: "isolated stale busy" })
  await until(() => prompts.some(p => p.sessionID === card.session))
  cell("stale spawned busy reconciles from native failed/idle without idle message", prompts.some(p => p.sessionID === card.session))
  const accepted = prompts.find(p => p.sessionID === card.session)
  cell("native admission request has a stable message ID", /^msg_/.test(accepted?.id ?? ""))
  cell("accepted input alone does not prove a started turn", !core.readJson(core.cardFile(card.session))?.wokeAt)

  await hooks.context({ sessionID: "sesAUTHOR", system: [] })
  await tools.canopus_role.execute({ role: "integrator" }, { sessionID: "sesAUTHOR" })
  const project = core.readJson(core.cardFile("sesAUTHOR")).project
  const t = tasks.createTask({ project, executor: card.session, author: "sesAUTHOR", author_role: `${project}.integrator`, directory: tmp, title: "корреляция", goal: "проверить", priority: "P2", tier: "medium", role: "worker", qid: "qSTUCK", status: "running", kind: "assign" })
  core.saveCard({ ...core.readJson(core.cardFile(card.session)), task: { project: t.project, n: t.n } })
  core.addObligation(card.session, { qid: t.qid, from_session: t.author, from_role: t.author_role, at: start, nudges: 3, empty: 3, stuck: true, stuckAt: start })
  const out = await tools.canopus_task.execute({ action: "push", n: t.n }, { sessionID: "sesAUTHOR" })
  cell("push reached its task", /Подталкивание|поставлен|разбужен|пробуждени/i.test(out.content), out.content)
  cell("push reports queued, not woken", !/разбужен/.test(out.content), out.content)
  cell("push does not clear stuck before correlated start", core.obligationsOf(card.session).find(o => o.qid === t.qid)?.stuck === true)
  const prove = input => projected.set(input.sessionID, [
    { id: `${input.id}_assistant`, type: "assistant", agent: "fixture", model: { providerID: "fixture", modelID: "fixture" }, content: [], time: { created: Date.now() } },
    { id: input.id, type: "user", text: input.text, time: { created: input.fixtureAt } },
  ])
  prove(accepted)
  await until(() => prompts.some(p => p.text.includes("Подталкивание")))
  const push = prompts.find(p => p.text.includes("Подталкивание"))
  cell("the queued push reaches a distinct durable native admission", !!push && push.id !== accepted.id)
  cell("accepted push still does not clear stuck", core.obligationsOf(card.session).find(o => o.qid === t.qid)?.stuck === true)
  if (push) prove(push)
  await until(() => core.obligationsOf(card.session).find(o => o.qid === t.qid)?.stuck === false)
  cell("only the matching new assistant clears push stuck", core.obligationsOf(card.session).find(o => o.qid === t.qid)?.stuck === false && readWake(card.session)?.id === push?.id && readWake(card.session)?.phase === "started")

  const add = (session, extra = {}) => { const c = { ...card, session, busy: false, busySince: undefined, ...extra }; core.saveCard(c); core.postLetter(session, { id: `waiting-${session}`, from_role: "p.integrator", from_session: "sesAUTHOR", to: session, time: Date.now(), text: `isolated ${session}` }); return c }
  active = { sesACTIVE: { type: "running" } }
  add("sesACTIVE", { pid: 1_000_000_001, busy: true, busySince: start + 1000 })
  await until(() => readNative("sesACTIVE")?.state === "active")
  cell("new native active beats old outcome/idle and absent old PID", !prompts.some(p => p.sessionID === "sesACTIVE") && core.readJson(core.cardFile("sesACTIVE"))?.busy === true)
  unknown.add("sesUNKNOWN"); add("sesUNKNOWN")
  await until(() => readNative("sesUNKNOWN")?.state === "unknown")
  cell("unsupported current schema keeps the letter queued", !prompts.some(p => p.sessionID === "sesUNKNOWN") && core.peekLetters(["sesUNKNOWN"]).length === 1)
   const { WATCHES, watchById } = await import("../watch.ts")
  mkdirSync(WATCHES, { recursive: true })
  writeFileSync(path.join(WATCHES, "live-command.json"), JSON.stringify({ id: "live-command", session: "sesCOMMAND", cwd: tmp, command: "fixture-only", status: "running", pid: process.pid, created: Date.now(), started: Date.now(), minutes: 120 }))
  core.saveCard({ ...card, session: "sesCOMMAND", busy: false, busySince: undefined })
  core.postLetter("sesCOMMAND", { id: "background-question", qid: "qBackground", from_role: "p.integrator", from_session: "sesAUTHOR", to: "sesCOMMAND", time: Date.now(), text: "рабочий вопрос во время независимого таймера" })
  await until(() => readNative("sesCOMMAND")?.source === "machine-watch")
  await until(() => prompts.some(p => p.sessionID === "sesCOMMAND"))
  const diagnostic = prompts.find(p => p.sessionID === "sesCOMMAND")
  cell("known native idle delivers a working question alongside an independent timer", !!diagnostic && diagnostic.text.includes("рабочий вопрос") && core.obligationsOf("sesCOMMAND").some(o => o.qid === "qBackground"))
  cell("communication neither cancels the background command nor frees its assignment reservation", watchById("live-command")?.status === "running" && !watchById("live-command")?.cancelled && readNative("sesCOMMAND")?.state === "active" && readNative("sesCOMMAND")?.nativeExecution === "idle")
  if (diagnostic) prove(diagnostic)
  await until(() => readWake("sesCOMMAND")?.phase === "started")
  await tools.canopus_send.execute({ to: "sesAUTHOR", reply_to: "qBackground", text: "ответ на рабочий вопрос; независимый таймер сохранён" }, { sessionID: "sesCOMMAND" })
  cell("the working qid can be answered before the background timer ends", !core.obligationsOf("sesCOMMAND").some(o => o.qid === "qBackground") && watchById("live-command")?.status === "running")
  core.saveCard({ ...core.readJson(core.cardFile("sesCOMMAND")), task: { project: t.project, n: t.n } })
  iw.noteStep({ n: t.n, hold: "HOLD", who: "владелец, 2026-11-01, тест legacy pause" }, { session: t.author, project: t.project }, { cfg: () => iw.DEFAULT_STEP, task: () => t, tasks: () => [t] }, Date.now())
  const heldAt = Date.now()
  core.postLetter("sesCOMMAND", { id: "paused-diagnostic", from_role: "canopus", from_session: "sesAUTHOR", to: "sesCOMMAND", time: heldAt, purpose: "diagnostic", text: "must remain queued under legacy execution pause" })
  await until(() => (readNative("sesCOMMAND")?.observedAt ?? 0) > heldAt)
  cell("diagnostic purpose never bypasses execution/legacy HOLD", prompts.filter(p => p.sessionID === "sesCOMMAND").length === 1 && core.peekLetters(["sesCOMMAND"]).some(l => l.id === "paused-diagnostic") && iw.executionHeld(iw.taskHold(t.project, t.n)))
  cell("no native active/tool/process was interrupted", interrupts === 0)

  const dir = path.join(tmp, "holds")
  const deps = { dir, cfg: () => iw.DEFAULT_STEP, task: () => t, tasks: () => [t] }
  iw.noteStep({ n: t.n, hold: "HOLD", who: "владелец, 2026-11-01, тест" }, { session: t.author, project: t.project }, deps, Date.now())
  const rows = iw.stepRows(Date.now(), { dir, taskOf: () => t })
  cell("legacy HOLD is explicitly unclassified, not silently migrated", rows.some(r => /legacy|неуточн/.test(r.text)), JSON.stringify(rows))
} finally {
  await stop?.()
  db.close()
  globalThis.fetch = originalFetch
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`canopus-native-recovery: ${fail} failed`)
process.exitCode = fail ? 1 : 0
