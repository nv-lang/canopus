import { refuseRuntimeEnvironment } from "./runtime-policy.ts"
import { initializePluginConfig } from "./config-context.ts"
export default {
  id: "canopus",
  async setup(context: any) {
    refuseRuntimeEnvironment()
    initializePluginConfig(context?.options ?? {})
    const plugin = await import("./index.ts")
    return plugin.default.setup(context)
  },
}
