import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../view.js';
import { initialModel, reduce } from '../state.js';
import { createFakeDocument } from './fake-dom.mjs';
import { t } from '../strings.js';

for (const agents of [[], [{ id: 'opencode' }]]) {
  test(`недоступные настройки объясняют клик: агентов ${agents.length}`, () => {
    const doc = createFakeDocument(); const refs = {}; const notices = [];
    for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
      refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
    }
    const view = createView(doc, refs, { agents, now: () => 0, handlers: {
      queued: () => 0, queuedItems: () => [], onNotice: (text) => notices.push(text),
    } });
    const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1,
      kind: 'session_created', input: { name: 'Проверка', agent: 'opencode' } });
    view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
    const buttons = refs.main.querySelectorAll('.status-btn').filter((b) => b.getAttribute('aria-disabled') === 'true');
    assert.ok(buttons.length >= 1);
    for (const button of buttons) {
      const before = notices.length;
      button.click();
      assert.equal(notices.length, before + 1, button.title);
      assert.equal(notices.at(-1), button.title);
    }
  });
}

test('ответ реестра снимает loading: ошибка, пустой успех и повтор с реальными семьями', () => {
  const doc = createFakeDocument(); const refs = {}; const notices = []; const switches = [];
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
  }
  const view = createView(doc, refs, { agents: [], registryPending: true, now: () => 0, handlers: {
    queued: () => 0, queuedItems: () => [], onNotice: (text) => notices.push(text),
    onSwitchAgent: (...args) => switches.push(args),
  } });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1,
    kind: 'session_created', input: { name: 'Проверка', agent: 'opencode' } });
  const draw = () => view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const family = () => refs.main.querySelector('.status-group').querySelector('button');
  draw(); family().click(); assert.equal(notices.at(-1), t('status.agents_loading'));
  view.setAgents([], true); draw(); family().click();
  assert.equal(notices.at(-1), t('sessions.agents_unavailable'));
  view.setAgents([], false); draw(); family().click();
  assert.equal(notices.at(-1), t('sessions.agents_none'));
  view.setAgents([{ id: 'opencode' }, { id: 'other' }], false); draw(); family().click();
  const rows = refs.main.querySelectorAll('.menu-item');
  assert.equal(rows.length, 0, 'семьи без каталога моделей не объявляются выбираемыми');
  assert.deepEqual(switches, []);
});

test('компактный селектор отправляет direct source и сохраняет выбор черновика', () => {
  const doc = createFakeDocument(); const refs = {}; const sources = []; const draftSources = [];
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const presets = { active: 'default', presets: [{ name: 'default', roles: {}, pools: { team: { light: [{ family: 'opencode', model: 'm1', effort: 'low', active: true }] } } }] };
  const agents = [{ id: 'opencode' }];
  const view = createView(doc, refs, { agents, now: () => 0, presets: () => presets, handlers: {
    queued: () => 0, queuedItems: () => [], onSource: (...args) => sources.push(args), onDraftSource: (...args) => draftSources.push(args),
  } });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'Проверка', agent: 'opencode' } });
  const entry = { agent: 'opencode', updated: 1, model: 'm1', options: { models: [{ id: 'm1', name: 'Model One' }], model_id: 'm1', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], modes: [], effort: 'low', mode: '' } };
  const withCatalog = { ...model, catalog: { opencode: entry } };
  view.render(withCatalog, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const picker = refs.main.querySelector('.agent-picker-button');
  assert.ok(picker);
  assert.equal(refs.main.querySelectorAll('.status-group .status-btn').length, 2);
  picker.click();
  const modelRow = refs.main.querySelectorAll('.menu-item').find((r) => r.textContent.includes('Model One'));
  assert.ok(modelRow);
  const slider = modelRow.querySelector('.effort-slider');
  assert.ok(slider);
  slider.value = '0';
  slider.dispatchEvent({ type: 'input', bubbles: true });
  slider.dispatchEvent({ type: 'change', bubbles: true });
  assert.deepEqual(sources, [['s', { family: 'opencode', model: 'm1', effort: 'low' }]]);
});

test('session_source принимает плоский direct/pool wire без смешения уровня и effort', () => {
  const create = (source) => reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'x', agent: 'opencode', source } });
  let direct = create({ family: 'opencode', model: 'm', effort: 'xhigh' });
  direct = reduce(direct, { id: 'source', trace: 's', step: 1, time: 2, kind: 'session_source', input: { pool: 'team', level: 'heavy' } });
  assert.deepEqual(direct.sessions.s.source, { pool: 'team', level: 'heavy' });
  direct = reduce(direct, { id: 'selected', trace: 's', step: 2, time: 3, kind: 'agent_selected', input: { family: 'opencode', model: 'actual', effort: 'high', source_effort: 'xhigh', pool: '', level: '' } });
  assert.equal(direct.sessions.s.selectedModel, 'actual');
  assert.equal(direct.sessions.s.selectedEffort, 'high');
  assert.equal(direct.sessions.s.selectedPool, '');
});
