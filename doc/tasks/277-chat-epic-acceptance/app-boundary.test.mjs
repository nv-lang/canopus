// Additional acceptance probes: actual app handlers, mocked DOM/transport only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as state from '../../../src/web/state.js';
import * as attention from '../../../src/web/attention.js';
import * as strings from '../../../src/web/strings.js';
import * as queue from '../../../src/web/queue.js';
import * as loading from '../../../src/web/loading.js';
import * as attachments from '../../../src/web/attachments.js';
import * as routes from '../../../src/web/routes.js';
import * as crew from '../../../src/web/crew-task.js';
import * as delivery from '../../../src/web/delivery.js';
import { chooseMode, parseAgentRegistry } from '../../../src/web/transport.js';

const memory = () => {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
};
async function app(storage = memory(), sendResult = true) {
  let callbacks;
  const sent = [];
  const context = {
    ...state, ...attention, ...strings, ...queue, ...attachments, ...routes, ...crew, ...delivery, ...loading,
    chooseMode, parseAgentRegistry, console, URLSearchParams, Date, Math, Promise,
    crypto: { randomUUID: () => `probe-${Math.random()}` },
    localStorage: storage, sessionStorage: memory(),
    location: { search: '', protocol: 'http:', host: 'probe.invalid', hash: '' },
    document: { documentElement: { setAttribute() {}, removeAttribute() {} }, getElementById() {}, addEventListener() {} },
    addEventListener() {}, requestAnimationFrame() {}, setInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ agents: [{ id: 'codex', label: 'Fixture' }] }) }),
    createNotifier: () => ({ bellOn: () => false, soundOn: () => false, update() {} }),
    createProjectsApi: () => ({ list: async () => ({ ok: true, projects: [] }) }),
    createView: () => ({ render() {}, tick() {}, setAgents() {} }),
    createTransport(deps) {
      callbacks = deps;
      return { start() {}, send(event) { sent.push(event); return sendResult; } };
    },
  };
  const source = fs.readFileSync(new URL('../../../src/web/app.js', import.meta.url), 'utf8');
  vm.createContext(context);
  vm.runInContext(source.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/g, '')
    .replace('start().then(', 'globalThis.started = start().then(')
    + '\nglobalThis.probe = { handlers, getModel: () => model, getUI: () => ui, patch: (id, value) => { model = patchDraft(model, id, value); } };', context);
  await context.started;
  return { ...context.probe, sent, storage, event: (kind, trace, input, step = 1) => callbacks.onEvent({ id: `srv-${Math.random()}`, trace, step, kind, input, time: Date.now() }) };
}
const plain = value => JSON.parse(JSON.stringify(value));

for (const source of [{ family: 'codex', model: 'fake-model-b', effort: 'high' }, { pool: 'mix', level: 'heavy' }]) {
  test(`277: first-session and outbox preserve ${source.pool ? 'pool' : 'direct'} source, preset, approvals and workspace`, async () => {
    const first = await app(undefined, false);
    first.handlers.onNewToggle(true);
    const draft = Object.values(first.getModel().sessions).find(s => s.draft);
    first.patch(draft.id, { source, preset: 'accept277', sourceBranch: 'refs/heads/chosen', worktree: true,
      projectId: 'p', project: 'Fixture', folder: 'C:/work/fixture', approvals: { codex: 'plan', second: 'yolo' } });
    assert.equal(first.handlers.onSend(draft.id, 'keep this text'), false);
    const created = first.sent.find(e => e.kind === 'session_created');
    assert.deepEqual(plain(created.input.source), source);
    assert.equal(created.input.preset, 'accept277');
    assert.equal(created.input.source_branch, 'refs/heads/chosen');
    assert.equal(created.input.workspace_explicit, true);
    assert.deepEqual(plain(created.input.approvals), { codex: 'plan', second: 'yolo' });
    const second = await app(first.storage);
    const restored = second.getModel().sessions[draft.id];
    assert.deepEqual(plain(restored.source), source);
    assert.equal(restored.preset, 'accept277');
    assert.equal(restored.sourceBranch, 'refs/heads/chosen');
    assert.deepEqual(plain(restored.approvals), { codex: 'plan', second: 'yolo' });
    assert.equal(second.handlers.deliveryItems(draft.id)[0].text, 'keep this text');
    assert.equal(second.sent.length, 0, 'reload is not a retry');
  });
}

test('277: projectless first-session payload strips stale folder/branch/worktree', async () => {
  const first = await app();
  first.handlers.onNewToggle(true);
  const draft = Object.values(first.getModel().sessions).find(s => s.draft);
  first.patch(draft.id, { projectId: '', project: '', folder: 'C:/work/stale', branch: 'stale', sourceBranch: 'refs/heads/stale', worktree: true });
  first.handlers.onSend(draft.id, 'projectless');
  const { input } = first.sent.find(e => e.kind === 'session_created');
  for (const key of ['project', 'project_id', 'folder', 'branch', 'source_branch']) assert.equal(key in input, false, key);
  assert.equal(input.worktree, false);
});

test('277: failed workspace receipt retains text and selection without automatic resend', async () => {
  const first = await app();
  first.handlers.onNewToggle(true);
  const draft = Object.values(first.getModel().sessions).find(s => s.draft);
  first.patch(draft.id, { source: { pool: 'mix', level: 'heavy' }, approvals: { codex: 'plan' } });
  first.handlers.onSend(draft.id, 'workspace must not fall back');
  const saved = first.handlers.deliveryItems(draft.id)[0];
  first.event('error', draft.id, { client_id: saved.id, message: 'Сообщение не отправлено агенту: рабочая папка не готова', turn: '' });
  first.event('message_delivery', draft.id, { client_id: saved.id, accepted: false, turn: '' }, 2);
  const second = await app(first.storage);
  assert.equal(second.handlers.deliveryItems(draft.id)[0].text, 'workspace must not fall back');
  assert.deepEqual(plain(second.getModel().sessions[draft.id].source), { pool: 'mix', level: 'heavy' });
  assert.deepEqual(plain(second.getModel().sessions[draft.id].approvals), { codex: 'plan' });
  assert.equal(second.sent.length, 0);
});
