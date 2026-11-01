// Requirement-level probes: RED is evidence of an unmet requirement, not a fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModel, reduce } from '../../../src/web/state.js';
import { createView } from '../../../src/web/view.js';
import { createFakeDocument, FakeElement } from '../../../src/web/test/fake-dom.mjs';

// The shared tiny modal DOM omits this native method used by a populated thread.
// Extend only this acceptance harness, never the product or shared test utility.
FakeElement.prototype.insertBefore = function (node, reference) {
  if (!reference) { this.append(node); return node; }
  if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
  const at = this.childNodes.indexOf(reference);
  if (at < 0) throw Error('reference is not a child');
  node.parentNode = this;
  this.childNodes.splice(at, 0, node);
  return node;
};

test('REQ-07: an answer carries its confirmed actual model, not only a mutable session picker', () => {
  let model = initialModel(), step = 0;
  const event = (kind, input) => { model = reduce(model, { id: `gap-${++step}`, trace: 's', step, time: step, kind, input }); };
  event('session_created', { agent: 'codex', name: 'Synthetic' });
  event('agent_selected', { family: 'codex', model: 'unique-actual-model-277', effort: 'high' });
  event('user_message', { turn: 't1', text: 'hello' });
  event('agent_chunk', { turn: 't1', text: 'synthetic answer without embedded model names' });
  event('agent_done', { turn: 't1' });
  event('agent_selected', { family: 'codex', model: 'different-model-next-turn', effort: 'low' });
  const doc = createFakeDocument(), refs = {};
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) { refs[key] = doc.createElement('div'); doc.body.append(refs[key]); }
  const view = createView(doc, refs, { agents: [{ id: 'codex' }], now: () => 0, handlers: { queued: () => 0, queuedItems: () => [] } });
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const thread = refs.main.querySelector('.thread');
  assert.match(thread.textContent, /unique-actual-model-277/, 'the answer must preserve and show its actual executor even after the next selection');
});
