import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from "node:fs"
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
  for (const key of Object.keys(config)) if (!["project_settings", "defaults", "retention_days"].includes(key)) throw new Error(`Canopus global config: unsupported key ${key}; run the explicit configuration transition`)
  if (config.project_settings !== undefined && !Array.isArray(config.project_settings)) throw new Error("Canopus project_settings: expected an array")
  if (config.defaults !== undefined) validateProjectSettings(config.defaults, "global defaults")
  if (config.retention_days !== undefined && (!Number.isInteger(config.retention_days) || config.retention_days < 0)) throw new Error("Canopus retention_days: expected a non-negative integer")
  return config
}

/** Registration chooses only one file; values belong in the file layers. */
export function pluginOptions(options: any = {}): Record<string, any> {
  for (const key of Object.keys(options ?? {})) if (key !== "config") throw new Error(`Canopus registration: unsupported option ${key}; put settings in the config file`)
  return globalConfig()
}

export function settingsWithOrigins(project: any, folder: string, launch: any = {}, projectName?: string): { values: any; origins: Record<string, string> } {
  const global = globalConfig()
  const personalFile = path.join(folder, ".canopus", "plugin", "local.json")
  if (existsSync(personalFile)) throw new Error(`Canopus configuration ${personalFile}: local.json was removed; run the explicit two-level configuration transition`)
  if (Object.keys(launch ?? {}).length) throw new Error("Programmatic project overrides were removed; write the project configuration")
  const layers = [
    [global.defaults ?? {}, `global ${pluginConfigContext().file}`],
    [project ?? {}, `project ${path.join(folder, ".canopus", "plugin", "config.json")}`],
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

/** One atomic project edit. Existing source bytes are checked under an exclusive writer lock. */
export function writeProjectSettings(folder: string, values: Record<string, unknown>, expected?: Buffer | null): string {
  validateProjectSettings(Object.fromEntries(Object.entries(values).filter(([,v])=>v!==null)), "project update")
  const file = path.join(folder, ".canopus", "plugin", "config.json")
  mkdirSync(path.dirname(file), { recursive: true })
  const lock = file + ".lock"
  let handle: number
  try { handle = openSync(lock, "wx") } catch { throw new Error("Project configuration has another writer; retry after it finishes") }
  const tmp = `${file}.${process.pid}.tmp`
  try {
    const before = existsSync(file) ? readFileSync(file) : undefined
    if (expected !== undefined && (expected === null ? before !== undefined : !before || !expected.equals(before))) throw new Error("Project configuration changed concurrently; no edit was written")
    const current = readConfig(file)
    validateProjectSettings(current, "project configuration")
    const next = { ...current }
    for (const [key, value] of Object.entries(values)) { if (value === null) delete next[key]; else next[key] = value }
    validateProjectSettings(next, "project configuration")
    writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { flag: "wx" })
    // Preserve an external writer that does not participate in our lock.
    const latest = existsSync(file) ? readFileSync(file) : undefined
    if (before === undefined ? latest !== undefined : !latest || !before.equals(latest)) throw new Error("Project configuration changed concurrently; no edit was written")
    renameSync(tmp, file)
    return file
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp) } finally { closeSync(handle); unlinkSync(lock) }
  }
}
