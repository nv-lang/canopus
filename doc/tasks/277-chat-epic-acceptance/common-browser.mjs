// Narrow real-UI checks on the new owned common contour. No microphone/provider.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { portIsFree, stopOwnedFront } from './common-process.mjs';

const [candidate, directory, executable, portText, debugText = '19279'] = process.argv.slice(2);
const port = Number(portText), debugPort = Number(debugText);
if (!/^[0-9a-f]{40}$/.test(candidate || '') || !directory || !executable) throw Error('Exact candidate, artifacts and browser required');
if (![18179, 18180].includes(port) || ![19279, 19280].includes(debugPort)) throw Error('Only new isolated test ports are allowed');
const dir = path.join(path.resolve(directory), 'browser');
if (fs.existsSync(dir) || !await portIsFree(debugPort)) throw Error('Use a new browser profile and free debug port');
fs.mkdirSync(dir);
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--no-default-browser-check', `--user-data-dir=${path.join(dir, 'profile')}`, `--remote-debugging-port=${debugPort}`,
  '--remote-debugging-address=127.0.0.1', 'about:blank'], { detached: true, windowsHide: true, stdio: 'ignore' });
let launchError;
browser.once('error', error => { launchError = error; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], exceptions = [], frames = [], pending = new Map();
let ws, serial = 0;
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
};
async function call(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  const deadline = Date.now() + 15000;
  do { if (await evaluate(expression)) return; await pause(50); } while (Date.now() < deadline);
  throw Error(`UI condition timeout: ${expression}`);
}
async function click(expression) {
  const point = await evaluate(`(() => { const element=${expression}; if(!element) throw Error('Missing UI target');
    element.scrollIntoView({block:'nearest'}); const rect=element.getBoundingClientRect(), x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    const hit=document.elementFromPoint(x,y); if(element.disabled || !(element===hit || element.contains(hit))) throw Error('UI target not hit-testable'); return {x,y}; })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
}
async function screenshot(name) {
  const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(image.data, 'base64'));
}
try {
  let target;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw Error('Owned browser exited before debugging became available');
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) })).json()).find(item => item.type === 'page'); } catch {}
    if (target) break;
    await pause(100);
  }
  if (!target) throw Error('Owned browser debugging timeout');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = message => {
    const value = JSON.parse(message.data);
    if (value.id) {
      const waiting = pending.get(value.id); pending.delete(value.id);
      if (waiting) value.error ? waiting.reject(Error(value.error.message)) : waiting.resolve(value.result);
    } else if (value.method === 'Runtime.exceptionThrown') exceptions.push(value.params.exceptionDetails);
    else if (value.method === 'Network.webSocketFrameSent') {
      try { frames.push(JSON.parse(value.params.response.payloadData)); } catch {}
    }
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable']) await call(method);
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await until(`document.documentElement.hasAttribute('data-booted') && !!document.querySelector('.session-item')`);
  await click(`[...document.querySelectorAll('.session-item')].find(item=>item.querySelector('.session-name')?.textContent==='Common isolated')`);
  await until(`document.querySelectorAll('.agent-signature').length>=2`);
  const authors = await evaluate(`[...document.querySelectorAll('.agent-signature')].map(item=>item.textContent)`);
  check('actual reply authors are visible from journal snapshots', authors.length >= 2 && authors.every(text => text.includes('codex') && text.includes('fake-model-b') && text.includes('high')), JSON.stringify(authors));
  await screenshot('actual-authors');
  await click(`[...document.querySelectorAll('.group-actions button')].find(item=>item.getAttribute('aria-label')?.includes('Без проекта'))`);
  await until(`!!document.querySelector('.chat[data-draft="true"] #composer-input')`);
  const draftWhere = await evaluate(`document.querySelector('.where-note')?.textContent || ''`);
  check('projectless draft identifies session data rather than a project folder', draftWhere.includes('данных сессии') && !draftWhere.includes('папке проекта'), draftWhere);
  await evaluate(`(() => { const input=document.querySelector('#composer-input');input.value='common UI draft';input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  for (const width of [1024, 360]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 360 ? 800 : 768, deviceScaleFactor: 1, mobile: false });
    await click(`document.querySelector('.agent-picker-button')`);
    await until(`document.querySelector('.agent-picker-anchor > .menu')?.hidden===false`);
    const boxes = await evaluate(`(() => { const button=document.querySelector('.agent-picker-button').getBoundingClientRect(), menu=document.querySelector('.agent-picker-anchor > .menu').getBoundingClientRect();
      return {button:{x:button.x,right:button.right},menu:{x:menu.x,right:menu.right,y:menu.y,bottom:menu.bottom},width:innerWidth,models:document.querySelectorAll('.agent-picker-anchor .agent-model-row').length}; })()`);
    check(`${width}: draft picker fits and remains attached to its trigger`, boxes.menu.x >= 0 && boxes.menu.right <= width + 1
      && boxes.menu.y >= 0 && boxes.menu.x <= boxes.button.right && boxes.menu.right >= boxes.button.x, JSON.stringify(boxes));
    const unavailable = await evaluate(`(() => { const menu=document.querySelector('.agent-picker-anchor > .menu');return {
      text:menu.textContent,models:menu.querySelectorAll('.agent-model-row').length,
      families:[...menu.querySelectorAll('.menu-item')].map(row=>({text:row.textContent,disabled:row.disabled}))}; })()`);
    check(`${width}: stock unavailable cannot invent cold models and retains configured families`, unavailable.models === 0 && unavailable.families.every(row => row.disabled)
      && ['codex', 'second'].every(family => unavailable.families.some(row => row.text.includes(family) && row.disabled)), JSON.stringify(unavailable));
    await screenshot(`picker-${width}`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    check(`${width}: Escape restores the actual trigger focus`, await evaluate(`document.querySelector('.agent-picker-anchor > .menu').hidden && document.activeElement===document.querySelector('.agent-picker-button')`));
    check(`${width}: draft survives menu actions`, await evaluate(`document.querySelector('#composer-input').value==='common UI draft'`));
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  // A stock unavailable draft has no honest model rows. Slider/anchor checks use
  // only this fixture session's own saved options, never an invented cold catalog.
  await click(`[...document.querySelectorAll('.session-item')].find(item=>item.querySelector('.session-name')?.textContent==='Common isolated')`);
  await until(`!document.querySelector('.chat').hasAttribute('data-draft') || document.querySelector('.chat').dataset.draft!=='true'`);
  for (const width of [1024, 360]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 360 ? 800 : 768, deviceScaleFactor: 1, mobile: false });
    await click(`document.querySelector('.agent-picker-button')`);
    await until(`document.querySelector('.agent-picker-anchor > .menu')?.hidden===false`);
    const box = await evaluate(`(() => { const menu=document.querySelector('.agent-picker-anchor > .menu'),rect=menu.getBoundingClientRect(),button=document.querySelector('.agent-picker-button').getBoundingClientRect();return {
      x:rect.x,right:rect.right,y:rect.y,buttonX:button.x,buttonRight:button.right,
      models:[...menu.querySelectorAll('.agent-model-row')].map(row=>row.textContent)}; })()`);
    check(`${width}: own-session models and anchor remain viewport safe`, box.models.length > 0 && box.models.every(text => text.includes('codex'))
      && box.x >= 0 && box.right <= width + 1 && box.y >= 0 && box.x <= box.buttonRight && box.right >= box.buttonX, JSON.stringify(box));
    await screenshot(`own-session-picker-${width}`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    check(`${width}: own-session Escape restores trigger focus`, await evaluate(`document.querySelector('.agent-picker-anchor > .menu').hidden && document.activeElement===document.querySelector('.agent-picker-button')`));
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await click(`document.querySelector('.agent-picker-button')`);
  await click(`document.querySelector('.agent-model-row')`);
  const effort = [];
  for (const value of ['0', '1', '2']) effort.push(await evaluate(`(() => { const slider=document.querySelector('.effort-slider');slider.value=${JSON.stringify(value)};
    slider.dispatchEvent(new Event('input',{bubbles:true}));const parent=slider.parentElement;return {fill:slider.style.getPropertyValue('--effort-fill'),
      animations:parent.getAnimations({subtree:true}).map(item=>item.animationName),track:getComputedStyle(slider,'::-webkit-slider-runnable-track').backgroundImage,
      endpoint:getComputedStyle(slider).getPropertyValue('--effort-end').trim()}; })()`));
  check('effort fill follows only selected 0/50/100 percent', effort.map(item => item.fill).join(',') === '0%,50%,100%');
  check('stars animate at 50 percent and above', effort[1].animations.length > 0 && effort[2].animations.length > 0);
  // Chromium may report `none` for range pseudo computed background. Do not
  // mistake that API limitation for a measured rendered-color verdict. Resolve
  // the inherited endpoint and inspect the actual loaded rule; keep PNG evidence.
  const paint = await evaluate(`(() => { const slider=document.querySelector('.effort-slider'),ctx=document.createElement('canvas').getContext('2d');
    ctx.fillStyle=getComputedStyle(slider).getPropertyValue('--effort-end').trim();ctx.fillRect(0,0,1,1);
    const rules=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]);
    const track=rules.find(rule=>rule.selectorText==='.effort-slider::-webkit-slider-runnable-track');
    return {endpoint:[...ctx.getImageData(0,0,1,1).data],background:track?.style.background}; })()`);
  check('loaded slider rule uses the resolved purple endpoint (style evidence, not pixel measurement)', paint.background?.includes('var(--effort-end)')
    && paint.endpoint[0] > paint.endpoint[1] && paint.endpoint[2] > paint.endpoint[1], JSON.stringify({paint,effort}));
  await screenshot('effort-100');
  check('real product page has no runtime exceptions', exceptions.length === 0, JSON.stringify(exceptions));
  check('UI inspection did not send another user prompt', !frames.some(frame => frame.kind === 'user_message'));
} catch (error) {
  check('common browser completed', false, error.stack);
  if (ws?.readyState === 1) { try { await screenshot('error'); } catch {} }
} finally {
  ws?.close();
  try { await stopOwnedFront(browser, debugPort); }
  catch (error) { check('owned browser exit and port release confirmed', false, error.message); }
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ candidate, port, debugPort, checks, exceptions, frames }, null, 2));
  console.log(`RESULT ${checks.filter(item => item.ok).length}/${checks.length}; only owned browser cleanup attempted`);
  process.exitCode = checks.every(item => item.ok) ? 0 : 1;
}
