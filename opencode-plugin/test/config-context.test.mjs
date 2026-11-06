import assert from "node:assert/strict"
import path from "node:path"
import os from "node:os"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { claimPluginInstance } from "../instance-kind.ts"
import { selectPluginConfig, initializePluginConfig, freezePluginConfigContext, takeConfigArgument } from "../config-context.ts"

const cwd = path.resolve("example-work")
const home = path.resolve("example-user")
const standard = selectPluginConfig(undefined, cwd, home)
assert.equal(standard.file, path.join(home, ".canopus", "plugin", "config.json"))
const explicit = selectPluginConfig("../instance/config.json", cwd, home)
assert.equal(explicit.root, path.resolve(cwd, "../instance"))
assert.equal(explicit.data, path.join(explicit.root, "data"))
assert.equal(selectPluginConfig("../instance/second.json", cwd, home).root, explicit.root)
assert.notEqual(selectPluginConfig("../another/config.json", cwd, home).root, explicit.root)
assert.throws(() => selectPluginConfig(""), /non-empty/)
assert.throws(() => initializePluginConfig({ profile_set: "example" }), /put settings in the config file/)
assert.throws(() => initializePluginConfig({ config: 42 }), /non-empty/)
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-config-context-"))
const first = initializePluginConfig({ config: path.join(tmp, "plugin", "config.json") })
assert.equal(freezePluginConfigContext().file, first.file)
assert.equal(initializePluginConfig({ config: first.file }).file, first.file)
assert.throws(() => initializePluginConfig({ config: path.join(explicit.root, "second.json") }), /separate process/)
console.log("config context: default, explicit, shared directory and process isolation checks passed")

assert.deepEqual(takeConfigArgument(["--config", "example.json", "--session", "s", "--approval", "a"]), { config: "example.json", rest: ["--session", "s", "--approval", "a"] })
assert.throws(() => takeConfigArgument(["--config=a", "--config=b"]), /only once/)
assert.throws(() => takeConfigArgument(["--config", "--session", "s"]), /needs a file/)

const app = path.join(tmp, "app")
mkdirSync(path.join(app, "state"), { recursive: true })
writeFileSync(path.join(app, "state", "instance.kind"), "canopus-instance:app\n")
assert.throws(() => claimPluginInstance(app), /another component/)
const legacyApp = path.join(tmp, "old-app")
mkdirSync(path.join(legacyApp, "data", "sessions"), { recursive: true })
assert.throws(() => claimPluginInstance(legacyApp), /application session data/)
rmSync(tmp, { recursive: true, force: true })
