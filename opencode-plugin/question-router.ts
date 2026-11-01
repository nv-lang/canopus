// 280 / ADR-0017. Durable question routing, deliberately independent of core, SDK and native transports.
// A route is an outbox, not a receipt. A native attempt is persisted BEFORE I/O and is never POSTed twice:
// after a crash/timeout we only reconcile the authoritative form state. Unknown is never permission.
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs"
import path from "node:path"

export type QuestionSource = { kind: "text" | "mail" | "form"; id: string; at: number }
export type QuestionRequest = {
  qid: string; project: string; task?: number; session: string
  channel: "text" | "mail" | "form"; text: string; context: string; source: QuestionSource
  /** Native headings/recommended options are constraints too; arbitrary context is not a proposal or authority. */
  proposals?: string[]
  form?: { id: string; fingerprint: string; field: string }
}
export type QuestionEvidence = { path: string; sha256: string; quote: string }
/** Returned ONLY by the host's trusted assignment lookup, never accepted from a model argument. */
export type QuestionScope = { assignment: string; digest: string }
export type QuestionDefault = { kind: "continue_assigned"; by: string; epoch: number; scope: QuestionScope; sources: QuestionEvidence[]; declaredAt: number; deadline: number; limits: readonly string[] }
export type QuestionObservation = {
  state: "pending" | "answered" | "replaced" | "cancelled" | "missing" | "stale" | "unknown"
  answer?: unknown; why?: string
}
export type QuestionRecord = QuestionRequest & {
  v: 1; id: string; revision: number; status: "routing" | "ready" | "applying" | "unknown" | "answer_queued" | "answered" | "settled" | "owner" | "blocked"
  created: number; updated: number; epoch: number; target?: string; queuedAt?: number; receivedAt?: number
  answer?: string; sources?: QuestionEvidence[]; attempted?: number; observed?: QuestionObservation
  answerQueuedAt?: number; answerReceivedAt?: number
  why?: string; decision?: string; escalationQueued?: number
  deadline?: number; default?: QuestionDefault; defaulted?: number
  workScope?: QuestionScope
  blocker?: { to: string; at: number; deadline: number; why: string; resolvedAt?: number }
}
export type QuestionRouterDeps = {
  /** Trusted host lookup: live responsible task.author, otherwise current project integrator. Never model text. */
  target(request: QuestionRequest): string | undefined
  inspect(request: QuestionRequest): Promise<QuestionObservation>
  verify(request: QuestionRequest, sources: QuestionEvidence[]): Promise<QuestionEvidence[] | undefined>
  closed(text: string): boolean
  /** Trusted execution/HOLD guard immediately before native reply (which resumes a waiting call). */
  canReply?(request: QuestionRequest): string | undefined
  scope?(request: QuestionRequest): QuestionScope | undefined
  /** Idempotent durable mailbox write with this exact id. Does NOT mean delivered/read/started. */
  post(to: string, text: string, id: string, replyTo?: string): void
  reply(request: QuestionRequest, answer: string): Promise<{ state: "applied" | "settled" | "unknown" | "refused"; why?: string }>
}
const terminal = (r: QuestionRecord) => r.status === "answered" || r.status === "settled"
export const QUESTION_ROUTE_TERM_MS = 15 * 60_000
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
export const questionId = (r: Pick<QuestionRequest, "project" | "session" | "channel" | "qid">) => hash(JSON.stringify([r.project, r.session, r.channel, r.qid]))
const original = (r: QuestionRequest) => JSON.stringify([r.qid, r.project, r.task, r.session, r.channel, r.text, r.context, r.source, r.form, r.proposals])
const DEFAULT_LIMITS = ["same_assigned_work", "no_unverified_fact", "no_owner_gate", "no_hold_release", "no_ci_rerun_by_diagnosis", "stop_at_assigned_boundary"] as const

export class QuestionRouter {
  readonly dir: string
  readonly deps: QuestionRouterDeps
  constructor(dir: string, deps: QuestionRouterDeps) { this.dir = dir; this.deps = deps }
  private file(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("[id] неверный идентификатор вопроса")
    return path.join(this.dir, `${id}.json`)
  }
  get(id: string): QuestionRecord | undefined {
    const file = this.file(id)
    if (!existsSync(file)) return undefined
    const r = JSON.parse(readFileSync(file, "utf8"))
    if (r?.v !== 1 || r.id !== id || questionId(r) !== id || !Number.isInteger(r.revision) || !Number.isInteger(r.epoch) || r.epoch < 0
      || !["routing", "ready", "applying", "unknown", "answer_queued", "answered", "settled", "owner", "blocked"].includes(r.status)
      || !["text", "mail", "form"].includes(r.channel) || typeof r.text !== "string" || !r.text.trim() || typeof r.context !== "string" || r.source?.kind !== r.channel || !Number.isFinite(r.source?.at)
      || !Number.isFinite(r.created) || !Number.isFinite(r.updated) || (r.attempted !== undefined && !Number.isFinite(r.attempted))
      || (r.proposals !== undefined && (!Array.isArray(r.proposals) || !r.proposals.every((s: unknown) => typeof s === "string")))
      || (r.deadline !== undefined && !Number.isFinite(r.deadline))
      || (r.default !== undefined && (r.default.kind !== "continue_assigned" || typeof r.default.by !== "string" || !Number.isInteger(r.default.epoch) || !r.default.scope?.assignment || !/^[a-f0-9]{64}$/.test(r.default.scope?.digest ?? "") || !Array.isArray(r.default.sources) || !r.default.sources.length || JSON.stringify(r.default.limits) !== JSON.stringify(DEFAULT_LIMITS) || !Number.isFinite(r.default.declaredAt) || r.default.deadline !== r.deadline || r.default.declaredAt >= r.default.deadline || r.default.deadline > r.created + QUESTION_ROUTE_TERM_MS))
      || (r.defaulted !== undefined && (!r.default || !Number.isFinite(r.defaulted) || r.defaulted < r.default.deadline))
      || (r.workScope !== undefined && (!r.workScope.assignment || !/^[a-f0-9]{64}$/.test(r.workScope.digest ?? "")))
      || (r.blocker !== undefined && (typeof r.blocker.to !== "string" || !r.blocker.to || typeof r.blocker.why !== "string" || !Number.isFinite(r.blocker.at) || !Number.isFinite(r.blocker.deadline)))
      || (["ready", "applying", "answer_queued"].includes(r.status) && (typeof r.answer !== "string" || !Array.isArray(r.sources) || !r.sources.length))
      || (r.channel === "form" && (!r.form?.id || !r.form.field || !r.form.fingerprint))) throw new Error(`[unknown] неизвестная запись вопроса ${id}; сохранена для диагностики`)
    return r
  }
  private scan(): { records: QuestionRecord[]; problems: string[] } {
    const records: QuestionRecord[] = [], problems: string[] = []
    if (!existsSync(this.dir)) return { records, problems }
    for (const n of readdirSync(this.dir).filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
      try { const r = this.get(n.slice(0, -5)); if (r) records.push(r) }
      catch { problems.push(`question router ${n}: неизвестная/повреждённая запись сохранена; pending/разрешением не считается`) }
    }
    return { records, problems }
  }
  list(): QuestionRecord[] { return this.scan().records }
  problems(): string[] { return this.scan().problems }
  // Only synchronous local mutations under the lock; never await or perform transport inside it.
  // A crashed lock is visible/fail-closed, not guessed stale and stolen by a second process.
  private change(id: string, fn: (r: QuestionRecord | undefined) => QuestionRecord | undefined): QuestionRecord | undefined {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(id), lock = `${file}.lock`
    try { mkdirSync(lock) } catch { throw new Error(`[locked] вопрос ${id} заблокирован; попытки доставки не было`) }
    try {
      const prev = this.get(id), next = fn(prev)
      if (!next) return prev
      next.revision = (prev?.revision ?? 0) + 1
      const tmp = `${file}.${randomUUID()}.tmp`
      writeFileSync(tmp, JSON.stringify(next, null, 2))
      renameSync(tmp, file)
      return next
    } finally { rmdirSync(lock) }
  }
  open(input: QuestionRequest, now = input.source.at): QuestionRecord {
    if (!input.qid || !input.project || !input.session || !input.text?.trim() || !input.source?.id || !Number.isFinite(input.source.at)
      || !["text", "mail", "form"].includes(input.channel) || input.source.kind !== input.channel
      || (input.channel === "form" && (!input.form?.id || !input.form.fingerprint || !input.form.field))) throw new Error("[correlation] неполная корреляция/контекст вопроса")
    const id = questionId(input)
    return this.change(id, prev => {
      if (prev) {
        if (original(prev) !== original(input)) throw new Error("[correlation] идентификатор уже принадлежит другому исходному запросу")
        return undefined
      }
      return { ...input, v: 1, id, revision: 0, status: "routing", epoch: 0, created: now, updated: now, deadline: now + QUESTION_ROUTE_TERM_MS, workScope: this.deps.scope?.(input) }
    })!
  }
  private async observe(r: QuestionRecord, now: number): Promise<QuestionRecord> {
    const observed = await this.deps.inspect(r).catch(e => ({ state: "unknown" as const, why: String(e) }))
    return this.change(r.id, current => {
      if (!current || terminal(current)) return undefined
      if (observed.state !== "pending") return { ...current, observed, updated: now, status: observed.state === "unknown" ? "unknown" : "settled", why: observed.why ?? `состояние источника: ${observed.state}` }
      if (current.status === "unknown" && current.attempted === undefined) return { ...current, observed, status: current.decision ? "owner" : current.blocker && current.blocker.resolvedAt === undefined ? "blocked" : current.answer && current.sources?.length ? "ready" : "routing", why: "источник снова проверен; прежний вопрос/источники сохранены", updated: now }
      return undefined
    })!
  }
  private responsible(r: QuestionRecord, actor: string, epoch: number) {
    if (!r.target || actor !== r.target || this.deps.target(r) !== actor) throw new Error("[responsible] ответить может только актуальный ответственный интегратор")
    if (r.epoch !== epoch) throw new Error("[epoch] устаревшая эпоха маршрута")
    if (!["routing", "unknown", "blocked"].includes(r.status)) throw new Error("[settled] вопрос уже закрыт или не ждёт ответа интегратора")
  }
  claim(id: string, actor: string, epoch: number, now = Date.now()) {
    return this.change(id, r => {
      if (!r) throw new Error("[unknown] вопрос неизвестен")
      this.responsible(r, actor, epoch)
      return { ...r, receivedAt: now, updated: now }
    })!
  }
  async resolve(id: string, actor: string, epoch: number, answer: string, sources: QuestionEvidence[], now = Date.now()) {
    let r = this.get(id)
    if (!r) throw new Error("[unknown] вопрос неизвестен")
    r = await this.observe(r, now)
    this.responsible(r, actor, epoch)
    if (r.status === "unknown" || r.attempted !== undefined || r.answerQueuedAt !== undefined) throw new Error("[unknown] исход не проверен или ответ уже поставлен; новая попытка ответа запрещена")
    if (r.workScope && JSON.stringify(this.deps.scope?.(r)) !== JSON.stringify(r.workScope)) throw new Error("[scope] исходная порученная цепочка/границы изменились; поздний ответ не применяется")
    // Data restriction only, never authority: a SHA in the original question cannot authorize publication.
    const revisions = new Set(`${r.text}\n${r.context}`.match(/\b[a-f0-9]{40}\b/gi)?.map(s => s.toLowerCase()) ?? [])
    if (revisions.size && (answer.match(/\b[a-f0-9]{40}\b/gi) ?? []).some(s => !revisions.has(s.toLowerCase()))) throw new Error("[scope] ответ предлагает иной SHA, чем исходный вопрос/контекст")
    if (!answer.trim() || this.deps.closed(r.text) || r.proposals?.some(p => this.deps.closed(p)) || this.deps.closed(answer)) throw new Error("[owner] интегратор не может подменить решение владельца")
    const verified = await this.deps.verify(r, sources)
    if (!verified?.length) throw new Error("[source] нужен проверенный источник; рекомендация не знание")
    return this.change(id, current => {
      if (!current) throw new Error("[unknown] вопрос неизвестен")
      this.responsible(current, actor, epoch)
      if (current.workScope && JSON.stringify(this.deps.scope?.(current)) !== JSON.stringify(current.workScope)) throw new Error("[scope] цепочка изменилась во время проверки источника")
      return { ...current, answer: answer.trim(), sources: verified, status: "ready", receivedAt: now, defaulted: undefined, blocker: current.blocker ? { ...current.blocker, resolvedAt: now } : undefined, updated: now }
    })!
  }
  async escalate(id: string, actor: string, epoch: number, decision: string, sources: QuestionEvidence[], now = Date.now()) {
    const r = this.get(id)
    if (!r) throw new Error("[unknown] вопрос неизвестен")
    this.responsible(await this.observe(r, now), actor, epoch)
    if (!decision.trim()) throw new Error("[owner] нужно точное оставшееся решение владельца")
    const verified = await this.deps.verify(r, sources)
    if (!verified?.length) throw new Error("[source] эскалация владельцу требует проверенного источника")
    return this.change(id, current => {
      if (!current) throw new Error("[unknown] вопрос неизвестен")
      this.responsible(current, actor, epoch)
      return { ...current, sources: verified, decision: decision.trim(), why: "неразрешённое решение владельца", status: "owner", updated: now }
    })!
  }
  ack(id: string, actor: string, now = Date.now()) {
    return this.change(id, r => {
      if (!r || actor !== r.session) throw new Error("[recipient] получение подтверждает только исходный адресат")
      if (r.form || (r.status !== "answer_queued" && !(r.answerQueuedAt !== undefined && ["blocked", "unknown", "settled"].includes(r.status)))) throw new Error("[answer_queued] поставленного в ящик ответа нет")
      return { ...r, status: r.status === "settled" ? "settled" : "answered", answerReceivedAt: now, blocker: r.blocker ? { ...r.blocker, resolvedAt: now } : undefined, updated: now }
    })!
  }
  /** Fixed continuation only. No arbitrary default text, approval flag or model-supplied scope is accepted. */
  async setDefault(id: string, actor: string, epoch: number, sources: QuestionEvidence[], deadline: number, now = Date.now()) {
    let r = this.get(id)
    if (!r) throw new Error("[unknown] вопрос неизвестен")
    r = await this.observe(r, now)
    this.responsible(r, actor, epoch)
    if (r.status !== "routing" || r.attempted !== undefined) throw new Error("[scope] умолчание задаётся заранее для открытого проверенного вопроса")
    if (!Number.isFinite(deadline) || deadline <= now || deadline > r.created + QUESTION_ROUTE_TERM_MS) throw new Error("[deadline] срок должен быть впереди, в пределах исходного командного срока; молчание не продлевает полномочия")
    if (this.deps.closed(r.text) || r.proposals?.some(p => this.deps.closed(p))) throw new Error("[owner] срок не разрешает действие из закрытого списка")
    const scope = this.deps.scope?.(r)
    if (!scope?.assignment || !/^[a-f0-9]{64}$/.test(scope.digest)) throw new Error("[scope] нет проверенной привязки к той же порученной работе")
    if (r.workScope && JSON.stringify(scope) !== JSON.stringify(r.workScope)) throw new Error("[scope] исходная порученная работа изменилась до объявления умолчания")
    const blocked = this.deps.canReply ? this.deps.canReply(r) : "execution/HOLD guard неизвестен"
    if (blocked) throw new Error(`[scope] продолжение запрещено: ${blocked}`)
    const verified = await this.deps.verify(r, sources)
    if (!verified?.length) throw new Error("[source] заранее объявленное умолчание требует проверенного источника")
    return this.change(id, current => {
      if (!current) throw new Error("[unknown] вопрос неизвестен")
      this.responsible(current, actor, epoch)
      if (current.status !== "routing" || current.attempted !== undefined || JSON.stringify(this.deps.scope?.(current)) !== JSON.stringify(scope)) throw new Error("[scope] исходный контекст изменился; умолчание не записано")
      return { ...current, deadline, default: { kind: "continue_assigned", by: actor, epoch, scope, sources: verified, declaredAt: now, deadline, limits: DEFAULT_LIMITS }, updated: now }
    })!
  }
  private block(r: QuestionRecord, why: string, now: number): QuestionRecord {
    return this.change(r.id, current => !current || terminal(current) ? undefined : { ...current, status: current.status === "unknown" ? "unknown" : "blocked", why,
      blocker: { to: this.deps.target(current) ?? `${current.project}.integrator`, at: current.blocker?.at ?? now, deadline: current.deadline ?? current.created + QUESTION_ROUTE_TERM_MS, why }, updated: now })!
  }
  private publishBlocker(r: QuestionRecord, now: number) {
    if (!r.blocker || r.blocker.resolvedAt !== undefined) return
    const target = this.deps.target(r), to = target ?? `${r.project}.integrator`
    r = this.change(r.id, current => !current?.blocker || terminal(current) || (current.blocker.to === to && current.target === target) ? undefined : {
      ...current, target, epoch: current.epoch + 1, receivedAt: undefined, blocker: { ...current.blocker, to }, updated: now,
    })!
    this.deps.post(to, `Адресный blocker вопроса ${r.id}, qid ${r.qid}, project ${r.project}, task ${r.task ?? "неизвестна"}, deadline ${r.blocker!.deadline}. Ответственный: ${to}. Причина: ${r.blocker!.why}.\nИсходный вопрос: ${r.text}\nКонтекст: ${r.context}\nУмолчание: ${r.default ? `${r.default.kind}, источник ${evidenceText({ sources: r.default.sources })}; границы ${r.default.limits.join(", ")}` : "не объявлено, не угадывается"}. Вопрос сохранён; продолжение запрещённой части не разрешено. Выясни факт/зависимость, ответь исходному id/qid; владельцу только настоящее оставшееся решение, не поиск служебного пути. Native POST не повторять.`, `question-blocker-${r.id}-${hash(to).slice(0, 12)}`)
  }
  private async expire(r: QuestionRecord, now: number): Promise<QuestionRecord> {
    const d = r.default
    let why = !d ? "нет заранее записанного допустимого умолчания; ответственный интегратор должен устранить blocker" : undefined
    if (d && !why && (d.kind !== "continue_assigned" || d.by !== this.deps.target(r) || d.epoch !== r.epoch)) why = "ответственный/эпоха умолчания изменились"
    if (!why && (this.deps.closed(r.text) || r.proposals?.some(p => this.deps.closed(p)))) why = "owner gate/закрытый список не разрешается сроком"
    if (!why && (!this.deps.scope || JSON.stringify(this.deps.scope(r)) !== JSON.stringify(d!.scope))) why = "scope/границы исходной порученной работы изменились"
    if (!why) why = this.deps.canReply ? this.deps.canReply(r) : "execution/HOLD guard неизвестен"
    const verified = !why ? await this.deps.verify(r, d!.sources) : undefined
    if (!why && !verified?.length) why = "источник умолчания больше не подтверждён"
    if (why) return this.block(r, why, now)
    // Recheck owner/native state after asynchronous source verification and before selecting the default.
    r = await this.observe(r, now)
    if (r.status !== "routing") return r
    return this.change(r.id, current => !current || current.status !== "routing" || current.default?.declaredAt !== d!.declaredAt ? undefined : {
      ...current, status: "ready", sources: verified, defaulted: now, answer: "Продолжай только неблокированную часть той же уже порученной работы. Недостающий факт не угадан и исходный вопрос не объявлен решённым. На порученной границе сохрани отчёт/состояние и остановись; если продолжение невозможно, верни адресный blocker ответственному интегратору. Это не новое разрешение: owner gates/HOLD/новая работа/live/деньги/публикация не разрешены сроком. Разрешённая диагностика не разрешает CI autorerun, merge или увеличение timeout.", updated: now,
    })!
  }
  async tick(now = Date.now()) {
    for (let r of this.list()) {
      if (terminal(r)) continue
      r = await this.observe(r, now)
      if (terminal(r)) continue
      if (r.status === "applying") {
        // Restart between durable attempt and result: inspect only. Even pending cannot prove POST was not accepted.
        this.change(r.id, c => c?.status === "applying" ? { ...c, status: "unknown", why: "исход единственной native попытки неизвестен; только сверка, без повторного POST", updated: now } : undefined)
        continue
      }
      if (r.status === "unknown") {
        const target = this.deps.target(r)
        if (target && target !== r.session) {
          r = this.change(r.id, c => c?.status !== "unknown" || c.target === target ? undefined : { ...c, target, epoch: c.epoch + 1, receivedAt: undefined, updated: now })!
          this.deps.post(target, `${routeLetter(r)}\nДиагностика: ${r.why}. Неизвестный native исход не разрешает resolve/повторный POST; сначала проверка источника/схемы, при необходимости точный оставшийся owner gate.`, `question-unknown-${r.id}-${r.epoch}`)
        }
        if (now >= (r.deadline ?? r.created + QUESTION_ROUTE_TERM_MS)) this.publishBlocker(this.block(r, r.why ?? "источник/маршрут неизвестен; срок не разрешает продолжение", now), now)
        continue
      }
      if (r.status === "ready" && this.deps.target(r) !== r.target) {
        r = this.change(r.id, c => c?.status === "ready" ? { ...c, status: "routing", answer: undefined, sources: undefined, why: "интегратор сменился до доставки; поздний ответ не применяется", updated: now } : undefined)!
      }
      if (r.status === "routing") {
        const target = this.deps.target(r)
        if (now >= (r.deadline ?? r.created + QUESTION_ROUTE_TERM_MS)) {
          r = await this.expire(r, now)
        } else if (target && target !== r.session) {
          r = this.change(r.id, c => !c || c.status !== "routing" ? undefined : c.target === target ? undefined : { ...c, target, epoch: c.epoch + 1, receivedAt: undefined, queuedAt: undefined, updated: now })!
          this.deps.post(target, routeLetter(r), `question-route-${r.id}-${r.epoch}`)
          this.change(r.id, c => c?.status === "routing" && c.epoch === r.epoch ? { ...c, queuedAt: c.queuedAt ?? now, updated: now } : undefined)
        }
      }
      if (r.status === "blocked") { this.publishBlocker(r, now); continue }
      if (r.status === "owner" && !r.escalationQueued) {
        this.deps.post(r.session, `Маршрут вопроса ${r.id} (qid ${r.qid}): ${r.why}. Исходный вопрос сохранён: «${r.text}». ${r.decision ? `Владельцу нужно только решение: ${r.decision}` : "Не выдавай предположение за факт. Сообщи точное препятствие владельцу через question, не проси его искать служебный путь."} Источники: ${evidenceText(r)}. ${r.form ? "Исходная форма остаётся открытой; не создавай дубликат." : "Настоящее решение владельца — через question."}`, `question-owner-${r.id}`)
        this.change(r.id, c => c?.status === "owner" ? { ...c, escalationQueued: now } : undefined)
      }
      if (r.status !== "ready" && r.status !== "answer_queued") continue
      if (r.status === "ready" && r.workScope && JSON.stringify(this.deps.scope?.(r)) !== JSON.stringify(r.workScope)) {
        this.publishBlocker(this.block(r, "исходная порученная цепочка/границы изменились до доставки", now), now)
        continue
      }
      if (r.status === "ready" && r.defaulted !== undefined) {
        const why = JSON.stringify(this.deps.scope?.(r)) !== JSON.stringify(r.default?.scope) ? "scope умолчания изменился до доставки" : this.deps.canReply?.(r)
        if (why) { this.publishBlocker(this.block(r, why, now), now); continue }
      }
      if (!r.form) {
        if (r.status === "answer_queued" && now - r.updated >= QUESTION_ROUTE_TERM_MS) {
          this.publishBlocker(this.block(r, "получение проверенного ответа исходным адресатом не подтверждено в срок", now), now)
          continue
        }
        this.deps.post(r.session, answerLetter(r), `question-answer-${r.id}`, r.qid)
        this.change(r.id, c => c?.status === "ready" ? { ...c, status: "answer_queued", answerQueuedAt: c.answerQueuedAt ?? now, updated: now } : undefined)
        continue
      }
      const blocked = this.deps.canReply?.(r)
      if (blocked) {
        if (r.defaulted !== undefined) this.publishBlocker(this.block(r, blocked, now), now)
        else this.change(r.id, c => c?.status === "ready" ? { ...c, why: blocked, updated: now } : undefined)
        continue
      }
      let claimed = false
      r = this.change(r.id, c => {
        if (!c || c.status !== "ready" || c.attempted !== undefined) return undefined
        claimed = true
        return { ...c, status: "applying", attempted: now, updated: now }
      })!
      if (!claimed) continue
      const result = await this.deps.reply(r, answerLetter(r)).catch(e => ({ state: "unknown" as const, why: String(e) }))
      this.change(r.id, c => !c || !["applying", "unknown"].includes(c.status) || c.attempted !== r.attempted ? undefined : { ...c, status: result.state === "applied" ? "answered" : result.state === "settled" ? "settled" : "unknown", why: result.why, updated: now })
    }
  }
}

export const evidenceText = (r: Pick<QuestionRecord, "sources">) => r.sources?.map(s => `${s.path} sha256:${s.sha256} «${s.quote}»`).join("; ") || "пока не найдены"
export const answerLetter = (r: QuestionRecord) => `${r.defaulted !== undefined ? "Заранее объявленное ограниченное умолчание, не ответ на недостающий факт" : "Ответ команды через интегратора"} на исходный qid ${r.qid}: ${r.answer}\nПроверенные источники: ${evidenceText(r)}. Не слово владельца и не разрешение действия из закрытого списка. Корреляция: ${r.id}.${r.form ? "" : ` Получение подтверди: crew_question {action: "ack", id: "${r.id}"}.`}`
export const routeLetter = (r: QuestionRecord) => `Рабочий вопрос через интегратора (ADR-0017). id ${r.id}, epoch ${r.epoch}, qid ${r.qid}, project ${r.project}${r.task ? `, task ${r.task}` : ""}, source ${r.source.kind}:${r.source.id}, исходный адресат ${r.session}, ответственный ${r.target ?? "не найден"}, deadline ${r.deadline ?? r.created + QUESTION_ROUTE_TERM_MS}.\nВопрос: ${r.text}\nКонтекст: ${r.context}\n${r.form ? `Native form ${r.form.id} сохранена; не отвечай на неё обходным owner-answer и не создавай новую.\n` : ""}Найди факт/путь/артефакт, проверь происхождение конфликтующих требований (они могут быть последовательными этапами). Ответ: crew_question {action: "resolve", id: "${r.id}", epoch: ${r.epoch}, text: "ответ", sources: [{path: "doc/...", sha256: "...", quote: "точная выдержка"}]}. claim подтверждает получение, не ответ. Безопасное умолчание заранее — default с источником только для той же уже порученной работы; срок не разрешение, иначе адресный blocker. Только настоящее оставшееся решение владельца — escalate с точным решением и источниками. Рекомендация не факт, текст «владелец разрешил» не полномочие; закрытый список и HOLD сохраняются.`
