// Legacy integration fixtures now model the V2 native surface explicitly.
// Transport is injected into the REAL plugin; no service.json/credentials/live
// network is read. These tests model immediate admission AND execution; receipt
// regressions use their own accepted-without-start fixture instead.
import "./native-isolation.mjs"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createCrewPlugin } from "../index.ts"

export * from "../index.ts"
if (!process.env.XDG_DATA_HOME) throw new Error("fixture-plugin requires an isolated XDG_DATA_HOME")
// Explicit native ownership for legacy cases that deliberately have no message
// yet. A local card flag alone is NOT the production source of this fact.
export const fixtureNativeActive = new Set()
const fixtureSettlers = new WeakMap()
export const settleFixtureNative = (ctx, session) => fixtureSettlers.get(ctx)?.(session)

export function nativeFixture(ctx) {
  const projected = new Map(), ended = new Map(), admitted = new Map()
  fixtureSettlers.set(ctx, session => { fixtureNativeActive.delete(session); ended.set(session, Date.now()) })
  const file = process.env.CREW_HARNESS_DB
  const rows = session => {
    if (!file || !existsSync(file)) return { messages: [], known: true }
    let db
    try {
      db = new DatabaseSync(file, { readOnly: true })
      return { messages: db.prepare("select id, type, time_created, time_updated, seq, data from session_message where session_id = ? order by seq desc").all(session), known: true }
    } catch { return { messages: [], known: false } } finally { db?.close() }
  }
  const cardsDir = path.join(process.env.XDG_DATA_HOME, "opencode", "crew-harness", "cards")
  const windowsDir = path.join(process.env.XDG_DATA_HOME, "opencode", "crew-harness", "windows")
  const jsons = dir => !existsSync(dir) ? [] : readdirSync(dir).filter(f => f.endsWith(".json")).map(f => { try { return JSON.parse(readFileSync(path.join(dir, f), "utf8")) } catch { return undefined } }).filter(Boolean)
  const fact = session => {
    if (fixtureNativeActive.has(session)) return { active: true }
    const source = rows(session)
    if (!source.known) return { unknown: true }
    const messages = source.messages
    const idle = messages.find(m => m.type === "idle")
    const assistant = messages.find(m => ["assistant", "compaction"].includes(m.type))
    const syntheticEnd = ended.get(session) ?? 0
    const idleAt = Math.max(idle?.time_created ?? 0, syntheticEnd)
    if (assistant && assistant.time_created > idleAt) return { active: true, idleAt }
    if (!messages.length && jsons(windowsDir).some(w => (w.tabs ?? []).some(t => t.sessionID === session && t.busy))) return { active: true, idleAt }
    let outcome = "succeeded"
    try { outcome = JSON.parse(idle?.data ?? "{}")?.outcome ?? outcome } catch {}
    // No native request is made by a legacy test's registration-only hook.
    return { active: false, idleAt: idleAt || Date.now(), outcome }
  }
  const get = async route => {
    const url = new URL(route, "http://fixture.invalid")
    if (url.pathname === "/api/info") return { version: "2.0.26", pid: process.pid }
    if (url.pathname === "/api/session/active") {
      const sessions = new Set([...jsons(cardsDir).map(c => c.session), ...admitted.keys()])
      return { data: Object.fromEntries([...sessions].filter(s => fact(s).active).map(s => [s, { type: "running" }])) }
    }
    const match = /^\/api\/session\/([^/]+)(.*)$/.exec(url.pathname)
    if (!match) throw new Error(`unsupported isolated native route: ${route}`)
    const session = decodeURIComponent(match[1]), tail = match[2]
    if (tail.startsWith("/message/")) return { data: projected.get(session)?.find(m => m.id === decodeURIComponent(tail.slice(9))) }
    if (tail === "/message") return { data: projected.get(session) ?? [], cursor: {} }
    if (tail === "/inbox") return { data: [] }
    const info = await ctx.session.get({ sessionID: session })
    const value = info?.data ?? info
    if (!value) return undefined
    const state = fact(session)
    if (state.unknown) return { data: { id: session } } // schema/DB uncertainty is not idle
    return { data: { ...value, id: session, time: { created: 1, updated: state.idleAt || Date.now(), ...(state.idleAt ? { idle: state.idleAt } : {}) }, outcome: state.outcome } }
  }
  const prompt = async input => {
    if (!input.id) return ctx.session.prompt(input)
    if (admitted.get(input.sessionID)?.has(input.id)) return admitted.get(input.sessionID).get(input.id)
    await ctx.session.prompt(input)
    const at = Date.now()
    const item = { id: input.id, sessionID: input.sessionID, time: { created: at }, type: "user", payload: { text: input.text }, delivery: "queue" }
    if (!admitted.has(input.sessionID)) admitted.set(input.sessionID, new Map())
    admitted.get(input.sessionID).set(input.id, item)
    if (input.resume === false) return item // quiet queued input does NOT start a generation
    const timeline = projected.get(input.sessionID) ?? []
    timeline.unshift({ id: `${input.id}_assistant`, type: "assistant", time: { created: at }, agent: "fixture", model: { providerID: "fixture", modelID: "fixture" }, content: [] }, { id: input.id, type: "user", text: input.text, time: { created: at } })
    projected.set(input.sessionID, timeline)
    return item
  }
  const synthetic = typeof ctx.session.synthetic === "function" ? async input => {
    if (input.id && admitted.get(input.sessionID)?.has(input.id)) return admitted.get(input.sessionID).get(input.id)
    const r = await ctx.session.synthetic(input)
    if (!input.id) return r
    const item = { id: input.id, sessionID: input.sessionID, time: { created: Date.now() }, type: "synthetic", payload: { text: input.text }, delivery: input.delivery ?? "queue" }
    if (!admitted.has(input.sessionID)) admitted.set(input.sessionID, new Map())
    admitted.get(input.sessionID).set(input.id, item)
    return item
  } : undefined
  // Legacy form-answer fixtures model successful interruption AND immediate
  // terminal settlement. Negative cleanup/active cases use explicit fixtures.
  const interrupt = typeof ctx.session.interrupt === "function" ? async input => {
    const result = await ctx.session.interrupt(input)
    if ((result?.data?.interrupted ?? result?.interrupted) === true) ended.set(input.sessionID, Date.now())
    return result
  } : undefined
  return { get, ctx: { ...ctx, session: { ...ctx.session, prompt, ...(synthetic ? { synthetic } : {}), ...(interrupt ? { interrupt } : {}) } } }
}
export default { async setup(ctx) {
  const fixture = nativeFixture(ctx)
  return createCrewPlugin({ get: fixture.get, spacingMs: 0 }).setup(fixture.ctx)
} }
