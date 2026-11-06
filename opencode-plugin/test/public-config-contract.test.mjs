// Real public configuration contract: no fixture writer, policy adapter or fake parser.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { initializePluginConfig } from "../config-context.ts"
const tmp = mkdtempSync(path.join(os.tmpdir(), "canopus-public-config-"))
const config = path.join(tmp, "plugin", "config.json")
mkdirSync(path.dirname(config), { recursive: true })
initializePluginConfig({ config })
const put = value => writeFileSync(config, JSON.stringify(value))
const git = (dir, ...args) => execFileSync("git", ["-C", dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.org", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
try {
  put({})
  const core = await import("../core.ts")
  const settings = await import("../settings.ts")
  const { SCHEMA_KEYS, invalid } = await import("../config-schema.ts")
  const { globalConfig } = await import("../plugin-config.ts")
  assert.equal(SCHEMA_KEYS.length, 10)
  assert.ok(invalid("merge_precheck", "off"))
  put({ defaults: { merge_precheck: "off" } })
  assert.throws(() => globalConfig(), /unsupported setting merge_precheck/)
  put({})
  mkdirSync(path.join(tmp, "plugin", "data"), { recursive: true })
  writeFileSync(path.join(tmp, "plugin", "data", "projects.json"), JSON.stringify({ projects: { stale: tmp } }))
  assert.deepEqual(core.loadProjects(), [])
  const repo = path.join(tmp, "project"), tree = path.join(tmp, "unrelated-tree-name")
  mkdirSync(path.join(repo, ".canopus", "plugin"), { recursive: true })
  git(repo, "init", "-q", "-b", "main")
  const file = path.join(repo, ".canopus", "plugin", "config.json")
  writeFileSync(file, JSON.stringify({ owner_language: "Russian", inflight_limit: 7, profile_set: "shared" }))
  git(repo, "add", "--", ".canopus/plugin/config.json"); git(repo, "commit", "-qm", "public configuration")
  git(repo, "remote", "add", "origin", "https://example.invalid/old-name.git")
  git(repo, "worktree", "add", "-qb", "fixture", tree)
  writeFileSync(file, JSON.stringify({ owner_language: "English", inflight_limit: 9, profile_set: "shared" }))
  const projects = settings.parseProjects({ project_settings: [repo] })
  core.setProjects(projects, {})
  assert.equal(core.loadConfig(repo).ownerLanguage, "Russian")
  assert.equal(core.loadConfig(repo).inflightLimit, 7)
  assert.equal(settings.parseProjects({ project_settings: [tree] })[0].name, "project")
  assert.equal(core.projectOf(tree, projects), "project")
  const resolved = core.loadConfig(repo)
  assert.equal(resolved.mergePrecheck, "required"); assert.equal(resolved.acceptedSlot, "free")
  writeFileSync(path.join(repo, ".canopus", "plugin", "local.json"), JSON.stringify({ owner_language: "English", profile_set: "personal" }))
  assert.equal(core.loadConfig(repo).ownerLanguage, "English")
  const { profileState } = await import("../profile-layer.ts")
  assert.equal(profileState(repo).name, "personal")
  const { writePersonalSettings } = await import("../plugin-config.ts")
  writePersonalSettings(repo, { profile_set: false })
  assert.equal(profileState(repo).name, undefined)
  assert.equal(JSON.parse(readFileSync(file, "utf8")).profile_set, "shared")
  const shown = core.configShowText(repo)
  assert.match(shown, /personal/)
  assert.doesNotMatch(shown, /merge_precheck =|stall_minutes =|branch_name =/)
  writeFileSync(path.join(repo, ".canopus", "plugin", "local.json"), JSON.stringify({ merge_precheck: "off" }))
  assert.throws(() => core.loadConfig(repo), /unsupported setting merge_precheck/)
  assert.throws(() => settings.parseProjects({ projects: [repo] }), /projects was removed/)
  // A non-main accepted branch is derived once from Git, never from the task branch.
  const custom = path.join(tmp, "custom-default")
  mkdirSync(path.join(custom, ".canopus/plugin"), { recursive: true })
  git(custom, "init", "-q", "-b", "trunk")
  writeFileSync(path.join(custom, ".canopus/plugin/config.json"), JSON.stringify({ tasks_dir: "" }))
  git(custom, "add", ".");git(custom, "commit", "-qm", "custom default")
  git(custom, "update-ref", "refs/remotes/origin/trunk", "HEAD")
  git(custom, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk")
  git(custom, "checkout", "-qb", "task/work")
  core.setProjects(settings.parseProjects({ project_settings: [custom] }), {})
  assert.equal(core.loadConfig(custom).targetBranch, "trunk")
  assert.equal(core.loadConfig(custom).tasksDir, "")
  assert.equal(core.loadConfig(custom).plansDir, "")
  // Global-only virtual catalogs retain editing without inventing a settings-repository pointer.
  const virtualRoot = path.join(tmp, "virtual")
  mkdirSync(virtualRoot)
  put({ project_settings: [{ project: "virtual", root: virtualRoot }], local: { virtual: { model_profiles: { family: { light: { model: "x/y", context: 10, output: 2 } } } } } })
  core.setProjects(core.loadProjects(), {})
  const layer = await import("../profile-layer.ts")
  const beforeVirtual = layer.profileState(virtualRoot)
  const draft = layer.draftOf(beforeVirtual)
  layer.dSetProfile(draft, "family", "light", { model: "x/z", context: 20, output: 4 })
  assert(layer.writeDraft(beforeVirtual, draft).ok)
  assert.equal(layer.profileState(virtualRoot).data.profiles.family.light.model, "x/z")
  assert.equal(globalConfig().local.virtual.model_profiles.family.light.model, "x/z")
  assert.equal(JSON.parse(readFileSync(config, "utf8")).project_settings[0].project, "virtual")
  // Renaming an enabled set changes two files; failure must restore both byte-for-byte.
  const nativeFs = (await import("node:fs")).default
  const { syncBuiltinESMExports } = await import("node:module")
  const exerciseAtomicRename = async (root, catalogFile, virtual) => {
    const personal = path.join(root, ".canopus/plugin/local.json")
    mkdirSync(path.dirname(personal), {recursive:true})
    writeFileSync(personal, JSON.stringify({owner_language:"English",profile_set:"enabled"}))
    const before = layer.profileState(root)
    const rename = layer.draftOf(before)
    rename.sets = {...rename.sets, renamed: rename.sets.enabled}
    delete rename.sets.enabled
    rename.name = "renamed"
    const catalogBytes = readFileSync(catalogFile), personalBytes = readFileSync(personal)
    writeFileSync(personal, "{broken personal JSON")
    assert.equal(layer.writeDraft(before,rename).ok,false,"bad personal layer refuses before shared catalog mutation")
    assert.deepEqual(readFileSync(catalogFile),catalogBytes)
    assert.equal(readFileSync(personal,"utf8"),"{broken personal JSON")
    writeFileSync(personal,personalBytes)
    for (const afterRename of [false,true]) {
      const originalRename = nativeFs.renameSync
      let injected=false
      nativeFs.renameSync = (from,to) => {
        if (!injected && settings.normPath(String(to)) === settings.normPath(personal)) {
          injected=true
          if(afterRename) originalRename(from,to)
          throw Error("fixture personal rename fault")
        }
        return originalRename(from,to)
      }
      syncBuiltinESMExports()
      let result
      try { result=layer.writeDraft(before,rename) }
      finally { nativeFs.renameSync=originalRename;syncBuiltinESMExports() }
      assert.equal(injected,true,"fault occurs only after the shared catalog write: " + JSON.stringify(result))
      assert.equal(result.ok,false,"write failure is reported")
      assert.deepEqual(readFileSync(catalogFile),catalogBytes,"shared catalog rollback is exact")
      assert.deepEqual(readFileSync(personal),personalBytes,"personal rollback also handles ambiguous post-rename failure")
      assert.equal(layer.profileState(root).name,"enabled")
      assert.ok(layer.profileState(root).data.sets.enabled)
      assert.equal(layer.profileState(root).data.sets.renamed,undefined)
    }
    assert.equal(layer.writeDraft(before,rename).ok,true,"normal retry completes both destinations")
    assert.equal(layer.profileState(root).name,"renamed")
    assert.ok(layer.profileState(root).data.sets.renamed)
    assert.equal(layer.profileState(root).data.sets.enabled,undefined)
    if(virtual) assert.equal(globalConfig().local.untouched.inflight_limit,3,"another virtual project remains unchanged")
  }
  const setCells={develop:{family:"family",tier:"light"},accept:{family:"family",tier:"light"}}
  const currentGlobal=globalConfig()
  put({...currentGlobal,local:{...currentGlobal.local,virtual:{...currentGlobal.local.virtual,profile_sets:{enabled:setCells}},untouched:{inflight_limit:3}}})
  await exerciseAtomicRename(virtualRoot,config,true)
  put({project_settings:[repo]})
  core.setProjects(core.loadProjects(),{})
  writeFileSync(file,JSON.stringify({owner_language:"Russian",model_profiles:{family:{light:{model:"x/y",context:10,output:2}}},profile_sets:{enabled:setCells}}))
  await exerciseAtomicRename(repo,file,false)
  console.log("public config: exact schema, strict overrides, Git source, linked identity and no snapshot fallback passed")
} finally { rmSync(tmp, { recursive: true, force: true }) }
