import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { stopOwnedFront, portIsFree } from './common-process.mjs';

const child = () => Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null });
function finish(process) {
  process.exitCode = 0;
  process.emit('exit', 0, null);
}

test('failed owned stop rejects before a new health or restart can run', async () => {
  const process = child();
  let probes = 0, restarted = false;
  await assert.rejects(async () => {
    await stopOwnedFront(process, 18179, {
      terminate() { throw Error('termination status 1'); },
      probe() { probes++; return true; }, timeoutMs: 30,
    });
    restarted = true;
  }, /termination status 1/);
  assert.equal(probes, 0);
  assert.equal(restarted, false);
  assert.equal(process.listenerCount('exit'), 0);
});

test('successful termination command without owned exit is not a restart PASS', async () => {
  const process = child();
  let probes = 0;
  await assert.rejects(stopOwnedFront(process, 18179, {
    terminate() {}, probe() { probes++; return true; }, timeoutMs: 30,
  }), /exit timeout/);
  assert.equal(probes, 0);
});

test('owned exit with an occupied port rejects instead of adopting an old server', async () => {
  const process = child();
  let restarted = false;
  await assert.rejects(async () => {
    await stopOwnedFront(process, 18179, {
      terminate: finish, probe: async () => false, timeoutMs: 30,
    });
    restarted = true;
  }, /port remains occupied/);
  assert.equal(restarted, false);
});

test('restart is admitted only after the owned exit and port release', async () => {
  const process = child(), order = [];
  await stopOwnedFront(process, 18179, {
    terminate(owned) {
      assert.equal(owned, process);
      order.push('terminate');
      queueMicrotask(() => { order.push('exit'); finish(owned); });
    },
    probe: async () => { order.push('port-free'); return true; }, timeoutMs: 100,
  });
  order.push('restart');
  assert.deepEqual(order, ['terminate', 'exit', 'port-free', 'restart']);
});

test('already exited owned process is not killed again, but its port is checked', async () => {
  const process = child();
  finish(process);
  let kills = 0;
  await stopOwnedFront(process, 18179, {
    terminate() { kills++; }, probe: async () => true,
  });
  assert.equal(kills, 0);
});

test('port probe observes a real occupied socket and its release without killing it', async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host: '127.0.0.1', exclusive: true }, resolve);
  });
  const port = server.address().port;
  try { assert.equal(await portIsFree(port), false); }
  finally { await new Promise(resolve => server.close(resolve)); }
  assert.equal(await portIsFree(port), true);
});

test('real owned Node child exit is observed before stop resolves', async () => {
  const owned = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  await once(owned, 'spawn');
  let observed = false;
  owned.once('exit', () => { observed = true; });
  try {
    await stopOwnedFront(owned, 0, { probe: async () => true });
    assert.equal(observed, true);
    assert.ok(owned.exitCode !== null || owned.signalCode !== null);
  } finally {
    if (owned.exitCode === null && owned.signalCode === null) {
      const gone = once(owned, 'exit');
      owned.kill('SIGKILL');
      await gone;
    }
  }
});
