import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModel, reduce, timeline } from '../state.js';
import { createDelivery, createDraftStore, safeError, restoreText, afterSendText } from '../delivery.js';
import { deliveryCard } from '../delivery-ui.js';
import { createFakeDocument } from './fake-dom.mjs';

test('260: текст записан до передачи, reload запрещает повтор неизвестной доставки', async () => {
  const { createDelivery } = await import('../delivery.js');
  const storage = { value: null, getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  const d = createDelivery(storage);
  const event = { id: 'out-1', trace: 's', kind: 'user_message', input: { text: 'не терять', turn: 'client-turn' }, time: 2 };
  assert.equal(d.add(event), true);
  assert.match(storage.value, /не терять/);
  assert.equal(createDelivery(storage).items('s')[0].state, 'unknown');
  assert.equal(createDelivery(storage).canRetry('out-1'), false);
  d.failed('out-1', 'offline');
  assert.equal(d.canRetry('out-1'), true);
});

test('260: ошибка без turn не подменяет законченный ответ; поздний ответ закрывает ошибку своего хода', () => {
  let i = 0;
  const e = (kind, input) => ({ id: `e${++i}`, trace: 's', step: i, kind, input, time: i });
  let m = reduce(initialModel(), e('session_created', {}));
  m = reduce(m, e('user_message', { turn: 't', text: 'вопрос' }));
  m = reduce(m, e('error', { turn: 't', message: 'network failure' }));
  assert.equal(m.sessions.s.messages[1].status, 'error');
  m = reduce(m, e('agent_chunk', { turn: 't', text: 'поздний ответ' }));
  m = reduce(m, e('agent_done', { turn: 't' }));
  assert.equal(m.sessions.s.messages[1].status, 'done');
  m = reduce(m, e('error', { message: 'cannot be started' }));
  assert.equal(m.sessions.s.messages[1].status, 'done');
  assert.equal(timeline(m.sessions.s).filter(x => x.tone === 'error').length, 1);
});

test('260: retry, возврат, подробности и доступность карточки', () => {
  const doc = createFakeDocument();
  let retried = 0, restored = '', copied = '';
  const item = { id: 'id', state: 'not_sent', images: [], text: '<b>не HTML</b>', reason: 'offline Authorization: Bearer secret' };
  const card = deliveryCard(doc, item, { retry: () => retried++, restore: t => restored = t, copy: t => copied = t });
  assert.equal(card.getAttribute('role'), 'alert');
  assert.match(card.textContent, /⚠/);
  const buttons = card.querySelectorAll('button');
  buttons[0].click(); buttons[0].click();
  assert.equal(retried, 1);
  buttons[1].click();
  assert.equal(restored, item.text);
  card.querySelector('details').querySelector('button').click();
  assert.match(copied, /Сообщение не отправлено/);
  assert.doesNotMatch(card.textContent + copied, /Bearer|secret/);
  for (const state of ['unknown', 'received', 'accepted', 'agent_error']) {
    const c = deliveryCard(doc, { ...item, state }, {});
    assert.equal(c.querySelector('button').disabled, true);
  }
});

test('260: черновик сохраняется, хранилище ограничено без вытеснения неотправленных', () => {
  const map = new Map();
  const storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) };
  createDraftStore(storage).set('s', 'новый черновик');
  assert.equal(createDraftStore(storage).get('s'), 'новый черновик');
  const d = createDelivery(storage);
  for (let i = 0; i < 100; i++) assert.equal(d.add({ id: `e${i}`, trace: 's', input: { text: 'сохранить' }, time: i }), true);
  assert.equal(d.add({ id: 'too-many', trace: 's', input: { text: 'не отправлять' }, time: 101 }), false);
  assert.equal(d.items('s').length, 100);
  d.forget('e0');
  assert.equal(d.items('s').length, 99);
});

test('260: ошибки с секретами разрешают только фиксированную безопасную причину', () => {
  for (const value of ['Authorization: Bearer sk-secret', 'HTTP 503 https://example.test/?key=secret', '{"api_key":"secret","error":"401"}', 'token=secret\nopaque sensitive provider detail']) {
    assert.doesNotMatch(safeError(value), /secret|pass|api_key|PRIVATE KEY|example|Bearer/);
    assert.equal(safeError(safeError(value)), safeError(value));
  }
});

test('260: возврат не затирает черновик; позднее завершение upload не очищает новую правку', () => {
  assert.equal(restoreText('отправленное', 'новый черновик'), 'отправленное\n\nновый черновик');
  assert.equal(restoreText('отправленное', ''), 'отправленное');
  assert.equal(afterSendText('отправленное', 'новый черновик'), 'новый черновик');
  assert.equal(afterSendText('отправленное', 'отправленное'), '');
});

test('260: ошибка запуска до первого хода не исчезает из ленты', () => {
  let m = reduce(initialModel(), { id: 'c', trace: 's', step: 0, kind: 'session_created', input: {}, time: 1 });
  m = reduce(m, { id: 'e', trace: 's', step: 1, kind: 'error', input: { turn: '', message: 'the agent cannot be started: unavailable' }, time: 2 });
  const note = timeline(m.sessions.s).find(x => x.tone === 'error');
  assert.ok(note, 'причина ошибки должна быть непосредственно в чате');
  assert.match(note.reason, /Не удалось запустить агента/);
});
