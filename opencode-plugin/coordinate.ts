// AUTOMATIC DRIVING OF AN ALLOWED TASK TO COMPLETION (task 281; owner, 2026-11-01: «Полное автоматическое ведение
// задачи до завершения - сделай супер быстро», the current root chat, passed by the duty tab).
//
// A bounded coordination tick over the EXISTING records: tasks (tasks.ts), letters (core.ts postLetter/letterExistsFor),
// the durable question/decision path (crew_task drive-decide with the owner's word, qid-linked). No new scheduler,
// service or goal registry: the tick is one more step of the existing pass loop (index.ts coordWatch), driven only
// for tasks that carry an explicit drive mark (crew_task {action: "drive"} by the integrator).
//
// THE UNIVERSAL CORE is separated from the explicitly attached, versioned workflow POLICY: the core knows durable
// intention/receipt/result records, bounds, gates and blockers; the PHASES and the choice of the next allowed step
// live in the policy (crew-normal-task@1, crew-dependency-epic@1). A policy id/version outside the registry is never
// executed: the drive gets a visible blocker instead.
//
// DURABILITY. coordination/<project>/<n>.json holds the drive: every step is an intention written BEFORE the adapter
// call, the receipt after it; a crash between them leaves state "unknown", rechecked a bounded number of times, then
// a blocker — never a second POST (the letter id is derived from the step id, letterExistsFor dedupes). Owner
// decisions are applied to the ORIGINAL qid of the open gate exactly once: duplicates and late answers are recorded
// but change nothing; a recommendation, a model text or a timeout is not an authority (the owner's word, quote, is
// required). Enqueue is not received/started; external/done is not acceptance: the drive completes only on the
// evidence of the task record itself (status accepted/done), a cancelled task ends the drive as a terminal failure.
//
// OWNER GATES stay protected: the closed set of step actions is letter|note — push/merge/restart, live changes, new
// scope, ceiling, money, publishing and HOLD changes can not be emitted by any policy; a step outside the set is a
// blocker, and a decision for a gate that is not open is refused (the real ceiling is not bypassed).
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"
import { isOpen, taskRef, type Task } from "./tasks.ts"

export const COORD = path.join(BASE, "coordination")

/** The closed set of runtime actions a policy step may use. Owner-protected kinds are absent by construction. */
export const ALLOWED_ACTIONS = ["letter", "note"] as const
export type StepAction = (typeof ALLOWED_ACTIONS)[number]
/** Bounded recheck of a step whose adapter call ended unknown (a throw after the intention was written). */
export const RECHECK_MAX = 3

export type DriveStep = {
  /** derived: s:<phase>:<key> — restart and retry find the same step, a duplicate is never posted twice */
  id: string
  at: number
  phase: string
  action: StepAction
  to?: string
  text: string
  state: "done" | "unknown"
  /** adapter receipt: the letter id or the history-note tag */
  receipt?: string
  rechecks?: number
}
export type DriveDecision = { qid: string; at: number; decision: string; quote: string; hash: string; applied: number; duplicates: number }
export type DriveBlocker = { id: string; at: number; reason: string; cleared?: number }
export type DriveGate = { id: string; qid: string; question: string; since: number }
export type Drive = {
  project: string
  n: number
  policy: { id: string; version: string }
  by: string
  started: number
  updated: number
  phase: string
  steps: DriveStep[]
  decisions: DriveDecision[]
  blockers: DriveBlocker[]
  gate?: DriveGate
  /** dependency epic: branch (subtask number) -> the branches that must finish first */
  needs?: Record<string, number[]>
  done?: { at: number; evidence: string }
  failed?: { at: number; reason: string }
}

const driveFile = (project: string, n: number) => path.join(COORD, safeKey(project), `${n}.json`)
export const loadDrive = (project: string, n: number): Drive | undefined => readJson<Drive>(driveFile(project, n))
export function saveDrive(d: Drive) {
  d.updated = Date.now()
  const file = driveFile(d.project, d.n)
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(d, null, 1))
  renameSync(tmp, file)
}
export function listDrives(project?: string): Drive[] {
  const out: Drive[] = []
  if (!existsSync(COORD)) return out
  for (const p of project ? [safeKey(project)] : readdirSync(COORD)) {
    const dir = path.join(COORD, p)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
      const d = readJson<Drive>(path.join(dir, f))
      if (d) out.push(d)
    }
  }
  return out.sort((a, b) => a.project.localeCompare(b.project) || a.n - b.n)
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex")

// ---------------------------------------------------------------------------------------------------------------------
// The versioned workflow policies. The registry is closed: an id@version outside it is untrusted and never runs.

export type StepSpec = { key: string; action: StepAction; to?: "executor" | "author"; text: string; /** dependency epic: the branch the step addresses (its executor/author is the addressee) */ branch?: number }
export type PolicyOutcome =
  | { kind: "step"; phase: string; step: StepSpec }
  | { kind: "gate"; phase: string; gate: string; question: string }
  | { kind: "wait"; why: string }
  | { kind: "complete"; evidence: string }
  | { kind: "blocked"; reason: string }
  | { kind: "terminal"; reason: string }
export type BranchState = { n: number; status: string; needs: number[]; blocked: boolean; success: boolean; terminal: boolean }
export type PolicyCtx = { task: Task; drive: Drive; now: number; branches?: BranchState[] }
export type Policy = {
  id: string; version: string; phases: string[]
  /** The workflow-specific context collection (e.g. the epic branches) lives in the POLICY; the core knows no
   *  concrete workflow (281, integrator 2026-11-01: the generic tick must not know policy ids). */
  collect?(d: Drive, deps: CoordDeps): BranchState[] | undefined
  decide(ctx: PolicyCtx): PolicyOutcome
}

const REGISTRY = new Map<string, Policy>()
export function registerPolicy(p: Policy) {
  REGISTRY.set(`${p.id}@${p.version}`, p)
}
export const policyOf = (id: string, version: string) => REGISTRY.get(`${id}@${version}`)
export const knownPolicies = () => [...REGISTRY.keys()].sort()

/** A task is acceptance-evidence only by its own record: an external "done" letter or word is not acceptance. */
const accepted = (t: Task) => t.status === "accepted" || t.status === "done"
const evidenceOf = (t: Task) => `status ${t.status}, history ${t.history.length} entries${t.report ? `, report sha256 ${sha(t.report).slice(0, 16)}` : ""}`

/** crew-normal-task@1: one allowed task driven to an evidence-backed completion or the real acceptance gate. */
const normalTaskPolicy: Policy = {
  id: "crew-normal-task",
  version: "1",
  phases: ["start", "work", "acceptance"],
  decide({ task: t, drive }) {
    if (t.status === "cancelled") return { kind: "terminal", reason: "the task was cancelled from outside: an external terminal end is not an acceptance" }
    if (!isOpen(t) && !accepted(t)) return { kind: "terminal", reason: `the task is ${t.status} from outside: not an evidence-backed completion` }
    if (drive.phase === "start")
      return { kind: "step", phase: "work", step: { key: "start", action: "letter", to: "executor", text: `Задача ${taskRef(t)} ведётся автоматически (policy crew-normal-task@1). Работай по заданию; сдача — crew_task submit, вопросы владельцу — через question, приёмка остаётся за владельцем/интегратором.` } }
    if (drive.phase === "work") {
      if (t.report || ["submitted", "reviewing", "accepted", "done"].includes(t.status))
        return { kind: "step", phase: "acceptance", step: { key: "report-evidence", action: "note", text: `drive: отчёт исполнителя получен (${evidenceOf(t)}) [drive report]` } }
      return { kind: "wait", why: "the executor works: no report yet" }
    }
    // phase "acceptance"
    if (accepted(t)) return { kind: "complete", evidence: `accepted by the task record: ${evidenceOf(t)}` }
    if (t.reviewer) return { kind: "wait", why: "a reviewer holds the acceptance" }
    if (drive.gate) return { kind: "wait", why: "the acceptance gate waits for the owner's decision" }
    if (drive.decisions.length) {
      // The verified decision is NOT an auto-acceptance: the next allowed adapter step delivers it to the acceptor
      // with a receipt; the drive completes only on the task record's own evidence (accepted/done).
      const dec = drive.decisions[drive.decisions.length - 1]
      const sent = drive.steps.some((s) => s.id === `s:acceptance:decision-${dec.qid}` && s.state === "done")
      if (!sent)
        return { kind: "step", phase: "acceptance", step: { key: `decision-${dec.qid}`, action: "letter", to: "author", text: `По воротам приёмки задачи ${taskRef(t)} решение владельца зафиксировано проверенным question-путём (qid ${dec.qid}, sha256 ${dec.hash.slice(0, 16)}): «${dec.decision.slice(0, 300)}» (слово: «${dec.quote.slice(0, 150)}»). Прими задачу штатно: crew_task {action: "accept", n: ${t.n}}. Автоматического принятия нет: приёмка — акт приёмщика, ведение ждёт записи самой задачи. [drive decision]` } }
      return { kind: "wait", why: "the verified decision is delivered with a receipt; the acceptance itself is the acceptor's act" }
    }
    return { kind: "gate", phase: "acceptance", gate: "accept", question: `Задача ${taskRef(t)} сдана и без приёмщика: принять её — решение владельца. Вопрос открыт проверенным question-путём с qid ворот (письмо ниже): решение фиксируется ТОЛЬКО терминальной записью исходного qid (owner gate через question), затем crew_task {action: "drive-decide", n: ${t.n}, qid: "<qid>", text: "<решение>", quote: "<слово владельца с датой>"}. Рекомендация, текст модели и таймаут полномочием не являются.` }
  },
}

/** crew-dependency-epic@1: the branches of an epic (parts/needs) are driven independently; an addressed blocker of
 *  one branch stops neither the eligible branches nor the check of dependencies before any action. */
const dependencyEpicPolicy: Policy = {
  id: "crew-dependency-epic",
  version: "1",
  phases: ["branches", "closure"],
  collect: (d, deps) => branchesOf(d, deps),
  decide({ task: t, drive, branches }) {
    if (t.status === "cancelled") return { kind: "terminal", reason: "the epic was cancelled from outside" }
    const bs = branches ?? []
    if (!bs.length) return { kind: "blocked", reason: "the epic has no branches (parts/needs)" }
    if (bs.every((b) => b.success)) return { kind: "complete", evidence: `branches: ${bs.map((b) => `${b.n} ${b.status}`).join(", ")}` }
    const cancelled = bs.filter((b) => b.status === "cancelled")
    if (cancelled.length && bs.every((b) => b.terminal)) return { kind: "terminal", reason: `branches cancelled from outside: ${cancelled.map((b) => b.n).join(", ")}` }
    // Dependencies are checked BEFORE any action: a branch is eligible only when every need succeeded.
    const eligible = bs.filter((b) => !b.terminal && !b.blocked && b.needs.every((m) => bs.find((x) => x.n === m)?.success))
    for (const b of eligible) {
      const kicked = drive.steps.some((s) => s.id === `s:branches:kick-${b.n}` && s.state === "done")
      if (!kicked)
        return { kind: "step", phase: "branches", step: { key: `kick-${b.n}`, action: "letter", to: "executor", branch: b.n, text: `Ветка ${b.n} эпика ${taskRef(t)} разблокирована: зависимости закрыты (${b.needs.join(", ") || "нет"}), статус «${b.status}». Продолжай работу по своей задаче; независимые ветки идут независимо, чужие блокеры тебя не держат.` } }
    }
    const blocked = bs.filter((b) => b.blocked)
    const waiting = bs.filter((b) => !b.terminal && !b.blocked && !eligible.includes(b))
    if (!eligible.length && blocked.length && !waiting.length) return { kind: "blocked", reason: `every open branch is blocked: ${blocked.map((b) => b.n).join(", ")}` }
    return { kind: "wait", why: `eligible: ${eligible.map((b) => b.n).join(", ") || "none"}; blocked: ${blocked.map((b) => b.n).join(", ") || "none"}; waiting on dependencies: ${waiting.map((b) => b.n).join(", ") || "none"}` }
  },
}

registerPolicy(normalTaskPolicy)
registerPolicy(dependencyEpicPolicy)

// ---------------------------------------------------------------------------------------------------------------------
// Attaching and decisions — the explicit entry points (crew_task drive / drive-decide in core.ts call these).

/** Attach a versioned policy to an open task: the drive record and the mark on the task, one first write each. */
export function startDrive(t: Task, policyRef: string, by: string, needs?: Record<string, number[]>): { ok: true; drive: Drive } | { ok: false; why: string } {
  const m = /^([a-z0-9-]+)@([0-9]+)$/.exec(policyRef.trim())
  if (!m) return { ok: false, why: `policy в форме «<id>@<version>», получено «${policyRef}»` }
  const [, id, version] = m
  if (!policyOf(id, version)) return { ok: false, why: `policy «${policyRef}» не в доверенном реестре (${knownPolicies().join(", ")}): недоверенная policy не исполняется` }
  if (!isOpen(t)) return { ok: false, why: `задача ${taskRef(t)} закрыта: ведение ставится на открытую` }
  if (t.drive) return { ok: false, why: `задача ${taskRef(t)} уже ведётся policy ${t.drive.policy}@${t.drive.version}: второй drive не ставится` }
  const now = Date.now()
  const policy = policyOf(id, version)!
  const drive: Drive = { project: t.project, n: t.n, policy: { id, version }, by, started: now, updated: now, phase: policy.phases[0], steps: [], decisions: [], blockers: [], ...(needs && Object.keys(needs).length ? { needs } : {}) }
  saveDrive(drive)
  t.drive = { policy: id, version, at: now, by }
  return { ok: true, drive }
}

/** Apply an owner decision to the ORIGINAL qid of the open gate. The AUTHORITY is the durable question-routing
 *  record of that qid in a terminal state with an answer (the verified question path, 280/ADR-0017) — never the
 *  quote text, a recommendation, a model line or a timeout (281, integrator 2026-11-01). One application; a
 *  duplicate or a late answer is recorded and changes nothing; a decision for a gate that is not open is refused —
 *  the real ceiling is not bypassed. The recorded answer is what applies; text/quote stay evidence. */
export function applyDriveDecision(project: string, n: number, qid: string, decision: string, quote: string, by: string, gateAnswer?: (qid: string) => { answer: string; at: number } | undefined): { ok: true; line: string } | { ok: false; why: string } {
  const d = loadDrive(project, n)
  if (!d) return { ok: false, why: `drive задачи ${n} не найден` }
  if (!qid.trim()) return { ok: false, why: "нужен qid открытых ворот (из письма о воротах)" }
  if (!decision.trim()) return { ok: false, why: "нужен text решения" }
  if (!quote.trim()) return { ok: false, why: "нужна quote — слово владельца с датой: рекомендация, текст модели и таймаут полномочием не являются" }
  const prev = d.decisions.find((x) => x.qid === qid)
  if (prev) {
    prev.duplicates++
    saveDrive(d)
    return { ok: false, why: `решение по ${qid} уже применено (дубликат №${prev.duplicates} записан, повторного действия нет)` }
  }
  if (d.done || d.failed) {
    // late input after the terminal end: a safe blocker keeps the evidence, nothing is resumed
    const id = `late-decision-${safeKey(qid)}`
    if (!d.blockers.some((b) => b.id === id)) d.blockers.push({ id, at: Date.now(), reason: `позднее решение по ${qid} после завершения ведения: «${decision.slice(0, 120)}» (слово: «${quote.slice(0, 120)}») — не применено` })
    saveDrive(d)
    return { ok: false, why: `ведение завершено: позднее решение по ${qid} сохранено блокером, не применено` }
  }
  if (!d.gate || d.gate.qid !== qid) return { ok: false, why: `ворот с qid ${qid} сейчас нет${d.gate ? ` (открыты ворота ${d.gate.qid})` : ""}: чужой потолок этим решением не обходится` }
  const verified = gateAnswer?.(qid)
  if (!verified?.answer.trim()) return { ok: false, why: `по исходному qid ${qid} нет терминальной проверенной записи с ответом: ворота не снимаются (quote/рекомендация/таймаут — не полномочие; решение владельца фиксируется question-путём того же qid)` }
  const now = Date.now()
  d.decisions.push({ qid, at: now, decision: verified.answer.trim(), quote: quote.trim(), hash: sha(verified.answer), applied: now, duplicates: 0 })
  const gate = d.gate
  d.gate = undefined
  saveDrive(d)
  return { ok: true, line: `решение владельца по воротам «${gate.id}» (${qid}) применено к исходному вопросу по проверенной терминальной записи: ${verified.answer.trim().slice(0, 150)} (слово: «${quote.trim().slice(0, 150)}») [drive-decide ${qid}]` }
}

// ---------------------------------------------------------------------------------------------------------------------
// The bounded tick.

export type CoordDeps = {
  task(project: string, n: number): Task | undefined
  /** post a letter; false when the id already exists (dedupe) */
  letter(to: string, id: string, text: string): boolean
  /** a note to the task history */
  note(t: Task, text: string): void
  /** is the receipt known durable (the letter exists) — the recheck of an unknown step */
  known(to: string, receipt: string): boolean
  /** Open the gate's question through the VERIFIED durable question path (280/ADR-0017) under the gate's qid.
   *  Idempotent: reopening the same qid with the same question is a no-op. Without it no gate opens. */
  openGate?(d: Drive, gate: string, qid: string, question: string): void
  save(t: Task): void
  say(line: string): void
}
export type CoordLimits = { maxTasks: number; maxActions: number; maxIO: number }
export const coordLimits = (): CoordLimits => ({
  maxTasks: Number(process.env.CREW_HARNESS_COORD_TASKS) || 4,
  maxActions: Number(process.env.CREW_HARNESS_COORD_ACTIONS) || 8,
  maxIO: Number(process.env.CREW_HARNESS_COORD_IO) || 24,
})
export type CoordResult = { processed: number; actions: number; io: number; blockers: string[]; skipped?: string }

/** No overlapping passes and no accumulating continuations: the tick holds no timers, a nested pass returns at once. */
let ticking = false
export const resetCoordinateTick = () => (ticking = false)

const newGateQid = () => `gq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function branchesOf(d: Drive, deps: CoordDeps): BranchState[] {
  const nums = new Set<number>([...Object.keys(d.needs ?? {}).map(Number), ...(d.needs ? Object.values(d.needs).flat() : [])])
  const t = deps.task(d.project, d.n)
  for (const p of t?.parts ?? []) nums.add(p)
  const out: BranchState[] = []
  for (const bn of [...nums].sort((a, b) => a - b)) {
    const bt = deps.task(d.project, bn)
    const status = bt?.status ?? "missing"
    const success = !!bt && (bt.status === "accepted" || bt.status === "done")
    const terminal = success || status === "cancelled" || status === "missing"
    const blocked = d.blockers.some((b) => b.id === `branch-${bn}` && !b.cleared) || status === "cancelled" || status === "missing"
    out.push({ n: bn, status, needs: d.needs?.[String(bn)] ?? [], blocked, success, terminal })
  }
  return out
}

export async function coordinateTick(deps: CoordDeps, now = Date.now(), limits = coordLimits(), signal?: { aborted: boolean }): Promise<CoordResult> {
  if (ticking) return { processed: 0, actions: 0, io: 0, blockers: [], skipped: "overlap" }
  ticking = true
  const res: CoordResult = { processed: 0, actions: 0, io: 0, blockers: [] }
  try {
    for (const d0 of listDrives()) {
      if (signal?.aborted) {
        res.skipped = "cancelled"
        break
      }
      if (res.processed >= limits.maxTasks || res.actions >= limits.maxActions || res.io >= limits.maxIO) break
      res.processed++
      try {
        const d = loadDrive(d0.project, d0.n)
        if (!d || d.done || d.failed) continue
        const t = deps.task(d.project, d.n)
        res.io++
        if (!t || !t.drive) continue // the mark was lifted: the drive stops without an action
        const policy = policyOf(d.policy.id, d.policy.version)
        if (!policy) {
          const id = "untrusted-policy"
          if (!d.blockers.some((b) => b.id === id && !b.cleared)) {
            d.blockers.push({ id, at: now, reason: `policy ${d.policy.id}@${d.policy.version} вне доверенного реестра: не исполняется` })
            saveDrive(d)
            deps.say(`drive ${d.project}/${d.n}: untrusted policy ${d.policy.id}@${d.policy.version} — blocked`)
            res.blockers.push(`${d.project}/${d.n}: untrusted policy`)
          }
          continue
        }
        // A bounded recheck of steps whose adapter call ended unknown. Never a second POST: the letter id is the receipt.
        let stopped = false
        let rechecked = false
        for (const s of d.steps.filter((s) => s.state === "unknown")) {
          if ((s.rechecks ?? 0) >= RECHECK_MAX) {
            const id = `unknown-${s.id}`
            if (!d.blockers.some((b) => b.id === id && !b.cleared)) {
              d.blockers.push({ id, at: now, reason: `исход шага ${s.id} неизвестен после ${RECHECK_MAX} проверок: повторного действия нет, нужен человек` })
              deps.say(`drive ${d.project}/${d.n}: step ${s.id} unknown after ${RECHECK_MAX} rechecks — blocked`)
              res.blockers.push(`${d.project}/${d.n}: ${s.id} unknown`)
            }
            stopped = true
            continue
          }
          s.rechecks = (s.rechecks ?? 0) + 1
          rechecked = true
          res.io++
          if (s.receipt && s.to && deps.known(s.to, s.receipt)) s.state = "done"
        }
        if (stopped) {
          saveDrive(d)
          continue
        }
        if (rechecked) saveDrive(d) // the recheck counter is durable: a restart does not buy extra rechecks
        if (d.gate) {
          // The gate's durable question record is idempotently ensured on every pass: a crash between the gate write
          // and the route opening heals itself; an identical reopen is a no-op, a conflicting qid is a blocker.
          if (deps.openGate) {
            try {
              deps.openGate(d, d.gate.id, d.gate.qid, d.gate.question)
            } catch (e) {
              const id = `gate-route-${safeKey(d.gate.id)}`
              if (!d.blockers.some((b) => b.id === id && !b.cleared)) {
                d.blockers.push({ id, at: now, reason: `проверенный question-путь ворот «${d.gate.id}» (${d.gate.qid}) не открыт: ${e}` })
                saveDrive(d)
                res.blockers.push(`${d.project}/${d.n}: gate route failed`)
              }
            }
          }
          continue // an open gate: the decision comes by crew_task drive-decide; the tick does not re-ask
        }
        const outcome = policy.decide({ task: t, drive: d, now, branches: policy.collect?.(d, deps) })
        if (outcome.kind === "wait") continue
        if (outcome.kind === "blocked" || outcome.kind === "terminal") {
          const id = outcome.kind === "blocked" ? `policy-${sha(outcome.reason).slice(0, 8)}` : "external-terminal"
          if (outcome.kind === "terminal") {
            d.failed = { at: now, reason: outcome.reason }
            if (res.actions < limits.maxActions && res.io < limits.maxIO) {
              const lid = `drive-${safeKey(d.project)}-${d.n}-terminal`
              if (deps.letter(t.author, lid, `Ведение задачи ${taskRef(t)} (policy ${d.policy.id}@${d.policy.version}) завершено внешним концом: ${outcome.reason}. Принятия не было: external/done — не acceptance.`)) {
                res.actions++
                res.io++
                d.steps.push({ id: "s:closure:terminal", at: now, phase: d.phase, action: "letter", to: t.author, text: outcome.reason, state: "done", receipt: lid })
              }
            }
            saveDrive(d)
            continue
          }
          if (!d.blockers.some((b) => b.id === id && !b.cleared)) {
            d.blockers.push({ id, at: now, reason: outcome.reason })
            if (res.actions < limits.maxActions && res.io < limits.maxIO) {
              const lid = `drive-${safeKey(d.project)}-${d.n}-blocked-${id}`
              if (deps.letter(t.author, lid, `Ведение задачи ${taskRef(t)} остановлено видимым блокером: ${outcome.reason}. Повторных действий нет; разблокировка — решением автора/владельца.`)) {
                res.actions++
                res.io++
              }
            }
            saveDrive(d)
            res.blockers.push(`${d.project}/${d.n}: ${outcome.reason}`)
          }
          continue
        }
        if (outcome.kind === "complete") {
          d.done = { at: now, evidence: outcome.evidence }
          if (res.actions < limits.maxActions && res.io < limits.maxIO) {
            const lid = `drive-${safeKey(d.project)}-${d.n}-done`
            if (deps.letter(t.author, lid, `Ведение задачи ${taskRef(t)} (policy ${d.policy.id}@${d.policy.version}) завершено с доказательством: ${outcome.evidence}.`)) {
              res.actions++
              res.io++
              d.steps.push({ id: "s:closure:done", at: now, phase: d.phase, action: "letter", to: t.author, text: outcome.evidence, state: "done", receipt: lid })
            }
          }
          saveDrive(d)
          continue
        }
        if (outcome.kind === "gate") {
          const qid = newGateQid()
          d.gate = { id: outcome.gate, qid, question: outcome.question, since: now }
          d.phase = outcome.phase
          saveDrive(d) // the gate record is durable BEFORE the verified question route opens
          if (!deps.openGate) {
            d.blockers.push({ id: `gate-path-${safeKey(outcome.gate)}`, at: now, reason: `ворота «${outcome.gate}» не открыты: нет проверенного question-пути (openGate), недоверенный канал воротами не считается` })
            saveDrive(d)
            res.blockers.push(`${d.project}/${d.n}: no verified gate path`)
            continue
          }
          try {
            deps.openGate(d, outcome.gate, qid, outcome.question)
          } catch (e) {
            d.blockers.push({ id: `gate-route-${safeKey(outcome.gate)}`, at: now, reason: `проверенный question-путь ворот «${outcome.gate}» (${qid}) не открыт: ${e}` })
            saveDrive(d)
            res.blockers.push(`${d.project}/${d.n}: gate route failed`)
            continue
          }
          const lid = `drive-${safeKey(d.project)}-${d.n}-gate-${safeKey(outcome.gate)}`
          if (res.actions < limits.maxActions && res.io < limits.maxIO && deps.letter(t.author, lid, `ВОРОТЫ ВЛАДЕЛЬЦА у задачи ${taskRef(t)} (policy ${d.policy.id}@${d.policy.version}), вопрос ${qid} открыт проверенным question-путём: ${outcome.question}`)) {
            res.actions++
            res.io++
            d.steps.push({ id: `s:${outcome.phase}:gate-${outcome.gate}`, at: now, phase: outcome.phase, action: "letter", to: t.author, text: outcome.question, state: "done", receipt: lid })
          }
          saveDrive(d)
          continue
        }
        // outcome.kind === "step": the durable intention goes BEFORE the adapter call, the receipt after it.
        if (res.actions >= limits.maxActions || res.io >= limits.maxIO) continue
        const spec = outcome.step
        if (!(ALLOWED_ACTIONS as readonly string[]).includes(spec.action)) {
          d.blockers.push({ id: `forbidden-${sha(spec.action).slice(0, 8)}`, at: now, reason: `policy ${policy.id}@${policy.version} запросила действие «${spec.action}» вне закрытого набора (${ALLOWED_ACTIONS.join("|")}): не исполнено` })
          saveDrive(d)
          res.blockers.push(`${d.project}/${d.n}: forbidden action ${spec.action}`)
          continue
        }
        const stepId = `s:${outcome.phase}:${spec.key}`
        if (d.steps.some((s) => s.id === stepId && s.state === "done")) {
          d.phase = outcome.phase // the step is durable: move on without a duplicate
          saveDrive(d)
          continue
        }
        if (d.steps.some((s) => s.id === stepId)) continue // unknown, rechecked above
        const to = (() => {
          const bt = spec.branch !== undefined ? deps.task(d.project, spec.branch) : undefined
          const base = bt ?? t
          return spec.to === "executor" ? base.executor : base.author
        })()
        if (spec.action === "letter" && !to) {
          d.blockers.push({ id: `no-${spec.to}`, at: now, reason: `шаг ${stepId}: адресат (${spec.to}) не назначен` })
          saveDrive(d)
          res.blockers.push(`${d.project}/${d.n}: no ${spec.to}`)
          continue
        }
        const step: DriveStep = { id: stepId, at: now, phase: outcome.phase, action: spec.action, ...(to ? { to } : {}), text: spec.text, state: "unknown", rechecks: 0 }
        d.steps.push(step)
        saveDrive(d) // the intention is durable before the call
        res.actions++
        res.io++
        try {
          if (spec.action === "letter") {
            const lid = `drive-${safeKey(d.project)}-${d.n}-${safeKey(stepId)}`
            const posted = deps.letter(to!, lid, spec.text)
            step.state = "done"
            step.receipt = lid
            if (!posted) step.rechecks = undefined // the letter already existed: the duplicate is deduped, not reposted
          } else {
            deps.note(t, spec.text)
            step.state = "done"
            step.receipt = spec.text.match(/\[[drive [^\]]+\]/)?.[0] ?? stepId
          }
        } catch (e) {
          step.state = "unknown" // the outcome is not known: a bounded recheck follows, never a blind retry
          deps.say(`drive ${d.project}/${d.n}: step ${stepId} outcome unknown: ${e}`)
        }
        d.phase = outcome.phase
        saveDrive(d)
      } catch (e) {
        deps.say(`coordination tick failed for drive ${d0.project}/${d0.n}: ${e}`)
      }
    }
  } finally {
    ticking = false
  }
  return res
}
