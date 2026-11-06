import { existsSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export const canopusHome = (): string => path.resolve(process.env.CANOPUS_HOME || path.join(os.homedir(), ".canopus"))
export const pluginRoot = (): string => path.join(canopusHome(), "plugin")
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

export function globalConfig(): Record<string, any> { return readConfig(path.join(pluginRoot(), "config.json")) }
/** Explicit plugin options are launch overrides; normal registration needs only package. */
export function pluginOptions(options: any = {}): Record<string, any> {
  const global = globalConfig()
  const { local: _globalLocal, ...registration } = global
  return mergeConfig(registration, options ?? {})
}

export function settingsLayers(project: any, folder: string, launch: any = {}, projectName?: string): any {
  const global = globalConfig()
  let result = mergeConfig(global.defaults ?? {}, project ?? {})
  result = mergeConfig(result, global.local?.[projectName ?? project?.project] ?? {})
  result = mergeConfig(result, readConfig(path.join(folder, ".canopus", "plugin", "local.json")))
  return mergeConfig(result, launch ?? {})
}

export function validateTasksDir(value: string): string {
  if (value === "") return ""
  const rel = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")
  if (!rel || path.isAbsolute(rel) || rel.includes(":") || rel.split("/").some(p => !p || p === "." || p === "..")) throw new Error("tasks_dir must be a relative directory inside the repository")
  return rel
}
