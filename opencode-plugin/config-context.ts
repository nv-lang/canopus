// Select one independent plugin instance before modules freeze their mailbox paths.
import os from "node:os"
import path from "node:path"
import { claimPluginInstance } from "./instance-kind.ts"

export type PluginConfigContext = Readonly<{ file: string; root: string; data: string; state: string; cache: string }>

export function selectPluginConfig(file?: string, cwd = process.cwd(), userHome = os.homedir()): PluginConfigContext {
  if (file !== undefined && (typeof file !== "string" || !file.trim())) throw new Error("Canopus config: expected a non-empty file path")
  const selected = file === undefined ? path.join(userHome, ".canopus", "plugin", "config.json") : path.resolve(cwd, file)
  const root = path.dirname(selected)
  return Object.freeze({ file: selected, root, data: path.join(root, "data"), state: path.join(root, "state"), cache: path.join(root, "cache") })
}

export const pluginConfigIdentity = (file: string): string => process.platform === "win32" ? file.toLowerCase() : file

let context: PluginConfigContext | undefined
let frozen = false

/** Production setup and isolated callers share this API; there is no test-only environment bypass. */
export function validatePluginRegistration(options: unknown = {}): { config?: string } {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Canopus plugin registration: expected an object with optional config")
  const record = options as Record<string, unknown>
  for (const key of Object.keys(record)) if (key !== "config") throw new Error(`Canopus plugin registration: unsupported option ${key}; put settings in the config file`)
  if (record.config !== undefined && typeof record.config !== "string") throw new Error("Canopus config: expected a non-empty file path")
  if (typeof record.config === "string" && !path.isAbsolute(record.config)) throw new Error("Canopus plugin registration: config must be an absolute path")
  return record as { config?: string }
}

export function initializePluginConfig(options: unknown = {}): PluginConfigContext {
  const record = validatePluginRegistration(options)
  const selected = selectPluginConfig(record.config)
  if (frozen && pluginConfigIdentity(context?.file ?? "") !== pluginConfigIdentity(selected.file)) throw new Error("Canopus process already uses another configuration; start a separate process for another instance")
  context = selected
  return context
}

export function pluginConfigContext(): PluginConfigContext {
  return context ??= selectPluginConfig()
}

/** Called by runtime modules before they derive immutable paths. */
export function freezePluginConfigContext(): PluginConfigContext {
  const selected = pluginConfigContext()
  claimPluginInstance(selected.root)
  frozen = true
  return selected
}

/** CLI commands share selection but retain their own action arguments. */
export function takeConfigArgument(argv: readonly string[]): { config?: string; rest: string[] } {
  let config: string | undefined
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]
    if (word === "--config" || word.startsWith("--config=")) {
      if (config !== undefined) throw new Error("--config must be given only once")
      const value = word === "--config" ? argv[++i] : word.slice(9)
      if (!value || value.startsWith("--")) throw new Error("--config needs a file")
      config = value
    } else rest.push(word)
  }
  return { ...(config === undefined ? {} : { config }), rest }
}

/** Reserved host→provider child protocol. It is never read as an app/plugin setting. */
export function publishPluginChildContext(environment: Record<string, string | undefined> = process.env): void {
  if (!frozen) throw new Error("Canopus child context cannot be published before runtime initialization")
  environment.OPENCODE_CANOPUS_CONFIG = pluginConfigContext().file
}

/** Only the MCP bootstrap consumes the paired session context, before importing its runtime. */
export function mcpConfigOptions(argv: readonly string[], environment: Record<string, string | undefined> = process.env): { config?: string } {
  const selected = takeConfigArgument(argv)
  if (selected.rest.length) throw new Error("Canopus MCP accepts only --config <file>")
  const pointer = environment.OPENCODE_CANOPUS_CONFIG
  if (pointer && (!environment.OPENCODE_CANOPUS_SESSION?.trim() || !path.isAbsolute(pointer))) throw new Error("Canopus MCP received an incomplete native session configuration context")
  const flag = selected.config === undefined ? undefined : path.resolve(selected.config)
  if (pointer && flag && pluginConfigIdentity(selectPluginConfig(pointer).file) !== pluginConfigIdentity(selectPluginConfig(flag).file)) throw new Error("Canopus MCP session context and --config select different instances")
  const file = pointer ?? flag
  return file === undefined ? {} : { config: file }
}
