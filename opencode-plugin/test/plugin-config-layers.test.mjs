import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-layers-"))
process.env.CANOPUS_HOME = path.join(tmp, "home")
process.env.XDG_DATA_HOME = path.join(tmp, "different-opencode-home")
const m = await import("../plugin-config.ts")
const { canopusBase } = await import("../paths.ts")
const put = (f, v) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v)) }
try {
  assert.equal(canopusBase(), path.join(tmp, "home", "plugin", "data"))
  put(path.join(m.pluginRoot(), "config.json"), { defaults: { enabled: true, n: 2, nested: { a: 1, b: 2 }, list: [1] } })
  const project = { project: "test", nested: { a: 4 }, list: [2], enabled: false }
  put(path.join(tmp, "repo", ".canopus", "plugin", "local.json"), { n: 0, nested: { b: 6 } })
  put(path.join(m.pluginRoot(), "config.json"), { defaults: { enabled: true, n: 2, nested: { a: 1, b: 2 }, list: [1] }, local: { test: { n: 4 } } })
  const result = m.settingsLayers(project, path.join(tmp, "repo"), { nested: { a: 9 } })
  assert.deepEqual(result, { project: "test", enabled: false, n: 0, nested: { a: 9, b: 6 }, list: [2] })
  assert.equal(m.pluginOptions().local, undefined, "global local settings must not become launch overrides")
  assert.equal(m.validateTasksDir("docs/tasks"), "docs/tasks")
  assert.equal(m.validateTasksDir(""), "")
  for (const v of ["../tasks", "C:/tasks", "/tasks", "a/../tasks", "docs:tasks"]) assert.throws(() => m.validateTasksDir(v))
  writeFileSync(path.join(m.pluginRoot(), "config.json"), "not json")
  assert.throws(() => m.globalConfig(), /configuration/)
  assert.throws(() => m.mergeConfig({}, JSON.parse('{"__proto__":{"polluted":true}}')), /Unsafe/)
  assert.equal({}.polluted, undefined)
  console.log("plugin-config-layers.test ok")
} finally { rmSync(tmp, { recursive: true, force: true }) }
