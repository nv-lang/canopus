// Run the real app event handlers with only DOM/transport/clock boundaries replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import * as state from '../state.js';
import * as attention from '../attention.js';
import * as strings from '../strings.js';
import * as queue from '../queue.js';
import * as loading from '../loading.js';
import * as attachments from '../attachments.js';
import * as routes from '../routes.js';
import * as crew from '../canopus-task.js';
import * as delivery from '../delivery.js';
import { chooseMode, parseAgentRegistry } from '../transport.js';

const memory = () => {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
};
async function app(storage = memory(), sendResult = true, hash = '#s=s', sessionIndex, preview = {}) {
  const source = process.env.RED_260 === '1'
    ? execFileSync('git', ['show', 'f8b08227:src/web/app.js'], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  let callbacks;
  const sent = [];
  const timeouts = [];
  const renderedDelivery = [];
  const context = {
    ...state, ...attention, ...strings, ...queue, ...attachments, ...routes, ...crew, ...delivery, ...loading,
    chooseMode, parseAgentRegistry,
    console, URL, URLSearchParams, AbortSignal, Date, Math, Promise,
    crypto: { randomUUID: () => `client-${sent.length}-${Math.random()}` },
    localStorage: storage, sessionStorage: memory(),
    location: { search: '', protocol: 'http:', host: 'test.invalid', hash },
    document: { documentElement: { setAttribute() {}, removeAttribute() {} }, getElementById() {}, addEventListener() {} },
    addEventListener() {}, requestAnimationFrame() {},
    setInterval() {}, setTimeout(fn) { timeouts.push(fn); return timeouts.length; }, clearTimeout() {},
    fetch: async (url) => ({ ok: true, json: async () => url === '/api/sessions-index' ? sessionIndex : url.startsWith('/api/session-history/') ? preview[url.split('/').at(-1)] : ({ agents: [{ id: 'agent', label: 'Agent' }] }) }),
    createNotifier: () => ({ bellOn: () => false, soundOn: () => false, update() {} }),
    createProjectsApi: () => ({ list: async () => ({ ok: true, projects: [] }) }),
    createView: () => ({ render() { renderedDelivery.push(JSON.parse(storage.getItem(delivery.DELIVERY_KEY) || '[]')); }, tick() {}, setAgents() {} }),
    createTransport(deps) {
      callbacks = deps;
      return { start() {}, send(event) {
        sent.push(event);
        if (sendResult instanceof Error) throw sendResult;
        return sendResult;
      } };
    },
  };
  vm.createContext(context);
  const code = source.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/g, '')
    .replace('start().then(', 'globalThis.started = start().then(')
    + '\nglobalThis.probe = { handlers, getModel: () => model, getUI: () => ui, draw };';
  vm.runInContext(code, context);
  await context.started;
  const event = (kind, input = {}, extra = {}) => callbacks.onEvent({ id: `srv-${Math.random()}`, trace: 's', step: 1, kind, input, time: Date.now(), ...extra });
  event('session_created', { name: 'test', agent: 'agent' }, { step: 0 });
  return { ...context.probe, sent, event, timeouts, renderedDelivery, status: value => callbacks.onStatus(value), storage, callbacks };
}

test('260: реальный onSend сохраняет исчезавшее сообщение до эха; reload не отправляет его снова', async () => {
  const first = await app();
  assert.equal(first.handlers.onSend('s', 'не терять сообщение'), true);
  const saved = first.handlers.deliveryItems?.('s') || [];
  assert.equal(saved.length, 1, 'локальная копия должна существовать даже без эха сервера');
  assert.equal(saved[0].text, 'не терять сообщение');
  const second = await app(first.storage);
  assert.equal(second.sent.length, 0);
  assert.equal(second.handlers.deliveryItems('s')[0].state, 'unknown');
  second.handlers.onRetry('s', saved[0].id);
  assert.equal(second.sent.length, 0, 'при потерянном подтверждении retry запрещён');
});

test('260: offline retry однократен, receipt коррелирует с другим engine turn, позднее эхо снимает копию', async () => {
  const first = await app(memory(), false);
  first.handlers.onSend('s', 'текст');
  const [saved] = first.handlers.deliveryItems('s');
  assert.equal(saved.state, 'not_sent');
  const second = await app(first.storage, true);
  second.handlers.onRetry('s', saved.id);
  second.handlers.onRetry('s', saved.id);
  assert.equal(second.sent.length, 1);
  assert.equal(second.sent[0].id, saved.id);
  second.event('message_delivery', { client_id: saved.id, accepted: true, turn: 'engine-73' });
  assert.equal(second.handlers.deliveryItems('s')[0].state, 'accepted');
  second.event('user_message', { turn: 'engine-73', text: 'текст' });
  assert.equal(second.handlers.deliveryItems('s').length, 0);
});

test('260: исключение send — неизвестный исход; storage failure не разрешает отправку', async () => {
  const thrown = await app(memory(), new Error('socket race'));
  assert.equal(thrown.handlers.onSend('s', 'текст'), true);
  const [saved] = thrown.handlers.deliveryItems('s');
  assert.equal(saved.state, 'unknown');
  thrown.handlers.onRetry('s', saved.id);
  assert.equal(thrown.sent.length, 1);
  const denied = await app({ getItem() { return null; }, setItem() { throw Error('quota'); } });
  assert.equal(denied.handlers.onSend('s', 'оставить в composer'), false);
  assert.equal(denied.sent.length, 0);
});

test('260: backend ошибка без turn остаётся в чате и локально после reload без секретного payload', async () => {
  const first = await app();
  first.event('error', { turn: '', message: 'cannot be started: Authorization: Bearer secret123 https://example.test?token=secret' });
  assert.match(state.timeline(first.getModel().sessions.s).find(x => x.tone === 'error').reason, /запустить агента/);
  const second = await app(first.storage);
  const [error] = second.handlers.deliveryItems('s');
  assert.equal(error.state, 'error');
  assert.match(error.reason, /запустить агента/);
  assert.doesNotMatch(JSON.stringify(error), /secret123|password|Bearer|https:/);
});

test('260: отказ создания первой сессии сохраняет и текст, и метаданные для reload', async () => {
  const first = await app(memory(), false);
  first.handlers.onNewToggle(true);
  const draft = Object.values(first.getModel().sessions).find(s => s.draft);
  assert.ok(draft);
  assert.equal(first.handlers.onSend(draft.id, 'первое сообщение'), false);
  const [saved] = first.handlers.deliveryItems(draft.id);
  assert.equal(saved.text, 'первое сообщение');
  assert.equal(saved.state, 'not_sent');
  const second = await app(first.storage, true, '');
  assert.ok(second.getModel().sessions[draft.id]);
  assert.equal(second.getUI().awaiting, draft.id, 'локальная копия первой сессии должна открываться и без ссылки');
  assert.equal(second.handlers.deliveryItems(draft.id)[0].text, 'первое сообщение');
  assert.equal(second.sent.length, 0);
});

test('260: передача первого сообщения сокету не удаляет локальную сессию до эха создания', async () => {
  const first = await app();
  first.handlers.onNewToggle(true);
  const draft = Object.values(first.getModel().sessions).find(s => s.draft);
  assert.equal(first.handlers.onSend(draft.id, 'первое сообщение без эха'), true);
  assert.ok(first.getModel().sessions[draft.id], 'локальная сессия должна оставаться доступной до эха создания');
  assert.equal(first.handlers.deliveryItems(draft.id)[0].text, 'первое сообщение без эха');
});

test('260: связанный отказ сервера остаётся рядом с конкретной локальной копией', async () => {
  const first = await app();
  first.handlers.onSend('s', 'не терять');
  const [saved] = first.handlers.deliveryItems('s');
  first.event('error', { client_id: saved.id, turn: '', message: 'cannot be started: secret' });
  first.event('message_delivery', { client_id: saved.id, accepted: false, turn: '' });
  const [failed] = first.handlers.deliveryItems('s');
  assert.equal(failed.text, 'не терять');
  assert.equal(failed.state, 'received');
  assert.match(failed.reason, /запустить агента/);
  assert.doesNotMatch(JSON.stringify(failed), /secret/);
  const second = await app(first.storage);
  assert.match(second.handlers.deliveryItems('s')[0].reason, /запустить агента/);
  second.handlers.onRetry('s', saved.id);
  assert.equal(second.sent.length, 0);
});

test('260: поздний успешный ответ убирает сохранённую ошибку своего хода и после reload', async () => {
  const first = await app();
  first.event('user_message', { turn: 'engine-turn', text: 'текст' });
  first.event('error', { turn: 'engine-turn', message: 'connection lost' });
  assert.equal(first.handlers.deliveryItems('s').length, 1);
  first.event('agent_chunk', { turn: 'engine-turn', text: 'поздний ответ' }, { step: 3 });
  first.event('agent_done', { turn: 'engine-turn' }, { step: 4 });
  assert.equal(first.handlers.deliveryItems('s').length, 0);
  const second = await app(first.storage);
  assert.equal(second.handlers.deliveryItems('s').length, 0);
});

test('late receipt clears a timed-out local copy before rendering the accepted echo', async () => {
  const first = await app();
  first.handlers.onSend('s', 'один вопрос');
  const [saved] = first.handlers.deliveryItems('s');
  for (const timeout of first.timeouts) timeout();
  assert.equal(first.handlers.deliveryItems('s')[0].state, 'unknown');
  first.event('user_message', { turn: 'engine-turn', text: 'один вопрос' });
  first.event('message_delivery', { client_id: saved.id, accepted: true, turn: 'engine-turn' });
  for (const timeout of first.timeouts) timeout();
  assert.equal(first.renderedDelivery.at(-1).length, 0);
  assert.equal(first.handlers.deliveryItems('s').length, 0);
  assert.equal(first.sent.length, 1);
});


test('выбор модели и усилия во время хода применяется перед сообщением из очереди', async () => {
  const page = await app();
  page.event('agent_switched', { from: 'agent', to: 'codex' }, { step: 1 });
  page.event('user_message', { turn: 'active', text: 'текущий запрос' }, { step: 2 });
  const source = { family: 'codex', model: 'gpt-test', effort: 'high' };
  page.handlers.onSource('s', { ...source, effort: 'low' });
  page.handlers.onSource('s', source);
  page.handlers.onQueue('s', 'следующий запрос');
  assert.equal(page.getUI().handoffStatus.get('s').phase, 'deferred');
  assert.deepEqual(page.getUI().handoffStatus.get('s').source, source);
  assert.equal(page.sent.length, 0);
  page.event('agent_done', { turn: 'active' }, { step: 3 });
  assert.deepEqual(page.sent.map(item => item.kind), ['session_source', 'user_message']);
  assert.deepEqual(page.sent[0].input, source);
  assert.equal(page.sent[1].input.text, 'следующий запрос');
});

test('выбор другой семьи во время хода ждёт завершения и переносит контекст для очереди', async () => {
  const page = await app();
  page.event('agent_switched', { from: 'agent', to: 'kimi' }, { step: 1 });
  page.event('user_message', { turn: 'active', text: 'текущий запрос' }, { step: 2 });
  const source = { family: 'codex', model: 'gpt-test', effort: 'high' };
  page.handlers.onSource('s', source);
  page.handlers.onQueue('s', 'следующий запрос');
  assert.equal(page.sent.length, 0);
  page.event('agent_done', { turn: 'active' }, { step: 3 });
  assert.deepEqual(page.sent.map(item => item.kind), ['user_message']);
  page.event('agent_switched', { from: 'kimi', to: 'codex' }, { step: 4 });
  page.event('session_source', source, { step: 5 });
  await Promise.resolve();
  assert.deepEqual(page.sent.map(item => item.kind), ['user_message']);
  assert.equal(page.sent[0].input.text, 'следующий запрос');
  assert.deepEqual(page.sent[0].input.handoff, source);
});

test('Kimi to Codex handoff without a question starts only on send and never sends text after transfer failure', async () => {
  for (const succeeds of [false, true]) {
    const page = await app();
    page.event('agent_switched', { from: 'agent', to: 'kimi' }, { step: 1 });
    page.event('user_message', { turn: 'old', text: 'история' }, { step: 2 });
    page.event('agent_done', { turn: 'old' }, { step: 3 });
    page.handlers.onSource('s', { family: 'codex', model: 'test-model', effort: 'low' });
    assert.equal(page.getModel().sessions.s.pendingQuestion, null);
    assert.equal(page.sent.length, 0);
    assert.equal(page.getUI().handoffStatus.get('s').phase, 'selected');
    const sent = page.handlers.onSend('s', 'сохранить этот текст');
    assert.equal(page.getUI().handoffStatus.get('s').phase, 'preparing');
    assert.equal(page.sent[0].kind, 'user_message');
    assert.equal(page.sent[0].input.text, 'сохранить этот текст');
    assert.equal(page.sent[0].input.handoff.family, 'codex');
    assert.equal(page.handlers.onSend('s', 'не дублировать'), false);
    page.handlers.onApproval('s', 'codex', 'auto');
    assert.equal(page.sent.length, 1, 'approval waits for the active handoff');
    page.event('handoff_progress', { phase: 'compacting' }, { step: 4 });
    assert.equal(page.getUI().handoffStatus.get('s').compacting, true);
    if (succeeds) {
      page.event('agent_switched', { from: 'kimi', to: 'codex' }, { step: 5 });
      assert.equal(page.sent.length, 1);
      page.event('session_source', { family: 'codex', model: 'test-model', effort: 'low' }, { step: 6 });
      assert.equal(await sent, true);
      assert.equal(page.sent.length, 2);
      assert.equal(page.sent[1].kind, 'session_setting');
      assert.deepEqual({ ...page.sent[1].input }, { family: 'codex', setting: 'mode', value: 'auto' });
    } else {
      page.event('error', { message: 'Перенос контекста в Codex не завершился.' }, { step: 5 });
      assert.equal(await sent, false);
      assert.equal(page.getModel().sessions.s.agent, 'kimi');
      assert.equal(page.sent.filter(event => event.kind === 'user_message').length, 1);
      assert.equal(page.sent[1].kind, 'session_setting');
      assert.equal(page.getUI().handoffStatus.get('s').phase, 'error');
    }
  }
});

test('сохранённый выбор другой семьи запускает перенос при первой отправке', async () => {
  const page = await app();
  const source = { family: 'second', model: 'test-model', effort: 'low' };
  page.event('agent_switched', { from: 'agent', to: 'kimi' }, { step: 1 });
  page.event('user_message', { turn: 'old', text: 'история' }, { step: 2 });
  page.event('agent_done', { turn: 'old' }, { step: 3 });
  page.event('session_source', source, { step: 4 });
  const sent = page.handlers.onSend('s', 'оставить в поле ввода');
  assert.equal(page.getUI().handoffStatus.get('s').phase, 'preparing');
  assert.equal(page.sent[0].kind, 'user_message');
  assert.equal(page.getModel().sessions.s.agent, 'kimi');
  page.event('error', { message: 'Перенос контекста не завершился.' }, { step: 5 });
  assert.equal(await sent, false);
});

test('серверный чат заменяет локальный черновик, сохраняя копию сообщения', async () => {
  const storage = memory();
  const saved = delivery.createDelivery(storage);
  assert.equal(saved.add({ id: 'out', trace: 'two', time: 1, input: { text: 'локальная копия' } },
    { id: 'two', agent: 'codex', projectId: 'canopus', createdAt: 1 }), true);
  const created = { id: 'server-create', trace: 'two', kind: 'session_created', step: 0, time: 2,
    input: { name: 'Существующий чат', agent: 'codex', project_id: 'canopus' } };
  const page = await app(storage, true, '#s=two', { entries: [created] });
  assert.equal(Boolean(page.getModel().sessions.two.draft), false);
  assert.equal(page.getModel().sessions.two.name, 'Существующий чат');
  assert.equal(page.getUI().historyPending.has('two'), true);
  assert.equal(page.handlers.deliveryItems('two')[0].text, 'локальная копия');
  assert.equal(page.sent.some(event => event.kind === 'session_created' || event.kind === 'user_message'), false);
});

test('индекс показывает сессии до готовности сокета, история приходит только выбранной', async () => {
  const entry = (trace, kind, input, step) => ({ id: trace + ':' + kind, trace, kind, input, step, time: step + 1 });
  const index = ['one', 'two'].map(trace => entry(trace, 'session_created', { name: trace, agent: 'kimi' }, 0));
  const old = entry('two', 'user_message', { text: 'история из файла', turn: 'turn' }, 1);
  const done = entry('two', 'agent_done', { turn: 'turn' }, 2);
  const page = await app(memory(), true, '', { entries: index }, { two: [index[1], old, done] });
  assert.deepEqual(Object.keys(page.getModel().sessions).filter(id => id !== 's'), ['one', 'two']);
  page.handlers.onSelect('two');
  page.draw();
  assert.equal(page.sent.length, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.getModel().sessions.two.messages[0].text, 'история из файла');
  assert.equal(page.getUI().historyPreview.has('two'), true);
  assert.equal(page.handlers.onSend('two', 'поставить в очередь'), true);
  assert.equal(page.handlers.onSend('two', 'не дублировать'), false);
  assert.equal(page.sent.length, 0);
  const [waiting] = page.handlers.deliveryItems('two');
  assert.equal(waiting.state, 'waiting_restore');
  const interrupted = await app(page.storage);
  assert.equal(interrupted.sent.length, 0);
  assert.equal(interrupted.handlers.deliveryItems('two')[0].state, 'not_sent');
  page.handlers.onSelect('s');
  page.callbacks.onSnapshot('ready', ['one', 'two', 's']);
  page.draw();
  assert.equal(page.sent.length, 1);
  assert.equal(page.sent[0].kind, 'session_history_get');
  assert.equal(page.sent[0].trace, 'two');
  assert.equal(page.sent[0].input.count, 3);
  assert.equal(page.sent[0].input.last, done.id);
  page.callbacks.onSessionHistory('two', [], true);
  assert.equal(page.getModel().sessions.two.messages[0].text, 'история из файла');
  assert.equal(page.getModel().sessions.one.messages.length, 0);
  assert.equal(page.getUI().historyPending.has('two'), false);
  assert.equal(page.sent.length, 1, 'пока не получено состояние маршрута');
  page.event('route_state', { route: 'interactive' }, { trace: 'two', step: 5 });
  assert.equal(page.sent.length, 2);
  assert.equal(page.sent[1].kind, 'user_message');
  assert.equal(page.sent[1].id, waiting.id);
  assert.equal(page.sent[1].input.text, 'поставить в очередь');
  page.event('route_state', { route: 'interactive' }, { trace: 'two', step: 6 });
  assert.equal(page.sent.length, 2);
  const reopened = await app(page.storage);
  assert.equal(reopened.sent.length, 0);
  assert.equal(reopened.handlers.deliveryItems('two')[0].state, 'unknown');
});

test('открытие чата запускает восстановление один раз, не дожидаясь HTTP-предпросмотра', async () => {
  const created = { id: 'two:start', trace: 'two', kind: 'session_created', input: { name: 'two', agent: 'kimi' }, step: 0, time: 1 };
  let finishPreview;
  const preview = new Promise(resolve => { finishPreview = resolve; });
  const page = await app(memory(), true, '', { entries: [created] }, { two: preview });
  page.callbacks.onSnapshot('ready', ['two', 's']);
  page.handlers.onSelect('two');
  page.draw();
  assert.deepEqual(page.sent.map(event => event.kind), ['session_warm']);
  assert.equal(page.sent[0].trace, 'two');

  page.handlers.onSelect('s');
  page.draw();
  page.handlers.onSelect('two');
  page.draw();
  assert.equal(page.sent.length, 1);

  finishPreview([created]);
  await new Promise(resolve => setImmediate(resolve));
  page.draw();
  assert.deepEqual(page.sent.map(event => event.kind), ['session_warm', 'session_history_get']);
  assert.equal(page.sent[1].input.last, created.id);
});

test('route reset stays pending until the server confirms the selected step', async () => {
  const page = await app();
  const snapshot = state => ({ route: 'full', steps: [{ n: 1, title: 'First', state }] });
  page.event('route_state', snapshot('done'));
  page.handlers.onRouteReset('s', 1);
  page.handlers.onRouteReset('s', 1);
  assert.equal(page.sent.filter(event => event.kind === 'route_reset').length, 1);
  assert.equal(page.getUI().routeResets.get('s').step, 1);

  page.event('route_state', snapshot('done'), { step: 2 });
  assert.equal(page.getUI().routeResets.has('s'), true);
  page.event('route_state', snapshot('pending'), { step: 3 });
  assert.equal(page.getUI().routeResets.has('s'), false);
});
