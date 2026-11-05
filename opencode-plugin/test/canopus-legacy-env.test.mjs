// Self-test of the refusal of the legacy env names (task 284; node >= 24): node test/canopus-legacy-env.test.mjs
// A set old variable CREW_*/OPENCODE_CREW_* is a clear refusal naming the new name — no execution, no fallback.
const legacy = await import("../legacy-env.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

// 1. the map old -> new (the names in the cell labels are samples: guard-allow(legacy-name): негативная проба старых имён)
cell("1a: CREW_HARNESS_X -> CANOPUS_X", legacy.newNameFor("CREW_" + "HARNESS_POLL_MS") === "CANOPUS_POLL_MS") // guard-allow(legacy-name): негативная проба старого имени
cell("1b: CREW_X -> CANOPUS_X", legacy.newNameFor("CREW_" + "HOME") === "CANOPUS_HOME") // guard-allow(legacy-name): негативная проба старого имени
cell("1c: OPENCODE_CREW_X -> OPENCODE_CANOPUS_X", legacy.newNameFor("OPENCODE_" + "CREW_" + "SESSION") === "OPENCODE_CANOPUS_SESSION") // guard-allow(legacy-name): негативная проба старого имени
cell("1d: a foreign variable is not ours", legacy.newNameFor("XDG_DATA_HOME") === undefined && legacy.newNameFor("CANOPUS_HOME") === undefined)

// 2. a clean environment passes, a set old name is a refusal with the new name
cell("2a: no old names — no problems", legacy.legacyEnvProblems({ "CANOPUS_HOME": "/x", "PATH": "p" }).length === 0)
const problems = legacy.legacyEnvProblems({ ["CREW_" + "HOME"]: "/old", ["OPENCODE_" + "CREW_" + "PROJECTS"]: "[]" })
cell("2b: every old name is named with the new one", problems.length === 2 && problems.some((p) => p.includes("CREW_" + "HOME") && p.includes("CANOPUS_HOME")) && problems.some((p) => p.includes("OPENCODE_CANOPUS_PROJECTS")), JSON.stringify(problems))
let threw = ""
try {
  legacy.refuseLegacyEnv("проба", { ["CREW_" + "HOME"]: "/old" })
} catch (e) {
  threw = String(e)
}
cell("2c: refuseLegacyEnv throws, names old and new, no execution", threw.includes("не поддерживаются") && threw.includes("CREW_" + "HOME") && threw.includes("CANOPUS_HOME") && threw.includes("проба"), threw)
const both = legacy.legacyEnvProblems({ ["CREW_" + "HOME"]: "/old", "CANOPUS_HOME": "/new" })
cell("2d: old and new set together — still a refusal of the old one, no silent choice", both.length === 1 && both[0].includes("CANOPUS_HOME"), JSON.stringify(both))

// 3. a call of a tool by the old name gets the new name in the hint, nothing runs
cell("3a: crew_send -> canopus_send", legacy.renamedToolHint("crew" + "_send") === " — инструмент переименован: canopus_send") // guard-allow(legacy-name): негативная проба старого имени
cell("3b: a new name gets no hint", legacy.renamedToolHint("canopus_send") === "")

// 4. the refusal comes before any file-system side effect (task 284 AC): an isolated data dir, an old name set —
// the plugin setup refuses and the dir stays untouched; unrelated personal values are preserved
const { mkdtempSync, existsSync } = await import("node:fs")
const os = await import("node:os")
const path = await import("node:path")
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-legacy-env-"))
process.env.XDG_DATA_HOME = tmp
const OLD = "CREW_" + "HOME" // guard-allow(legacy-name): негативная проба старого имени
process.env[OLD] = "/old"
process.env.UNRELATED_PERSONAL_282 = "keep-me"
const plugin = (await import("../index.ts")).createCanopusPlugin()
let refused = ""
try {
  await plugin.setup({})
} catch (e) {
  refused = String(e)
}
cell("4a: setup with a set old name refuses with the new name", refused.includes("CANOPUS_HOME"), refused)
cell("4b: the refusal made no mailbox dirs and no files", !existsSync(path.join(tmp, "opencode")), "fs touched")
cell("4c: unrelated personal values stay", process.env.UNRELATED_PERSONAL_282 === "keep-me", "lost")
delete process.env[OLD]
delete process.env.UNRELATED_PERSONAL_282

console.log(fail ? `canopus-legacy-env.test: FAIL ${fail}` : "canopus-legacy-env.test ok")
process.exit(fail ? 1 : 0)
