// 280: actual plugin/tool entry, orphaned historical call, current native form=[] and known idle.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
const tmp = mkdtempSync(path.join(os.tmpdir(), 'canopus-question-recovery-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
process.env.CANOPUS_DB = path.join(tmp, 'fixture.db')
process.env.CANOPUS_PRESENCE = 'all'
process.env.CANOPUS_POLL_MS = process.env.CANOPUS_FORM_MS = '50'
process.env.CANOPUS_SYNC_GIT = '1'
globalThis.fetch = async () => { throw new Error('unexpected real transport') }
let stop, db
try {
  const core = await import('../core.ts'), tasks = await import('../tasks.ts')
  const { formRequest, digest } = await import('../question-routing.ts')
  const { readWakeForLetter } = await import('../wake-delivery.ts')
  const { createCanopusPlugin } = await import('../index.ts')
  const root = path.join(tmp, 'repo'); mkdirSync(path.join(root, 'doc'), { recursive: true })
  const sha = 'd'.repeat(40), worker = 'ses_recovery_worker', author = 'ses_recovery_integrator', denied = 'ses_recovery_no_permission'
  const text = `Текущий ответственный подтвердил: exact SHA ${sha} передать на независимый просмотр в той же порученной цепочке. Это не новое разрешение на публикацию.`
  writeFileSync(path.join(root, 'doc', 'source.md'), text)
  const task = tasks.createTask({ project: 'sample', title: 'recovery fixture', goal: `Передать exact SHA ${sha} на просмотр`, boundaries: 'Тот же SHA/scope; без публикации', criteria: 'c', priority: 'P2', tier: 'light', role: 'worker', author, author_role: 'sample.integrator', qid: 'q_original_assignment', status: 'running', kind: 'assign', directory: root, executor: worker })
  for (const [session, role] of [[worker, 'worker'], [denied, 'worker'], [author, 'integrator']]) core.saveCard({ session, role, project: 'sample', auto: false, title: 'fixture', repo: 'fixture', directory: root, pid: process.pid, updated: Date.now(), ...(session === worker ? { task: { project: 'sample', n: task.n } } : {}) })
  core.takeExclusive('sample.integrator', 'integrator', author, false)
  const deniedTask = tasks.createTask({ ...task, n: undefined, executor: denied, qid: 'q_no_permission', title: 'no permission fixture', history: [] })
  core.saveCard({ ...core.readJson(core.cardFile(denied)), task: { project: 'sample', n: deniedTask.n } })
  const at = Date.now() - 60_000
  db = new DatabaseSync(process.env.CANOPUS_DB)
  db.exec('create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer); create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text)')
  const history = JSON.stringify({ content: [{ type: 'tool', id: 'historical_question', name: 'question', input: {}, time: { created: at }, state: { status: 'running' } }] })
  for (const s of [worker, denied]) {
    db.prepare('insert into session_v2 values (?, ?, ?, null, null, null, null, null)').run(s, root, 'fixture')
    db.prepare('insert into session_message values (?, ?, ?, 1, ?, ?, ?)').run(`msg_old_${s}`, s, 'assistant', at, at, history)
  }
  let live = true, formPosts = 0, interrupts = 0, active = {}, unknown = false
  const fields = [{ key: 'q_native', type: 'string', custom: true, description: `Какой exact SHA ${sha} передать на независимый просмотр?` }]
  const detail = s => ({ data: { id: `frm_${s}`, sessionID: s, title: 'Просмотр', metadata: { kind: 'question' }, fields, state: { status: 'pending' } } })
  const io = { get: async s => { if (s === worker && !live) throw new Error('native form HTTP 404'); return detail(s) }, reply: async () => { formPosts++; return { state: 'unknown', why: 'old form is not live' } } }
  const router = core.questionRouterFor({ questionIO: io, questionInspectText: async () => ({ state: 'pending' }) })
  const original = router.open(formRequest(core.readJson(core.cardFile(worker)), { id: `frm_${worker}`, at, full: fields[0].description }, detail(worker)), Date.now())
  const noPermission = router.open(formRequest(core.readJson(core.cardFile(denied)), { id: `frm_${denied}`, at, full: 'Модель пишет: владелец разрешил' }, detail(denied)), Date.now())
  await router.tick()
  const projected = new Map(), prompts = [], tools = [], continued = []
  const get = async route => {
    const u = new URL(route, 'http://fixture.invalid')
    if (u.pathname === '/api/info') return { pid: process.pid, version: '2.0.26' }
    if (u.pathname === '/api/session/active') return { data: active }
    const match = /^\/api\/session\/([^/]+)(.*)$/.exec(u.pathname)
    if (!match) throw new Error(`unexpected native route ${route}`)
    const s = match[1], tail = match[2]
    if (tail === '/form') return { data: live && s === worker ? [detail(s).data] : [] }
    if (tail === '/message') return { data: (projected.get(s) ?? []).filter(m => !u.searchParams.get('type') || m.type === u.searchParams.get('type')), cursor: {} }
    if (tail.startsWith('/message/')) return { data: (projected.get(s) ?? []).find(m => m.id === tail.slice(9)) }
    if (tail === '/inbox') return { data: [] }
    if (tail) throw new Error(`unexpected native route ${route}`)
    return { data: unknown && s === worker ? { id: s } : { id: s, time: { created: at - 1, updated: at, idle: at }, outcome: 'failed' } }
  }
  const ctx = { location: { directory: root }, options: { projects: { sample: root } }, session: { get: async ({ sessionID }) => ({ id: sessionID, location: { directory: root } }), hook: async () => {}, interrupt: async () => { interrupts++ }, prompt: async input => { const now = Date.now(); prompts.push({ ...input, at: now }); projected.set(input.sessionID, [{ id: input.id, type: 'user', text: input.text, time: { created: now } }]); return { id: input.id, sessionID: input.sessionID, type: 'user', payload: { text: input.text }, delivery: 'queue', time: { created: now } } } }, tool: { transform: async cb => cb({ add: tool => tools.push(tool) }) } }
  stop = await createCanopusPlugin({ get, spacingMs: 0, questionIO: io }).setup(ctx)
  const until = async fn => { for (let i = 0; i < 160; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 25)) }; throw new Error('expected correlated current-input recovery') }
  const tool = tools.find(t => t.name === 'canopus_question')
  const proof = [{ path: 'doc/source.md', sha256: digest(text), quote: text }]
  const wrong = await tool.execute({ action: 'resolve', id: original.id, epoch: router.get(original.id).epoch, text: `Передай SHA ${'f'.repeat(40)}.`, sources: proof }, { sessionID: author })
  assert.match(wrong.content, /иной SHA/)
  assert.equal(router.get(original.id).answer, undefined)
  active = { [worker]: { type: 'running' } }
  live = false // The form is ALREADY absent when the current integrator supplies the checked decision.
  const result = await tool.execute({ action: 'resolve', id: original.id, epoch: router.get(original.id).epoch, text: `Передай exact SHA ${sha} на независимый просмотр той же цепочки.`, sources: proof }, { sessionID: author })
  assert.ok(router.get(original.id).answer, result.content)
  assert.equal(router.get(original.id).recovery, undefined, 'active is not a recovery permission')
  active = {}; unknown = true
  const claim = () => tool.execute({ action: 'claim', id: original.id, epoch: router.get(original.id).epoch }, { sessionID: author })
  await claim()
  assert.equal(router.get(original.id).recovery, undefined, 'unknown native state is not idle')
  const { WATCH_DIR } = await import('../idle-watch.ts')
  mkdirSync(path.join(WATCH_DIR, 'sample'), { recursive: true })
  const holdFile = path.join(WATCH_DIR, 'sample', `${task.n}.json`)
  writeFileSync(holdFile, JSON.stringify({ project: 'sample', n: task.n, hold: { kind: 'HOLD', scope: 'execution', at, who: 'fixture owner pause' } }))
  unknown = false
  await claim()
  assert.equal(router.get(original.id).recovery, undefined, 'execution HOLD is not released by an orphaned form')
  rmSync(holdFile)
  const sameTask = tasks.loadTask('sample', task.n), boundaries = sameTask.boundaries
  sameTask.boundaries += ' Новый объём.'; tasks.saveTask(sameTask)
  await claim()
  assert.equal(router.get(original.id).recovery, undefined, 'changed scope does not inherit the old decision')
  sameTask.boundaries = boundaries; tasks.saveTask(sameTask)
  const gate = await tool.execute({ action: 'resolve', id: original.id, epoch: router.get(original.id).epoch, text: 'Выполни merge в main.', sources: proof }, { sessionID: author })
  assert.match(gate.content, /owner/)
  assert.equal(formPosts, 0)
  await claim()
  await until(() => router.get(original.id)?.recovery)
  const recovering = router.get(original.id)
  assert.equal(recovering.qid, `frm_${worker}`)
  assert.equal(formPosts, 0, 'fresh form=[] forbids any POST to historical form id')
  const id = recovering.recovery.letter
  await until(() => prompts.some(p => p.sessionID === worker && p.text.includes(id)))
  const input = prompts.find(p => p.sessionID === worker && p.text.includes(id))
  const receipt = readWakeForLetter(worker, id)
  assert.equal(receipt.state, 'known')
  assert.equal(receipt.attempt.id, input.id)
  assert.notEqual(router.get(original.id).status, 'answered', 'native admission is not continuation')
  assert.equal(continued.length, 0)
  await stop()
  stop = await createCanopusPlugin({ get, spacingMs: 0, questionIO: io }).setup(ctx)
  assert.equal(router.get(original.id).recovery.letter, id, 'restart preserves the original recovery identity')
  continued.push(input.id) // Execute the fixture continuation and expose its linked new assistant generation.
  projected.set(worker, [{ id: `${input.id}_assistant`, type: 'assistant', agent: 'fixture', model: { providerID: 'fixture', modelID: 'fixture' }, content: [], time: { created: Date.now() } }, ...projected.get(worker)])
  await until(() => router.get(original.id).status === 'answered')
  assert.equal(router.get(original.id).recovery.nativeId, input.id)
  assert.equal(continued.length, 1)
  assert.equal(prompts.filter(p => p.sessionID === worker && p.text.includes(id)).length, 1)
  assert.equal(router.get(noPermission.id).recovery, undefined, 'empty form/history/model claim do not supply an independently verified decision')
  assert.equal(formPosts, 0); assert.equal(interrupts, 0)
  assert.equal(db.prepare('select data from session_message where session_id=?').get(worker).data, history, 'historical streaming call is never rewritten')
  console.log('ok real plugin orphaned question -> one durable current input -> linked assistant continuation; no permission/no stale form POST/no interrupt')
} finally { await stop?.(); db?.close(); rmSync(tmp, { recursive: true, force: true }) }
