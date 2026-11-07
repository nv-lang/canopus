// Durable native admission and proof of execution are different facts (279).
// Same prompt.id retries are idempotent in SessionInbox.reconcile @ v2.0.26,
// including after promotion. Retrying also rings execution.wake; never interrupt.
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson, safeKey, type Letter } from "./core.ts"
import { BASE } from "./base.ts"
import { nativeGet, type NativeGet, type NativeState } from "./native-state.ts"
import { archiveWake, receiptById, receiptForLetter } from "./wake-receipts.ts"

export const WAKE_DEADLINE_MS = 120_000
export const WAKE_RETRY_MS = 5_000
export const WAKE_ATTEMPTS_MAX = 3
export type WakePhase = "queued" | "sending" | "accepted" | "started" | "error" | "timeout"
export type AdmissionDiagnostic = {
  at: number; attempt: number; kind: "accepted" | "unconfirmed" | "transport"
  status?: number; errorName?: string; errorCode?: string; timeout?: boolean
  mismatches?: string[]
}
export type WakeAttempt = {
  mode?: "wake" | "quiet-synthetic" | "quiet-prompt"
  session: string; id: string; text: string; letters: Letter[]; phase: WakePhase
  at: number; deadline: number; tries: number; triedAt?: number; acceptedAt?: number
  startedAt?: number; proof?: string; why?: string; escalated?: boolean
  checkedAt?: number
  admission?: AdmissionDiagnostic[]
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
  return { session, id: `msg_canopus${hash}`, text, letters, phase: "queued", at: now, deadline: now + WAKE_DEADLINE_MS, tries: 0 }
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
    const route = `/api/session/${encodeURIComponent(a.session)}/message?limit=100`
    const messages: any[] = []
    const ids = new Set<string>(), cursors = new Set<string>()
    let cursor: string | undefined
    let index = -1
    // Bounded read-only reconciliation: a late start can leave the newest page.
    // Follow server-issued opaque cursors only; never synthesize one from an ID.
    for (let pageNo = 0; pageNo < 20; pageNo++) {
      const page = await get(route + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "&order=desc"))
      if (!Array.isArray(page?.data)) return undefined
      for (const m of page.data) {
        if (typeof m?.id !== "string" || ids.has(m.id)) return undefined
        ids.add(m.id); messages.push(m)
      }
      index = messages.findIndex(m => m.id === a.id && m.type === "user")
      if (index >= 0) break
      const next = page?.cursor?.next
      if (typeof next !== "string" || !next || cursors.has(next)) return undefined
      cursors.add(next); cursor = next
    }
    if (index < 0 || messages[index].text !== user.text || messages[index].time?.created !== user.time.created) return undefined
    for (const message of messages.slice(0, index).reverse()) {
      if (["idle", "user"].includes(message?.type)) return undefined
      if (message?.type === "assistant") {
        if (/^msg_/.test(message.id) && message.agent && message.model && Array.isArray(message.content) && Number.isFinite(message.time?.created) && message.time.created >= user.time.created) return `связанный input ${a.id} + новое поколение assistant ${message.id}`
        return undefined
      }
      if (message?.type === "compaction") {
        if (message.status !== "completed" || message.reason !== "auto" || typeof message.summary !== "string" || !Number.isFinite(message.time?.created) || message.time.created < user.time.created) return undefined
        continue // maintenance is not an assistant generation or a new user boundary
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
    const response = await d.prompt({ sessionID: a.session, id: a.id, text: a.text, delivery: "queue", metadata: { canopusWake: a.id } })
    const item = response?.data ?? response
    const mismatches = [
      item?.id !== a.id ? "id" : "",
      item?.sessionID !== a.session ? "sessionID" : "",
      item?.type !== (a.mode === "quiet-synthetic" ? "synthetic" : "user") ? "type" : "",
      item?.payload?.text !== a.text ? "payload.text" : "",
      item?.delivery !== "queue" ? "delivery" : "",
      !Number.isFinite(item?.time?.created) || item.time.created < a.at ? "time.created" : "",
    ].filter(Boolean)
    ;(a.admission ??= []).push({ at: d.now, attempt: a.tries, kind: mismatches.length ? "unconfirmed" : "accepted", ...(mismatches.length ? { mismatches } : {}) })
    if (!mismatches.length) {
      a.phase = "accepted"; a.acceptedAt ??= d.now; a.why = a.mode?.startsWith("quiet-") ? "тихое native admission подтверждено; пробуждение не запрашивалось" : "native input принят; начало хода ещё не подтверждено"
    } else a.why = "ответ native prompt не подтверждает ID; исход запроса неизвестен"
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status
    // Keep structured transport facts across timeout, never raw bodies/messages:
    // an exception can contain the prompt, credentials or a full provider URL.
    const safeName = typeof e?.name === "string" && /^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(e.name) ? e.name : undefined
    const safeCode = typeof e?.code === "string" && /^[A-Z][A-Z0-9_]{0,39}$/.test(e.code) ? e.code : undefined
    ;(a.admission ??= []).push({ at: d.now, attempt: a.tries, kind: "transport", ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}), ...(safeName ? { errorName: safeName } : {}), ...(safeCode ? { errorCode: safeCode } : {}), ...(e?.message === "native admission timeout" ? { timeout: true } : {}) })
    if ([400, 401, 403, 404, 409].includes(status)) { a.phase = "error"; a.why = `native prompt HTTP ${status}; повтор остановлен` }
    else a.why = "исход native prompt неизвестен; повтор только с прежним ID"
  }
  d.save(a)
  return a
}

/** Payload-free evidence for task show and doctor; historical attempts stay unknown. */
export function wakeDiagnostic(a: WakeAttempt): string {
  const last = a.admission?.at(-1)
  if (!last) return a.tries && !a.acceptedAt ? "квитанция исходной отправки не сохранена; причина транспорта неизвестна" : ""
  return `admission: ${last.kind}${last.status ? ` HTTP ${last.status}` : ""}${last.errorName ? ` ${last.errorName}` : ""}${last.errorCode ? ` ${last.errorCode}` : ""}${last.timeout ? " (native admission timeout)" : ""}${last.mismatches?.length ? `; не совпали поля ${last.mismatches.join(", ")}` : ""}`
}
