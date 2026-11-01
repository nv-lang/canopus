import test from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { endpointOf, generate, optionsOf, parseAnswer, serve, serviceTransport } from './preparation-agent.mjs';

const rootOf = async (t) => {
  const root = await mkdtemp(path.join(process.env.TEMP || os.tmpdir(), 'crew-preparation-271-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
};
const response = (value) => new Response(JSON.stringify({ data: { text: JSON.stringify(value) } }), { status: 200 });

test('RED controls: no path/tool/native mode/git action can enter the document protocol', () => {
  for (const extra of [{ path: '../src/main.nv' }, { tools: ['bash'] }, { permissions: 'allow' }, { action: 'git worktree add' }, { crew_spawn: {} }, { native_permissions: 'yolo' }]) {
    assert.throws(() => parseAnswer(JSON.stringify({ reply: 'x', ...extra })), /не разрешено/);
  }
  for (const value of [null, [], {}, { reply: 4 }, { reply: 'x', statement: false }]) assert.throws(() => parseAnswer(JSON.stringify(value)));
  for (const url of ['https://127.0.0.1/api/experimental/generate/text', 'http://example.com/api/experimental/generate/text', 'http://127.0.0.1/api/session/create', 'http://localhost/api/experimental/generate/text?tools=true', 'http://localhost/api/experimental/generate']) assert.throws(() => endpointOf(url));
  const credentialed = new URL('http://localhost/api/experimental/generate/text');
  credentialed.username = 'fixture-user';
  credentialed.password = 'example';
  assert.throws(() => endpointOf(credentialed.href));
});

test('host arguments cannot be reinterpreted as target or endpoint overrides', () => {
  const options = optionsOf(['--variant', '--root', '--root', 'C:/work/assigned']);
  assert.equal(options['--variant'], '--root');
  assert.equal(options['--root'], 'C:/work/assigned');
  assert.throws(() => optionsOf(['--root', 'a', '--root', 'b']));
  assert.throws(() => optionsOf(['--endpoint', 'http://outside']));
  assert.throws(() => optionsOf(['--tools', 'bash']));
});

test('GREEN: text generation writes only assigned task/message.md, keeps session history and sends no tools', async (t) => {
  const root = await rootOf(t);
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(JSON.parse(options.body));
    assert.deepEqual(Object.keys(calls.at(-1)).sort(), ['model', 'prompt']);
    assert.deepEqual(calls.at(-1).model, { providerID: 'existing', id: 'selected' });
    assert.equal(options.redirect, 'error');
    return response({ reply: 'Уточним критерии', statement: '# Задание\nКритерий: тест зелёный' });
  };
  const config = { endpoint: 'http://127.0.0.1:12345/api/experimental/generate/text', model: 'existing/selected', root, fetcher };
  await generate({ ...config, message: 'Обсудим задачу' });
  await generate({ ...config, message: 'Добавь ограничение' });
  assert.match(calls[1].prompt, /Обсудим задачу/);
  assert.match(calls[1].prompt, /Критерий: тест зелёный/);
  assert.match(await readFile(path.join(root, 'task/message.md'), 'utf8'), /Критерий/);
  assert.deepEqual((await readdir(root)).sort(), ['history.json', 'task']);
  assert.deepEqual(await readdir(path.join(root, 'task')), ['message.md']);
});

test('real local fake HTTP: 2.2.5 registration supplies auth only to the verified stateless endpoint', async (t) => {
  const temporary = await rootOf(t);
  const root = path.join(temporary, 'session');
  const requests = [];
  const server = createServer(async (request, reply) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push({ path: request.url, auth: request.headers.authorization, body: JSON.parse(raw) });
    reply.writeHead(200, { 'Content-Type': 'application/json' });
    reply.end(JSON.stringify({ data: { text: JSON.stringify({ reply: 'Обсудим критерии', statement: '# Задание\nБез реализации' }) } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const registration = path.join(temporary, 'fixture-service.json');
  const password = 'example';
  await writeFile(registration, JSON.stringify({ version: '2.2.5', url: `http://127.0.0.1:${server.address().port}`, password }));
  const transport = await serviceTransport(registration);
  await generate({ ...transport, model: 'existing/selected', root, message: 'Подготовь задачу' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/api/experimental/generate/text');
  assert.equal(requests[0].auth, `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`);
  assert.deepEqual(Object.keys(requests[0].body).sort(), ['model', 'prompt']);
  assert.ok(!requests[0].body.prompt.includes(password));
  assert.ok(!requests[0].body.prompt.includes(registration));
  assert.match(await readFile(path.join(root, 'task/message.md'), 'utf8'), /Без реализации/);
  await writeFile(registration, JSON.stringify({ version: '2.2.5', url: 'http://example.com', password }));
  await assert.rejects(serviceTransport(registration));
  assert.equal(requests.length, 1, 'untrusted registration never receives auth');
});

test('cancelled generation writes no document; a later turn and a restored adapter retain the valid statement', async (t) => {
  const root = await rootOf(t);
  const controller = new AbortController();
  const config = { endpoint: 'http://localhost/api/experimental/generate/text', model: 'existing/selected', root };
  const pending = generate({ ...config, message: 'отменить', signal: controller.signal, fetcher: async () => { controller.abort(); return response({ reply: 'нет', statement: 'не сохранять' }); } });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(await readdir(root), []);
  await generate({ ...config, message: 'сохранить', fetcher: async () => response({ reply: 'готово', statement: '# Сохранённая задача' }) });
  let restoredPrompt = '';
  await generate({ ...config, message: 'уточни', fetcher: async (_url, options) => { restoredPrompt = JSON.parse(options.body).prompt; return response({ reply: 'уточняем' }); } });
  assert.match(restoredPrompt, /Сохранённая задача/);
  assert.match(restoredPrompt, /сохранить/);
  assert.equal(await readFile(path.join(root, 'task/message.md'), 'utf8'), '# Сохранённая задача');
});

test('malicious model output and unsupported transport do not create a document', async (t) => {
  const root = await rootOf(t);
  await assert.rejects(generate({ endpoint: 'http://localhost/api/experimental/generate/text', model: 'existing/selected', root, message: 'реализуй', fetcher: async () => response({ reply: 'x', path: '../outside', action: 'shell' }) }), /не разрешено/);
  assert.deepEqual(await readdir(root), []);
  await assert.rejects(generate({ endpoint: 'http://localhost/api/experimental/generate/text', model: 'existing/selected', root, message: 'x', fetcher: async () => new Response('{}', { status: 503 }) }), /503/);
  assert.deepEqual(await readdir(root), []);
});

test('a linked assigned root is rejected before a model request', async (t) => {
  const root = await rootOf(t);
  const linked = `${root}-link`;
  await symlink(root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => rm(linked, { force: true, recursive: true }));
  let called = false;
  await assert.rejects(generate({ endpoint: 'http://localhost/api/experimental/generate/text', model: 'existing/selected', root: linked, message: 'x', fetcher: async () => { called = true; return response({ reply: 'x' }); } }), /Ссылка/);
  assert.equal(called, false);
});

test('a hard-linked statement cannot expose or overwrite an implementation file', async (t) => {
  const temporary = await rootOf(t);
  const root = path.join(temporary, 'session');
  const source = path.join(temporary, 'source.nv');
  await mkdir(path.join(root, 'task'), { recursive: true });
  await writeFile(source, 'original implementation');
  await link(source, path.join(root, 'task/message.md'));
  let called = false;
  await assert.rejects(generate({ endpoint: 'http://localhost/api/experimental/generate/text', model: 'existing/selected', root, message: 'изменить', fetcher: async () => { called = true; return response({ reply: 'нет', statement: 'bad' }); } }), /Ссылка/);
  assert.equal(called, false);
  assert.equal(await readFile(source, 'utf8'), 'original implementation');
});

test('ACP accepts a conversation but refuses filesystem, shell, tools and broader native permissions', async (t) => {
  const root = await rootOf(t);
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  let buffer = '';
  output.on('data', (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) { const end = buffer.indexOf('\n'); messages.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); }
  });
  const running = serve({ endpoint: 'http://localhost/api/experimental/generate/text', model: 'existing/selected', root, input, output, fetcher: async () => response({ reply: 'Обсуждаем', statement: '# Постановка' }) });
  const send = (id, method, params = {}) => input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  send(1, 'initialize');
  send(2, 'session/new', { cwd: 'C:/outside', mcpServers: [{ name: 'shell', command: 'cmd' }] });
  send(3, 'session/set_mode', { modeId: 'yolo' });
  send(4, 'terminal/create', { command: 'git', args: ['worktree', 'add'] });
  send(5, 'fs/write_text_file', { path: '../src/main.nv', content: 'bad' });
  send(6, 'session/prompt', { sessionId: 'preparation', prompt: [{ type: 'text', text: 'Подготовь постановку, но не реализуй' }] });
  const deadline = Date.now() + 3000;
  while (!messages.some((item) => item.id === 6) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  input.end();
  await running;
  for (const id of [3, 4, 5]) assert.ok(messages.find((item) => item.id === id)?.error);
  assert.equal(messages.find((item) => item.id === 6)?.result.stopReason, 'end_turn');
  assert.ok(messages.some((item) => item.method === 'session/update' && item.params.update.content.text.includes('Обсуждаем')));
  assert.deepEqual(await readdir(path.join(root, 'task')), ['message.md']);
});

test('standalone adapter: fixture HTTP, actual ACP process, restart and a Git ancestor do not expand the write target', async (t) => {
  const temporary = await rootOf(t);
  const root = path.join(temporary, 'session');
  const registration = path.join(temporary, 'fixture-service.json');
  await writeFile(path.join(temporary, '.git'), 'fixture Git ancestor marker');
  let lastPrompt = '';
  const server = createServer(async (request, reply) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(request.url, '/api/experimental/generate/text');
    assert.deepEqual(Object.keys(body).sort(), ['model', 'prompt']);
    lastPrompt = body.prompt;
    reply.writeHead(200, { 'Content-Type': 'application/json' });
    reply.end(JSON.stringify({ data: { text: JSON.stringify({ reply: 'Постановка без реализации', statement: '# Работа\nКритерий: проверяемый результат' }) } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await writeFile(registration, JSON.stringify({ version: '2.2.5', url: `http://127.0.0.1:${server.address().port}`, password: 'example' }));
  const start = () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./preparation-agent.mjs', import.meta.url)), '--service-registration', registration, '--model', 'existing/selected', '--root', root], { stdio: ['pipe', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    const messages = [];
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\n')) { const end = buffer.indexOf('\n'); messages.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); }
    });
    const request = async (id, method, params = {}) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      const deadline = Date.now() + 5000;
      while (!messages.some((item) => item.id === id) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
      const answer = messages.find((item) => item.id === id);
      assert.ok(answer, `ACP response ${id} was not received`);
      return answer;
    };
    return { child, request };
  };
  const first = start();
  assert.ok((await first.request(1, 'initialize')).result);
  assert.equal((await first.request(2, 'session/new', { cwd: temporary, mcpServers: [{ name: 'shell' }] })).result.models.currentModelId, 'existing/selected');
  assert.ok((await first.request(3, 'session/set_mode', { modeId: 'yolo' })).error);
  assert.equal((await first.request(4, 'session/prompt', { sessionId: 'preparation', prompt: [{ type: 'text', text: 'Сохрани критерий' }] })).result.stopReason, 'end_turn');
  first.child.stdin.end();
  await new Promise((resolve) => first.child.once('exit', resolve));
  const restored = start();
  await restored.request(1, 'initialize');
  await restored.request(2, 'session/new');
  assert.equal((await restored.request(3, 'session/prompt', { sessionId: 'preparation', prompt: [{ type: 'text', text: 'Продолжим обсуждение' }] })).result.stopReason, 'end_turn');
  assert.match(lastPrompt, /Сохрани критерий/);
  assert.match(lastPrompt, /Критерий: проверяемый результат/);
  assert.equal(await readFile(path.join(temporary, '.git'), 'utf8'), 'fixture Git ancestor marker');
  assert.deepEqual(await readdir(path.join(root, 'task')), ['message.md']);
  restored.child.stdin.end();
  await new Promise((resolve) => restored.child.once('exit', resolve));
});
