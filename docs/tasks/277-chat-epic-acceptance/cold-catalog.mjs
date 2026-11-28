// Full new-chat choice must not depend on an earlier API-only session warming a family.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2]);
const { port } = JSON.parse(fs.readFileSync(path.join(dir, 'contour.json')));
const base = `http://127.0.0.1:${port}`;
const read = async url => (await fetch(base + url)).json();
const agents = await read('/api/agents'), before = await read('/api/agent-catalog');
const results = [];
const check = (name, ok) => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
check('configured cold second family is present in actual registry', agents.agents.some(a => a.id === 'second'));
check('REQ-05: configured second family offers models before its first chat', (before.agents?.second?.models || []).length > 0);
const events = [], ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
ws.onmessage = m => { const x = JSON.parse(m.data); events.push(...(Array.isArray(x) ? x : [x])); };
try {
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.send(JSON.stringify({ id: 'cold-catalog-277', trace: 's-catalog-second', step: 0, kind: 'session_created', time: Date.now(), input: { name: 'Catalog capability probe', agent: 'second', worktree: false } }));
  const deadline = Date.now() + 15000;
  while (!events.some(e => e.trace === 's-catalog-second' && e.kind === 'session_model') && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  // The catalog file is deliberately debounced for 2 seconds.
  await new Promise(r => setTimeout(r, 2200));
  const after = await read('/api/agent-catalog');
  check('the same configured fixture actually supports models when an API-only session warms it', (after.agents?.second?.models || []).length > 0);
  fs.writeFileSync(path.join(dir, 'cold-catalog-result.json'), JSON.stringify({ checks: results, agents, before, after,
    pass: results.filter(r=>r.ok).length, fail: results.filter(r=>!r.ok).length }, null, 2));
} finally { ws.close(); }
console.log(`RESULT ${results.filter(r=>r.ok).length}/${results.length}`);
process.exitCode = results.every(r=>r.ok) ? 0 : 1;
