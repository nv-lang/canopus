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
  assert.equal(card.getAttribute('role'), 'status');
  assert.match(card.querySelector('.delivery-head').textContent, /Не отправлено.*Подробнее/);
  const buttons = card.querySelectorAll('.delivery-actions button');
  buttons[0].click(); buttons[0].click();
  assert.equal(retried, 1);
  buttons[1].click();
  assert.equal(restored, item.text);
  card.querySelector('details').querySelector('button').click();
  assert.match(copied, /Сообщение не отправлено/);
  assert.doesNotMatch(card.textContent + copied, /Bearer|secret/);
  for (const state of ['unknown', 'received', 'accepted', 'agent_error']) {
    const c = deliveryCard(doc, { ...item, state }, {});
    assert.ok(!c.querySelectorAll('.delivery-actions button').some(button => button.textContent === 'Повторить'));
  }
});

test('delivery defaults to a compact row and shows the reason only in details', () => {
  const doc = createFakeDocument();
  const item = { id: 'fold', state: 'not_sent', images: [], text: 'текст сообщения', reason: 'offline' };
  const folded = deliveryCard(doc, item, {});
  const head = folded.querySelector('.delivery-head');
  assert.equal(head.tagName, 'BUTTON');
  assert.equal(head.getAttribute('aria-expanded'), 'false');
  assert.match(head.textContent, /Не отправлено.*Подробнее/);
  assert.doesNotMatch(head.textContent, /Соединение прервано/);
  assert.equal(folded.querySelector('.delivery-body').hidden, true);
  const expanded = deliveryCard(doc, { ...item, collapsed: false }, {});
  assert.equal(expanded.querySelector('.delivery-head').getAttribute('aria-expanded'), 'true');
  assert.equal(expanded.querySelector('.delivery-body').hidden, false);
  assert.match(expanded.querySelector('.delivery-body').textContent, /Соединение прервано/);
});

test('restored errors show only a neutral reconciliation status while loading', () => {
  const doc = createFakeDocument();
  const row = deliveryCard(doc, { checking: true, state: 'received', reason: 'offline', images: [] }, {});
  assert.equal(row.getAttribute('role'), 'status');
  assert.equal(row.getAttribute('aria-label'), 'Проверяем доставку…');
  assert.match(row.textContent, /^[А-ЯЁ][а-яё ]+…$/u);
  assert.equal(row.querySelector('button'), null);
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

test('260: отсутствующий в реестре агент имеет конкретную безопасную причину и действие', () => {
  const message = safeError('the agent cannot be started: the agent legacy-agent is not configured token=secret');
  assert.match(message, /не настроен на сервере/);
  assert.match(message, /доступным агентом/);
  assert.doesNotMatch(message, /legacy-agent|secret|token/);
  assert.equal(safeError(message), message);
});

test('260: возврат не затирает черновик; позднее завершение upload не очищает новую правку', () => {
  assert.equal(restoreText('отправленное', 'новый черновик'), 'отправленное\n\nновый черновик');
  assert.equal(restoreText('отправленное', ''), 'отправленное');
  assert.equal(afterSendText('отправленное', 'новый черновик'), 'новый черновик');
  assert.equal(afterSendText('отправленное', 'отправленное'), '');
});

test('260: завершение старого хода не стирает новую или непривязанную ошибку', () => {
  const storage = { getItem() { return null; }, setItem() {} };
  const d = createDelivery(storage);
  d.error({ id: 'new-error', trace: 's', input: { turn: 't', message: 'network' }, time: 20 });
  d.error({ id: 'unbound', trace: 's', input: { message: 'network' }, time: 5 });
  const m = { sessions: { s: { messages: [{ role: 'agent', turn: 't', status: 'done', doneAt: 10 }] } } };
  d.reconcile(m);
  assert.equal(d.items('s').length, 2);
  m.sessions.s.messages[0].doneAt = 30;
  d.reconcile(m);
  assert.deepEqual(d.items('s').map(r => r.id), ['unbound']);
});

test('260: технический отказ ответа — компактный статус принятого сообщения', () => {
  const doc = createFakeDocument();
  let restored = '';
  for (const reason of ['ConnectionLost', 'NoResult', 'Timeout', 'MaxTokens', 'ModelRefused']) {
    const item = { id: 'accepted', state: 'agent_refused', images: [], text: 'принятый вопрос', reason };
    const card = deliveryCard(doc, item, { restore: text => restored = text, copy() {} });
    assert.equal(card.getAttribute('role'), 'status');
    assert.ok(card.classList.contains('delivery-error'));
    assert.match(card.textContent, /⚠ Агент не ответил/);
    assert.equal(card.querySelectorAll('.delivery-actions button').length, 1);
    card.querySelectorAll('.delivery-actions button')[0].click();
    assert.equal(restored, item.text);
    assert.doesNotMatch(safeError(reason), /Точная причина недоступна/);
  }
});

test('260: ошибка запуска до первого хода не исчезает из ленты', () => {
  let m = reduce(initialModel(), { id: 'c', trace: 's', step: 0, kind: 'session_created', input: {}, time: 1 });
  m = reduce(m, { id: 'e', trace: 's', step: 1, kind: 'error', input: { turn: '', message: 'the agent cannot be started: unavailable' }, time: 2 });
  const note = timeline(m.sessions.s).find(x => x.tone === 'error');
  assert.ok(note, 'причина ошибки должна быть непосредственно в чате');
  assert.match(note.reason, /Не удалось запустить агента/);
});

test('restored session errors retain timestamp and are labelled as history, without replaying messages',()=>{
 const storage={value:null,getItem(){return this.value},setItem(_k,v){this.value=v}};
 const before=createDelivery(storage);before.error({id:'old',trace:'s',input:{message:'network'},time:1000});
 const current=createDelivery(storage),record=current.items('s')[0];assert.equal(record.restored,true);assert.equal(record.at,1000);
 const doc=createFakeDocument(),card=deliveryCard(doc,{...record,collapsed:true},{copy(){},restore(){},forget(){}});
 assert.equal(card.getAttribute('role'),'note');assert.match(card.textContent,/Сохранённая ошибка/);assert.ok(card.querySelector('time'));assert.equal(card.querySelector('.delivery-body').hidden,true);
 current.error({id:'new',trace:'s',input:{message:'timeout'},time:2000});assert.notEqual(current.items('s')[1].restored,true);assert.equal(JSON.parse(storage.value).length,2);
});
test('pending and rejected deliveries are announced as statuses', () => {
  const doc = createFakeDocument();
  for (const state of ['sending', 'received', 'accepted']) {
    const status = deliveryCard(doc, { state, images: [] }, {});
    assert.equal(status.getAttribute('role'), 'status');
    assert.ok(!status.classList.contains('delivery-error'));
  }
  const failure = deliveryCard(doc, { state: 'received', reason: 'offline', images: [] }, {});
  assert.equal(failure.getAttribute('role'), 'status');
  assert.ok(failure.classList.contains('delivery-error'));
});

test('an unknown delivery is a neutral status without a retry button', () => {
  const doc = createFakeDocument();
  const card = deliveryCard(doc, { state: 'unknown', images: [] }, {});
  assert.equal(card.getAttribute('role'), 'status');
  assert.ok(card.classList.contains('delivery-uncertain'));
  assert.doesNotMatch(card.textContent, /⚠/);
  assert.equal(card.querySelectorAll('.delivery-actions button').length, 0);
});

test('cross-family refusal explains the context boundary without copying raw errors', () => {
  const result = safeError('Смена семьи источника остановлена: драйвер не гарантирует полный перенос контекста без отдельного хода. token=secret');
  assert.match(result, /Перенос истории к выбранному агенту не завершился/);
  assert.doesNotMatch(result, /secret/);
  assert.equal(safeError(result), result);
});
