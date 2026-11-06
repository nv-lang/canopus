import assert from "node:assert/strict"
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { taskTestHome, taskOwnerIO } from "./task-owner-harness.mjs"
const home = taskTestHome("canopus-owner-flow-")
const root = path.join(home, "repo"); mkdirSync(path.join(root, ".canopus", "plugin"), { recursive: true })
writeFileSync(path.join(root, ".canopus", "plugin", "config.json"), JSON.stringify({ tasks_dir: "" }))
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim()
git("init", "-q", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.com"); git("add", "--", ".canopus/plugin/config.json"); git("commit", "-qm", "fixture")
const core = await import("../core.ts"), tasks = await import("../tasks.ts"), gates = await import("../task-confirmation.ts")
const fake = taskOwnerIO(), caller = "ses_owner_flow_integrator", project = "sample"
const projects = [{ name: project, root: root.replaceAll("\\", "/").toLowerCase(), rootPath: root, dir: root }]
core.setProjects(projects)
const card = { session: caller, role: "integrator", project, title: "fixture", directory: root, auto: false, pid: process.pid, updated: Date.now() }
core.saveCard(card); core.takeExclusive("sample.integrator", "integrator", caller, false)
let starts = 0
const tools = core.makeTools({ projects, defaultDir: root, touch: async id => core.readJson(core.cardFile(id)), isChild: () => false, posted() {}, picked() {}, roleTaken() {}, doctor: async () => [], taskConfirmationIO: fake.io, startTask: async t => { starts++; tasks.taskEvent(t, "fixture", "running"); return { session: t.executor } } })
const call = async (name, input) => (await tools.find(x => x.name === name).execute(input, caller)).content
const proposals = () => readdirSync(gates.APPROVALS).filter(n => n.endsWith(".json")).map(n => JSON.parse(readFileSync(path.join(gates.APPROVALS, n), "utf8")))
const latest = action => proposals().filter(r => r.action === action).sort((a, b) => b.created - a.created)[0]
try {
 const input = { title: "Implement alpha", goal: "Implement isolated alpha", criteria: "fixture green", model: "fixture/light", creation_reason: "new independent output", checked_tasks: [], why_new: "no existing alpha work" }
 assert.match(await call("canopus_spawn", { ...input, creation_reason: undefined, confirmed: true, owner_words: "owner said yes" }), /creation_reason/)
 assert.equal(tasks.listTasks(project).length, 0)
 const pending = await call("canopus_spawn", input); assert.match(pending, /подтверждени/); assert.equal(tasks.listTasks(project).length, 0); assert.equal(starts, 0)
 let proposal = latest("create"); assert.equal(fake.forms.size, 1)
 fake.confirm(proposal.form)
 await gates.resumeTaskConfirmations(fake.io, async (entry, payload, session) => (await tools.find(x => x.name === (entry === "spawn" ? "canopus_spawn" : "canopus_task")).execute(payload, session)).content)
 let list = tasks.listTasks(project); assert.equal(list.length, 1, "one UI click creates without another owner action")
 const t = list[0]; assert.equal(starts, 1); assert.equal(t.creation_reason, input.creation_reason)
 await call("canopus_spawn", { ...input, approval: proposal.id }); assert.equal(tasks.listTasks(project).length, 1); assert.equal(starts, 1, "replay does not launch again")
 const worker = t.executor
 core.saveCard({ session: worker, role: "worker", project, directory: root, auto: false, pid: process.pid, updated: Date.now(), task: { project, n: t.n } })
 fake.forms.set("frm_work_question", { id: "frm_work_question", sessionID: worker, state: { status: "pending" } })
 const pause = { action: "pause", n: t.n, text: "owner temporarily stopped this work" }
 await call("canopus_task", pause); assert.equal(tasks.loadTask(project, t.n).status, "running")
 proposal = latest("pause"); fake.confirm(proposal.form)
 await call("canopus_task", { ...pause, approval: proposal.id })
 assert.equal(tasks.loadTask(project, t.n).status, "paused"); assert.equal(fake.forms.get("frm_work_question").state.status, "cancelled")
 assert.equal(tasks.isOpen(tasks.loadTask(project, t.n)), false, "paused consumes no execution slot")
 assert.equal(tasks.isTerminal(tasks.loadTask(project, t.n)), false, "paused is not completion")
 assert.match(await call("canopus_spawn", { task: String(t.n), goal: "resume without consent", session: "С4" }), /припаркована|нет папок/)
 const resume = { action: "resume", n: t.n, text: "owner resumes same task" }
 await call("canopus_task", resume); proposal = latest("resume"); fake.confirm(proposal.form)
 await call("canopus_task", { ...resume, approval: proposal.id })
 assert.equal(tasks.loadTask(project, t.n).status, "idle"); assert.equal(starts, 1); assert.equal(tasks.listTasks(project).length, 1)
 // A new dedicated holder of the same task, not a new task record.
 let current = tasks.loadTask(project, t.n); current.executor = worker; tasks.saveTask(current)
 const contextTree = path.join(home, "context-worktree")
 git("worktree", "add", "-q", "-b", "task/context", contextTree)
 writeFileSync(path.join(contextTree, "unmerged.txt"), "preserved work")
 execFileSync("git", ["-C", contextTree, "add", "--", "unmerged.txt"])
 execFileSync("git", ["-C", contextTree, "commit", "-qm", "unmerged work"])
 const unmergedHead = execFileSync("git", ["-C", contextTree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
 current.branch = "task/context"; current.worktree = contextTree; tasks.saveTask(current)
 const cancel = { action: "cancel", n: t.n, text: "not required", replacement: "none", no_replacement_reason: "work abandoned" }
 await call("canopus_task", cancel); proposal = latest("cancel")
 assert.match(proposal.description, /Инициатор/); assert.match(proposal.description, /work abandoned/)
 const stale = await call("canopus_task", { ...cancel, text: "different reason", approval: proposal.id }); assert.match(stale, /не соответствует/)
 fake.confirm(proposal.form); fake.forms.set("frm_second", { id: "frm_second", sessionID: worker, state: { status: "pending" } }); fake.failCancel(true)
 await call("canopus_task", { ...cancel, approval: proposal.id }); assert.equal(tasks.loadTask(project, t.n).status, "idle", "failed question close does not cancel")
 fake.failCancel(false); await call("canopus_task", { ...cancel, approval: proposal.id })
 current = tasks.loadTask(project, t.n); assert.equal(current.status, "cancelled"); assert.equal(current.operations.at(-1).initiator.session, caller); assert.equal(current.operations.at(-1).approval.confirmed_by, "native_owner")
 const cancellationEvents = current.history.filter(h => h.status === "cancelled").length
 fake.forms.set("frm_stale_cancelled", { id: "frm_stale_cancelled", sessionID: worker, state: { status: "pending" } })
 assert.match(await call("canopus_task", { action: "questions", n: t.n }), /frm_stale_cancelled/)
 const repair = { ...cancel, repair: true, text: "close leftover question without rewriting cancellation" }
 await call("canopus_task", repair); proposal = latest("cancel"); fake.confirm(proposal.form)
 await call("canopus_task", { ...repair, approval: proposal.id }); current = tasks.loadTask(project, t.n)
 assert.equal(fake.forms.get("frm_stale_cancelled").state.status, "cancelled"); assert.equal(current.status, "cancelled"); assert.equal(current.history.filter(h => h.status === "cancelled").length, cancellationEvents)
 assert.equal(current.context_backups.at(-1).head, unmergedHead)
 assert.equal(git("rev-parse", current.context_backups.at(-1).ref), unmergedHead)
 // A separately authorised cleanup can remove a clean tree/branch; reachable work still survives.
 git("worktree", "remove", contextTree); git("branch", "-D", "task/context")
 const reopen = { action: "reopen", n: t.n, text: "cancellation was a mistake; continue same work" }
 await call("canopus_task", reopen); proposal = latest("reopen"); fake.confirm(proposal.form)
 await call("canopus_task", { ...reopen, approval: proposal.id }); current = tasks.loadTask(project, t.n)
 assert.equal(current.status, "idle"); assert.equal(current.n, t.n); assert.equal(tasks.listTasks(project).length, 1); assert.ok(current.history.some(h => h.status === "cancelled")); assert.equal(starts, 1)
 assert.equal(git("rev-parse", current.context_backups.at(-1).ref), unmergedHead)
 assert.match(current.history.at(-1).note, /дерево отсутствует/)
 // Legacy self-holder: detach stop work from the tool's own response/drain.
 current.executor = caller; current.status = "running"; tasks.saveTask(current)
 core.saveCard({ ...card, task: { project, n: current.n } })
 const self = { action: "pause", n: current.n, text: "stop this legacy self-assigned execution" }
 await call("canopus_task", self); proposal = latest("pause"); fake.confirm(proposal.form); fake.idle(false)
 assert.match(await call("canopus_task", { ...self, approval: proposal.id }), /отдельно от текущего вызова/)
 await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(tasks.loadTask(project, t.n).status, "running"); assert.ok(tasks.loadTask(project, t.n).operation_pending)
 fake.idle(true); await call("canopus_task", { ...self, approval: proposal.id })
 for (let i = 0; i < 100 && tasks.loadTask(project, t.n).status !== "paused"; i++) await new Promise(resolve => setTimeout(resolve, 5))
 assert.equal(tasks.loadTask(project, t.n).status, "paused", "self-stop recovery completes after detached drain")
 console.log("owner flow: one native click, no pre-confirm resources, pause/resume same ID, cancellation metadata, failed close retry and reopen history OK")
} finally { rmSync(home, { recursive: true, force: true }) }
