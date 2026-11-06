// Explicit CLI context must be selected before MCP imports its mailbox paths.
import { initializePluginConfig, mcpConfigOptions } from "./config-context.ts"
import { refuseRuntimeEnvironment } from "./runtime-policy.ts"
refuseRuntimeEnvironment()
initializePluginConfig(mcpConfigOptions(process.argv.slice(2)))
const runtime = await import("./mcp-runtime.ts")
export const tools = runtime.tools
if (import.meta.main) runtime.startMcp()
