import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import {pathToFileURL} from "node:url"
export const taskTestConfig = root => path.join(root, "instance", "plugin", "config.json")
export async function taskTestHome(prefix = "canopus-owner-") {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix)), instance = path.join(root, "instance")
  process.env.XDG_DATA_HOME = path.join(root, "opencode-host")
  process.env.XDG_STATE_HOME = path.join(root, "state")
  await (await import("./test-home.mjs")).configureTestHome(instance)
  ;(await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(root, "absent.db"))
  // Real child processes must select this same instance before their static core imports.
  const bootstrap = path.join(root, "owner-instance-bootstrap.mjs")
  writeFileSync(bootstrap, `await (await import(${JSON.stringify(new URL("./test-home.mjs", import.meta.url).href)})).configureTestHome(${JSON.stringify(instance)});(await import(${JSON.stringify(new URL("./fixture-settings.mjs", import.meta.url).href)})).setFixtureRuntime('DB',${JSON.stringify(path.join(root,"absent.db"))});`)
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --import ${pathToFileURL(bootstrap).href}`
  return root
}
export function taskOwnerIO() {
  const forms = new Map(), calls = []
  let failCancel = false, idle = true, unknownCreate = false
  const io = {
    async owner() { return "owned" },
    async create(session, form) { calls.push(["create", session, form.id]); if (unknownCreate) throw Error("transport unknown"); if (forms.has(form.id)) throw Error("native conflict"); forms.set(form.id, { ...structuredClone(form), sessionID: session, state: { status: "pending" } }) },
    async get(session, id) { calls.push(["get", session, id]); const f = forms.get(id); if (!f) throw Object.assign(Error("missing"), { missingForm: id }); if (f.sessionID !== session) throw Error("wrong session"); return { data: structuredClone(f) } },
    async list(session) { return { data: [...forms.values()].filter(f => f.sessionID === session).map(f => ({ id: f.id, sessionID: session })) } },
    async cancel(session, id) { calls.push(["cancel", session, id]); if (failCancel) throw Error("transport failure"); const f = forms.get(id); if (f.sessionID !== session) throw Error("wrong session"); f.state = { status: "cancelled", message: "task operation" } },
    async interrupt(session) { calls.push(["interrupt", session]) },
    async idle(session) { calls.push(["idle", session]); return idle },
  }
  return { io, forms, calls, confirm(id) { forms.get(id).state = { status: "answered", answer: { decision: "confirm" } } }, decline(id) { forms.get(id).state = { status: "answered", answer: { decision: "decline" } } }, failCancel(value) { failCancel = value }, idle(value) { idle = value }, unknownCreate(value) { unknownCreate = value } }
}
