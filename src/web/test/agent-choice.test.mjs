import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../view.js';
import { initialModel, reduce, addDraft, patchDraft } from '../state.js';
import { createFakeDocument } from './fake-dom.mjs';
import { t } from '../strings.js';
import { timeline } from '../lists.js';

for (const agents of [[], [{ id: 'opencode' }]]) {
  test(`недоступные настройки объясняют клик: агентов ${agents.length}`, () => {
    const doc = createFakeDocument(); const refs = {}; const notices = []; const effects = [];
    for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
      refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
    }
    const view = createView(doc, refs, { agents, now: () => 0, handlers: {
      queued: () => 0, queuedItems: () => [], onNotice: (text) => notices.push(text),
      onSwitchAgent: (...args) => effects.push(args), onSource: (...args) => effects.push(args), onDraftSource: (...args) => effects.push(args),
    } });
    const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1,
      kind: 'session_created', input: { name: 'Проверка', agent: 'opencode' } });
    view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
    const group = refs.main.querySelector('.status-group');
    assert.equal(group.children.length, 1);
    const buttons = group.querySelectorAll('button').filter((button) => !button.hidden);
    assert.equal(buttons.length, 1);
    assert.equal(refs.main.querySelector('.family-approvals-button'), null);
    if (agents.length === 0) {
      assert.equal(buttons[0].dataset.noChoices, 'true');
      assert.match(buttons[0].title, /нет настроенных|недоступны|агент/i);
      for (const button of buttons) {
        const before = notices.length;
        button.click();
        assert.equal(notices.length, before + 1, button.title);
        assert.equal(notices.at(-1), button.title);
      }
    } else {
      const familyButton = buttons[0];
      assert.equal(familyButton.dataset.noChoices, 'false');
      familyButton.click();
      const rows = refs.main.querySelectorAll('.agent-picker-anchor .menu-item');
      assert.equal(rows.length, 1, 'настроенная семья видна без выдуманной модели');
      assert.equal(rows[0].disabled, true);
      assert.equal(rows[0].getAttribute('aria-disabled'), 'true');
      assert.match(rows[0].textContent, /недоступ|не подтверждён|unavailable/i);
      assert.equal(refs.main.querySelectorAll('.agent-model-row').length, 0);
      rows[0].click();
      assert.equal(notices.length, 0, 'недоступная семья не подменяется сообщением о пустом реестре');
    }
    assert.deepEqual(effects, []);
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
  assert.equal(rows.length, 2, 'configured families остаются видимыми как unavailable, без выдуманных model rows');
  assert.ok(rows.every((row) => row.disabled && row.getAttribute('aria-disabled') === 'true'));
  assert.deepEqual(switches, []);
});

test('компактный селектор отправляет direct source и сохраняет выбор черновика', () => {
  const doc = createFakeDocument(); const refs = {}; const sources = []; const draftSources = [];
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const presets = { active: 'default', presets: [{ name: 'default', roles: {}, pools: { team: { light: [{ family: 'opencode', model: 'm1', effort: 'low', active: true }] } } }] };
  const agents = [{ id: 'opencode' }];
  const metadata = { status: 'ready', family: 'opencode', source: 'opencode.api.model', sourceVersion: '2.2.5', observedAt: 1, expiresAt: 1000, complete: false, permissionsStatus: 'blocked', models: [{ id: 'm1', name: 'Model One', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] }] };
  const view = createView(doc, refs, { agents, now: () => 0, presets: () => presets, modelMetadata: () => metadata, handlers: {
    queued: () => 0, queuedItems: () => [], onSource: (...args) => sources.push(args), onDraftSource: (...args) => draftSources.push(args),
  } });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'Проверка', agent: 'opencode', source: { family: 'opencode', model: 'm1', effort: 'low' } } });
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const picker = refs.main.querySelector('.agent-picker-button');
  assert.ok(picker);
  assert.equal(refs.main.querySelectorAll('.status-group .status-btn').length, 2);
  picker.click();
  const modelRow = refs.main.querySelectorAll('.menu-item').find((r) => r.textContent.includes('Model One'));
  assert.ok(modelRow);
  assert.equal(modelRow.querySelector('.effort-slider'), null);
  refs.main.querySelector('.effort-picker-button').click();
  const slider = refs.main.querySelector('.effort-slider');
  assert.ok(slider);
  assert.equal(refs.main.querySelector('.effort-sparkles').dataset.active, 'false');
  const stars = refs.main.querySelectorAll('.effort-sparkle');
  slider.value = '1';
  slider.dispatchEvent({ type: 'input', bubbles: true });
  assert.equal(refs.main.querySelector('.effort-sparkles').dataset.active, 'true');
  assert.ok(refs.main.querySelectorAll('.effort-sparkle').every((star, at) => star === stars[at]));
  assert.equal(refs.main.querySelectorAll('.effort-tick').length, 2);
  assert.deepEqual(refs.main.querySelectorAll('.effort-tick').map((tick) => tick.hidden), [false, true]);
  const heights = refs.main.querySelectorAll('.effort-sparkle').map((star) => star.style['--star-height']);
  assert.ok(new Set(heights).size > 2);
  slider.dispatchEvent({ type: 'change', bubbles: true });
  assert.deepEqual(sources, [['s', { family: 'opencode', model: 'm1', effort: 'high' }]]);
});

test('partial cold metadata exposes only its bound family; other configured families stay unavailable', () => {
  const doc = createFakeDocument(); const refs = {}; const sources = [];
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const agents = [{ id: 'codex', label: 'Codex' }, { id: 'second', label: 'Second' }];
  let metadata = { status: 'ready', family: 'codex', source: 'opencode.api.model', sourceVersion: '2.2.5', observedAt: 1, expiresAt: 1000, complete: false, permissionsStatus: 'blocked', models: [{ id: 'native/model-x', name: 'Model X', efforts: [{ id: 'native-high', name: 'High' }] }] };
  const view = createView(doc, refs, { agents, now: () => 0, modelMetadata: () => metadata, handlers: {
    queued: () => 0, queuedItems: () => [], onSource: (...args) => sources.push(args),
  } });
  const base = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'x', agent: 'codex' } });
  const withLegacyCache = { ...base, catalog: { second: { agent: 'second', model: 'fabricated-old-cache', options: { models: [{ id: 'fabricated-old-cache', name: 'Fake' }], efforts: [{ id: 'fake-effort', name: 'Fake' }], modes: [], modelId: '', effort: '', mode: '' } } } };
  view.render(withLegacyCache, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  refs.main.querySelector('.agent-picker-button').click();
  const rows = refs.main.querySelectorAll('.agent-picker-anchor .menu-item');
  assert.ok(refs.main.querySelector('.menu-catalog-partial'));
  assert.ok(rows.some((row) => row.textContent.includes('Model X')));
  assert.ok(!rows.some((row) => row.textContent.includes('Fake') || row.textContent.includes('fabricated-old-cache')));
  const second = rows.find((row) => row.textContent.includes('Second'));
  assert.ok(second && second.disabled && second.getAttribute('aria-disabled') === 'true');
  second.click();
  assert.deepEqual(sources, []);
  refs.main.querySelector('.agent-picker-button').click();
  metadata = { status: 'unavailable', family: 'codex', reason: 'same_context_binding_unverified', models: [] };
  view.render(withLegacyCache, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  refs.main.querySelector('.agent-picker-button').click();
  const unavailableRows = refs.main.querySelectorAll('.agent-picker-anchor .menu-item');
  assert.equal(unavailableRows.length, 2);
  assert.ok(unavailableRows.every((row) => row.disabled));
  assert.ok(unavailableRows.some((row) => row.textContent.includes('same_context_binding_unverified')));
});

test('звёзды усилия декоративны, едут справа налево и неподвижны при reduced-motion', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../app.css', import.meta.url), 'utf8');
  assert.match(css, /\.effort-slider::-webkit-slider-runnable-track \{[^}]*height: 30px/);
  assert.match(css, /--effort-end:\s*#8b5cf6/);
  assert.match(css, /linear-gradient\(to right, var\(--effort-start\), var\(--effort-end\)\)/);
  assert.doesNotMatch(css, /\.effort-slider[^}]*linear-gradient\(to right, var\(--ok\), var\(--accent\)\)/);
  assert.match(css, /right \/ calc\(100% - var\(--effort-fill, 0%\)\) 100% no-repeat/);
  assert.match(css, /@keyframes effort-star-drift \{[^}]*translateX\(0\)[\s\S]*?translateX\(-180px\)/);
  assert.match(css, /\.effort-sparkles \{[^}]*pointer-events: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.effort-sparkle \{ animation: none/);
});

test('Escape из поиска закрывает picker и возвращает focus trigger; меню привязано к нему', () => {
  const doc = createFakeDocument(); const refs = {};
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const view = createView(doc, refs, { agents: [{ id: 'opencode' }], now: () => 0, handlers: { queued: () => 0, queuedItems: () => [] } });
  const base = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'x', agent: 'opencode' } });
  const options = { models: [{ id: 'm', name: 'M' }], model_id: 'm', efforts: [{ id: 'low', name: 'low' }], effort: 'low', modes: [], mode: '' };
  const model = { ...base, catalog: { opencode: { agent: 'opencode', updated: 1, model: 'm', options } } };
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const picker = refs.main.querySelector('.agent-picker-button');
  picker.click();
  const anchor = refs.main.querySelector('.agent-picker-anchor');
  const menu = anchor.querySelector('.menu');
  assert.equal(menu.parentNode, anchor);
  assert.equal(doc.activeElement.getAttribute('type'), 'search');
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(menu.hidden, true);
  assert.equal(doc.activeElement, picker);
});

test('anchor-position clamps a right-edge trigger inside a narrow viewport', () => {
  const doc = createFakeDocument(); const refs = {};
  doc.defaultView = { innerWidth: 360, innerHeight: 600, addEventListener() {}, matchMedia: () => ({ matches: false }) };
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const view = createView(doc, refs, { agents: [{ id: 'codex', label: 'Codex' }], now: () => 0, handlers: { queued: () => 0, queuedItems: () => [] } });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'x', agent: 'codex' } });
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const anchor = refs.main.querySelector('.agent-picker-anchor');
  const picker = refs.main.querySelector('.agent-picker-button');
  const menu = anchor.querySelector('.menu');
  refs.main.querySelector('.chat').getBoundingClientRect = () => ({ left: 0, right: 360 });
  picker.getBoundingClientRect = () => ({ left: 300, right: 360, width: 60, top: 500, bottom: 530 });
  menu.getBoundingClientRect = () => ({ left: 0, right: 250, width: 250 });
  picker.click();
  assert.equal(menu.style.left, '102px');
  assert.equal(menu.style.bottom, '108px');
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

test('подпись ответа фиксирует только turn-bound actual и остаётся той же при смене source/replay', () => {
  const events = [
    { id: 'c', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'x', agent: 'family-a' } },
    { id: 'u1', trace: 's', step: 1, time: 2, kind: 'user_message', input: { turn: 'turn-a', text: 'first' } },
    { id: 'a1', trace: 's', step: 2, time: 3, kind: 'agent_actual', input: { turn: 'turn-a', dispatch_id: 'dispatch-a', family: 'family-a', model: 'model-a', effort: 'native-a', role: 'dev' } },
    { id: 'chunk1', trace: 's', step: 3, time: 4, kind: 'agent_chunk', input: { turn: 'turn-a', text: 'answer A' } },
    { id: 'done1', trace: 's', step: 4, time: 5, kind: 'agent_done', input: { turn: 'turn-a' } },
    { id: 'source-b', trace: 's', step: 5, time: 6, kind: 'session_source', input: { family: 'family-b', model: 'model-b', effort: 'native-b' } },
    { id: 'u2', trace: 's', step: 6, time: 7, kind: 'user_message', input: { turn: 'turn-b', text: 'second' } },
    { id: 'a2', trace: 's', step: 7, time: 8, kind: 'agent_actual', input: { turn: 'turn-b', dispatch_id: 'dispatch-b', family: 'family-b', model: 'model-b', effort: 'native-b', role: 'dev' } },
    { id: 'chunk2', trace: 's', step: 8, time: 9, kind: 'agent_chunk', input: { turn: 'turn-b', text: 'answer B' } },
    { id: 'done2', trace: 's', step: 9, time: 10, kind: 'agent_done', input: { turn: 'turn-b' } },
  ];
  const applyAll = () => events.reduce((model, event) => reduce(model, event), initialModel());
  const model = applyAll();
  const session = model.sessions.s;
  const replies = session.messages.filter((message) => message.role === 'agent');
  assert.deepEqual(replies.map((message) => message.actual), [
    { family: 'family-a', model: 'model-a', effort: 'native-a', role: 'dev', dispatchId: 'dispatch-a' },
    { family: 'family-b', model: 'model-b', effort: 'native-b', role: 'dev', dispatchId: 'dispatch-b' },
  ]);
  const authors = timeline(session).filter((item) => item.type === 'author');
  assert.deepEqual(authors.map((item) => [item.turn, item.actual.family, item.actual.model, item.actual.effort]), [
    ['turn-a', 'family-a', 'model-a', 'native-a'], ['turn-b', 'family-b', 'model-b', 'native-b'],
  ]);
  const replayed = applyAll().sessions.s;
  assert.deepEqual(timeline(replayed).filter((item) => item.type === 'author'), authors);
});

test('catalog, session selection/request и событие без turn не приписываются ответу', () => {
  const events = [
    { id: 'c', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'x', agent: 'family-a' } },
    { id: 'catalog', trace: 's', step: 1, time: 2, kind: 'agent_catalog', input: { agent: 'family-b', model: 'catalog-model' } },
    { id: 'request', trace: 's', step: 2, time: 3, kind: 'agent_selection', input: { family: 'family-b', model: 'requested-model', effort: 'requested-effort' } },
    { id: 'selected', trace: 's', step: 3, time: 4, kind: 'agent_selected', input: { family: 'family-b', model: 'session-model', effort: 'session-effort' } },
    { id: 'unbound', trace: 's', step: 4, time: 5, kind: 'agent_actual', input: { family: 'family-b', model: 'unbound-model', effort: 'unbound-effort' } },
    { id: 'u', trace: 's', step: 5, time: 6, kind: 'user_message', input: { turn: 'turn-unknown', text: 'unknown' } },
    { id: 'chunk', trace: 's', step: 6, time: 7, kind: 'agent_chunk', input: { turn: 'turn-unknown', text: 'answer' } },
    { id: 'late', trace: 's', step: 7, time: 8, kind: 'agent_actual', input: { turn: 'turn-unknown', family: 'family-b', model: 'late-model', effort: 'late-effort' } },
    { id: 'done', trace: 's', step: 8, time: 9, kind: 'agent_done', input: { turn: 'turn-unknown' } },
  ];
  const model = events.reduce((current, event) => reduce(current, event), initialModel());
  const session = model.sessions.s;
  assert.equal(session.messages.find((message) => message.role === 'agent').actual, null);
  assert.equal(timeline(session).find((item) => item.type === 'author').actual, null);
  assert.equal(model.catalog['family-b'].model, 'catalog-model');
});

test('ответ отображает фактическую или явную неподтверждённую подпись через text DOM', () => {
  const doc = createFakeDocument(); const refs = {};
  const createElement = doc.createElement;
  doc.createElement = (tag) => {
    const node = createElement(tag);
    node.insertBefore = (child, before) => {
      if (child.parentNode) child.remove();
      const index = before ? node.childNodes.indexOf(before) : -1;
      child.parentNode = node;
      if (index < 0) node.childNodes.push(child); else node.childNodes.splice(index, 0, child);
      return child;
    };
    return node;
  };
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const view = createView(doc, refs, { agents: [], now: () => 0, handlers: { queued: () => 0, queuedItems: () => [] } });
  const events = [
    { id: 'c', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'x', agent: '' } },
    { id: 'u', trace: 's', step: 1, time: 2, kind: 'user_message', input: { turn: 'turn-visible', text: 'question' } },
    { id: 'actual', trace: 's', step: 2, time: 3, kind: 'agent_actual', input: { turn: 'turn-visible', family: 'family-x', model: 'model-x', effort: 'native-x' } },
    { id: 'chunk', trace: 's', step: 3, time: 4, kind: 'agent_chunk', input: { turn: 'turn-visible', text: 'answer' } },
    { id: 'done', trace: 's', step: 4, time: 5, kind: 'agent_done', input: { turn: 'turn-visible' } },
  ];
  const model = events.reduce((current, event) => reduce(current, event), initialModel());
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  assert.equal(refs.main.querySelector('.agent-signature').textContent, 'Агент: family-x model-x / Native-x');
  const unknown = events.filter((event) => event.kind !== 'agent_actual').reduce((current, event) => reduce(current, event), initialModel());
  view.render(unknown, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  assert.equal(refs.main.querySelector('.agent-signature').textContent, 'Агент не подтверждён');
  const switched = reduce(model, { id: 'sw', trace: 's', step: 5, time: 6, kind: 'agent_switched',
    input: { from: 'family-x', to: 'zai', model: 'GLM-5.3', effort: 'high', cut: 0 } });
  view.render(switched, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  assert.equal(refs.main.querySelector('.item-switch').textContent, 'Агент: zai GLM-5.3 / Высокое');
});

for (const draft of [true, false]) test(`one model-row click commits a family/model with effort: draft=${draft}`, () => {
  const doc = createFakeDocument(); const refs = {};
  for (const key of ['app','side','main','rail','status','overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  let model = draft ? addDraft(initialModel(), {id:'s',agent:'opencode',now:1}) : reduce(initialModel(), {id:'c',trace:'s',step:0,time:1,kind:'session_created',input:{agent:'opencode'}});
  const calls = [];
  const metadata = {status:'ready',expiresAt:1000,families:{kimi:[{id:'k3',name:'K3',efforts:[{id:'off',name:'Off'},{id:'high',name:'High'}]}]}};
  const draw = () => view.render(model, {selected:'s',projects:[],pins:{},theme:'system'}, {state:'connected'});
  const view = createView(doc, refs, {agents:[{id:'opencode',label:'OpenCode'},{id:'kimi',label:'Kimi'}],now:()=>10,modelMetadata:()=>metadata,handlers:{
    queued:()=>0,queuedItems:()=>[],onSource:(...args)=>calls.push(['real',...args]),onDraftSource:(trace,source)=>{calls.push(['draft',trace,source]);model=patchDraft(model,trace,{source});draw();}
  }});
  draw();refs.main.querySelector('.agent-picker-button').click();
  const filter = refs.main.querySelector('.menu-family-filter');
  assert.equal(filter.hidden, false);
  assert.equal(filter.value, '');
  assert.ok(refs.main.querySelectorAll('.menu-item').length > 1);
  filter.value = 'kimi';
  filter.dispatchEvent({ type: 'change', bubbles: true });
  draw();
  assert.equal(filter.value, 'kimi');
  const rows = refs.main.querySelectorAll('.menu-item');
  assert.equal(rows.length, 1);
  assert.match(rows[0].querySelector('.menu-label').textContent, /K3/);
  assert.equal(rows[0].querySelector('.menu-family').textContent, 'Kimi');
  rows[0].click();
  assert.deepEqual(calls,[[draft?'draft':'real','s',{family:'kimi',model:'k3',effort:'off'}]]);
  assert.equal(refs.main.querySelector('.agent-picker-button').getAttribute('aria-expanded'),'false');
  if(draft){assert.deepEqual(model.sessions.s.source,{family:'kimi',model:'k3',effort:'off'});assert.match(refs.main.querySelector('.agent-picker-button').textContent,/Kimi K3/);}
});

test('restored unbound error is historical above the conversation and never renders boolean false',()=>{
 const doc=createFakeDocument(),refs={};for(const key of ['app','side','main','rail','status','overlay']){refs[key]=doc.createElement('div');doc.body.append(refs[key])}
 const view=createView(doc,refs,{agents:[{id:'kimi'}],now:()=>10000,handlers:{queued:()=>0,queuedItems:()=>[],deliveryItems:()=>[{id:'old',trace:'s',state:'error',images:[],text:'',reason:'network',at:1000,restored:true}]}});
 const model=reduce(initialModel(),{id:'c',trace:'s',step:0,kind:'session_created',input:{agent:'kimi',name:'Test'},time:2000});view.render(model,{selected:'s',projects:[],pins:{},theme:'system'},{state:'connected'});
 assert.doesNotMatch(refs.main.textContent,/\bfalse\b/);const old=refs.main.querySelector('.delivery-history');assert.ok(old);assert.equal(old.querySelector('.delivery-body').hidden,true);assert.equal(old.getAttribute('role'),'note');
});
test('Codex effort variants share one model row and use separate ACP settings', () => {
  const doc = createFakeDocument(); const refs = {}; const sources = [];
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[key] = doc.createElement('div');
    doc.body.append(refs[key]);
  }
  const variants = ['low', 'high', 'ultra'].map((effort) => ({
    id: `gpt-6.1-sol[${effort}]`, name: `6.1 Sol (${effort})`,
  }));
  const view = createView(doc, refs, {
    agents: [{ id: 'codex' }], now: () => 0,
    modelMetadata: () => ({ status: 'ready', expiresAt: 1000, families: { codex: variants } }),
    handlers: { queued: () => 0, queuedItems: () => [], onSource: (...args) => sources.push(args) },
  });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: {
    agent: 'codex', source: { family: 'codex', model: 'gpt-6.1-sol[high]', effort: 'low' },
  } });
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  refs.main.querySelector('.agent-picker-button').click();
  const rows = refs.main.querySelectorAll('.menu-item');
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /6\.1 Sol/);
  assert.doesNotMatch(rows[0].textContent, /high|low|ultra/);
  assert.equal(rows[0].getAttribute('aria-checked'), 'true');
  assert.equal(refs.main.querySelector('.effort-slider'), null);

  refs.main.querySelector('.effort-picker-button').click();
  const slider = refs.main.querySelector('.effort-slider');
  assert.equal(String(slider.value), '1');
  const middleStars = refs.main.querySelectorAll('.effort-sparkle');
  assert.equal(middleStars.length, 8);
  assert.equal(new Set(middleStars.map((star) => star.style['--star-height'])).size, 7);
  assert.deepEqual(refs.main.querySelectorAll('.effort-tick').map((tick) => tick.style['--effort-stop']), ['0%', '50%', '100%']);
  slider.value = '2';
  slider.dispatchEvent({ type: 'change', bubbles: true });
  const selection = { family: 'codex', model: 'gpt-6.1-sol', effort: 'ultra' };
  assert.deepEqual(sources, [['s', selection]]);
  const effortButton = refs.main.querySelector('.effort-picker-button');
  assert.equal(effortButton.getAttribute('aria-expanded'), 'true');

  const render = (next) => view.render(next, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  render(model);
  assert.ok(refs.main.querySelector('.effort-slider') === slider, 'unrelated renders preserve the slider while open');
  const pinned = reduce(model, { id: 'pin', trace: 's', step: 1, time: 2, kind: 'session_source', input: selection });
  render(pinned);
  assert.ok(refs.main.querySelectorAll('.effort-sparkle').every((star, at) => star === middleStars[at]));
  assert.equal(effortButton.textContent, 'ultra');
  assert.equal(String(refs.main.querySelector('.effort-slider').value), '2');
  render(reduce(pinned, { id: 'working', trace: 's', step: 2, time: 3, kind: 'user_message', input: { turn: 'active', text: 'work' } }));
  assert.equal(refs.main.querySelector('.agent-picker-button').getAttribute('aria-disabled'), 'false');
  assert.equal(effortButton.getAttribute('aria-disabled'), 'false');
  assert.equal(refs.main.querySelector('.effort-slider').disabled, false);
  const pending = reduce(pinned, { id: 'pending', trace: 's', step: 2, time: 3, kind: 'agent_selection', input: selection });
  render(pending);
  assert.equal(effortButton.getAttribute('aria-expanded'), 'true');
  assert.equal(refs.main.querySelector('.effort-slider').disabled, true);
  render(reduce(pending, { id: 'chosen', trace: 's', step: 3, time: 4, kind: 'agent_selected', input: { ...selection, effort: 'low' } }));
  assert.equal(effortButton.getAttribute('aria-expanded'), 'true');
  assert.equal(String(refs.main.querySelector('.effort-slider').value), '2');
  assert.equal(refs.main.querySelector('.effort-slider').disabled, false);
  assert.equal(effortButton.textContent, 'ultra');
  effortButton.click();
  assert.equal(effortButton.getAttribute('aria-expanded'), 'false');
});

test('a queued family switch shows the chosen model before the next message', () => {
  const doc = createFakeDocument();
  const refs = {};
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[key] = doc.createElement('div');
    doc.body.append(refs[key]);
  }
  const view = createView(doc, refs, {
    agents: [{ id: 'zai' }, { id: 'qoder', label: 'Qoder' }],
    now: () => 0,
    modelMetadata: () => ({ status: 'ready', expiresAt: 1000, families: { qoder: [{ id: 'sonus', name: 'Sonus' }] } }),
    handlers: { queued: () => 0, queuedItems: () => [] },
  });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: {
    agent: 'zai', source: { family: 'zai', model: 'glm-5.3-flash', effort: 'low' },
  } });
  const handoffStatus = new Map([['s', { phase: 'selected', previous: 'zai', source: { family: 'qoder', model: 'sonus', effort: '' } }]]);
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system', handoffStatus }, { state: 'connected' });
  const picker = refs.main.querySelector('.agent-picker-button');
  assert.equal(picker.textContent, 'Qoder Sonus');
  assert.equal(refs.main.querySelector('.effort-picker-button').hidden, true);
  assert.equal(refs.main.querySelector('.ring-box'), null);
  picker.click();
  const row = refs.main.querySelectorAll('.menu-item').find(item => item.textContent.includes('Sonus'));
  assert.equal(row?.getAttribute('aria-checked'), 'true');

  const choice = handoffStatus.get('s');
  const ui = { selected: 's', projects: [], pins: {}, theme: 'system', handoffStatus };
  const thread = refs.main.querySelector('.thread');
  handoffStatus.set('s', { ...choice, phase: 'preparing' });
  view.render(model, ui, { state: 'connected' });
  assert.equal(thread.querySelector('.item-handoff').textContent, 'Передаём историю чата агенту Qoder…');

  handoffStatus.set('s', { ...choice, phase: 'preparing', compacting: true });
  view.render(model, ui, { state: 'connected' });
  assert.equal(thread.querySelector('.item-handoff').textContent, 'Готовим краткую сводку ранних сообщений…');

  handoffStatus.delete('s');
  view.render(model, ui, { state: 'connected' });
  assert.equal(thread.querySelector('.item-handoff'), null);
});
