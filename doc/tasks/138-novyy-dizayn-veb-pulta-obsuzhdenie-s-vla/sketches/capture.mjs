// Только статические эскизы: без сервера продукта, WebSocket, агентов и БД.
// node capture.mjs <playwright-module> <chrome-executable>
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const [modulePath, executablePath] = process.argv.slice(2);
if (!modulePath || !executablePath) throw new Error('Required: playwright module and Chrome executable');
const { chromium } = await import(pathToFileURL(path.resolve(modulePath)));
const root = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Единственные разрешённые обращения — к локальным файлам самого эскиза.
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  for (const design of ['claude', 'codex', 'studio']) {
    await page.goto(`${pathToFileURL(path.join(root, 'index.html'))}?design=${design}`);
    await page.waitForFunction(value => document.documentElement.dataset.design === value, design);
    await page.screenshot({ path: path.join(root, `${design}.png`) });
    const clipping = await page.evaluate(() => [...document.querySelectorAll('.thread, .sidebar, .inspector')].map(el => ({
      area: el.className, scroll: el.scrollHeight, height: el.clientHeight,
    })));
    console.log(JSON.stringify({ design, clipping }));
  }
  await fs.writeFile(path.join(root, 'capture.json'), JSON.stringify({ viewport: [1440, 1000], errors, purpose: 'Статические эскизы, не доказательство реализации или browser acceptance' }, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
