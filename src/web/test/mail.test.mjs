import test from 'node:test';
import assert from 'node:assert/strict';
import { timeline } from '../lists.js';
import * as view from '../view.js';
import { createFakeDocument } from './fake-dom.mjs';

const message = text => ({ role: 'user', key: 'u:1', turn: '1', text, at: 100 });
const feed = (text, extra = {}) => timeline({ messages: [message(text)], tools: [], tasks: [], ...extra }).filter(x => x.type === 'agent-mail');

test('legacy question keeps its kind and sender identity', () => {
  const [mail] = feed('[canopus] Письмо от Исполнитель (s-worker) [вопрос q12]: Проверь результат');
  assert.equal(mail.qid, 'q12');
  assert.equal(mail.senderId, 's-worker');
  assert.equal(mail.text, 'Проверь результат');
});

test('request metadata enriches the matching letter without exposing service instructions', () => {
  const [mail] = feed('[canopus] Письмо от Исполнитель: Готово', { requests: [{ turn: 1, parts: [{ kind: 'owner_message', text: '[canopus] Письмо от Исполнитель (s-worker) [ответ на q12]: Готово' }] }] });
  assert.equal(mail.replyTo, 'q12');
  assert.equal(mail.senderId, 's-worker');
  assert.equal(mail.text, 'Готово');
});

test('owner text containing a quoted prefix stays owner speech', () => {
  assert.equal(feed('Посмотри строку [canopus] Письмо от Исполнитель: текст').length, 0);
});

test('short letter is open and sender link opens the same dialog', () => {
  const doc = createFakeDocument();
  const selected = [];
  const card = view.mailCard(doc, { sender: 'Исполнитель', senderId: 's-worker', text: 'Готово', qid: 'q12' }, {
    onSelect: id => selected.push(id), content: doc.createElement('div'),
  });
  assert.equal(card.open, true);
  const link = card.querySelector('a');
  assert.equal(link.getAttribute('href'), '#s=s-worker');
  link.click();
  assert.deepEqual(selected, ['s-worker']);
  assert.match(card.textContent, /Вопрос q12/);
});

test('long letter starts collapsed; unknown sender has no fabricated link', () => {
  const doc = createFakeDocument();
  const card = view.mailCard(doc, { sender: 'Архив', text: 'строка\n'.repeat(100) }, { content: doc.createElement('div') });
  assert.equal(card.open, false);
  assert.equal(card.querySelector('a'), null);
});

test('request ordinal is not a journal turn id; unrelated requests cannot supply identity', () => {
  const [mail] = feed('[canopus] Письмо от Исполнитель: Готово', { requests: [
    { turn: 1, parts: [{ kind: 'owner_message', text: '[canopus] Письмо от Исполнитель (wrong): Другое' }] },
    { turn: 7, parts: [{ kind: 'owner_message', text: '[canopus] Письмо от Исполнитель (right): Готово' }] },
  ] });
  assert.equal(mail.senderId, 'right');
});

test('324 resume marks only the latest delivered letter as urgent', async () => {
  const { initialModel, reduce } = await import('../state.js');
  let model = initialModel();
  const event = (kind, input, step) => ({ kind, input, step, id: `e${step}`, trace: 's', time: step });
  for (const e of [event('session_created', { name: 'Получатель' }, 0),
    event('user_message', { turn: 't1', text: '[canopus] Письмо от Исполнитель: Поправка' }, 1),
    event('turn_resume', { turn: 't1', previous_turn: 't0' }, 2)]) model = reduce(model, e);
  assert.equal(timeline(model.sessions.s).find(x => x.type === 'agent-mail').urgent, true);
});

test('ambiguous request identities do not invent a sender link', () => {
  const [mail] = feed('[canopus] Письмо от Работник: Готово', { requests: ['first', 'second'].map(id => ({ turn: 3, parts: [{ kind: 'owner_message', text: `[canopus] Письмо от Работник (${id}): Готово` }] })) });
  assert.equal(mail.senderId, '');
});

test('archived truncated mail keeps the full-text retrieval size', () => {
  const [mail] = feed('[canopus] Письмо от Работник: Начало\n… (обрезано, всего 4096 байт)');
  assert.equal(mail.text, 'Начало');
  assert.equal(mail.fullBytes, 4096);
});

test('service requests carry letter metadata in hub_note after a route prelude', () => {
  const [mail] = feed('[canopus] Письмо от Работник: Готово', { requests: [{ turn: 9, parts: [{ kind: 'hub_note', text: 'Инструкция режима\n\n[canopus] Письмо от Работник (sender) [ответ на q4]: Готово' }] }] });
  assert.equal(mail.senderId, 'sender');
  assert.equal(mail.replyTo, 'q4');
});
