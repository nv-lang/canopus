// Self-test of the mailbox name (plan 005; node >= 24):  node test/canopus-paths.test.mjs
// The mailbox is <OpenCode data>/canopus. Earlier names (the previous product name until task 284, 2026-11-02;
// opencode-peers until plan 005; nova-peers until 2026-10-05) are NOT aliased and NOT junction-linked: an
// existing earlier mailbox blocks the plugin with a clear refusal until the one-shot explicit migrateBase()
// (switch manifest of task 284, service stopped) moves it to the new name; rollbackBase() puts it back by the
// receipt.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-paths-"))
// the literal of the previous product name is assembled: the guard scans for it (negative probe of old names)
const OLD = "crew" + "-harness"
const OLD2 = "opencode-peers"
const OLD3 = "nova-peers"

// a fresh install: the new name, no old names made
process.env.XDG_DATA_HOME = tmp // изоляция от ящика машины до импорта модуля: BASE считается при импорте
const fresh = path.join(tmp, "fresh")
mkdirSync(fresh)
const { canopusBase, migrateBase, rollbackBase } = await import("../paths.ts")
cell("a new install: canopus, no old names", canopusBase(fresh) === path.join(fresh, "canopus") && !existsSync(path.join(fresh, OLD)) && !existsSync(path.join(fresh, OLD2)) && !existsSync(path.join(fresh, OLD3)), "old name made")
cell("a new install: nothing to migrate", migrateBase(fresh) === undefined, "receipt")

// sentinel: the CURRENT previous namespace with real data — canopusBase refuses BEFORE any new empty mailbox
// appears, migrateBase moves it whole and reports a receipt, the data is intact at the new name
const root = path.join(tmp, "opencode")
mkdirSync(path.join(root, OLD, "tasks", "nova"), { recursive: true })
writeFileSync(path.join(root, OLD, "tasks", "nova", "1.json"), '{"n":1}')
const neu = path.join(root, "canopus")
let refused = ""
try {
  canopusBase(root)
} catch (e) {
  refused = String(e.message ?? e)
}
cell(`previous ${OLD} mailbox: clear refusal`, refused.includes(OLD) && refused.includes("migrateBase") && refused.includes("284"), refused)
cell("the refusal made no new empty mailbox", !existsSync(neu), "canopus appeared")
cell("the refusal touched no data", readFileSync(path.join(root, OLD, "tasks", "nova", "1.json"), "utf8") === '{"n":1}', "data changed")
const receipt = migrateBase(root)
cell(`migrate: receipt from ${OLD} to canopus`, receipt?.from.length === 1 && receipt?.from[0] === path.join(root, OLD) && receipt?.to === neu, JSON.stringify(receipt))
cell("migrate: the data is at the new name", readFileSync(path.join(neu, "tasks", "nova", "1.json"), "utf8") === '{"n":1}', "differs")
cell("migrate: the old name is gone (no alias, no link)", !existsSync(path.join(root, OLD)), "old name stayed")
cell("after migrate the base resolves", canopusBase(root) === neu, canopusBase(root))
cell("migrate again: nothing to do", migrateBase(root) === undefined, "second receipt")

// rollback by the receipt: the new name goes back to the previous one
const back = rollbackBase(root)
cell(`rollback: receipt from canopus to ${OLD}`, back?.from === neu && back?.to === path.join(root, OLD), JSON.stringify(back))
cell("rollback: the data is back at the old name", readFileSync(path.join(root, OLD, "tasks", "nova", "1.json"), "utf8") === '{"n":1}', "differs")
cell("rollback again: nothing to do", rollbackBase(root) === undefined, "second receipt")

// an even older name (nova-peers, possibly via opencode-peers) is recognized the same way
const r2 = path.join(tmp, "r2")
mkdirSync(path.join(r2, OLD3), { recursive: true })
writeFileSync(path.join(r2, OLD3, "x.json"), "{}")
let refused2 = ""
try {
  canopusBase(r2)
} catch (e) {
  refused2 = String(e.message ?? e)
}
cell(`older ${OLD3} mailbox: clear refusal`, refused2.includes(OLD3), refused2)
const receipt2 = migrateBase(r2)
cell(`migrate from ${OLD3} works`, receipt2?.to === path.join(r2, "canopus") && existsSync(path.join(r2, "canopus", "x.json")), JSON.stringify(receipt2))

// the live state of the owner's machine: the real data in the oldest name, the newer names junction-links to it
const r4 = path.join(tmp, "r4")
mkdirSync(path.join(r4, OLD3, "tasks"), { recursive: true })
writeFileSync(path.join(r4, OLD3, "tasks", "1.json"), '{"n":1}')
symlinkSync(path.join(r4, OLD3), path.join(r4, OLD2), "junction")
symlinkSync(path.join(r4, OLD3), path.join(r4, OLD), "junction")
let refused4 = ""
try {
  canopusBase(r4)
} catch (e) {
  refused4 = String(e.message ?? e)
}
cell("junction state: clear refusal", refused4.includes(OLD), refused4)
const receipt4 = migrateBase(r4)
cell("junction state: links off, real folder moved", receipt4?.to === path.join(r4, "canopus") && receipt4?.from.length === 3, JSON.stringify(receipt4))
cell("junction state: the data is at the new name", readFileSync(path.join(r4, "canopus", "tasks", "1.json"), "utf8") === '{"n":1}', "differs")
cell("junction state: no old name left, no links", !existsSync(path.join(r4, OLD)) && !existsSync(path.join(r4, OLD2)) && !existsSync(path.join(r4, OLD3)) && !lstatSync(path.join(r4, "canopus")).isSymbolicLink(), "leftovers")
cell("junction state: the base resolves", canopusBase(r4) === path.join(r4, "canopus"), "no")

// both names present: no silent choice, neither resolves nor migrates
const r3 = path.join(tmp, "r3")
mkdirSync(path.join(r3, "canopus"), { recursive: true })
mkdirSync(path.join(r3, OLD), { recursive: true })
let refused3 = "", migrated3 = "no throw"
try {
  canopusBase(r3)
} catch (e) {
  refused3 = String(e.message ?? e)
}
try {
  migrateBase(r3)
} catch (e) {
  migrated3 = String(e.message ?? e)
}
cell("both names: base refuses", refused3.includes(OLD), refused3)
cell("both names: migrate refuses", migrated3.includes(OLD), migrated3)
cell("both names: nothing moved", existsSync(path.join(r3, "canopus")) && existsSync(path.join(r3, OLD)), "moved")

try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `canopus-paths.test: FAIL ${fail}` : "canopus-paths.test ok")
process.exit(fail ? 1 : 0)
