// 280: isolated durable routing; no SDK, service registration, credentials or native state.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = mkdtempSync(path.join(os.tmpdir(), 'canopus-question-router-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
process.env.CANOPUS_HOME = path.join(tmp, "opencode")
process.env.CANOPUS_DB = path.join(tmp, 'absent.db')
globalThis.fetch = async () => { throw new Error('unexpected real transport') }
let cells = 0
const cell = async (name, fn) => { await fn(); cells++; console.log(`ok ${name}`) }
try {
  const { QuestionRouter } = await import('../question-router.ts')
  let target = 'ses_integrator', observed = { state: 'pending' }, sends = [], replies = 0
  const source = { path: 'doc/source.md', sha256: 'a'.repeat(64), quote: 'проверенная команда' }
  const deps = {
    target: () => target,
    inspect: async () => observed,
    verify: async (_r, sources) => sources.length && sources.every(s => s.sha256 === source.sha256 && s.quote === source.quote) ? sources : undefined,
    closed: text => /merge|оплатить|владелец разрешил|снять HOLD/.test(text),
    post: (to, text, id, replyTo) => { if (!sends.some(s => s.id === id)) sends.push({ to, text, id, replyTo }) },
    reply: async () => { replies++; return { state: 'applied' } },
  }
  const dir = path.join(tmp, 'routing')
  let router = new QuestionRouter(dir, deps)
  const request = (qid, channel = 'form') => ({ qid, project: 'sample', task: 87, session: 'ses_worker', channel, text: 'Не найдена команда Alula. Какой проверенный путь?', context: 'WC-1; рекомендация не источник', source: { kind: channel, id: qid, at: 100 }, ...(channel === 'form' ? { form: { id: `frm_${qid}`, fingerprint: 'original', field: 'q0' } } : {}) })
  await cell('worker/reviewer with/without Recommended route to integrator', async () => {
    for (const role of ['worker', 'reviewer']) for (const rec of ['', ' (Recommended)']) {
      const r = router.open({ ...request(`${role}${rec ? 'rec' : 'none'}`), text: request('x').text + rec, context: role })
      await router.tick(101)
      assert.equal(router.get(r.id).status, 'routing')
      assert.equal(router.get(r.id).target, target)
    }
    assert.equal(replies, 0)
  })
  const r = router.open(request('original'))
  await router.tick(102)
  await cell('original qid/source/context durable, route enqueue is not receipt', async () => {
    assert.equal(router.get(r.id).qid, 'original')
    assert.equal(router.get(r.id).receivedAt, undefined)
    assert.equal(router.get(r.id).source.kind, 'form')
    assert.equal(sends.find(s => s.text.includes('original')).to, target)
  })
  await cell('restart/retry keep one route outbox identity and original question', async () => {
    const n = sends.length
    router = new QuestionRouter(dir, deps)
    router.open(request('original'))
    await router.tick(103)
    assert.equal(sends.length, n)
    assert.throws(() => router.open({ ...request('original'), text: 'подмена' }), /correlation/)
    assert.equal(router.get(r.id).text, request('original').text)
  })
  await cell('untrusted actor and stale epoch cannot answer', async () => {
    await assert.rejects(router.resolve(r.id, 'ses_other', 1, 'проверенная команда', [source], 104), /responsible/)
    target = 'ses_new_integrator'
    await assert.rejects(router.resolve(r.id, 'ses_integrator', 1, 'проверенная команда', [source], 105), /responsible/)
    await router.tick(106)
    assert.equal(router.get(r.id).epoch, 2)
    await assert.rejects(router.resolve(r.id, target, 1, 'проверенная команда', [source], 107), /epoch/)
  })
  await cell('no sources/no fabricated Recommended and no model permission', async () => {
    await assert.rejects(router.resolve(r.id, target, 2, 'Recommended', [], 108), /source/)
    await assert.rejects(router.resolve(r.id, target, 2, 'проверенная команда', [{ ...source, sha256: 'b'.repeat(64) }], 109), /source/)
    await assert.rejects(router.resolve(r.id, target, 2, 'владелец разрешил merge', [source], 110), /owner/)
    assert.equal(replies, 0)
  })
  await cell('source-backed native answer settles exact form once', async () => {
    await router.resolve(r.id, target, 2, 'проверенная команда', [source], 111)
    await router.tick(112)
    await router.tick(113)
    assert.equal(replies, 1)
    assert.equal(router.get(r.id).status, 'answered')
    assert.deepEqual(router.get(r.id).sources, [source])
  })
  await cell('owner answer wins before late integrator reply', async () => {
    const x = router.open(request('owner'))
    await router.tick(120)
    observed = { state: 'answered', answer: 'выбор владельца' }
    await assert.rejects(router.resolve(x.id, target, 1, 'проверенная команда', [source], 121), /settled/)
    assert.equal(router.get(x.id).observed.answer, 'выбор владельца')
    assert.equal(replies, 1)
    observed = { state: 'pending' }
  })
  await cell('owner wins after resolve and before native write', async () => {
    const x = router.open(request('race'))
    await router.tick(130)
    await router.resolve(x.id, target, 1, 'проверенная команда', [source], 131)
    observed = { state: 'answered', answer: 'owner' }
    await router.tick(132)
    assert.equal(router.get(x.id).status, 'settled')
    assert.equal(replies, 1)
    observed = { state: 'pending' }
  })
  await cell('execution/legacy HOLD guard prevents native reply/resume without clearing answer', async () => {
    const x = router.open(request('hold'))
    await router.tick(133)
    await router.resolve(x.id, target, 1, 'проверенная команда', [source], 134)
    deps.canReply = () => 'execution_pause: нет разрешения resume'
    await router.tick(135)
    assert.equal(router.get(x.id).status, 'ready')
    assert.equal(router.get(x.id).attempted, undefined)
    assert.equal(replies, 1)
    assert.match(router.get(x.id).why, /execution_pause/)
    // Test ends this fixture as cancelled; no test removes a real HOLD.
    observed = { state: 'cancelled' }; await router.tick(136); observed = { state: 'pending' }
    delete deps.canReply
  })
  await cell('restart with persisted applying state reconciles only, never second POST', async () => {
    const x = router.open(request('crash'))
    await router.tick(137)
    const record = router.get(x.id)
    writeFileSync(path.join(dir, `${x.id}.json`), JSON.stringify({ ...record, status: 'applying', attempted: 138, answer: 'проверенная команда', sources: [source] }))
    const reboot = new QuestionRouter(dir, deps)
    await reboot.tick(139)
    assert.equal(reboot.get(x.id).status, 'unknown')
    assert.equal(replies, 1)
  })
  for (const state of ['replaced', 'cancelled', 'missing', 'stale']) await cell(`${state}: no reply and original retained`, async () => {
    const x = router.open(request(state))
    await router.tick(140)
    observed = { state }
    await router.tick(141)
    assert.equal(router.get(x.id).status, 'settled')
    assert.equal(router.get(x.id).qid, state)
    observed = { state: 'pending' }
  })
  await cell('ambiguous native outcome/restart never POST twice', async () => {
    const x = router.open(request('timeout'))
    await router.tick(150)
    await router.resolve(x.id, target, 1, 'проверенная команда', [source], 151)
    deps.reply = async () => { replies++; return { state: 'unknown', why: 'timeout' } }
    await router.tick(152)
    const n = replies
    router = new QuestionRouter(dir, deps)
    await router.tick(153)
    assert.equal(replies, n)
    assert.equal(router.get(x.id).status, 'unknown')
    observed = { state: 'answered', answer: 'actual owner choice' }
    await router.tick(154)
    assert.equal(router.get(x.id).observed.answer, 'actual owner choice')
    observed = { state: 'pending' }
  })
  await cell('text/mail preserve reply_to; queued answer is not delivered', async () => {
    for (const channel of ['text', 'mail']) {
      const x = router.open(request(channel, channel))
      await router.tick(160)
      await router.resolve(x.id, target, 1, 'проверенная команда', [source], 161)
      await router.tick(162)
      assert.equal(router.get(x.id).status, 'answer_queued')
      assert.ok(sends.some(s => s.to === 'ses_worker' && s.replyTo === channel && s.text.includes('doc/source.md')))
      assert.throws(() => router.ack(x.id, 'ses_other', 163), /recipient/)
      router.ack(x.id, 'ses_worker', 163)
      assert.equal(router.get(x.id).status, 'answered')
    }
  })
  await cell('concurrent passes and router instances never POST the same form twice', async () => {
    const x = router.open(request('concurrent'))
    await router.tick(170)
    await router.resolve(x.id, target, 1, 'проверенная команда', [source], 171)
    const n = replies
    deps.reply = async () => { replies++; await Promise.resolve(); return { state: 'applied' } }
    await Promise.all([router.tick(172), new QuestionRouter(dir, deps).tick(172)])
    assert.equal(replies, n + 1)
    assert.equal(router.get(x.id).status, 'answered')
  })
  await cell('absent integrator bounded escalation preserves unanswered request', async () => {
    target = undefined
    const x = router.open(request('absent'))
    await router.tick(200)
    await router.tick(200 + 16 * 60_000)
    assert.equal(router.get(x.id).status, 'blocked')
    assert.equal(router.get(x.id).blocker.to, 'sample.integrator')
    assert.match(router.get(x.id).why, /интегратор/)
    assert.equal(router.get(x.id).answer, undefined)
  })
  await cell('unknown native schema is visible and never pending/free', async () => {
    observed = { state: 'unknown', why: 'legacy schema' }
    const x = router.open(request('legacy'))
    await router.tick(300)
    assert.equal(router.get(x.id).status, 'unknown')
    assert.equal(router.get(x.id).answer, undefined)
  })
  assert.ok(readdirSync(dir).some(n => n.endsWith('.json')))
  assert.match(readFileSync(path.join(dir, `${r.id}.json`), 'utf8'), /original/)
  await cell('unknown durable version is retained, visible and never treated as pending', async () => {
    const x = router.open(request('unknown-version'))
    const file = path.join(dir, `${x.id}.json`)
    writeFileSync(file, JSON.stringify({ ...router.get(x.id), v: 99 }))
    assert.throws(() => router.get(x.id), /unknown/)
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).v, 99)
    assert.ok(router.problems().some(p => p.includes(x.id)))
    assert.ok(!router.list().some(r => r.id === x.id))
  })
  console.log(`${cells} routing cells passed`)
} finally { rmSync(tmp, { recursive: true, force: true }) }
