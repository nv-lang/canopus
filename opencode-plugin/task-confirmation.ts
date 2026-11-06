// 287: durable owner gates for task creation/cancellation. A proposal is not a task or a reserved number.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BASE } from "./base.ts"

export type TaskConfirmationIO = {
  create(session: string, form: any): Promise<void>
  get(session: string, form: string): Promise<any>
  list(session: string): Promise<any>
  cancel(session: string, form: string, reason: string): Promise<void>
  interrupt(session: string): Promise<void>
  idle(session: string): Promise<boolean>
}
export type ApprovalSource = { id: string; digest: string; session: string; form: string; confirmed_by: "native_owner"; observed: number; evidence: string }
export type TaskProposal = {
  v: 1; id: string; digest: string; generation: number; action: "create" | "cancel" | "pause" | "resume" | "reopen"; project: string
  initiator: { session: string; role: string }; scope: any
  title: string; description: string; fields: any[]; form: string
  state: "pending" | "approved" | "declined" | "cancelled" | "applying" | "applied" | "blocked"
  created: number; updated: number; autoAttempted?: { pid: number; at: number }; attempted?: number; why?: string; source?: ApprovalSource
  result?: { project: string; n: number }; closed?: { session: string; form: string; state: string }[]
}
export const APPROVALS = path.join(BASE, "task-approvals")
export const canonical = (v: any): string => JSON.stringify(v, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value)
export const approvalDigest = (v: any) => createHash("sha256").update(canonical(v)).digest("hex")
const file = (id: string, dir = APPROVALS) => {
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Неверный идентификатор подтверждения")
  return path.join(dir, id + ".json")
}
export function readProposal(id: string, dir = APPROVALS): TaskProposal | undefined {
  const p = file(id, dir)
  if (!existsSync(p)) return
  const r = JSON.parse(readFileSync(p, "utf8")) as TaskProposal
  if (r.v !== 1 || r.id !== id || r.digest !== approvalDigest({ action: r.action, project: r.project, initiator: r.initiator, scope: r.scope, generation: r.generation }) || r.form !== `frm_canopus_${id}` || !Array.isArray(r.fields)) throw Error("Повреждённое подтверждение; операция заблокирована")
  return r
}
export function saveProposal(r: TaskProposal, dir = APPROVALS) {
  mkdirSync(dir, { recursive: true }); r.updated = Date.now()
  const p = file(r.id, dir), tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(r, null, 2)); renameSync(tmp, p)
}
function lock(id: string, dir: string): (() => void) | undefined {
  mkdirSync(dir, { recursive: true }); const p = file(id, dir) + ".lock"
  try { writeFileSync(p, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" }); return () => rmSync(p) }
  catch (e: any) {
    if (e.code !== "EEXIST") throw e
    try {
      const owner = JSON.parse(readFileSync(p, "utf8"))
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) return
      try { process.kill(owner.pid, 0); return } catch (failure: any) { if (failure.code !== "ESRCH") return }
      // A dead process is positive evidence. Preserve the old claim, then race again with wx.
      renameSync(p, `${p}.recovered-${process.pid}-${Date.now()}`)
      return lock(id, dir)
    } catch { return }
  }
}
export const proposalMessage = (r: TaskProposal) => `Операция ${r.action === "create" ? "создания" : r.action === "cancel" ? "отмены" : r.action === "pause" ? "паузы" : r.action === "resume" ? "продолжения" : "повторного открытия"} требует подтверждения владельца в native-вопросе. ${r.title}\n${r.description}\nПодтверждение: ${r.id}; native form ${r.form}; состояние ${r.state}${r.why ? `; ${r.why}` : ""}. Повторите исходный вызов с approval: "${r.id}" после ответа. owner_words/confirmed:true и ответ агента разрешением не являются.`
export type GateResult = { ok: true; proposal: TaskProposal } | { ok: false; content: string; proposal?: TaskProposal }
export async function confirmTaskOperation(request: { action: TaskProposal["action"]; project: string; initiator: TaskProposal["initiator"]; scope: any; title: string; description: string; approval?: string; resubmit?: string }, io: TaskConfirmationIO, dir = APPROVALS): Promise<GateResult> {
  const basis = { action: request.action, project: request.project, initiator: request.initiator, scope: request.scope }
  let generation = 0
  if (request.resubmit) {
    const previous = readProposal(request.resubmit, dir)
    if (!previous || !["declined", "cancelled"].includes(previous.state) || canonical({ action: previous.action, project: previous.project, initiator: previous.initiator, scope: previous.scope }) !== canonical(basis)) return { ok: false, content: "resubmit допускается только для того же явно отклонённого/закрытого предложения" }
    generation = previous.generation + 1
  } else if (request.approval) {
    const previous = readProposal(request.approval, dir)
    if (previous && canonical({ action: previous.action, project: previous.project, initiator: previous.initiator, scope: previous.scope }) === canonical(basis)) generation = previous.generation
  }
  const id = approvalDigest({ ...basis, generation })
  if (request.approval && request.approval !== id) return { ok: false, content: "Подтверждение не соответствует точному составу операции: изменились задача, инициатор, причина, замена или параметры. Требуется новое предложение и вопрос владельцу." }
  let r = readProposal(id, dir)
  if (!r) {
    const yes = request.action === "create" ? "Создать задачу" : request.action === "cancel" ? "Подтвердить отмену" : request.action === "pause" ? "Поставить на паузу" : request.action === "resume" ? "Продолжить задачу" : "Повторно открыть задачу"
    const fields = [{ key: "decision", type: "string", title: request.title, description: request.description + "\n\nТочный состав: " + canonical(request.scope), required: true, custom: false, options: [{ value: "confirm", label: yes }, { value: "decline", label: "Не выполнять" }] }]
    r = { v: 1, id, digest: id, generation, action: request.action, project: request.project, initiator: request.initiator, scope: request.scope, title: request.title, description: request.description, fields, form: `frm_canopus_${id}`, state: "pending", created: Date.now(), updated: Date.now() }
    mkdirSync(dir, { recursive: true })
    try { writeFileSync(file(id, dir), JSON.stringify(r, null, 2), { flag: "wx" }) }
    catch (e: any) { if (e.code !== "EEXIST") throw e; r = readProposal(id, dir)! }
  }
  if (["declined", "cancelled"].includes(r.state)) return { ok: false, content: `Операция не выполнена: владелец отказал или закрыл вопрос. ${proposalMessage(r)}`, proposal: r }
  if (r.state === "applied") return { ok: true, proposal: r }
  const unlock = lock(id, dir)
  if (!unlock) return { ok: false, content: "Подтверждение уже обрабатывается; повтор не создаёт вторую операцию.", proposal: r }
  try {
    r = readProposal(id, dir)!
    if (!r.attempted) {
      r.attempted = Date.now(); saveProposal(r, dir) // persist exact native id BEFORE transport
      try { await io.create(r.initiator.session, { id: r.form, title: r.title, metadata: { kind: "canopus-task-owner", proposal: r.id, digest: r.digest }, fields: r.fields }) }
      catch { r.why = "Исход открытия native-вопроса не подтверждён; повтор сверяет тот же form id и не создаёт новый"; saveProposal(r, dir) }
    }
    let f: any
    try { f = (await io.get(r.initiator.session, r.form))?.data }
    catch (e: any) {
      if (e?.missingForm === r.form) {
        // Authoritative FormNotFound, never timeout/session-not-found: restore the SAME native id.
        r.attempted = Date.now(); saveProposal(r, dir)
        try {
          await io.create(r.initiator.session, { id: r.form, title: r.title, metadata: { kind: "canopus-task-owner", proposal: r.id, digest: r.digest }, fields: r.fields })
          f = (await io.get(r.initiator.session, r.form))?.data
        } catch { r.why = "Тот же native form id пока не восстановлен; разрешение не получено" }
      } else r.why = "Native-вопрос недоступен; разрешение не получено"
      if (!f) { saveProposal(r, dir); return { ok: false, content: proposalMessage(r), proposal: r } }
    }
    if (!f || f.id !== r.form || f.sessionID !== r.initiator.session || f.title !== r.title || f.metadata?.kind !== "canopus-task-owner" || f.metadata?.proposal !== r.id || f.metadata?.digest !== r.digest || canonical(f.fields) !== canonical(r.fields)) {
      r.why = "Native вопрос/корреляция/поля не совпадают с показанным предложением"; saveProposal(r, dir); return { ok: false, content: proposalMessage(r), proposal: r }
    }
    if (f.state?.status === "cancelled") r.state = "cancelled"
    else if (f.state?.status === "answered") {
      if (canonical(f.state.answer) === canonical({ decision: "confirm" })) {
        r.state = "approved"; r.source = { id: r.id, digest: r.digest, session: r.initiator.session, form: r.form, confirmed_by: "native_owner", observed: Date.now(), evidence: approvalDigest(f) }; delete r.why
      } else r.state = "declined"
    } else if (f.state?.status === "pending") {
      r.state = "pending"; delete r.source; delete r.why
    } else {
      r.state = "blocked"; delete r.source; r.why = "Неизвестное native состояние, не разрешение"
    }
    saveProposal(r, dir)
    return r.state === "approved" ? { ok: true, proposal: r } : { ok: false, content: proposalMessage(r), proposal: r }
  } finally { unlock() }
}
/** The lock covers creation/place/start. Crash with a matching durable task is reconciled without allocation.
 * Crash before task publication stays fail-closed: never steal a live/unknown claim or allocate a new number. */
export async function applyApprovedCreation<T extends { project: string; n: number; creation_approval?: ApprovalSource }>(r: TaskProposal, existing: () => T | undefined, operation: (source: ApprovalSource) => Promise<any>, dir = APPROVALS, fresh: () => boolean = () => true): Promise<{ result?: any; task?: T; busy?: string }> {
  const old = existing()
  if (old) { r.result = { project: old.project, n: old.n }; r.state = "applied"; saveProposal(r, dir); return { task: old } }
  if (r.state === "applied") return { busy: "Подтверждение уже использовано; исходная задача не найдена, новый номер не выделен" }
  const projectUnlock = lock(approvalDigest({ project: r.project, operation: "creation-sequence" }), dir)
  if (!projectUnlock) return { busy: "Другая задача проекта создаётся сейчас; повторите после обновления поиска дублей" }
  const unlock = lock(r.id, dir)
  if (!unlock) { projectUnlock(); return { busy: "Создание уже выполняется либо требует сверки после обрыва; повторный номер не выделен" } }
  try {
    const current = readProposal(r.id, dir)!
    const found = existing()
    if (found) { current.result = { project: found.project, n: found.n }; current.state = "applied"; saveProposal(current, dir); return { task: found } }
    if (current.state !== "approved" || !current.source || current.source.digest !== r.digest) return { busy: "Нет проверенного разрешения владельца" }
    if (!fresh()) { current.state = "blocked"; current.why = "Изменился родительский контекст или появились новые возможные дубли; старое подтверждение не применяется"; saveProposal(current, dir); return { busy: current.why + "; повторите предложение без approval после проверки существующих задач" } }
    current.state = "applying"; saveProposal(current, dir)
    const result = await operation(current.source)
    const created = existing()
    current.state = created ? "applied" : "approved"
    if (created) current.result = { project: created.project, n: created.n }
    saveProposal(current, dir)
    return { result, ...(created ? { task: created } : {}) }
  } catch (e) {
    const current = readProposal(r.id, dir)!
    const created = existing()
    current.state = created ? "applied" : "blocked"; current.why = "Создание оборвано; сохранённый результат/ресурсы требуют сверки, новый номер не выделяется"
    if (created) current.result = { project: created.project, n: created.n }
    saveProposal(current, dir); throw e
  } finally { unlock(); projectUnlock() }
}
export const createReasonRefusal = (input: any): string | undefined => {
  if (!String(input.creation_reason ?? "").trim()) return "Нужна creation_reason: причина создания новой задачи агентом"
  if (!Array.isArray(input.checked_tasks) || !input.checked_tasks.every((n: unknown) => Number.isInteger(n) && Number(n) > 0)) return "Нужен checked_tasks: массив номеров проверенных существующих задач (либо [] если проверка не нашла задач)"
  if (!String(input.why_new ?? "").trim()) return "Нужна why_new: почему работа не выполняется в рамках проверенных существующих задач"
}
export function creationDescription(input: any, title: string, candidates: { n: number; title: string; status: string }[]) {
  return `Название: ${title}\nЦель: ${input.goal ?? title}\nИнициатор предлагает новую задачу. Причина: ${input.creation_reason}\nПроверенные задачи: ${input.checked_tasks.length ? input.checked_tasks.join(", ") : "нет: поиск не нашёл подходящих задач"}\nПочему существующих задач недостаточно: ${input.why_new}\nСуществующие задачи проекта для проверки дублей:\n${candidates.map(t => `${t.n}: ${t.title} (${t.status})`).join("\n") || "задач пока нет"}`
}
export function proposalProblems(dir = APPROVALS): string[] {
  if (!existsSync(dir)) return []
  const lines: string[] = []
  for (const n of readdirSync(dir).filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
    try { const r = readProposal(n.slice(0, -5), dir)!; if (["blocked", "applying"].includes(r.state) || r.why) lines.push(`подтверждение ${r.id.slice(0, 12)}: ${r.state}${r.why ? `; ${r.why}` : ""}`) }
    catch { lines.push(`подтверждение ${n.slice(0, 12)}: повреждённая запись сохранена`) }
  }
  return lines
}

/** All native calls happen before task terminal status. Partial completion is durable and safely retried. */
export async function applyApprovedStop(r: TaskProposal, io: TaskConfirmationIO, sessions: string[], finish: () => Promise<void>, dir = APPROVALS, prepare: () => void = () => {}): Promise<string | undefined> {
  const targetUnlock = lock(approvalDigest({ operation: "task-action", project: r.project, n: r.scope.target?.n ?? r.scope.target, created: r.scope.target?.created ?? 0 }), dir)
  if (!targetUnlock) return "Другая операция этой задачи уже выполняется; статус не изменён"
  const unlock = lock(r.id, dir)
  if (!unlock) { targetUnlock(); return "Операция уже выполняется или её claim требует сверки после обрыва" }
  try {
    const current = readProposal(r.id, dir)!
    if (current.state === "applied") return
    if (!current.source || !["approved", "applying", "blocked"].includes(current.state)) return "Нет подтверждённого решения владельца"
    prepare()
    current.state = "applying"; saveProposal(current, dir)
    for (const session of sessions) {
      // Close currently open questions first. DELETE acknowledgement alone is not settlement evidence.
      const listed = await io.list(session)
      if (!Array.isArray(listed?.data)) throw Error("Неизвестный native список форм")
      for (const info of listed.data) {
        if (typeof info?.id !== "string" || info.sessionID !== session) throw Error("Неверная корреляция native формы")
        let f = (await io.get(session, info.id))?.data
        if (!f || f.id !== info.id || f.sessionID !== session) throw Error("Native форма не проверена")
        if (f.state?.status === "pending") {
          try { await io.cancel(session, info.id, `Canopus ${r.action}; owner approval ${r.id}`) } catch { /* inspect even when the transport outcome is unknown */ }
          f = (await io.get(session, info.id))?.data
        }
        if (f?.id !== info.id || f?.sessionID !== session || !["answered", "cancelled"].includes(f.state?.status)) throw Error("Открытый вопрос не закрыт; завершение операции запрещено")
        current.closed ??= []
        if (!current.closed.some(x => x.session === session && x.form === info.id)) current.closed.push({ session, form: info.id, state: f.state.status })
        saveProposal(current, dir)
      }
      await io.interrupt(session)
      if (!await io.idle(session)) throw Error("Остановка native исполнения не подтверждена; задача ещё не отменена/не поставлена на паузу")
      // Interruption/drain may expose another form. Require a fresh, fully reconciled empty pending set.
      const after = await io.list(session)
      if (!Array.isArray(after?.data)) throw Error("Повторная проверка вопросов недоступна")
      for (const info of after.data) {
        const f = (await io.get(session, info.id))?.data
        if (f?.sessionID !== session || f?.id !== info.id || !["answered", "cancelled"].includes(f?.state?.status)) throw Error("После остановки остался открытый/неизвестный вопрос")
      }
    }
    await finish()
    current.state = "applied"; delete current.why; saveProposal(current, dir)
  } catch (e) {
    const current = readProposal(r.id, dir)!
    current.state = "blocked"; current.why = String((e as any)?.message ?? "Остановка не проверена"); saveProposal(current, dir)
    return current.why
  } finally { unlock(); targetUnlock() }
}

export function similarTasks(input: any, title: string, tasks: { n: number; title: string; goal: string; status: string }[]) {
  const words = (s: string) => new Set(s.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2))
  const proposed = words(title + " " + input.goal)
  const normalized = (s: string) => [...words(s)].sort().join(" ")
  return tasks.filter(t => {
    if (input.checked_tasks?.includes(t.n)) return true
    if (normalized(t.title) === normalized(title) || normalized(t.goal) === normalized(String(input.goal))) return true
    const theirs = words(t.title + " " + t.goal), overlap = [...theirs].filter(w => proposed.has(w)).length
    return overlap >= 2 && overlap / Math.max(1, Math.min(theirs.size, proposed.size)) >= 0.4
  }).map(t => ({ n: t.n, title: t.title, goal: t.goal })).sort((a, b) => a.n - b.n)
}
export const CREATION_APPROVAL = Symbol("canopus creation approval")

/** One UI click completes a core operation via its original authorised entrypoint; no model answer grants authority. */
export async function resumeTaskConfirmations(io: TaskConfirmationIO, execute: (entry: string, input: any, session: string) => Promise<string>, outcome: (record: TaskProposal, text: string) => void = () => {}, dir = APPROVALS) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir).filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
    let r: TaskProposal | undefined
    try {
      r = readProposal(name.slice(0, -5), dir)
      if (!r || !["pending", "approved", "applying", "blocked"].includes(r.state) || !["spawn", "order", "task-operation"].includes(r.scope?.entry)) continue
      if (r.autoAttempted) {
        try { process.kill(r.autoAttempted.pid, 0); continue } catch (e: any) { if (e.code !== "ESRCH") continue }
      }
      const gate = await confirmTaskOperation({ action: r.action, project: r.project, initiator: r.initiator, scope: r.scope, title: r.title, description: r.description, approval: r.id }, io, dir)
      if (!gate.ok) continue
      r = gate.proposal
      if (r.state === "applied") continue
      r.autoAttempted = { pid: process.pid, at: Date.now() }; saveProposal(r, dir)
      const text = await execute(r.scope.entry, { ...r.scope.input, approval: r.id }, r.initiator.session)
      outcome(r, text)
    } catch { if (r) outcome(r, `Подтверждённая операция ${r.id} требует сверки; исход не объявляется успешным`) }
  }
}
