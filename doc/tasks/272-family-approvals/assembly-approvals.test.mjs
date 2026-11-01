// Targeted composition evidence for assembly 61c3dd31, not a real-provider or browser test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../../../src/web/view.js';
import { initialModel, reduce } from '../../../src/web/state.js';
import { createFakeDocument } from '../../../src/web/test/fake-dom.mjs';

function fixture() {
  const doc = createFakeDocument();
  const refs = {};
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
  }
  const sources = []; const approvals = []; const routes = [];
  const agents = [{ id: 'opencode' }, { id: 'codex' }];
  const presets = { active: 'default', presets: [{ name: 'default', roles: {}, pools: {
    mix: { heavy: [{ family: 'codex', model: 'c1', effort: 'high', active: true }] },
  } }] };
  const view = createView(doc, refs, { agents, presets: () => presets, now: () => 0, handlers: {
    queued: () => 0, queuedItems: () => [], onSource: (...args) => sources.push(args),
    onApproval: (...args) => approvals.push(args), onRoute: (...args) => routes.push(args),
  } });
  let model = initialModel(); let serial = 0;
  const feed = (kind, input, trace = 's') => {
    serial += 1;
    model = reduce(model, { id: `assembly-${serial}`, trace, step: serial, time: serial, kind, input });
  };
  const native = [{ id: 'build', name: 'Build' }, { id: 'plan', name: 'Plan' }, { id: 'yolo', name: 'Yolo' }];
  feed('session_created', { name: 'Assembly', agent: 'opencode', source: { family: 'opencode', model: 'm1', effort: 'low' } });
  feed('agent_catalog', { agent: 'opencode', updated: 1, model_id: 'm1', models: [{ id: 'm1', name: 'One' }, { id: 'm2', name: 'Two' }],
    efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], mode: 'plan', modes: native }, 'agents');
  feed('agent_catalog', { agent: 'codex', updated: 1, model_id: 'c1', models: [{ id: 'c1', name: 'Codex fixture' }],
    efforts: [{ id: 'high', name: 'High' }], mode: 'read-only', modes: [{ id: 'full-access', name: 'Full fixture' }, { id: 'read-only', name: 'Read fixture' }] }, 'agents');
  feed('session_model', { agent: 'opencode', model_id: 'm1', mode: 'plan', modes: native });
  feed('setting_chosen', { agent: 'opencode', setting: 'mode', value: 'plan' });
  feed('setting_chosen', { agent: 'codex', setting: 'mode', value: 'read-only' });
  const draw = () => view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  return { refs, sources, approvals, routes, feed, draw, native, session: () => model.sessions.s };
}

test('REQ-11/12 assembly: actual model picker → pool → native family choice preserves ids and composer', () => {
  const f = fixture(); f.draw();
  const input = f.refs.main.querySelector('textarea'); input.value = 'Draft survives source and pool';
  const mic = f.refs.main.querySelector('.mic-btn');
  const approvalRoot = f.refs.main.querySelector('.family-approvals');
  const siblings = [...approvalRoot.parentNode.children];
  assert.equal(siblings[siblings.indexOf(approvalRoot) + 1], mic.parentNode);
  f.refs.main.querySelector('.agent-picker-button').click();
  const row = f.refs.main.querySelectorAll('.agent-model-row').find(node => node.textContent.includes('Two'));
  assert.ok(row, 'current compact source picker exposes model Two');
  const effort = row.querySelector('.effort-slider'); effort.value = '1';
  effort.dispatchEvent({ type: 'change', bubbles: true });
  assert.deepEqual(f.sources.at(-1), ['s', { family: 'opencode', model: 'm2', effort: 'high' }]);
  f.feed('session_source', f.sources.at(-1)[1]); f.draw();
  assert.equal(f.refs.main.querySelector('.family-approvals-button').textContent, 'Plan');
  f.refs.main.querySelector('.agent-picker-button').click();
  const pool = f.refs.main.querySelectorAll('.menu-item').find(node => node.textContent.includes('mix · heavy'));
  assert.ok(pool); pool.click();
  assert.deepEqual(f.sources.at(-1), ['s', { pool: 'mix', level: 'heavy' }]);
  f.feed('session_source', f.sources.at(-1)[1]); f.draw();
  assert.equal(f.refs.main.querySelector('.family-approvals-button').textContent, 'По семьям');
  f.refs.main.querySelector('.family-approvals-button').click();
  const nativeRow = f.refs.main.querySelector('.family-approvals-menu').querySelectorAll('.menu-item')
    .find(node => node.title === 'read-only');
  assert.ok(nativeRow); assert.equal(nativeRow.getAttribute('aria-checked'), 'true'); nativeRow.click();
  assert.deepEqual(f.approvals, [['s', 'codex', 'read-only']]);
  assert.deepEqual(f.session().approvals, { opencode: 'plan', codex: 'read-only' });
  assert.equal(f.refs.main.querySelector('textarea'), input);
  assert.equal(input.value, 'Draft survives source and pool');
  assert.equal(f.refs.main.querySelector('.mic-btn'), mic);
});

test('REQ-12 assembly: wide native id in Preparation emits only the native choice, not a route/source change', () => {
  const f = fixture();
  f.feed('route_state', { route: 'planning', steps: [], worktree: false }); f.draw();
  assert.equal(f.session().route, 'planning');
  f.refs.main.querySelector('.family-approvals-button').click();
  const wide = f.refs.main.querySelector('.family-approvals-menu').querySelectorAll('.menu-item')
    .find(node => node.title === 'yolo');
  assert.ok(wide); wide.click();
  assert.deepEqual(f.approvals, [['s', 'opencode', 'yolo']]);
  assert.deepEqual(f.routes, []);
  assert.deepEqual(f.sources, []);
  assert.equal(f.session().route, 'planning');
  assert.equal(f.session().approvals.opencode, 'plan', 'requested value awaits server echo, not local fabricated confirmation');
});
