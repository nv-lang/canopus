import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-task-dir-"))
const repo = path.join(tmp, "repo"), tree = path.join(tmp, "tree")
const env = { ...process.env, CANOPUS_HOME: path.join(tmp, "home"), XDG_DATA_HOME: path.join(tmp, "opencode-data") }
const {taskOwnerHttp}=await import("./task-owner-http.mjs")
const native=await taskOwnerHttp(tmp,env)
const git = (...args) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.org", ...args], { env, stdio: ["ignore", "pipe", "pipe"] })
try {
  git("init", "-q", "-b", "main", repo)
  mkdirSync(path.join(repo, ".canopus", "plugin"), { recursive: true })
  writeFileSync(path.join(repo, ".canopus", "plugin", "config.json"), JSON.stringify({ project: "fixture", tasks_dir: "docs/tasks" }))
  mkdirSync(path.join(repo, "docs", "tasks", "001-existing"), { recursive: true })
  writeFileSync(path.join(repo, "docs", "tasks", "001-existing", "log.md"), "fixture")
  git("-C", repo, "add", "--", ".canopus/plugin/config.json", "docs/tasks/001-existing/log.md")
  git("-C", repo, "commit", "-qm", "fixture")
  git("-C", repo, "worktree", "add", "-qb", "test", tree)
  mkdirSync(path.join(tree, "nested"))
  const script = fileURLToPath(new URL("../../scripts/task-number.mjs", import.meta.url))
  const args=[script,"--config",path.join(tmp,"home/plugin/config.json"),"--dir",path.join(tree,"nested"),"--project","fixture","--title","Configured path","--session","ses_cli_path","--creation-reason","test configured tasks directory","--checked-tasks","none","--why-new","independent fixture output"]
  const pending=await native.run(args);assert.equal(pending.code,2,pending.err)
  const approval=JSON.parse(pending.out).approval
  assert.equal(existsSync(path.join(tree,"docs/tasks/002-configured-path")),false,"no placement before native owner answer")
  native.confirm(approval)
  const completed=await native.run([...args,"--approval",approval]);assert.equal(completed.code,0,completed.err)
  const reply=JSON.parse(completed.out)
  assert.equal(reply.number, "002")
  assert.ok(reply.folder.startsWith("docs/tasks/002-"))
  console.log("canopus-tasks-dir-cli.test ok")
} finally { await native.close(); rmSync(tmp, { recursive: true, force: true }) }
