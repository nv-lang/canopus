import { refuseRuntimeEnvironment } from "./runtime-policy.ts"
import { initializeWindowContext } from "./entry-context.ts"
export default {
  id: "canopus.window",
  async setup(api: any) {
    refuseRuntimeEnvironment()
    await initializeWindowContext(api)
    const plugin = await import("./tui.ts")
    return plugin.default.setup(api)
  },
}
