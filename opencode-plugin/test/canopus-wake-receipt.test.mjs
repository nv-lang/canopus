import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-wake-receipt-"))
process.env.XDG_DATA_HOME = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
process.env.XDG_STATE_HOME = tmp
const { advanceWake, newWake, wakeProof, wakeDiagnostic, WAKE_RETRY_MS, WAKE_DEADLINE_MS } = await import("../wake-delivery.ts")
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
// Late evidence may be older than the newest page; only native opaque cursors qualify.
{
 const attempt={...newWake(sid,letters,"old request",at),phase:"timeout",tries:1}
 const input={id:attempt.id,type:"user",text:attempt.text,time:{created:at}}
 const assistant={id:"msg_page_assistant",type:"assistant",agent:"fixture",model:{id:"fixture"},content:[],time:{created:at+5}}
 const compact={id:"msg_auto_compaction",type:"compaction",status:"completed",reason:"auto",summary:"fixture",time:{created:at+2}}
 let routes=[]
 const paged=async route=>{routes.push(route);if(route.includes("/message/"))return {data:input};if(route.includes("cursor="))return {data:[assistant,compact,input],cursor:{}};return {data:[{id:"msg_later_idle",type:"idle",time:{created:at+10}}],cursor:{next:"opaque+/="}}}
 assert.match(await wakeProof(attempt,idle,paged),/msg_page_assistant/)
 assert.ok(routes[2].includes("cursor=opaque%2B%2F%3D")&&!routes[2].includes("order="))
 cell("old input follows native cursor and completed automatic compaction without POST",()=>assert.equal(routes.length,3))
 const boundaryProofs=[]
 for(const boundary of [{...compact,status:"failed"},{...compact,reason:"manual"},{...compact,status:"running"},{id:"msg_other_user",type:"user",time:{created:at+3}},{id:"msg_early_idle",type:"idle",time:{created:at+3}}]){
  const proof=await wakeProof(attempt,idle,async route=>route.includes("/message/")?{data:input}:{data:[assistant,boundary,input]})
  boundaryProofs.push(proof)
 }
 cell("failed/manual/running compaction and intervening user or idle remain closed",()=>assert.deepEqual(boundaryProofs,Array(5).fill(undefined)))
 let pages=0
 const missing=async route=>{if(route.includes("/message/"))return {data:input};pages++;return {data:[{id:"msg_missing_"+pages,type:"system"}],cursor:{next:"cursor-"+pages}}}
 const boundedProof=await wakeProof(attempt,idle,missing)
 cell("missing historical input has a fixed twenty-page bound",()=>{assert.equal(boundedProof,undefined);assert.equal(pages,20)})
 pages=0
 const cycle=async route=>route.includes("/message/")?{data:input}:{data:[{id:"msg_cycle_"+(++pages),type:"system"}],cursor:{next:"repeated"}}
 const cycleProof=await wakeProof(attempt,idle,cycle)
 cell("repeated cursors cannot loop or fabricate proof",()=>{assert.equal(cycleProof,undefined);assert.equal(pages,2)})
}
{
 const attempt=newWake(sid,letters,"diagnose",at)
 const snapshots=[]
 const transport=Object.assign(new Error("SECRET_TOKEN private request body"),{name:"TypeError",code:"ECONNRESET"})
 const deps={state:idle,now:at,get:async()=>undefined,prompt:async()=>{throw transport},save:x=>snapshots.push(structuredClone(x))}
 await advanceWake(attempt,deps)
 await advanceWake(attempt,{...deps,now:at+WAKE_DEADLINE_MS})
 cell("transport facts survive timeout without persisting exception secrets",()=>{
  assert.equal(attempt.phase,"timeout");assert.equal(attempt.admission[0].errorCode,"ECONNRESET")
  assert.equal(attempt.admission[0].errorName,"TypeError")
  assert.ok(!JSON.stringify(attempt).includes("SECRET_TOKEN"))
  assert.match(wakeDiagnostic(attempt),/transport TypeError ECONNRESET/)
 })
 const unconfirmed=newWake(sid,letters,"diagnose",at)
 await advanceWake(unconfirmed,{...deps,prompt:async()=>({private:"SECRET_TOKEN"})})
 cell("schema mismatch records field names only",()=>{
  assert.equal(unconfirmed.admission[0].kind,"unconfirmed")
  assert.ok(unconfirmed.admission[0].mismatches.includes("id"))
  assert.ok(!JSON.stringify(unconfirmed).includes("SECRET_TOKEN"))
 })
 cell("historical attempts do not acquire invented transport facts",()=>assert.match(wakeDiagnostic({...newWake(sid,letters,"old",at),tries:1}),/причина транспорта неизвестна/))
}
console.log(`canopus-wake-receipt: ${checks} checks`)
rmSync(tmp, { recursive: true, force: true })
