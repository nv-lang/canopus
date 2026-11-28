// Real front/hub HTTP+WS acceptance probe; every ACP process is explicitly a fixture.
// node doc/tasks/277-chat-epic-acceptance/contour.mjs <new-artifact-directory> [port]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 18177);
if (fs.existsSync(path.join(dir, 'server.json'))) throw Error('Use a new isolated artifact directory');
fs.mkdirSync(dir, { recursive: true });
const home = path.join(dir, 'home'), data = path.join(dir, 'data'), repo = path.join(dir, 'repo');
for (const folder of [home, data, repo, path.join(home, 'config/presets')]) fs.mkdirSync(folder, { recursive: true });
const git = (...args) => {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout.trim();
};
git('init', '-b', 'main');
fs.writeFileSync(path.join(repo, 'base.txt'), 'synthetic fixture\n');
git('add', '--', 'base.txt');
git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'Fixture base');
git('branch', 'chosen');
const head = git('rev-parse', 'HEAD');
fs.writeFileSync(path.join(home, 'config/presets/accept277.json'), JSON.stringify({ roles: {
  dev: { default: { family: 'codex', model: 'fake-model', effort: 'medium' }, by_weight: { heavy: { family: 'codex', model: 'fake-model-b', effort: 'high' } } },
}, pools: { mix: { heavy: [{ family: 'codex', model: 'fake-model-b', effort: 'high', active: true }], light: [] } } }));
const settings = { port, data_dir: data, store: 'files', workdir: dir,
  web_dir: path.join(root, 'src/web'), machines_dir: path.join(root, 'machines/product'),
  route_tool: false, route_children: false, idle_term_seconds: 15,
  voice: { managed: false, url: 'http://127.0.0.1:19377/inference' },
  agents: ['codex', 'second'].map(id => ({ id, label: `${id} (fixture only)`, program: process.execPath,
    args: [path.join(root, 'src/acp/testdata/fake_agent.mjs'), '--live', `--prompt-marker=${path.join(dir, 'prompts.jsonl')}`] })),
  hub: { program: path.join(root, 'target/crew-hub.exe'), args: [] } };
const config = path.join(dir, 'server.json');
fs.writeFileSync(config, JSON.stringify(settings));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CREW_')));
env.CREW_HOME = home;
const pause = ms => new Promise(r => setTimeout(r, ms));
let front;
async function start() {
  const out = fs.openSync(path.join(dir, 'front.log'), 'a');
  front = spawn(path.join(root, 'target/crew-harness.exe'), ['serve', config], { cwd: dir, env, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  front.unref(); fs.closeSync(out);
  fs.writeFileSync(path.join(dir, 'contour.json'), JSON.stringify({ candidate: '73c97b5f3cda582831575a5133bc3375cba3e932', port, pid: front.pid, config, root, data, repo, home }, null, 2));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await pause(100);
  }
  throw Error('isolated front did not become healthy; inspect front.log');
}
function stop() { if (front?.pid) spawnSync('taskkill', ['/PID', String(front.pid), '/T', '/F'], { windowsHide: true }); }
let serial = 0;
async function page() {
  const events = [], ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.onmessage = m => { const x = JSON.parse(m.data); events.push(...(Array.isArray(x) ? x : [x])); };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return { events, close: () => ws.close(), send(kind, trace, input) {
    const id = `probe277-${++serial}`;
    ws.send(JSON.stringify({ id, trace, kind, input, step: 0, time: Date.now() })); return id;
  }, async wait(trace, kind, pred = () => true, from = 0, ms = 12000) {
    const until = Date.now() + ms;
    do { const e = events.slice(from).find(e => e.trace === trace && e.kind === kind && pred(e)); if (e) return e; await pause(30); } while (Date.now() < until);
    return null;
  }, of: trace => events.filter(e => e.trace === trace) };
}
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`); }
const traceText = id => { const f = path.join(data, id, 'acp.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
async function request(url, input) { const r = await fetch(`http://127.0.0.1:${port}${url}`, input); return { status: r.status, body: await r.json() }; }
let a;
try {
  await start(); a = await page();
  const project = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Synthetic 277', folders: [{ path: repo.replaceAll('\\', '/') }], worktrees_dir: 'trees', env: '' }) });
  check('project API creates a real fixture', project.status === 201);
  const projectId = project.body.id;
  const listing = await request(`/api/fs/list?path=${encodeURIComponent(dir)}`);
  check('folder API lists real directories', listing.status === 200 && JSON.stringify(listing.body).includes('repo'));
  const presets = await request('/api/presets');
  check('preset API reads isolated pools and roles', JSON.stringify(presets.body).includes('accept277'));
  a.send('session_created', 's-direct', { agent: 'codex', name: 'Direct', worktree: false, workspace_explicit: true,
    source: { family: 'codex', model: 'fake-model-b', effort: 'high' }, approvals: { codex: 'plan' } });
  await a.wait('s-direct', 'session_created');
  a.send('user_message', 's-direct', { text: 'mode', turn: 'direct' });
  await a.wait('s-direct', 'agent_done');
  const chunks = id => a.of(id).filter(e => e.kind === 'agent_chunk').map(e => e.input.text).join('');
  check('first-message direct source and native approval reach actual fixture prompt', chunks('s-direct').includes('mode: plan model: fake-model-b effort: high'));
  a.send('session_created', 's-weight', { agent: 'codex', name: 'Weighted', preset: 'accept277', role: 'dev', weight: 'heavy', worktree: false });
  a.send('user_message', 's-weight', { text: 'mode', turn: 'weight' });
  await a.wait('s-weight', 'agent_done');
  check('role and explicit task weight select exact native model/effort', chunks('s-weight').includes('model: fake-model-b effort: high'));
  a.send('session_created', 's-pool', { agent: 'codex', name: 'Pool', preset: 'accept277', source: { pool: 'mix', level: 'heavy' }, approvals: { codex: 'plan' }, worktree: false });
  a.send('user_message', 's-pool', { text: 'mode', turn: 'pool' });
  await a.wait('s-pool', 'agent_done');
  check('first-message pool plus per-family approvals reach confirmed ACP', chunks('s-pool').includes('mode: plan model: fake-model-b effort: high'));
  a.send('session_source', 's-pool', { pool: 'mix', level: 'light' });
  a.send('user_message', 's-pool', { text: 'EMPTY-MUST-NOT-PROMPT', turn: 'empty' });
  await a.wait('s-pool', 'error', e => JSON.stringify(e).includes('no active available'));
  check('empty pool refuses without prompt', !traceText('s-pool').includes('EMPTY-MUST-NOT-PROMPT'));
  a.send('session_setting', 's-direct', { family: 'codex', setting: 'mode', value: 'invalid-explicit-277' });
  a.send('user_message', 's-direct', { text: 'INVALID-MUST-NOT-PROMPT', turn: 'invalid' });
  await pause(1000);
  check('invalid explicit approval blocks dispatch', !traceText('s-direct').includes('INVALID-MUST-NOT-PROMPT'));
  a.send('session_created', 's-prep', { agent: 'codex', name: 'Preparation', route: 'planning', worktree: true,
    project_id: projectId, source_branch: 'refs/heads/chosen', approvals: { codex: 'yolo' } });
  a.send('session_setting', 's-prep', { family: 'codex', setting: 'mode', value: 'yolo' });
  a.send('route_run', 's-prep', {});
  a.send('user_message', 's-prep', { text: 'PREP-MUST-NOT-PROMPT', turn: 'prep' });
  await pause(500);
  check('preparation wide native mode starts no ACP and no worktree', !traceText('s-prep').includes('initialize') && !git('worktree', 'list', '--porcelain').includes('detached'));
  a.send('session_created', 's-ws', { agent: 'codex', name: 'Workspace', project_id: projectId, worktree: true,
    workspace_explicit: true, source_branch: 'refs/heads/chosen', source: { family: 'codex', model: 'fake-model-b', effort: 'high' }, approvals: { codex: 'plan' } });
  await a.wait('s-ws', 'session_created');
  check('explicit pending workspace creates no transient ACP in main', !traceText('s-ws').includes('initialize'));
  a.send('user_message', 's-ws', { text: 'pwd', turn: 'ws' });
  await a.wait('s-ws', 'agent_done');
  const where = a.of('s-ws').filter(e => e.kind === 'route_state' && e.input.where?.worktree).at(-1)?.input.where;
  check('workspace first prompt uses a detached copy, not main', Boolean(where?.worktree) && chunks('s-ws').replaceAll('\\', '/').includes(where.worktree.replaceAll('\\', '/')));
  check('workspace leaves project HEAD and branch unchanged', git('rev-parse', 'HEAD') === head && git('branch', '--show-current') === 'main');
  fs.writeFileSync(path.join(dir, 'blocked'), 'not a directory');
  const blocked = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Blocked 277', folders: [{ path: repo.replaceAll('\\', '/') }], worktrees_dir: 'blocked', env: '' }) });
  a.send('session_created', 's-fail', { agent: 'codex', name: 'Failed workspace', project_id: blocked.body.id, worktree: true, workspace_explicit: true });
  const failId = a.send('user_message', 's-fail', { text: 'FAILURE-MUST-NOT-PROMPT', turn: 'failure' });
  await a.wait('s-fail', 'error', () => true, 0, 20000);
  check('real Git worktree failure does not prompt main', !traceText('s-fail').includes('FAILURE-MUST-NOT-PROMPT') && !a.of('s-fail').some(e => e.kind === 'user_message'));
  check('workspace failure returns correlated negative delivery receipt', Boolean(await a.wait('s-fail', 'message_delivery', e => e.input.client_id === failId && e.input.accepted === false, 0, 2000)));
  a.send('session_created', 's-plain', { agent: 'codex', name: 'No project', folder: repo, branch: 'chosen', worktree: true, workspace_explicit: true });
  a.send('user_message', 's-plain', { text: 'ask', turn: 'ask' });
  const q = await a.wait('s-plain', 'question_request');
  check('real API carries native question form', Boolean(q));
  if (q) a.send('question_answer', 's-plain', { request: q.input.request, skipped: false, answers: [{ index: 0, selected: ['JSON'], other: '' }] });
  await a.wait('s-plain', 'agent_done');
  check('question answer returns through actual ACP', chunks('s-plain').includes('ask:'));
  const prior = a.events.length;
  a.send('user_message', 's-plain', { text: 'slow', turn: 'slow' });
  await a.wait('s-plain', 'agent_chunk', () => true, prior);
  a.send('cancel', 's-plain', {});
  check('actual streaming turn is cancellable', Boolean(await a.wait('s-plain', 'cancel', () => true, prior)));
  const createdPlain = a.of('s-plain').find(e => e.kind === 'session_created');
  check('projectless input cannot inherit repository metadata', createdPlain && !createdPlain.input.project_id && !createdPlain.input.folder && !createdPlain.input.branch);
  fs.writeFileSync(path.join(dir, 'api-before-restart.json'), JSON.stringify(a.events, null, 2));
  a.close(); stop(); await pause(500); await start(); a = await page();
  await a.wait('s-plain', 'session_created');
  // The page contract projects journal question_answer as question_resolved.
  await a.wait('s-plain', 'question_resolved');
  check('restart replays projectless history and question resolution', a.of('s-plain').some(e => e.kind === 'user_message') && a.of('s-plain').some(e => e.kind === 'question_resolved'));
  const againPlain = a.of('s-plain').find(e => e.kind === 'session_created');
  check('restart preserves no-project identity', againPlain && !againPlain.input.project_id && !againPlain.input.folder);
  const restartFrom = a.events.length;
  a.send('user_message', 's-direct', { text: 'INVALID-RESTART-MUST-NOT-PROMPT', turn: 'invalid-restart' });
  await a.wait('s-direct', 'error', () => true, restartFrom);
  check('restart does not replace invalid native intent by broad default', !traceText('s-direct').includes('INVALID-RESTART-MUST-NOT-PROMPT'));
  a.send('session_setting', 's-direct', { family: 'codex', setting: 'mode', value: 'plan' });
  a.send('user_message', 's-direct', { text: 'mode', turn: 'recovered' });
  await a.wait('s-direct', 'agent_done', () => true, restartFrom);
  check('explicit valid approval recovers exact persisted direct source', chunks('s-direct').includes('mode: plan model: fake-model-b effort: high'));
  fs.writeFileSync(path.join(dir, 'api-after-restart.json'), JSON.stringify(a.events, null, 2));
} catch (error) { check('harness completed', false, error.stack); }
finally {
  a?.close();
  fs.writeFileSync(path.join(dir, 'api-result.json'), JSON.stringify({ checks, pass: checks.filter(c => c.ok).length, fail: checks.filter(c => !c.ok).length }, null, 2));
  console.log(`RESULT ${checks.filter(c => c.ok).length}/${checks.length}; isolated contour left running on ${port}`);
  process.exitCode = checks.every(c => c.ok) ? 0 : 1;
}
