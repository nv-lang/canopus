import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createSilenceWatch } from './acp-silence.mjs';

const self = fileURLToPath(import.meta.url);
const restricted = process.argv[2] === '--preparation';
const nativeBackend = process.env.CANOPUS_PREPARATION_ZCODE_BIN;
// The hub supplies seconds, not an already reduced bridge deadline. Even 1 s must stay protected.
const deadlineSeconds = Number(process.env.CANOPUS_TURN_DEADLINE_SECONDS ?? 900);
if (!Number.isFinite(deadlineSeconds) || deadlineSeconds <= 0 || !Number.isFinite(deadlineSeconds * 1000)) {
  console.error('Invalid CANOPUS_TURN_DEADLINE_SECONDS: expected positive finite seconds');
  process.exit(1);
}
const quietLimitMs = Math.max(100, deadlineSeconds * 900);

async function bounded(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); })]);
  } finally { clearTimeout(timer); }
}

// No process-name scans or delayed kills by a saved PID. Node cannot pin a Windows PID for taskkill;
// only start it while our ChildProcess is still alive. After its exit, the hub's Tree.Group/JobObject
// owns final descendant cleanup. Standalone use cannot reclaim descendants of an already exited leader.
function supervise(child) {
  let leaving = false;
  let exited = false;
  let closed = false;
  let drainTimer;
  let onStop = () => {};
  let resolveClosed;
  const childClosed = new Promise(resolve => { resolveClosed = resolve; });
  const alive = () => child.pid !== undefined && !exited && child.exitCode === null && child.signalCode === null;
  const report = message => console.error(`ZCode ACP bridge: ${message}`);
  const directKill = () => {
    if (!alive()) return;
    try { if (!child.kill('SIGKILL')) report('could not terminate the owned child'); }
    catch (error) { report(`owned child termination failed: ${error.message}`); }
  };
  async function stopChild() {
    if (alive()) {
      if (process.platform === 'win32') {
        await new Promise(resolve => {
          let done = false;
          let stderr = '';
          const killer = spawn('taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], {
            stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
          });
          const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
          const timer = setTimeout(() => {
            report('taskkill exceeded 1000 ms; falling back to the owned child handle');
            try {
              if (killer.exitCode === null && killer.signalCode === null && !killer.kill('SIGKILL')) report('could not stop taskkill');
            } catch (error) { report(`taskkill termination failed: ${error.message}`); }
            finish();
          }, 1000);
          killer.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4096); });
          killer.on('error', error => { report(`taskkill failed: ${error.message}`); finish(); });
          killer.on('close', code => {
            if (code !== 0 && !done) report(`taskkill exited ${code}: ${stderr.trim()}`);
            finish();
          });
        });
        directKill();
      } else {
        // The child is a detached group leader; kill the group once, before releasing that identity.
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { report(`owned process group termination failed: ${error.message}`); directKill(); }
      }
    }
    if (!closed && !await bounded(childClosed, 500)) {
      report('child pipes did not close within 500 ms; final tree cleanup belongs to the hub');
      directKill();
    }
  }
  async function stop(code, diagnostic, response) {
    if (leaving) return;
    leaving = true;
    clearTimeout(drainTimer);
    onStop();
    process.stdin.pause();
    if (diagnostic) report(diagnostic);
    // Deliver the terminal error BEFORE any tree operation; never wait forever on a blocked consumer.
    const flushed = await bounded(new Promise(resolve => {
      try {
        process.stdout.write(response === undefined ? '' : JSON.stringify(response) + '\n', error => {
          if (error) report(`stdout write failed: ${error.message}`);
          resolve(!error);
        });
      } catch (error) { report(`stdout write failed: ${error.message}`); resolve(false); }
    }), 250);
    if (!flushed) report('stdout flush failed or exceeded 250 ms');
    try { await stopChild(); }
    catch (error) { report(`child cleanup failed: ${error.message}`); directKill(); }
    process.exit(code);
  }
  child.on('exit', (code, signal) => {
    exited = true;
    // close, unlike exit, includes stdio drainage. Descendants may hold pipes, so this wait is bounded.
    if (!leaving) {
      clearTimeout(drainTimer);
      drainTimer = setTimeout(() => { void stop(code ?? 1, signal ? `child exited on ${signal}` : undefined); }, 250);
    }
  });
  child.stdout?.on('end', () => {
    if (!leaving) {
      clearTimeout(drainTimer);
      drainTimer = setTimeout(() => { void stop(child.exitCode ?? 1, 'backend output EOF'); }, 250);
    }
  });
  child.on('close', (code, signal) => {
    closed = true;
    resolveClosed(true);
    if (!leaving) void stop(code ?? 1, signal ? `child closed on ${signal}` : undefined);
  });
  child.on('error', error => { void stop(1, `child failed: ${error.message}`); });
  child.stdin.on('error', error => { if (!leaving) void stop(1, `child input failed: ${error.message}`); });
  process.stdout.on('error', error => { if (!leaving) void stop(1, `stdout failed: ${error.message}`); });
  process.stdin.on('error', error => { void stop(1, `input failed: ${error.message}`); });
  process.stdin.on('end', () => { void stop(0, 'input EOF'); });
  process.on('SIGTERM', () => { void stop(143, 'received SIGTERM'); });
  process.on('SIGINT', () => { void stop(130, 'received SIGINT'); });
  return {
    stop,
    leaving: () => leaving,
    onStop(callback) { onStop = callback; },
    forward(message) { if (!leaving) process.stdout.write(JSON.stringify(message) + '\n'); },
    read(stream, source, callback) {
      const lines = createInterface({ input: stream });
      lines.on('error', error => { void stop(1, `${source} reader failed: ${error.message}`); });
      lines.on('line', line => {
        if (leaving) return;
        try {
          const message = JSON.parse(line);
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw Error('expected a JSON-RPC object');
          callback(message);
        } catch (error) { void stop(1, `invalid ${source} message: ${error.message}`); }
      });
      stream.on('error', error => { void stop(1, `${source} stream failed: ${error.message}`); });
      return lines;
    },
  };
}

if (process.argv[2] === 'app-server' && nativeBackend) {
  const child = spawn(process.execPath, [nativeBackend, ...process.argv.slice(2)], {
    stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true, detached: process.platform !== 'win32',
  });
  const lifecycle = supervise(child);
  const forbidden = new Set(['session/resume', 'session/load', 'session/setMode']);
  lifecycle.read(process.stdin, 'input', message => {
    if (forbidden.has(message.method)) {
      lifecycle.forward({ id: message.id, error: { code: -32601, message: 'Unavailable in Preparation' } });
      return;
    }
    if (message.method === 'session/create') {
      Object.assign(message.params, { mode: 'plan', toolAllowlist: [], mcpServers: [],
        persistence: 'deferred', titleGenerationEnabled: false, dynamicWorkflowEnabled: false });
    }
    child.stdin.write(JSON.stringify(message) + '\n');
  });
} else {
  const bridgeOverride = process.env.ZCODE_ACP_BRIDGE;
  const bridge = bridgeOverride || fileURLToPath(new URL('./zcode-acp/node_modules/zcode-acp-server/dist/cli.js', import.meta.url));
  if (!bridgeOverride && !existsSync(bridge)) {
    const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const dependencyDir = fileURLToPath(new URL('./zcode-acp/', import.meta.url));
    const install = spawnSync(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: dependencyDir, stdio: ['ignore', 2, 2], windowsHide: true,
    });
    if (install.status !== 0) {
      console.error('Could not install the locked ZCode ACP bridge.');
      process.exit(1);
    }
  }
  const prefix = 'builtin:zai-coding-plan\\';
  const native = new Map([['glm-5.4', prefix + 'GLM-5.4'], ['glm-5.3', prefix + 'GLM-5.3'], ['glm-5.3-flash', prefix + 'GLM-5.3-Flash']]);
  const saved = new Map([...native].map(([key, value]) => [value, key]));
  const backend = process.env.ZCODE_BIN || 'D:/Program Files/ZCode/resources/glm/zcode.cjs';
  let preparationEnv = {};
  if (restricted) {
    if (!existsSync(backend)) throw Error('Preparation requires the native ZCode backend');
    const { builtinProviderEnv } = await import(new URL('./zcode-acp/node_modules/zcode-acp-server/dist/backend/resolve.js', import.meta.url));
    preparationEnv = { ...builtinProviderEnv(backend), ZCODE_BIN: self, CANOPUS_PREPARATION_ZCODE_BIN: backend };
  }
  function mapModelOptions(options) {
    for (const item of options ?? []) {
      if (item.category !== 'model' && item.id !== 'model') continue;
      item.currentValue = saved.get(item.currentValue) ?? item.currentValue;
      for (const option of item.options ?? []) option.value = saved.get(option.value) ?? option.value;
    }
  }
  const child = spawn(process.execPath, [bridge, 'server'], {
    env: { ...process.env, NODE_USE_SYSTEM_CA: '1', ZCODE_ACP_RUNTIME: 'node', ZCODE_ACP_MODE: 'guarded',
      ZCODE_BIN: process.env.ZCODE_BIN || (existsSync('D:/Program Files/ZCode/resources/glm/zcode.cjs') ? 'D:/Program Files/ZCode/resources/glm/zcode.cjs' : undefined),
      ...preparationEnv,
      XDG_CONFIG_HOME: fileURLToPath(new URL('./zcode-acp/xdg', import.meta.url)) },
    stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, detached: process.platform !== 'win32',
  });
  const lifecycle = supervise(child);
  const silence = createSilenceWatch(quietLimitMs);
  let timer;
  lifecycle.onStop(() => { clearTimeout(timer); silence.close(); });
  const duration = ms => ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60000).toFixed(1)} min`;
  function arm() {
    clearTimeout(timer);
    const deadline = silence.deadline();
    if (deadline === null || lifecycle.leaving()) return;
    // Cap the timer, not the configured deadline (Node otherwise overflows very large delays).
    timer = setTimeout(() => {
      const stuck = silence.due(performance.now());
      if (!stuck) return arm();
      const reason = stuck.reason === 'cancel' ? `cancel unanswered for ${duration(stuck.cancelledMs)}` : `no events for ${duration(stuck.quietMs)}`;
      void lifecycle.stop(1, `turn ${JSON.stringify(stuck.id)}: ${reason}; elapsed ${duration(stuck.elapsedMs)}`, {
        jsonrpc: '2.0', id: stuck.id, error: { code: -32000, message: `backend timeout: ${reason}`, data: stuck },
      });
    }, Math.min(2147483647, Math.max(0, deadline - performance.now())));
  }
  lifecycle.read(child.stdout, 'backend', msg => {
    mapModelOptions(msg.result?.configOptions);
    mapModelOptions(msg.params?.update?.configOptions);
    silence.event(msg, performance.now());
    silence.answered(msg);
    arm();
    lifecycle.forward(msg);
  });
  lifecycle.read(process.stdin, 'input', msg => {
    const p = msg.params;
    if (restricted && msg.method) {
      const supported = ['initialize', 'session/new', 'session/prompt', 'session/cancel', 'session/set_model'];
      const setting = msg.method === 'session/set_config_option' && ['model', 'effort'].includes(p?.configId);
      if (!supported.includes(msg.method) && !setting) {
        if (msg.id !== undefined) lifecycle.forward({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unavailable in Preparation' } });
        return;
      }
      if (msg.method === 'session/new' && p) p.mcpServers = [];
    }
    if (msg.method === 'session/set_config_option' && p?.configId === 'model') p.value = native.get(p.value) ?? p.value;
    if (msg.method === 'session/set_model' && p) p.modelId = native.get(p.modelId) ?? p.modelId;
    if (msg.method === 'session/prompt') {
      if (silence.open()) {
        lifecycle.forward({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'An ACP prompt is already open' } });
        return;
      }
      silence.prompt(msg.id, p?.sessionId, performance.now());
    }
    if (msg.method === 'session/cancel') silence.cancel(p?.sessionId, performance.now());
    arm();
    child.stdin.write(JSON.stringify(msg) + '\n');
  });
}
