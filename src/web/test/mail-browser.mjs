// Isolated real-browser probe; synthetic WebSocket events, optionally served by live.
// node src/web/test/mail-browser.mjs <playwright-core/index.mjs> <chrome.exe> [live-url]
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
    ws.send(JSON.stringify({ id: 'created', trace: 's', step: 0, kind: 'session_created', input: { name: 'Проверка писем 333', agent: 'opencode' }, time: Date.now() }));
    if (!holdSnapshot) finishSnapshot();
  });
  await page.goto(new URL('#s=s', base).href);
  await page.locator('.session-item').first().waitFor();
  const send = (kind, input, trace = 's', step = 1) => socket.send(JSON.stringify({ id: `${trace}-${kind}-${step}`, trace, step, kind, input, time: Date.now() }));
  send('session_created', { name: 'Отправитель', agent: 'opencode' }, 'sender', 0);
  send('user_message', { turn: 'unviewed', text: '[canopus] Письмо от Проверка (s): Результат' }, 'sender', 1);
  await page.locator('.mail-count').waitFor();
  assert.equal(await page.locator('.mail-count').textContent(), '1');
  send('user_message', { turn: '1', text: '[canopus] Письмо от Отправитель (sender) [вопрос q12]: Проверь результат' });
  const mail = page.locator('.agent-mail');
  await mail.waitFor();
  assert.match(await mail.textContent(), /Вопрос q12/);
  assert.equal(await mail.evaluate(el => el.open), true);
  await mail.locator('a').click();
  await page.waitForFunction(() => document.querySelector('.session-item[aria-current="true"]')?.textContent.includes('Отправитель'));
  assert.equal(await page.locator('.session-item[aria-current="true"]').count(), 1);
  assert.equal(await page.locator('.mail-count').count(), 0);
  await page.locator('.session-item').filter({ hasText: 'Проверка писем 333' }).click();
  send('user_message', { turn: '2', text: '[canopus] Письмо от Отправитель (sender): ' + 'длинное письмо\n'.repeat(100) }, 's', 2);
  send('turn_resume', { turn: '2', previous_turn: '1' }, 's', 3);
  await page.locator('.agent-mail-urgent').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.agent-mail').length === 2);
  const long = page.locator('.agent-mail').nth(1);
  assert.equal(await long.evaluate(el => el.open), false);
  await long.locator('summary').click();
  assert.equal(await long.evaluate(el => el.open), true);
  await long.locator('summary').click();
  await mail.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: process.env.MAIL_SCREENSHOT || '/tmp/c333-mail.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: question card, sender dialog navigation, long letter folding, confirmed urgency, unviewed badge reset; no browser errors');
} finally {
  await browser.close();
  if (!liveUrl) await new Promise(resolve => server.close(resolve));
}
