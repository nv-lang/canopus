// Проверки новых видов событий редьюсера (задача 094): инструменты, контекст, файлы, правки, фоновые задачи.
// Модуль подключён целиком (import *), чтобы каждая проба падала отдельно, пока вида нет.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../state.js';
import { createView } from '../view.js';
import { createFakeDocument, event } from './fake-dom.mjs';

let counter = 0;
function ev(kind, input = {}, { trace = 's1', step = 0, id, time = 1000 + step } = {}) {
  counter += 1;
  return { id: id ?? `w${counter}`, trace, step, kind, input, time };
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

const run = (events, model = st.initialModel()) => events.reduce((m, e) => st.reduce(m, e), model);

const base = () => [
  ev('session_created', { name: 'Тест', agent: 'opencode', project: 'proj', folder: 'C:/work/proj', branch: 'main', parent: 'p0', pinned: true }, { step: 0 }),
  ev('user_message', { turn: 't1', text: 'сделай' }, { step: 1 }),
];

test('виды событий: девять прежних, шесть рабочих, картинки, вопросы и каталог семьи', () => {
  assert.deepEqual([...st.KINDS].sort(), [
    'agent_actual',
    'agent_catalog',
    'agent_chunk',
    'agent_done',
    'agent_refused',
    'agent_selected',
    'agent_selection',
    'agent_switched',
    'background_task',
    'background_task_update',
    'cancel',
    'error',
    'file_diff',
    'images_skipped',
    'machine_state',
    'message_images',
    'output_file',
    'permission_decision',
    'permission_request',
    'question_answer',
    'question_request',
    'question_resolved',
    'route_state',
    'session_created',
    'session_deleted',
    'session_model',
    'session_placed',
    'session_preset',
    'session_renamed',
    'session_source',
    'setting_chosen',
    'setting_dropped',
    'task_details',
    'tool_call',
    'tool_call_update',
    'turn_request',
    'turn_usage',
    'usage_update',
    'user_message',
  ]);
});

test('session_created хранит проект, папку, ветку, родителя и закрепление', () => {
  const s = run(base()).sessions.s1;
  assert.equal(s.project, 'proj');
  assert.equal(s.folder, 'C:/work/proj');
  assert.equal(s.branch, 'main');
  assert.equal(s.parent, 'p0');
  assert.equal(s.pinned, true);
  const plain = run([ev('session_created', { name: 'Без полей', agent: 'x' }, { trace: 'p' })]).sessions.p;
  assert.equal(plain.project, '');
  assert.equal(plain.parent, '');
  assert.equal(plain.pinned, false);
  assert.equal(plain.usage, null);
  assert.deepEqual([plain.tools, plain.outputs, plain.tasks, plain.diffs], [[], [], [], []]);
});

test('tool_call заводит инструмент, tool_call_update меняет состояние и подробности', () => {
  const m = run([
    ...base(),
    ev('tool_call', { id: 'c1', title: 'npm test', kind: 'execute', status: 'in_progress' }, { step: 2 }),
    ev('tool_call_update', { id: 'c1', status: 'completed', detail: '49 пройдено' }, { step: 3 }),
  ]);
  const [tool] = m.sessions.s1.tools;
  assert.equal(m.sessions.s1.tools.length, 1);
  assert.equal(tool.title, 'npm test');
  assert.equal(tool.kind, 'execute');
  assert.equal(tool.status, 'completed');
  assert.equal(tool.detail, '49 пройдено');
  assert.equal(tool.turn, 't1');
});

test('command survives output updates and duration uses the first running and terminal events', () => {
  const m = run([
    ...base(),
    ev('tool_call', { id: 'cmd', title: 'Bash', kind: 'execute', status: 'pending' }, { step: 2 }),
    ev('tool_call_update', { id: 'cmd', status: 'in_progress', detail: '{"command":"ls doc/tasks"}' }, { step: 3, time: 2000 }),
    ev('tool_call_update', { id: 'cmd', status: 'completed', detail: 'result' }, { step: 4, time: 4500 }),
    ev('tool_call_update', { id: 'cmd', detail: 'final output' }, { step: 5, time: 5000 }),
  ]);
  const [tool] = m.sessions.s1.tools;
  assert.equal(tool.command, 'ls doc/tasks');
  assert.equal(tool.detail, 'final output');
  assert.equal(tool.finishedAt - tool.startedAt, 2500);
});

test('tool_call: неизвестные вид и состояние приводятся к other и pending, без id — пропуск', () => {
  const m = run([
    ...base(),
    ev('tool_call', { id: 'c1', title: 'x', kind: 'странный', status: 'непонятно' }, { step: 2 }),
    ev('tool_call', { title: 'без кода', kind: 'read', status: 'pending' }, { step: 3 }),
  ]);
  assert.equal(m.sessions.s1.tools.length, 1);
  assert.equal(m.sessions.s1.tools[0].kind, 'other');
  assert.equal(m.sessions.s1.tools[0].status, 'pending');
});

test('повтор id инструмента не дублирует его; тот же id события возвращает ту же модель', () => {
  const first = ev('tool_call', { id: 'c1', title: 'один', kind: 'read', status: 'pending' }, { step: 2, id: 'same' });
  const m1 = run([...base(), first]);
  assert.equal(st.reduce(m1, { ...first }), m1);
  const m2 = st.reduce(m1, ev('tool_call', { id: 'c1', title: 'другой', kind: 'edit', status: 'pending' }, { step: 3 }));
  assert.equal(m2.sessions.s1.tools.length, 1);
  assert.equal(m2.sessions.s1.tools[0].title, 'один');
});

test('tool_call_update: чужой id, устаревший шаг и мусорное состояние ничего не ломают', () => {
  const m0 = run([
    ...base(),
    ev('tool_call', { id: 'c1', title: 'x', kind: 'read', status: 'pending' }, { step: 2 }),
    ev('tool_call_update', { id: 'c1', status: 'completed' }, { step: 5 }),
  ]);
  const ghost = st.reduce(m0, ev('tool_call_update', { id: 'нет', status: 'failed' }, { step: 6 }));
  assert.deepEqual(ghost.sessions.s1.tools, m0.sessions.s1.tools);
  const stale = st.reduce(m0, ev('tool_call_update', { id: 'c1', status: 'in_progress' }, { step: 4 }));
  assert.equal(stale.sessions.s1.tools[0].status, 'completed');
  const junk = st.reduce(m0, ev('tool_call_update', { id: 'c1', status: 'мусор' }, { step: 7 }));
  assert.equal(junk.sessions.s1.tools[0].status, 'completed');
});

test('usage_update: хранит занятость окна, мусор и устаревшее пропускает', () => {
  const m = run([...base(), ev('usage_update', { used: 76000, size: 200000, cost: { amount: 0.12, currency: 'USD' } }, { step: 4 })]);
  assert.deepEqual(m.sessions.s1.usage, { used: 76000, size: 200000, cost: { amount: 0.12, currency: 'USD' }, step: 4 });
  const stale = st.reduce(m, ev('usage_update', { used: 1, size: 200000 }, { step: 3 }));
  assert.equal(stale.sessions.s1.usage.used, 76000);
  for (const bad of [{ used: -1, size: 10 }, { used: 1, size: 0 }, { used: 'много', size: 10 }, {}]) {
    assert.equal(st.reduce(m, ev('usage_update', bad, { step: 9 })).sessions.s1.usage.used, 76000);
  }
  const noCost = run([...base(), ev('usage_update', { used: 5, size: 10 }, { step: 2 })]);
  assert.equal(noCost.sessions.s1.usage.cost, null);
});

test('output_file: список без повторов по пути; создание, затем правка остаётся созданием', () => {
  const m = run([
    ...base(),
    ev('output_file', { path: 'src/a.txt', kind: 'create' }, { step: 2 }),
    ev('output_file', { path: 'src/a.txt', kind: 'edit' }, { step: 3 }),
    ev('output_file', { path: 'src/b.txt', kind: 'странный' }, { step: 4 }),
    ev('output_file', { path: '', kind: 'create' }, { step: 5 }),
    ev('output_file', { kind: 'create' }, { step: 6 }),
    ev('output_file', { path: 'src/a.txt', kind: 'delete' }, { step: 7 }),
  ]);
  assert.deepEqual(m.sessions.s1.outputs.map((o) => [o.path, o.kind]), [['src/a.txt', 'delete'], ['src/b.txt', 'edit']]);
  const ce = run([...base(), ev('output_file', { path: 'x', kind: 'create' }, { step: 2 }), ev('output_file', { path: 'x', kind: 'edit' }, { step: 3 })]);
  assert.equal(ce.sessions.s1.outputs[0].kind, 'create');
});

test('file_diff: счётчики добавленного и убранного, повтор пути заменяет, мусор приводится к нулю', () => {
  const m = run([
    ...base(),
    ev('file_diff', { path: 'src/a.js', added: 3, removed: 0 }, { step: 2 }),
    ev('file_diff', { path: 'src/b.js', added: 10.9, removed: 'много' }, { step: 3 }),
    ev('file_diff', { path: 'src/a.js', added: 5, removed: 1 }, { step: 4 }),
    ev('file_diff', { path: '', added: 1, removed: 1 }, { step: 5 }),
  ]);
  assert.deepEqual(m.sessions.s1.diffs.map((d) => [d.path, d.added, d.removed]), [['src/a.js', 5, 1], ['src/b.js', 10, 0]]);
  assert.deepEqual(st.diffTotals(m.sessions.s1.diffs), { files: 2, added: 15, removed: 1 });
  assert.deepEqual(st.diffTotals([]), { files: 0, added: 0, removed: 0 });
});

test('background_task и background_task_update: запуск, завершение, повтор id', () => {
  const m = run([
    ...base(),
    ev('background_task', { id: 'b1', title: 'npm run build', status: 'running', started: 5000 }, { step: 2 }),
    ev('background_task', { id: 'b1', title: 'повтор', status: 'running', started: 1 }, { step: 3 }),
    ev('background_task_update', { id: 'b1', status: 'completed' }, { step: 4, time: 9000 }),
    ev('background_task_update', { id: 'нет', status: 'failed' }, { step: 5 }),
    ev('background_task_update', { id: 'b1', status: 'мусор' }, { step: 6 }),
  ]);
  assert.equal(m.sessions.s1.tasks.length, 1);
  const [task] = m.sessions.s1.tasks;
  assert.equal(task.title, 'npm run build');
  assert.equal(task.status, 'completed');
  assert.equal(task.started, 5000);
  assert.equal(task.finishedAt, 9000);
  assert.deepEqual(st.taskSummary(m.sessions.s1.tasks), { running: 0, finished: 1, total: 1 });
});

test('отмена хода снимает идущие инструменты и фоновые задачи этого хода', () => {
  const m = run([
    ...base(),
    ev('tool_call', { id: 'c1', title: 'x', kind: 'execute', status: 'in_progress' }, { step: 2 }),
    ev('tool_call', { id: 'c2', title: 'y', kind: 'read', status: 'completed' }, { step: 3 }),
    ev('background_task', { id: 'b1', title: 'z', status: 'running', started: 1 }, { step: 4 }),
    ev('cancel', { turn: 't1' }, { step: 5, time: 7000 }),
  ]);
  const s = m.sessions.s1;
  assert.deepEqual(s.tools.map((t) => t.status), ['cancelled', 'completed']);
  assert.equal(s.tasks[0].status, 'stopped');
  assert.equal(s.tasks[0].finishedAt, 7000);
});

test('неизвестные поля и виды пропускаются; вход не меняется; два прогона дают один вид', () => {
  const events = deepFreeze([
    ...base(),
    ev('tool_call', { id: 'c1', title: 'x', kind: 'read', status: 'pending', лишнее: { a: 1 } }, { step: 2 }),
    ev('usage_update', { used: 1, size: 2, ещё: true }, { step: 3 }),
    ev('очень_новый_вид', { id: 'c1' }, { step: 4 }),
    ev('output_file', { path: 'p', kind: 'create', чужое: 1 }, { step: 5 }),
  ]);
  const a = run(events);
  const b = run(events);
  assert.deepEqual(a, b);
  assert.equal(a.sessions.s1.tools.length, 1);
});

test('новые события чужой цепочки без session_created игнорируются', () => {
  const m0 = run(base());
  const m1 = st.reduce(m0, ev('tool_call', { id: 'c1', title: 'x', kind: 'read', status: 'pending' }, { trace: 'нет' }));
  assert.deepEqual(m1.sessions, m0.sessions);
});

test('инструмент без хода привязывается к последнему ходу, явный turn важнее', () => {
  const m = run([
    ...base(),
    ev('tool_call', { id: 'c1', title: 'x', kind: 'read', status: 'pending' }, { step: 2 }),
    ev('tool_call', { id: 'c2', title: 'y', kind: 'read', status: 'pending', turn: 'tx' }, { step: 3 }),
  ]);
  assert.deepEqual(m.sessions.s1.tools.map((t) => t.turn), ['t1', 'tx']);
});

test('long search output stays scrollable and manually opened actions stay open', () => {
  const doc = createFakeDocument();
  const refs = {};
  for (const name of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[name] = doc.createElement('div');
    doc.body.append(refs[name]);
  }
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 0,
    handlers: { queued: () => 0, queuedItems: () => [] },
  });
  const render = model => view.render(model, { selected: 's1', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const detail = Array.from({ length: 169 }, (_, i) => 'line ' + i).join('\n');
  const model = run([...base(),
    ev('tool_call', { id: 'search', kind: 'search', title: 'Search', status: 'in_progress', detail }, { step: 2 }),
  ]);
  const done = st.reduce(model, ev('tool_call_update', { id: 'search', status: 'completed' }, { step: 3 }));
  render(model);
  assert.equal(refs.main.querySelector('.item-work .disclosure'), null);
  assert.equal(refs.main.querySelectorAll('.work-row').length, 1);
  assert.equal(refs.main.querySelector('.row-content').hidden, false);
  const preview = refs.main.querySelector('.work-preview');
  const output = refs.main.querySelector('.row-output');
  assert.equal(refs.main.querySelector('.row-content').getAttribute('data-clipped'), 'true');
  assert.equal(output.textContent, detail);
  render(done);
  assert.equal(refs.main.querySelector('.row-leading use').getAttribute('href'), '#i-circle-check');
  assert.equal(refs.main.querySelector('.row-action'), null);
  assert.ok(refs.main.querySelector('.row-status .sr-only'));
  assert.equal(refs.main.querySelector('.row-content').hidden, false);
  assert.equal(refs.main.querySelector('.work-body').hidden, false);
  const next = st.reduce(done, ev('tool_call', { id: 'next', kind: 'search', title: 'Search again', status: 'in_progress', detail: 'next result' }, { step: 4 }));
  render(next);
  assert.ok(refs.main.querySelector('.item-work .disclosure'));
  assert.equal(refs.main.querySelector('.work-preview'), preview);
  assert.equal(preview.querySelector('.row-output').textContent, 'next result');
  assert.equal(refs.main.querySelectorAll('.row-content').length, 1);
  const finished = st.reduce(next, ev('tool_call_update', { id: 'next', status: 'completed' }, { step: 5 }));
  render(finished);
  assert.equal(refs.main.querySelector('.work-preview'), preview);
  assert.equal(preview.querySelector('.row-output').textContent, 'next result');
  assert.equal(refs.main.querySelectorAll('.row-content').length, 1);
  const responding = st.reduce(finished, ev('agent_chunk', { text: 'Готово' }, { step: 6 }));
  render(responding);
  assert.equal(refs.main.querySelector('.work-body').hidden, true);
  refs.main.querySelector('.item-work .disclosure').click();
  refs.main.querySelector('.row-toggle').click();
  render(st.reduce(done, ev('agent_done', {}, { step: 4 })));
  assert.equal(refs.main.querySelector('.work-body').hidden, false);
  assert.equal(refs.main.querySelector('.row-content').hidden, false);
});

test('копирование остаётся доступным при переходе через строку токенов и зазор', () => {
  const doc = createFakeDocument();
  const refs = {};
  for (const name of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[name] = doc.createElement('div');
    doc.body.append(refs[name]);
  }
  const copied = [];
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 3000,
    handlers: { queued: () => 0, queuedItems: () => [], onCopy: text => copied.push(text) },
  });
  const model = run([...base(),
    ev('agent_chunk', { turn: 't1', text: '**Ответ**' }, { step: 2 }),
    ev('turn_usage', { turn: 't1', new: 2, reason: 'end_turn' }, { step: 3 }),
    ev('agent_done', { turn: 't1' }, { step: 4 }),
  ]);
  view.render(model, { selected: 's1', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const thread = refs.main.querySelector('.thread');
  const actions = thread.querySelector('.item-actions');
  const copy = actions.querySelector('button');
  for (const target of [thread.querySelector('.prose strong'), thread, thread.querySelector('.item-usage'), copy]) {
    target.dispatchEvent(event('mouseover'));
    assert.equal(actions.dataset.hot, 'on');
  }
  copy.click();
  assert.deepEqual(copied, ['**Ответ**']);
  thread.dispatchEvent(event('mouseleave'));
  assert.equal(actions.dataset.hot, undefined);
});

test('лента показывает Markdown и команду с терминалом как отдельные читаемые элементы', () => {
  const doc = createFakeDocument();
  const refs = {};
  for (const name of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[name] = doc.createElement('div');
    doc.body.append(refs[name]);
  }
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 3000,
    handlers: { queued: () => 0, queuedItems: () => [] },
  });
  const model = run([...base(),
    ev('agent_chunk', { turn: 't1', text: '▸ canopus_list {}\n\n- **138** — [задача](https://example.org/138)\n- **`doc/tasks/NNN-название/`**\n\n## Пример\n\n```js\nconst value = "hello"; // заметка\n```\n\n| Что | Где |\n| --- | ---: |\n| Файл | `config.json` |' }, { step: 2 }),
    ev('tool_call', { id: 'exec1', kind: 'execute', title: 'Get-Content nova.toml', status: 'in_progress', detail: 'terminal: exec-d4060c62-0fc8-4cc5-a8fc-b4901b90ac4b' }, { step: 3 }),
  ]);
  view.render(model, { selected: 's1', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  assert.equal(refs.main.querySelector('.canopus-list-note').textContent, 'Список задач');
  assert.equal(refs.main.querySelector('.prose li strong').textContent, '138');
  assert.equal(refs.main.querySelector('.prose li strong code').textContent, 'doc/tasks/NNN-название/');
  assert.equal(refs.main.querySelector('.prose li a').getAttribute('href'), 'https://example.org/138');
  assert.equal(refs.main.querySelector('h2.md-heading').textContent, 'Пример');
  assert.equal(refs.main.querySelector('.code-keyword').textContent, 'const');
  assert.equal(refs.main.querySelector('.code-string').textContent, '"hello"');
  assert.equal(refs.main.querySelector('.code-comment').textContent, '// заметка');
  assert.equal(refs.main.querySelectorAll('.md-table thead th')[1].textContent, 'Где');
  assert.equal(refs.main.querySelector('.md-table td code').textContent, 'config.json');
  assert.equal(refs.main.querySelector('.md-table td[data-align="end"]').textContent, 'config.json');
  assert.equal(refs.main.querySelector('.prose pre code').textContent, 'const value = "hello"; // заметка');
  assert.equal(refs.main.querySelector('.row-command').textContent, 'Get-Content nova.toml');
  assert.equal(refs.main.querySelector('.row-output'), null);
  assert.ok(refs.main.querySelector('.row-status .sr-only'));
});

test('лента следует за ответом после изменения высоты и останавливается после ручной прокрутки', () => {
  const doc = createFakeDocument();
  const refs = {};
  for (const name of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[name] = doc.createElement('div');
    doc.body.append(refs[name]);
  }
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 3000,
    handlers: { queued: () => 0, queuedItems: () => [] },
  });
  const log = refs.main.querySelector('.log');
  let top = 0;
  let height = 1000;
  let viewport = 400;
  Object.defineProperties(log, {
    scrollHeight: { get: () => height },
    clientHeight: { get: () => viewport },
    scrollTop: { get: () => top, set: value => { top = Math.min(value, height - viewport); } },
  });
  const ui = { selected: 's1', projects: [], pins: {}, theme: 'system' };
  const render = model => view.render(model, ui, { state: 'connected' });
  let model = run(base());
  render(model);
  assert.equal(top, 600);
  viewport = 320;
  log.dispatchEvent(event('scroll'));
  height = 1200;
  model = st.reduce(model, ev('agent_chunk', { turn: 't1', text: 'Начало' }, { step: 2 }));
  render(model);
  assert.equal(top, 880);
  log.scrollTop -= 20;
  log.dispatchEvent(event('scroll'));
  height = 1350;
  model = st.reduce(model, ev('agent_chunk', { turn: 't1', text: 'Продолжение' }, { step: 3 }));
  render(model);
  assert.equal(top, 860);
  assert.equal(refs.main.querySelector('.jump-dot').hidden, false);
  log.scrollTop = height;
  log.dispatchEvent(event('scroll'));
  height = 1500;
  render(model);
  assert.equal(top, 1180);
});
