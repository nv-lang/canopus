// 280: real plugin entry, pre-existing native form, recommendations enabled, source-backed native reply.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const tmp = mkdtempSync(path.join(os.tmpdir(), 'crew-question-forms-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, 'absent.db')
process.env.CREW_HARNESS_PRESENCE = 'all'
process.env.CREW_HARNESS_POLL_MS = '50'
process.env.CREW_HARNESS_FORM_MS = '50'
process.env.CREW_HARNESS_SYNC_GIT = '1'
let stop
try {
  const core = await import('../core.ts')
  const fw = await import('../form-wait.ts')
  const { createTask, loadTask, saveTask } = await import('../tasks.ts')
  const { digest, formRequest } = await import('../question-routing.ts')
  const { getQuestionForm, replyQuestionForm } = await import('../question-native.ts')
  const root = path.join(tmp, 'repo'); mkdirSync(path.join(root, '.opencode'), { recursive: true }); mkdirSync(path.join(root, 'doc'))
  writeFileSync(path.join(root, '.opencode', 'crew-harness.json'), JSON.stringify({ answer_mode: { default: 'recommendations' }, answer_delay_sec: 0 }))
  const sourceText = 'Проверенная команда Alula: alula check fixture. Источник — изолированный тест, не живая команда.'
  writeFileSync(path.join(root, 'doc', 'source.md'), sourceText)
  const worker = 'ses_fixture_question_worker', integrator = 'ses_fixture_question_integrator'
  const t = createTask({ project: 'sample', title: 'fixture', goal: 'g', criteria: 'c', priority: 'P2', tier: 'light', role: 'worker', author: integrator, author_role: 'sample.integrator', qid: 'q_fixture_task', status: 'running', kind: 'assign', directory: root, executor: worker })
  for (const [session, role] of [[worker, 'worker'], [integrator, 'integrator']]) core.saveCard({ session, role, project: 'sample', auto: false, title: 'fixture', repo: 'fixture', directory: root, pid: process.pid, updated: Date.now(), ...(session === worker ? { task: { project: 'sample', n: t.n } } : {}) })
  core.takeExclusive('sample.integrator', 'integrator', integrator, false)
  const fields = [{ key: 'q_native', type: 'string', custom: true, description: 'Где проверенная команда Alula?', options: [{ value: 'guess', label: 'Угадать (Recommended)' }] }]
  let posts = 0, interrupts = 0
  const waiting = new Map(), continued = []
  const awaitingCall = id => {
    if (!waiting.has(id)) {
      let resume
      const done = new Promise(resolve => { resume = resolve }).then(answer => { continued.push({ id, answer }); return answer })
      waiting.set(id, { resume, done })
    }
    return waiting.get(id)
  }
  const forms = new Map([['frm_fixture', { id: 'frm_fixture', sessionID: worker, title: 'Alula', metadata: { kind: 'question' }, fields, state: { status: 'pending' } }]])
  const fakeFetch = async (url, init = {}) => {
    const match = /^http:\/\/question-fixture\.invalid\/api\/session\/([^/]+)\/form\/([^/]+)(\/reply)?$/.exec(String(url))
    const form = match && forms.get(match[2])
    if (!form || match[1] !== form.sessionID) throw new Error(`unexpected real transport: ${url}`)
    const call = awaitingCall(form.id)
    if (init.method === 'POST') {
      posts++
      const body = JSON.parse(init.body)
      assert.deepEqual(Object.keys(body.answer), ['q_native'])
      assert.match(body.answer.q_native, /doc\/(?:source|chain)\.md sha256:/)
      assert.equal(form.state.status, 'pending', 'fixture forbids double answer just like native settlement')
      form.state = { status: 'answered', answer: body.answer }
      call.resume(body.answer.q_native) // Native reply settles the actual fixture's waiting question call.
      return new Response(null, { status: 204 })
    }
    return Response.json({ data: form })
  }
  globalThis.fetch = async () => { throw new Error('unexpected real transport') }
  const reg = { url: 'http://question-fixture.invalid', password: 'example' } // recognized dummy placeholder, never a real credential
  const questionIO = { get: (s, f) => getQuestionForm(s, f, reg, fakeFetch), reply: (s, f, key, answer) => replyQuestionForm(s, f, key, answer, reg, fakeFetch) }
  fw.addForm(worker, { id: 'frm_fixture', session: worker, at: Date.now() - 24 * 3600_000, kind: 'question', nq: 1, full: fields[0].description, options: ['Угадать (Recommended)'], optDesc: ['Нет проверенного источника'] })
  // An old queued recommendation from before the router must not bypass source-backed routing either.
  mkdirSync(path.join(core.BASE, 'answers'), { recursive: true })
  writeFileSync(path.join(core.BASE, 'answers', 'auto-frm_fixture.json'), JSON.stringify({ id: 'auto-frm_fixture', at: Date.now(), form: 'frm_fixture', session: worker, option: '1', quote: 'fixture recommendation', source: 'plugin' }))
  const tools = []
  const hooks = {}
  const plugin = await import('../index.ts')
  const { nativeFixture } = await import('./fixture-plugin.mjs')
  const fixture = nativeFixture({ location: { directory: root }, options: { projects: { sample: root } }, session: { get: async ({ sessionID }) => ({ id: sessionID, location: { directory: root } }), prompt: async () => ({}), hook: async (name, cb) => { hooks[name] = cb }, interrupt: async () => { interrupts++ } }, tool: { transform: async cb => cb({ add: tool => tools.push(tool) }) } })
  stop = await plugin.createCrewPlugin({ get: fixture.get, spacingMs: 0, questionIO }).setup(fixture.ctx)
  const hint = async () => { const ev = { sessionID: integrator, system: [] }; await hooks.context(ev); return ev.system.map(s => s.text).join('\n') }
  const h1 = await hint(), h2 = await hint()
  assert.equal(h1, h2)
  assert.ok(h1.length < 1100, `constant system hint stays bounded: ${h1.length}`)
  assert.match(h1, /Working questions go via task author\/current project integrator/)
  assert.doesNotMatch(h1, /[а-яё]/i, 'agent system hint keeps the existing English/cache contract; owner-facing help is Russian')
  const router = core.questionRouterFor({})
  const until = async fn => { for (let i = 0; i < 80; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 25)) } throw new Error(`fixture routing timeout: ${JSON.stringify(router.list())}\n${readFileSync(path.join(tmp, 'opencode-plugins.log'), 'utf8')}`) }
  await until(() => router.list().some(r => r.form?.id === 'frm_fixture' && r.target === integrator))
  const record = router.list().find(r => r.form?.id === 'frm_fixture')
  assert.equal(record.status, 'routing')
  assert.equal(posts, 0, 'Recommended must not guess a missing fact')
  assert.equal(continued.length, 0, 'a routing/outbox enqueue is not continuation of the waiting call')
  const result = await tools.find(t => t.name === 'crew_question').execute({ action: 'resolve', id: record.id, epoch: record.epoch, text: 'Проверенная команда Alula: alula check fixture.', sources: [{ path: 'doc/source.md', sha256: digest(sourceText), quote: sourceText }] }, { sessionID: integrator })
  assert.match(result.content, /answered/)
  assert.equal(posts, 1)
  await awaitingCall('frm_fixture').done
  assert.equal(continued.length, 1)
  assert.equal(interrupts, 0, 'native reply must not interrupt a live question call')
  await new Promise(r => setTimeout(r, 100))
  assert.equal(posts, 1)
  const reviewer = 'ses_fixture_question_reviewer'
  const rt = createTask({ project: 'sample', title: 'review fixture', goal: 'g', criteria: 'c', priority: 'P2', tier: 'light', role: 'worker', author: integrator, author_role: 'sample.integrator', qid: 'q_fixture_review', status: 'reviewing', kind: 'assign', directory: root, executor: 'ses_fixture_other_executor', reviewer })
  core.saveCard({ session: reviewer, role: 'worker', project: 'sample', auto: false, title: 'review fixture', repo: 'fixture', directory: root, pid: process.pid, updated: Date.now(), review: { project: 'sample', n: rt.n } })
  for (const [sid, id, rec] of [[worker, 'frm_worker_none', false], [reviewer, 'frm_reviewer_rec', true], [reviewer, 'frm_reviewer_none', false]]) {
    const options = [{ value: 'guess', label: rec ? 'Угадать (Recommended)' : 'Без проверенного источника' }]
    forms.set(id, { id, sessionID: sid, title: 'Alula', metadata: { kind: 'question' }, fields: [{ ...fields[0], options }], state: { status: 'pending' } })
    fw.addForm(sid, { id, session: sid, at: Date.now(), kind: 'question', nq: 1, full: fields[0].description, options: options.map(o => o.label) })
    const before = posts
    await until(() => router.list().some(r => r.form?.id === id && r.target === integrator))
    const r = router.list().find(r => r.form?.id === id)
    assert.equal(r.status, 'routing')
    assert.equal(posts, before, 'neither recommendation nor reviewer role may invent the missing fact')
    const answer = await tools.find(t => t.name === 'crew_question').execute({ action: 'resolve', id: r.id, epoch: r.epoch, text: 'Проверенная команда Alula: alula check fixture.', sources: [{ path: 'doc/source.md', sha256: digest(sourceText), quote: sourceText }] }, { sessionID: integrator })
    assert.match(answer.content, /answered/)
    assert.equal(posts, before + 1)
    assert.equal(forms.get(id).state.status, 'answered')
    await awaitingCall(id).done
  }
  assert.equal(posts, 4)
  assert.equal(interrupts, 0)
  // 087: confirmed current integrator decision for the SAME assignment/SHA/scope unblocks the original call.
  const sha = 'd7e541a7818e86b12bb9748aba38dc6e8450c879'
  const assignment = loadTask('sample', t.n)
  assignment.goal = `Передать exact SHA ${sha} на независимый просмотр по той же ранее порученной цепочке.`
  assignment.boundaries = 'Не менять SHA/объём; финальные owner gates и HOLD сохраняются.'
  saveTask(assignment)
  const chainSource = `Решение текущего ответственного: exact SHA ${sha}, та же цепочка и объём. Независимый просмотр перед отдельной финальной owner acceptance; нового разрешения на публикацию нет.`
  writeFileSync(path.join(root, 'doc', 'chain.md'), chainSource)
  const id = 'frm_chain'
  const question = `Публикация упомянута как контекст той же ранее порученной цепочки. Какой exact SHA ${sha} передать автору на независимый просмотр?`
  forms.set(id, { id, sessionID: worker, title: 'Та же цепочка', metadata: { kind: 'question' }, fields: [{ ...fields[0], description: question, options: [{ value: 'same', label: 'Тот же маршрут (Recommended)' }] }], state: { status: 'pending' } })
  const historicalAt = Date.now() - 26 * 60_000
  const historicalForm = { id, session: worker, at: historicalAt, kind: 'question', nq: 1, full: question, options: ['Тот же маршрут (Recommended)'] }
  fw.addForm(worker, historicalForm)
  // Isolated durable restart/history fixture: already routed 26 minutes ago, no safe default was declared.
  const historicalRouter = core.questionRouterFor({ questionIO })
  historicalRouter.open(formRequest(core.readJson(core.cardFile(worker)), historicalForm, { data: forms.get(id) }), historicalAt)
  await historicalRouter.tick()
  await until(() => router.list().some(r => r.form?.id === id && r.target === integrator))
  const chain = router.list().find(r => r.form?.id === id)
  assert.equal(chain.status, 'blocked', 'a late current decision resolves the original addressed blocker, not a repeated owner form')
  const chainProof = [{ path: 'doc/chain.md', sha256: digest(chainSource), quote: chainSource }]
  const qtool = tools.find(t => t.name === 'crew_question')
  const wrong = await qtool.execute({ action: 'resolve', id: chain.id, epoch: chain.epoch, text: `Передай SHA ${'f'.repeat(40)} на просмотр.`, sources: chainProof }, { sessionID: integrator })
  assert.match(wrong.content, /иной SHA/)
  assignment.boundaries += ' Новый объём.'; saveTask(assignment)
  const changed = await qtool.execute({ action: 'resolve', id: chain.id, epoch: chain.epoch, text: `Передай exact SHA ${sha} на независимый просмотр.`, sources: chainProof }, { sessionID: integrator })
  assert.match(changed.content, /границы изменились/)
  assignment.boundaries = 'Не менять SHA/объём; финальные owner gates и HOLD сохраняются.'; saveTask(assignment)
  assert.equal(continued.length, 4)
  assert.equal(posts, 4)
  const accepted = await qtool.execute({ action: 'resolve', id: chain.id, epoch: chain.epoch, text: `Передай exact SHA ${sha} автору на независимый просмотр той же цепочки; финальное решение владельца остаётся отдельным.`, sources: chainProof }, { sessionID: integrator })
  assert.match(accepted.content, /answered/)
  const actualResult = await awaitingCall(id).done
  assert.match(actualResult, new RegExp(sha))
  assert.equal(continued.length, 5, 'receipt is the waiting native call continuation, not HTTP enqueue/record alone')
  assert.equal(continued.at(-1).id, id)
  const late = await qtool.execute({ action: 'resolve', id: chain.id, epoch: chain.epoch, text: `Передай exact SHA ${sha} ещё раз.`, sources: chainProof }, { sessionID: integrator })
  assert.match(late.content, /settled/)
  assert.equal(posts, 5)
  // An in-flight tool/native read drains across unload; it must not turn into a new reply POST.
  const closing = 'frm_dispose'
  forms.set(closing, { id: closing, sessionID: worker, title: 'Alula', metadata: { kind: 'question' }, fields, state: { status: 'pending' } })
  fw.addForm(worker, { id: closing, session: worker, at: Date.now(), kind: 'question', nq: 1, full: fields[0].description })
  await until(() => router.list().some(r => r.form?.id === closing && r.target === integrator))
  const closingRecord = router.list().find(r => r.form?.id === closing)
  let enter, release
  const entered = new Promise(r => { enter = r }), blocked = new Promise(r => { release = r })
  const get = questionIO.get
  questionIO.get = async (s, f) => { if (f === closing) { enter(); await blocked }; return get(s, f) }
  const pending = qtool.execute({ action: 'resolve', id: closingRecord.id, epoch: closingRecord.epoch, text: 'Команда проверена, без новых разрешений.', sources: [{ path: 'doc/source.md', sha256: digest(sourceText), quote: sourceText }] }, { sessionID: integrator })
  await entered
  const draining = stop()
  release()
  await Promise.all([draining, pending])
  stop = undefined
  assert.equal(posts, 5, 'late question GET cannot POST through a disposed plugin')
  assert.equal(router.get(closingRecord.id).attempted, undefined)
  const unloaded = await qtool.execute({ action: 'claim', id: closingRecord.id, epoch: closingRecord.epoch }, { sessionID: integrator })
  assert.match(unloaded.content, /снят/)
  console.log('ok real plugin: existing form -> integrator with source -> exact native field once, no guessed Recommended/interrupt')
  console.log('ok real plugin AC-1 matrix: worker/reviewer with/without Recommended preserve native qid and source')
  console.log('ok 087: current decision/same SHA/scope -> original call continued; wrong SHA/scope/second reply refused')
  console.log('ok question tool/GET unload drains; no late reply POST or new native attempt')
} finally { await stop?.(); rmSync(tmp, { recursive: true, force: true }) }
