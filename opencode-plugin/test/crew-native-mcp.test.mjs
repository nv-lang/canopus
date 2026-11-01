// The real MCP tool entry defers role selection to the service, without spawning
// another process, reading registration or treating unknown as native idle.
import "./native-isolation.mjs"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-native-mcp-"))
process.env.XDG_DATA_HOME = process.env.XDG_STATE_HOME = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_POLL_MS = "50"
const core = await import("../core.ts")
const { createCrewPlugin } = await import("../index.ts")
const { tools } = await import("../mcp.ts")
const at = Date.now() - 1000
const card = (session, role, busy) => core.saveCard({ session, role, project: "p", repo: "p", directory: tmp, model: "fixture/haiku", pid: process.pid, updated: at, busy, ...(busy ? { busySince: at - 100 } : {}) })
card("sesMCPAUTHOR", "integrator", false)
card("sesMCPACTIVE", "activepair", false) // stale FREE card, real native active
card("sesMCPFREE", "activepair", false)
card("sesMCPSTALE", "idlepair", true) // stale BUSY card, real native idle
card("sesMCPUNKNOWN", "unknownpair", false)
const send = input => tools.find(t => t.name === "crew_send").execute(input, "sesMCPAUTHOR")
const active = await send({ to: "activepair", text: "choose real free foreground", tier: "light" })
const idle = await send({ to: "idlepair", text: "recover stale busy selection", tier: "light" })
const unknown = await send({ to: "unknownpair", text: "unknown cannot select", tier: "light" })
assert.match(active.content, /В очереди/, "MCP cannot choose cached idle card")
assert.match(idle.content, /В очереди/, "MCP cannot reject native idle from stale busy; delegates fresh selection")
assert.match(unknown.content, /В очереди/)
assert.equal(core.peekLetters(["sesMCPACTIVE", "sesMCPFREE", "sesMCPSTALE"]).length, 0, "MCP has not bound work to any stale candidate")
const posts = []
const get = async route => {
  if (route === "/api/info") return { pid: process.pid, version: "2.0.26" }
  if (route === "/api/session/active") return { data: { sesMCPACTIVE: { type: "running" } } }
  if (route.includes("/message")) return { data: [], cursor: {} }
  const id = decodeURIComponent(route.split("/").at(-1))
  return { data: id === "sesMCPUNKNOWN" ? { id } : { id, time: { created: at - 100, updated: at, idle: at } } }
}
const stop = await createCrewPlugin({ get, spacingMs: 0 }).setup({ location: { directory: tmp }, options: { projects: { p: tmp } }, session: {
  get: async ({ sessionID }) => ({ id: sessionID, location: { directory: tmp } }), hook: async () => {},
  prompt: async input => { posts.push(input); return { id: input.id, sessionID: input.sessionID, type: "user", payload: { text: input.text }, time: { created: Date.now() }, delivery: "queue" } },
}, tool: { transform: async () => {} } })
try {
  const end = Date.now() + 5000
  while (posts.length < 2 && Date.now() < end) await new Promise(r => setTimeout(r, 20))
  assert.ok(posts.some(p => p.sessionID === "sesMCPFREE" && p.text.includes("real free")), "fresh plugin choice skips native active despite cached free")
  assert.ok(posts.some(p => p.sessionID === "sesMCPSTALE" && p.text.includes("stale busy")), "fresh plugin choice reconciles native idle despite cached busy")
  assert.equal(core.readJson(core.cardFile("sesMCPSTALE")).busy, false)
  assert.equal(posts.some(p => ["sesMCPACTIVE", "sesMCPUNKNOWN"].includes(p.sessionID)), false)
} finally { await stop(); rmSync(tmp, { recursive: true, force: true }) }
console.log("crew-native-mcp: 8 checks; real MCP queue -> authoritative plugin selection, no process/watch")
