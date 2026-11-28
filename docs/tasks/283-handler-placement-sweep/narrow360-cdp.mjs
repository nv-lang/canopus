// narrow360-cdp.mjs — the 360px narrow-screen check of the 8100 picker (task 268, F-06):
// new chat opens, the agent picker opens, the menu is clamped inside the viewport,
// the effort sliders are present. Standalone: own Edge headless profile, own CDP port.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const cdpPort = 19331;
const url = 'http://127.0.0.1:8100/';
const profile = path.join(process.env.TEMP || path.resolve('.'), 'edge-360-profile');
fs.mkdirSync(profile, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`,
  '--remote-debugging-address=127.0.0.1', '--window-size=360,800', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
let ws, serial = 0;
const pending = new Map();
async function call(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout ${method}`)); }, 20000);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, ms = 15000) {
  const end = Date.now() + ms;
  do { if (await evaluate(expression)) return true; await sleep(150); } while (Date.now() < end);
  throw Error(`UI timeout: ${expression}`);
}
// wait for CDP
let attached = false;
for (let i = 0; i < 60 && !attached; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${cdpPort}/json`).then(r => r.json());
    const page = list.find(t => t.type === 'page');
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const entry = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) entry.reject(Error(msg.error.message || 'CDP error')); else entry.resolve(msg.result ?? msg);
        }
      });
      await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
      attached = true;
    }
  } catch { await sleep(500); }
}
if (!attached) {
  console.log('FAIL cdp attach');
  console.log('edge alive?', Boolean(browser.pid));
  try { console.log('cdp /json:', await fetch('http://127.0.0.1:' + cdpPort + '/json/version').then(r => r.text()).then(t => t.slice(0, 120))); } catch (e) { console.log('cdp /json error:', String(e).slice(0, 120)); }
  browser.kill();
  process.exit(1);
}
await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 0, mobile: false });
await call('Page.navigate', { url });
await sleep(4000);
await until(`document.title.includes('Пульт')`);
// open the new-chat view: click the first new-session button present
await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Новая сессия/.test(x.title||x.getAttribute('aria-label')||'')); if(b) b.click(); })()`);
await sleep(1200);
await until(`!!document.querySelector('.agent-picker-button')`);
// open the agent picker
await evaluate(`document.querySelector('.agent-picker-button').click()`);
await sleep(1000);
await until(`!!document.querySelector('.agent-picker-anchor .menu')`);
const clamp = await evaluate(`(() => {
  const m = document.querySelector('.agent-picker-anchor .menu');
  const r = m.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  return { left: Math.round(r.left), right: Math.round(r.right), vw, inside: r.left >= 0 && r.right <= vw };
})()`);
check('menu inside 360 viewport', clamp.inside, JSON.stringify(clamp));
const rows = await evaluate(`document.querySelectorAll('.agent-picker-anchor .menu .agent-model-row, .agent-picker-anchor .menu .menu-item').length`);
check('model rows rendered', rows > 0, String(rows));
const sliders = await evaluate(`document.querySelectorAll('.agent-picker-anchor .menu .effort-slider').length`);
check('effort sliders rendered', sliders > 0, String(sliders));
const searchBar = await evaluate(`(() => { const s=document.querySelector('.agent-picker-anchor .menu input[type="search"], .agent-picker-anchor .menu input[placeholder*="Поиск"]'); if(!s) return null; const r=s.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), vw: document.documentElement.clientWidth }; })()`);
check('search box inside viewport', searchBar && searchBar.left >= 0 && searchBar.right <= searchBar.vw, JSON.stringify(searchBar));
console.log('DONE');
browser.kill();
process.exit(0);
