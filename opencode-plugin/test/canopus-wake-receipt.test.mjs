import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-wake-receipt-"))
process.env.XDG_DATA_HOME = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
process.env.XDG_STATE_HOME = tmp
const { advanceWake, newWake, WAKE_RETRY_MS, WAKE_DEADLINE_MS } = await import("../wake-delivery.ts")
const sid = "sesFIXTURE"
const at = 1000
const letters = [{ id: "letter-1", text: "diagnose", time: at, from_session: "sesAUTHOR", from_role: "p.integrator", to: sid, wake_qid: "qFIXTURE" }]
const idle = { state: "idle", source: "native-api", observedAt: at, idleAt: at - 100, outcome: "failed", why: "fixture" }
const active = { ...idle, state: "active" }
let checks = 0
const cell = (name, fn) => { fn(); checks++; console.log(`ok ${name}`) }
let a = newWake(sid, letters, "diagnose", at)
let calls = [], saves = [], projected, timeline = []
const get = async route => route.includes("/message/") ? { data: projected } : { data: timeline, cursor: {} }
const prompt = async input => { calls.push(input); return { id: input.id, sessionID: sid, type: "user", time: { created: at }, payload: { text: input.text }, delivery: "queue" } }
const step = (now, state = idle, post = prompt, send = true) => advanceWake(a, { state: { ...state, observedAt: now }, now, get, prompt: post, send, save: value => saves.push(structuredClone(value)) })
await step(at)
cell("200 is admission, not start", () => { assert.equal(a.phase, "accepted"); assert.equal(a.startedAt, undefined); assert.equal(calls.length, 1) })
cell("write-ahead sending record precedes admission", () => assert.equal(saves[0].phase, "sending"))
await step(at + 1, active)
cell("old active drain and old failed outcome do not prove start", () => assert.equal(a.phase, "accepted"))
projected = { id: "msg_other", type: "user", text: a.text, time: { created: at + 1 }, metadata: { canopusWake: a.id } }
await step(at + 2, active)
cell("metadata updated/unrelated input is not correlation", () => assert.equal(a.phase, "accepted"))
projected = { id: a.id, type: "user", text: a.text, time: { created: at - 1 } }
await step(at + 3, active)
cell("previous projected input timestamp is not a new start", () => assert.equal(a.phase, "accepted"))
projected.time.created = at
await step(at + 4, { ...active, source: "machine-watch" })
cell("a machine command is not native wake proof", () => assert.equal(a.phase, "accepted"))
await step(at + 5, active)
cell("promotion plus an already active drain is NOT a new generation", () => assert.equal(a.phase, "accepted"))
timeline = [{ id: "msg_new_generation", type: "assistant", agent: "fixture", model: { providerID: "fixture", modelID: "fixture" }, content: [], time: { created: at + 5 } }, projected]
await step(at + 6, active)
cell("only a new assistant in the exact input segment confirms start", () => assert.equal(a.phase, "started"))
await step(at + WAKE_RETRY_MS)
cell("started attempt never retries", () => assert.equal(calls.length, 1))

a = newWake(sid, letters, "diagnose", at); calls = []; projected = undefined
const ambiguous = async input => { calls.push(input); throw new Error("connection lost after commit") }
await step(at, idle, ambiguous)
await step(at + WAKE_RETRY_MS, idle, ambiguous)
await step(at + 2 * WAKE_RETRY_MS, idle, ambiguous)
await step(at + 3 * WAKE_RETRY_MS, idle, ambiguous)
cell("ambiguous acceptance retries at most three times with identical ID/payload", () => { assert.equal(calls.length, 3); assert.equal(new Set(calls.map(x => JSON.stringify(x))).size, 1) })
await step(at + WAKE_DEADLINE_MS)
cell("unconfirmed attempt times out without a fabricated start", () => { assert.equal(a.phase, "timeout"); assert.equal(a.startedAt, undefined) })
await step(at + 2 * WAKE_DEADLINE_MS)
cell("deadline is terminal, no infinite resume", () => assert.equal(calls.length, 3))
projected = { id: a.id, type: "user", text: a.text, time: { created: at } }
timeline = [{ id: "msg_late_generation", type: "assistant", agent: "fixture", model: { providerID: "fixture", modelID: "fixture" }, content: [], time: { created: at + WAKE_DEADLINE_MS + 1 } }, projected]
await step(at + 2 * WAKE_DEADLINE_MS + 1)
cell("late correlated proof settles timeout without another POST", () => { assert.equal(a.phase, "started"); assert.equal(calls.length, 3) })

a = newWake(sid, letters, "diagnose", at); projected = undefined; calls = []
await step(at)
projected = { id: a.id, type: "user", text: a.text, time: { created: at } }
timeline = [{ id: "msg_assistant", type: "assistant", agent: "fixture", model: { providerID: "fixture", modelID: "fixture" }, content: [], time: { created: at + 2 } }, projected]
await step(at + 10)
cell("completed new assistant after matching input also proves start", () => assert.equal(a.phase, "started"))
a = newWake(sid, letters, "diagnose", at); projected = undefined; calls = []
await step(at, idle, async () => { throw Object.assign(new Error("not found"), { status: 404 }) })
cell("definite native error is separate from timeout", () => assert.equal(a.phase, "error"))
a = newWake(sid, letters, "diagnose", at); calls = []
await step(at, { ...idle, state: "unknown" })
await step(at + 1, idle, prompt, false)
cell("unknown and execution pause never send", () => assert.equal(calls.length, 0))
a = { ...newWake(sid, letters, "quiet", at), mode: "quiet-synthetic" }; calls = []; projected = undefined
await step(at, idle, async input => { calls.push(input); return { id: input.id, sessionID: sid, type: "synthetic", time: { created: at }, delivery: "queue", payload: { text: input.text } } })
cell("quiet admission completes without inventing a wake or assistant", () => { assert.equal(a.phase, "accepted"); assert.equal(a.startedAt, undefined); assert.equal(calls.length, 1) })
console.log(`canopus-wake-receipt: ${checks} checks`)
rmSync(tmp, { recursive: true, force: true })
