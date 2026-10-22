// Self-test (node >= 24):  node test/crew-config-diverge.test.mjs
// Task 029/150: the plugin reads committed settings from its configured branch; the doctor names the active and target refs.
// /crew plus the side panel keep one line
// on screen while the files differ; no divergence means silence; a missing branch file gets its own plain line.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-diverge-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
process.env.CREW_HARNESS_DIVERGE_TTL_MS = "0"
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const settings = await import(pathToFileURL(path.join(plugin, "settings.ts")).href)
const divergence = await import(pathToFileURL(path.join(plugin, "config-diverge.ts")).href)
const status = await import(pathToFileURL(path.join(plugin, "status.ts")).href)
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" })
const cfgDir = path.join(tmp, "proj", "proj-settings")
const file = path.join(cfgDir, ".opencode", "crew-harness.json")
mkdirSync(path.dirname(file), { recursive: true })
git(cfgDir, "init", "-q", "-b", "main")
const write = (obj) => writeFileSync(file, JSON.stringify({ project: "proj", root: "..", ...obj }, null, 2))
const commit = (obj) => { write(obj); git(cfgDir, "add", "-A"); git(cfgDir, "commit", "-q", "--allow-empty", "-m", "s") }
const doctor = () => settings.settingsProblems(settings.parseProjects({ projects: [cfgDir] }))
const diverge = (ps) => ps.filter((p) => p.includes("файл рабочей копии отличается от ref сравнения"))
const sum = () => status.formatStatuses([{ session: "s1", project: "proj", role: "worker", title: "t", state: "idle", detail: "свободна", watches: [], asked: [], tasks: [] }])
const side = () => status.sidebarLines([], Date.now(), "proj").rows.map((r) => status.sideText(r)).join("\n")
let fail = 0
const cell = (n, ok, d) => { console.log(`${ok ? "ok  " : "FAIL"} ${n}${ok ? "" : " :: " + d}`); if (!ok) fail++ }

commit({ answer_max: 1 })
let p = doctor()
cell("same files: doctor silent", diverge(p).length === 0, JSON.stringify(p))
cell("same files: /crew silent", !sum().includes("⚠ off-branch"), sum())
cell("same files: panel silent", !side().includes("не на ветке"), side())

write({ answer_max: 1, tier_max: "light" })
p = doctor()
cell("key only in working copy: doctor names active and actual comparison refs exactly", diverge(p).length === 1 && diverge(p)[0] === "проект proj: файл рабочей копии отличается от ref сравнения (main): действуют настройки из ref (main); ключи: tier_max (предупреждение, не ошибка; закоммить и влей правку или откати файл)", JSON.stringify(p))
cell("warning names only the differing key", !diverge(p)[0]?.includes("answer_max"), JSON.stringify(p))
cell("key only in working copy: /crew counter (⚠ off-branch, the keys are in /crew-doctor)", sum().includes("⚠ off-branch") && sum().includes("/crew-doctor"), sum())
cell("key only in working copy: panel line", side().includes("не на ветке: tier_max"), side())

commit({ answer_max: 1, tier_max: "light" })
cell("after commit: warning gone", diverge(doctor()).length === 0 && !sum().includes("⚠ off-branch"), sum())
cell("same working file as branch has no divergence", divergence.configDivergence(cfgDir, ".opencode/crew-harness.json", "main").kind === "same", "expected same")
git(cfgDir, "update-ref", "refs/remotes/origin/main", "refs/heads/main~1")
const localVsTarget = divergence.configDivergence(cfgDir, ".opencode/crew-harness.json", "main")
cell("local committed settings differ from target: active and compare refs are exact", localVsTarget.kind === "differ" && localVsTarget.activeRef === "main" && localVsTarget.compareRef === "origin/main", JSON.stringify(localVsTarget))
cell("target-only active ref is named truthfully", divergence.divergenceProblem("proj", { kind: "differ", keys: ["x"], activeRef: "origin/main", compareRef: "origin/main" }).startsWith("проект proj: файл рабочей копии отличается от ref сравнения (origin/main): действуют настройки из ref (origin/main)"), "target active wording")

cell("local ref and compare ref stay separately identified", divergence.divergenceProblem("proj", { kind: "differ", keys: ["tier_max"], activeRef: "main", compareRef: "origin/main" }) === "проект proj: файл рабочей копии отличается от ref сравнения (origin/main): действуют настройки из ref (main); ключи: tier_max (предупреждение, не ошибка; закоммить и влей правку или откати файл)", "exact active/compare wording")
cell("target ref is active when it is the configured loader ref", divergence.divergenceProblem("proj", { kind: "differ", keys: ["tier_max"], activeRef: "origin/main", compareRef: "origin/main" }).includes("действуют настройки из ref (origin/main)"), "target is active")
cell("distinct changed keys are sorted", JSON.stringify(divergence.differingKeys({ z: 1, a: 2 }, { z: 2, b: 3 })) === JSON.stringify(["a", "b", "z"]), "key ordering")
cell("no warning for same divergence", divergence.divergenceProblem("proj", { kind: "same" }) === undefined, "same is silent")

const refsRepo = path.join(tmp, "refs")
const refsFile = ".opencode/crew-harness.json"
mkdirSync(path.join(refsRepo, ".opencode"), { recursive: true })
git(refsRepo, "init", "-q", "-b", "main")
const refsPath = path.join(refsRepo, refsFile)
const writeRefs = (obj) => writeFileSync(refsPath, JSON.stringify(obj))
const commitRefs = (obj) => { writeRefs(obj); git(refsRepo, "add", "-A"); git(refsRepo, "commit", "-q", "--allow-empty", "-m", "refs") }
commitRefs({ project: "refs", value: 1 })
cell("real repo without origin: equal work and loader branch is same", divergence.configDivergence(refsRepo, refsFile, "main").kind === "same", "expected same")
git(refsRepo, "update-ref", "refs/remotes/origin/main", "refs/heads/main")
commitRefs({ project: "refs", value: 2 })
let d = divergence.configDivergence(refsRepo, refsFile, "main")
cell("real local-vs-origin divergence names active and actual comparison refs", d.kind === "differ" && d.keys.join() === "value" && d.activeRef === "main" && d.compareRef === "origin/main", JSON.stringify(d))
cell("doctor text names local active ref separately from actual compare ref", divergence.divergenceProblem("refs", d) === "проект refs: файл рабочей копии отличается от ref сравнения (origin/main): действуют настройки из ref (main); ключи: value (предупреждение, не ошибка; закоммить и влей правку или откати файл)", JSON.stringify(d))
d = divergence.configDivergence(refsRepo, refsFile, "origin/main")
cell("configured origin/main is read and reported literally, never origin/origin/main", d.kind === "differ" && d.activeRef === "origin/main" && d.compareRef === "origin/main" && d.keys.join() === "value", JSON.stringify(d))
git(refsRepo, "update-ref", "refs/remotes/origin/missing", "refs/heads/main")
d = divergence.configDivergence(refsRepo, refsFile, "missing")
cell("missing configured active ref is a note, not falsely active origin/missing", d.kind === "note" && /настроенном ref missing/.test(d.text) && !d.text.includes("действуют настройки из ref"), JSON.stringify(d))
git(refsRepo, "update-ref", "-d", "refs/remotes/origin/main")
d = divergence.configDivergence(refsRepo, refsFile, "main")
cell("without remote ref, actual comparison falls back to main", d.kind === "same" || (d.kind === "differ" && d.compareRef === "main"), JSON.stringify(d))
cell("note and same states stay absent from panel line", divergence.divergenceLine({ kind: "note", text: "no ref" }) === undefined && divergence.divergenceLine({ kind: "same" }) === undefined, "non-divergence line")

const bare = path.join(tmp, "proj2", "s2")
mkdirSync(path.join(bare, ".opencode"), { recursive: true })
git(bare, "init", "-q", "-b", "main")
git(bare, "commit", "-q", "--allow-empty", "-m", "i")
writeFileSync(path.join(bare, ".opencode", "crew-harness.json"), JSON.stringify({ project: "proj2", root: ".." }))
let q
try { q = settings.settingsProblems(settings.parseProjects({ projects: [bare] })) } catch (e) { q = ["THROW " + e] }
cell("no file on branch: plain line, no crash", q.some((x) => x.includes("proj2") && x.includes("не закоммичен")) && !q.some((x) => x.startsWith("THROW")), JSON.stringify(q))
console.log(fail ? `${fail} FAIL` : "all ok")
process.exit(fail ? 1 : 0)
