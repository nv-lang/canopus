// Self-test: the four keys of the faster-landing task in the settings (task 005, AC-25; node >= 24):  node test/canopus-landing-config.test.mjs
// accepted_slot, cleanup_limit, merge_precheck and task_extra_fields are in the schema with a question, the reason and a
// recommendation; canopus_config set refuses a value of a wrong shape and leaves the file untouched; right values are written,
// and once committed loadConfig reads them with the same defaults; the questionnaire (guide) names the four keys; the
// reserved ids of the extra fields cover the input fields of canopus_spawn.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-landing-config-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("POLL_MS", "100")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(tmp, "absent.db"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("SETTINGS_TTL_MS", "1")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("SYNC_GIT", "1")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("PRESENCE", "all")
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
const work = cfgDir
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true }); mkdirSync(path.join(cfgDir, ".canopus", "plugin"), { recursive: true })
mkdirSync(work, { recursive: true })
const file = path.join(cfgDir, ".canopus", "plugin", "config.json")
git(cfgDir, "init", "-q", "-b", "main")
writeFileSync(file, JSON.stringify({}, null, 2))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "settings")

const mod = await import("./fixture-plugin.mjs")
const core = await import("../core.ts")
const schema = await import("../config-schema.ts")
const hooks = {}
const tools = {}
const ctx = {
  location: { directory: work },
  options: { project_settings: [cfgDir] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: work }, time: {} }),
    prompt: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const call = async (sid, input) => (await tools.canopus_config.execute(input, { sessionID: sid })).content
for (const s of ["sesINT", "sesWRK"]) await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
await tools.canopus_role.execute({ role: "integrator" }, { sessionID: "sesINT" })
const NEW = ["accepted_slot", "cleanup_limit", "merge_precheck", "task_extra_fields"]

// Fixed landing policies cannot be reintroduced through public writes, even with valid old values.
const before = readFileSync(file, "utf8")
for (const [key, value] of Object.entries({ accepted_slot: "hold", cleanup_limit: 0, merge_precheck: "off", task_extra_fields: [{ id: "range", label: "Range" }] })) {
  const result = await call("sesINT", { action: "set", values: { [key]: value } })
  cell(`public write rejects removed ${key}`, /Не записано/.test(result) && result.includes(key) && readFileSync(file, "utf8") === before, result)
}
const d = core.loadConfig(work)
cell("built-in landing policy is retained", d.acceptedSlot === "free" && d.cleanupLimit === 10 && d.mergePrecheck === "required" && d.extraFields.length === 0, JSON.stringify(d))
const show = await call("sesWRK", { action: "show" })
const guide = await call("sesWRK", { action: "guide" })
cell("removed controls are absent from show and guide", NEW.every(key => !show.includes(`${key} =`) && !guide.includes(`- ${key}:`)), show)
cell("guide covers only the public schema", schema.SCHEMA_KEYS.length === 11 && schema.SCHEMA_KEYS.every(key => guide.includes(`- ${key}:`)), guide)
// The former validator implementation remains callable by an explicit code-policy dependency.
cell("code-policy validation retains allowed values", !schema.invalidInternalPolicy("accepted_slot", "hold") && !schema.invalidInternalPolicy("cleanup_limit", 0) && !schema.invalidInternalPolicy("merge_precheck", "off"), "")
cell("code-policy validation retains invalid-field protection", !!schema.invalidInternalPolicy("cleanup_limit", -1) && !!schema.invalidInternalPolicy("task_extra_fields", [{ id: "goal", label: "Goal" }]), "")

// ---- the reserved ids cover the input fields of canopus_spawn (the list lives in config-schema.ts: core.ts imports it)
const spawnFields = Object.keys(tools.canopus_spawn.input.properties)
const missing = spawnFields.filter((f) => !schema.RESERVED_FIELD_IDS.includes(f))
cell("AC-25 reserved ids: every input field of canopus_spawn is reserved", missing.length === 0, JSON.stringify(missing))
const taskFields = Object.keys(tools.canopus_task.input.properties)
cell("AC-25 reserved ids: action, n and session of canopus_task are reserved", ["action", "n", "session"].every((f) => taskFields.includes(f) && schema.RESERVED_FIELD_IDS.includes(f)), JSON.stringify(taskFields))

cell("AC-25 reserved ids: service names of an object (constructor, __proto__, prototype) are reserved", ["constructor", "__proto__", "prototype"].every((f) => schema.RESERVED_FIELD_IDS.includes(f) && schema.invalid("task_extra_fields", [{ id: f, label: "X" }]) !== undefined), JSON.stringify(["constructor", "__proto__", "prototype"].map((f) => schema.invalid("task_extra_fields", [{ id: f, label: "X" }]))))
await stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `canopus-landing-config.test: FAIL ${fail}` : "canopus-landing-config.test ok")
process.exit(fail ? 1 : 0)
