// 280. Exact native V2 HTTP Form.Detail / Form.Reply adapter, no CLI and no service start.
// Production registration is read only by these explicitly selected production functions.
// Tests inject get/post (or an isolated registration+fetch); there is no test=>idle/fail-open branch.
import { serviceReg } from "./form-reply.ts"
import { type QuestionFormIO } from "./question-routing.ts"
import { type QuestionObservation } from "./question-router.ts"
import { readWakeById } from "./wake-delivery.ts"

type Registration = { url: string; password: string }
const route = (session: string, form: string) => `/api/session/${encodeURIComponent(session)}/form/${encodeURIComponent(form)}`
const headers = (reg: Registration) => ({ authorization: `Basic ${Buffer.from(`opencode:${reg.password}`).toString("base64")}`, "content-type": "application/json" })

export async function getQuestionJson(resource: string, reg = serviceReg(), transport: typeof fetch = fetch): Promise<unknown> {
  if (!reg) throw new Error("native form inspection: служба не зарегистрирована")
  const r = await transport(`${reg.url}${resource}`, { headers: headers(reg), signal: AbortSignal.timeout(10_000) })
  if (r.status !== 200) throw new Error(`native form inspection HTTP ${r.status}`)
  return r.json()
}
export const getQuestionForm = (session: string, form: string, reg = serviceReg(), transport: typeof fetch = fetch) => getQuestionJson(route(session, form), reg, transport)
export async function replyQuestionForm(session: string, form: string, field: string, answer: string, reg = serviceReg(), transport: typeof fetch = fetch): ReturnType<QuestionFormIO["reply"]> {
  if (!reg) return { state: "refused", why: "native reply: служба не зарегистрирована" }
  try {
    const r = await transport(`${reg.url}${route(session, form)}/reply`, { method: "POST", headers: headers(reg), body: JSON.stringify({ answer: { [field]: answer } }), signal: AbortSignal.timeout(30_000) })
    if (r.status === 204) return { state: "applied" }
    if (r.status === 409) return { state: "settled", why: "native форма уже закрыта; наш ответ не объявляется применённым" }
    return { state: r.status >= 500 ? "unknown" : "refused", why: `native reply HTTP ${r.status}; источник вопроса сохранён` }
  } catch { return { state: "unknown", why: "native reply: исход неизвестен; повторный POST запрещён, нужна сверка" } }
}

export const productionQuestionIO: QuestionFormIO = { get: getQuestionForm, reply: replyQuestionForm }

/** Newer unrelated user input is a stale-answer barrier, NOT owner authority.
 * Exact durable outbound provenance excludes our own crew mail, never grants permission.
 * Inspect older pages too: a fresh crew message must not hide an intervening user input. */
export async function inspectQuestionText(get: (route: string) => Promise<any>, session: string, since: number): Promise<QuestionObservation> {
  try {
    let cursor: string | undefined
    const seen = new Set<string>(), ids = new Set<string>()
    for (let page = 0; page < 4; page++) {
      const result = await get(`/api/session/${encodeURIComponent(session)}/message?type=user&limit=100&${cursor ? `cursor=${encodeURIComponent(cursor)}` : "order=desc"}`)
      if (!Array.isArray(result?.data) || !result.cursor || typeof result.cursor !== "object" || result.data.length > 100 || (result.cursor.next != null && typeof result.cursor.next !== "string")) return { state: "unknown", why: "неизвестная native SessionMessagesResponse" }
      for (const m of result.data) {
        if (m?.type !== "user" || typeof m.id !== "string" || ids.has(m.id) || !Number.isFinite(m.time?.created) || typeof m.text !== "string") return { state: "unknown", why: "неизвестная/повторная native Session.Message.User" }
        ids.add(m.id)
        if (m.time.created <= since) continue
        const receipt = readWakeById(session, m.id)
        if (receipt.state === "unknown") return { state: "unknown", why: "provenance native input не проверена; это не ответ/полномочие владельца" }
        if (receipt.state === "known") {
          const a = receipt.attempt
          if (a.session !== session || a.id !== m.id || a.text !== m.text || a.at > m.time.created || !a.tries || !Number.isFinite(a.triedAt) || a.triedAt! > m.time.created || ![undefined, "wake", "quiet-prompt"].includes(a.mode) || !["sending", "accepted", "started", "error", "timeout"].includes(a.phase)) return { state: "unknown", why: "native input не совпадает с точной outbound корреляцией/фазой; не полномочие владельца" }
          continue
        }
        return { state: "answered", why: `новый несопоставленный native пользовательский ввод ${m.id}; поздний ответ команды не применяется, это не новое разрешение` }
      }
      const next = result.cursor.next
      if (!next || result.data.some((m: any) => m.time.created <= since)) return { state: "pending" }
      if (seen.has(next)) break
      seen.add(next); cursor = next
    }
    return { state: "unknown", why: "native история ввода не проверена целиком в пределах чтения; продолжение не разрешено" }
  } catch { return { state: "unknown", why: "native пользовательский ввод не проверен; поздний ответ не применяется" } }
}
