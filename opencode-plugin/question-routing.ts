// Host-neutral adapters for 280. Source verification is filesystem evidence, NOT model-supplied authority.
import { createHash } from "node:crypto"
import { readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { QuestionRouter, type QuestionEvidence, type QuestionObservation, type QuestionRecord, type QuestionRequest, type QuestionScope } from "./question-router.ts"

export const digest = (value: string) => createHash("sha256").update(value).digest("hex")

/** Only public documentation artifacts under the trusted request repository, bounded, hash+exact quote checked.
 * This proves artifact identity and attribution, not owner's approval or the truth of an arbitrary claim. */
export function verifyQuestionSources(root: string | undefined, sources: QuestionEvidence[]): QuestionEvidence[] | undefined {
  if (!root || !Array.isArray(sources) || !sources.length || sources.length > 8) return undefined
  try {
    const base = realpathSync(root)
    const docs = realpathSync(path.join(base, "doc"))
    if (path.relative(base, docs).replace(/\\/g, "/").toLowerCase() !== "doc") return undefined
    const verified: QuestionEvidence[] = []
    for (const s of sources) {
      if (!s || !/^doc\/[a-zA-Z0-9_./-]+\.(md|json|txt|alula)$/.test(s.path) || s.path.split("/").includes("..")
        || !/^[a-f0-9]{64}$/.test(s.sha256) || typeof s.quote !== "string" || !s.quote.trim() || s.quote.length > 4000) return undefined
      const file = realpathSync(path.join(base, s.path))
      const rel = path.relative(docs, file)
      if (rel.startsWith("..") || path.isAbsolute(rel) || !statSync(file).isFile() || statSync(file).size > 1_000_000) return undefined
      const text = readFileSync(file, "utf8")
      if (digest(text) !== s.sha256 || !text.includes(s.quote)) return undefined
      verified.push({ path: s.path, sha256: s.sha256, quote: s.quote })
    }
    return verified
  } catch { return undefined }
}

// Official https://opencode.ai/v2/openapi.json, Form.Detail/State/StringField, inspected 2026-11-01.
// Never reinterpret a legacy guessed schema as pending. Answer field comes from native fields, not hardcoded q0.
export type QuestionFormIO = {
  get(session: string, form: string, signal?: AbortSignal): Promise<unknown>
  reply(session: string, form: string, field: string, answer: string, signal?: AbortSignal): Promise<{ state: "applied" | "settled" | "unknown" | "refused"; why?: string }>
}
export function formObservation(request: QuestionRequest, envelope: unknown): QuestionObservation {
  const value = envelope as any
  const f = value?.data
  if (!f || f.id !== request.form?.id || f.sessionID !== request.session || !Array.isArray(f.fields)) return { state: "unknown", why: "неизвестная native Form.Detail/correlation" }
  if (f.state?.status === "answered") return { state: "answered", answer: f.state.answer }
  if (f.state?.status === "cancelled") return { state: "cancelled", why: f.state.message }
  if (f.state?.status !== "pending") return { state: "unknown", why: "неизвестная native Form.State" }
  if (f.metadata?.kind !== "question") return { state: "unknown", why: "native форма не подтверждена как question; legacy контекст не даёт разрешения ответить" }
  if (request.form?.fingerprint !== digest(JSON.stringify(f.fields))) return { state: "replaced", why: "native поля изменены после исходного вопроса" }
  const field = f.fields[0]
  if (f.fields.length !== 1 || field?.key !== request.form?.field || field.type !== "string" || field.custom !== true) return { state: "unknown", why: "форма не допускает один source-backed текстовый ответ" }
  return { state: "pending" }
}

export type RoutingCard = { session: string; project?: string; directory: string; task?: { project: string; n: number }; review?: { project: string; n: number } }
export type RoutingHost = {
  dir: string
  target(r: QuestionRequest): string | undefined
  root(r: QuestionRequest): string | undefined
  inspectText(r: QuestionRequest): Promise<QuestionObservation>
  validate?(r: QuestionRequest): QuestionObservation | undefined
  io?: QuestionFormIO
  closed(text: string): boolean
  ownerGate?: import("./question-router.ts").QuestionRouterDeps["ownerGate"]
  canReply?(r: QuestionRequest): string | undefined
  scope?(r: QuestionRequest): QuestionScope | undefined
  scopeRepair?: import("./question-router.ts").QuestionRouterDeps["scopeRepair"]
  recoveryState?: import("./question-router.ts").QuestionRouterDeps["recoveryState"]
  recoveryProof?: import("./question-router.ts").QuestionRouterDeps["recoveryProof"]
  post(to: string, text: string, id: string, replyTo?: string): void
}
export function createQuestionRouting(host: RoutingHost) {
  const router = new QuestionRouter(host.dir, {
    target: host.target,
    inspect: async r => host.validate?.(r) ?? (r.form ? host.io ? formObservation(r, await host.io.get(r.session, r.form.id)) : { state: "unknown", why: "native form inspection недоступна; вопрос сохранён" } : host.inspectText(r)),
    verify: async (r, sources) => verifyQuestionSources(host.root(r), sources),
    closed: host.closed,
    ownerGate: host.ownerGate,
    canReply: r => host.canReply ? host.canReply(r) : "execution/HOLD guard недоступен; native ответ не отправлен",
    scope: host.scope,
    scopeRepair: host.scopeRepair,
    recoveryState: host.recoveryState,
    recoveryProof: host.recoveryProof,
    post: host.post,
    reply: (r, answer) => host.io && r.form ? host.io.reply(r.session, r.form.id, r.form.field, answer) : Promise.resolve({ state: "unknown", why: "native reply adapter отсутствует" }),
  })
  return router
}

export function requestOf(card: RoutingCard, channel: QuestionRequest["channel"], qid: string, text: string, context: string, at: number): QuestionRequest {
  const task = card.task ?? card.review
  return { qid, project: task?.project ?? card.project ?? "local", ...(task ? { task: task.n } : {}), session: card.session, channel, text, context, source: { kind: channel, id: qid, at } }
}

/** Snapshot an already open native form too. Missing native shape stays visible as unknown, never guessed. */
export function formRequest(card: RoutingCard, form: { id: string; rid?: string; at: number; full?: string; question?: string; title?: string; options?: string[]; optDesc?: string[] }, detail?: unknown): QuestionRequest {
  const native = (detail as any)?.data
  const fields = native?.id === form.id && native?.sessionID === card.session && Array.isArray(native.fields) ? native.fields : undefined
  const options = Array.isArray(fields?.[0]?.options) ? fields[0].options : (form.options ?? []).map((label, i) => ({ label, description: form.optDesc?.[i] }))
  const proposals = [native?.title ?? form.title, fields?.[0]?.title].filter((s): s is string => typeof s === "string" && !!s.trim())
    .concat(options.flatMap((o: any) => typeof o.label === "string" && /\((?:recommended|рекомендуется)\)/i.test(o.label) ? [`${o.label}\n${o.description ?? ""}`] : []))
  const text = typeof fields?.[0]?.description === "string" && fields[0].description.trim() ? fields[0].description : form.full ?? form.question ?? form.title ?? "Вопрос без текста"
  return { ...requestOf(card, "form", form.id, text, JSON.stringify({ rid: form.rid ?? form.id, title: form.title, original: form.full ?? form.question, options: form.options, descriptions: form.optDesc, nativeFields: fields }), form.at), proposals, form: { id: form.id, field: typeof fields?.[0]?.key === "string" ? fields[0].key : "unknown", fingerprint: fields ? digest(JSON.stringify(fields)) : "unknown" } }
}

export function routingSummary(records: QuestionRecord[]): string[] {
  return records.filter(r => !["answered", "settled"].includes(r.status)).map(r => `вопрос ${r.id.slice(0, 12)} qid ${r.qid}: ${r.status}${r.target ? ` → ${r.target}` : ""}${r.receivedAt ? ", получен интегратором" : r.queuedAt ? ", только поставлен в ящик" : ""}${r.why ? `; ${r.why}` : ""}`)
}
