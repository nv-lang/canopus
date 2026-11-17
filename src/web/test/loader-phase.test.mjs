import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createView } from '../view.js';
import { initialModel, reduce } from '../state.js';
import { createFakeDocument } from './fake-dom.mjs';

test('sidebar loader keeps its phase across state updates and restarts for a new run', () => {
  const doc = createFakeDocument(); const refs = {};
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
  }
  let time = 1000;
  const view = createView(doc, refs, { agents: [], now: () => time, handlers: { queued: () => 0, queuedItems: () => [] } });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1, kind: 'session_created', input: { name: 'Loader' } });
  const session = model.sessions.s;
  session.state = 'answering';
  const ui = { selected: 's', projects: [], pins: {}, theme: 'system' };
  const draw = () => view.render(model, ui, { state: 'connected' });
  const delay = () => refs.side.querySelector('.session-item .dot').style['--work-delay'] || '0ms';
  draw();
  assert.equal(delay(), '0ms');
  time += 450; session.updatedAt = time; draw();
  assert.equal(delay(), '-450ms');
  time += 300; ui.selected = null; draw();
  assert.equal(delay(), '-750ms');
  session.state = 'idle'; draw();
  assert.equal(refs.side.querySelector('.session-item .dot').dataset.state, 'idle');
  time += 200; session.state = 'answering'; draw();
  assert.equal(delay(), '0ms');
  const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  for (const pseudo of ['before', 'after']) {
    assert.match(css, new RegExp(`\\.dot\\[data-state="answering"\\]::${pseudo}\\s*\\{[^}]*animation-delay: var\\(--work-delay, 0ms\\)`));
  }
});

