import { installFixturePolicy } from "./fixture-settings.mjs"
// The runner passes an explicit API argument in the import URL, not an environment override.
import { initializePluginConfig } from "../config-context.ts"
const config = new URL(import.meta.url).searchParams.get("config")
if (!config) throw new Error("isolated instance preload requires a config path")
installFixturePolicy()
initializePluginConfig({ config })
