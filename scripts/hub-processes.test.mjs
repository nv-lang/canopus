import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { link, mkdtemp, mkdir, readFile, readdir, rm, writeFile, rename, symlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./hub-processes.ps1', import.meta.url));
const options = { skip: process.platform !== 'win32', concurrency: false, timeout: 120_000 };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const childCode = String.raw`
const fs = require('node:fs');
const net = require('node:net');
const [ready, token] = process.argv.slice(1);
const server = net.createServer(socket => {
  socket.setTimeout(2000, () => socket.destroy());
  socket.once('data', data => {
    const request = data.toString();
    if (request === token + ':ping') socket.end(String(process.pid));
    else if (request === token + ':stop') socket.end('bye', () => process.exit(0));
    else socket.destroy();
  });
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(ready, JSON.stringify({ pid: process.pid, port: server.address().port }));
});
setTimeout(() => process.exit(0), 110000);
`;
const hubCode = String.raw`
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', process.env.FAKE_CHILD_CODE, process.argv[1], process.argv[2]], {
  // Detachment keeps the fake child outside the hub's kill-on-close libuv job.
  stdio: 'ignore', windowsHide: true, detached: true
});
child.on('error', () => process.exit(1));
const cleanup = () => {
  if (child.exitCode !== null || child.signalCode !== null) process.exit(0);
  child.once('exit', () => process.exit(0));
  child.kill();
};
process.on('message', message => { if (message === 'cleanup') cleanup(); });
process.on('disconnect', cleanup);
setTimeout(cleanup, 110000);
`;

function command(executable, args, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', failure;
    const timer = setTimeout(() => {
      failure = new Error('test helper timed out');
      child.kill();
    }, timeout);
    child.once('error', error => { failure = error; });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 65_536) { failure = new Error('test helper output exceeded bound'); child.kill(); }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 65_536) { failure = new Error('test helper error output exceeded bound'); child.kill(); }
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else resolve({ code, stdout, stderr });
    });
  });
}

async function helper(action, roster, hubPid, childPid) {
  const args = ['-NoProfile', '-NonInteractive', '-File', script, '-Action', action, '-Roster', roster, '-HubPid', String(hubPid)];
  if (childPid !== undefined) args.push('-ChildPid', String(childPid));
  const result = await command('powershell.exe', args);
  assert.equal(result.stderr, '', 'the helper emits no non-JSON diagnostics');
  assert.match(result.stdout, /^\{[^\r\n]*\}\r?\n$/, 'stdout is exactly one compact JSON line');
  assert.equal(result.stdout.charCodeAt(0), 123, 'stdout has no UTF-8 BOM');
  result.value = JSON.parse(result.stdout);
  return result;
}

function control(pair, action) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: pair.port });
    let text = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('test child control timed out')));
    socket.once('connect', () => socket.write(pair.token + ':' + action));
    socket.on('data', chunk => { text += chunk.toString(); });
    socket.once('error', reject);
    socket.once('end', () => resolve(text));
  });
}

async function alive(pair) {
  try { return await control(pair, 'ping') === String(pair.pid); }
  catch { return false; }
}

async function waitUntil(probe, message, timeout = 7000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await probe();
    if (value) return value;
    await pause(40);
  } while (Date.now() < deadline);
  throw new Error(message);
}

async function stopHub(pair, cleanupChild = false) {
  if (pair.hub.exitCode !== null || pair.hub.signalCode !== null) return;
  const closed = once(pair.hub, 'close');
  // The hub can release its held child handle even if fixture startup failed before socket readiness.
  if (cleanupChild && pair.hub.connected) pair.hub.send('cleanup');
  else pair.hub.kill();
  let timer;
  try {
    await Promise.race([closed, new Promise((_, reject) => {
      timer = setTimeout(() => {
        pair.hub.kill();
        reject(new Error('fake hub did not stop'));
      }, 5000);
    })]);
  } finally { clearTimeout(timer); }
}

async function fixture(body) {
  const directory = await mkdtemp(join(tmpdir(), 'canopus-process-test-'));
  const roster = join(directory, 'roster with spaces \u0440\u0435\u0435\u0441\u0442\u0440');
  await mkdir(roster);
  const pairs = [];
  const start = async () => {
    const token = randomBytes(24).toString('hex');
    const ready = join(directory, `ready-${pairs.length}.json`);
    const hub = spawn(process.execPath, ['-e', hubCode, ready, token], {
      stdio: ['ignore', 'pipe', 'ignore', 'ipc'], windowsHide: true,
      env: { ...process.env, FAKE_CHILD_CODE: childCode },
    });
    const pair = { hub, token, ready };
    pairs.push(pair);
    hub.on('error', error => { pair.spawnError = error; });
    hub.stdout.resume();
    Object.assign(pair, await waitUntil(async () => {
      if (pair.spawnError) throw pair.spawnError;
      try { return JSON.parse(await readFile(ready, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return false; throw error; }
    }, 'fake child did not become ready'));
    return pair;
  };
  try { return await body({ directory, roster, start }); }
  finally {
    const failures = [];
    for (const pair of pairs) {
      try {
        if (!pair.port) {
          try { Object.assign(pair, JSON.parse(await readFile(pair.ready, 'utf8'))); } catch {}
        }
        // An authenticated child socket avoids PID-based cleanup even after its hub has exited.
        if (pair.port && await alive(pair)) await control(pair, 'stop');
        if (pair.port) await waitUntil(async () => !await alive(pair), 'fake child survived cleanup');
      } catch (error) { failures.push(error); }
      try { await stopHub(pair, true); } catch (error) { failures.push(error); }
    }
    await rm(directory, { recursive: true, force: true });
    if (failures.length) throw new AggregateError(failures, 'fixture cleanup failed');
  }
}

async function records(roster) {
  return (await readdir(roster)).filter(name => name.endsWith('.json'));
}
async function savedRecord(roster) {
  const names = await records(roster);
  assert.equal(names.length, 1);
  return { name: names[0], value: JSON.parse(await readFile(join(roster, names[0]), 'utf8')) };
}
async function register(roster, pair) {
  const result = await helper('Register', roster, pair.hub.pid, pair.pid);
  assert.equal(result.code, 0, result.stdout);
  assert.deepEqual(result.value, { ok: true });
  return savedRecord(roster);
}
function successfulSweep(result, ended = []) {
  assert.equal(result.code, 0, result.stdout);
  assert.deepEqual(result.value, { ok: true, ended, errors: [] });
}

const denyCode = String.raw`
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class TestProcessAcl317 {
  [StructLayout(LayoutKind.Sequential)] public struct Time { public uint Low, High; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern SafeProcessHandle OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(SafeProcessHandle p, out Time c, out Time e, out Time k, out Time u);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(SafeProcessHandle p, uint ms);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string s, uint r, out IntPtr d, out uint z);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SetKernelObjectSecurity(SafeProcessHandle p, uint info, IntPtr d);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
  public static void Deny(int pid, ulong birth, uint mask) {
    using (SafeProcessHandle p = OpenProcess(0x00141000, false, pid)) {
      if (p.IsInvalid) throw new Exception("test process ACL open failed");
      Time c, e, k, u;
      if (!GetProcessTimes(p, out c, out e, out k, out u) || (((ulong)c.High << 32) | c.Low) != birth || WaitForSingleObject(p, 0) != 258)
        throw new Exception("test process identity changed");
      IntPtr descriptor; uint size;
      string owner = System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
      string sddl = "D:(D;;0x" + mask.ToString("X8") + ";;;WD)(A;;GA;;;" + owner + ")";
      if (!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl, 1, out descriptor, out size)) throw new Exception("test ACL conversion failed");
      try { if (!SetKernelObjectSecurity(p, 4, descriptor)) throw new Exception("test ACL update failed"); }
      finally { LocalFree(descriptor); }
    }
  }
}
`;
async function denyAccess(pid, birth, mask) {
  const expression = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'\n${denyCode}\n'@; [TestProcessAcl317]::Deny(${pid}, [UInt64]::Parse('${birth}'), ${mask})`;
  const result = await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', expression]);
  assert.equal(result.code, 0, result.stderr);
}

test('Register rejects a wrong claimed direct parent without harming either process', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    const result = await helper('Register', roster, process.pid, pair.pid);
    assert.notEqual(result.code, 0);
    assert.deepEqual(result.value, { ok: false, error: 'child-parent-mismatch' });
    assert.equal(await alive(pair), true);
    assert.deepEqual(await records(roster), []);
    assert.equal(pair.hub.exitCode, null);
  });
});

test('Register captures complete identities atomically and repeating it is idempotent', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    const { name, value } = await register(roster, pair);
    assert.equal(value.version, 1);
    assert.equal(value.pid, pair.pid);
    assert.equal(value.parentPid, pair.hub.pid);
    assert.equal(value.hubPid, pair.hub.pid);
    assert.match(value.birth, /^[1-9][0-9]{0,18}$/);
    assert.match(value.hubBirth, /^[1-9][0-9]{0,18}$/);
    assert.ok(BigInt(value.birth) >= BigInt(value.hubBirth));
    assert.equal(value.image.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(value.hubImage.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(name, `${pair.pid}-${value.birth}.json`);
    assert.deepEqual(await register(roster, pair), { name, value });
    assert.deepEqual(await readdir(roster), [name]);
  });
});

test('Sweep keeps a child while its exact registered hub is alive', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    const before = await register(roster, pair);
    successfulSweep(await helper('Sweep', roster, process.pid));
    assert.equal(await alive(pair), true);
    assert.deepEqual(await savedRecord(roster), before);
  });
});

test('Sweep terminates only the orphan test root and removes its record', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    const unrelated = await start();
    await register(roster, pair);
    await stopHub(pair);
    assert.equal(await alive(pair), true, 'hub termination is not recursive');
    successfulSweep(await helper('Sweep', roster, process.pid), [pair.pid]);
    assert.equal(await alive(pair), false);
    assert.equal(await alive(unrelated), true);
    assert.deepEqual(await records(roster), []);
    successfulSweep(await helper('Sweep', roster, process.pid));
  });
});

for (const field of ['birth', 'image', 'parentPid']) {
  test(`Sweep never terminates a live child with a mismatched ${field}`, options, async () => {
    await fixture(async ({ roster, start }) => {
      const pair = await start();
      const { name, value } = await register(roster, pair);
      await stopHub(pair);
      if (field === 'birth') value.birth = String(BigInt(value.birth) + 1n);
      if (field === 'image') value.image += '.not-the-same-image';
      if (field === 'parentPid') { value.parentPid = process.pid; value.hubPid = process.pid; }
      const newName = `${value.pid}-${value.birth}.json`;
      await writeFile(join(roster, name), JSON.stringify(value));
      if (newName !== name) await rename(join(roster, name), join(roster, newName));
      successfulSweep(await helper('Sweep', roster, process.pid));
      assert.equal(await alive(pair), true);
      assert.deepEqual(await records(roster), []);
    });
  });
}

test('A changed hub birth represents an old hub, not the live PID replacement', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    const { name, value } = await register(roster, pair);
    value.hubBirth = String(BigInt(value.hubBirth) - 1n);
    await writeFile(join(roster, name), JSON.stringify(value));
    successfulSweep(await helper('Sweep', roster, process.pid), [pair.pid]);
    assert.equal(pair.hub.exitCode, null, 'the process occupying the hub PID is never killed');
    assert.equal(await alive(pair), false);
  });
});

test('Sweep drops a stale exited child without claiming a termination', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    await register(roster, pair);
    await control(pair, 'stop');
    await waitUntil(async () => !await alive(pair), 'test child did not exit');
    successfulSweep(await helper('Sweep', roster, process.pid));
    assert.deepEqual(await records(roster), []);
  });
});

test('Invalid, oversized and traversal records fail closed with bounded safe errors', options, async () => {
  await fixture(async ({ roster, directory, start }) => {
    const pair = await start();
    const { value } = await register(roster, pair);
    await rm(join(roster, `${value.pid}-${value.birth}.json`));
    await stopHub(pair);
    const marker = ['private', 'test', 'marker', 'do', 'not', 'echo'].join('-');
    await writeFile(join(roster, '1-1.json'), JSON.stringify({ ...value, image: `../${marker}` }));
    await writeFile(join(roster, '2-1.json'), marker);
    await writeFile(join(roster, '3-1.json'), ' '.repeat(262_145));
    await writeFile(join(roster, `${marker}.json`), '{}');
    const outside = join(directory, 'outside.json');
    await writeFile(outside, marker);
    await writeFile(join(roster, '4-1.json'), JSON.stringify({ ...value, path: '../outside.json' }));
    const result = await helper('Sweep', roster, process.pid);
    assert.notEqual(result.code, 0);
    assert.equal(result.value.ok, true);
    assert.deepEqual(result.value.ended, []);
    assert.equal(result.value.errors.length, 5);
    assert.ok(result.value.errors.every(error => error.length <= 128));
    assert.ok(!result.stdout.includes(marker));
    assert.equal(await readFile(outside, 'utf8'), marker);
    assert.equal(await alive(pair), true);
    assert.equal((await records(roster)).length, 5);
  });
});

test('Record hard links and roster junctions cannot redirect registry operations', options, async () => {
  await fixture(async ({ roster, directory }) => {
    const outside = join(directory, 'outside.json');
    await writeFile(outside, '{"sentinel":true}');
    await link(outside, join(roster, '1-1.json'));
    const linked = await helper('Sweep', roster, process.pid);
    assert.notEqual(linked.code, 0);
    assert.deepEqual(linked.value.ended, []);
    assert.match(linked.value.errors.join(','), /record-not-plain-file/);
    assert.equal(await readFile(outside, 'utf8'), '{"sentinel":true}');
    const junction = join(directory, 'junction');
    await symlink(roster, junction, 'junction');
    const redirected = await helper('Sweep', junction, process.pid);
    assert.notEqual(redirected.code, 0);
    assert.deepEqual(redirected.value, { ok: false, error: 'roster-not-plain-directory' });
    assert.deepEqual(await records(roster), ['1-1.json']);
  });
});

test('Legacy PID-only JSONL and incomplete temporary files are never read', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    await stopHub(pair);
    await writeFile(join(roster, 'legacy.jsonl'), JSON.stringify({ pid: pair.pid, hubPid: pair.hub.pid }) + '\n');
    await writeFile(join(roster, 'pending.tmp'), '{');
    successfulSweep(await helper('Sweep', roster, process.pid));
    assert.equal(await alive(pair), true);
    assert.equal((await readdir(roster)).length, 2);
  });
});

test('Concurrent registration and sweeping do not overwrite other root records', options, async () => {
  await fixture(async ({ roster, start }) => {
    const old = await start();
    const current = await start();
    await register(roster, old);
    await stopHub(old);
    const [registered, swept] = await Promise.all([
      helper('Register', roster, current.hub.pid, current.pid),
      helper('Sweep', roster, process.pid),
    ]);
    assert.equal(registered.code, 0, registered.stdout);
    successfulSweep(swept, [old.pid]);
    assert.equal((await savedRecord(roster)).value.pid, current.pid);
    assert.equal(await alive(current), true);
    assert.equal(await alive(old), false);
  });
});

test('An inaccessible test hub is unknown, so Sweep retains its child and record', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    const saved = await register(roster, pair);
    await denyAccess(pair.hub.pid, saved.value.hubBirth, 0x1000);
    const result = await helper('Sweep', roster, process.pid);
    assert.notEqual(result.code, 0);
    assert.deepEqual(result.value.ended, []);
    assert.match(result.value.errors.join(','), /hub-open-win32-5/);
    assert.equal(await alive(pair), true);
    assert.deepEqual(await savedRecord(roster), saved);
    const registered = await helper('Register', roster, pair.hub.pid, pair.pid);
    assert.notEqual(registered.code, 0);
    assert.deepEqual(registered.value, { ok: false, error: 'hub-open-win32-5' });
    assert.equal(await alive(pair), true);
  });
});

test('An inaccessible test child is retained when terminate access cannot be obtained', options, async () => {
  await fixture(async ({ roster, start }) => {
    const pair = await start();
    const saved = await register(roster, pair);
    await denyAccess(pair.pid, saved.value.birth, 1);
    await stopHub(pair);
    const result = await helper('Sweep', roster, process.pid);
    assert.notEqual(result.code, 0);
    assert.deepEqual(result.value.ended, []);
    assert.match(result.value.errors.join(','), /child-open-win32-5/);
    assert.equal(await alive(pair), true);
    assert.deepEqual(await savedRecord(roster), saved);
  });
});

test('Sweep processes at most 128 entries and reports the remaining work', options, async () => {
  await fixture(async ({ roster }) => {
    for (let i = 1; i <= 129; i++) await writeFile(join(roster, `${i}-1.json`), '{}');
    const result = await helper('Sweep', roster, process.pid);
    assert.notEqual(result.code, 0);
    assert.equal(result.value.errors.length, 129);
    assert.equal(result.value.errors.at(-1), 'registry-entry-limit-128');
    assert.deepEqual(result.value.ended, []);
    assert.equal((await records(roster)).length, 129);
  });
});

test('Invalid arguments and a missing roster have compact machine-readable results', options, async () => {
  await fixture(async ({ directory, roster }) => {
    const invalid = await helper('Register', roster, 'not-a-pid', 1);
    assert.notEqual(invalid.code, 0);
    assert.deepEqual(invalid.value, { ok: false, error: 'invalid-pid' });
    const missing = join(directory, 'not-created');
    successfulSweep(await helper('Sweep', missing, process.pid));
    assert.ok(!(await readdir(directory)).includes('not-created'));
    const badAction = await helper('Invalid', roster, process.pid);
    assert.notEqual(badAction.code, 0);
    assert.deepEqual(badAction.value, { ok: false, error: 'invalid-action' });
  });
});
