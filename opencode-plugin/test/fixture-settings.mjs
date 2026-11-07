// Feature fixtures inject code policy explicitly. Config-contract tests use real fs/parser instead.
import path from "node:path"
import os from "node:os"
import { writeFileSync, readFileSync, mkdirSync, existsSync, realpathSync, rmSync } from "node:fs"
import { pluginConfigContext } from "../config-context.ts"
import { mergeConfig } from "../plugin-config.ts"
import { PROJECT_KEYS, INTERNAL_POLICY, initializePolicySource } from "../resolved-policy.ts"

import { initializeRuntimeSource, RUNTIME_POLICY } from "../runtime-policy.ts"
const runtime = {}
const runtimeSource = () => runtime
export function setFixtureRuntime(key, value) {
  const name = key.replace(/^CANOPUS_/, "")
  if (!(name in RUNTIME_POLICY)) throw new Error(`unknown fixture runtime dependency ${name}`)
  runtime[name] = typeof RUNTIME_POLICY[name] === "number" || name === "PROCESS_START" ? Number(value) : value
}
export function getFixtureRuntime(key) { return runtime[key.replace(/^CANOPUS_/, "")] ?? RUNTIME_POLICY[key.replace(/^CANOPUS_/, "")] }
export function deleteFixtureRuntime(key) { delete runtime[key.replace(/^CANOPUS_/, "")] }

const policies = new Map()
const explicitPolicies = new Map()
const policyAliases = new Map()
const identities = new Map()
const fixtureSettings = new Map()
const virtualSettings = new Map()
const canonicalFixturePath = file => {
  const absolute = path.resolve(file)
  try { return realpathSync.native(absolute) }
  catch { const parent = path.dirname(absolute); return parent === absolute ? absolute : path.join(canonicalFixturePath(parent), path.basename(absolute)) }
}
const norm = file => canonicalFixturePath(file).replaceAll("\\", "/").toLowerCase()
const source = directory => { const key = policyAliases.get(norm(directory)) ?? norm(directory); return { ...(policies.get(key) ?? {}), ...(explicitPolicies.get(key) ?? {}) } }
export function installFixturePolicy() { initializePolicySource(source); initializeRuntimeSource(runtimeSource) }
const isPublic = key => PROJECT_KEYS.includes(key)
const split = value => {
  const settings = {}, policy = {}, identity = {}
  for (const [key, item] of Object.entries(value)) {
    if (["project", "root", "branch"].includes(key)) identity[key] = item
    else if (key in INTERNAL_POLICY && !isPublic(key)) policy[key] = item
    else settings[key] = item // unknown keys remain observable to strict production validation
  }
  return { settings, policy, identity }
}

export function writeFixtureFile(file, value, ...options) {
  const normalized = String(file).replaceAll("\\", "/")
  if (normalized.endsWith("/.canopus/plugin/config.json")) {
    try {
      const raw = JSON.parse(String(value))
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const folder = path.dirname(path.dirname(path.dirname(String(file))))
        const parts = split(raw)
        fixtureSettings.set(norm(folder), parts.settings)
        identities.set(norm(folder), parts.identity)
        policies.set(norm(folder), parts.policy)
        value = JSON.stringify(parts.settings)
        const target=virtualSettings.get(norm(folder))
        if(target){const file=path.join(target.root,".canopus/plugin/config.json");mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(mergeConfig(parts.settings,target.overrides)))}

      }
    } catch {} // malformed JSON tests must still write malformed JSON
  }
  return writeFileSync(file, value, ...options)
}

export function fixtureProjects(core, options) {
  const old = options?.project_settings ?? options?.projects ?? []
  const entries = Array.isArray(old) ? old : Object.entries(old).map(([project, root]) => ({ project, root }))
  const projects = core.parseProjects({ project_settings: entries })
  for (const project of projects) {
    const folder = project.dir
    const identity = folder && identities.get(norm(folder))
    if (!identity) continue
    if (identity.project) project.name = identity.project
    if (identity.root) {
      project.rootPath = path.resolve(folder, identity.root)
      project.root = norm(project.rootPath)
    }
  }
  return projects.sort((a, b) => b.root.length - a.root.length)
}

export function fixtureSetProjects(core, projects, local = {}) {
  const clean = {}
  for (const [name, value] of Object.entries(local)) {
    const parts = split(value)
    clean[name] = parts.settings
    const project = projects.find(p => p.name === name)
    if (project) {
      const key = norm(project.dir ?? project.rootPath ?? project.root)
      policies.set(key, { ...(policies.get(key) ?? {}), ...parts.policy })
    }
  }
  for (const project of projects) {
    const folder=project.dir??project.rootPath??project.root
    const file=path.join(folder,".canopus/plugin/config.json")
    let raw={};try{raw=JSON.parse(readFileSync(file,"utf8"))}catch{}
    mkdirSync(path.dirname(file),{recursive:true})
    writeFileSync(file,JSON.stringify(mergeConfig(raw,clean[project.name]??{})))
  }
  return core.setProjects(projects, {})
}

/** Old feature fixtures provide programmatic projects/options; write only the real new public global format. */
export function prepareFixturePluginContext(core, ctx) {
  const options = ctx.options ?? {}
  if (!Object.keys(options).some(key => key !== "config")) {
    ctx.options = { config: options.config ?? pluginConfigContext().file }
    return ctx
  }
  const projects = fixtureProjects(core, options)
  const global = { project_settings: projects.map(project => {
    const identity = project.dir && identities.get(norm(project.dir))
    return project.dir && (!identity || !Object.keys(identity).length) ? project.dir : { project: project.name, root: project.rootPath ?? project.root }
  }) }
  for (const project of projects) {
    const folder = project.dir ?? project.rootPath ?? project.root
    let settings = fixtureSettings.get(norm(folder))
    if (!settings) {
      try { settings = JSON.parse(readFileSync(path.join(folder, ".canopus/plugin/config.json"), "utf8")) } catch { settings = {} }
    }
    const parts = split(options.local?.[project.name] ?? {})
    const ordinary = global.project_settings.some(entry => typeof entry === "string" && norm(entry) === norm(folder))
    const targetRoot = ordinary ? folder : (project.rootPath ?? project.root)
    const file = path.join(targetRoot,".canopus/plugin/config.json")
    mkdirSync(path.dirname(file),{recursive:true})
    writeFileSync(file,JSON.stringify(mergeConfig(settings,parts.settings)))
    if (!ordinary) virtualSettings.set(norm(folder), { project: project.name, root: targetRoot, overrides: parts.settings })
    const key = norm(folder)
    const policy = { ...(policies.get(key) ?? {}), ...parts.policy }
    policies.set(key, policy)
    if (project.rootPath) policyAliases.set(norm(project.rootPath), key)
  }
  if (options.retention_days !== undefined || options.keep_days !== undefined) global.retention_days = options.retention_days ?? options.keep_days
  const selected = pluginConfigContext()
  mkdirSync(path.dirname(selected.file), { recursive: true })
  writeFileSync(selected.file, JSON.stringify(global))
  ctx.options = { config: selected.file }
  return ctx
}

/** Alternate built-in policy for feature tests; never serialized into a config file. */
export function setFixturePolicy(directory, values = {}) {
  for (const key of Object.keys(values)) if (!(key in INTERNAL_POLICY)) throw new Error(`unknown code policy dependency ${key}`)
  explicitPolicies.set(norm(directory), { ...(explicitPolicies.get(norm(directory)) ?? {}), ...values })
}

// Clear only task fixtures under the OS temporary directory; never a real user's project.
export function clearTaskFixtures(tasks, project) {
 const temp=realpathSync.native(os.tmpdir()).toLowerCase()
 for(const t of tasks.listTasks(project)){
  const folder=path.dirname(path.dirname(tasks.taskFile(t.project,t.n)))
  const actual=realpathSync.native(folder).toLowerCase(),relative=path.relative(temp,actual)
  if(!relative||relative.startsWith("..")||path.isAbsolute(relative))throw Error("Refusing to clear task data outside test temp")
  rmSync(folder,{recursive:true,force:true})
 }
}
