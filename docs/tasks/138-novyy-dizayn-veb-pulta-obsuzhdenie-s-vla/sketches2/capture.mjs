// Только статические эскизы: без сервера продукта, WebSocket, агентов и БД.
// node capture.mjs <playwright-core-module-dir> <chrome-executable>
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const [moduleDir, executablePath] = process.argv.slice(2);
if (!moduleDir || !executablePath) throw new Error('Required: playwright-core module dir and Chrome executable');
const require = createRequire(path.join(path.resolve(moduleDir), 'noop.js'));
const { chromium } = require('playwright-core');
const root = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Единственные разрешённые обращения — к локальным файлам самого эскиза.
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.screenshot({ path: path.join(root, 'dispatch.png') });
  console.log(JSON.stringify({ errors }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
