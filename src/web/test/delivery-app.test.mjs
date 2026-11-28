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
async function app(storage = memory(), sendResult = true, hash = '#s=s', sessionIndex, preview = {}, wire = {}) {
  const source = process.env.RED_260 === '1'
    ? execFileSync('git', ['show', 'f8b08227:src/web/app.js'], { encoding: 'utf8' })
    : fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  let callbacks;
  const sent = [];
  const timeouts = [];
  const delays = [];
  const renderedDelivery = [];
  const context = {
    ...state, ...attention, ...strings, ...queue, ...attachments, ...routes, ...crew, ...delivery, ...loading,
    chooseMode, parseAgentRegistry,
    console, URL, URLSearchParams, AbortSignal, Date, Math, Promise,
    crypto: { randomUUID: () => `client-${sent.length}-${Math.random()}` },
    localStorage: storage, sessionStorage: memory(),
    location: { search: '', protocol: 'http:', host: 'test.invalid', hash },
    document: { documentElement: { setAttribute() {}, removeAttribute() {} }, getElementById() {}, addEventListener() {} },
    addEventListener() {}, requestAnimationFrame(callback) { wire.frame?.(callback); },
    setInterval() {}, setTimeout(fn, delay) { timeouts.push(fn); delays.push(delay); return timeouts.length; }, clearTimeout() {},
    fetch: async (url, options) => url.startsWith('/api/session-image/') && wire.postImage
      ? wire.postImage(url, options)
      : ({ ok: true, json: async () => url === '/api/sessions-index' ? sessionIndex : url.startsWith('/api/session-history/') ? preview[url.split('/').at(-1)] : ({ agents: [{ id: 'agent', label: 'Agent' }] }) }),
    createNotifier: () => ({ bellOn: () => false, soundOn: () => false, update() {} }),
    createProjectsApi: () => ({ list: async () => ({ ok: true, projects: [] }) }),
    createView: () => ({ render() { renderedDelivery.push(JSON.parse(storage.getItem(delivery.DELIVERY_KEY) || '[]')); }, tick() {}, setAgents() {} }),
    createTransport(deps) {
      callbacks = deps;
      return { start() {}, isConnected: () => wire.connected ?? true, send(event) {
        sent.push(event);
        if (sendResult instanceof Error) throw sendResult;
        return wire.send ? wire.send(event) : sendResult;
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
  return { ...context.probe, sent, event, timeouts, renderedDelivery,
    retryTimers: () => timeouts.map((run, index) => ({ run, delay: delays[index] })).filter(timer => [2000, 5000, 10000].includes(timer.delay)), status: value => callbacks.onStatus(value), storage, callbacks };
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
  assert.equal(saved.state, 'retrying');
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

test('в Подготовке во время хода можно выбрать новый адаптер и отправить реплику после завершения', async () => {
  const page = await app();
  page.event('route_state', { route: 'planning' }, { step: 1 });
  page.event('user_message', { turn: 'active', text: 'текущий запрос' }, { step: 2 });
  const source = { family: 'future-adapter', model: 'new-model', effort: 'high' };
  page.handlers.onSource('s', source);
  page.handlers.onQueue('s', 'следующая реплика');
  assert.equal(page.sent.length, 0);
  page.event('agent_done', { turn: 'active' }, { step: 3 });
  assert.deepEqual(page.sent.map(item => item.kind), ['user_message']);
  assert.deepEqual(page.sent[0].input.handoff, source);
  assert.equal(page.sent[0].input.text, 'следующая реплика');
  assert.equal(page.getModel().sessions.s.route, 'planning');
  page.event('error', { message: 'Перенос контекста не завершился.' }, { step: 4 });
});

test('Handoff between registered adapters without a question starts only on send and never sends text after transfer failure', async () => {
  for (const succeeds of [false, true]) {
    const page = await app();
    page.event('agent_switched', { from: 'agent', to: 'source-adapter' }, { step: 1 });
    page.event('user_message', { turn: 'old', text: 'история' }, { step: 2 });
    page.event('agent_done', { turn: 'old' }, { step: 3 });
    page.handlers.onSource('s', { family: 'target-adapter', model: 'test-model', effort: 'low' });
    assert.equal(page.getModel().sessions.s.pendingQuestion, null);
    assert.equal(page.sent.length, 0);
    assert.equal(page.getUI().handoffStatus.get('s').phase, 'selected');
    const sent = page.handlers.onSend('s', 'сохранить этот текст');
    assert.equal(page.getUI().handoffStatus.get('s').phase, 'preparing');
    assert.equal(page.sent[0].kind, 'user_message');
    assert.equal(page.sent[0].input.text, 'сохранить этот текст');
    assert.equal(page.sent[0].input.handoff.family, 'target-adapter');
    assert.equal(page.handlers.onSend('s', 'не дублировать'), false);
    page.handlers.onApproval('s', 'target-adapter', 'auto');
    assert.equal(page.sent.length, 1, 'approval waits for the active handoff');
    page.event('handoff_progress', { phase: 'compacting' }, { step: 4 });
    assert.equal(page.getUI().handoffStatus.get('s').compacting, true);
    if (succeeds) {
      page.event('agent_switched', { from: 'source-adapter', to: 'target-adapter' }, { step: 5 });
      assert.equal(page.sent.length, 1);
      page.event('session_source', { family: 'target-adapter', model: 'test-model', effort: 'low' }, { step: 6 });
      assert.equal(await sent, true);
      assert.equal(page.sent.length, 2);
      assert.equal(page.sent[1].kind, 'session_setting');
      assert.deepEqual({ ...page.sent[1].input }, { family: 'target-adapter', setting: 'mode', value: 'auto' });
    } else {
      page.event('error', { message: 'Перенос контекста в target-adapter не завершился.' }, { step: 5 });
      assert.equal(await sent, false);
      assert.equal(page.getModel().sessions.s.agent, 'source-adapter');
      assert.equal(page.sent.filter(event => event.kind === 'user_message').length, 1);
      assert.equal(page.sent[1].kind, 'session_setting');
      assert.equal(page.getUI().handoffStatus.get('s').phase, 'error');
      const retried = page.handlers.onSend('s', 'сохранить этот текст');
      assert.equal(page.sent.at(-1).input.handoff.family, 'target-adapter');
      page.event('error', { code: 'preparation_profile_missing', message: 'Профиль недоступен' }, { step: 6 });
      assert.equal(page.getUI().handoffStatus.get('s').message, strings.t('handoff.no_preparation'));
      assert.equal(await retried, false);
    }
  }
});

test('выбор нового адаптера во время переноса применяется к следующей реплике', async () => {
  const page = await app();
  page.event('route_state', { route: 'planning' }, { step: 1 });
  const first = { family: 'first-adapter', model: 'first-model', effort: 'low' };
  const next = { family: 'next-adapter', model: 'next-model', effort: 'high' };
  page.handlers.onSource('s', first);
  const sent = page.handlers.onSend('s', 'первая реплика');
  page.handlers.onSource('s', next);
  assert.deepEqual(page.sent.map(event => event.input.handoff), [first]);
  page.event('agent_switched', { from: 'agent', to: first.family }, { step: 2 });
  page.event('session_source', first, { step: 3 });
  assert.equal(await sent, true);
  assert.deepEqual(page.getUI().handoffStatus.get('s').source, next);
  const second = page.handlers.onSend('s', 'вторая реплика');
  assert.deepEqual(page.sent.map(event => event.input.handoff), [first, next]);
  page.event('error', { message: 'Перенос контекста не завершился.' }, { step: 4 });
  assert.equal(await second, false);
  assert.equal(page.getModel().sessions.s.agent, first.family);
});

test('потерянное подтверждение переноса не отправляет реплику повторно', async () => {
  const page = await app();
  page.event('route_state', { route: 'planning' }, { step: 1 });
  const source = { family: 'new-adapter', model: 'model', effort: 'high' };
  page.handlers.onSource('s', source);
  const sent = page.handlers.onSend('s', 'одна реплика');
  page.status({ state: 'retry' });
  assert.equal(await sent, false);
  assert.equal(page.handlers.onSend('s', 'одна реплика'), false);
  assert.equal(page.sent.filter(event => event.kind === 'user_message').length, 1);
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
  page.callbacks.onSessionsIndex([entry('two', 'session_created',
    { ...index[1].input, task_number: '309', task_title: 'Индекс', task_state: 'done' }, 0)]);
  assert.equal(page.getModel().sessions.two.indexTaskNumber, '309');
  assert.equal(page.getModel().sessions.two.messages[0].text, 'история из файла');
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

test('предпросмотр показывает этапы, а сервер дополняет историю новыми записями', async () => {
  const created = { id: 'two:start', trace: 'two', kind: 'session_created', input: { name: 'two', agent: 'kimi' }, step: 0, time: 1 };
  const message = { id: 'two:first', trace: 'two', kind: 'user_message', input: { text: 'первое', turn: 'first' }, step: 1, time: 2 };
  const page = await app(memory(), true, '', { entries: [created] }, { two: {
    entries: [created, message], route: { route: 'full', steps: [{ n: 1, title: 'План', state: 'done' }] },
  } });
  page.callbacks.onSnapshot('ready', ['two', 's']);
  page.handlers.onSelect('two');
  page.draw();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.getModel().sessions.two.routeState.steps[0].state, 'done');
  assert.equal(page.sent.at(-1).input.delta, true);
  page.callbacks.onSessionHistory('two', [
    { ...message, id: 'two:next', step: 2, input: { text: 'готово?', turn: 'next' } },
  ], false, 2);
  assert.deepEqual(page.getModel().sessions.two.messages.filter(item => item.role === 'user').map(item => item.text), ['первое', 'готово?']);
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

test('session index exposes sidebar status before any history request', async () => {
  const a = await app(memory(), true, '', { entries: [{
    id: 'summary-other', trace: 'other', step: 0, kind: 'session_created', time: 1,
    input: { name: 'Other', agent: 'agent', list_status: 'error' },
  }] });
  assert.equal(attention.attention(a.getModel().sessions.other).state, 'error');
  assert.equal(a.getModel().sessions.other.messages.length, 0);
  a.event('session_list_status', { list_status: 'question-timeout' }, { trace: 'other' });
  assert.equal(attention.attention(a.getModel().sessions.other).state, 'question-timeout');
  assert.equal(a.sent.some(event => event.kind === 'session_history_get' && event.trace === 'other'), false);
})


test('restored session metadata refreshes the sidebar after sessions_ready', async () => {
  const frames = [];
  const page = await app(memory(), true, '#s=s', undefined, {}, { frame: callback => frames.push(callback) });
  page.callbacks.onSnapshot('ready', ['s', 'restoring']);
  assert.equal(page.getModel().sessions.restoring, undefined);
  for (const frame of frames.splice(0)) frame();
  const before = page.renderedDelivery.length;

  page.callbacks.onSessionsIndex([{
    id: 'summary-restoring', trace: 'restoring', step: 0, kind: 'session_created', time: 1,
    input: { name: 'Restored chat', agent: 'agent', list_status: 'idle' },
  }]);

  assert.equal(page.getModel().sessions.restoring.name, 'Restored chat');
  assert.equal(page.getUI().historyPending.has('restoring'), true);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(page.renderedDelivery.length, before + 1);
});

test('picking a model starts a separate background check before sending chat text', async () => {
  const a = await app();
  a.callbacks.onSnapshot('ready', ['s']);
  const source = { family: 'agent', model: 'm', effort: 'high' };
  a.handlers.onSource('s', source);
  const check = a.sent.find(event => event.kind === 'model_probe');
  assert.ok(check);
  assert.equal(a.getUI().modelProbes.get('s').status, 'checking');
  assert.equal(a.sent.some(event => event.kind === 'user_message'), false);
  assert.equal(a.getUI().handoffStatus.get('s').source.effort, 'high');
  a.event('model_probe_result', { request: check.input.request, status: 'ready' });
  assert.equal(a.getUI().modelProbes.get('s').status, 'ready');
  a.handlers.onSource('s', { ...source, effort: 'low' });
  assert.equal(a.sent.filter(event => event.kind === 'model_probe').length, 1);
});


test('early model choice queues its probe until sessions are ready', async () => {
  const a = await app();
  a.handlers.onSource('s', { family: 'agent', model: 'flash', effort: 'low' });
  assert.equal(a.getUI().modelProbes.get('s').status, 'checking');
  assert.equal(a.sent.some(event => event.kind === 'model_probe'), false);
  a.callbacks.onSnapshot('ready', ['s']);
  a.callbacks.onSnapshot('ready', ['s']);
  assert.equal(a.sent.filter(event => event.kind === 'model_probe').length, 1);
  assert.equal(a.sent.some(event => event.kind === 'user_message'), false);
});


test('310: socket rejection schedules 2, 5 and 10 seconds then leaves one failed message', async () => {
  const page = await app(memory(), false);
  page.handlers.onSend('s', 'повторить');
  const [first] = page.handlers.deliveryItems('s');
  for (const [index, delay] of [2000, 5000, 10000].entries()) {
    const [pending] = page.handlers.deliveryItems('s');
    assert.equal(pending.state, 'retrying');
    assert.equal(pending.attempt, index + 1);
    const timer = page.retryTimers()[index];
    assert.equal(timer.delay, delay);
    timer.run();
  }
  const [failed] = page.handlers.deliveryItems('s');
  assert.equal(failed.state, 'not_sent');
  assert.equal(failed.canRetry, true);
  assert.equal(page.retryTimers().length, 3);
  assert.deepEqual(page.sent.map(event => event.id), Array(4).fill(first.id));
  assert.deepEqual(page.sent.map(event => event.input.turn), Array(4).fill(first.clientTurn));
});

test('310: queued image waits for the socket and an uploaded number survives later rejection', async () => {
  let uploads = 0;
  let online = false;
  const wire = {
    connected: false,
    send: () => online,
    postImage: async (url, options) => {
      assert.equal(url, '/api/session-image/s');
      assert.equal(options.body, image.blob);
      uploads += 1;
      return { ok: true, json: async () => ({ n: 7 }) };
    },
  };
  const image = { name: 'test.png', type: 'image/png', blob: new Blob(['pixels']) };
  const page = await app(memory(), false, '#s=s', undefined, {}, wire);
  page.handlers.onQueue('s', 'с картинкой', [image]);
  assert.equal(page.handlers.queued('s'), 0);
  assert.equal(uploads, 0);
  const [{ id }] = page.handlers.deliveryItems('s');
  wire.connected = true;
  page.retryTimers()[0].run();
  await new Promise(setImmediate);
  assert.equal(uploads, 1);
  assert.equal(page.sent.length, 1);
  for (const index of [1, 2]) {
    page.retryTimers()[index].run();
    await new Promise(setImmediate);
  }
  assert.equal(page.handlers.deliveryItems('s')[0].state, 'not_sent');
  online = true;
  page.handlers.onRetry('s', id);
  page.handlers.onRetry('s', id);
  await new Promise(setImmediate);
  assert.equal(uploads, 1);
  assert.equal(page.sent.length, 4);
  assert.equal(page.sent.at(-1).id, id);
  assert.equal(page.sent.at(-1).input.images[0].n, 7);
  const receipt = { client_id: id, accepted: true, turn: 'known-turn' };
  page.event('message_delivery', receipt);
  page.event('user_message', { turn: receipt.turn, text: 'с картинкой' });
  page.event('message_delivery', receipt);
  page.event('user_message', { turn: receipt.turn, text: 'с картинкой' });
  assert.equal(page.getModel().sessions.s.messages.filter(message => message.role === 'user').length, 1);
  assert.equal(page.handlers.deliveryItems('s').length, 0);
});

test('310: refusal cancels a scheduled retry even when its text mentions the connection', async () => {
  const page = await app(memory(), false);
  page.handlers.onSend('s', 'ограничение');
  const [{ id }] = page.handlers.deliveryItems('s');
  page.event('error', { client_id: id, message: 'offline: rate limit' });
  page.event('message_delivery', { client_id: id, accepted: false });
  page.retryTimers()[0].run();
  assert.equal(page.sent.length, 1);
  assert.equal(page.handlers.deliveryItems('s')[0].state, 'received');
});


test('310: a manual retry uploads only the unfinished part of a multi-image draft', async () => {
  const first = new Blob(['first']);
  const second = new Blob(['second']);
  const uploaded = [];
  const wire = {
    postImage: async (_url, { body }) => {
      uploaded.push(body);
      if (uploaded.length === 2) return { ok: false, status: 429, json: async () => ({ error: 'HTTP 429' }) };
      return { ok: true, json: async () => ({ n: uploaded.length }) };
    },
  };
  const page = await app(memory(), true, '#s=s', undefined, {}, wire);
  await page.handlers.onSend('s', '', [
    { name: 'first.png', type: 'image/png', blob: first },
    { name: 'second.png', type: 'image/png', blob: second },
  ]);
  const [pending] = page.handlers.deliveryItems('s');
  assert.equal(pending.state, 'not_sent');
  assert.equal(page.retryTimers().length, 0);
  assert.equal(page.sent.length, 0);
  page.handlers.onRetry('s', pending.id);
  await new Promise(setImmediate);
  assert.deepEqual(uploaded, [first, second, second]);
  assert.deepEqual(Array.from(page.sent[0].input.images, image => image.n), [1, 3]);
  assert.equal(page.sent[0].id, pending.id);
});

test('324: срочная поправка уходит с пометкой, обычная очередь ждёт нового хода', async () => {
  const page = await app();
  page.event('user_message', { turn: 'old-turn', text: 'Начни работу' });
  page.handlers.onQueue('s', 'Обычное сообщение');
  assert.equal(page.sent.length, 0);

  assert.equal(page.handlers.onSend('s', 'Срочная поправка', [], true), true);
  const [correction] = page.sent;
  assert.equal(correction.kind, 'user_message');
  assert.equal(correction.input.urgent, true);
  assert.equal(page.handlers.deliveryItems('s')[0].urgent, true);

  page.event('turn_interrupt_pending', { pending: true });
  page.event('cancel', { turn: 'old-turn' });
  assert.equal(page.sent.length, 1);
  page.event('user_message', { turn: 'new-turn', text: 'Срочная поправка' });
  page.event('turn_resume', { previous_turn: 'old-turn', turn: 'new-turn' });
  page.event('turn_interrupt_pending', { pending: false });
  assert.equal(page.sent.length, 1);
  page.event('agent_done', { turn: 'new-turn' });
  assert.equal(page.sent.length, 2);
  assert.equal(page.sent[1].input.text, 'Обычное сообщение');
  assert.equal(page.sent[1].input.urgent, undefined);
});

test('324: причина очереди и возобновление видны в ленте отдельно', async () => {
  const page = await app();
  page.event('user_message', { turn: 'old-turn', text: 'Начни работу' });
  page.event('turn_interrupt_queued', { turn: 'old-turn', reason: 'агент отказал в отмене' });
  assert.equal(page.getModel().sessions.s.state, 'answering');
  page.event('cancel', { turn: 'old-turn' });
  page.event('user_message', { turn: 'new-turn', text: 'Срочная поправка' });
  page.event('turn_resume', { previous_turn: 'old-turn', turn: 'new-turn' });
  const notes = page.getModel().sessions.s.messages.filter(m => m.role === 'service_note');
  assert.deepEqual(notes.map(m => m.text), [
    'Поправка в очереди. Причина — агент отказал в отмене.',
    'Новый ход начат с учётом срочной поправки.',
  ]);
});

test('332: provider pause shows its cause and blocks the automatic page queue until a manual turn', async () => {
  const page = await app();
  page.event('user_message', { turn: 'failed', text: 'Задание' });
  page.handlers.onQueue('s', 'Письмо из очереди');
  page.event('turn_interrupt_pending', { pending: true });
  page.event('agent_refused', { turn: 'failed', reason: 'provider_transport_lost' });
  const cause = 'Пауза: исчерпан лимит автопродолжений (3/3).';
  page.event('provider_recovery', { action: 'pause', code: 'provider_transport_lost', failed_turn: 'failed', attempt: 3, limit: 3, text: cause });
  page.event('turn_interrupt_pending', { pending: false });
  assert.equal(page.sent.length, 0);
  assert.equal(page.getModel().sessions.s.waitingReason, cause);
  assert.equal(page.getModel().sessions.s.messages.at(-1).text, cause);

  page.handlers.onSend('s', 'Решение владельца');
  page.event('provider_recovery', { action: 'reset', attempt: 0 });
  assert.equal(page.sent.length, 1);
  page.event('user_message', { turn: 'manual', text: 'Решение владельца' });
  page.event('agent_done', { turn: 'manual' });
  assert.equal(page.sent.length, 2);
  assert.equal(page.sent[1].input.text, 'Письмо из очереди');
});

test('333: delivered letters count once outside the open dialog and reset on opening', async () => {
  const a = await app();
  a.event('session_created', { name: 'Получатель', agent: 'agent' }, { trace: 'other', step: 0 });
  const letter = { turn: 'mail-1', text: '[canopus] Письмо от Исполнитель: Готово' };
  a.event('user_message', letter, { trace: 'other', id: 'letter-1' });
  a.event('user_message', letter, { trace: 'other', id: 'letter-1' });
  assert.equal(a.getUI().unviewedMail.other.length, 1);
  a.event('user_message', { ...letter, turn: 'mail-2' }, { trace: 'other', id: 'letter-2' });
  assert.equal(a.getUI().unviewedMail.other.length, 2);
  a.handlers.onSelect('other');
  assert.equal(a.getUI().unviewedMail.other.length, 0);
  a.event('user_message', { ...letter, turn: 'mail-3' }, { trace: 'other', id: 'letter-3' });
  assert.equal(a.getUI().unviewedMail.other.length, 0);
});

test('333: unviewed delivered letters survive browser reload; owner messages do not count', async () => {
  const a = await app();
  a.event('session_created', { name: 'Получатель', agent: 'agent' }, { trace: 'other', step: 0 });
  a.event('user_message', { turn: 'owner', text: 'Слова владельца' }, { trace: 'other', id: 'owner' });
  assert.equal(a.getUI().unviewedMail.other?.length || 0, 0);
  a.event('user_message', { turn: 'mail', text: '[canopus] Письмо от Работник: Готово' }, { trace: 'other', id: 'mail' });
  const reloaded = await app(a.storage);
  assert.equal(reloaded.getUI().unviewedMail.other.length, 1);
});
