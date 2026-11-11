import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalView } from '../family-approvals.js';
import { initialModel, reduce, addDraft, patchDraft } from '../state.js';
import { t } from '../strings.js';
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
test('unset означает родное умолчание, а каталог не становится owner intent или подтверждением чата', () => {
  const current = approvalView(model, { ...session, approvals: {} }, []);
  assert.equal(current.groups[0].unset, true);
  assert.equal(current.groups[0].requested, '');
  assert.equal(current.label, 'Родное умолчание · Plan');
  const cold = approvalView(model, { ...session, agent: 'codex', optionsAgent: '', approvals: {} }, []);
  assert.equal(cold.label, 'Родное умолчание');
  assert.equal(cold.groups[0].actual, '');
  assert.equal(cold.groups[0].requested, '');
  const pool = approvalView(model, { ...session, approvals: {} }, [{ id: 'codex' }], { pool: 'p', level: 'heavy' });
  assert.equal(pool.groups[0].unset, true);
  assert.equal(pool.groups[0].actual, '');
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

test('режим разрешений можно менять в поле ввода во время хода', () => {
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
  m = reduce(m, { id: 'running', trace: 's', step: 2, time: 3, kind: 'user_message', input: { turn: 't', text: 'Запрос' } });
  m = reduce(m, { id: 'approval', trace: 's', step: 3, time: 4, kind: 'permission_request', input: { turn: 't', request: 'p', action: 'Чтение' } });
  const ui = { selected: 's', projects: [], pins: {}, theme: 'system' };
  view.render(m, ui, { state: 'connected' });
  const permission = refs.main.querySelector('.permission-wrap');
  const log = refs.main.querySelector('.log');
  assert.equal(log.children[log.children.length - 3], permission);
  assert.equal(log.children[log.children.length - 1], refs.main.querySelector('.ask-wrap'));
  assert.equal(permission.hidden, false);
  assert.equal(refs.main.querySelector('.composer').contains(permission), false);
  m = reduce(m, { id: 'tool', trace: 's', step: 3, time: 3, kind: 'tool_call', input: { turn: 't', id: 'read', kind: 'read', status: 'pending' } });
  view.render(m, ui, { state: 'connected' });
  const thread = refs.main.querySelector('.thread');
  const slot = thread.querySelector('.item-permission');
  assert.equal(permission.parentNode, slot);
  const feedItems = Array.from(thread.children);
  assert.ok(feedItems[feedItems.indexOf(slot) - 1].classList.contains('item-work'));
  const row = refs.main.querySelector('.box-row');
  assert.equal(row.querySelector('.family-approvals'), null);
  assert.equal(refs.main.querySelector('.family-approvals-button'), null);
  const input = refs.main.querySelector('textarea'); input.value = 'Не потерять черновик';
  const buttons = refs.main.querySelectorAll('.box-bar button');
  const permissions = buttons.find(button => button.getAttribute('aria-label') === t('menu.agent_permissions'));
  assert.ok(buttons.indexOf(permissions) < buttons.indexOf(refs.main.querySelector('.agent-picker-button')));
  permissions.click();
  const items = refs.main.querySelectorAll('.menu').find(menu => !menu.hidden).querySelectorAll('.menu-item');
  assert.equal(items.find(item => item.textContent.includes('План')).getAttribute('aria-checked'), 'true');
  assert.equal(items[0].disabled, false);
  items[0].click();
  assert.deepEqual(picks, [['s', 'opencode', 'build']]);
  view.render(m, ui, { state: 'connected' });
  assert.equal(refs.main.querySelector('textarea'), input);
  assert.equal(input.value, 'Не потерять черновик');
});
