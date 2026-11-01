// A late native read must drain before an isolated fixture can remove its data.
import "./native-isolation.mjs"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-native-dispose-"))
process.env.XDG_DATA_HOME = process.env.XDG_STATE_HOME = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_POLL_MS = "50"
const core = await import("../core.ts")
const { createCrewPlugin } = await import("../index.ts")
const session = "sesDISPOSE", at = Date.now()
core.saveCard({ session, role: "worker", directory: tmp, pid: process.pid, updated: at, spawned: { by: "sesAUTHOR", task: "fixture", tier: "medium", status: "running", at } })
core.postLetter(session, { id: "dispose-letter", to: session, from_session: "sesAUTHOR", from_role: "p.integrator", text: "isolated", time: at })
let enter, release, posts = 0
const entered = new Promise(r => { enter = r })
const blocked = new Promise(r => { release = r })
const get = async route => {
  if (route === "/api/info") { enter(); await blocked; return { pid: process.pid, version: "2.0.26" } }
  if (route === "/api/session/active") return { data: {} }
  return { data: { id: session, time: { created: at, updated: at, idle: at } } }
}
const stop = await createCrewPlugin({ get, spacingMs: 0 }).setup({ location: { directory: tmp }, session: { get: async () => ({ id: session }), hook: async () => {}, prompt: async () => { posts++ } }, tool: { transform: async () => {} } })
await entered
let stopped = false
const drain = stop().then(() => { stopped = true })
await new Promise(r => setImmediate(r))
assert.equal(stopped, false, "disposer waits for the in-flight native read")
release()
await drain
assert.equal(posts, 0, "unloaded instance cannot POST when its old GET resolves")
rmSync(tmp, { recursive: true, force: true })
for (let n = 0; n < 3; n++) await new Promise(r => setImmediate(r))
assert.equal(existsSync(tmp), false, "no late pass recreates/deletes fixture data after await stop")
console.log("crew-native-dispose: 3 checks; cleanup after awaited drain, no sleep workaround")
