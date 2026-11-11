import { writeFixtureFile } from "./fixture-settings.mjs"
// 280: isolated durable routing; no SDK, service registration, credentials or native state.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import os from 'node:os'
import path from 'node:path'

const tmp = mkdtempSync(path.join(os.tmpdir(), 'canopus-question-router-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
;await (await import("./test-home.mjs")).configureTestHome(path.join(tmp, "opencode"))
;await (await import("./fixture-settings.mjs")).setFixtureRuntime("DB", path.join(tmp, 'absent.db'))
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
  await cell('291: historical lock isolates one record, preserves evidence and native outcome across restart/concurrency', async () => {
    const isolated = path.join(tmp, 'locked-record')
    const posts = new Map(), native = [], inspected = []
    const local = { ...deps, target: r => `${r.project}.integrator`,
      scope: () => ({ assignment: 'fixture', digest: 'c'.repeat(64) }), scopeRepair: () => undefined,
      inspect: async r => { inspected.push(r.id); return { state: 'pending' } },
      post: (to, text, id) => { if (!posts.has(id)) posts.set(id, { to, text }) },
      reply: async r => { native.push(r.id); await Promise.resolve(); return { state: 'applied' } },
    }
    let q = new QuestionRouter(isolated, local)
    // Choose the historical record by actual scan order, never by filesystem insertion order.
    const records = Array.from({ length: 8 }, (_, i) => q.open({ ...request(`lock-${i}`), project: `project${i % 2}` }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const history = records[0], ready = records[1]
    await q.tick(101)
    await q.resolve(ready.id, local.target(ready), 1, 'проверенная команда', [source], 102)
    const file = path.join(isolated, `${history.id}.json`), lock = `${file}.lock`
    writeFixtureFile(file, JSON.stringify({ ...q.get(history.id), status: 'unknown', attempted: 90,
      answer: 'исторический ответ', sources: [source], observed: { state: 'unknown', why: 'historical native outcome' },
      blocker: { to: local.target(history), at: 99, deadline: 100, why: 'historical blocker' } }))
    mkdirSync(lock)
    writeFixtureFile(path.join(lock, 'owner'), 'historical lock; never steal by age')
    const before = readFileSync(file, 'utf8')
    // New independent questions have no route yet and sort after the locked record.
    const fresh = records.slice(2)
    for (const r of fresh) writeFixtureFile(path.join(isolated, `${r.id}.json`), JSON.stringify(r))
    posts.clear()
    inspected.length = 0
    const result = await q.tick(103)
    assert.equal(result.locked.length, 1)
    assert.equal(result.locked[0].id, history.id)
    assert.match(result.locked[0].why, /\[locked\]/)
    for (const r of fresh) {
      assert.equal(q.get(r.id).target, local.target(r))
      assert.equal(q.get(r.id).epoch, 1)
      assert.ok(posts.has(`question-route-${r.id}-1`))
    }
    assert.equal(q.get(ready.id).status, 'answered')
    assert.deepEqual(native, [ready.id])
    assert.ok(q.problems().some(p => p.includes(history.id) && p.includes('[locked]')))
    q = new QuestionRouter(isolated, local)
    const count = posts.size
    await Promise.all([q.tick(104), new QuestionRouter(isolated, local).tick(104)])
    await q.tick(105 + 16 * 60_000)
    assert.deepEqual(native, [ready.id])
    assert.equal(posts.size, count + fresh.length) // only the existing deadline blockers
    assert.equal(readFileSync(file, 'utf8'), before)
    assert.equal(readFileSync(path.join(lock, 'owner'), 'utf8'), 'historical lock; never steal by age')
    assert.ok(!inspected.includes(history.id), 'lock detected before native inspection when scope repair is enabled')
  })
  await cell('291: only typed directory contention is isolated; schema and transport failures stay visible', async () => {
    const { QuestionLockedError } = await import('../question-router.ts')
    const q = new QuestionRouter(path.join(tmp, 'narrow-lock'), { ...deps })
    const x = q.open(request('narrow'))
    const lock = path.join(q.dir, `${x.id}.json.lock`)
    // A file at the lock path is corruption, not a competing lock-directory owner.
    writeFixtureFile(lock, 'not a lock directory')
    await assert.rejects(q.tick(101), e => e.code === 'EEXIST' && !(e instanceof QuestionLockedError))
    assert.ok(q.problems().some(p => p.includes('[unknown]') && p.includes(x.id)))
    rmSync(lock)
    q.deps.post = () => { throw new Error('[locked] transport failure is not lock contention') }
    await assert.rejects(q.tick(102), /transport failure/)
    q.deps.post = () => { throw new QuestionLockedError('f'.repeat(64)) }
    await assert.rejects(q.tick(103), e => e instanceof QuestionLockedError && e.id !== x.id)
    writeFixtureFile(path.join(q.dir, `${x.id}.json`), '{broken')
    const result = await q.tick(104)
    assert.equal(result.problems.length, 1)
    assert.match(result.problems[0], /повреждённая/)
    assert.deepEqual(result.locked, [])
  })
  await cell('291: locked first record cannot bypass owner/unknown/HOLD or duplicate route/answer/native outboxes', async () => {
    const isolated = path.join(tmp, 'locked-policy'), posts = new Map(), attempts = []
    let held, owner
    const local = { ...deps, target: r => `${r.project}.integrator`,
      scope: () => ({ assignment: 'fixture', digest: 'd'.repeat(64) }), scopeRepair: () => undefined,
      ownerGate: r => r.id === owner,
      canReply: r => r.id === held ? 'execution_pause HOLD' : undefined,
      post: (to, text, id) => { if (!posts.has(id)) posts.set(id, { to, text }) },
      reply: async r => { attempts.push(r.id); await Promise.resolve(); return { state: 'applied' } },
    }
    let q = new QuestionRouter(isolated, local)
    const records = Array.from({ length: 7 }, (_, i) => q.open({ ...request(`policy-${i}`), project: `project${i % 2}` }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const [history, native, , hold, unknown, gate, fresh] = records
    await q.tick(101)
    held = hold.id; owner = gate.id
    for (const r of [native, hold]) await q.resolve(r.id, local.target(r), 1, 'проверенная команда', [source], 102)
    // Open an independent mail request rather than altering identity/channel of a stored form.
    const mail = q.open({ ...request('policy-mail', 'mail'), project: 'project1' })
    // Resolve requires a route. This preparatory tick must not deliver the ready native forms yet.
    local.canReply = r => r.id === held || r.id === native.id ? 'execution_pause HOLD' : undefined
    await q.tick(102)
    await q.resolve(mail.id, local.target(mail), 1, 'проверенная команда', [source], 102)
    local.canReply = r => r.id === held ? 'execution_pause HOLD' : undefined
    writeFixtureFile(path.join(isolated, `${unknown.id}.json`), JSON.stringify({ ...q.get(unknown.id), status: 'unknown', attempted: 90, why: 'ambiguous native outcome' }))
    writeFixtureFile(path.join(isolated, `${fresh.id}.json`), JSON.stringify(fresh))
    mkdirSync(path.join(isolated, `${history.id}.json.lock`))
    assert.equal((await q.tick(103)).locked[0].id, history.id)
    assert.equal(q.get(native.id).status, 'answered')
    assert.equal(q.get(mail.id).status, 'answer_queued')
    assert.equal(q.get(hold.id).status, 'ready')
    assert.equal(q.get(hold.id).attempted, undefined)
    assert.equal(q.get(gate.id).status, 'owner')
    assert.equal(q.get(unknown.id).status, 'unknown')
    assert.equal(q.get(unknown.id).attempted, 90)
    assert.equal(q.get(fresh.id).epoch, 1)
    assert.equal(q.get(fresh.id).target, local.target(fresh))
    const count = posts.size
    q = new QuestionRouter(isolated, local)
    await Promise.all([q.tick(104), new QuestionRouter(isolated, local).tick(104)])
    await q.tick(105)
    assert.equal(posts.size, count)
    assert.deepEqual(attempts, [native.id])
    assert.equal(q.get(gate.id).status, 'owner')
    assert.equal(q.get(unknown.id).status, 'unknown')
    assert.equal(q.get(hold.id).attempted, undefined)
  })
  await cell('291: lock acquired after native POST does not claim no delivery or cause a second POST', async () => {
    const isolated = path.join(tmp, 'late-lock')
    let attempts = 0
    const local = { ...deps, reply: async r => {
      attempts++
      mkdirSync(path.join(isolated, `${r.id}.json.lock`))
      return { state: 'applied' }
    } }
    let q = new QuestionRouter(isolated, local)
    const x = q.open(request('late-lock'))
    await q.tick(101)
    await q.resolve(x.id, target, 1, 'проверенная команда', [source], 102)
    const result = await q.tick(103)
    assert.equal(result.locked[0].id, x.id)
    assert.doesNotMatch(result.locked[0].why, /попытки доставки не было/)
    assert.equal(q.get(x.id).status, 'applying')
    assert.equal(q.get(x.id).attempted, 103)
    q = new QuestionRouter(isolated, local)
    await q.tick(104)
    assert.equal(attempts, 1)
  })
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
    writeFixtureFile(path.join(dir, `${x.id}.json`), JSON.stringify({ ...record, status: 'applying', attempted: 138, answer: 'проверенная команда', sources: [source] }))
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
    writeFixtureFile(file, JSON.stringify({ ...router.get(x.id), v: 99 }))
    assert.throws(() => router.get(x.id), /unknown/)
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).v, 99)
    assert.ok(router.problems().some(p => p.includes(x.id)))
    assert.ok(!router.list().some(r => r.id === x.id))
  })
  console.log(`${cells} routing cells passed`)
} finally { rmSync(tmp, { recursive: true, force: true }) }
