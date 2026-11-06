import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-task-dir-"))
const repo = path.join(tmp, "repo"), tree = path.join(tmp, "tree")
const env = { ...process.env, CANOPUS_HOME: path.join(tmp, "home"), XDG_DATA_HOME: path.join(tmp, "opencode-data") }
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
  const reply = JSON.parse(execFileSync(process.execPath, [script, "--dir", path.join(tree, "nested"), "--project", "fixture", "--title", "Configured path"], { env, encoding: "utf8" }))
  assert.equal(reply.number, "002")
  assert.ok(reply.folder.startsWith("docs/tasks/002-"))
  console.log("canopus-tasks-dir-cli.test ok")
} finally { rmSync(tmp, { recursive: true, force: true }) }
