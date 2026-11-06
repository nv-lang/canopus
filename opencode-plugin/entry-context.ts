// Resolve native registration before importing modules with immutable mailbox paths.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { initializePluginConfig, selectPluginConfig, pluginConfigIdentity, validatePluginRegistration } from "./config-context.ts"

const packageRoot = path.resolve(import.meta.dirname)
const samePackage = (value: unknown, source: string): boolean => {
  if (typeof value !== "string") return false
  if (value === "canopus") return true
  try {
    const resolved = value.startsWith("file:") ? fileURLToPath(value) : path.resolve(source ? path.dirname(source) : process.cwd(), value)
    return path.resolve(resolved).toLowerCase() === packageRoot.toLowerCase()
  } catch { return false }
}

/** Only inspect this package's registration; never expose provider configuration or secrets. */
export function nativeConfigOptions(layers: unknown): { config?: string } | undefined {
  if (!Array.isArray(layers)) throw new Error("Canopus native config: expected configuration layers")
  const choices = new Map<string, { config?: string }>()
  for (const layer of layers) {
    for (const item of Array.isArray(layer?.info?.plugins) ? layer.info.plugins : []) {
      const registration = typeof item === "string" ? { package: item, options: {} } : item
      if (!samePackage(registration?.package, typeof layer.path === "string" ? layer.path : "")) continue
      const options = registration.options ?? {}
      if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Canopus native registration: expected options object")
      for (const key of Object.keys(options)) if (key !== "config") throw new Error(`Canopus native registration: unsupported option ${key}; run the explicit configuration transition`)
      if (options.config !== undefined && (typeof options.config !== "string" || !path.isAbsolute(options.config))) throw new Error("Canopus native registration: config must be an absolute path")
      const file = options.config
      choices.set(pluginConfigIdentity(selectPluginConfig(file).file), file === undefined ? {} : { config: file })
    }
  }
  if (choices.size > 1) throw new Error("Canopus native configuration selects multiple instances; keep one registration")
  return choices.values().next().value
}

export async function initializeWindowContext(api: any): Promise<void> {
  const supplied = validatePluginRegistration(api?.options ?? {})
  if (api?.client?.config?.get) {
    const layers = await api.client.config.get({ location: api.location })
    const service = nativeConfigOptions(layers)
    if (service) {
      if (supplied.config !== undefined && pluginConfigIdentity(selectPluginConfig(supplied.config).file) !== pluginConfigIdentity(selectPluginConfig(service.config).file)) throw new Error("Canopus window and its attached server select different configurations")
      initializePluginConfig(service)
      return
    }
  }
  initializePluginConfig(supplied)
}
