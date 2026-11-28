// Independent probes of the combined UI contract; original failing tests stay unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../../../src/web/view.js';
import { initialModel, reduce } from '../../../src/web/state.js';
import { createFakeDocument } from '../../../src/web/test/fake-dom.mjs';

function fixture(agents, catalog = {}) {
  const doc = createFakeDocument(), refs = {}, notices = [], sources = [];
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const view = createView(doc, refs, { agents, now: () => 0, handlers: {
    queued: () => 0, queuedItems: () => [], onNotice: t => notices.push(t), onSource: (...args) => sources.push(args),
  } });
  const model = reduce(initialModel(), { id: 'c', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'Synthetic', agent: 'codex' } });
  view.render({ ...model, catalog }, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  return { doc, refs, notices, sources };
}
for (const agents of [[], [{ id: 'codex' }]]) {
  test(`277: ${agents.length} families without model catalog explain the single attached picker`, () => {
    const { refs, notices } = fixture(agents);
    const group = refs.main.querySelector('.status-group');
    assert.equal(group.children.length, 1);
    const picker = group.querySelector('button');
    assert.equal(picker.dataset.noChoices, 'true');
    assert.equal(picker.getAttribute('aria-disabled'), 'false', 'busy-state marker is not a catalog-availability marker');
    picker.click();
    assert.deepEqual(notices, [picker.title]);
    const approvals = refs.main.querySelector('.family-approvals-button');
    approvals.click();
    assert.match(refs.main.querySelector('.family-approvals-menu').textContent, /не сообщил поддерживаемые режимы/);
  });
}
test('277: one picker, separate approvals, and exact direct source dispatch with native low effort', () => {
  const entry = { agent: 'codex', updated: 1, model: 'm1', options: { models: [{ id: 'm1', name: 'Model One' }],
    model_id: 'm1', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], modes: [], effort: 'low', mode: '' } };
  const { refs, sources } = fixture([{ id: 'codex' }], { codex: entry });
  assert.equal(refs.main.querySelectorAll('.status-group .status-btn').length, 1);
  assert.ok(refs.main.querySelector('.family-approvals-button'));
  refs.main.querySelector('.agent-picker-button').click();
  const row = refs.main.querySelectorAll('.menu-item').find(e => e.textContent.includes('Model One'));
  const slider = row.querySelector('.effort-slider');
  slider.value = '0'; slider.dispatchEvent({ type: 'input', bubbles: true }); slider.dispatchEvent({ type: 'change', bubbles: true });
  assert.deepEqual(sources, [['s', { family: 'codex', model: 'm1', effort: 'low' }]]);
});
