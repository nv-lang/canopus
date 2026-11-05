import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

async function fixture(t, flags = [], onChunk = () => {}) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./testdata/fake_agent.mjs', import.meta.url)), ...flags], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CREW_ECHO_FIXTURE: 'two words' },
  });
  t.after(() => child.kill());
  const lines = createInterface({ input: child.stdout });
  let serial = 0;
  let current;
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const update = message.params?.update;
    if (update?.sessionUpdate === 'agent_message_chunk') { current.text += update.content.text; onChunk(update.content.text); }
    if (message.id === current?.id) {
      const done = current;
      current = undefined;
      if (message.error) done.reject(new Error(JSON.stringify(message.error)));
      else done.resolve({ text: done.text, result: message.result });
    }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    current = { id: ++serial, text: '', resolve, reject };
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: serial, method, params }) + '\n');
  });
  await call('initialize', { clientCapabilities: {} });
  const opened = await call('session/new', { cwd: process.cwd(), mcpServers: [] });
  return async (text) => (await call('session/prompt', { sessionId: opened.result.sessionId, prompt: [{ type: 'text', text }] })).text;
}

test('default raw echo retains crew reminder and exact distinct turns', { timeout: 10000 }, async (t) => {
  const ask = await fixture(t);
  const header = '[crew] raw reminder must remain\n\n';
  for (const user of ['first exact payload α', 'second distinct payload β']) {
    assert.equal(await ask(header + user), 'Echo: ' + header + user);
  }
});

test('opt-in user echo strips only leading reminders without cross-turn leakage', { timeout: 10000 }, async (t) => {
  const ask = await fixture(t, ['--user-echo']);
  const header = '[crew] first reminder\n\n[crew] second reminder\n\n';
  assert.equal(await ask(header + 'first exact payload α'), 'Echo: first exact payload α');
  assert.equal(await ask(header + 'second distinct payload β'), 'Echo: second distinct payload β');
  assert.equal(await ask('literal [crew] inside user'), 'Echo: literal [crew] inside user');
});

test('env arguments exclude reminders and retain exact requested names', { timeout: 10000 }, async (t) => {
  const ask = await fixture(t);
  assert.equal(await ask('[crew] never an env argument\n\nenv CREW_ECHO_FIXTURE CREW_ECHO_ABSENT_271'),
    'env CREW_ECHO_FIXTURE=[two words]; CREW_ECHO_ABSENT_271=<unset>');
});


test('opt-in fast raw echo preserves long context in one chunk', { timeout: 10000 }, async (t) => {
  let chunks = 0;
  const ask = await fixture(t, ['--fast-echo'], () => chunks++);
  const prompt = '[crew] ' + 'long reminder '.repeat(1500) + '\n\nexact user payload';
  assert.equal(await ask(prompt), 'Echo: ' + prompt);
  assert.equal(chunks, 1);
});
