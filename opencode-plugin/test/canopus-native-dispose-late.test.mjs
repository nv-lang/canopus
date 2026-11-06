// A service RPC may never settle. Unload cancels this INSTANCE'S wait, not the
// remote operation; a late RPC result must never resume plugin filesystem work.
import "./native-isolation.mjs"
import assert from "node:assert/strict"
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "canopus-dispose-late-"))
process.env.XDG_DATA_HOME = process.env.XDG_STATE_HOME = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(tmp, "absent.db"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("POLL_MS", "50")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("STEP_MS", "100")
const { createCanopusPlugin } = await import("../index.ts")
const tasks = await import("../tasks.ts")
const task = tasks.createTask({ project: "p", title: "late create", goal: "isolated", criteria: "no late I/O", priority: "P2", tier: "light", role: "worker", model: "fixture/haiku", author: "sesAUTHOR", author_role: "p.integrator", qid: "qLATE", status: "starting", kind: "spawn", directory: tmp })
let enter, release, creates = 0, prompts = 0
const entered = new Promise(r => { enter = r })
const neverUntilExplicitRelease = new Promise(r => { release = r })
const get = async route => route === "/api/info" ? { pid: process.pid, version: "2.0.26" } : route === "/api/session/active" ? { data: {} } : { data: { id: route.split("/").at(-1), time: { created: 1, updated: Date.now(), idle: Date.now() } } }
const ctx = { location: { directory: tmp }, options: { projects: { p: tmp } }, session: { get: async ({ sessionID }) => ({ id: sessionID, location: { directory: tmp } }), create: () => { creates++; enter(); return neverUntilExplicitRelease }, hook: async () => {}, prompt: async () => { prompts++ } }, tool: { transform: async () => {} } }
;(await import("./fixture-settings.mjs")).prepareFixturePluginContext(await import("../core.ts"),ctx)
const stop=await createCanopusPlugin({get,spacingMs:0}).setup(ctx)
await entered
const drain = stop()
let deadline
const originals = new Map(), lateIO = []
try {
  await Promise.race([drain, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("dispose waits forever for an externally pending session.create")), 1000) })])
  clearTimeout(deadline)
  assert.equal(tasks.loadTask("p", task.n).status, "starting", "unload is not a successful or failed remote create receipt")
  fs.rmSync(tmp, { recursive: true, force: true })
  for (const name of ["readFileSync", "writeFileSync", "appendFileSync", "mkdirSync", "renameSync", "rmSync"]) {
    const original = fs[name]
    originals.set(name, original)
    fs[name] = function (...args) {
      if (args.slice(0, name === "renameSync" ? 2 : 1).some(arg => String(arg).toLowerCase().startsWith(tmp.toLowerCase()))) lateIO.push(name)
      return Reflect.apply(original, this, args)
    }
  }
  syncBuiltinESMExports()
  release({ id: "sesLATE" }) // the old service operation finishes AFTER await stop/cleanup
  for (let n = 0; n < 8; n++) await new Promise(r => setImmediate(r))
  assert.deepEqual(lateIO, [], "late old RPC resolution performs no plugin I/O after unload")
  assert.equal(fs.existsSync(tmp), false, "old continuation cannot recreate fixture directories/cards")
  assert.equal(creates, 1, "late resolution cannot issue another session.create")
  assert.equal(prompts, 0, "late resolution cannot prompt the newly accepted remote session")
} finally {
  clearTimeout(deadline)
  for (const [name, original] of originals) fs[name] = original
  syncBuiltinESMExports()
  release({ id: "sesLATE" })
  await drain
  fs.rmSync(tmp, { recursive: true, force: true })
}
// Queue entries and real native HTTP fetch signals are actually aborted; this
// is not just abandoning an arbitrary Promise while queued I/O starts later.
const { boundedNativeGet, nativeGet } = await import("../native-state.ts")
const controller = new AbortController(), started = []
let fresh = false
const transport = boundedNativeGet((route, signal) => {
  started.push(route)
  if (fresh) return Promise.resolve("fresh")
  return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
}, Date.now, 0)
const requests = ["one", "two", "queued"].map(name => transport(`/fixture/${name}`, controller.signal))
controller.abort()
const cancelled = await Promise.allSettled(requests)
assert.ok(cancelled.every(result => result.status === "rejected"), "all owned native queue waits settle on abort")
assert.equal(started.length, 2, "the cancelled queued GET never starts after unload")
fresh = true
assert.equal(await transport("/fixture/fresh"), "fresh", "aborted owners neither poison backoff nor leak transport slots")
let httpAborted = false
const httpController = new AbortController()
const http = nativeGet({ url: "http://fixture.invalid", password: randomUUID() }, async (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => { httpAborted = true; reject(init.signal.reason) }, { once: true })))
const request = http("/api/info", httpController.signal)
httpController.abort()
const outcome = await request.catch(error => error)
assert.equal(httpAborted, true, "native HTTP fetch receives the instance's actual abort signal")
assert.equal(outcome.name, "AbortError")
const { pluginLifetime } = await import("../plugin-lifetime.ts")
const owner = pluginLifetime()
let rejectLate
const external = new Promise((_, reject) => { rejectLate = reject })
const owned = owner.call(() => external).catch(error => error.name)
await Promise.resolve() // the operation has actually begun before cancellation
owner.close()
assert.equal(await owned, "AbortError")
rejectLate(new Error("late remote failure"))
for (let n = 0; n < 3; n++) await new Promise(r => setImmediate(r)) // unhandled rejection is NOT suppressed
console.log("canopus-native-dispose-late: 11 checks; bounded unload, late result no I/O, queue/fetch actually aborted")
