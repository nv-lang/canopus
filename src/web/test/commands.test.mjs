import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModel, reduce } from '../state.js';
import { createView } from '../view.js';
import { createFakeDocument, input as inputEvent, key } from './fake-dom.mjs';

test('337: меню команд, двойной слэш и явная отправка неизвестной команды', () => {
  const doc = createFakeDocument();
  const refs = Object.fromEntries(['app', 'side', 'main', 'rail', 'status', 'overlay'].map(name => [name, doc.createElement('div')]));
  doc.body.append(...Object.values(refs));
  const sent = [];
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 0,
    handlers: { queued: () => 0, queuedItems: () => [], onSend: (...args) => { sent.push(args); return true; } },
  });
  const model = reduce(initialModel(), { trace: 's', step: 0, id: 'created', kind: 'session_created', input: { name: 'Чат', agent: 'opencode' }, time: 0 });
  view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system', commands: [
    { name: 'task', description: 'Задачи проекта', arguments: '[номер]', source: 'canopus' },
    { name: 'work', description: 'Мои задачи', arguments: '[номер]', source: 'user' },
  ] }, { state: 'connected' });
  const input = refs.main.querySelector('#composer-input');
  const menu = () => refs.main.querySelector('.composer-commands');
  function type(text) { input.value = text; input.dispatchEvent(inputEvent()); }

  type('/');
  assert.equal(menu()?.hidden, false);
  assert.match(menu().textContent, /\/task.*Задачи.*номер/su);
  assert.match(menu().textContent, /\/work.*Пользовательская/su);
  type('//');
  assert.equal(menu().hidden, true);
  type('//artifact');
  assert.equal(menu().hidden, true);
  input.dispatchEvent(key('Enter'));
  assert.deepEqual(sent, [['s', '//artifact']]);

  type('/wo');
  menu().querySelector('.command-choice').click();
  assert.equal(input.value, '/work');
  input.dispatchEvent(key('Enter'));
  assert.deepEqual(sent[1], ['s', '/work']);

  type('/xyz');
  input.dispatchEvent(key('Enter'));
  assert.equal(sent.length, 2);
  assert.match(menu().textContent, /Исправить/u);
  menu().querySelector('.command-send-text').click();
  assert.deepEqual(sent[2], ['s', '/xyz', [], false, true]);
});
