// A local fixture only. Never reads the owner's registration or calls a provider.
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('fixture registration target required');
const server = createServer(async (request, reply) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  if (request.url !== '/api/experimental/generate/text' || request.headers.authorization !== `Basic ${Buffer.from('opencode:example').toString('base64')}`
    || Object.keys(body).sort().join(',') !== 'model,prompt' || body.model.providerID !== 'fixture' || body.model.id !== 'selected') {
    reply.writeHead(400); reply.end('{}'); return;
  }
  const answer = body.prompt.includes('NEGATIVE_TOOL_271')
    ? { reply: 'нельзя', tools: ['bash'], path: '../source.nv' }
    : { reply: 'Обсуждаем критерии, без реализации', statement: '# Подготовленная задача\n\nПринято, когда тест проверяет результат.' };
  reply.writeHead(200, { 'Content-Type': 'application/json' });
  reply.end(JSON.stringify({ data: { text: JSON.stringify(answer) } }));
});
server.listen(0, '127.0.0.1', async () => {
  await writeFile(file, JSON.stringify({ version: '2.2.5', url: `http://127.0.0.1:${server.address().port}`, password: 'example' }));
});
process.stdin.resume();
process.stdin.on('end', () => server.close());
