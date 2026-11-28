// Preparation only: create fresh isolated copies and a manifest; never run measured children.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { schedule } from "./heap-observation.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../../..")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const target = process.argv[2]
assert(target && path.isAbsolute(target), "provide an approved absolute temp parent")
const base = mkdtempSync(path.join(target, "crew-harness-146-heap-"))
const original = execFileSync("git", ["show", "HEAD:opencode-plugin/test/crew-progress.test.mjs"], { cwd: repo, encoding: "utf8" })
assert.equal(hash(original), hash(execFileSync("git", ["cat-file", "blob", "d1763b718e3c3d313f0d6691fadddbddfa6fb3eb"], { cwd: repo })))
const scanner = readFileSync(path.join(repo, "opencode-plugin/progress-scan.ts"), "utf8").replaceAll("\r\n", "\n")
assert.equal(hash(scanner), "434ddf777bf0cd8b430dd2746bac161e1a711c75623061cdc74ce97057dcc517")
const fixture0 = JSON.parse(readFileSync(path.join(here, "fixture-manifest-clean-A.json"), "utf8"))
const { schema, ...fixture } = fixture0
const copy = (source, dest) => {
  mkdirSync(dest)
  for (const name of readdirSync(source)) {
    if (["node_modules", ".git"].includes(name)) continue
    const from = path.join(source, name)
    const to = path.join(dest, name)
    const stat = lstatSync(from)
    assert(!stat.isSymbolicLink())
    if (stat.isDirectory()) copy(from, to)
    else { assert(stat.isFile()); copyFileSync(from, to) }
  }
}
const once = (text, needle, replacement) => {
  assert.equal(text.split(needle).length, 2, `replacement not unique: ${needle.slice(0, 60)}`)
  return text.replace(needle, replacement)
}
const fixtureCode = `const heapFixture = () => {
  const files = heavyFiles.map((file, index) => {
    const b = readFileSync(file)
    const job = '0' + String(Math.floor(index / 2) + 1).padStart(2, '0') + '-job'
    return { label: (index % 2 ? 'tree/' : 'main/') + job + '/progress.log', lines: b.toString('utf8').split('\\n').length - 1, bytes: b.length, sha256: heapHash(b) }
  })
  return { journals: files.length, totalLines: files.reduce((n,f)=>n+f.lines,0), totalBytes: files.reduce((n,f)=>n+f.bytes,0), files }
}
const heapFixtureBefore = heapFixture()
`
const imports = ["progress.ts", "progress-scan.ts", "progress-view.ts", "status.ts", "settings.ts", "core.ts", "tui.ts", "sidebar.tsx", "progress-sidebar.tsx"]
let entry = original
entry = once(entry, 'import path from "node:path"', 'import path from "node:path"\nimport { createHash as heapCreateHash } from "node:crypto"\nimport { observeHeap } from "./heap-observation.mjs"\nconst heapHash = (b) => heapCreateHash("sha256").update(b).digest("hex")')
entry = once(entry, "const HNOW = sec(11, 59)", fixtureCode + "const HNOW = sec(11, 59)")
const begin = entry.indexOf("{\n  const m = measured(() => {\n    const read = []\n    const cold = []")
assert(begin >= 0)
const end = entry.indexOf("  const { c, r } = m", begin)
assert(end > begin)
const observation = `{
  const record = await observeHeap({ measured, cold: () => S.createScanner().scanAll(heavy.main, HNOW), read: () => heavyFiles.forEach((f) => readFileSync(f)), mode: process.env.PERF_MODE, processIndex: Number(process.env.PERF_PROCESS_INDEX) })
  record.fixtureBefore = heapFixtureBefore
  record.fixtureAfter = heapFixture()
  record.imports = ${JSON.stringify(imports)}.map((name) => ({ name, resolved: import.meta.resolve('../' + name), sha256: heapHash(readFileSync(new URL('../' + name, import.meta.url))) }))
  record.slowChecksum = globalThis.__heapSlowChecksum ?? null
  console.log('HEAP_PROBE ' + JSON.stringify(record))
  const m = record.result
`
entry = entry.slice(0, begin) + observation + entry.slice(end)
const manifest = { schedule, nodeExeSha256: hash(readFileSync(process.execPath)), fixture, arms: {} }
for (const arm of ["C", "H", "D"]) {
  const root = path.join(base, arm)
  copy(path.join(repo, "opencode-plugin"), root)
  copyFileSync(path.join(here, "heap-observation.mjs"), path.join(root, "test/heap-observation.mjs"))
  writeFileSync(path.join(root, "test/crew-progress.heap.mjs"), entry)
  let scan = scanner
  if (arm === "D") scan = once(scan, 'lines: parseJournal(r.bytes)', 'lines: (() => { const parsed = parseJournal(r.bytes); for (let i = 0; i < 8; i++) globalThis.__heapSlowChecksum = ((globalThis.__heapSlowChecksum ?? 0) + parseJournal(r.bytes).length) >>> 0; return parsed })()')
  writeFileSync(path.join(root, "progress-scan.ts"), scan)
  const files = []
  const walk = (rel = "") => {
    for (const name of readdirSync(path.join(root, rel)).sort()) {
      const file = path.join(rel, name)
      if (lstatSync(path.join(root, file)).isDirectory()) walk(file)
      else files.push({ file: file.replaceAll("\\", "/"), sha256: hash(readFileSync(path.join(root, file))) })
    }
  }
  walk()
  manifest.arms[arm] = { root: arm, entry: "test/crew-progress.heap.mjs", files,
    imports: imports.map((name) => ({ name, resolved: pathToFileURL(path.join(root, name)).href, sha256: hash(readFileSync(path.join(root, name))) })) }
}
writeFileSync(path.join(base, "frozen-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ preparedRoot: base, manifestSha256: hash(readFileSync(path.join(base, "frozen-manifest.json"))), measuredChildrenStarted: 0 }))
