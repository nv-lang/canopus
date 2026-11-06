// Self-test of the settings of the question-answering modes (task 007; node >= 24):  node test/canopus-answer-config.test.mjs
// The keys answer_mode (a map "type -> mode") and answer_max (the limit of answers in a row) belong to the person: canopus_config set
// refuses them and leaves the file alone; the questionnaire names them; a value of a wrong form is read as absent and named by
// invalid / show / the doctor. The settings live in a real git repository, as in canopus-cfgtool.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-answer-config-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("POLL_MS", "100")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(tmp, "absent.db"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("SETTINGS_TTL_MS", "1")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("SYNC_GIT", "1")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("PRESENCE", "all")
const plugin = process.env.CANOPUS_PLUGIN_DIR ? path.resolve(process.env.CANOPUS_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const load = (f) => import(pathToFileURL(path.join(plugin, f)).href)
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
const work = cfgDir
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true }); mkdirSync(path.join(cfgDir, ".canopus", "plugin"), { recursive: true })
mkdirSync(work, { recursive: true })
const file = path.join(cfgDir, ".canopus", "plugin", "config.json")
const commit = (obj) => {
  writeFileSync(file, JSON.stringify(obj, null, 2))
  git(cfgDir, "add", "-A")
  git(cfgDir, "commit", "-q", "--allow-empty", "-m", "settings")
}
git(cfgDir, "init", "-q", "-b", "main")
commit({})

const mod = await load("test/fixture-plugin.mjs")
const core = await load("core.ts")
const schema = await load("config-schema.ts")
const settings = await load("settings.ts")
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

const modeOf = () => JSON.stringify(core.loadConfig(work).answerMode ?? null)
const maxOf = () => core.loadConfig(work).answerMax

// answer_mode remains a personal public choice; answer_max/delay are fixed code policies.
const before = readFileSync(file, "utf8")
const setMode = await call("sesINT", { action: "set", values: { answer_mode: { implementation: "recommendations" } } })
cell("agent cannot change personal answer_mode", /Не записано/.test(setMode) && /человек/.test(setMode) && readFileSync(file, "utf8") === before, setMode)
for (const key of ["answer_max", "answer_delay_sec"]) {
  const refused = await call("sesINT", { action: "set", values: { [key]: 1 } })
  cell(`removed ${key} is refused`, /Не записано/.test(refused) && refused.includes(key) && readFileSync(file, "utf8") === before, refused)
}
const guide = await call("sesWRK", { action: "guide" })
cell("guide exposes answer_mode and omits internal limits", guide.includes("- answer_mode:") && !guide.includes("- answer_max:") && !guide.includes("- answer_delay_sec:"), guide)
cell("built-in answer budgets remain", core.loadConfig(work).answerMax === 3 && core.loadConfig(work).answerDelaySec === 60, "")
commit({ answer_mode: { implementation: "recommendations" } })
cell("committed public answer_mode is applied", core.loadConfig(work).answerMode.implementation === "recommendations", modeOf())
commit({ answer_mode: { gate: "recommendations", plan: "recommendations" } })
cell("unsafe gate mode is ignored and diagnosed", modeOf() === JSON.stringify({ plan: "recommendations" }) && !!schema.invalid("answer_mode", { gate: "recommendations" }), modeOf())
commit({ answer_mode: { plan: "agent", requirements: "recommendations" } })
cell("unsupported agent mode is omitted without losing supported choices", core.loadConfig(work).answerMode.requirements === "recommendations" && !("plan" in core.loadConfig(work).answerMode), modeOf())
commit({})
const parse2 = await load("answer-parse.ts")
cell("explicit code normalizer retains delay semantics", parse2.normalizeAnswerDelay(undefined) === 60 && parse2.normalizeAnswerDelay(0) === 0 && parse2.normalizeAnswerDelay(30) === 30 && parse2.normalizeAnswerDelay(-1) === 60 && parse2.normalizeAnswerDelay("5") === 60 && parse2.normalizeAnswerDelay(1.5) === 60, "")

// REQ-01: the mode of a type: the type, then default, then owner
const parse = await load("answer-parse.ts")
const m = (obj) => parse.normalizeAnswerMode(obj).map
cell("REQ-01 modeFor", parse.modeFor(m({ plan: "recommendations" }), "plan") === "recommendations" && parse.modeFor(m({}), "plan") === "owner" && parse.modeFor(m({ default: "recommendations" }), "implementation") === "recommendations" && parse.modeFor(m({ default: "recommendations", plan: "owner" }), "plan") === "owner", "modeFor")
cell("REQ-01 answerModesOn", !parse.answerModesOn(m({})) && !parse.answerModesOn(m({ plan: "owner", default: "owner" })) && parse.answerModesOn(m({ implementation: "recommendations" })) && parse.answerModesOn(m({ default: "recommendations" })), "answerModesOn")
cell("REQ-02 answer_max default", parse.normalizeAnswerMax(undefined) === 3 && parse.normalizeAnswerMax(2) === 2 && parse.normalizeAnswerMax(0) === 3 && parse.normalizeAnswerMax(2.5) === 3 && parse.normalizeAnswerMax("4") === 3, "normalizeAnswerMax")
cell("REQ-01 a string is read as absent, with a note", parse.normalizeAnswerMode("owner").notes.length === 1 && JSON.stringify(m("owner")) === "{}" && parse.normalizeAnswerMode(undefined).notes.length === 0, "string")

await stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `canopus-answer-config.test: FAIL ${fail}` : "canopus-answer-config.test ok")
process.exit(fail ? 1 : 0)
