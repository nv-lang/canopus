import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs"
import path from "node:path"

import { validateProjectSettings } from "./resolved-policy.ts"
import { pluginConfigContext } from "./config-context.ts"

export const pluginRoot = (): string => pluginConfigContext().root
export const pluginState = (): string => path.join(pluginRoot(), "state")
export const pluginCache = (): string => path.join(pluginRoot(), "cache")

export function readConfig(file: string): Record<string, any> {
  if (!existsSync(file)) return {}
  let value: any
  try { value = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) }
  catch { throw new Error(`Canopus configuration ${file}: invalid JSON`) }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Canopus configuration ${file}: expected an object`)
  return value
}

export function mergeConfig(base: any, over: any): any {
  const object = (v: any) => v && typeof v === "object" && !Array.isArray(v)
  if (!object(base) || !object(over)) return over
  const result = { ...base }
  for (const [key, value] of Object.entries(over)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error(`Unsafe configuration key: ${key}`)
    result[key] = object(value) ? mergeConfig(object(base[key]) ? base[key] : {}, value) : value
  }
  return result
}

export function globalConfig(): Record<string, any> {
  const config = readConfig(pluginConfigContext().file)
  for (const key of Object.keys(config)) if (!["project_settings", "defaults", "local", "retention_days"].includes(key)) throw new Error(`Canopus global config: unsupported key ${key}; run the explicit configuration transition`)
  if (config.project_settings !== undefined && !Array.isArray(config.project_settings)) throw new Error("Canopus project_settings: expected an array")
  if (config.defaults !== undefined) validateProjectSettings(config.defaults, "global defaults")
  if (config.local !== undefined) {
    if (!config.local || typeof config.local !== "object" || Array.isArray(config.local)) throw new Error("Canopus global local: expected a project map")
    for (const [project, settings] of Object.entries(config.local)) validateProjectSettings(settings, `local ${project}`)
  }
  if (config.retention_days !== undefined && (!Number.isInteger(config.retention_days) || config.retention_days < 0)) throw new Error("Canopus retention_days: expected a non-negative integer")
  return config
}

/** Registration chooses only one file; values belong in the file layers. */
export function pluginOptions(options: any = {}): Record<string, any> {
  for (const key of Object.keys(options ?? {})) if (key !== "config") throw new Error(`Canopus registration: unsupported option ${key}; put settings in the config file`)
  const { local: _local, ...global } = globalConfig()
  return global
}

export function settingsWithOrigins(project: any, folder: string, launch: any = {}, projectName?: string): { values: any; origins: Record<string, string> } {
  const global = globalConfig()
  const personalFile = path.join(folder, ".canopus", "plugin", "local.json")
  const personal = readConfig(personalFile)
  const layers = [
    [global.defaults ?? {}, `global ${pluginConfigContext().file}`],
    [project ?? {}, `project ${path.join(folder, ".canopus", "plugin", "config.json")}`],
    [global.local?.[projectName] ?? {}, `global local ${pluginConfigContext().file}`],
    [personal, `personal ${personalFile}`],
    [launch ?? {}, "code local dependency"],
  ] as const
  let values: any = {}
  const origins: Record<string, string> = {}
  for (const [layer, origin] of layers) {
    validateProjectSettings(layer, origin)
    values = mergeConfig(values, layer)
    for (const key of Object.keys(layer)) origins[key] = origin
  }
  return { values, origins }
}

export function settingsLayers(project: any, folder: string, launch: any = {}, projectName?: string): any {
  return settingsWithOrigins(project, folder, launch, projectName).values
}

export function validateTasksDir(value: string): string {
  if (value === "") return ""
  const rel = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")
  if (!rel || path.isAbsolute(rel) || rel.includes(":") || rel.split("/").some(p => !p || p === "." || p === "..")) throw new Error("tasks_dir must be a relative directory inside the repository")
  return rel
}

/** Personal choices never rewrite shared project defaults or another user's selection. */
export function writePersonalSettings(folder: string, values: Record<string, unknown>): string {
  validateProjectSettings(values, "personal update")
  const file = path.join(folder, ".canopus", "plugin", "local.json")
  const current = readConfig(file)
  validateProjectSettings(current, "personal project file")
  const next = mergeConfig(current, values)
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n")
  renameSync(tmp, file)
  return file
}

/** Virtual projects have no settings repository: their catalog is stored in global.local. */
export function writeGlobalProjectSettings(project: string, values: Record<string, unknown>): string {
  validateProjectSettings(values, "virtual project update")
  const current = globalConfig()
  const next = { ...(current.local?.[project] ?? {}) }
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  const file = pluginConfigContext().file
  const updated = { ...current, local: { ...(current.local ?? {}), [project]: next } }
  mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(updated, null, 2) + "\n")
  renameSync(temporary, file)
  return file
}
