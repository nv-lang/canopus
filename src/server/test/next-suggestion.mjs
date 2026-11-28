// 336. Run against a freshly built canopus with a temporary store and the fake ACP agent.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, cp, symlink, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { initialModel, reduce } from '../../web/state.js';
import { createView } from '../../web/view.js';
import { createFakeDocument, key } from '../../web/test/fake-dom.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const program = process.platform === 'win32' ? 'canopus.exe' : 'canopus';
const binary = resolve(process.argv[2] ?? join(root, 'target', program));
const temp = await mkdtemp(join(tmpdir(), 'canopus-336-ws-'));
const install = join(temp, 'install');
const fixture = join(root, 'src/acp/testdata/fake_agent.mjs');
const trace = 's-next-ws';
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const { port } = listener.address();
await new Promise(resolve => listener.close(resolve));

let processHandle, socket, exit, logs = '', serial = 0, events = [];
const config = join(temp, 'server.json');
const send = (kind, input, id = 'page-' + ++serial) => socket.send(JSON.stringify({ kind, input, id, trace, time: Date.now(), step: 0 }));
const pick = (kind, start = 0) => events.slice(start).filter(event => event.trace === trace && event.kind === kind);
async function wait(label, until) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = await until();
    if (found) return found;
    assert.equal(processHandle.exitCode, null, logs);
    await delay(35);
  }
  assert.fail(label + ' timed out\n' + JSON.stringify(events.slice(-15)) + '\n' + logs);
}
async function start() {
  events = [];
  processHandle = spawn(join(install, program), ['--config', config, 'serve'], { cwd: temp, stdio: ['ignore', 'pipe', 'pipe'] });
  exit = once(processHandle, 'exit');
  for (const stream of [processHandle.stdout, processHandle.stderr]) stream.on('data', chunk => logs += chunk);
  await wait('health', () => fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(250) }).then(r => r.ok).catch(() => false));
  socket = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  socket.addEventListener('message', ({ data }) => events.push(...[JSON.parse(data)].flat()));
  await once(socket, 'open');
}
async function stop() {
  socket?.close();
  if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
    processHandle.kill();
    await Promise.race([exit, delay(2000)]);
    if (processHandle.exitCode === null && processHandle.signalCode === null) { processHandle.kill('SIGKILL'); await exit; }
  }
}
try {
  await mkdir(install);
  await cp(binary, join(install, program));
  for (const [name, origin] of [['web', 'src/web'], ['machines', 'machines']]) {
    await symlink(join(root, origin), join(install, name), 'junction');
  }
  await writeFile(config, JSON.stringify({
    port, store: 'files', voice: false,
    agents: [{ id: 'opencode', label: 'Fixture', program: process.execPath, args: [fixture, '--live', '--ask'] }],
  }));
  await start();
  send('session_created', { name: 'Подсказки', agent: 'opencode' });
  await wait('session', () => pick('session_created')[0]);
  const prompt = '  Покажи "дифф"\nсводкой  ';
  const calls = [{ prompt: 'Покажи тесты', __names: true }, {}, { prompt }];
  send('user_message', { text: 'ctl canopus_next ' + JSON.stringify(calls) });
  const done = await wait('agent_done', () => pick('agent_done')[0]);
  const turn = done.input.turn;
  const suggestions = pick('next_suggestion');
  assert.deepEqual(suggestions.map(e => e.input), [
    { prompt: 'Покажи тесты', turn, session: trace },
    { prompt, turn, session: trace },
  ]);
  const answer = pick('agent_chunk').map(e => e.input.text).join('');
  assert.match(answer, /ctl canopus_next: .*canopus_next.* \| Предложение записано\./);
  assert.match(answer, /ERR canopus_next: the argument prompt/);
  assert.equal(pick('user_message').length, 1);
  await stop();
  await start();
  await wait('replayed suggestions', () => pick('next_suggestion').length === 2);
  assert.deepEqual(pick('next_suggestion'), suggestions);
  const doc = createFakeDocument();
  const refs = Object.fromEntries(['app', 'side', 'main', 'rail', 'status', 'overlay'].map(name => [name, doc.createElement('div')]));
  doc.body.append(...Object.values(refs));
  const view = createView(doc, refs, {
    agents: [{ id: 'opencode' }], now: () => 0,
    handlers: {
      queued: () => 0, queuedItems: () => [],
      onSend: (session, text) => { assert.equal(session, trace); send('user_message', { text }); return true; },
    },
  });
  const draw = () => view.render(events.reduce(reduce, initialModel()), { selected: trace, projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  draw();
  const field = refs.main.querySelector('#composer-input');
  const ghost = refs.main.querySelector('.composer-ghost');
  assert.equal(ghost.hidden, false);
  assert.equal(ghost.textContent, prompt);
  assert.equal(field.value, '');
  field.dispatchEvent(key('Tab'));
  assert.equal(field.value, prompt);
  assert.equal(ghost.hidden, true);
  assert.equal(pick('user_message').length, 1);

  const offset = events.length;
  field.dispatchEvent(key('Enter'));
  await wait('second done', () => pick('agent_done', offset)[0]);
  assert.deepEqual(pick('user_message', offset).map(e => e.input.text), [prompt]);
  draw();
  assert.equal(ghost.hidden, true);
  assert.equal(field.value, '');
  console.log('PASS MCP → journal → composer preview → Tab → Enter');
} finally {
  await stop();
  await rm(temp, { recursive: true, force: true });
}
