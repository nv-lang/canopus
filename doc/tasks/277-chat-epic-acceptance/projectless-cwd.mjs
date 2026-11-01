// Negative probe: projectless must not acquire Git context from the hub's cwd.
// A second isolated front uses the same exact binaries and a synthetic repository.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
const dir = path.resolve(process.argv[2]);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'contour.json')));
const port = 18178;
const settings = JSON.parse(fs.readFileSync(meta.config));
const data = path.join(dir, 'projectless-cwd-data');
settings.port = port; settings.data_dir = data; settings.workdir = meta.repo;
const config = path.join(dir, 'projectless-cwd-server.json');
fs.writeFileSync(config, JSON.stringify(settings));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CREW_')));
cleanEnv.CREW_HOME = meta.home;
const pause = ms => new Promise(r => setTimeout(r, ms));
const checks = [], events = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`); };
const git = (...args) => spawnSync('git', ['-C', meta.repo, ...args], { encoding: 'utf8' }).stdout;
const before = { head: git('rev-parse', 'HEAD'), trees: git('worktree', 'list', '--porcelain'), status: git('status', '--porcelain') };
let front, ws;
try {
  await new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(port, '127.0.0.1', () => s.close(resolve)); });
  const log = fs.openSync(path.join(dir, 'projectless-cwd-front.log'), 'a');
  front = spawn(path.join(meta.root, 'target/crew-harness.exe'), ['serve', config], { cwd: meta.repo, env: cleanEnv, windowsHide: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  let healthy = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { healthy = true; break; } } catch {} await pause(100); }
  if (!healthy) throw Error('isolated secondary front did not become healthy');
  ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.onmessage = m => { const x = JSON.parse(m.data); events.push(...(Array.isArray(x) ? x : [x])); };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = (id, kind, input) => ws.send(JSON.stringify({ id, trace: 's-no-project-cwd', step: 0, time: Date.now(), kind, input }));
  send('cwd277-create', 'session_created', { agent: 'codex', name: 'No project, Git hub cwd', worktree: false, workspace_explicit: true });
  send('cwd277-prompt', 'user_message', { text: 'pwd', turn: 'pwd' });
  const end = Date.now() + 15000;
  while (!events.some(e => e.kind === 'agent_done') && Date.now() < end) await pause(50);
  const created = events.find(e => e.kind === 'session_created');
  const answer = events.filter(e => e.kind === 'agent_chunk').map(e => e.input.text).join('');
  check('projectless metadata remains empty', created && !created.input.project_id && !created.input.folder && !created.input.branch);
  check('REQ-19: actual projectless ACP cwd does not inherit the hub Git repository', answer.includes('cwd:') && !answer.replaceAll('\\', '/').toLowerCase().includes(meta.repo.replaceAll('\\', '/').toLowerCase()), answer);
  check('negative cwd probe leaves synthetic Git HEAD, worktrees and files unchanged', before.head === git('rev-parse', 'HEAD') && before.trees === git('worktree', 'list', '--porcelain') && before.status === git('status', '--porcelain'));
} catch (error) { check('projectless cwd harness completed', false, error.stack); }
finally {
  ws?.close();
  if (front?.pid) spawnSync('taskkill', ['/PID', String(front.pid), '/T', '/F'], { windowsHide: true });
  fs.writeFileSync(path.join(dir, 'projectless-cwd-result.json'), JSON.stringify({ checks, pass: checks.filter(c=>c.ok).length, fail: checks.filter(c=>!c.ok).length }, null, 2));
  fs.writeFileSync(path.join(dir, 'projectless-cwd-events.json'), JSON.stringify(events, null, 2));
  console.log(`RESULT ${checks.filter(c=>c.ok).length}/${checks.length}; only secondary contour stopped`);
  process.exitCode = checks.every(c=>c.ok) ? 0 : 1;
}
