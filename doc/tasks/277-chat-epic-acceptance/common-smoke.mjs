// New assembled candidate only. Real hub/front/Git/HTTP/WS, fixture ACP only.
// Run through the machine queue: node common-smoke.mjs <exact-sha> <artifacts> [port] [browser-executable].
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { portIsFree, stopOwnedFront } from './common-process.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const candidate = process.argv[2];
const artifacts = path.resolve(process.argv[3] || '');
const port = Number(process.argv[4] || 18179);
const browserExecutable = process.argv[5];
if (!/^[0-9a-f]{40}$/.test(candidate || '') || !process.argv[3]) throw Error('Exact candidate and artifact directory required');
if (![18179, 18180].includes(port)) throw Error('Only new isolated common-smoke ports are allowed');
// Test fixtures themselves must not inherit this checkout's Git context.
for (let at = artifacts; ; at = path.dirname(at)) {
  if (fs.existsSync(path.join(at, '.git'))) throw Error('Common artifacts must be outside existing Git repositories');
  if (path.dirname(at) === at) break;
}
const command = (program, args, cwd = root) => {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error(`${program} failed: ${result.stderr}`);
  return result.stdout.trim();
};
if (command('git', ['rev-parse', 'HEAD']) !== candidate) throw Error('Candidate HEAD mismatch');
if (command('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'machines', 'scripts',
  'doc/tasks/277-chat-epic-acceptance/common-smoke.mjs', 'doc/tasks/277-chat-epic-acceptance/common-process.mjs',
  'doc/tasks/277-chat-epic-acceptance/common-process.test.mjs', 'doc/tasks/277-chat-epic-acceptance/common-browser.mjs',
  'doc/tasks/277-chat-epic-acceptance/verify-common.ps1'])) throw Error('Dirty product or verification inputs');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const built = JSON.parse(fs.readFileSync(path.join(artifacts, 'build-attestation.json'), 'utf8').replace(/^\uFEFF/, ''));
if (built.candidate !== candidate || built.source_tree !== command('git', ['rev-parse', 'HEAD:src'])) throw Error('Build attestation does not bind this source');
if (built.hub_sha256 !== hash(path.join(root, 'target/crew-hub.exe')) || built.front_sha256 !== hash(path.join(root, 'target/crew-harness.exe'))) throw Error('Built binary changed');
if (built.preparation_sha256 !== hash(path.join(root, 'src/server/preparation-agent.mjs'))) throw Error('Restricted runtime asset changed');
const dir = path.join(artifacts, 'common-smoke');
if (fs.existsSync(dir)) throw Error('Use new artifacts; never overwrite old evidence');
if (!await portIsFree(port)) throw Error('New isolated port is occupied; never adopt its server');
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
  voice: { managed: false, url: 'http://127.0.0.1:19379/inference' },
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
const dispatched = [];
async function start() {
  if (!await portIsFree(port)) throw Error('Restart port is occupied; refusing health from another front');
  const output = fs.openSync(path.join(dir, 'front.log'), 'a');
  front = spawn(path.join(root, 'target/crew-harness.exe'), ['serve', config], {
    cwd: repo, env: environment, detached: true, stdio: ['ignore', output, output], windowsHide: true,
  });
  let launchError;
  front.once('error', error => { launchError = error; });
  fs.closeSync(output);
  for (let i = 0; i < 150; i++) {
    if (launchError) throw launchError;
    if (front.exitCode !== null) throw Error('Owned front exited before health');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && front.exitCode === null && front.signalCode === null) return;
    } catch {}
    await pause(100);
  }
  throw Error('Owned front health timeout');
}
async function stop() { if (front) await stopOwnedFront(front, port); }
async function connect() {
  const events = [], ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.onmessage = message => {
    const value = JSON.parse(message.data), batch = Array.isArray(value) ? value : [value];
    events.push(...batch); allEvents.push(...batch);
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const replayDeadline = Date.now() + 15000;
  while (!events.some(event => event.kind === 'sessions_ready') && Date.now() < replayDeadline) await pause(30);
  if (!events.some(event => event.kind === 'sessions_ready')) { ws.close(); throw Error('Initial session replay did not complete'); }
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
const realFolder = value => { try { return normalized(fs.realpathSync.native(value)); } catch { return ''; } };
try {
  await start();
  const metadataResponse = await fetch(`http://127.0.0.1:${port}/api/model-metadata`, { signal: AbortSignal.timeout(2000) });
  const metadata = await metadataResponse.json();
  check('stock model metadata honestly refuses an unverified native context', metadataResponse.status === 200
    && metadata.status === 'unavailable' && metadata.reason === 'same_context_binding_unverified'
    && metadata.complete === false && metadata.permissions_status === 'blocked'
    && Array.isArray(metadata.models) && metadata.models.length === 0);
  const foreignMetadata = await fetch(`http://127.0.0.1:${port}/api/model-metadata`, {
    headers: { Origin: 'http://foreign.example' }, signal: AbortSignal.timeout(2000),
  });
  check('model metadata refuses a foreign origin', foreignMetadata.status === 403);
  page = await connect();
  page.send('session_created', 'common-plain', { agent: 'codex', name: 'Common isolated', folder: repo,
    branch: 'chosen', worktree: true, workspace_explicit: true, source, approvals: { codex: 'plan' } });
  await page.wait('common-plain', 'session_created');
  for (const turn of ['common-first', 'common-second']) {
    const after = page.events.length;
    page.send('user_message', 'common-plain', { text: 'mode', turn });
    const completed = await page.wait('common-plain', 'agent_done', after);
    check(`${turn}: actual ACP turn completes`, Boolean(completed));
    const canonicalTurn = completed?.input.turn;
    const events = page.events.slice(after).filter(event => event.trace === 'common-plain');
    const chunks = events.filter(event => event.kind === 'agent_chunk').map(event => event.input.text || '').join('');
    check(`${turn}: native model/effort/approval reached fixture`, chunks.includes('mode: plan model: fake-model-b effort: high'));
    const selected = events.findIndex(event => event.kind === 'agent_actual' && typeof canonicalTurn === 'string' && canonicalTurn
      && event.input.turn === canonicalTurn && event.input.turn_id === canonicalTurn
      && typeof event.input.dispatch_id === 'string' && event.input.dispatch_id
      && event.input.family === 'codex' && event.input.model === source.model && event.input.effort === source.effort);
    const firstChunk = events.findIndex(event => event.kind === 'agent_chunk');
    check(`${turn}: confirmed actual selection is causally bound before chunks`, selected >= 0 && firstChunk > selected
      && events[firstChunk].input.turn === canonicalTurn);
    if (selected >= 0) dispatched.push(events[selected].input);
  }
  check('two unchanged-model dispatches have distinct causal audit ids', dispatched.length === 2
    && dispatched[0].turn !== dispatched[1].turn && dispatched[0].dispatch_id !== dispatched[1].dispatch_id);
  const afterPwd = page.events.length;
  page.send('user_message', 'common-plain', { text: 'pwd', turn: 'common-cwd' });
  await page.wait('common-plain', 'agent_done', afterPwd);
  const cwdText = page.events.slice(afterPwd).filter(event => event.kind === 'agent_chunk').map(event => event.input.text || '').join('');
  const reportedCwd = /^cwd: (.+)$/m.exec(cwdText)?.[1]?.trim();
  const actualCwd = reportedCwd ? realFolder(reportedCwd) : '';
  const expectedCwd = realFolder(path.join(data, 'common-plain'));
  check('projectless actual cwd is the exact session folder rather than the hub repository', Boolean(actualCwd)
    && Boolean(expectedCwd) && actualCwd === expectedCwd && actualCwd !== realFolder(repo), cwdText);
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
  const expectedMessages = page.of('common-plain').filter(event => event.kind === 'user_message').map(event => event.input.text).sort();
  page.close(); await stop(); await start(); page = await connect();
  const replay = await page.wait('common-plain', 'session_created');
  await page.wait('common-plain', 'question_resolved');
  check('restart preserves projectless identity and real history', replay && !replay.input.project_id && !replay.input.folder
    && page.of('common-plain').some(event => event.kind === 'user_message') && page.of('common-plain').some(event => event.kind === 'question_resolved'));
  const replayedMessages = page.of('common-plain').filter(event => event.kind === 'user_message').map(event => event.input.text).sort();
  check('restart replays every distinct original message with exact multiplicity', new Set(expectedMessages).size >= 2
    && JSON.stringify(replayedMessages) === JSON.stringify(expectedMessages), JSON.stringify({expectedMessages,replayedMessages}));
  check('restart replays the same per-turn confirmed actual snapshots', dispatched.length === 2 && dispatched.every(actual =>
    page.of('common-plain').some(event => event.kind === 'agent_actual' && event.input.turn === actual.turn
      && event.input.dispatch_id === actual.dispatch_id && event.input.family === actual.family
      && event.input.model === actual.model && event.input.effort === actual.effort)));
  if (browserExecutable) {
    const log = fs.openSync(path.join(dir, 'browser.log'), 'w');
    const browserRun = spawn(process.execPath, [path.join(root, 'doc/tasks/277-chat-epic-acceptance/common-browser.mjs'),
      candidate, dir, browserExecutable, String(port)], { cwd: root, windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    const browserCode = await new Promise((resolve, reject) => { browserRun.once('error', reject); browserRun.once('exit', resolve); });
    check('real browser narrow controls passed on this owned contour', browserCode === 0, `exit=${browserCode}`);
  } else {
    check('real browser checks were requested for the common candidate', false, 'No browser executable supplied; API-only results are not UI proof');
  }
  check('synthetic project HEAD/branch/worktree remain unchanged', git('rev-parse', 'HEAD') === repoHead
    && git('branch', '--show-current') === 'main' && !git('worktree', 'list', '--porcelain').includes('detached'));
} catch (error) {
  check('common harness completed', false, error.stack);
} finally {
  page?.close();
  try { await stop(); }
  catch (error) { check('owned common contour cleanup confirmed', false, error.message); }
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(allEvents, null, 2));
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ candidate, build: built, port, fixture_only: true, checks }, null, 2));
  console.log(`RESULT ${checks.filter(item => item.ok).length}/${checks.length}; owned cleanup failures are explicit checks`);
  process.exitCode = checks.every(item => item.ok) ? 0 : 1;
}
