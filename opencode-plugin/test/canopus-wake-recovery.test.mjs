// Crash window 279: an old claim returns AFTER another completed batch replaced
// the latest receipt. It must not lose its original native ID/timestamp/proof.
import "./native-isolation.mjs"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-wake-recovery-"))
process.env.XDG_DATA_HOME = process.env.XDG_STATE_HOME = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(tmp, "absent.db"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("POLL_MS", "50")
const core = await import("../core.ts")
const { newWake, saveWake, readWakeForLetter, readWakeById } = await import("../wake-delivery.ts")
const { createCanopusPlugin } = await import("../index.ts")
const sid = "sesCRASH", at = Date.now() - 60_000
const card = { session: sid, role: "worker", directory: tmp, repo: "p", project: "p", pid: process.pid, updated: Date.now(), spawned: { by: "sesAUTHOR", task: "fixture", tier: "medium", status: "running", at } }
core.saveCard(card)
const letter = (id, time) => ({ id, from_role: "p.integrator", from_session: "sesAUTHOR", to: sid, text: id, time })
const first = newWake(sid, [letter("old-claim", at)], "original exact payload", at)
first.phase = "started"; first.startedAt = at + 1; first.proof = "previously verified exact input + new assistant"
saveWake(first)
const next = newWake(sid, [letter("next-claim", at + 10)], "next payload", at + 10)
next.phase = "started"; next.startedAt = at + 11; next.proof = "next verified generation"
saveWake(next) // latest receipt now belongs to the next batch
core.postLetter(sid, first.letters[0]) // recoverClaims returned the OLD unconfirmed claim
const acceptedSid = "sesACCEPTEDCRASH"
core.saveCard({ ...card, session: acceptedSid })
const admitted = newWake(acceptedSid, [{ ...letter("accepted-old", at), to: acceptedSid }], "accepted before confirm/restart", at)
admitted.phase = "accepted"; admitted.tries = 1; admitted.acceptedAt = at + 1
saveWake(admitted)
const replacement = newWake(acceptedSid, [{ ...letter("accepted-new", at + 10), to: acceptedSid }], "new completed payload", at + 10)
replacement.phase = "started"; replacement.startedAt = at + 11; replacement.proof = "new generation"
saveWake(replacement)
core.postLetter(acceptedSid, { ...admitted.letters[0], delivery_recovered: true })
let posts = 0
const info = { id: sid, location: { directory: tmp }, time: { created: at - 100, updated: at + 20, idle: at + 20 }, outcome: "succeeded" }
const timeline = [
  { id: `${admitted.id}_assistant`, type: "assistant", agent: "fixture", model: { providerID: "fixture", modelID: "fixture" }, content: [], time: { created: at + 2 } },
  { id: admitted.id, type: "user", text: admitted.text, time: { created: at + 1 } },
]
const get = async route => {
  if (route === "/api/info") return { pid: process.pid, version: "2.0.26" }
  if (route === "/api/session/active") return { data: {} }
  if (route.includes(`/message/${admitted.id}`)) return { data: timeline[1] }
  if (route.includes("/message?")) return { data: timeline, cursor: {} }
  return { data: { ...info, id: decodeURIComponent(route.split("/").at(-1)) } }
}
const ctx = { location: { directory: tmp }, session: { get: async () => info, hook: async () => {}, prompt: async input => { posts++; return { id: input.id, sessionID: sid, time: { created: at }, type: "user", payload: { text: first.text }, delivery: "queue" } } }, tool: { transform: async () => {} } }
const stop = await createCanopusPlugin({ get, spacingMs: 0 }).setup(ctx)
try {
  const end = Date.now() + 3000
  while (core.peekLetters([sid]).length && Date.now() < end) await new Promise(r => setTimeout(r, 20))
  assert.equal(posts, 0, "an admitted old batch must not issue another native POST after latest changed")
  assert.equal(core.peekLetters([sid]).length, 0, "the recovered old claim is acknowledged without phantom timeout")
  const recovered = readWakeForLetter(sid, "old-claim")
  assert.equal(recovered.state, "known")
  assert.equal(recovered.attempt.at, at, "restart/latest cannot re-date original admission")
  assert.equal(recovered.attempt.id, first.id, "restart/latest cannot invent a new native ID")
  assert.equal(recovered.attempt.text, first.text, "restart/latest cannot regroup original payload")
  assert.equal(readWakeById(sid, first.id).attempt.text, first.text, "exact input ID has durable outbound provenance")
  assert.equal(readWakeById("sesOTHER", first.id).state, "unknown", "another session cannot borrow outbound provenance")
  assert.equal(readWakeById(sid, "msg_missing").state, "none", "absence does not prove owner origin")
  const endAccepted = Date.now() + 3000
  while (readWakeForLetter(acceptedSid, "accepted-old").attempt?.phase !== "started" && Date.now() < endAccepted) await new Promise(r => setTimeout(r, 20))
  const oldAdmission = readWakeForLetter(acceptedSid, "accepted-old")
  assert.equal(posts, 0, "accepted-but-unconfirmed claim also cannot create another POST")
  assert.equal(oldAdmission.attempt.phase, "started", "proof of the historical accepted ID settles after restart/latest")
  assert.equal(oldAdmission.attempt.at, at)
  assert.equal(oldAdmission.attempt.text, admitted.text)
  assert.equal(oldAdmission.attempt.id, admitted.id)
  assert.equal(core.peekLetters([acceptedSid]).length, 0)
} finally { await stop(); rmSync(tmp, { recursive: true, force: true }) }
console.log("canopus-wake-recovery: 15 checks")
