// Проверки очереди «на потом» (задача 192b): Ctrl+Enter, FIFO, привязка к сессии, сброс, подсказка в поле.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQueue, isBusy, keyAction } from '../queue.js';
import { S, t } from '../strings.js';
import { initialModel, reduce } from '../state.js';
import { createView } from '../view.js';
import { createFakeDocument, key as domKey } from './fake-dom.mjs';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = (extra = {}) => ({ key: 'Enter', ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, ...extra });
const session = (state, n = 2) => ({ state, messages: new Array(n).fill({}) });

test('Enter — отправка (свободен или занят агент решает страница); Ctrl+Enter и Cmd+Enter — особого действия нет', () => {
  assert.equal(keyAction(key()), 'send');
  assert.equal(keyAction(key({ ctrlKey: true })), null);
  assert.equal(keyAction(key({ metaKey: true })), null);
});

test('Shift+Enter — перенос строки (не перехватывается), чужие клавиши и набор через IME — не наши', () => {
  assert.equal(keyAction(key({ shiftKey: true })), null);
  assert.equal(keyAction(key({ key: 'a' })), null);
  assert.equal(keyAction(key({ isComposing: true })), null);
});

test('занят — это «отвечает» и «ждёт разрешения»', () => {
  assert.equal(isBusy('answering'), true);
  assert.equal(isBusy('permission'), true);
  for (const s of ['idle', 'cancelled', 'error', 'refused']) assert.equal(isBusy(s), false);
});

test('очередь выдаёт сообщения по одному, FIFO, и только когда ход закончился', () => {
  const q = createQueue();
  assert.equal(q.push('a', 'one'), 1);
  assert.equal(q.push('a', 'two'), 2);
  assert.equal(q.count('a'), 2);
  assert.equal(q.take('a', session('answering')), undefined);
  assert.equal(q.take('a', session('permission')), undefined);
  assert.equal(q.take('a', session('idle', 2)), 'one');
  // отправленное ещё не дошло до модели: второе не выдаётся
  assert.equal(q.take('a', session('idle', 2)), undefined);
  assert.equal(q.take('a', session('idle', 4)), 'two');
  assert.equal(q.count('a'), 0);
  assert.equal(q.take('a', session('idle', 6)), undefined);
});

test('очередь привязана к сессии', () => {
  const q = createQueue();
  q.push('a', 'for-a');
  q.push('b', 'for-b');
  assert.equal(q.take('b', session('idle')), 'for-b');
  assert.equal(q.count('a'), 1);
  assert.equal(q.count('b'), 0);
});

test('клик по счётчику убирает последнее, повторный — следующее с конца', () => {
  const q = createQueue();
  for (const x of ['1', '2', '3']) q.push('a', x);
  assert.equal(q.popLast('a'), '3');
  assert.equal(q.popLast('a'), '2');
  assert.equal(q.count('a'), 1);
  assert.equal(q.popLast('a'), '1');
  assert.equal(q.popLast('a'), undefined);
});

test('неудачная отправка возвращает сообщение в начало очереди', () => {
  const q = createQueue();
  q.push('a', 'one');
  q.push('a', 'two');
  const text = q.take('a', session('idle', 2));
  q.restore('a', text);
  assert.equal(q.take('a', session('idle', 2)), 'one');
});

test('при удалении сессии её очередь сбрасывается', () => {
  const q = createQueue();
  q.push('a', 'x');
  q.push('b', 'y');
  q.prune({ b: session('idle') });
  assert.equal(q.count('a'), 0);
  assert.equal(q.count('b'), 1);
  assert.deepEqual(q.traces(), ['b']);
});

test('подсказка в поле ввода: «Enter — отправить, Shift+Enter — новая строка», без Ctrl+Enter; в одну строку с многоточием', () => {
  assert.equal(S['composer.placeholder'], 'Enter — отправить, Shift+Enter — новая строка');
  assert.equal(S['composer.hint'], S['composer.placeholder']);
  assert.ok(!/Ctrl/.test(S['composer.placeholder']));
  assert.equal(t('composer.queued', { n: 3 }), 'В очереди: 3');
  const view = fs.readFileSync(path.join(web, 'view.js'), 'utf8');
  const css = fs.readFileSync(path.join(web, 'app.css'), 'utf8');
  assert.match(view, /placeholder: t\('composer\.placeholder'\)/);
  assert.match(view, /'aria-label': t\('chat\.cancel'\)/);
  assert.match(css, /\.box textarea:placeholder-shown \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
});

test('Enter при занятом агенте ставит сообщение в очередь страницы вместе с картинками; кнопка «↵» при занятом агенте включена; ошибки «нельзя в очередь» нет', () => {
  const view = fs.readFileSync(path.join(web, 'view.js'), 'utf8');
  const app = fs.readFileSync(path.join(web, 'app.js'), 'utf8');
  assert.match(view, /if \(!urgent && current\.session[^\n]+\{[^}]*handlers\.onQueue\(trace, text, images\)/);
  assert.match(view, /sendButton\.disabled = !can \|\| recordingNow \|\| unavailable;/);
  assert.ok(!/err_queue/.test(view + S['composer.hint'] + JSON.stringify(Object.keys(S))));
  assert.match(app, /queue\.push\(trace, \{ text, images, asText \}\);/);
  assert.match(app, /const delivered = handlers\.onSend\(trace, item\.text, images, false, item\.asText\);/);
  assert.ok(!/keyAction\(e, /.test(view));
});

test('очередь с вложениями выдаётся по одному элементу целиком, FIFO; пустая очередь ничего не выдаёт; провал доставки возвращает элемент', () => {
  const q = createQueue();
  const a = { text: 'a', images: [{ name: 'x.png' }] };
  const b = { text: 'b', images: [] };
  q.push('s', a);
  q.push('s', b);
  assert.equal(q.take('s', session('answering')), undefined);
  const first = q.take('s', session('idle', 2));
  assert.deepEqual(first, a);
  q.restore('s', first);
  assert.deepEqual(q.take('s', session('idle', 2)), a);
  assert.deepEqual(q.take('s', session('idle', 4)), b);
  assert.equal(q.take('s', session('idle', 6)), undefined);
});

test('324: чекбокс отправляет срочную поправку при открытом ходе и сбрасывается после отправки', () => {
  const doc = createFakeDocument();
  const refs = {};
  for (const name of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[name] = doc.createElement('div');
    doc.body.append(refs[name]);
  }
  const queued = [];
  const sent = [];
  const view = createView(doc, refs, { agents: [{ id: 'opencode' }], now: () => 0, handlers: {
    queued: () => queued.length, queuedItems: () => [],
    onQueue: (...args) => Boolean(queued.push(args)),
    onSend: (...args) => Boolean(sent.push(args)),
  } });
  const ui = { selected: 's', projects: [], pins: {}, theme: 'system' };
  const status = { state: 'connected' };
  const created = reduce(initialModel(), { id: 'created', trace: 's', step: 0, time: 0, kind: 'session_created', input: { name: 'test', agent: 'opencode' } });
  view.render(created, ui, status);
  const label = refs.main.querySelector('.composer-urgent');
  const checkbox = label.querySelector('input');
  const input = refs.main.querySelector('#composer-input');
  const send = refs.main.querySelector('.send-btn');
  assert.equal(label.hidden, true);

  const busy = reduce(created, { id: 'message', trace: 's', step: 1, time: 1, kind: 'user_message', input: { turn: 'old', text: 'Работай' } });
  view.render(busy, ui, status);
  assert.equal(label.hidden, false);
  assert.equal(send.hidden, true);
  input.value = 'Обычное сообщение';
  input.dispatchEvent(domKey('Enter'));
  assert.deepEqual(queued, [['s', 'Обычное сообщение', []]]);
  assert.equal(sent.length, 0);

  input.value = 'Срочная поправка';
  checkbox.click();
  assert.equal(send.hidden, false);
  send.click();
  assert.deepEqual(sent, [['s', 'Срочная поправка', [], true]]);
  assert.equal(checkbox.checked, false);
  assert.equal(send.hidden, true);
});
