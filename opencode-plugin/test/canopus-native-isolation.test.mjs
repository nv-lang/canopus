import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
const guard = pathToFileURL(path.join(import.meta.dirname, "native-isolation.mjs")).href
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-isolation-control-"))
let checks = 0
const run = source => spawnSync(process.execPath, ["--import", guard, "--input-type=module", "-e", source], { encoding: "utf8", env: { ...process.env, XDG_DATA_HOME: tmp }, timeout: 10_000 })
try {
  const read = run(`import fs from 'node:fs'; try { fs.readFileSync('C:/work/fixture/service.json') } catch {} process.exit(0)`)
  assert.equal(read.status, 1); assert.match(read.stderr, /registry/); checks++
  const network = run(`try { await fetch('http://fixture.invalid/api/info') } catch {} process.exit(0)`)
  assert.equal(network.status, 1); assert.match(network.stderr, /transport/); checks++
  const missingDI = run(`const {nativeState}=await import('./native-state.ts'); const r=await nativeState('sesFIXTURE'); if(r.state!=='unknown')process.exit(2); process.exit(0)`)
  assert.equal(missingDI.status, 1); assert.match(missingDI.stderr, /registry/); checks++
} finally { rmSync(tmp, { recursive: true, force: true }) }
console.log(`canopus-native-isolation: ${checks} checks, swallowed access and forced exit(0) remain RED`)
