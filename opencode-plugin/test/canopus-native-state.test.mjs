import { getFixtureRuntime } from "./fixture-settings.mjs"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-native-state-"))
process.env.XDG_DATA_HOME = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
process.env.XDG_STATE_HOME = tmp
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(tmp, "fixture.db"))
const { nativeState, boundedNativeGet } = await import("../native-state.ts")
const sid = "sesFIXTURE"
const server = { version: "2.0.26", pid: process.pid }
const info = { id: sid, time: { created: 10, updated: 90, idle: 90 }, outcome: "failed" }
let checks = 0
const run = async (name, expected, overrides = {}, since = 80) => {
  let reads = 0
  const get = async route => {
    if (overrides.throw) throw new Error("unavailable")
    if (route === "/api/info") return overrides.server ?? server
    if (route === "/api/session/active") { reads++; return overrides.active?.(reads) ?? { data: {} } }
    return overrides.info ?? { data: info }
  }
  const fact = await nativeState(sid, since, get, () => 100)
  assert.equal(fact.state, expected, `${name}: ${JSON.stringify(fact)}`)
  checks++; console.log(`ok ${name}`)
}
await run("failed/idle newer than stale tool and card, no idle message required", "idle")
await run("old idle/outcome cannot beat new active generation", "active", { active: () => ({ data: { [sid]: { type: "running" } } }) })
await run("active appears between reads", "active", { active: n => ({ data: n === 1 ? {} : { [sid]: { type: "running" } } }) })
await run("newer local context than terminal remains unknown even with missing old PID", "unknown", {}, 95)
await run("transport outage is unknown", "unknown", { throw: true })
await run("unknown active schema is not an empty map", "unknown", { active: () => ({ sessions: [] }) })
await run("incomplete active response is unknown", "unknown", { active: () => ({ data: [] }) })
await run("wrong process ownership is unknown", "unknown", { server: { ...server, pid: process.pid + 100 } })
await run("unknown session info schema fails closed", "unknown", { info: { data: { id: sid, outcome: "failed" } } })
await run("historical idle may not clear a newer local busy", "unknown", { info: { data: { ...info, time: { ...info.time, idle: 70 } } } })
await run("session never executed can be authoritatively idle", "idle", { info: { data: { id: sid, time: { created: 10, updated: 10 } } } }, 0)
let transportCalls = 0, inFlight = 0, maxInFlight = 0, generation = 0
const bounded = boundedNativeGet(async route => {
  transportCalls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
  await new Promise(resolve => setImmediate(resolve))
  inFlight--
  return route === "/api/session/active" ? { data: generation ? { [sid]: { type: "running" } } : {} } : { data: route }
}, Date.now, 0)
await Promise.all(Array.from({ length: 20 }, () => bounded("/api/session/shared")))
assert.equal(transportCalls, 1); checks++; console.log("ok concurrent non-active reads coalesce without a transport storm")
await bounded("/api/session/active")
generation++
assert.ok((await bounded("/api/session/active")).data[sid]); assert.equal(transportCalls, 3); checks++; console.log("ok idle absence is never reused as a TTL proof")
await Promise.all(Array.from({ length: 12 }, (_, n) => bounded(`/api/session/ses${n}`)))
assert.ok(maxInFlight <= 2); checks++; console.log("ok native GET concurrency is bounded at two")
let tick = 0, tries = 0
const outage = boundedNativeGet(async () => { tries++; throw new Error("unavailable") }, () => tick, 0)
await outage("/api/session/active").catch(() => {})
await outage("/api/session/active").catch(() => {})
assert.equal(tries, 1); tick = 1001; await outage("/api/session/active").catch(() => {}); assert.equal(tries, 2); checks++; console.log("ok transport outage uses bounded backoff, not repeated GET spam")

// The shared legacy fixture itself must exhibit all three native states; it is
// not a test=>idle bypass and never reads a real service registration.
const core = await import("../core.ts")
core.saveCard({ session: sid, role: "worker", directory: tmp, updated: Date.now(), pid: process.pid })
const { nativeFixture } = await import("./fixture-plugin.mjs")
const fixture = nativeFixture({ session: { get: async () => ({ id: sid, location: { directory: tmp } }) } })
assert.equal((await nativeState(sid, 0, fixture.get)).state, "idle"); checks++; console.log("ok legacy fixture explicitly models a new idle session")
const db = new DatabaseSync(getFixtureRuntime("DB"))
db.exec("create table session_message (id text, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)")
db.prepare("insert into session_message values (?, ?, ?, ?, ?, ?, ?)").run("msg_active", sid, "assistant", 1, Date.now(), Date.now(), "{}")
assert.equal((await nativeState(sid, 0, fixture.get)).state, "active"); checks++; console.log("ok legacy fixture preserves newer active generations")
db.exec("drop table session_message")
assert.equal((await nativeState(sid, 0, fixture.get)).state, "unknown"); checks++; console.log("ok unavailable legacy fixture schema is unknown, never idle")
db.close()
console.log(`canopus-native-state: ${checks} checks`)
rmSync(tmp, { recursive: true, force: true })
