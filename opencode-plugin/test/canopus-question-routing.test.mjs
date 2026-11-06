import { writeFixtureFile } from "./fixture-settings.mjs"
// 280: real adapters, evidence and official native V2 Form.Detail fixtures; real transport forbidden.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import os from 'node:os'
import path from 'node:path'
const tmp = mkdtempSync(path.join(os.tmpdir(), 'canopus-question-routing-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(tmp, "opencode"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(tmp, 'absent.db'))
globalThis.fetch = async () => { throw new Error('unexpected real transport') }
try {
  const { createQuestionRouting, formRequest, formObservation, verifyQuestionSources, digest } = await import('../question-routing.ts')
  const root = path.join(tmp, 'repo'); mkdirSync(path.join(root, 'doc'), { recursive: true })
  const sourceText = 'Источник: задание интегратора.\nКороткая независимая приёмка точного коммита через интегратора.\nПотом отдельная финальная приёмка владельцем. URL не выдавался.\n'
  writeFixtureFile(path.join(root, 'doc', 'wc-1.md'), sourceText)
  const sources = [{ path: 'doc/wc-1.md', sha256: digest(sourceText), quote: 'Потом отдельная финальная приёмка владельцем. URL не выдавался.' }]
  assert.deepEqual(verifyQuestionSources(root, sources), sources)
  assert.equal(verifyQuestionSources(root, [{ ...sources[0], quote: 'владелец отменил финальные ворота' }]), undefined)
  assert.equal(verifyQuestionSources(root, [{ ...sources[0], sha256: '0'.repeat(64) }]), undefined)
  assert.equal(verifyQuestionSources(root, [{ ...sources[0], path: 'doc/../credentials.json' }]), undefined)
  assert.equal(verifyQuestionSources(root, [{ ...sources[0], path: 'C:/work/private.txt' }]), undefined)
  const card = { session: 'ses_fixture_worker', project: 'sample', directory: root, review: { project: 'sample', n: 87 } }
  const pending = { data: { id: 'frm_fixture', sessionID: card.session, title: 'WC-1', metadata: { kind: 'question' }, fields: [{ key: 'question_actual_key', type: 'string', description: 'Где проверенная команда Alula?', custom: true, options: [{ value: 'a', label: 'А (Recommended)' }] }], state: { status: 'pending' } } }
  const old = { id: 'frm_fixture', at: 1, full: 'Где проверенная команда Alula?', options: ['А (Recommended)'] }
  const request = formRequest(card, old, pending)
  assert.equal(request.task, 87)
  assert.equal(request.form.field, 'question_actual_key', 'do not assume a legacy q0')
  assert.equal(formObservation(request, pending).state, 'pending')
  assert.equal(formObservation(request, pending.data).state, 'unknown', 'unknown envelope cannot become pending')
  assert.equal(formObservation(request, { data: { ...pending.data, id: 'frm_other' } }).state, 'unknown')
  assert.equal(formObservation(request, { data: { ...pending.data, fields: [{ ...pending.data.fields[0], custom: false }] } }).state, 'replaced')
  assert.equal(formObservation(request, { data: { ...pending.data, state: { status: 'answered', answer: { question_actual_key: 'owner' } } } }).state, 'answered')
  let observed = pending, replies = [], outbox = [], target = 'ses_fixture_integrator'
  const host = { dir: path.join(tmp, 'routing'), target: () => target, root: () => root, inspectText: async () => ({ state: 'pending' }), canReply: () => undefined, closed: text => /merge|снять HOLD|владелец разрешил/.test(text), post: (...args) => { if (!outbox.some(x => x[2] === args[2])) outbox.push(args) }, io: { get: async () => observed, reply: async (...args) => { replies.push(args); return { state: 'applied' } } } }
  const router = createQuestionRouting(host)
  const r = router.open(request, 1000) // Existing old form receives its own bounded routing term, not an instant timeout.
  await router.tick(1001)
  assert.equal(router.get(r.id).status, 'routing')
  assert.equal(router.get(r.id).receivedAt, undefined)
  await router.resolve(r.id, target, 1, 'Два последовательных этапа: независимый просмотр, потом отдельное решение владельца. Команда проверяет артефакт; URL не выдумываем.', sources, 1002)
  await router.tick(1003)
  assert.equal(replies.length, 1)
  assert.equal(replies[0][2], 'question_actual_key')
  assert.match(replies[0][3], /doc\/wc-1.md sha256:/)
  assert.match(replies[0][3], /Не слово владельца/)
  await router.tick(1004)
  assert.equal(replies.length, 1)
  // A real gate cannot be answered with a neutral 'да' by the integrator, even with an artifact.
  const gate = router.open({ ...request, qid: 'gate', text: 'Выполнить merge?', form: { ...request.form, id: 'frm_gate' } }, 1010)
  observed = { data: { ...pending.data, id: 'frm_gate' } }
  await router.tick(1011)
  await assert.rejects(router.resolve(gate.id, target, 1, 'Да', sources, 1012), /owner/)
  await router.escalate(gate.id, target, 1, 'Разрешить только merge проверенного SHA? Рекомендация — не выполнять до обязательной проверки.', sources, 1013)
  assert.equal(router.get(gate.id).status, 'owner')
  assert.equal(replies.length, 1)
  // The router does not translate a model's claimed owner permission into an authenticated owner decision.
  assert.equal(router.get(gate.id).observed, undefined)
  observed = { data: { ...pending.data, id: 'frm_heading', title: 'merge' } }
  const heading = router.open(formRequest(card, { ...old, id: 'frm_heading' }, observed), 1020)
  await router.tick(1021)
  await assert.rejects(router.resolve(heading.id, target, 1, 'Да', sources, 1022), /owner/, 'a proposed owner action in the native heading is not lost')
  assert.equal(replies.length, 1)
  console.log('ok source identity/attribution, WC-1 sequential provenance, existing form/native field, genuine gate and no model authority')
} finally { rmSync(tmp, { recursive: true, force: true }) }
