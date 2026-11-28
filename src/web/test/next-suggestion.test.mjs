import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModel, reduce } from '../state.js';
import { createView } from '../view.js';
import { createFakeDocument, input as inputEvent, key } from './fake-dom.mjs';

function page() {
  const doc = createFakeDocument();
  const refs = Object.fromEntries(['app', 'side', 'main', 'rail', 'status', 'overlay'].map(name => [name, doc.createElement('div')]));
  doc.body.append(...Object.values(refs));
  const sent = [];
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 0,
    handlers: {
      queued: () => 0, queuedItems: () => [],
      onSend: (...args) => { sent.push(args); return true; },
    },
  });
  let model = initialModel();
  let step = 0;
  const trace = 's';
  const turn = 'turn-1';
  function event(kind, input, id = String(step)) {
    model = reduce(model, { trace, step: step++, id, kind, input, time: step });
  }
  const draw = () => view.render(model, { selected: trace, projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const offer = (prompt, id) => event('next_suggestion', { session: trace, turn, prompt }, id);

  event('session_created', { name: 'Чат', agent: 'opencode' });
  event('user_message', { turn, text: 'Что дальше?' });
  event('agent_chunk', { turn, text: 'Готово.' });
  draw();
  return { trace, turn, sent, draw, event, offer, field: refs.main.querySelector('#composer-input'), ghost: () => refs.main.querySelector('.composer-ghost') };
}

test('336: последнее предложение видно после хода, Tab вставляет точный текст, Enter отправляет', () => {
  const p = page();
  p.offer('Первый вариант', 'offer-1');
  const prompt = '  Покажи «дифф»\nсводкой 📈  ';
  p.offer(prompt, 'offer-2');
  p.offer('Старая доставка', 'offer-1');
  p.draw();
  p.event('agent_done', { turn: p.turn });
  p.draw();
  assert.equal(p.ghost()?.textContent, prompt);
  assert.equal(p.ghost().hidden, false);
  assert.equal(p.field.value, '');
  assert.equal(p.field.dispatchEvent(key('Tab', { shiftKey: true })), true);
  assert.equal(p.field.dispatchEvent(key('Tab')), false);
  assert.equal(p.field.value, prompt);
  assert.equal(p.ghost().hidden, true);
  assert.deepEqual(p.sent, []);
  p.field.dispatchEvent(key('Enter'));
  assert.deepEqual(p.sent, [[p.trace, prompt]]);
  assert.equal(p.field.value, '');
  p.draw();
  assert.equal(p.ghost().hidden, true);
});

test('336: печать скрывает подсказку, даже если стереть набранный текст', () => {
  const p = page();
  p.offer('Покажи тесты');
  p.event('agent_done', { turn: p.turn });
  p.draw();
  assert.equal(p.ghost()?.hidden, false);
  p.field.value = 'Набранный текст';
  p.field.dispatchEvent(inputEvent());
  assert.equal(p.ghost().hidden, true);
  p.field.value = '';
  p.field.dispatchEvent(inputEvent());
  p.draw();
  assert.equal(p.ghost().hidden, true);
  assert.equal(p.field.dispatchEvent(key('Tab')), true);
});

test('336: новый ход сбрасывает подсказку, старая история оставляет поле пустым', () => {
  const old = page();
  old.event('agent_done', { turn: old.turn });
  old.draw();
  assert.equal(old.field.value, '');
  assert.ok(!old.ghost() || old.ghost().hidden);
  assert.equal(old.field.dispatchEvent(key('Tab')), true);

  const p = page();
  p.offer('Покажи тесты');
  p.draw();
  assert.ok(!p.ghost() || p.ghost().hidden);
  p.event('agent_done', { turn: p.turn });
  p.draw();
  assert.equal(p.ghost()?.hidden, false);
  p.event('user_message', { turn: 'turn-2', text: 'Новый ход' });
  p.event('agent_done', { turn: 'turn-2' });
  p.draw();
  assert.equal(p.ghost().hidden, true);
  assert.equal(p.field.value, '');
  assert.equal(p.field.dispatchEvent(key('Tab')), true);
});
