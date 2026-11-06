// Explicit instance setup shared by fixture processes; production uses the same context API.
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export async function configureTestHome(home) {
  const { installFixturePolicy } = await import("./fixture-settings.mjs")
  installFixturePolicy()
  const core = process.env.CANOPUS_CORE
  const plugin = process.env.CANOPUS_PLUGIN_DIR ? path.resolve(process.env.CANOPUS_PLUGIN_DIR)
    : core ? path.dirname(core.startsWith("file:") ? fileURLToPath(core) : path.isAbsolute(core) ? core : fileURLToPath(new URL(core, import.meta.url)))
    : path.resolve(import.meta.dirname, "..")
  const context = await import(pathToFileURL(path.join(plugin, "config-context.ts")).href)
  const selected = context.initializePluginConfig({ config: path.join(home, "plugin", "config.json") })
  const preload = new URL(pathToFileURL(path.join(plugin, "test", "instance-preload.mjs")).href)
  preload.searchParams.set("config", selected.file)
  const argument = `--import=${preload.href}`
  if (!(process.env.NODE_OPTIONS ?? "").includes(argument)) process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} ${argument}`.trim()
  return selected
}
