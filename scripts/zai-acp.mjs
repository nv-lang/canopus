import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const restricted = process.argv[2] === '--preparation';
const nativeBackend = process.env.CANOPUS_PREPARATION_ZCODE_BIN;

if (process.argv[2] === 'app-server' && nativeBackend) {
  const child = spawn(process.execPath, [nativeBackend, ...process.argv.slice(2)], {
    stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true,
  });
  const forbidden = new Set(['session/resume', 'session/load', 'session/setMode']);
  createInterface({ input: process.stdin }).on('line', line => {
    const message = JSON.parse(line);
    if (forbidden.has(message.method)) {
      process.stdout.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unavailable in Preparation' } }) + '\n');
      return;
    }
    if (message.method === 'session/create') {
      Object.assign(message.params, { mode: 'plan', toolAllowlist: [], mcpServers: [],
        persistence: 'deferred', titleGenerationEnabled: false, dynamicWorkflowEnabled: false });
    }
    child.stdin.write(JSON.stringify(message) + '\n');
  });
  child.stdin.on('error', () => {});
  process.stdin.on('end', () => child.stdin.end());
  child.on('exit', code => process.exit(code ?? 1));
  child.on('error', () => process.exit(1));
} else {
  const bridge = fileURLToPath(new URL('./zcode-acp/node_modules/zcode-acp-server/dist/cli.js', import.meta.url));
  if (!existsSync(bridge)) {
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
  const native = new Map([['glm-5.3', prefix + 'GLM-5.3'], ['glm-5.3-flash', prefix + 'GLM-5.3-Flash']]);
  const saved = new Map([...native].map(([key, value]) => [value, key]));
  const backend = process.env.ZCODE_BIN || 'D:/Program Files/ZCode/resources/glm/zcode.cjs';
  let preparationEnv = {};
  if (restricted) {
    if (!existsSync(backend)) throw Error('Preparation requires the native ZCode backend');
    const { builtinProviderEnv } = await import(new URL('./zcode-acp/node_modules/zcode-acp-server/dist/backend/resolve.js', import.meta.url));
    preparationEnv = { ...builtinProviderEnv(backend), ZCODE_BIN: self, CANOPUS_PREPARATION_ZCODE_BIN: backend };
  }
  const child = spawn(process.execPath, [bridge, 'server'], {
    env: { ...process.env, NODE_USE_SYSTEM_CA: '1', ZCODE_ACP_RUNTIME: 'node', ZCODE_ACP_MODE: 'guarded',
      ZCODE_BIN: process.env.ZCODE_BIN || (existsSync('D:/Program Files/ZCode/resources/glm/zcode.cjs') ? 'D:/Program Files/ZCode/resources/glm/zcode.cjs' : undefined),
      ...preparationEnv,
      XDG_CONFIG_HOME: fileURLToPath(new URL('./zcode-acp/xdg', import.meta.url)) },
    stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true,
  });
  function mapModelOptions(options) {
    for (const item of options ?? []) {
      if (item.category !== 'model' && item.id !== 'model') continue;
      item.currentValue = saved.get(item.currentValue) ?? item.currentValue;
      for (const option of item.options ?? []) option.value = saved.get(option.value) ?? option.value;
    }
  }
  createInterface({ input: process.stdin }).on('line', line => {
    const msg = JSON.parse(line);
    const p = msg.params;
    if (restricted && msg.method) {
      const supported = ['initialize', 'session/new', 'session/prompt', 'session/cancel', 'session/set_model'];
      const setting = msg.method === 'session/set_config_option' && ['model', 'effort'].includes(p?.configId);
      if (!supported.includes(msg.method) && !setting) {
        if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unavailable in Preparation' } }) + '\n');
        return;
      }
      if (msg.method === 'session/new' && p) p.mcpServers = [];
    }
    if (msg.method === 'session/set_config_option' && p?.configId === 'model') p.value = native.get(p.value) ?? p.value;
    if (msg.method === 'session/set_model' && p) p.modelId = native.get(p.modelId) ?? p.modelId;
    child.stdin.write(JSON.stringify(msg) + '\n');
  });
  createInterface({ input: child.stdout }).on('line', line => {
    const msg = JSON.parse(line);
    mapModelOptions(msg.result?.configOptions);
    mapModelOptions(msg.params?.update?.configOptions);
    process.stdout.write(JSON.stringify(msg) + '\n');
  });
  child.stdin.on('error', () => {});
  process.stdin.on('end', () => child.stdin.end());
  child.on('exit', code => process.exit(code ?? 1));
  child.on('error', error => { console.error(error.message); process.exit(1); });
}
