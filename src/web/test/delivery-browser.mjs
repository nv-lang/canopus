// Isolated real-browser probe; synthetic WebSocket events, optionally served by live.
// node src/web/test/delivery-browser.mjs <playwright-core/index.mjs> <chrome.exe> [live-url]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [modulePath, chromePath, liveUrl] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(modulePath).href);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const api = {
    '/api/agents': { agents: [{ id: 'opencode', label: 'OpenCode' }] },
    '/api/presets': { presets: [] }, '/api/projects': { projects: [] },
    '/api/result-repositories': { repositories: [] },
  };
  if (url.pathname in api) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(api[url.pathname])); return; }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});
if (!liveUrl) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = new URL(liveUrl || `http://127.0.0.1:${server.address().port}/`);
const socketUrl = new URL('/ws', base);
socketUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const page = await browser.newPage();
  const frames = [], errors = [];
  let socket;
  let holdSnapshot = false;
  const finishSnapshot = () => socket.send(JSON.stringify({ kind: 'sessions_ready', sessions: ['s'] }));
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(socketUrl.href, ws => {
    socket = ws;
    ws.onMessage(raw => frames.push(JSON.parse(String(raw))));
    ws.send(JSON.stringify({ id: 'created', trace: 's', step: 0, kind: 'session_created', input: { name: 'Изолированная проверка 260', agent: 'opencode' }, time: 1 }));
    if (!holdSnapshot) finishSnapshot();
  });
  await page.goto(new URL('#s=s', base).href);
  const input = page.locator('#composer-input');
  const fieldStyle = el => {
    const style = getComputedStyle(el);
    return [style.backgroundColor, style.borderColor, style.borderRadius, style.boxShadow];
  };
  const search = page.locator('.search-input');
  const searchFrame = page.locator('.search');
  const composerFrame = page.locator('.box');
  assert.deepEqual(await searchFrame.evaluate(fieldStyle), await composerFrame.evaluate(fieldStyle));
  await search.focus();
  const focusedSearch = await searchFrame.evaluate(fieldStyle);
  await input.focus();
  assert.deepEqual(focusedSearch, await composerFrame.evaluate(fieldStyle));
  await input.fill('исчезавшее сообщение');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#composer-input').value === '');
  await page.locator('.item-delivery').waitFor();
  assert.equal(frames.length, 1);
  assert.match(await page.locator('.item-delivery').textContent(), /исчезавшее сообщение/);
  socket.send(JSON.stringify({ id: 'synthetic-error', trace: 's', step: 1, kind: 'error', input: { turn: '', message: 'cannot be started: Authorization: Bearer secret260' }, time: 2 }));
  const errCard = page.locator('.delivery-error', { hasText: 'Не удалось запустить агента' });
  const errHead = errCard.locator('.delivery-head');
  await errHead.waitFor();
  assert.equal(await errHead.getAttribute('aria-expanded'), 'false');
  await errCard.locator('.delivery-body').waitFor({ state: 'hidden' });
  assert.equal(await errCard.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await errHead.click();
  await errCard.locator('.delivery-body').waitFor({ state: 'visible' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await errHead.getAttribute('aria-expanded'), 'true');
  holdSnapshot = true;
  await page.reload();
  await page.getByText('Сверяем состояние сообщений…', { exact: true }).first().waitFor();
  assert.equal(await page.locator('.delivery-head:visible').count(), 0);
  finishSnapshot();
  holdSnapshot = false;
  await errHead.waitFor();
  assert.equal(await errHead.getAttribute('aria-expanded'), 'false');
  assert.equal(frames.length, 1, 'reload must not replay a message');
  const saved = page.locator('.item-delivery').filter({ hasText: 'исчезавшее сообщение' });
  await saved.getByRole('button', { name: /Доставка не подтверждена.*Подробнее/ }).click();
  assert.match(await saved.textContent(), /Доставка неизвестна/);
  assert.equal(await saved.getByRole('button', { name: 'Повторить', exact: true }).isDisabled(), true);
  await input.fill('новый черновик');
  await saved.getByRole('button', { name: 'Скопировать мой запрос в поле ввода', exact: true }).click();
  assert.equal(await input.inputValue(), 'исчезавшее сообщение\n\nновый черновик');
  await page.reload();
  await input.waitFor();
  assert.equal(await input.inputValue(), 'исчезавшее сообщение\n\nновый черновик');
  assert.doesNotMatch(await page.locator('#main').textContent(), /secret260|Bearer/);
  socket.send(JSON.stringify({ id: 'accepted-user', trace: 's', step: 2, kind: 'user_message', input: { turn: 'engine-turn', text: 'исчезавшее сообщение' }, time: 3 }));
  socket.send(JSON.stringify({ id: 'receipt', trace: 's', step: 3, kind: 'message_delivery', input: { client_id: frames[0].id, accepted: true, turn: 'engine-turn' }, time: 4 }));
  await saved.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.item-user').count(), 1);
  assert.equal(frames.length, 1);
  socket.send(JSON.stringify({ id: 'turn-error', trace: 's', step: 4, kind: 'error', input: { turn: 'engine-turn', message: 'network failure secret260' }, time: 5 }));
  await page.getByText('Агент не завершил ответ', { exact: false }).first().waitFor();
  socket.send(JSON.stringify({ id: 'late-answer', trace: 's', step: 5, kind: 'agent_chunk', input: { turn: 'engine-turn', text: 'поздний успешный ответ' }, time: 6 }));
  socket.send(JSON.stringify({ id: 'late-done', trace: 's', step: 6, kind: 'agent_done', input: { turn: 'engine-turn' }, time: 7 }));
  await page.getByText('поздний успешный ответ', { exact: true }).waitFor();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('canopus-console-delivery-v1') || '[]').some(r => r.turn === 'engine-turn'));
  await page.reload();
  await input.waitFor();
  assert.equal(await page.getByText('Агент не завершил ответ', { exact: false }).count(), 0);
  await input.fill('проверка цвета статуса');
  const colorFrame = frames.length;
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  assert.ok(frames[colorFrame]);
  socket.send(JSON.stringify({ id: 'received-color', trace: 's', step: 7, kind: 'error',
    input: { client_id: frames[colorFrame].id, message: 'Timeout' }, time: 8 }));
  const received = page.locator('.delivery-label[data-state="received"]');
  await received.waitFor();
  const theme = await received.evaluate(el => {
    const style = getComputedStyle(el);
    const sample = document.createElement('span');
    el.append(sample);
    const color = name => { sample.style.color = `var(${name})`; return getComputedStyle(sample).color; };
    const result = { warning: color('--warn'), danger: color('--danger'), received: style.color };
    sample.remove();
    return result;
  });
  assert.equal(theme.received, theme.warning);
  socket.send(JSON.stringify({ id: 'refused-user', trace: 's', step: 8, kind: 'user_message', input: { turn: 'refused-turn', text: 'тест отказа' }, time: 9 }));
  socket.send(JSON.stringify({ id: 'refused-agent', trace: 's', step: 9, kind: 'agent_refused', input: { turn: 'refused-turn', reason: 'Timeout' }, time: 10 }));
  const refused = page.locator('.delivery-label[data-state="agent_refused"]');
  await refused.waitFor();
  assert.equal(await refused.evaluate(el => getComputedStyle(el).color), theme.danger);
  assert.equal(await refused.locator('..').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  socket.send(JSON.stringify({ id: 'partial-user', trace: 's', step: 10, kind: 'user_message', input: { turn: 'partial-turn', text: 'исходный запрос' }, time: 11 }));
  socket.send(JSON.stringify({ id: 'partial-chunk', trace: 's', step: 11, kind: 'agent_chunk', input: { turn: 'partial-turn', text: 'начало ответа' }, time: 12 }));
  socket.send(JSON.stringify({ id: 'partial-failure', trace: 's', step: 12, kind: 'agent_refused', input: { turn: 'partial-turn', reason: 'Timeout' }, time: 13 }));
  await page.getByText('начало ответа', { exact: true }).waitFor();
  const partial = page.getByRole('button', { name: /Ответ прерван.*Подробнее/ });
  await partial.click();
  await page.getByText('Ваш запрос: «исходный запрос»', { exact: true }).waitFor();
  await page.locator('.delivery-body:visible').getByRole('button', { name: 'Скопировать мой запрос в поле ввода' }).click();
  assert.match(await input.inputValue(), /^исходный запрос/);
  await page.goto(base.href);
  await page.getByRole('button', { name: 'Новая сессия в проекте Без проекта', exact: true }).click();
  await input.fill('первое сообщение без подтверждения создания');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.locator('.item-delivery').filter({ hasText: 'первое сообщение без подтверждения создания' }).waitFor();
  const beforeReload = frames.length;
  assert.equal(new URL(page.url()).hash, '');
  await page.reload();
  await page.locator('.chat:not([hidden]) .item-delivery').filter({ hasText: 'первое сообщение без подтверждения создания' }).waitFor();
  assert.equal(frames.length, beforeReload, 'a failed first create must reopen its local copy without resending');
  assert.deepEqual(errors, []);
  console.log('260: browser GREEN — loss/reload, safe restore, persistent draft/error, foldable error card, late receipt, no duplicate or secrets');
} finally {
  await browser.close();
  if (!liveUrl) await new Promise(resolve => server.close(resolve));
}
