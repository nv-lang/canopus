// 281: background profile windows must never spawn synchronous Git.
import assert from "node:assert/strict"
import cp from "node:child_process"
import { syncBuiltinESMExports } from "node:module"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-profiles-nonblocking-"))
for (const k of Object.keys(process.env)) if (/^(CANOPUS_|OPENCODE_CANOPUS_)/.test(k)) delete process.env[k]
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "config")
process.env.CANOPUS_DB = path.join(tmp, "absent.db")
const W = await import("../profile-windows.ts")
const mapping = new Map()
const head = (gitdir) => {
  mkdirSync(gitdir, { recursive: true })
  writeFileSync(path.join(gitdir, "HEAD"), "ref: refs/heads/main\n")
}
const repo = (name) => {
  const root = path.join(tmp, name), common = path.join(root, ".git")
  head(common)
  mkdirSync(path.join(common, "objects"), { recursive: true })
  mapping.set(root, common)
  return { root, common }
}
const link = (name, common, relative = false) => {
  const root = path.join(tmp, name), gitdir = path.join(common, "worktrees", name)
  mkdirSync(root, { recursive: true }); head(gitdir)
  writeFileSync(path.join(gitdir, "commondir"), path.relative(gitdir, common) + "\n")
  writeFileSync(path.join(root, ".git"), "gitdir: " + (relative ? path.relative(root, gitdir) : gitdir) + "\n")
  mapping.set(root, common)
  return root
}
const a = repo("first repository"), b = repo("second repository")
const wa = link("absolute tree", a.common), wr = link("relative tree", a.common, true), wb = link("other tree", b.common)
const separate = path.join(tmp, "separate tree"), separateGit = path.join(tmp, "separate metadata")
mkdirSync(separate, { recursive: true }); head(separateGit); mkdirSync(path.join(separateGit, "objects"))
writeFileSync(path.join(separate, ".git"), "gitdir: " + separateGit + "\n"); mapping.set(separate, separateGit)
const original = cp.execFileSync, calls = []
cp.execFileSync = (command, args) => {
  assert.equal(command, "git"); assert.ok(args.includes("--git-common-dir"))
  const common = mapping.get(path.resolve(args[1]))
  if (!common) throw Error("Unknown test repository")
  calls.push({ command, worktree: args[1] }); return common + "\n"
}
syncBuiltinESMExports()
try {
  const model = new Map([["example/model", { context: 1000, output: 100 }]])
  const task = (n, worktree) => ({ n, project: "unit", kind: "spawn", worktree_ready: true, worktree, status: "running" })
  const tasks = [task(1, wa), task(2, wr), task(3, wb), task(4, separate)]
  const first = W.syncWindows("unit", tasks, { mode: "all", models: model })
  assert.deepEqual(first.errors, []); assert.equal(first.written.length, 4)
  assert.ok(tasks.every(t => existsSync(W.windowPath(t.worktree))))
  console.log(JSON.stringify({ coldWindowFiles: first.written.length, synchronousGitCalls: calls.length }))
  assert.equal(calls.length, 0, "cold background profile pass must not start synchronous Git")
  const second = W.syncWindows("unit", tasks, { mode: "all", models: model })
  assert.deepEqual(second.errors, []); assert.deepEqual(second.written, [])
  W.ensureExclude(a.root)
  for (const common of [a.common, b.common, separateGit])
    assert.equal(readFileSync(path.join(common, "info", "exclude"), "utf8").split(/\r?\n/).filter(l => l === W.EXCLUDE_LINE).length, 1)
  assert.equal(calls.length, 0, "unchanged background passes must not start synchronous Git")
  const c = repo("retarget repository")
  const movedGit = path.join(c.common, "worktrees", "retargeted")
  head(movedGit); writeFileSync(path.join(movedGit, "commondir"), c.common + "\n")
  writeFileSync(path.join(wr, ".git"), "gitdir: " + path.relative(wr, movedGit) + "\n")
  W.ensureExclude(wr); assert.equal(calls.length, 0)
  assert.ok(readFileSync(path.join(c.common, "info", "exclude"), "utf8").includes(W.EXCLUDE_LINE))
  const bad = path.join(tmp, "malformed")
  mkdirSync(bad); writeFileSync(path.join(bad, ".git"), "not a gitdir pointer\n")
  assert.throws(() => W.ensureExclude(bad))
  assert.equal(existsSync(path.join(bad, "info", "exclude")), false)
  const handmade = '{"provider":{"example":{"models":{}}}}\n'
  writeFileSync(W.windowPath(wa), handmade)
  const foreign = W.syncWindows("unit", tasks, { mode: "all", models: model })
  assert.ok(foreign.foreign.includes(wa)); assert.equal(readFileSync(W.windowPath(wa), "utf8"), handmade)
  assert.equal(calls.length, 0)
  console.log("PASS: cold/warm passes, main/linked/relative/separate Git directories, retargeting, malformed metadata and handwritten file preservation; zero synchronous child processes")
} finally {
  cp.execFileSync = original; syncBuiltinESMExports()
  assert.equal(path.dirname(path.resolve(tmp)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(tmp).startsWith("canopus-profiles-nonblocking-"))
  rmSync(tmp, { recursive: true, force: true })
}
