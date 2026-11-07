// Self-test (node >= 24):  node test/canopus-config-diverge.test.mjs
// Task 029: the plugin reads project settings from the target branch; a key that lives only in the working copy file
// does not act. The doctor warns (names the keys, says the branch wins) and /canopus plus the side panel keep one line
// on screen while the files differ; no divergence means silence; a missing branch file gets its own plain line.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-diverge-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
;await (await import("./test-home.mjs")).configureTestHome(path.join(process.env.XDG_DATA_HOME, "opencode"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("SETTINGS_TTL_MS", "1")
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DIVERGE_TTL_MS", "0")
const plugin = process.env.CANOPUS_PLUGIN_DIR ? path.resolve(process.env.CANOPUS_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const settings = await import(pathToFileURL(path.join(plugin, "settings.ts")).href)
const status = await import(pathToFileURL(path.join(plugin, "status.ts")).href)
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" })
const cfgDir = path.join(tmp, "proj", "proj-settings")
const file = path.join(cfgDir, ".canopus", "plugin", "config.json")
mkdirSync(path.dirname(file), { recursive: true })
git(cfgDir, "init", "-q", "-b", "main")
const write = (obj) => writeFileSync(file, JSON.stringify(obj, null, 2))
const commit = (obj) => { write(obj); git(cfgDir, "add", "-A"); git(cfgDir, "commit", "-q", "--allow-empty", "-m", "s") }
const doctor = () => settings.settingsProblems(settings.parseProjects({ project_settings: [cfgDir] }))
const diverge = (ps) => ps.filter((p) => p.includes("отличаются от целевой ветки"))
const sum = () => status.formatStatuses([{ session: "s1", project: "proj-settings", role: "worker", title: "t", state: "idle", detail: "свободна", watches: [], asked: [], tasks: [] }])
const side = () => status.sidebarLines([], Date.now(), "proj-settings").rows.map((r) => status.sideText(r)).join("\n")
let fail = 0
const cell = (n, ok, d) => { console.log(`${ok ? "ok  " : "FAIL"} ${n}${ok ? "" : " :: " + d}`); if (!ok) fail++ }

commit({ inflight_limit: 1 })
let p = doctor()
cell("same files: doctor silent", diverge(p).length === 0, JSON.stringify(p))
cell("same files: /canopus silent", !sum().includes("⚠ off-branch"), sum())
cell("same files: panel silent", !side().includes("не на ветке"), side())

write({ inflight_limit: 1, owner_language: "ru" })
p = doctor()
cell("working copy applies immediately without an obsolete branch warning", diverge(p).length===0,JSON.stringify(p))
cell("working copy is the source",settings.rawSettingsFor(cfgDir,settings.parseProjects({project_settings:[cfgDir]})).owner_language==="ru",JSON.stringify(p))
cell("ordinary Git differences do not mark the configuration broken",!sum().includes("⚠ off-branch")&&!side().includes("не на ветке"),sum())

commit({ inflight_limit: 1, owner_language: "ru" })
cell("after commit: warning gone", diverge(doctor()).length === 0 && !sum().includes("⚠ off-branch"), sum())

const bare = path.join(tmp, "proj2", "s2")
mkdirSync(path.join(bare, ".opencode"), { recursive: true }); mkdirSync(path.join(bare, ".canopus", "plugin"), { recursive: true })
git(bare, "init", "-q", "-b", "main")
git(bare, "commit", "-q", "--allow-empty", "-m", "i")
writeFileSync(path.join(bare, ".canopus", "plugin", "config.json"), JSON.stringify({}))
let q
try { q = settings.settingsProblems(settings.parseProjects({ project_settings: [bare] })) } catch (e) { q = ["THROW " + e] }
cell("no file on branch: plain line, no crash", !q.some((x) => x.includes("не закоммичен") || x.startsWith("THROW")), JSON.stringify(q))
console.log(fail ? `${fail} FAIL` : "all ok")
process.exit(fail ? 1 : 0)
