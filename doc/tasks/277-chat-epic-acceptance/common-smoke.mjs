// New assembled candidate only. Real hub/front/Git/HTTP/WS, fixture ACP only.
// Run through the machine queue: node common-smoke.mjs <exact-sha> <artifacts> [port].
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const candidate = process.argv[2];
const artifacts = path.resolve(process.argv[3] || '');
const port = Number(process.argv[4] || 18179);
if (!/^[0-9a-f]{40}$/.test(candidate || '') || !process.argv[3]) throw Error('Exact candidate and artifact directory required');
if (![18179, 18180].includes(port)) throw Error('Only new isolated common-smoke ports are allowed');
const command = (program, args, cwd = root) => {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error(`${program} failed: ${result.stderr}`);
  return result.stdout.trim();
};
if (command('git', ['rev-parse', 'HEAD']) !== candidate) throw Error('Candidate HEAD mismatch');
if (command('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'machines', 'scripts',
  'doc/tasks/277-chat-epic-acceptance/common-smoke.mjs', 'doc/tasks/277-chat-epic-acceptance/verify-common.ps1'])) throw Error('Dirty product or verification inputs');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const built = JSON.parse(fs.readFileSync(path.join(artifacts, 'build-attestation.json'), 'utf8').replace(/^\uFEFF/, ''));
if (built.candidate !== candidate || built.source_tree !== command('git', ['rev-parse', 'HEAD:src'])) throw Error('Build attestation does not bind this source');
if (built.hub_sha256 !== hash(path.join(root, 'target/crew-hub.exe')) || built.front_sha256 !== hash(path.join(root, 'target/crew-harness.exe'))) throw Error('Built binary changed');
const dir = path.join(artifacts, 'common-smoke');
if (fs.existsSync(dir)) throw Error('Use new artifacts; never overwrite old evidence');
await new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.once('error', reject);
  listener.listen(port, '127.0.0.1', () => listener.close(resolve));
});
fs.mkdirSync(dir);
const home = path.join(dir, 'home'), data = path.join(dir, 'data'), repo = path.join(dir, 'repo');
for (const folder of [home, data, repo]) fs.mkdirSync(folder);
const git = (...args) => command('git', ['-C', repo, ...args]);
git('init', '-b', 'main');
fs.writeFileSync(path.join(repo, 'fixture.txt'), 'isolated common smoke\n');
git('add', '--', 'fixture.txt');
git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-s', '--only', '-m', 'Fixture base', '--', 'fixture.txt');
git('branch', 'chosen');
const repoHead = git('rev-parse', 'HEAD');
const promptMarker = path.join(dir, 'fixture-prompts.jsonl');
const settings = {
  port, data_dir: data, store: 'files', workdir: repo,
  web_dir: path.join(root, 'src/web'), machines_dir: path.join(root, 'machines/product'),
  route_tool: false, route_children: false, idle_term_seconds: 15,
  agents: ['codex', 'second'].map(id => ({ id, label: `${id} (fixture only)`, program: process.execPath,
    args: [path.join(root, 'src/acp/testdata/fake_agent.mjs'), '--live', `--prompt-marker=${promptMarker}`] })),
  hub: { program: path.join(root, 'target/crew-hub.exe'), args: [] },
};
const config = path.join(dir, 'server.json');
fs.writeFileSync(config, JSON.stringify(settings));
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CREW_')));
environment.CREW_HOME = home;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
};
let front, page, serial = 0;
const allEvents = [];
async function start() {
  const output = fs.openSync(path.join(dir, 'front.log'), 'a');
  front = spawn(path.join(root, 'target/crew-harness.exe'), ['serve', config], {
    cwd: repo, env: environment, detached: true, stdio: ['ignore', output, output], windowsHide: true,
  });
  fs.closeSync(output);
  for (let i = 0; i < 150; i++) {
    if (front.exitCode !== null) throw Error('Owned front exited before health');
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await pause(100);
  }
  throw Error('Owned front health timeout');
}
function stop() {
  if (!front || front.exitCode !== null) return;
  // Only the still-owned isolated process tree; never a global process kill.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(front.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-front.pid, 'SIGTERM'); } catch {} }
}
async function connect() {
  const events = [], ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.onmessage = message => {
    const value = JSON.parse(message.data), batch = Array.isArray(value) ? value : [value];
    events.push(...batch); allEvents.push(...batch);
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return {
    events, close: () => ws.close(),
    send(kind, trace, input) { ws.send(JSON.stringify({ id: `common277-${++serial}`, trace, kind, input, step: 0, time: Date.now() })); },
    of: trace => events.filter(event => event.trace === trace),
    async wait(trace, kind, after = 0, predicate = () => true) {
      const deadline = Date.now() + 15000;
      do {
        const found = events.slice(after).find(event => event.trace === trace && event.kind === kind && predicate(event));
        if (found) return found;
        await pause(30);
      } while (Date.now() < deadline);
      return null;
    },
  };
}
const source = { family: 'codex', model: 'fake-model-b', effort: 'high' };
const normalized = value => String(value).replaceAll('\\', '/').toLowerCase();
try {
  await start(); page = await connect();
  page.send('session_created', 'common-plain', { agent: 'codex', name: 'Common isolated', folder: repo,
    branch: 'chosen', worktree: true, workspace_explicit: true, source, approvals: { codex: 'plan' } });
  await page.wait('common-plain', 'session_created');
  for (const turn of ['common-first', 'common-second']) {
    const after = page.events.length;
    page.send('user_message', 'common-plain', { text: 'mode', turn });
    check(`${turn}: actual ACP turn completes`, Boolean(await page.wait('common-plain', 'agent_done', after)));
    const events = page.events.slice(after).filter(event => event.trace === 'common-plain');
    const chunks = events.filter(event => event.kind === 'agent_chunk').map(event => event.input.text || '').join('');
    check(`${turn}: native model/effort/approval reached fixture`, chunks.includes('mode: plan model: fake-model-b effort: high'));
    const selected = events.findIndex(event => event.kind === 'agent_selected' && event.input.turn === turn
      && event.input.family === 'codex' && event.input.model === source.model && event.input.effort === source.effort);
    const firstChunk = events.findIndex(event => event.kind === 'agent_chunk');
    check(`${turn}: confirmed actual selection is causally bound before chunks`, selected >= 0 && firstChunk > selected);
  }
  const afterPwd = page.events.length;
  page.send('user_message', 'common-plain', { text: 'pwd', turn: 'common-cwd' });
  await page.wait('common-plain', 'agent_done', afterPwd);
  const cwdText = page.events.slice(afterPwd).filter(event => event.kind === 'agent_chunk').map(event => event.input.text || '').join('');
  check('projectless actual cwd is session-owned and does not inherit hub repository', Boolean(cwdText)
    && normalized(cwdText).includes(normalized(data)) && cwdText.includes('common-plain')
    && !normalized(cwdText).includes(normalized(repo)), cwdText);
  const created = page.of('common-plain').find(event => event.kind === 'session_created');
  check('projectless metadata has no project/branch/folder', created && !created.input.project_id && !created.input.folder && !created.input.branch);
  const afterAsk = page.events.length;
  page.send('user_message', 'common-plain', { text: 'ask', turn: 'common-question' });
  const question = await page.wait('common-plain', 'question_request', afterAsk);
  check('real front carries fixture question', Boolean(question));
  if (question) page.send('question_answer', 'common-plain', { request: question.input.request, skipped: false, answers: [{ index: 0, selected: ['JSON'], other: '' }] });
  check('question round-trip completes', Boolean(await page.wait('common-plain', 'agent_done', afterAsk)));
  const afterSlow = page.events.length;
  page.send('user_message', 'common-plain', { text: 'slow', turn: 'common-cancel' });
  await page.wait('common-plain', 'agent_chunk', afterSlow);
  page.send('cancel', 'common-plain', {});
  check('streaming cancellation traverses actual front/hub', Boolean(await page.wait('common-plain', 'cancel', afterSlow)));
  page.close(); stop(); await pause(500); await start(); page = await connect();
  const replay = await page.wait('common-plain', 'session_created');
  await page.wait('common-plain', 'question_resolved');
  check('restart preserves projectless identity and real history', replay && !replay.input.project_id && !replay.input.folder
    && page.of('common-plain').some(event => event.kind === 'user_message') && page.of('common-plain').some(event => event.kind === 'question_resolved'));
  check('synthetic project HEAD/branch/worktree remain unchanged', git('rev-parse', 'HEAD') === repoHead
    && git('branch', '--show-current') === 'main' && !git('worktree', 'list', '--porcelain').includes('detached'));
} catch (error) {
  check('common harness completed', false, error.stack);
} finally {
  page?.close(); stop();
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(allEvents, null, 2));
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ candidate, build: built, port, fixture_only: true, checks }, null, 2));
  console.log(`RESULT ${checks.filter(item => item.ok).length}/${checks.length}; only owned common contour stopped`);
  process.exitCode = checks.every(item => item.ok) ? 0 : 1;
}
