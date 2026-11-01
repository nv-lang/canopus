// 280. Exact native V2 HTTP Form.Detail / Form.Reply adapter, no CLI and no service start.
// Production registration is read only by these explicitly selected production functions.
// Tests inject get/post (or an isolated registration+fetch); there is no test=>idle/fail-open branch.
import { serviceReg } from "./form-reply.ts"
import { type QuestionFormIO } from "./question-routing.ts"
import { type QuestionObservation } from "./question-router.ts"

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

/** Any newer native user input is a stale-answer barrier, NOT proof of approval/owner authority.
 * In particular no phrase/metadata supplied by a model can grant a permission here. */
export async function inspectQuestionText(get: (route: string) => Promise<any>, session: string, since: number): Promise<QuestionObservation> {
  try {
    const result = await get(`/api/session/${encodeURIComponent(session)}/message?type=user&limit=1&order=desc`)
    if (!Array.isArray(result?.data) || !result.cursor || result.data.length > 1) return { state: "unknown", why: "неизвестная native SessionMessagesResponse" }
    const m = result.data[0]
    if (m && (m.type !== "user" || typeof m.id !== "string" || !Number.isFinite(m.time?.created) || typeof m.text !== "string")) return { state: "unknown", why: "неизвестная native Session.Message.User" }
    return m && m.time.created > since ? { state: "answered", why: `новый native пользовательский ввод ${m.id}; поздний ответ команды не применяется, это не новое разрешение` } : { state: "pending" }
  } catch { return { state: "unknown", why: "native пользовательский ввод не проверен; поздний ответ не применяется" } }
}
