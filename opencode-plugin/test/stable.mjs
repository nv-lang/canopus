// Stability run: the given test files N times, J at a time (default 8), and the number of red runs per file.
//   node test/stable.mjs [--runs N] [--jobs J] [--cores C] [--timeout S] [--all] [file ...]
// Without files and without --all it runs the files named in STABLE_FILES below. --all takes every file of
// the "test" script of package.json (this is how the whole set is run in parallel: --runs 1 --all).
// --cores C pins this process, and so every test it starts, to the first C processor cores (Windows): J tests on C cores is
// a loaded machine, which is how the flaky tests of task 085 are made red on purpose without more processes.
// A red run prints the head of its output. The exit code is 1 if any run was red.
import { execFileSync, spawn } from "node:child_process"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "..")
// the files that were flaky under load (tasks 085, 088); `npm run test:stable` runs them
export const STABLE_FILES = [
  "canopus-landing-golden",
  "canopus-progress",
  "canopus-step-yield",
  "canopus-hung-turn",
  "canopus-hung-resume",
  "canopus-owner-answer",
  "canopus-stale-diag",
  "canopus-stuck",
  "canopus-stuck-clear",
  "canopus-acceptance-file",
  "canopus-profiles-layer",
  "canopus-answer-journal",
  "canopus-answer-golden",
  "canopus-profiles-select",
  "canopus-push",
  "canopus-plan-task",
  "canopus-landing-slot",
  "canopus-mcp",
  // task 088: the lock release race and the rest of the files that were red under load
  "canopus-landing-race",
  "canopus-landing-release",
  "canopus-nudge-matrix",
  "canopus-answer-flow",
  "canopus-landing-tip",
  "canopus-landing-gate",
  "canopus-review",
  "canopus-idle-tab",
  "canopus-esc-question",
  "canopus-owner-wait",
  "canopus-submit",
  "canopus-gate-stop",
  "canopus-answer-loop",
  // task 096: timing of the delay and the interrupt
  "canopus-form-auto-flow",
  // task 111: a service pass and the database in one file
  "canopus-panel-busy",
  // task 120: the passes of the service over a hand-made database
  "canopus-form-record-flow",
  // task 127: the glued-words guard over the setup of the plugin and canopus_send
  "canopus-glued",
  "canopus-glued-hooks",
]

const args = process.argv.slice(2)
let runs = 10
let jobs = 8
let timeoutS = 1800 // canopus-landing-gate alone takes about 4 minutes, several times that on a loaded machine (task 088)
let all = false
let cores = 0
const names = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--runs") runs = Number(args[++i])
  else if (args[i] === "--jobs") jobs = Number(args[++i])
  else if (args[i] === "--timeout") timeoutS = Number(args[++i])
  else if (args[i] === "--cores") cores = Number(args[++i])
  else if (args[i] === "--all") all = true
  else names.push(args[i])
}
let files = names
if (all) {
  const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts
  const script = [scripts.pretest, scripts.test].filter(Boolean).join(" && ")
  execFileSync(process.execPath, [path.join(here, "cleanup-tmp.mjs")], { stdio: "inherit" })
  files = [...new Set([...script.matchAll(/node (test\/[\w.-]+\.mjs)/g)].map((m) => m[1]).filter((f) => !/cleanup-tmp/.test(f)))]
} else if (!files.length) files = STABLE_FILES
files = files.map((f) => (f.endsWith(".mjs") ? f : `test/${f}.test.mjs`).replace(/^\.?\//, ""))

if (cores > 0) {
  if (process.platform !== "win32") console.log("stable: --cores works on Windows only, ignored")
  else {
    const mask = 2 ** Math.min(cores, 30) - 1
    try {
      execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${process.pid}).ProcessorAffinity = ${mask}`], { stdio: "ignore", windowsHide: true })
    } catch (e) {
      console.log(`stable: could not pin to ${cores} cores: ${e.message}`)
    }
  }
}

const queue = []
for (let r = 0; r < runs; r++) for (const f of files) queue.push({ f, r })
const red = new Map(files.map((f) => [f, 0]))
const total = new Map(files.map((f) => [f, 0]))
const reports = []
const t0 = Date.now()

const runOne = ({ f }) =>
  new Promise((resolve) => {
    const begun = Date.now()
    const state = mkdtempSync(path.join(os.tmpdir(), "canopus-test-native-state-"))
    const isolate = pathToFileURL(path.join(here, "native-isolation.mjs")).href
    const context = new URL(pathToFileURL(path.join(here, "instance-preload.mjs")).href)
    context.searchParams.set("config", path.join(state, "canopus", "plugin", "config.json"))
    const options = `${process.env.NODE_OPTIONS ?? ""} --import=${isolate} --import=${context.href}`.trim()
    const child = spawn(process.execPath, [f], { cwd: root, env: { ...process.env, XDG_STATE_HOME: state, XDG_DATA_HOME: path.join(state, "opencode-data"), NODE_OPTIONS: options }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    const timer = setTimeout(() => child.kill(), timeoutS * 1000)
    child.on("close", (code) => {
      clearTimeout(timer)
      rmSync(state, { recursive: true, force: true })
      total.set(f, total.get(f) + 1)
      console.log(`stable finished ${f}: exit ${code}, ${Math.round((Date.now() - begun) / 1000)} s`)
      if (code !== 0) {
        red.set(f, red.get(f) + 1)
        reports.push(`--- RED ${f} (exit ${code})\n${out}`)
      }
      resolve()
    })
  })

const worker = async () => {
  for (let job = queue.shift(); job; job = queue.shift()) await runOne(job)
}
await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, queue.length)) }, worker))

for (const r of reports) console.log(r)
let bad = 0
for (const f of files) {
  if (red.get(f)) bad += red.get(f)
  console.log(`${red.get(f) ? "RED " : "ok  "} ${f}: ${red.get(f)} red of ${total.get(f)}`)
}
console.log(`stable: ${bad} red of ${files.length * runs} runs, ${jobs} at a time, ${Math.round((Date.now() - t0) / 1000)} s`)
process.exit(bad ? 1 : 0)
