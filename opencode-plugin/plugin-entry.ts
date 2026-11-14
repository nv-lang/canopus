import { refuseRuntimeEnvironment } from "./runtime-policy.ts"
import { hubAgentActive, noteHubAgentDeactivation } from "./agent-of-hub.ts"
import { initializePluginConfig } from "./config-context.ts"
export default {
  id: "canopus",
  async setup(context: any) {
    refuseRuntimeEnvironment()
    // Task 304: an agent of the hub gets an empty plugin — no tools, no hooks, no files; one journal note.
    if (hubAgentActive()) {
      noteHubAgentDeactivation()
      return
    }
    initializePluginConfig(context?.options ?? {})
    const plugin = await import("./index.ts")
    return plugin.default.setup(context)
  },
}
