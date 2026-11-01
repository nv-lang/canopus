// Immutable attempt identity survives replacement of a session's latest receipt.
// The archive is write-ahead: all letter->attempt pointers exist before POST.
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { WakeAttempt } from "./wake-delivery.ts"

export type ReceiptLookup = { state: "none" } | { state: "unknown"; why: string } | { state: "known"; attempt: WakeAttempt }
const idOK = (id: unknown): id is string => typeof id === "string" && /^msg_[\w-]+$/.test(id)
const key = (session: string, letter: string) => createHash("sha256").update(JSON.stringify([session, letter])).digest("hex")
function write(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 1))
  renameSync(tmp, file)
}
export function archiveWake(a: WakeAttempt, dir: string) {
  if (!idOK(a.id)) throw new Error("native receipt ID schema unknown")
  for (const letter of a.letters) {
    const old = receiptForLetter(a.session, letter.id, dir)
    if (old.state === "unknown" || (old.state === "known" && (old.attempt.id !== a.id || old.attempt.at !== a.at || old.attempt.text !== a.text))) throw new Error("native receipt identity cannot be regrouped or rewritten")
  }
  write(path.join(dir, "receipts", `${a.id}.json`), a)
  for (const letter of a.letters) write(path.join(dir, "letters", `${key(a.session, letter.id)}.json`), { session: a.session, letter: letter.id, id: a.id })
}
export function receiptForLetter(session: string, letter: string, dir: string): ReceiptLookup {
  const pointer = path.join(dir, "letters", `${key(session, letter)}.json`)
  if (!existsSync(pointer)) return { state: "none" }
  try {
    const p = JSON.parse(readFileSync(pointer, "utf8"))
    if (p?.session !== session || p?.letter !== letter || !idOK(p?.id)) return { state: "unknown", why: "неизвестная provenance/schema указателя native receipt" }
    const found = receiptById(session, p.id, dir)
    if (found.state !== "known" || !found.attempt.letters.some(l => l.id === letter)) return { state: "unknown", why: "архив native receipt повреждён/не соответствует письму" }
    return found
  } catch { return { state: "unknown", why: "архив native receipt недоступен; повторная отправка запрещена" } }
}
/** Outbound provenance, NOT owner authority or proof of admission/start. The
 * caller must match the native input's exact session/id/text and inspect phase. */
export function receiptById(session: string, id: string, dir: string): ReceiptLookup {
  if (!idOK(id)) return { state: "unknown", why: "native receipt ID schema unknown" }
  const file = path.join(dir, "receipts", `${id}.json`)
  if (!existsSync(file)) return { state: "none" }
  try {
    const a = JSON.parse(readFileSync(file, "utf8"))
    if (a?.id !== id || a?.session !== session || !Number.isFinite(a.at) || typeof a.text !== "string" || !Array.isArray(a.letters) || !a.letters.length || !a.letters.every((l: any) => typeof l?.id === "string") || ![undefined, "wake", "quiet-synthetic", "quiet-prompt"].includes(a.mode) || !["queued", "sending", "accepted", "started", "error", "timeout"].includes(a.phase) || (a.phase === "started" && (!Number.isFinite(a.startedAt) || !a.proof))) return { state: "unknown", why: "архив native receipt повреждён/не соответствует input" }
    return { state: "known", attempt: a }
  } catch { return { state: "unknown", why: "архив native receipt недоступен" } }
}
