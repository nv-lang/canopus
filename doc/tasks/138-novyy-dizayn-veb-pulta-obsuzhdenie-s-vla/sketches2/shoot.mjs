// Снимок одного эскиза: node shoot.mjs <playwright-core-module-dir> <chrome-executable> <html-file> <query> <out.png>
// Только статические эскизы: без сервера продукта; разрешены обращения file: (шрифты лежат рядом).
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const [moduleDir, executablePath, htmlFile, query, outPng] = process.argv.slice(2);
if (!moduleDir || !executablePath || !htmlFile || !outPng) throw new Error('Required: module dir, chrome exe, html file, query, out png');
const require = createRequire(path.join(path.resolve(moduleDir), 'noop.js'));
const { chromium } = require('playwright-core');
const root = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await page.goto(pathToFileURL(path.join(root, htmlFile)).href + (query || ''));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(root, outPng) });
  console.log(JSON.stringify({ errors }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
