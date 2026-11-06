import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-layers-"))
;await (await import("./test-home.mjs")).configureTestHome(path.join(tmp, "home"))
process.env.XDG_DATA_HOME = path.join(tmp, "different-opencode-home")
const m = await import("../plugin-config.ts")
const { canopusBase } = await import("../paths.ts")
const put = (f, v) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v)) }
try {
  assert.equal(canopusBase(), path.join(tmp, "home", "plugin", "data"))
  put(path.join(m.pluginRoot(), "config.json"), { defaults: { owner_language: "en", inflight_limit: 2, spawn_limits: { worker: 1, reviewer: 2 }, model_profiles: [{ id: "global" }] }, local: { test: { inflight_limit: 4 } } })
  const project = { owner_language: "ru", spawn_limits: { worker: 4 }, model_profiles: [{ id: "project" }] }
  put(path.join(tmp, "repo", ".canopus", "plugin", "local.json"), { inflight_limit: 8, spawn_limits: { reviewer: 6 } })
  const result = m.settingsLayers(project, path.join(tmp, "repo"), { spawn_limits: { worker: 9 } }, "test")
  assert.deepEqual(result, { owner_language: "ru", inflight_limit: 8, spawn_limits: { worker: 9, reviewer: 6 }, model_profiles: [{ id: "project" }] })
  put(path.join(m.pluginRoot(), "config.json"), { defaults: { answer_max: 1 } })
  assert.throws(() => m.globalConfig(), /unsupported setting answer_max/)
  put(path.join(m.pluginRoot(), "config.json"), {})
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
