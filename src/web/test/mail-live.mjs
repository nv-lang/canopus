// Real isolated hub + fake ACP agent: canopus_send delivery, card and sender history.
// node src/web/test/mail-live.mjs <playwright/index.mjs> <chrome> <isolated-url>
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const [modulePath, chromePath, base] = process.argv.slice(2);
assert.ok(base, 'pass an isolated hub URL');
const { chromium } = await import(pathToFileURL(modulePath).href);
const socketUrl = new URL('/ws', base);
socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(socketUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const suffix = Date.now();
const sender = `mail-sender-${suffix}`, recipient = `mail-recipient-${suffix}`;
const send = (kind, trace, input) => socket.send(JSON.stringify({ id: crypto.randomUUID(), trace, kind, input, step: 0, time: Date.now() }));
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  send('session_created', sender, { name: `Отправитель ${suffix}`, agent: 'opencode' });
  send('session_created', recipient, { name: `Получатель ${suffix}`, agent: 'opencode' });
  const row = name => page.locator('.session-item').filter({ hasText: name });
  await row(`Отправитель ${suffix}`).click();
  send('user_message', sender, { text: `ctl canopus_send ${JSON.stringify({ to: recipient, expect_reply: true, text: 'Живое письмо 333' })}` });
  await row(`Получатель ${suffix}`).locator('.mail-count').waitFor({ timeout: 30000 });
  await row(`Получатель ${suffix}`).click();
  const mail = page.locator('.agent-mail').filter({ hasText: 'Живое письмо 333' });
  await mail.waitFor();
  assert.match(await mail.textContent(), /Вопрос q\d+/);
  assert.equal(await row(`Получатель ${suffix}`).locator('.mail-count').count(), 0);
  await mail.locator('a').click();
  await page.waitForFunction(name => document.querySelector('.session-item[aria-current="true"]')?.textContent.includes(name), `Отправитель ${suffix}`);
  await page.getByText(/ctl canopus_send/, { exact: false }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: real canopus_send, question card, unviewed count/reset, same sender dialog with history');
} finally {
  socket.close();
  await browser.close();
}
