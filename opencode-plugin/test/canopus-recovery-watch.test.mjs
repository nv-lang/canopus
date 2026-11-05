import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-recovery-watch-"))
process.env.XDG_DATA_HOME = tmp
process.env.XDG_STATE_HOME = tmp
const watch = await import("../watch.ts")
const now = Date.now()
let posted = 0, checks = 0
const cell = (name, fn) => { fn(); checks++; console.log(`ok ${name}`) }
try {
  mkdirSync(watch.WATCHES, { recursive: true })
  const running = { id: "orphan-fixture", session: "sesFIXTURE", command: "exit 0", cwd: tmp, created: now - 30_000, started: now - 30_000, status: "running", pid: 1_000_000_001, minutes: 120 }
  const file = path.join(watch.WATCHES, `${running.id}.json`)
  writeFileSync(file, JSON.stringify(running))
  watch.pollWatches(() => posted++, () => {}, now, () => 1, { treePids: () => [process.pid] })
  cell("missing old wrapper PID cannot settle a command with live marked descendants", () => { assert.equal(posted, 0); assert.equal(JSON.parse(readFileSync(file, "utf8")).status, "running") })
  watch.pollWatches(() => posted++, () => {}, now, () => 1, { treePids: () => undefined })
  cell("unavailable process-tree scan is unknown, not idle or permission to kill", () => assert.equal(posted, 0))
  const queued = watch.requestWatch({ session: "sesFIXTURE", command: "exit 0", cwd: tmp, minutes: 1, machine: true, project: "p" })
  watch.pollWatches(() => posted++, () => {}, now, () => 1, { treePids: () => [process.pid], canStart: () => false })
  cell("execution pause leaves an authorized queued machine command unstarted", () => { assert.ok(existsSync(path.join(watch.WATCHES, `${queued.id}.req.json`))); assert.equal(existsSync(path.join(watch.WATCHES, `${queued.id}.json`)), false) })
} finally { rmSync(tmp, { recursive: true, force: true }) }
console.log(`canopus-recovery-watch: ${checks} checks`)
