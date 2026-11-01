// 281: the coordination entry from index.ts is EXECUTABLE, not only a manual coordinateTick call (integrator,
// 2026-11-01 23:03): the real plugin's pass loop runs coordWatch, which drives a task marked by crew_task drive —
// one durable start letter to the executor through the real mailbox adapter, never a second POST on later passes.
//   node test/crew-coordinate-boot.test.mjs   (node >= 24)
import "./native-isolation.mjs"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readdirSync, existsSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-coordinate-boot-"))
process.env.XDG_DATA_HOME = process.env.XDG_STATE_HOME = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_POLL_MS = "50"
process.env.CREW_HARNESS_COORD_MS = "1"

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const coord = await import("../coordinate.ts")
const { createCrewPlugin } = await import("../index.ts")

const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({}))

const WORKER = "sesBOOTWORKER"
const AUTH = "sesBOOTINTEG"
core.saveCard({ session: WORKER, role: "worker", auto: false, title: WORKER, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
core.saveCard({ session: AUTH, role: "integrator", auto: false, title: AUTH, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
const t = tasks.createTask({ project: "proj", title: "boot drive", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: AUTH, author_role: "proj.integrator", qid: "q-boot-drive", status: "running", kind: "assign", directory: proj, executor: WORKER })
const started = coord.startDrive(t, "crew-normal-task@1", AUTH)
assert.equal(started.ok, true, "the drive attaches before the plugin boots")
tasks.saveTask(t)

const info = { id: WORKER, location: { directory: proj }, time: { created: 1, updated: Date.now(), idle: Date.now() }, outcome: "succeeded" }
const get = async (route) => {
  if (route === "/api/info") return { pid: process.pid, version: "2.0.26" }
  if (route === "/api/session/active") return { data: {} }
  if (route.includes("/message")) return { data: [], cursor: {} }
  return { data: { ...info, id: decodeURIComponent(route.split("/").at(-1)) } }
}
const ctx = { location: { directory: proj }, session: { get: async () => info, hook: async () => {}, prompt: async (input) => ({ id: input.id, sessionID: input.sessionID, time: { created: Date.now() }, type: "user", payload: { text: input.text }, delivery: "queue" }) }, tool: { transform: async () => {} } }
const stop = await createCrewPlugin({ get, spacingMs: 0 }).setup(ctx)
const letters = (to) => {
  const dir = path.join(core.INBOX, core.safeKey(to))
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []
}
try {
  const end = Date.now() + 5000
  while (!letters(WORKER).some((f) => f.includes("s-work-start") || f.includes("drive")) && Date.now() < end) await new Promise((r) => setTimeout(r, 25))
  const d = coord.loadDrive("proj", t.n)
  const step = d?.steps.find((s) => s.id === "s:work:start")
  assert.equal(step?.state, "done", "coordWatch inside the real pass loop executed the first drive step")
  assert.ok(step?.receipt && core.letterExistsFor(WORKER, step.receipt), "the start letter receipt is durable in the real mailbox")
  const count = letters(WORKER).length
  await new Promise((r) => setTimeout(r, 400)) // many passes at COORD_MS=1: no second POST
  assert.equal(letters(WORKER).length, count, "later passes post nothing again")
  assert.equal(tasks.loadTask("proj", t.n).status, "running", "enqueue is not received/started: the task record is untouched")
  console.log("crew-coordinate-boot: 4 checks")
} finally {
  await stop()
  coord.resetCoordinateTick()
  rmSync(tmp, { recursive: true, force: true })
}
