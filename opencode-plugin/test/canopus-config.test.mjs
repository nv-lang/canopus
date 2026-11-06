// Task286: the public configuration no longer controls roles and rendered rule text.
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-config-"))
await (await import("./test-home.mjs")).configureTestHome(path.join(tmp, "home"))
const policy = await import("../resolved-policy.ts")
const schema = await import("../config-schema.ts")
const core = await import("../core.ts")
const cfg = await import("../plugin-config.ts")
try {
  const bare = path.join(tmp, "bare")
  mkdirSync(bare)
  const resolved = core.loadConfig(bare)
  assert(resolved.exclusive.has("integrator"))
  assert(!resolved.exclusive.has("lead"))
  assert.equal(resolved.projectRules, "")
  assert(Object.isFrozen(policy.INTERNAL_POLICY.exclusive_roles))
  for (const key of ["exclusive_roles", "project_rules", "tiers"]) {
    assert(schema.invalid(key, key === "project_rules" ? "text" : []))
    assert.throws(() => policy.validateProjectSettings({ [key]: "value" }, "test"), /unsupported setting/)
  }
  // The accepted filename and BOM support remain real parser contracts, not fixture filtering.
  const configFile = path.join(cfg.pluginRoot(), "config.json")
  mkdirSync(path.dirname(configFile), { recursive: true })
  writeFileSync(configFile, "\uFEFF" + JSON.stringify({ defaults: { owner_language: "English" } }))
  assert.equal(cfg.globalConfig().defaults.owner_language, "English")
  writeFileSync(configFile, JSON.stringify({ defaults: { project_rules: "retired" } }))
  assert.throws(() => cfg.globalConfig(), /unsupported setting project_rules/)
  writeFileSync(configFile, "{}")
  mkdirSync(path.join(bare, ".opencode"))
  writeFileSync(path.join(bare, ".opencode/nova-peers.json"), JSON.stringify({ project_rules: "legacy" }))
  assert.equal(core.loadConfig(bare).projectRules, "")
  console.log("canopus-config: built-in roles, retired public keys, BOM and no legacy fallback passed")
} finally { rmSync(tmp, { recursive: true, force: true }) }
