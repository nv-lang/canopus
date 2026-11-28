// Supplementary real-API checks of the existing isolated contour, only fixture agents.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2]);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'contour.json')));
const base = `http://127.0.0.1:${meta.port}`;
const pause = ms => new Promise(r => setTimeout(r, ms));
let serial = 0;
const checks = [], events = [];
function check(name, ok, detail = '') { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`); }
const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
ws.onmessage = m => { const x = JSON.parse(m.data); events.push(...(Array.isArray(x) ? x : [x])); };
function send(kind, trace, input) { ws.send(JSON.stringify({ id: `extra277-${++serial}`, trace, kind, input, step: 0, time: Date.now() })); }
async function wait(trace, kind, from = 0, ms = 15000) {
  const end = Date.now() + ms;
  do { const e = events.slice(from).find(e => e.trace === trace && e.kind === kind); if (e) return e; await pause(40); } while (Date.now() < end);
  throw Error(`timeout ${trace}/${kind}`);
}
const of = trace => events.filter(e => e.trace === trace);
function trace(id) { const f = path.join(meta.data, id, 'acp.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
try {
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  await wait('s-plain', 'cancel');
  check('restart replays projectless messages and resolved question on documented page wire', of('s-plain').some(e => e.kind === 'user_message') && of('s-plain').some(e => e.kind === 'question_resolved'));
  check('restart retains the actual native-answer text from fixture ACP', of('s-plain').some(e => e.kind === 'agent_chunk' && e.input.text.includes('JSON') && e.input.text.includes('accept')));
  check('restart retains explicit role and task weight metadata', of('s-weight').some(e => e.kind === 'session_preset' && e.input.role === 'dev' && e.input.weight === 'heavy'));
  check('restart retains pool source and empty-level selection without fallback', of('s-pool').some(e => e.kind === 'session_source' && e.input.pool === 'mix' && e.input.level === 'light'));
  const projects = (await (await fetch(base + '/api/projects')).json()).projects;
  const project = projects.find(p => p.name === 'Synthetic 277');
  send('session_created', 's-cold-extra', { agent: 'codex', name: 'Cold gate', project_id: project.id, worktree: false, workspace_explicit: true });
  await wait('s-cold-extra', 'session_model');
  const before = (trace('s-cold-extra').match(/initialize/g) || []).length;
  send('session_workspace', 's-cold-extra', { worktree: true, source_branch: 'refs/heads/chosen' });
  send('session_setting', 's-cold-extra', { family: 'codex', setting: 'mode', value: 'yolo' });
  await pause(500);
  check('ready-client and cold native-mode setting cannot bypass pending workspace', before > 0 && (trace('s-cold-extra').match(/initialize/g) || []).length === before && !trace('s-cold-extra').includes('session/prompt'));
  send('session_created', 's-image-extra', { agent: 'codex', name: 'Image', worktree: false, workspace_explicit: true });
  await wait('s-image-extra', 'session_created');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const upload = await fetch(base + '/api/session-image/s-image-extra', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png });
  const image = await upload.json();
  check('real image-upload API persists bytes', upload.status === 200 && image.n > 0);
  const downloaded = await fetch(base + `/api/session-image/s-image-extra/${image.n}`);
  check('real image-download API returns identical bytes', downloaded.status === 200 && Buffer.from(await downloaded.arrayBuffer()).equals(png));
  const from = events.length;
  send('user_message', 's-image-extra', { text: 'image probe', turn: 'image', images: [{ n: image.n, name: 'synthetic.png' }] });
  await wait('s-image-extra', 'agent_done', from);
  check('message attachment has durable metadata and honest unsupported-agent notice', of('s-image-extra').some(e => e.kind === 'message_images' && e.input.images.some(i => i.n === image.n && i.name === 'synthetic.png')) && of('s-image-extra').some(e => e.kind === 'images_skipped'));
  check('image bytes are never copied into page events', !JSON.stringify(events).includes(png.toString('base64')));
  send('session_route', 's-plain', { route: 'planning' });
  send('session_setting', 's-plain', { family: 'codex', setting: 'mode', value: 'yolo' });
  const prepBefore = (trace('s-plain').match(/initialize/g) || []).length;
  send('user_message', 's-plain', { text: 'PREP-EXTRA-NO-PROMPT', turn: 'prep-extra' });
  await pause(400);
  check('wide mode after switching a used projectless chat to Preparation creates no ACP prompt', !trace('s-plain').includes('PREP-EXTRA-NO-PROMPT') && (trace('s-plain').match(/initialize/g) || []).length === prepBefore);
} catch (error) { check('supplementary harness completed', false, error.stack); }
finally {
  ws.close();
  fs.writeFileSync(path.join(dir, 'api-extra-result.json'), JSON.stringify({ checks, pass: checks.filter(c=>c.ok).length, fail: checks.filter(c=>!c.ok).length }, null, 2));
  fs.writeFileSync(path.join(dir, 'api-extra-events.json'), JSON.stringify(events, null, 2));
  console.log(`RESULT ${checks.filter(c=>c.ok).length}/${checks.length}`);
  process.exitCode = checks.every(c=>c.ok) ? 0 : 1;
}
