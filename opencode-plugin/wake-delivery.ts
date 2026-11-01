// Durable native admission and proof of execution are different facts (279).
// Same prompt.id retries are idempotent in SessionInbox.reconcile @ v2.0.26,
// including after promotion. Retrying also rings execution.wake; never interrupt.
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson, safeKey, type Letter } from "./core.ts"
import { BASE } from "./paths.ts"
import { nativeGet, type NativeGet, type NativeState } from "./native-state.ts"
import { archiveWake, receiptById, receiptForLetter } from "./wake-receipts.ts"

export const WAKE_DEADLINE_MS = 120_000
export const WAKE_RETRY_MS = 5_000
export const WAKE_ATTEMPTS_MAX = 3
export type WakePhase = "queued" | "sending" | "accepted" | "started" | "error" | "timeout"
export type WakeAttempt = {
  mode?: "wake" | "quiet-synthetic" | "quiet-prompt"
  session: string; id: string; text: string; letters: Letter[]; phase: WakePhase
  at: number; deadline: number; tries: number; triedAt?: number; acceptedAt?: number
  startedAt?: number; proof?: string; why?: string; escalated?: boolean
  checkedAt?: number
  obligationsPrepared?: boolean
  startApplied?: boolean
}
export const wakeComplete = (a: WakeAttempt): boolean => a.phase === "started" || (!!a.mode?.startsWith("quiet-") && a.phase === "accepted")
export const WAKE_DIR = path.join(BASE, "wake-delivery")
const fileOf = (session: string, dir: string) => path.join(dir, `${safeKey(session)}.json`)
export const readWake = (session: string, dir = WAKE_DIR): WakeAttempt | undefined => readJson<WakeAttempt>(fileOf(session, dir))
export const readWakeForLetter = (session: string, letter: string, dir = WAKE_DIR) => receiptForLetter(session, letter, dir)
export const readWakeById = (session: string, id: string, dir = WAKE_DIR) => receiptById(session, id, dir)
export function saveWake(a: WakeAttempt, dir = WAKE_DIR) {
  archiveWake(a, dir) // all identity/provenance records are durable before native POST
  mkdirSync(dir, { recursive: true })
  const file = fileOf(a.session, dir)
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(tmp, JSON.stringify(a, null, 1))
  renameSync(tmp, file)
}
export function newWake(session: string, letters: Letter[], text: string, now: number): WakeAttempt {
  const hash = createHash("sha256").update(JSON.stringify([session, letters.map(l => l.id).sort()])).digest("hex")
  return { session, id: `msg_crew${hash}`, text, letters, phase: "queued", at: now, deadline: now + WAKE_DEADLINE_MS, tries: 0 }
}

/** Exact projected input followed by a NEW assistant generation in that input's
 * segment. Promotion + pre-existing active drain is NOT proof of a new turn.
 * Another user/idle boundary cannot lend its assistant to this request. */
export async function wakeProof(a: WakeAttempt, state: NativeState, get: NativeGet = nativeGet()): Promise<string | undefined> {
  const execution = state.nativeExecution ?? (state.source === "native-api" ? state.state : "unknown")
  if (execution === "unknown") return undefined
  try {
    const user = (await get(`/api/session/${encodeURIComponent(a.session)}/message/${encodeURIComponent(a.id)}`))?.data
    if (user?.id !== a.id || user?.type !== "user" || user?.text !== a.text || !Number.isFinite(user?.time?.created) || user.time.created < a.at) return undefined
    const page = await get(`/api/session/${encodeURIComponent(a.session)}/message?limit=100&order=desc`)
    if (!Array.isArray(page?.data)) return undefined
    const index = page.data.findIndex((m: any) => m.id === a.id && m.type === "user")
    if (index < 0) return undefined // not on this page: unknown, not evidence
    for (const message of page.data.slice(0, index).reverse()) {
      if (["idle", "user"].includes(message?.type)) return undefined
      if (message?.type === "assistant") {
        if (/^msg_/.test(message.id) && message.agent && message.model && Array.isArray(message.content) && Number.isFinite(message.time?.created) && message.time.created >= user.time.created) return `связанный input ${a.id} + новое поколение assistant ${message.id}`
        return undefined
      }
      if (!["synthetic", "system", "skill", "agent-switched", "model-switched"].includes(message?.type)) return undefined
    }
  } catch { /* unavailable evidence is not a start */ }
  return undefined
}

export type WakeDeps = {
  state: NativeState; now: number; get?: NativeGet
  send?: boolean
  prompt(input: { sessionID: string; id: string; text: string; delivery: "queue"; metadata: Record<string, string> }): Promise<any>
  save(a: WakeAttempt): void
}
/** One bounded step. Persist before POST, so a crash/timeout repeats the SAME
 * ID and payload. No resume/second prompt ID is invented for ambiguity. */
export async function advanceWake(a: WakeAttempt, d: WakeDeps): Promise<WakeAttempt> {
  if (wakeComplete(a)) return a
  a.checkedAt = d.now
  if (a.tries && !a.mode?.startsWith("quiet-")) {
    const proof = await wakeProof(a, d.state, d.get)
    if (proof) { a.phase = "started"; a.acceptedAt ??= d.now; a.startedAt = d.now; a.proof = proof; d.save(a); return a }
  }
  if (["error", "timeout"].includes(a.phase)) { d.save(a); return a } // late proof may settle; never POST again
  if (d.now >= a.deadline) { a.phase = "timeout"; a.why = "за 120 секунд связанный новый ход не подтверждён; автоматические повторы остановлены"; d.save(a); return a }
  if (d.send === false || d.state.state !== "idle") return a
  if (a.tries >= WAKE_ATTEMPTS_MAX || (a.triedAt && d.now - a.triedAt < WAKE_RETRY_MS)) return a
  a.phase = "sending"; a.tries++; a.triedAt = d.now
  d.save(a)
  try {
    const response = await d.prompt({ sessionID: a.session, id: a.id, text: a.text, delivery: "queue", metadata: { crewWake: a.id } })
    const item = response?.data ?? response
    if (item?.id === a.id && item?.sessionID === a.session && item?.type === (a.mode === "quiet-synthetic" ? "synthetic" : "user") && item?.payload?.text === a.text && item?.delivery === "queue" && Number.isFinite(item?.time?.created) && item.time.created >= a.at) {
      a.phase = "accepted"; a.acceptedAt ??= d.now; a.why = a.mode?.startsWith("quiet-") ? "тихое native admission подтверждено; пробуждение не запрашивалось" : "native input принят; начало хода ещё не подтверждено"
    } else a.why = "ответ native prompt не подтверждает ID; исход запроса неизвестен"
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status
    if ([400, 401, 403, 404, 409].includes(status)) { a.phase = "error"; a.why = `native prompt HTTP ${status}; повтор остановлен` }
    else a.why = "исход native prompt неизвестен; повтор только с прежним ID"
  }
  d.save(a)
  return a
}
