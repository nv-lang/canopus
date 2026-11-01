import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalView } from '../family-approvals.js';
import { initialModel, reduce, addDraft, patchDraft } from '../state.js';
import { createView } from '../view.js';
import { createFakeDocument } from './fake-dom.mjs';

const modes = [{ id: 'build', name: 'Build' }, { id: 'plan', name: 'Plan' }];
const session = { id: 's', agent: 'opencode', optionsAgent: 'opencode', options: { modes, mode: 'plan', models: [], efforts: [] }, approvals: { opencode: 'plan', codex: 'read-only' } };
const model = { catalog: { codex: { options: { modes: [{ id: 'read-only', name: 'Read only' }], mode: 'read-only' } } } };

test('режимы — точные id: перестановка не меняет выбор и не переводит Plan в минимум прав', () => {
  assert.equal(approvalView(model, session, []).label, 'Plan');
  assert.equal(approvalView(model, { ...session, options: { ...session.options, modes: [...modes].reverse() } }, []).label, 'Plan');
});
test('пул показывает каждую семью, смена источника не меняет сохранённые значения', () => {
  const agents = [{ id: 'opencode' }, { id: 'codex' }, { id: 'claude' }];
  const pool = approvalView(model, session, agents, { pool: 'p', level: 'medium' });
  assert.equal(pool.label, 'По семьям');
  assert.deepEqual(pool.groups.map(g => g.selected), ['plan', 'read-only', '']);
  assert.match(pool.groups[2].unavailable, /не сообщил/);
  assert.equal(approvalView(model, session, agents, { kind: 'direct' }).label, 'Plan');
});
test('неподдержанный режим не заменяется первым/последним или более широким', () => {
  const result = approvalView(model, { ...session, approvals: { opencode: 'missing' } }, []);
  assert.equal(result.groups[0].selected, 'missing');
  assert.match(result.groups[0].unavailable, /больше не поддерживается/);
  assert.equal(result.label, 'Plan'); // real current value, not claimed application
  assert.equal(result.groups[0].pending, true);
});
test('setting_chosen хранит requested отдельно от фактического agent_model и переживает смену модели', () => {
  let m = initialModel();
  const event = (id, kind, input, step) => ({ id, kind, input, trace: 's', step, time: step + 1 });
  m = reduce(m, event('1', 'session_created', { agent: 'opencode', name: 'S' }, 0));
  m = reduce(m, event('2', 'setting_chosen', { agent: 'codex', setting: 'mode', value: 'read-only' }, 1));
  m = reduce(m, event('3', 'session_model', { agent: 'opencode', mode: 'plan', modes, model_id: 'm2' }, 2));
  assert.deepEqual(m.sessions.s.approvals, { codex: 'read-only' });
  assert.equal(m.sessions.s.options.mode, 'plan');
});
test('настройки черновика сохраняются при смене семьи и модели', () => {
  let m = addDraft(initialModel(), { id: 's', agent: 'opencode', now: 1 });
  m = patchDraft(m, 's', { approvals: session.approvals });
  m = patchDraft(m, 's', { agent: 'codex', source: { kind: 'pool', pool: 'p' } });
  assert.deepEqual(m.sessions.s.approvals, session.approvals);
});

test('кнопка непосредственно перед микрофоном, меню отправляет точный id; текст и вложения не пересоздаются', () => {
  const doc = createFakeDocument();
  const refs = Object.fromEntries(['app', 'side', 'main', 'rail', 'status', 'overlay'].map(key => {
    const node = doc.createElement('div'); doc.body.append(node); return [key, node];
  }));
  const picks = [];
  const view = createView(doc, refs, { agents: [{ id: 'opencode' }], now: () => 0, handlers: {
    queued: () => 0, queuedItems: () => [], onApproval: (...args) => picks.push(args),
  } });
  let m = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'S', agent: 'opencode' } });
  m = reduce(m, { id: 'options', trace: 's', step: 1, time: 2, kind: 'session_model', input: { agent: 'opencode', mode: 'plan', modes } });
  const ui = { selected: 's', projects: [], pins: {}, theme: 'system' };
  view.render(m, ui, { state: 'connected' });
  const row = refs.main.querySelector('.box-row');
  const children = [...row.children];
  const approvals = refs.main.querySelector('.family-approvals');
  const mic = refs.main.querySelector('.mic-btn');
  assert.equal(children[children.indexOf(approvals) + 1], mic.parentNode);
  const input = refs.main.querySelector('textarea'); input.value = 'Не потерять черновик';
  refs.main.querySelector('.family-approvals-button').click();
  const items = refs.main.querySelector('.family-approvals-menu').querySelectorAll('.menu-item');
  items[0].click();
  assert.deepEqual(picks, [['s', 'opencode', 'build']]);
  view.render(m, ui, { state: 'connected' });
  assert.equal(refs.main.querySelector('textarea'), input);
  assert.equal(input.value, 'Не потерять черновик');
});
