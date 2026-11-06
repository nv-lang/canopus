import assert from "node:assert/strict"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { taskTestHome, taskOwnerIO } from "./task-owner-harness.mjs"
const home = taskTestHome("canopus-owner-plugin-")
const root = path.join(home, "repo"), caller = "ses_ui_integrator", project = "sample"
mkdirSync(path.join(root, ".canopus/plugin"), { recursive: true }); writeFileSync(path.join(root, ".canopus/plugin/config.json"), JSON.stringify({ tasks_dir: "" }))
mkdirSync(path.join(process.env.CANOPUS_HOME, "plugin"), { recursive: true }); writeFileSync(path.join(process.env.CANOPUS_HOME, "plugin/config.json"), JSON.stringify({ project_settings: [{ project, root }] }))
const git = (...args) => execFileSync("git", ["-C", root, ...args], { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
git("init", "-q", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.com"); git("add", "--", ".canopus/plugin/config.json"); git("commit", "-qm", "fixture")
const core = await import("../core.ts"), tasks = await import("../tasks.ts"), forms = await import("../form-wait.ts")
const { createCanopusPlugin } = await import("../index.ts"), { nativeFixture } = await import("./fixture-plugin.mjs")
const owner = taskOwnerIO(), hooks = {}, tools = new Map(), events = {}, prompts = [], created = []
const ctx = { location: { directory: root }, options: {}, session: {
 get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: root }, time: {} }),
 create: async req => { created.push(req); return { id: req.id } }, update: async () => {},
 prompt: async req => { prompts.push(req); return {} }, synthetic: async () => ({}), hook: async (name, fn) => { hooks[name] = fn },
}, tool: { transform: async fn => fn({ add: t => tools.set(t.name, t) }) }, events: { on: async (name, fn) => { events[name] = fn } } }
const fixture = nativeFixture(ctx)
let stop, heart
const until = async fn => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 50)) } throw Error("owner plugin continuation timeout") }
try {
 stop = await createCanopusPlugin({ get: fixture.get, spacingMs: 0, taskConfirmationIO: owner.io }).setup(fixture.ctx)
 mkdirSync(core.WINDOWS, { recursive: true }); const beat = () => writeFileSync(path.join(core.WINDOWS, "795001.json"), JSON.stringify({ pid: 795001, beat: Date.now(), tabs: [{ sessionID: caller, active: true, busy: false }] })); beat(); heart = setInterval(beat, 150)
 await hooks.context({ sessionID: caller, system: [], model: { id: "light", providerID: "fixture" } })
 await tools.get("canopus_role").execute({ role: "integrator" }, { sessionID: caller })
 const input = { title: "One click creation", goal: "Create one task after a native owner click", criteria: "fixture green", model: "fixture/light", creation_reason: "separate UI workflow", checked_tasks: [], why_new: "no matching task" }
 const pending = await tools.get("canopus_spawn").execute(input, { sessionID: caller })
 assert.match(pending.content, /подтверждени/); assert.equal(tasks.listTasks(project).length, 0); assert.equal(created.length, 0)
 const form = [...owner.forms.values()][0]; forms.handleFormEvent({ type: "form.created", data: { form } }); assert.equal(forms.pendingForms(caller).length, 0, "owner operation never becomes a recommendation question")
 owner.confirm(form.id) // The single UI action. No further canopus_spawn or approval ID call.
 await until(() => tasks.listTasks(project).length === 1 && tasks.listTasks(project)[0].status === "running")
 const t = tasks.listTasks(project)[0]; assert.equal(created.length, 1)
 const pause = await tools.get("canopus_task").execute({ action: "pause", n: t.n, text: "owner needs a temporary stop" }, { sessionID: caller }); assert.match(pause.content, /подтверждени/)
 const pauseForm = [...owner.forms.values()].filter(f => f.title.includes("паузу")).at(-1); owner.confirm(pauseForm.id)
 await until(() => tasks.loadTask(project, t.n).status === "paused")
 const before = prompts.filter(p => p.sessionID === t.executor).length
 core.postLetter(t.executor, { id: "fixture-paused-wake", from_role: "sample.integrator", from_session: caller, to: t.executor, time: Date.now(), text: "this queued message must not wake a paused task" })
 await new Promise(resolve => setTimeout(resolve, 2300))
 assert.equal(tasks.loadTask(project, t.n).status, "paused"); assert.equal(prompts.filter(p => p.sessionID === t.executor).length, before)
 assert.equal(created.length, 1, "pause never creates another task or executor")
 console.log("owner plugin: native owner click completes backend workflow once; pause completes after one click and blocks wake delivery")
} finally { clearInterval(heart); await stop?.(); rmSync(home, { recursive: true, force: true }) }
