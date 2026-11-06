// RED 279: an in-flight active snapshot begun before session info cannot serve
// as its later bracketing observation. Deterministic gates, no sleeps/network.
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-native-bracket-"))
process.env.XDG_DATA_HOME = process.env.XDG_STATE_HOME = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
const { nativeState, boundedNativeGet } = await import("../native-state.ts")
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const infoSeen = defer(), infoGate = defer(), oldSeen = defer(), oldGate = defer(), secondRead = defer()
let active = false, calls = 0, infoReturned = false
const sid = "sesBRACKET"
const raw = async route => {
  if (route === "/api/info") return { pid: process.pid, version: "2.0.26" }
  if (route === "/api/session/active") {
    const number = ++calls
    const snapshot = { data: active ? { [sid]: { type: "running" } } : {} }
    if (number === 2) { oldSeen.resolve(); await oldGate.promise }
    return snapshot
  }
  infoSeen.resolve(); await infoGate.promise; infoReturned = true
  return { data: { id: sid, time: { created: 1, updated: 2, idle: 2 }, outcome: "failed" } }
}
const bounded = boundedNativeGet(raw, Date.now, 0)
const get = route => { if (route === "/api/session/active" && infoReturned) secondRead.resolve(); return bounded(route) }
try {
  const a = nativeState(sid, 0, get)
  await infoSeen.promise
  const b = bounded("/api/session/active")
  await oldSeen.promise // B already captured the OLD empty snapshot
  active = true
  infoGate.resolve()
  await secondRead.promise
  oldGate.resolve()
  const observed = await a
  await b
  console.log(JSON.stringify({ actualActive: active, observedState: observed.state, activeApiCalls: calls }))
  assert.equal(observed.state, "active", "old in-flight snapshot must not produce false idle")
  assert.equal(calls, 3, "a fresh independent post-info active read is required")
} finally { infoGate.resolve(); oldGate.resolve(); rmSync(tmp, { recursive: true, force: true }) }
console.log("canopus-native-bracket: 2 checks")
