// Edge headless, new profile, no extension, package installation or microphone.
// node .../browser-cdp.mjs <contour-artifacts> <edge-executable> [cdp-port]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const dir = path.resolve(process.argv[2]), edge = process.argv[3], cdpPort = Number(process.argv[4] || 19277);
const contour = JSON.parse(fs.readFileSync(path.join(dir, 'contour.json')));
if (fs.existsSync(path.join(dir, 'browser-result.json'))) {
  const n = fs.readdirSync(dir).filter(f => /^browser-attempt-\d+\.json$/.test(f)).length + 1;
  fs.copyFileSync(path.join(dir, 'browser-result.json'), path.join(dir, `browser-attempt-${n}.json`));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = path.join(dir, 'edge-profile');
fs.mkdirSync(profile, { recursive: true });
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--no-default-browser-check',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const checks = [], errors = [], frames = [], metrics = [], clicks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`); };
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
  do { if (await evaluate(expression)) return true; await sleep(100); } while (Date.now() < end);
  throw Error(`UI condition timeout: ${expression}`);
}
async function click(selector) {
  const hit = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw Error('missing click target'); e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,t=document.elementFromPoint(x,y); return {x,y,disabled:e.disabled,hit:t?.outerHTML.slice(0,400),matched:e===t||e.contains(t)}; })()`);
  clicks.push({ selector, ...hit });
  if (!hit.matched || hit.disabled) throw Error(`click target unavailable: ${JSON.stringify(hit)}`);
  const box = { x: hit.x, y: hit.y };
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...box });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 });
}
async function key(key, code = key) {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}
async function shot(name) {
  const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(r.data, 'base64'));
}
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === 'page'); if (target) break; } catch {}
    await sleep(100);
  }
  if (!target) throw Error('isolated Edge did not expose its CDP page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = m => {
    const x = JSON.parse(m.data);
    if (x.id) { const p = pending.get(x.id); pending.delete(x.id); if (p) x.error ? p.reject(Error(x.error.message)) : p.resolve(x.result); }
    else if (x.method === 'Runtime.exceptionThrown') errors.push(x.params.exceptionDetails);
    else if (x.method === 'Network.webSocketFrameSent') { try { frames.push(JSON.parse(x.params.response.payloadData)); } catch {} }
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable']) await call(method);
  await call('Page.bringToFront');
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${contour.port}/` });
  await until(`document.documentElement.hasAttribute('data-booted') && !!document.querySelector('.group-actions button')`);
  await sleep(1000);
  await shot('initial-1024');
  // Select the real projectless new-chat button, not an injected model or mock page.
  const newLabel = await evaluate(`[...document.querySelectorAll('.group-actions button')].find(e=>e.getAttribute('aria-label')?.includes('Без проекта'))?.getAttribute('aria-label')`);
  if (!newLabel) throw Error('projectless new-chat button missing');
  await click(`[aria-label=${JSON.stringify(newLabel)}]`);
  await until(`!!document.querySelector('.chat[data-draft="true"] #composer-input')`);
  check('new chat is actual product draft', await evaluate(`document.querySelector('.chat').dataset.draft==='true' && document.querySelector('.project-picker')!==null`));
  await evaluate(`(() => { const t=document.querySelector('#composer-input'); t.value='сохранить черновик 277';t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  // Synthetic clipboard File, not the system clipboard or a microphone recording.
  await evaluate(`(() => { const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'synthetic.png',{type:'image/png'}));document.querySelector('#composer-input').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); })()`);
  await until(`document.querySelectorAll('.attach').length===1`);
  check('real composer accepts a synthetic clipboard image without sending', await evaluate(`document.querySelectorAll('.attach').length===1 && document.querySelector('#composer-input').value==='сохранить черновик 277'`));
  // Native default is explicitly not an owner selection.
  check('unset native approvals say native default', await evaluate(`document.querySelector('.family-approvals-button').textContent.includes('Родное умолчание')`));
  for (const width of [1024, 360]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 360 ? 800 : 768, deviceScaleFactor: 1, mobile: false });
    await sleep(150);
    const snapshot = await evaluate(`(() => { const r=e=>{const a=e.getBoundingClientRect();return {x:a.x,y:a.y,w:a.width,h:a.height,right:a.right,bottom:a.bottom}};return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,box:r(document.querySelector('.box')),input:r(document.querySelector('#composer-input')),status:r(document.querySelector('.composer-status')),agent:r(document.querySelector('.agent-picker-button')),approval:r(document.querySelector('.family-approvals-button')),mic:r(document.querySelector('.mic-btn')),groupButtons:document.querySelector('.status-group').children.length,adjacent:document.querySelector('.family-approvals').nextElementSibling?.querySelector('.mic-btn')!==null};})()`);
    metrics.push(snapshot);
    check(`${width}: one agent control and approvals immediately before microphone`, snapshot.groupButtons === 1 && snapshot.adjacent);
    check(`${width}: composer and text input fit viewport`, snapshot.box.x >= 0 && snapshot.box.right <= width + 1 && snapshot.input.w >= 40 && snapshot.mic.right <= width + 1, JSON.stringify(snapshot));
    await shot(`draft-${width}`);
    await click('.agent-picker-button');
    await until(`document.querySelector('.composer-status > .menu').hidden===false`);
    const popover = await evaluate(`(() => { const m=document.querySelector('.composer-status > .menu'),r=m.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,focus:document.activeElement.className,models:m.querySelectorAll('.agent-model-row').length}; })()`);
    check(`${width}: agent popover has real catalog and fits viewport`, popover.models > 0 && popover.x >= 0 && popover.right <= width + 1 && popover.y >= 0, JSON.stringify(popover));
    check(`${width}: popover is horizontally attached to its agent trigger`, popover.x <= snapshot.agent.right && popover.right >= snapshot.agent.x);
    await shot(`agent-${width}`);
    await key('Escape');
    check(`${width}: Escape closes agent menu and restores trigger focus`, await evaluate(`document.querySelector('.composer-status > .menu').hidden && document.activeElement===document.querySelector('.agent-picker-button')`));
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await click('.agent-picker-button');
  // Open a model's effort row without committing a choice; inspect 0/50/100%.
  await click('.agent-model-row');
  const effort = [];
  for (const value of ['0', '1', '2']) {
    effort.push(await evaluate(`(() => { const s=document.querySelector('.effort-slider');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('input',{bubbles:true}));const p=s.parentElement;return {value:s.value,fill:s.style.getPropertyValue('--effort-fill'),animations:p.getAnimations({subtree:true}).map(a=>a.animationName),children:[...p.children].map(e=>e.className),track:getComputedStyle(s,'::-webkit-slider-runnable-track').backgroundImage,accent:getComputedStyle(s).getPropertyValue('--accent')}; })()`));
  }
  fs.writeFileSync(path.join(dir, 'effort.json'), JSON.stringify(effort, null, 2));
  check('effort fill follows 0/50/100 percent', effort.map(e => e.fill).join(',') === '0%,50%,100%');
  check('effort >=50 percent has animated stars', effort[1].animations.length > 0 && effort[2].animations.length > 0, JSON.stringify(effort));
  await shot('effort-100'); await key('Escape');
  // Choose a real pool through the actual preset selector and keyboard search.
  await evaluate(`(() => { const p=document.querySelector('.preset-chip'); if(!p) throw Error('preset select missing');p.value='accept277';p.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await click('.agent-picker-button');
  await evaluate(`(() => { const s=document.querySelector('.menu-search');s.value='mix';s.dispatchEvent(new Event('input',{bubbles:true}));s.focus(); })()`);
  check('real agent search finds the configured pool', await evaluate(`document.querySelector('.composer-status > .menu').textContent.includes('mix')`));
  await key('Enter');
  await until(`document.querySelector('.agent-picker-button').textContent.includes('mix')`);
  const poolState = await evaluate(`({picker:document.querySelector('.agent-picker-button').textContent,approvals:document.querySelector('.family-approvals-button').textContent,images:document.querySelectorAll('.attach').length,text:document.querySelector('#composer-input').value})`);
  check('pool selection preserves text and image and exposes per-family native approvals', poolState.picker.includes('mix') && poolState.approvals==='По семьям' && poolState.images===1 && poolState.text==='сохранить черновик 277', JSON.stringify(poolState));
  await click('.project-row:not([data-project=""])');
  await click('.project-row[data-project=""]');
  check('project selection and return to projectless preserve agent source, draft text and image', await evaluate(`document.querySelector('.agent-picker-button').textContent.includes('mix') && document.querySelectorAll('.attach').length===1 && document.querySelector('#composer-input').value==='сохранить черновик 277'`));
  for (const width of [1024, 360]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: width===360?800:768, deviceScaleFactor: 1, mobile: false });
    await click('.draft-browse');
    await until(`!!document.querySelector('#picker-path') && document.querySelectorAll('.picker-item').length>0`);
    const dialogBox = await evaluate(`(() => {const r=document.querySelector('.dialog.picker').getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,height:innerHeight};})()`);
    check(`${width}: real folder dialog fits viewport`, dialogBox.x>=0 && dialogBox.right<=width+1 && dialogBox.y>=0 && dialogBox.bottom<=dialogBox.height+1, JSON.stringify(dialogBox));
    let trapped = true;
    for (let i=0;i<12;i++) { await key('Tab'); trapped = trapped && await evaluate(`document.querySelector('.dialog.picker').contains(document.activeElement)`); }
    check(`${width}: folder dialog traps keyboard focus`, trapped);
    await evaluate(`(() => {const s=document.querySelector('.picker-search');s.value='repo';s.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    check(`${width}: folder search filters actual directory API rows`, await evaluate(`document.querySelectorAll('.picker-list .picker-item').length===1 && document.querySelector('.picker-list').textContent.includes('repo')`));
    await shot(`folder-picker-${width}`);
    await key('Escape');
    check(`${width}: folder cancellation preserves text, image and pool`, await evaluate(`!document.querySelector('#picker-path') && document.querySelector('#composer-input').value==='сохранить черновик 277' && document.querySelectorAll('.attach').length===1 && document.querySelector('.agent-picker-button').textContent.includes('mix')`));
  }
  await click('.family-approvals-button');
  await until(`document.querySelector('.family-approvals-menu').hidden===false`);
  check('native menu exposes exact catalog mode ids', await evaluate(`[...document.querySelectorAll('.family-approvals-menu [role="menuitemradio"]')].some(e=>e.title.startsWith('plan'))`));
  await key('Escape');
  check('native menu Escape restores focus', await evaluate(`document.activeElement===document.querySelector('.family-approvals-button')`));
  check('no runtime exceptions in real product page', errors.length === 0, JSON.stringify(errors));
  check('draft probes never sent a user message', !frames.some(e => e.kind === 'user_message'));
} catch (error) {
  check('browser harness completed', false, error.stack);
  try { await shot('browser-error'); fs.writeFileSync(path.join(dir, 'browser-error.html'), await evaluate('document.documentElement.outerHTML')); } catch {}
}
finally {
  fs.writeFileSync(path.join(dir, 'browser-result.json'), JSON.stringify({ checks, errors, frames, metrics, clicks, pass: checks.filter(c=>c.ok).length, fail: checks.filter(c=>!c.ok).length }, null, 2));
  try { if (ws?.readyState === 1) await call('Browser.close'); } catch {}
  ws?.close(); browser.kill();
  console.log(`RESULT ${checks.filter(c=>c.ok).length}/${checks.length}`);
  process.exitCode = checks.every(c=>c.ok) ? 0 : 1;
}
