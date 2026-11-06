import assert from "node:assert/strict"
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { taskTestHome, taskOwnerIO } from "./task-owner-harness.mjs"
const home = taskTestHome()
const gate = await import("../task-confirmation.ts")
try {
 const fake = taskOwnerIO(), dir = path.join(home, "approvals")
 const request = { action: "create", project: "sample", initiator: { session: "ses_owner", role: "sample.integrator" }, scope: { entry: "spawn", input: { title: "A", creation_reason: "needed", checked_tasks: [], why_new: "not covered" } }, title: "Create A?", description: "Reason; checked tasks; why existing tasks cannot cover it" }
 let r = await gate.confirmTaskOperation(request, fake.io, dir)
 assert.equal(r.ok, false); assert.equal(fake.forms.size, 1)
 assert.equal(r.proposal.fields[0].custom, false)
 assert.equal([...fake.forms.values()][0].metadata.kind, "canopus-task-owner")
 const id = r.proposal.id, form = r.proposal.form
 await gate.confirmTaskOperation(request, fake.io, dir); assert.equal(fake.calls.filter(x => x[0] === "create").length, 1, "poll does not create another native form")
 let altered = await gate.confirmTaskOperation({ ...request, scope: { ...request.scope, input: { title: "B" } }, approval: id }, fake.io, dir)
 assert.equal(altered.ok, false); assert.equal(fake.forms.size, 1, "changed request cannot consume old approval")
 fake.confirm(form)
 r = await gate.confirmTaskOperation({ ...request, approval: id }, fake.io, dir); assert.equal(r.ok, true)
 let task, allocations = 0
 const create = async source => { allocations++; task = { project: "sample", n: 1, creation_approval: source }; return task }
 const results = await Promise.all([gate.applyApprovedCreation(r.proposal, () => task, create, dir), gate.applyApprovedCreation(r.proposal, () => task, create, dir)])
 assert.equal(allocations, 1)
 await gate.applyApprovedCreation(r.proposal, () => task, create, dir); assert.equal(allocations, 1, "replay finds existing durable task")
 assert.equal(task.creation_approval.confirmed_by, "native_owner")
 const refused = { ...request, scope: { input: { title: "Refused" } } }
 let no = await gate.confirmTaskOperation(refused, fake.io, dir); fake.decline(no.proposal.form)
 no = await gate.confirmTaskOperation(refused, fake.io, dir); assert.equal(no.ok, false); assert.equal(no.proposal.state, "declined")
 const count = fake.forms.size
 await gate.confirmTaskOperation(refused, fake.io, dir); assert.equal(fake.forms.size, count)
 const again = await gate.confirmTaskOperation({ ...refused, resubmit: no.proposal.id }, fake.io, dir)
 assert.equal(again.ok, false); assert.notEqual(again.proposal.id, no.proposal.id); assert.equal(fake.forms.size, count + 1)
 // Distinct approvals for the same task cannot race terminal statuses.
 const target = { n: 42, created: 123, status: "running" }
 const competing = []
 for (const action of ["cancel", "pause"]) {
  let c = await gate.confirmTaskOperation({ ...request, action, scope: { target }, title: action }, fake.io, dir)
  fake.confirm(c.proposal.form); c = await gate.confirmTaskOperation({ ...request, action, scope: { target }, title: action }, fake.io, dir); competing.push(c.proposal)
 }
 let release, entered = false, state = "running"
 const barrier = new Promise(resolve => { release = resolve })
 const slow = { ...fake.io, async idle() { entered = true; return barrier } }
 const first = gate.applyApprovedStop(competing[0], slow, ["ses_race"], async () => { assert.equal(state, "running"); state = "cancelled" }, dir, () => assert.equal(state, "running"))
 while (!entered) await new Promise(resolve => setTimeout(resolve, 1))
 const second = await gate.applyApprovedStop(competing[1], fake.io, [], async () => { state = "paused" }, dir, () => assert.equal(state, "running"))
 assert.match(second, /Другая операция/); release(true); assert.equal(await first, undefined)
 assert.equal(state, "cancelled")
 const staleStop = await gate.applyApprovedStop(competing[1], fake.io, [], async () => { state = "paused" }, dir, () => assert.equal(state, "running"))
 assert.ok(staleStop); assert.equal(state, "cancelled", "old pause approval cannot overwrite cancellation")
 const interrupted = { ...request, scope: { input: { title: "Interrupted POST" } } }
 fake.unknownCreate(true); let missing = await gate.confirmTaskOperation(interrupted, fake.io, dir); fake.unknownCreate(false)
 const sameID = missing.proposal.form; missing = await gate.confirmTaskOperation(interrupted, fake.io, dir)
 assert.equal(missing.proposal.form, sameID); assert.ok(fake.forms.has(sameID), "authoritative missing restores same native ID")
 const stopped = { ...request, action: "cancel", scope: { target: 1 }, title: "Cancel?" }
 let stop = await gate.confirmTaskOperation(stopped, fake.io, dir); fake.confirm(stop.proposal.form); stop = await gate.confirmTaskOperation(stopped, fake.io, dir)
 fake.forms.set("frm_worker", { id: "frm_worker", sessionID: "ses_worker", state: { status: "pending" } })
 let terminal = 0; fake.failCancel(true)
 let why = await gate.applyApprovedStop(stop.proposal, fake.io, ["ses_worker"], async () => { terminal++ }, dir)
 assert.ok(why); assert.equal(terminal, 0); assert.equal(fake.forms.get("frm_worker").state.status, "pending")
 fake.failCancel(false); fake.idle(false)
 why = await gate.applyApprovedStop(stop.proposal, fake.io, ["ses_worker"], async () => { terminal++ }, dir)
 assert.ok(why); assert.equal(terminal, 0, "interrupt ack without idle is not completion")
 const cancels = fake.calls.filter(x => x[0] === "cancel").length
 fake.idle(true)
 why = await gate.applyApprovedStop(stop.proposal, fake.io, ["ses_worker"], async () => { terminal++ }, dir)
 assert.equal(why, undefined); assert.equal(terminal, 1); assert.equal(fake.calls.filter(x => x[0] === "cancel").length, cancels, "partial retry does not cancel settled form again")
 await gate.applyApprovedStop(stop.proposal, fake.io, ["ses_worker"], async () => { terminal++ }, dir); assert.equal(terminal, 1)
 // A crashed process left a matching durable result and a dead claim; no second allocation.
 const crash = { ...request, scope: { input: { title: "Crash" } } }
 let recovered = await gate.confirmTaskOperation(crash, fake.io, dir); fake.confirm(recovered.proposal.form)
 writeFileSync(path.join(dir, recovered.proposal.id + ".json.lock"), JSON.stringify({ pid: 2147483647, at: 1 }))
 recovered = await gate.confirmTaskOperation(crash, fake.io, dir); assert.equal(recovered.ok, true)
 // Kill an actual child at the two crash boundaries around task publication/place.
 const tasks = await import("../tasks.ts")
 for (const beforeRecord of [false, true]) {
  const project = beforeRecord ? "crashbefore" : "crashafter"
  const crashRequest = { ...request, project, scope: { input: { title: project } } }
  let proof = await gate.confirmTaskOperation(crashRequest, fake.io, dir); fake.confirm(proof.proposal.form); proof = await gate.confirmTaskOperation(crashRequest, fake.io, dir)
  const child = path.join(home, project + ".mjs"), marker = path.join(home, project + "-place.json")
  writeFileSync(child, `import {writeFileSync} from 'node:fs';import {readProposal,applyApprovedCreation} from ${JSON.stringify(new URL("../task-confirmation.ts", import.meta.url).href)};import {createTask,listTasks} from ${JSON.stringify(new URL("../tasks.ts", import.meta.url).href)};const proposal=readProposal(${JSON.stringify(proof.proposal.id)},${JSON.stringify(dir)});await applyApprovedCreation(proposal,()=>listTasks(${JSON.stringify(project)}).find(t=>t.creation_approval?.id===proposal.id),async source=>{const t=createTask({project:${JSON.stringify(project)},title:'Crash fixture',goal:'preserve one result',criteria:'one task',priority:'P2',tier:'light',role:'worker',author:'ses_owner',author_role:'fixture.integrator',qid:'crash',status:'starting',kind:'spawn',directory:${JSON.stringify(home)},creation_approval:source},n=>{writeFileSync(${JSON.stringify(marker)},JSON.stringify({n}));${beforeRecord ? "process.exit(23);" : ""}return {}});process.exit(23);},${JSON.stringify(dir)});`)
  const killed = spawnSync(process.execPath, [child], { env: process.env, windowsHide: true, encoding: "utf8" }); assert.equal(killed.status, 23, killed.stderr); assert.ok(existsSync(marker))
  const find = () => tasks.listTasks(project).find(t => t.creation_approval?.id === proof.proposal.id)
  assert.equal(tasks.listTasks(project).length, beforeRecord ? 0 : 1)
  proof = await gate.confirmTaskOperation(crashRequest, fake.io, dir); assert.equal(proof.ok, true)
  let retried = 0
  const result = await gate.applyApprovedCreation(proof.proposal, find, async source => {
   retried++
   return tasks.createTask({ project, title: "Crash fixture", goal: "preserve one result", criteria: "one task", priority: "P2", tier: "light", role: "worker", author: "ses_owner", author_role: "fixture.integrator", qid: "crash", status: "starting", kind: "spawn", directory: home, creation_approval: source }, n => { assert.equal(JSON.parse(readFileSync(marker)).n, n); return {} })
  }, dir)
  assert.equal(tasks.listTasks(project).length, 1); assert.equal(result.task.n, 1); assert.equal(retried, beforeRecord ? 1 : 0)
 }
 assert.equal(gate.createReasonRefusal({}), "Нужна creation_reason: причина создания новой задачи агентом")
 assert.equal(gate.createReasonRefusal({ creation_reason: "r", checked_tasks: [], why_new: "w" }), undefined)
 console.log("task confirmation: native source, refusal/resubmit, replay/concurrency, partial stop, missing-form recovery and dead claims OK")
} finally { rmSync(home, { recursive: true, force: true }) }
