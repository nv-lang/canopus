// Real worker isolates must use the selected parent config before importing core.
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Worker } from "node:worker_threads"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-command-worker-"))
const privateHome = path.join(tmp, "home"), root = path.join(tmp, "instance"), project = path.join(tmp, "project")
for (const folder of [privateHome, root, project]) mkdirSync(folder)
const config = path.join(root, "selected.json")
writeFileSync(config, JSON.stringify({ project_settings: [{ project: "demo", root: project }], local: { demo: { inflight_limit: 17 } } }))
const environment = { ...process.env, HOME: privateHome, USERPROFILE: privateHome }
delete environment.OPENCODE_CANOPUS_PROJECTS
const entry = new URL("../cmd-worker.ts", import.meta.url)
let worker
try {
  worker = new Worker(entry, { workerData: { config }, env: environment })
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("command worker response timed out")), 10000)
    worker.once("error", error => { clearTimeout(timer); reject(error) })
    worker.once("message", value => { clearTimeout(timer); resolve(value) })
    worker.postMessage({ id: 1, op: { kind: "config", dir: project, project: "demo" } })
  })
  assert.equal(response.id, 1)
  assert.equal(response.error, undefined)
  assert.match(response.out, /inflight_limit = 17/)
  assert.equal(readFileSync(path.join(root, "state/instance.kind"), "utf8"), "canopus-instance:plugin\n")
  await worker.terminate(); worker = undefined
  for (const data of [undefined, { config: "relative.json" }]) {
    const invalid = new Worker(entry, { workerData: data, env: environment })
    try {
      const error = await new Promise(resolve => invalid.once("error", resolve))
      assert.match(error.message, /parent selected config|absolute path/)
    } finally { await invalid.terminate() }
  }
  assert.equal(existsSync(path.join(privateHome, ".canopus")), false, "no fallback instance is created")
  console.log("worker context: selected custom file, configured data and fail-closed missing/relative context passed")
} finally { if (worker) await worker.terminate(); rmSync(tmp, { recursive: true, force: true }) }
