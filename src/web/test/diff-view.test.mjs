// Проверки просмотра диффа из карточки «Изменено файлов» (задача 323): кнопка «Показать дифф» запрашивает патч
// у хаба (dep fetchDiff), панель рисует строки патча с классами add/del, отказ хаба показывается текстом,
// у сессии без дерева (route_state без worktree) кнопки нет.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../state.js';
import { createView } from '../view.js';
import { createFakeDocument } from './fake-dom.mjs';

let counter = 0;
function ev(kind, input = {}, { trace = 's1', step = 0, time = 1000 + step } = {}) {
  counter += 1;
  return { id: `d${counter}`, trace, step, kind, input, time };
}

const run = (events, model = st.initialModel()) => events.reduce((m, e) => st.reduce(m, e), model);

const base = () => [
  ev('session_created', { name: 'Тест', agent: 'opencode', project: 'proj', folder: 'C:/work/proj', branch: 'main' }, { step: 0 }),
  ev('user_message', { turn: 't1', text: 'сделай' }, { step: 1 }),
  ev('file_diff', { turn: 't1', path: 'src/a.js', added: 3, removed: 1 }, { step: 2 }),
  ev('agent_done', { turn: 't1' }, { step: 3 }),
];

function makeView(fetchDiff) {
  const doc = createFakeDocument();
  const refs = {};
  for (const name of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[name] = doc.createElement('div');
    doc.body.append(refs[name]);
  }
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 0,
    handlers: { queued: () => 0, queuedItems: () => [] },
    ...(fetchDiff ? { fetchDiff } : {}),
  });
  const render = (model) => view.render(model, { selected: 's1', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  return { doc, refs, view, render };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('кнопка «Показать дифф» запрашивает патч и рисует строки с классами add/del', async () => {
  const calls = [];
  const patch = 'diff --git a/src/a.js b/src/a.js\nindex 111..222 100644\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1,2 +1,2 @@\n-old\n+new\n ctx\n';
  const { refs, render } = makeView((id, path) => { calls.push([id, path]); return Promise.resolve({ patch, truncated: false }); });
  render(run(base()));
  const button = refs.main.querySelector('.diff-view-btn');
  assert.ok(button);
  assert.equal(button.textContent, 'Показать дифф');
  button.click();
  assert.ok(refs.main.querySelector('.diff-patch-status'));
  await tick();
  assert.deepEqual(calls, [['s1', 'src/a.js']]);
  const panel = refs.main.querySelector('.diff-patch');
  assert.ok(panel);
  const added = panel.querySelector('.diff-line.add');
  const removed = panel.querySelector('.diff-line.del');
  assert.equal(added.textContent, '+new');
  assert.equal(removed.textContent, '-old');
  assert.equal(refs.main.querySelector('.diff-view-btn').textContent, 'Скрыть дифф');
  refs.main.querySelector('.diff-view-btn').click();
  assert.equal(refs.main.querySelector('.diff-patch'), null);
  assert.equal(calls.length, 1);
});

test('кнопка в подвале запрашивает дифф всех файлов (путь пустой)', async () => {
  const calls = [];
  const { refs, render } = makeView((id, path) => { calls.push([id, path]); return Promise.resolve({ patch: '+x\n', truncated: true }); });
  render(run(base()));
  const foot = refs.main.querySelector('.diff-foot');
  const button = foot.querySelector('.diff-view-btn');
  assert.ok(button);
  button.click();
  await tick();
  assert.deepEqual(calls, [['s1', '']]);
  assert.ok(refs.main.querySelector('.diff-patch'));
  assert.ok(refs.main.querySelectorAll('.diff-patch-status').length >= 1);
});

test('отказ хаба показывается текстом, кнопка остаётся и повторяет запрос', async () => {
  let calls = 0;
  const { refs, render } = makeView(() => { calls += 1; return Promise.resolve({ error: 'the session has no tree of its own' }); });
  render(run(base()));
  refs.main.querySelector('.diff-view-btn').click();
  await tick();
  const status = refs.main.querySelector('.diff-patch-status');
  assert.ok(status.textContent.includes('the session has no tree of its own'));
  refs.main.querySelector('.diff-view-btn').click();
  refs.main.querySelector('.diff-view-btn').click();
  await tick();
  assert.equal(calls, 2);
});

test('сессия без дерева (route_state без worktree): кнопки прячутся', () => {
  const { refs, render } = makeView(() => Promise.resolve({ patch: '+x\n', truncated: false }));
  render(run([...base(), ev('route_state', { route: 'interactive', use_tree: false }, { step: 4 })]));
  assert.ok(refs.main.querySelector('.diff-list'));
  assert.equal(refs.main.querySelector('.diff-view-btn'), null);
});
