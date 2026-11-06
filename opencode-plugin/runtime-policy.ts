// Task 286: technical runtime values are named code policy, not environment settings.
export const RUNTIME_POLICY = Object.freeze({
  "POLL_MS": 1000,
  "LOG_MAX": 5000000,
  "OPEN_TURN_MAX_MS": 2700000,
  "HUNG_MS": 900000,
  "DIALOG_GUARD_MS": 50,
  "DIALOG_GRACE_MS": 300,
  "REPLY_MS": 30000,
  "FORM_REPEAT_GAP_MS": 120000,
  "FORM_REMIND_MS": 1800000,
  "FORM_GONE_MS": 20000,
  "FORM_CANCEL_GONE_MS": 3000,
  "FORM_RESTART_GRACE_MS": 180000,
  "RESUME_GRACE_MS": 300000,
  "STEP_MS": 30000,
  "PROFILES_MS": 10000,
  "STATUS_MS": 15000,
  "FORM_MS": 5000,
  "PLANSTEPS_MS": 10000,
  "HOUSEKEEP_MS": 3600000,
  "FLOW_MS": 60000,
  "LEFT_MS": 600000,
  "LEFT_PER_RUN": 3,
  "LEFT_REMOTE_MS": 21600000,
  "LEFT_REMOTE_FIRST_MS": 1800000,
  "TITLES_PER_PASS": 3,
  "TITLES_FRESH_MS": 86400000,
  "START_RETRY_MS": 120000,
  "PASS_STUCK_MS": 120000,
  "SLOW_STEP_MS": 1000,
  "BRANCH_MS": 10000,
  "DOCTOR_MS": 600000,
  "LAG_MS": 1000,
  "CATALOG_MAX_AGE_MS": 3600000,
  "SETTINGS_TTL_MS": 5000,
  "DEFAULT_BRANCH_CACHE_MS": 5000,
  "AUTOCLOSE_MS": 120000,
  "ACCEPTANCE_TTL_MS": 15000,
  "DIVERGE_TTL_MS": 5000,
  "STEP_PASS_MS": 60000,
  "PROGRESS_STALE_MS": 600000,
  "PROGRESS_DONE_MS": 900000,
  "PROGRESS_ABANDON_MS": 86400000,
  "EVENT_PROBE": false,
  "DB": null,
  "PROCESS_START": null,
  "PRESENCE": null,
  "SYNC_GIT": null,
  "NO_SIDEBAR": false,
  "NO_WORKER": false,
  "WATCH_NO_CONSOLE": false
})
type RuntimeSource = () => Record<string, unknown>
let source: RuntimeSource | undefined
let frozen = false
export function initializeRuntimeSource(next: RuntimeSource): void {
  if (frozen && source !== next) throw new Error("Canopus runtime dependency is already fixed for this process")
  source = next
}
export function freezeRuntimeSource(): void { frozen = true }
export function runtimeValue(key: string, alternate?: unknown): any {
  const injected = source?.() ?? {}
  return injected[key] ?? alternate ?? RUNTIME_POLICY[key as keyof typeof RUNTIME_POLICY]
}
const RETIRED_APP = ["HOME","SERVER_CONFIG","SERVER_AGENT","SERVER_HUB","PG_CONFIG","STT_DIR","PRESET","TOOLS_DIR","OPENCODE_KEEP_PLUGIN","PREPARATION_SERVICE_REGISTRATION","PREPARATION_MODEL","PREPARATION_VARIANT","PREPARATION_ADAPTER","GIT_LOG"]
/** Shared classification for current-input refusal and historical rename diagnostics. */
export function retiredRuntimeEnvironmentKey(name: string): boolean {
  return name === "OPENCODE_CANOPUS_PROJECTS" || name.startsWith("CANOPUS_") && (
    name.slice(8) in RUNTIME_POLICY || RETIRED_APP.includes(name.slice(8)) || /^(SERVER_|VOICE_|STT_|PG_)/.test(name.slice(8))
  )
}
export function refuseRuntimeEnvironment(environment: Record<string, string | undefined> = process.env): void {
  if (environment.OPENCODE_CANOPUS_PROJECTS) throw new Error("OPENCODE_CANOPUS_PROJECTS is no longer supported; put project_settings in the selected Canopus config")
  const names = Object.keys(environment).filter(name => environment[name] && retiredRuntimeEnvironmentKey(name))
  if (names.length) throw new Error(`Canopus runtime environment settings are no longer supported: ${names.join(", ")}; use the selected config file`)
}
