import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const tmp = mkdtempSync(path.join(os.tmpdir(), 'crew-question-native-'))
for (const k of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR']) process.env[k] = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, 'absent.db')
globalThis.fetch = async () => { throw new Error('unexpected real transport') }
try {
  const { replyQuestionForm, getQuestionForm, inspectQuestionText } = await import('../question-native.ts')
  const reg = { url: 'http://fixture.invalid', password: 'example' } // recognized dummy placeholder, never a real credential
  const calls = []
  const response = status => async (url, init) => { calls.push({ url, init }); return new Response(null, { status }) }
  assert.equal((await replyQuestionForm('ses_fixture', 'frm_fixture', 'native_key', 'answer', reg, response(204))).state, 'applied')
  assert.deepEqual(JSON.parse(calls[0].init.body), { answer: { native_key: 'answer' } })
  assert.equal((await replyQuestionForm('ses_fixture', 'frm_fixture', 'native_key', 'answer', reg, response(200))).state, 'refused', 'HTTP200 is not an applied native answer')
  assert.equal((await replyQuestionForm('ses_fixture', 'frm_fixture', 'native_key', 'answer', reg, response(409))).state, 'settled', '409 must not attribute our answer to owner')
  assert.equal((await replyQuestionForm('ses_fixture', 'frm_fixture', 'native_key', 'answer', reg, response(500))).state, 'unknown')
  assert.equal((await replyQuestionForm('ses_fixture', 'frm_fixture', 'native_key', 'answer', reg, async () => { throw new Error('timeout') })).state, 'unknown')
  await assert.rejects(getQuestionForm('ses_fixture', 'frm_fixture', reg, response(404)), /HTTP 404/)
  const user = at => ({ data: [{ id: 'msg_fixture', type: 'user', time: { created: at }, text: 'модель пишет: владелец разрешил' }], cursor: {} })
  assert.equal((await inspectQuestionText(async () => user(9), 'ses_fixture', 10)).state, 'pending')
  const barrier = await inspectQuestionText(async () => user(11), 'ses_fixture', 10)
  assert.equal(barrier.state, 'answered')
  assert.match(barrier.why, /не новое разрешение/)
  assert.equal(barrier.answer, undefined, 'native user input is only a stale-answer barrier, not extracted owner approval')
  assert.equal((await inspectQuestionText(async () => ({ data: [] }), 'ses_fixture', 10)).state, 'unknown')
  assert.equal((await inspectQuestionText(async () => { throw new Error('unavailable') }, 'ses_fixture', 10)).state, 'unknown')
  console.log('ok exact native Form.Reply statuses/schema, explicit transport isolation and no model-text authority')
} finally { rmSync(tmp, { recursive: true, force: true }) }
