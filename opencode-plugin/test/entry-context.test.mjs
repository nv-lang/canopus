import assert from "node:assert/strict"
import path from "node:path"
import { nativeConfigOptions, initializeWindowContext } from "../entry-context.ts"
import { pluginConfigContext, mcpConfigOptions } from "../config-context.ts"
const root = path.resolve(import.meta.dirname, "..")
const selected = path.resolve("example-instance", "config.json")
const layers = [{ type: "file", path: path.resolve("example-opencode.json"), info: { plugins: [{ package: root, options: { config: selected } }], provider: { unrelated: { ["tok" + "en"]: "not read" } } } }]
assert.deepEqual(nativeConfigOptions(layers), { config: selected })
assert.equal(nativeConfigOptions([{ info: { plugins: ["another-package"] } }]), undefined)
assert.throws(() => nativeConfigOptions([{ info: { plugins: [{ package: root, options: { config: "relative.json" } }] } }]), /absolute/)
assert.throws(() => nativeConfigOptions([...layers, { info: { plugins: [root] } }]), /multiple instances/)
let received
await initializeWindowContext({ options: {}, location: { directory: "fixture" }, client: { config: { get: async request => { received = request; return layers } } } })
assert.deepEqual(received, { location: { directory: "fixture" } })
assert.equal(pluginConfigContext().file, selected)
await assert.rejects(() => initializeWindowContext({ options: { config: path.resolve("another-instance/config.json") }, client: { config: { get: async () => layers } } }), /different configurations/)
console.log("entry context: attached-server selection, strict pointer and mismatch checks passed")

assert.deepEqual(mcpConfigOptions([], {}), {})
assert.deepEqual(mcpConfigOptions(["--config", selected], {}), { config: selected })
assert.deepEqual(mcpConfigOptions([], { OPENCODE_CANOPUS_SESSION: "ses_test", OPENCODE_CANOPUS_CONFIG: selected }), { config: selected })
assert.throws(() => mcpConfigOptions([], { OPENCODE_CANOPUS_CONFIG: selected }), /incomplete/)
assert.throws(() => mcpConfigOptions([], { OPENCODE_CANOPUS_SESSION: "ses_test", OPENCODE_CANOPUS_CONFIG: "relative.json" }), /incomplete/)
assert.throws(() => mcpConfigOptions(["--config", path.resolve("other/config.json")], { OPENCODE_CANOPUS_SESSION: "ses_test", OPENCODE_CANOPUS_CONFIG: selected }), /different instances/)

if (process.platform === "win32") {
  assert.deepEqual(nativeConfigOptions([...layers, { info: { plugins: [{ package: root, options: { config: selected.toUpperCase() } }] } }]), { config: selected.toUpperCase() })
  await initializeWindowContext({ options: { config: selected.toUpperCase() }, client: { config: { get: async () => layers } } })
}
await assert.rejects(() => initializeWindowContext({ options: { unwanted: true }, client: { config: { get: async () => layers } } }), /unsupported option/)
