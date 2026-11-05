// OpenCode V2 2.0.26: /session/active is process-local drain ownership, including
// terminal cleanup. Session.Info.outcome is historical, NOT an execution state.
// See packages/core/src/session/execution.ts and session/session.ts @ v2.0.26.
import { serviceReg } from "./form-reply.ts"
import { randomUUID } from "node:crypto"
import { mkdirSync, readdirSync, existsSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { BASE } from "./base.ts"
import { readJson, safeKey } from "./core.ts"

export type NativeState = {
  state: "active" | "idle" | "unknown"
  observedAt: number
  source: "native-api" | "machine-watch"
  nativeExecution?: "active" | "idle" | "unknown"
  idleAt?: number
  outcome?: string
  why: string
}
export type NativeGet = (route: string, signal?: AbortSignal) => Promise<any>

/** Shared non-active in-flight reads (not idle TTL), two GETs at a time, bounded queue and
 * outage backoff. No idle/identity TTL: every decision checks process ownership
 * and fresh, distinct active observations around session info. */
export function boundedNativeGet(raw: NativeGet, clock = Date.now, spacingMs = 25): NativeGet {
  let running = 0, failures = 0, retryAt = 0
  let nextStart = 0
  const queue: (() => void)[] = []
  const pending = new Map<string, Promise<any>>()
  const scopedPending = new WeakMap<AbortSignal, Map<string, Promise<any>>>()
  const release = () => { const next = queue.shift(); if (next) next(); else running-- }
  return (route, signal) => {
    // Never join an active request started before a caller's session-info read:
    // its response may be a delayed OLD snapshot, not a post-info observation.
    const coalesce = route !== "/api/session/active"
    let shared = pending
    if (signal) {
      if (!scopedPending.has(signal)) scopedPending.set(signal, new Map())
      shared = scopedPending.get(signal)!
    }
    const same = coalesce ? shared.get(route) : undefined
    if (same) return same
    const begun = clock()
    const run = async () => {
      signal?.throwIfAborted()
      if (begun < retryAt || queue.length >= 64) throw new Error("native transport backoff/queue bound")
      if (running >= 2) await new Promise<void>((resolve, reject) => {
        let admitted = false
        const ready = () => { admitted = true; signal?.removeEventListener("abort", abort); resolve() }
        const abort = () => {
          if (admitted) return
          const index = queue.indexOf(ready)
          if (index >= 0) queue.splice(index, 1)
          reject(signal?.reason)
        }
        queue.push(ready)
        signal?.addEventListener("abort", abort, { once: true })
      })
      else running++
      try {
        signal?.throwIfAborted()
        const startAt = Math.max(clock(), nextStart)
        nextStart = startAt + Math.max(0, spacingMs)
        if (startAt > clock()) await delay(startAt - clock(), undefined, { signal })
        if (clock() < retryAt || clock() - begun > 5000) throw new Error("native transport backoff/stale queued request")
        const result = await raw(route, signal)
        signal?.throwIfAborted()
        if (route === "/api/info" && (result?.pid !== process.pid || !/^2\./.test(result?.version ?? ""))) throw new Error("native process ownership/version unknown")
        if (route === "/api/session/active" && !activeMap(result)) throw new Error("native active schema unknown")
        failures = 0
        return result
      } catch (error) {
        if (!signal?.aborted) retryAt = clock() + Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5))
        throw error
      } finally { release() }
    }
    const result = run()
    if (coalesce) {
      shared.set(route, result)
      void result.then(() => shared.delete(route), () => shared.delete(route))
    }
    return result
  }
}
export type NativeRecord = NativeState & { session: string; unknownSince?: number; notified?: boolean }
export const NATIVE_DIR = path.join(BASE, "native-state")
export const readNative = (session: string, dir = NATIVE_DIR) => readJson<NativeRecord>(path.join(dir, `${safeKey(session)}.json`))
export function saveNative(record: NativeRecord, dir = NATIVE_DIR) {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${safeKey(record.session)}.json`)
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(tmp, JSON.stringify(record, null, 1)); renameSync(tmp, file)
}
export function nativeProblems(now = Date.now(), dir = NATIVE_DIR): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith(".json")).flatMap(f => {
    const r = readJson<NativeRecord>(path.join(dir, f))
    return r?.state === "unknown" && r.unknownSince && now - r.unknownSince >= 120_000 ? [`native ${r.session}: unknown с ${new Date(r.unknownSince).toTimeString().slice(0, 5)}, ${r.why}; доставка закрыта, факты ${Math.round((now - r.observedAt) / 1000)} с назад`] : []
  })
}

/** Only GET: cannot discover/start/restart a service or mutate a session. */
export function nativeGet(reg = serviceReg(), f: typeof fetch = fetch): NativeGet {
  return async (route, signal) => {
    signal?.throwIfAborted()
    if (!reg) throw new Error("native service registration unavailable")
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    try {
      const response = await f(`${reg.url}${route}`, {
        headers: { authorization: `Basic ${Buffer.from(`opencode:${reg.password}`).toString("base64")}` },
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      })
      if (response.status === 404) return undefined
      if (!response.ok) throw new Error(`native GET HTTP ${response.status}`)
      return await response.json()
    } finally { clearTimeout(timer) }
  }
}

const activeMap = (r: any): Record<string, { type: "running" }> | undefined => {
  if (!r || !r.data || typeof r.data !== "object" || Array.isArray(r.data)) return undefined
  if (!Object.entries(r.data).every(([id, value]: any) => id.startsWith("ses") && value?.type === "running")) return undefined
  return r.data
}

/** Two ownership reads bracket session info; absence alone never overrides a
 * newer context hook. No PID liveness or message TTL is evidence of idle. */
export async function nativeState(session: string, since = 0, get: NativeGet = nativeGet(), clock = Date.now): Promise<NativeState> {
  const begun = clock()
  const result = (state: NativeState["state"], why: string, extra = {}): NativeState => ({ state, nativeExecution: state, source: "native-api", observedAt: clock(), why, ...extra })
  try {
    const server = await get("/api/info")
    if (server?.pid !== process.pid || !/^2\./.test(server?.version ?? "")) return result("unknown", "native API другого процесса или неизвестной версии")
    const before = activeMap(await get("/api/session/active"))
    if (!before) return result("unknown", "неизвестная схема native active")
    if (before[session]) return result("active", "native execution принадлежит службе")
    const info = (await get(`/api/session/${encodeURIComponent(session)}`))?.data
    if (info?.id !== session || !Number.isFinite(info?.time?.created) || !Number.isFinite(info?.time?.updated)) return result("unknown", "native session info недоступна или схема неизвестна")
    const after = activeMap(await get("/api/session/active"))
    if (!after) return result("unknown", "повторная проверка native active недоступна")
    if (after[session]) return result("active", "новое native execution при согласовании")
    const idle = info.time.idle
    if (clock() - begun > 10_000 || clock() < begun) return result("unknown", "снимок native устарел во время чтения")
    if (Number.isFinite(idle) && idle > clock() + 1000) return result("unknown", "native idle из будущего; временная последовательность неизвестна")
    if (since && (!Number.isFinite(idle) || idle < since)) return result("unknown", "нет terminal/idle не старше последнего локального active сигнала")
    return result("idle", "native execution отсутствует до и после чтения session info", { ...(Number.isFinite(idle) ? { idleAt: idle } : {}), ...(typeof info.outcome === "string" ? { outcome: info.outcome } : {}) })
  } catch {
    // Do not include transport exceptions: a URL/header could contain a credential.
    return result("unknown", "native API недоступна; занятость не установлена")
  }
}
