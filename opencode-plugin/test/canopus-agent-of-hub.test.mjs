// Self-test of the self-deactivation under a hub-started agent (task 304; node >= 24): node test/canopus-agent-of-hub.test.mjs
// The marker CANOPUS_AGENT_OF_HUB is set — the plugin setup resolves with an empty registration and a journal note.
// The strict "no file side effect" check is for plugin-entry (the real load path of opencode: it does not import the
// whole plugin under the marker); the belt in index.ts is checked for resolve+note only — the import of index.ts has a
// pre-existing module-level side effect on the data dir, older than this task.
const marker = await import("../agent-of-hub.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

// 1. the predicate: any non-empty value of the marker means an agent of the hub
cell("1a: \"1\" and \"true\" are the hub", marker.hubAgentActive({ [marker.HUB_AGENT_ENV]: "1" }) && marker.hubAgentActive({ [marker.HUB_AGENT_ENV]: "true" }))
cell("1b: empty and absent are not the hub", !marker.hubAgentActive({}) && !marker.hubAgentActive({ [marker.HUB_AGENT_ENV]: "" }) && !marker.hubAgentActive({ OTHER: "1" }))
cell("1c: the name is the agreed one", marker.HUB_AGENT_ENV === "CANOPUS_AGENT_OF_HUB")

// 2. plugin-entry under the marker (the real load path): resolves with the note and touches nothing on disk
const { mkdtempSync, existsSync } = await import("node:fs")
const os = await import("node:os")
const path = await import("node:path")
const tmpEntry = mkdtempSync(path.join(os.tmpdir(), "canopus-agent-of-hub-entry-"))
process.env.XDG_DATA_HOME = tmpEntry
await (await import("./test-home.mjs")).configureTestHome(path.join(tmpEntry, "opencode"))
process.env[marker.HUB_AGENT_ENV] = "1"
let entryNote = ""
const realLog = console.log
console.log = (line) => { entryNote += String(line) + "\n" }
let entryResult = "threw"
let entryThrew = ""
try {
  entryResult = await (await import("../plugin-entry.ts")).default.setup({})
} catch (e) {
  entryThrew = String(e)
}
console.log = realLog
cell("2a: plugin-entry setup under the marker resolves (empty registration), not a refusal", entryThrew === "" && entryResult === undefined, entryThrew)
cell("2b: the journal note names the marker", entryNote.includes("деактивирован") && entryNote.includes(marker.HUB_AGENT_ENV), entryNote.trim())
cell("2c: no mailbox dirs and no files were made", !existsSync(path.join(tmpEntry, "opencode")), "fs touched")

// 3. the belt in index.ts (a direct import): resolves with the note (the import side effect on the data dir is
// pre-existing module behavior, older than this task, so no fs claim here)
process.env[marker.HUB_AGENT_ENV] = "1"
let note = ""
console.log = (line) => { note += String(line) + "\n" }
let result = "threw"
let threwText = ""
try {
  const plugin = (await import("../index.ts")).createCanopusPlugin()
  result = await plugin.setup({})
} catch (e) {
  threwText = String(e)
}
console.log = realLog
cell("3a: index setup under the marker resolves with the note, not a refusal", threwText === "" && result === undefined && note.includes(marker.HUB_AGENT_ENV), threwText || note.trim())
delete process.env[marker.HUB_AGENT_ENV]

// 4. task 304 acceptor remark: the old names stay a refusal even under the marker — refuseLegacyEnv sits BEFORE the
// marker exit in both entry points; the refusal comes before any fs side effect. The same home as block 2 (the config
// context of the process is frozen on the first initialize, a second home would refuse).
process.env.XDG_DATA_HOME = tmpEntry
process.env[marker.HUB_AGENT_ENV] = "1"
const OLD = "CREW_" + "HOME" // guard-allow(legacy-name): негативная проба старого имени
process.env[OLD] = "/old"
let oldThrew = ""
try {
  await (await import("../plugin-entry.ts")).default.setup({})
} catch (e) {
  oldThrew = String(e)
}
cell("4a: plugin-entry under marker + an old name refuses with the new name", oldThrew.includes(OLD) && oldThrew.includes("--config"), oldThrew)
delete process.env[OLD]
delete process.env[marker.HUB_AGENT_ENV]

console.log(fail ? `canopus-agent-of-hub.test: FAIL ${fail}` : "canopus-agent-of-hub.test ok")
process.exit(fail ? 1 : 0)
