import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModel, reduce } from '../state.js';
import * as lists from '../lists.js';
const { groupSessions, sessionGlyph, branchGlyph } = lists;
import { createView } from '../view.js';
import { createFakeDocument, input } from './fake-dom.mjs';

function fixture(count = 4) {
  let model = initialModel();
  for (let i = 0; i < count; i++) {
    const id = i === 1 || i === 2 ? `root-c${i}` : i === 0 ? 'root' : `s${i}`;
    model = reduce(model, { id: `e${i}`, trace: id, step: 0, kind: 'session_created', time: i + 1,
      input: { name: id, agent: 'codex', parent: i === 1 || i === 2 ? 'root' : '', project_id: i < 3 ? 'p' : 'q',
        waiting_reason: i === 1 ? 'ждёт ответа владельца' : i === 2 ? 'занята другим ходом' : '' } });
  }
  return model;
}
function page(model, stored = new Map()) {
  const doc = createFakeDocument();
  doc.defaultView = { localStorage: { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) } };
  const refs = {};
  for (const name of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[name] = doc.createElement('div'); doc.body.append(refs[name]);
  }
  const selected = [];
  const view = createView(doc, refs, { agents: [{ id: 'codex' }], now: () => 10,
    handlers: { queued: () => 0, queuedItems: () => [], onSelect: id => selected.push(id) } });
  const render = () => view.render(model, { projects: [{ id: 'p', name: 'Первый' }, { id: 'q', name: 'Второй' }], pins: {}, theme: 'system' }, { state: 'connected' });
  render();
  return { doc, refs, render, selected, rows: () => refs.side.querySelectorAll('.session') };
}

test('334: два проекта, вложенность, счётчик; свёртка ветки переживает перезагрузку', () => {
  const model = fixture(), stored = new Map();
  const p = page(model, stored);
  assert.equal(p.refs.side.querySelectorAll('.group[data-project="true"]').length, 2);
  assert.equal(p.rows().filter(r => r.getAttribute('data-depth') === '1').length, 2);
  assert.equal(p.refs.side.querySelector('.session-child-count').textContent, '2');
  p.refs.side.querySelector('.fold-btn').click();
  assert.equal(p.rows().length, 2);
  assert.equal(p.refs.side.querySelector('.session-glyph').getAttribute('data-glyph'), 'question');
  model.sessions['root-c1'] = { ...model.sessions['root-c1'], waitingReason: 'сбой транспорта провайдера' };
  p.render();
  assert.equal(p.refs.side.querySelector('.session-glyph').getAttribute('data-glyph'), 'error');
  const reloaded = page(model, stored);
  assert.equal(reloaded.rows().length, 2);
  reloaded.refs.side.querySelector('.fold-btn').click();
  assert.equal(reloaded.rows().length, 4);
  reloaded.refs.side.querySelectorAll('.session-item')[1].click();
  assert.deepEqual(reloaded.selected, ['root-c2']);
});

test('334: свёртка проекта сохраняется; поиск раскрывает совпадения, не стирая настройки', () => {
  const stored = new Map(), model = fixture();
  const p = page(model, stored);
  p.refs.side.querySelector('.group[data-project="true"] .group-toggle').click();
  const q = page(model, stored);
  assert.equal(q.refs.side.querySelector('.group[data-project="true"] .group-list').hidden, true);
  const search = q.refs.side.querySelector('.search input');
  search.value = 'root-c1'; search.dispatchEvent(input());
  assert.equal(q.rows().length, 1);
  assert.equal(q.refs.side.querySelector('.group-list').hidden, false);
  assert.equal(page(model, stored).refs.side.querySelector('.group[data-project="true"] .group-list').hidden, true);
});

test('334: глифы причин ожидания холодного индекса и приоритет скрытых внуков', () => {
  const s = { state: 'idle', messages: [] };
  for (const [reason, glyph] of [['ждёт ответа владельца', 'question'], ['ждёт разрешения', 'permission'],
    ['занята другим ходом', 'running'], ['провайдер молчит с 12:00', 'silent'], ['сбой транспорта провайдера', 'error'], ['', 'done']]) {
    assert.equal(sessionGlyph({ ...s, waitingReason: reason }), glyph);
  }
  assert.equal(branchGlyph({ ...s, state: 'answering' }, [{ ...s, waitingReason: 'ждёт ответа владельца' }]), 'question');
  const sessions = Object.values(fixture().sessions);
  sessions.push({ ...s, id: 'root-c1-c1', parent: 'root-c1', projectId: 'p', waitingReason: 'сбой транспорта провайдера' });
  const rows = groupSessions(sessions, { collapsed: new Set(['root']) }).projects.find(p => p.id === 'p').rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hidden.length, 3);
  assert.equal(branchGlyph(rows[0].session, rows[0].hidden), 'error');
});

test('334: старые журналы без детей и список из 75 сессий не теряют строки проекции', () => {
  const model = fixture(75);
  const groups = groupSessions(Object.values(model.sessions));
  assert.equal(groups.projects.flatMap(p => p.rows).length, 75);
  const legacy = page(fixture(1));
  assert.equal(legacy.rows().length, 1);
  assert.equal(legacy.refs.side.querySelector('.fold-btn'), null);
  assert.equal(legacy.refs.side.querySelector('.session-child-count'), null);
});
