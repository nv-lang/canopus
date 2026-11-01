// 280: regression through the real crew_send entry, not just the standalone state machine.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const tmp = mkdtempSync(path.join(os.tmpdir(), 'crew-question-entry-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, 'absent.db')
process.env.CREW_HARNESS_PRESENCE = 'all'
globalThis.fetch = async () => { throw new Error('unexpected real transport') }
try {
  const core = await import('../core.ts')
  const { QuestionRouter } = await import('../question-router.ts')
  const root = path.join(tmp, 'repo'); mkdirSync(root)
  const worker = { session: 'ses_fixture_worker', project: 'sample', role: 'worker', directory: root, pid: process.pid, updated: Date.now(), task: { project: 'sample', n: 87 } }
  core.saveCard(worker)
  const host = { projects: [], defaultDir: root, touch: async () => worker, isChild: () => false, posted: () => {}, picked: () => {}, roleTaken: () => {}, startTask: async () => ({}), doctor: async () => [] }
  const tools = core.makeTools(host)
  const send = tools.find(t => t.name === 'crew_send')
  const result = await send.execute({ to: 'sample.integrator', text: 'Не найдена команда Alula. Какой проверенный путь?', expect_reply: true }, worker.session)
  const router = new QuestionRouter(path.join(core.BASE, 'question-routing'), {})
  const records = router.list()
  assert.equal(records.length, 1, 'real crew_send must durably route the missing fact, not just enqueue an uncorrelated letter')
  assert.equal(records[0].session, worker.session)
  assert.equal(records[0].task, 87)
  assert.equal(records[0].channel, 'mail')
  assert.match(result.content, /qid|Вопрос/)
  assert.equal(records[0].answer, undefined)
  assert.ok(tools.some(t => t.name === 'crew_question'), 'integrator needs the source-backed reply entry')
  const { createTask, loadTask } = await import('../tasks.ts')
  const criterion = 'Короткая независимая приёмка точного коммита через интегратора'
  const small = createTask({ project: 'sample', title: 'Documentary WC-1 fixture', goal: 'g', criteria: criterion, priority: 'P2', tier: 'light', role: 'worker', author: 'ses_fixture_integrator', author_role: 'sample.integrator', qid: 'q_fixture_small', status: 'running', kind: 'assign', directory: root, executor: worker.session, route: 'small' })
  worker.task = { project: 'sample', n: small.n }; core.saveCard(worker)
  const submitted = await tools.find(t => t.name === 'crew_task').execute({ action: 'submit', n: small.n, text: 'Точный SHA d7e541a7818e86b12bb9748aba38dc6e8450c879 и проверяемый документ переданы автору; финальные ворота не пройдены.' }, worker.session)
  assert.match(submitted.content, /Явный критерий задания сохранён/)
  assert.ok(submitted.content.includes(criterion))
  assert.match(submitted.content, /не заменяет финальное решение владельца/)
  assert.doesNotMatch(submitted.content, /scripts\/test-contour|127\.0\.0\.1|подними/)
  const integrator = { ...worker, session: 'ses_fixture_integrator', role: 'integrator', task: undefined }
  core.saveCard(integrator); core.takeExclusive('sample.integrator', 'integrator', integrator.session, false)
  host.touch = async sid => sid === integrator.session ? integrator : worker
  const wrongCandidate = await tools.find(t => t.name === 'crew_task').execute({ action: 'rework', n: small.n, candidate: '0'.repeat(40), text: 'Замечания к неподтверждённому SHA' }, integrator.session)
  assert.match(wrongCandidate.content, /не подтверждён последним сданным отчётом/)
  assert.equal(loadTask('sample', small.n).status, 'submitted')
  const rework = await tools.find(t => t.name === 'crew_task').execute({ action: 'rework', n: small.n, candidate: 'd7e541a7818e86b12bb9748aba38dc6e8450c879', text: 'Две существенные находки exact-SHA просмотра; исправить только WC-1 в прежних границах.' }, integrator.session)
  assert.equal(loadTask('sample', small.n).status, 'rework', 'small corrective work must not stay submitted or be sent to main/accept/UI')
  assert.match(rework.content, /поставлено|поставлен/)
  assert.doesNotMatch(rework.content, /разбужен|main|запушь|контур/)
  assert.equal(loadTask('sample', small.n).reviewer, undefined)
  assert.equal(loadTask('sample', small.n).route, 'small')
  assert.equal(loadTask('sample', small.n).criteria, criterion)
  assert.equal(core.readJson(core.cardFile(worker.session)).busy, undefined, 'enqueued correction is not native started/busy')
  assert.ok(loadTask('sample', small.n).history.some(h => h.note?.includes('d7e541a7818e86b12bb9748aba38dc6e8450c879')))
  const repeated = await tools.find(t => t.name === 'crew_task').execute({ action: 'rework', n: small.n, candidate: 'd7e541a7818e86b12bb9748aba38dc6e8450c879', text: 'Повтор доставки тех же замечаний' }, integrator.session)
  assert.equal(loadTask('sample', small.n).rework, 1, 'retry cannot start another corrective step')
  assert.match(repeated.content, /только сданный/)
  const held = createTask({ project: 'sample', title: 'paused fixture', goal: 'g', criteria: criterion, priority: 'P2', tier: 'light', role: 'worker', author: integrator.session, author_role: 'sample.integrator', qid: 'q_fixture_hold', status: 'submitted', kind: 'assign', directory: root, executor: worker.session, route: 'small' })
  const { WATCH_DIR } = await import('../idle-watch.ts')
  mkdirSync(path.join(WATCH_DIR, 'sample'), { recursive: true })
  const holdFile = path.join(WATCH_DIR, 'sample', `${held.n}.json`)
  const holdRecord = { project: 'sample', n: held.n, hold: { kind: 'HOLD', at: 1, who: 'fixture legacy hold' } }
  writeFileSync(holdFile, JSON.stringify(holdRecord))
  const refused = await tools.find(t => t.name === 'crew_task').execute({ action: 'rework', n: held.n, candidate: 'd7e541a7818e86b12bb9748aba38dc6e8450c879', text: 'Не снимать legacy HOLD' }, integrator.session)
  assert.match(refused.content, /HOLD/)
  assert.equal(loadTask('sample', held.n).status, 'submitted')
  assert.deepEqual(core.readJson(holdFile), holdRecord)
  assert.match(core.questionExecutionBlock({ questionCanReply: () => undefined }, 'sample', held.n), /HOLD/, 'host override cannot silently release durable legacy HOLD')
  for (const scope of ['execution', 'external', 'gate']) {
    const scoped = { ...holdRecord, hold: { ...holdRecord.hold, scope, gate: true, ...(scope === 'external' ? { wait: { id: 'fixture-current-ci', deadline: 1_000_000 } } : {}) } }
    writeFileSync(holdFile, JSON.stringify(scoped))
    assert.equal(!!core.questionExecutionBlock({}, 'sample', held.n), scope === 'execution')
    assert.deepEqual(core.readJson(holdFile), scoped, 'question adapter never clears or migrates HOLD')
  }
  writeFileSync(holdFile, JSON.stringify(holdRecord))
  const next = { ...integrator, session: 'ses_fixture_new_integrator' }
  core.saveCard(next); core.takeExclusive('sample.integrator', 'integrator', next.session, true)
  assert.equal(core.questionRouterFor(host).deps.target({ project: 'sample', task: small.n, session: worker.session }), next.session, 'stale task.author role cannot override the current integrator lock')
  host.touch = async sid => sid === next.session ? next : sid === integrator.session ? integrator : worker
  host.questionInspectText = async () => ({ state: 'pending' })
  mkdirSync(path.join(root, 'doc'), { recursive: true })
  const textSource = 'Фикстура: команда Alula проверена по служебному артефакту; разрешений владельца не выдаёт.'
  writeFileSync(path.join(root, 'doc', 'source.md'), textSource)
  const { digest } = await import('../question-routing.ts')
  const qtool = tools.find(t => t.name === 'crew_question')
  await qtool.execute({ action: 'ask', text: 'Где проверенная команда Alula?', context: 'Нужен факт, не новое разрешение.' }, worker.session)
  const textRecord = router.list().find(r => r.channel === 'text')
  assert.equal(textRecord.target, next.session)
  assert.equal(textRecord.status, 'routing')
  const solved = await qtool.execute({ action: 'resolve', id: textRecord.id, epoch: textRecord.epoch, text: 'Команда приведена в проверенном артефакте.', sources: [{ path: 'doc/source.md', sha256: digest(textSource), quote: textSource }] }, next.session)
  assert.match(solved.content, /answer_queued/)
  const answer = core.readJson(path.join(core.INBOX, worker.session, `question-answer-${textRecord.id}.json`))
  assert.equal(answer.reply_to, textRecord.qid)
  assert.match(answer.text, /doc\/source.md sha256:/)
  assert.equal(router.get(textRecord.id).status, 'answer_queued', 'mail enqueue does not invent receipt/started')
  await qtool.execute({ action: 'ack', id: textRecord.id }, worker.session)
  assert.equal(router.get(textRecord.id).status, 'answered')
  await qtool.execute({ action: 'ask', text: 'Как продолжить неблокированную часть той же работы?', context: 'Recommended не разрешение.' }, worker.session)
  const defaultRecord = router.list().find(r => r.channel === 'text' && r.status === 'routing')
  const configured = await qtool.execute({ action: 'default', id: defaultRecord.id, epoch: defaultRecord.epoch, sources: [{ path: 'doc/source.md', sha256: digest(textSource), quote: textSource }] }, next.session)
  assert.match(configured.content, /continue_assigned/)
  const policy = router.get(defaultRecord.id).default
  assert.equal(policy.scope.assignment, small.qid, 'trusted host derives assignment from actual task, not model text')
  assert.equal(policy.by, next.session)
  assert.equal(policy.deadline, router.get(defaultRecord.id).deadline)
  assert.equal(qtool.input.properties.scope, undefined, 'model cannot submit an authorization/scope flag')
  console.log('ok crew_send -> durable correlated question and source-backed reply tool')
  console.log('ok real small submit preserves documentary criterion and final owner gate without invented UI URL')
  console.log('ok exact-SHA small corrective handoff updates real step without full reviewer/busy/owner acceptance')
  console.log('ok actual text ask/resolve/ack keeps original reply_to, checked source and distinct queued/received states')
} finally { rmSync(tmp, { recursive: true, force: true }) }
