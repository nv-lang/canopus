// node src/web/test/session-tree-browser.mjs <playwright/index.mjs> <chromium>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const web = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { chromium } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (!name) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="ru"><link rel="stylesheet" href="/app.css"><body><div id="app"><aside id="side"></aside><main id="main"></main><aside id="rail"></aside><footer id="status"></footer><div id="overlay"></div></div></body></html>');
    return;
  }
  const file = path.resolve(web, name);
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.argv[3], headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack));
  const mount = async () => {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { createView } = await import('/view.js');
      const { initialModel, reduce } = await import('/state.js');
      let model = initialModel();
      for (let i = 0; i < 75; i++) {
        const id = i === 1 || i === 2 ? `root-c${i}` : i === 0 ? 'root' : `s${i}`;
        model = reduce(model, { id: `e${i}`, trace: id, step: 0, time: i + 1, kind: 'session_created',
          input: { name: id, agent: 'codex', parent: i === 1 || i === 2 ? 'root' : '', project_id: i < 3 ? 'p' : i < 74 ? 'q' : '',
            waiting_reason: i === 1 ? 'ждёт ответа владельца' : i === 2 ? 'занята другим ходом' : '' } });
      }
      const refs = Object.fromEntries(['app', 'side', 'main', 'rail', 'status', 'overlay'].map(k => [k, document.getElementById(k)]));
      const ui = { projects: [{ id: 'p', name: 'Первый', folders: [] }, { id: 'q', name: 'Второй', folders: [] }], pins: {}, theme: 'system' };
      const view = createView(document, refs, { agents: [{ id: 'codex' }], now: () => 100,
        handlers: { queued: () => 0, queuedItems: () => [], onSelect: id => { location.hash = `s=${id}`; ui.selected = id; view.render(model, ui, { state: 'connected' }); } } });
      view.render(model, ui, { state: 'connected' });
    });
  };
  await mount();
  assert.equal(await page.locator('.group[data-project="true"]').count(), 2);
  assert.equal(await page.locator('.session[data-depth="1"]').count(), 2);
  assert.equal(await page.locator('.session-child-count').textContent(), '2');
  const first = page.locator('.group[data-project="true"]').first();
  await first.locator('.fold-btn').click();
  assert.equal(await first.locator('.session').count(), 1);
  assert.equal(await first.locator('.session-glyph').getAttribute('data-glyph'), 'question');
  await mount();
  assert.equal(await first.locator('.session').count(), 1);
  await first.locator('.fold-btn').click();
  await first.locator('.session-item').nth(1).click();
  assert.match(page.url(), /#s=root-c2$/);
  await first.locator('.group-toggle').click();
  await mount();
  assert.equal(await first.locator('.group-list').isVisible(), false);
  await page.locator('.search input').fill('root-c1');
  assert.equal(await page.locator('.session').count(), 1);
  assert.equal(await page.locator('.session-item').isVisible(), true);
  await page.locator('.search input').fill('');
  assert.equal(await first.locator('.group-list').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: Chromium, 75 sessions, project sections, children, persisted folds, search, #s navigation; no page errors');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
