// 280 follow-up: deadlines do not create authority; only a predeclared, source/scope-bound continuation.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const tmp = mkdtempSync(path.join(os.tmpdir(), 'crew-question-default-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, 'absent.db')
globalThis.fetch = async () => { throw new Error('unexpected real transport') }
try {
  const { QuestionRouter, QUESTION_ROUTE_TERM_MS } = await import('../question-router.ts')
  let target = 'ses_fixture_integrator', observation = { state: 'pending' }, held, posts = 0, scopeDigest = 'a'.repeat(64)
  const outbox = []
  const sources = [{ path: 'doc/assignment.md', sha256: 'b'.repeat(64), quote: 'Продолжить неблокированную часть того же задания.' }]
  const deps = {
    target: () => target,
    inspect: async () => observation,
    verify: async (_r, s) => s.length && s.every(x => x.sha256 === sources[0].sha256) ? s : undefined,
    scope: () => ({ assignment: 'q_fixture_assignment', digest: scopeDigest }),
    canReply: () => held,
    closed: text => /merge|оплатить|публиковать|новая работа|Тип: gate/i.test(text),
    post: (to, text, id) => { if (!outbox.some(m => m.id === id)) outbox.push({ to, text, id }) },
    reply: async () => { posts++; return { state: 'applied' } },
  }
  const router = new QuestionRouter(path.join(tmp, 'routing'), deps)
  const request = (qid, at, text = 'Как продолжить неблокированную часть текущей работы?') => ({ qid, session: 'ses_fixture_worker', project: 'sample', task: 1, channel: 'form', text, context: 'Исходный контекст не является разрешением.', source: { kind: 'form', id: qid, at }, form: { id: `frm_${qid}`, field: 'q_native', fingerprint: 'fixture' } })
  const missing = router.open(request('without-default', 100))
  await router.tick(101)
  await router.tick(100 + QUESTION_ROUTE_TERM_MS + 1)
  assert.equal(router.get(missing.id).status, 'blocked', 'a deadline without a safe default needs an addressed blocker, not an automatic owner question')
  assert.equal(router.get(missing.id).blocker.to, target)
  assert.equal(router.get(missing.id).qid, 'without-default')
  assert.equal(posts, 0)
  const before = outbox.length
  await router.tick(100 + QUESTION_ROUTE_TERM_MS + 2)
  assert.equal(outbox.length, before, 'blocker delivery is idempotent')

  const safe = router.open(request('safe', 1000))
  await router.tick(1001)
  await router.setDefault(safe.id, target, 1, sources, 1010, 1002)
  await router.tick(1009)
  assert.equal(posts, 0)
  await router.tick(1010)
  assert.equal(posts, 1)
  assert.equal(router.get(safe.id).status, 'answered')
  assert.equal(router.get(safe.id).default.kind, 'continue_assigned')
  assert.equal(router.get(safe.id).default.scope.assignment, 'q_fixture_assignment')
  assert.deepEqual(router.get(safe.id).default.sources, sources)
  assert.match(router.get(safe.id).answer, /той же|уже порученн/)
  await router.tick(1011)
  assert.equal(posts, 1, 'native answer is not repeated')
  await new QuestionRouter(path.join(tmp, 'routing'), deps).tick(1012)
  assert.equal(posts, 1, 'restart does not repeat the default reply')

  const changed = router.open(request('scope-change', 2000))
  await router.tick(2001)
  await router.setDefault(changed.id, target, 1, sources, 2010, 2002)
  scopeDigest = 'c'.repeat(64)
  await router.tick(2010)
  assert.equal(router.get(changed.id).status, 'blocked')
  assert.equal(posts, 1)
  scopeDigest = 'a'.repeat(64)

  const hold = router.open(request('explicit-hold', 3000))
  await router.tick(3001)
  await router.setDefault(hold.id, target, 1, sources, 3010, 3002)
  held = 'execution_pause/legacy HOLD'
  await router.tick(3010)
  assert.equal(router.get(hold.id).status, 'blocked')
  assert.equal(router.get(hold.id).attempted, undefined)
  assert.equal(posts, 1)
  held = undefined
  const handover = router.open(request('handover', 3500))
  await router.tick(3501)
  await router.setDefault(handover.id, target, 1, sources, 3510, 3502)
  target = 'ses_fixture_new_integrator'
  await router.tick(3510)
  assert.equal(router.get(handover.id).status, 'blocked')
  assert.equal(router.get(handover.id).blocker.to, target)
  assert.equal(posts, 1)
  target = 'ses_fixture_integrator'

  for (const [i, text] of ['Выполнить merge?', 'Оплатить квоту?', 'Публиковать результат?', 'Новая работа?', 'Тип: gate\nПринять?'].entries()) {
    const x = router.open(request(`owner-${i}`, 4000 + i * 100, text))
    await router.tick(4001 + i * 100)
    await assert.rejects(router.setDefault(x.id, target, 1, sources, 4010 + i * 100, 4002 + i * 100), /owner/)
  }
  const owner = router.open(request('late-owner', 5000))
  await router.tick(5001)
  await router.setDefault(owner.id, target, 1, sources, 5010, 5002)
  observation = { state: 'answered', answer: 'Актуальное решение владельца' }
  await router.tick(5010)
  assert.equal(router.get(owner.id).status, 'settled')
  assert.equal(router.get(owner.id).observed.answer, 'Актуальное решение владельца')
  assert.equal(posts, 1)
  observation = { state: 'pending' }
  for (const state of ['cancelled', 'replaced', 'missing']) {
    const x = router.open(request(state, 6000))
    await router.tick(6001)
    await router.setDefault(x.id, target, 1, sources, 6010, 6002)
    observation = { state }
    await router.tick(6010)
    assert.equal(router.get(x.id).status, 'settled')
    assert.equal(posts, 1)
    observation = { state: 'pending' }
  }
  const race = router.open(request('owner-during-verification', 6500))
  await router.tick(6501)
  await router.setDefault(race.id, target, 1, sources, 6510, 6502)
  const verify = deps.verify
  deps.verify = async (r, s) => { if (r.qid === 'owner-during-verification') observation = { state: 'answered', answer: 'owner won during source check' }; return verify(r, s) }
  await router.tick(6510)
  assert.equal(router.get(race.id).status, 'settled')
  assert.equal(posts, 1)
  deps.verify = verify; observation = { state: 'pending' }
  const proof = router.open(request('no-model-authority', 7000))
  await router.tick(7001)
  await assert.rejects(router.setDefault(proof.id, 'ses_fixture_other', 1, sources, 7010, 7002), /responsible/)
  await assert.rejects(router.setDefault(proof.id, target, 1, [], 7010, 7002), /source/)
  deps.scope = () => undefined
  await assert.rejects(router.setDefault(proof.id, target, 1, sources, 7010, 7002), /scope/)
  assert.equal(posts, 1)
  console.log('ok deadline/default/blocker: same-assignment provenance only; no source/scope/gate/HOLD/owner/form/POST bypass')
} finally { rmSync(tmp, { recursive: true, force: true }) }
