import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';

const wrapper = path.join(import.meta.dirname, 'zai-acp.mjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// An out-of-band test-owned socket lets finally stop even orphaned fixtures without killing saved PIDs.
// The fixtures also exit on control EOF/error and have a last-resort lifetime. No real agent is started.
async function stand(dir, seconds = '1', native = false) {
  const changes = new EventEmitter();
  const controls = new Set();
  const ready = new Map();
  const prompts = [];
  const seen = [];
  let stderr = '';
  let closed;
  let exited = false;
  let child;
  let output;
  const server = createServer(socket => {
    controls.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => { controls.delete(socket); changes.emit('change'); });
    createInterface({ input: socket }).on('error', () => {}).on('line', line => {
      const message = JSON.parse(line);
      if (message.kind === 'ready') ready.set(message.role, message.pid);
      if (message.kind === 'prompt') prompts.push(message);
      changes.emit('change');
    });
  });
  const wait = (predicate, ms = 5000, label = 'condition') => new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      changes.off('change', check);
      if (error) reject(error); else resolve(value);
    };
    const check = () => {
      const value = predicate();
      if (value) finish(null, value);
    };
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${label}; stderr: ${stderr}`)), ms);
    changes.on('change', check);
    check();
  });
  async function dispose() {
    try {
      // Close test control sockets first; even a leader that already exited cannot strand its descendant.
      for (const socket of controls) socket.end('stop\n');
      if (child && !exited) child.kill('SIGTERM');
      if (child && !closed) {
        try { await wait(() => closed, 3000, 'wrapper cleanup'); }
        catch {
          if (!exited) child.kill('SIGKILL');
          await wait(() => closed, 2000, 'forced wrapper cleanup');
        }
      }
    } finally {
      try { await wait(() => controls.size === 0, 2000, 'fixture cleanup'); }
      finally {
        for (const socket of controls) socket.destroy();
        output?.close();
        await new Promise(resolve => server.close(resolve));
      }
    }
  }
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const controlSource = role => `
      import { connect } from 'node:net';
      const control = connect(${server.address().port}, '127.0.0.1');
      control.on('connect', () => control.write(JSON.stringify({ kind: 'ready', role: ${JSON.stringify(role)}, pid: process.pid }) + '\\n'));
      control.on('data', () => process.exit(0));
      control.on('end', () => process.exit(0));
      control.on('error', () => process.exit(0));
      setTimeout(() => process.exit(0), 15000).unref();
    `;
    const fake = path.join(dir, 'fake-bridge.mjs');
    writeFileSync(fake, `
      import { createInterface } from 'node:readline';
      import { spawn } from 'node:child_process';
      ${controlSource('backend')}
      spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(controlSource('descendant'))}], {
        stdio: 'ignore', windowsHide: true,
      }).on('error', error => { console.error(error); process.exit(1); });
      process.stderr.write('fixture backend ready\\n');
      const out = message => process.stdout.write(JSON.stringify(message) + '\\n');
      const response = (id, result) => out({ jsonrpc: '2.0', id, result });
      const options = [{ id: 'model', currentValue: 'builtin:zai-coding-plan\\\\GLM-5.3',
        options: [{ value: 'builtin:zai-coding-plan\\\\GLM-5.3-Flash' }] }];
      let interval;
      let active;
      let scenario;
      createInterface({ input: process.stdin }).on('line', line => {
        const message = JSON.parse(line);
        if (message.method === 'initialize') return response(message.id, { protocolVersion: 1, configOptions: options });
        if (['session/new', 'session/create', 'session/set_model', 'session/set_config_option'].includes(message.method)) {
          return response(message.id, { sessionId: 's', received: message.params });
        }
        if (message.method === 'session/cancel' && scenario === 'cancel-success') {
          clearInterval(interval);
          return response(active.id, { stopReason: 'cancelled' });
        }
        if (message.method !== 'session/prompt') return;
        active = message;
        scenario = message.params.prompt[0].text;
        control.write(JSON.stringify({ kind: 'prompt', id: message.id }) + '\\n');
        if (scenario === 'success') return response(message.id, { stopReason: 'end_turn' });
        if (scenario === 'error') return out({ jsonrpc: '2.0', id: message.id, error: { code: -32001, message: 'fixture failure' } });
        if (scenario === 'malformed') return process.stdout.write('{broken JSON\\n');
        if (scenario === 'exit') return process.exit(0);
        if (scenario === 'collision') {
          out({ jsonrpc: '2.0', id: message.id, method: 'session/request_permission', params: { sessionId: 's' } });
        }
        if (scenario === 'typed-id') response(String(message.id), { stopReason: 'end_turn' });
        if (['updates', 'foreign', 'cancel', 'cancel-success'].includes(scenario)) {
          let count = 0;
          interval = setInterval(() => {
            out({ jsonrpc: '2.0', method: 'session/update', params: {
              sessionId: scenario === 'foreign' ? 'other' : 's', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'working' } },
            } });
            if (scenario === 'updates' && ++count === 12) clearInterval(interval);
          }, 120);
        }
      });
      // Deliberately ignore input EOF, so the wrapper, not fixture cooperation, must terminate this tree.
    `);
    child = spawn(process.execPath, [wrapper, ...(native ? ['app-server'] : [])], {
      env: { ...process.env, ZCODE_ACP_BRIDGE: fake, CANOPUS_TURN_DEADLINE_SECONDS: seconds,
        ...(native ? { CANOPUS_PREPARATION_ZCODE_BIN: fake } : {}) },
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    child.stdin.on('error', () => {});
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-65536); });
    child.on('error', error => { stderr += error.message; changes.emit('change'); });
    child.on('exit', () => { exited = true; });
    child.on('close', (code, signal) => { closed = { code, signal }; changes.emit('change'); });
    output = createInterface({ input: child.stdout });
    output.on('line', line => {
      try { seen.push(JSON.parse(line)); }
      catch { seen.push({ invalid: line }); }
      changes.emit('change');
    });
    return {
      seen, prompts, ready, controls, wait, dispose,
      stderr: () => stderr,
      closed: () => closed,
      send: message => child.stdin.write(JSON.stringify(message) + '\n'),
      raw: text => child.stdin.write(text),
      eof: () => child.stdin.end(),
      response: id => wait(() => seen.find(message => message.id === id && !Object.hasOwn(message, 'method') && ('result' in message || 'error' in message)), 5000, `response ${id}`),
      async start() {
        await wait(() => ready.size === 2, 5000, 'both owned fixtures');
        this.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        const init = await this.response(1);
        this.send({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: dir, mcpServers: [] } });
        await this.response(2);
        return init;
      },
      prompt(scenario) {
        this.send({ jsonrpc: '2.0', id: 3, method: 'session/prompt', params: { sessionId: 's', prompt: [{ type: 'text', text: scenario }] } });
      },
      async stopped(code) {
        await wait(() => closed, 5000, 'wrapper close');
        assert.equal(closed.code, code, stderr);
        await wait(() => controls.size === 0, 2000, 'owned backend and descendant termination');
      },
    };
  } catch (error) { await dispose(); throw error; }
}

test('isolated ACP bridge process stands (sequential)', { concurrency: false }, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'zai-acp-test-'));
  const run = async (name, seconds, check, native = false) => t.test(name, async () => {
    const bridge = await stand(dir, seconds, native);
    try { await check(bridge); } finally { await bridge.dispose(); }
  });
  const expectTimeout = async bridge => {
    const message = await bridge.response(3);
    assert.equal(message.error?.code, -32000, JSON.stringify(message));
    assert.match(message.error.message, /^backend timeout:/);
    await bridge.stopped(1);
    assert.equal(bridge.prompts.length, 1, 'no automatic prompt replay');
    assert.equal(bridge.seen.filter(msg => msg.id === 3 && msg.error?.code === -32000).length, 1);
    return message.error;
  };
  try {
    await run('silence sends an error and terminates the owned tree', '2', async bridge => {
      await bridge.start();
      bridge.prompt('silent');
      const error = await expectTimeout(bridge);
      assert.equal(error.data.reason, 'silence');
      assert.ok(error.data.quietMs >= 1800);
      assert.match(error.message, /no events for \d+\.\d s$/);
      assert.doesNotMatch(error.message, /min/);
      assert.match(bridge.stderr(), /fixture backend ready/);
    });
    await run('one-second deadline remains enabled', '1', async bridge => {
      await bridge.start();
      bridge.prompt('silent');
      const error = await expectTimeout(bridge);
      assert.ok(error.data.quietMs >= 900 && error.data.quietMs < 2000, JSON.stringify(error));
    });
    await run('a fractional deadline retains the positive 100 ms minimum', '0.01', async bridge => {
      await bridge.start();
      bridge.prompt('silent');
      const error = await expectTimeout(bridge);
      assert.ok(error.data.quietMs >= 100 && error.data.quietMs < 1000, JSON.stringify(error));
    });
    for (const scenario of ['success', 'error']) {
      await run(`normal ${scenario} closes the watch and preserves model mapping`, '1', async bridge => {
        const init = await bridge.start();
        assert.equal(init.result.configOptions[0].currentValue, 'glm-5.3');
        assert.equal(init.result.configOptions[0].options[0].value, 'glm-5.3-flash');
        bridge.send({ jsonrpc: '2.0', id: 4, method: 'session/set_model', params: { sessionId: 's', modelId: 'glm-5.3' } });
        assert.equal((await bridge.response(4)).result.received.modelId, 'builtin:zai-coding-plan\\GLM-5.3');
        bridge.send({ jsonrpc: '2.0', id: 5, method: 'session/set_config_option', params: { sessionId: 's', configId: 'model', value: 'glm-5.3-flash' } });
        assert.equal((await bridge.response(5)).result.received.value, 'builtin:zai-coding-plan\\GLM-5.3-Flash');
        bridge.prompt(scenario);
        const answer = await bridge.response(3);
        assert.ok(scenario === 'success' ? answer.result : answer.error?.code === -32001);
        await delay(1150); // Deliberately cross the original silence deadline after a terminal response.
        assert.equal(bridge.closed(), undefined);
        assert.equal(bridge.seen.filter(msg => msg.id === 3).length, 1);
        bridge.eof();
        await bridge.stopped(0);
      });
    }
    await run('valid updates extend beyond the initial deadline, then silence expires', '1', async bridge => {
      await bridge.start();
      bridge.prompt('updates');
      const error = await expectTimeout(bridge);
      assert.equal(bridge.seen.filter(msg => msg.method === 'session/update').length, 12);
      assert.ok(error.data.elapsedMs >= 2200, JSON.stringify(error));
      assert.ok(error.data.quietMs >= 900 && error.data.quietMs < 2000);
    });
    for (const scenario of ['foreign', 'collision', 'typed-id']) {
      await run(`${scenario} traffic does not protect an unanswered prompt`, '1', async bridge => {
        await bridge.start();
        bridge.prompt(scenario);
        if (scenario === 'collision') {
          await bridge.wait(() => bridge.seen.some(msg => msg.id === 3 && msg.method === 'session/request_permission'));
          // The client's answer to a reverse RPC must not close the outbound prompt either.
          bridge.send({ jsonrpc: '2.0', id: 3, result: { outcome: { outcome: 'cancelled' } } });
        }
        const error = await expectTimeout(bridge);
        assert.ok(error.data.elapsedMs < 2000, JSON.stringify(error));
        if (scenario === 'foreign') assert.ok(bridge.seen.some(msg => msg.params?.sessionId === 'other'));
        if (scenario === 'typed-id') assert.ok(bridge.seen.some(msg => msg.id === '3' && msg.result));
      });
    }
    await run('ignored cancel expires despite updates and a repeated cancel', '4', async bridge => {
      await bridge.start();
      bridge.prompt('cancel');
      await bridge.wait(() => bridge.seen.some(msg => msg.method === 'session/update'));
      const cancel = { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 's' } };
      bridge.send(cancel);
      await delay(1000);
      bridge.send(cancel);
      const error = await expectTimeout(bridge);
      assert.equal(error.data.reason, 'cancel');
      assert.ok(error.data.cancelledMs >= 2000 && error.data.cancelledMs < 2500, JSON.stringify(error));
      assert.match(error.message, /cancel unanswered for \d+\.\d s/);
      assert.ok(error.data.quietMs < 500, 'live updates cannot extend cancel');
    });
    await run('matching terminal response clears the cancel deadline', '4', async bridge => {
      await bridge.start();
      bridge.prompt('cancel-success');
      await bridge.wait(() => bridge.seen.some(msg => msg.method === 'session/update'));
      bridge.send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 's' } });
      assert.equal((await bridge.response(3)).result.stopReason, 'cancelled');
      await delay(2200);
      assert.equal(bridge.closed(), undefined);
      bridge.eof();
      await bridge.stopped(0);
    });
    await run('clean input EOF terminates an uncooperative owned tree', '10', async bridge => {
      await bridge.start();
      bridge.prompt('silent');
      await bridge.wait(() => bridge.prompts.length === 1);
      bridge.eof();
      await bridge.stopped(0);
    });
    await run('malformed input terminates the owned tree', '10', async bridge => {
      await bridge.start();
      bridge.prompt('silent');
      await bridge.wait(() => bridge.prompts.length === 1);
      bridge.raw('{broken JSON\n');
      await bridge.stopped(1);
      assert.match(bridge.stderr(), /invalid input message/);
    });
    await run('malformed backend JSON terminates the owned tree', '10', async bridge => {
      await bridge.start();
      bridge.prompt('malformed');
      await bridge.stopped(1);
      assert.match(bridge.stderr(), /invalid backend message/);
      assert.ok(bridge.seen.every(msg => !msg.invalid));
    });
    await run('leader exit is bounded without late cleanup by a saved PID', '1', async bridge => {
      await bridge.start();
      bridge.prompt('exit');
      await bridge.wait(() => bridge.closed(), 3000, 'wrapper after leader exit');
      assert.equal(bridge.closed().code, 0);
      // OS containment may already reap the descendant. Otherwise the hub JobObject owns the remainder;
      // finally uses its test-only control socket, not a saved PID, to clean up in this standalone stand.
      await bridge.wait(() => bridge.controls.size <= 1, 2000, 'exited backend control closure');
      assert.doesNotMatch(bridge.stderr(), /taskkill|backend timeout/);
    });
    await run('native Preparation restrictions and EOF cleanup are preserved', '10', async bridge => {
      await bridge.start();
      bridge.send({ id: 10, method: 'session/create', params: { mode: 'agent', mcpServers: ['forbidden'] } });
      const params = (await bridge.response(10)).result.received;
      assert.deepEqual(params, { mode: 'plan', mcpServers: [], toolAllowlist: [], persistence: 'deferred',
        titleGenerationEnabled: false, dynamicWorkflowEnabled: false });
      for (const [index, method] of ['session/resume', 'session/load', 'session/setMode'].entries()) {
        bridge.send({ id: 20 + index, method, params: {} });
        assert.equal((await bridge.response(20 + index)).error.code, -32601);
      }
      bridge.eof();
      await bridge.stopped(0);
    }, true);
    for (const seconds of ['0', '-1', '', 'NaN', 'Infinity', 'nonsense']) {
      await run(`invalid deadline ${JSON.stringify(seconds)} fails before starting a backend`, seconds, async bridge => {
        await bridge.stopped(1);
        assert.equal(bridge.ready.size, 0);
        assert.match(bridge.stderr(), /Invalid CANOPUS_TURN_DEADLINE_SECONDS/);
      });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
