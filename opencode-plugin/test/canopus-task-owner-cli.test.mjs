import assert from "node:assert/strict"
import { createServer } from "node:http"
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { taskTestHome } from "./task-owner-harness.mjs"
import { allowNativeRegistry, allowNativeEndpoint } from "./native-isolation.mjs"
import { pathToFileURL } from "node:url"
const home = taskTestHome("canopus-owner-cli-")
const forms = new Map(), requests = []
let active = false, pidDrift = false, infoReads = 0
const server = createServer(async (req, res) => {
 assert.equal(req.headers.authorization, "Basic " + Buffer.from("opencode:example").toString("base64"))
 const url = new URL(req.url, "http://fixture.invalid"), parts = url.pathname.split("/")
 let body = ""; for await (const b of req) body += b
 requests.push([req.method, url.pathname])
 const send = value => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)) }
 if (url.pathname === "/api/info") return send({ pid: pidDrift ? 700 + ++infoReads : 700, version: "2.2.5" })
 if (url.pathname === "/api/session/active") return send({ data: active ? { ses_cli: { type: "running" } } : {} })
 if (parts[1] !== "api" || parts[2] !== "session") { res.statusCode = 404; return send({}) }
 const session = decodeURIComponent(parts[3]), id = parts[5] && decodeURIComponent(parts[5])
 if (parts[4] === "interrupt") { active = false; return send({ interrupted: true }) }
 if (parts[4] !== "form") return send({ data: { id: session, time: { created: 1, updated: 2, idle: 2 } } })
 if (!id && req.method === "POST") { const form = JSON.parse(body); assert.equal(form.metadata.kind, "canopus-task-owner"); assert.equal(form.fields[0].custom, false); assert.equal(forms.has(form.id), false); forms.set(form.id, { ...form, sessionID: session, state: { status: "pending" } }); return send({ data: forms.get(form.id) }) }
 if (!id) return send({ data: [...forms.values()].filter(f => f.sessionID === session).map(f => ({ id: f.id, sessionID: session })) })
 const f = forms.get(id)
 if (!f) { res.statusCode = 404; return send({ _tag: "FormNotFoundError", id, message: "missing" }) }
 assert.equal(f.sessionID, session)
 if (req.method === "DELETE") { f.state = { status: "cancelled", message: url.searchParams.get("message") }; res.statusCode = 204; return res.end() }
 return send({ data: f })
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const reg = { url: `http://127.0.0.1:${server.address().port}`, password: "example" }
mkdirSync(path.join(process.env.XDG_STATE_HOME, "opencode"), { recursive: true }); writeFileSync(path.join(process.env.XDG_STATE_HOME, "opencode/service.json"), JSON.stringify(reg))
const registry = path.join(process.env.XDG_STATE_HOME, "opencode/service.json")
allowNativeRegistry(registry); allowNativeEndpoint(reg.url)
const preload = path.join(home, "native-fixture-bootstrap.mjs")
writeFileSync(preload, `import {allowNativeRegistry,allowNativeEndpoint} from ${JSON.stringify(new URL("./native-isolation.mjs", import.meta.url).href)};process.env.XDG_STATE_HOME=${JSON.stringify(process.env.XDG_STATE_HOME)};allowNativeRegistry(${JSON.stringify(registry)});allowNativeEndpoint(${JSON.stringify(reg.url)});`)
const childEnv = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${pathToFileURL(preload).href}` }

const repo = path.join(home, "repo"), tree = path.join(home, "tree"); mkdirSync(path.join(repo, ".canopus/plugin"), { recursive: true }); mkdirSync(path.join(repo, "doc/tasks"), { recursive: true })
writeFileSync(path.join(repo, ".canopus/plugin/config.json"), JSON.stringify({ project: "sample", tasks_dir: "doc/tasks" })); writeFileSync(path.join(repo, "doc/tasks/.gitkeep"), "")
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
git("init", "-q", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.com"); git("add", "--", ".canopus/plugin/config.json", "doc/tasks/.gitkeep"); git("commit", "-qm", "fixture"); git("worktree", "add", "-qb", "task/fixture", tree)
const script = fileURLToPath(new URL("../../scripts/task-number.mjs", import.meta.url))
const args = [script, "--dir", tree, "--project", "sample", "--title", "CLI approved task", "--session", "ses_cli", "--creation-reason", "new independent output", "--checked-tasks", "none", "--why-new", "no matching task exists"]
const run = (argv, env = childEnv) => new Promise((resolve, reject) => {
 const p = spawn(process.execPath, argv, { windowsHide: true, env, stdio: ["ignore", "pipe", "pipe"] }); let stdout = "", stderr = ""; p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8"); p.stdout.on("data", b => stdout += b); p.stderr.on("data", b => stderr += b); p.on("error", reject); p.on("close", code => resolve({ code, stdout, stderr }))
})
try {
 let r = await run(args); assert.equal(r.code, 2, r.stderr); const pending = JSON.parse(r.stdout.trim())
 assert.equal(pending.state, "pending"); assert.equal(readdirSync(path.join(tree, "doc/tasks")).filter(x => /^\d/.test(x)).length, 0)
 const tasks = await import("../tasks.ts"); assert.equal(tasks.listTasks("sample").length, 0)
 const form = [...forms.values()][0]; form.state = { status: "answered", answer: { decision: "confirm" } }
 r = await run([...args, "--approval", pending.approval]); assert.equal(r.code, 0, r.stderr); const made = JSON.parse(r.stdout.trim())
 assert.equal(made.n, 1); assert.equal(tasks.listTasks("sample").length, 1); assert.ok(existsSync(path.join(made.path, "task/creation.json"))); assert.equal(tasks.loadTask("sample", 1).status, "backlog")
 r = await run([...args, "--approval", pending.approval]); assert.equal(r.code, 0, r.stderr); assert.equal(JSON.parse(r.stdout).n, made.n); assert.equal(tasks.listTasks("sample").length, 1)
 // Crash after record publication and directory creation must not become a false-success replay.
 const crashArgs=[...args];crashArgs[crashArgs.indexOf("--title")+1]="CLI partially placed result"
 let cr=await run(crashArgs);assert.equal(cr.code,2,cr.stderr);const cp=JSON.parse(cr.stdout)
 forms.get(`frm_canopus_${cp.approval}`).state={status:"answered",answer:{decision:"confirm"}}
 const crashPreload=path.join(home,"crash-placement.mjs")
 writeFileSync(crashPreload,`import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const original=fs.writeFileSync;fs.writeFileSync=function(file,...args){if(String(file).endsWith('creation.json'))process.exit(23);return original.call(this,file,...args)};syncBuiltinESMExports();`)
 cr=await run([...crashArgs,"--approval",cp.approval],{...childEnv,NODE_OPTIONS:childEnv.NODE_OPTIONS+" --import "+pathToFileURL(crashPreload).href});assert.equal(cr.code,23,cr.stderr)
 assert.equal(tasks.listTasks("sample").length,2)
 const partial=tasks.listTasks("sample").find(t=>t.creation_approval?.id===cp.approval)
 cr=await run([...crashArgs,"--approval",cp.approval]);assert.equal(cr.code,1,cr.stderr);assert.match(cr.stderr,/размещение не завершено/)
 assert.equal(tasks.listTasks("sample").length,2);assert.ok(tasks.loadTask("sample",partial.n).creation_failure)
 const confirmation=await import("../task-confirmation.ts");assert.equal(confirmation.readProposal(cp.approval).state,"blocked")
 const partialFolder=path.join(tree,...partial.folder.split("/"))
 writeFileSync(path.join(partialFolder,"task/creation.json"),JSON.stringify({reason:partial.creation_reason,checked_tasks:partial.checked_tasks,why_new:partial.why_new,approval:partial.creation_approval}))
 writeFileSync(path.join(partialFolder,"task/message.md"),"operator repaired fixture");writeFileSync(path.join(partialFolder,"log.md"),"fixture restoration")
 cr=await run([...crashArgs,"--approval",cp.approval]);assert.equal(cr.code,0,cr.stderr);assert.equal(JSON.parse(cr.stdout).n,partial.n)
 assert.equal(confirmation.readProposal(cp.approval).state,"applied");assert.equal(readFileSync(path.join(partialFolder,"task/message.md"),"utf8"),"operator repaired fixture")
 const native = await import("../task-confirmation-native.ts")
 let tick = 0; const io = native.taskConfirmationIO(reg, fetch, () => tick, async ms => { tick += ms })
 assert.equal(await io.idle("ses_cli"), true, "MCP/CLI PID differs from native service PID and still proves idle")
 pidDrift = true; assert.equal(await io.idle("ses_cli"), false, "service replacement is never idle proof"); pidDrift = false
 active = true; await io.interrupt("ses_cli"); assert.equal(await io.idle("ses_cli"), true)
 await io.cancel("ses_cli", form.id, "fixture task cancellation"); assert.equal((await io.get("ses_cli", form.id)).data.state.status, "cancelled")
 await assert.rejects(io.get("ses_cli", "frm_missing"), e => e.missingForm === "frm_missing")
 assert.ok(requests.some(([m, p]) => m === "DELETE" && p.endsWith(form.id)))
 console.log("owner CLI/native HTTP: no resources before approval, same-ID replay, backlog, stable service identity and real native cancel contract OK")
} finally { await new Promise(resolve => server.close(resolve)); rmSync(home, { recursive: true, force: true }) }
