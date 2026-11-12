import { createReadStream, createWriteStream } from 'node:fs';
import { open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';

const dir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw Error('Usage: node build-replay-checkpoint.mjs <stopped-session-directory>');
const journal = join(dir, 'journal');
const snapshot = join(dir, 'snapshot');
const before = await stat(journal);
const saved = await readFile(snapshot, 'utf8');
const { step, data } = JSON.parse(saved);
const engine = typeof data === 'string' ? JSON.parse(data) : data;
if (!Number.isSafeInteger(step) || step < 1 || !Array.isArray(engine?.open_requests) || engine.open_requests.length) {
  throw Error('Checkpoint requires a settled engine snapshot');
}

const anchorSize = 64;
const source = await open(journal, 'r');
const first = Buffer.alloc(anchorSize);
const end = Buffer.alloc(anchorSize);
try {
  if (before.size < anchorSize ||
      (await source.read(first, 0, anchorSize, 0)).bytesRead !== anchorSize ||
      (await source.read(end, 0, anchorSize, before.size - anchorSize)).bytesRead !== anchorSize ||
      end.at(-1) !== 10) throw Error('Journal is incomplete');
} finally {
  await source.close();
}

const recovery = new Set(['engine_resumed', 'reply_discarded', 'request_sent', 'cancel_ordered',
  'cancel_sent', 'signal_ordered', 'signal_passed']);
const checkpoint = join(dir, 'replay-checkpoint.journal');
const metadata = join(dir, 'replay-checkpoint.json');
const staged = checkpoint + '.' + process.pid + '.tmp';
const stagedMeta = metadata + '.' + process.pid + '.tmp';
const output = createWriteStream(staged, { flags: 'wx' });
const complete = finished(output);
complete.catch(() => {});
let records = 0;
try {
  const lines = createInterface({ input: createReadStream(journal), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!Number.isSafeInteger(row.step) || row.step > step) throw Error('Journal has uncommitted records');
    const { code, params } = row.event;
    if (code !== 'event_accepted' && !recovery.has(code)) continue;
    let text = line;
    if (code === 'event_accepted' && params.name === 'agent_thought' && params.kind === 'progress') {
      if (!params.source) continue;
      // The UI ignores thoughts. Alula still needs their committed source keys
      // to acknowledge inbox events after restart.
      text = JSON.stringify({ ...row, cause: '', state: '', request: '', at: 0,
        event: { code, params: { source: params.source } } });
    }
    if (!output.write(text + '\n')) await once(output, 'drain');
    records++;
  }
  output.end();
  await complete;
  const after = await stat(journal);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || saved !== await readFile(snapshot, 'utf8')) {
    throw Error('Session changed while building the checkpoint');
  }
  if (!records) throw Error('Checkpoint has no recovery records');
  await writeFile(stagedMeta, JSON.stringify({ version: 1, step, offset: before.size, records,
    first: first.toString('utf8'), end: end.toString('utf8') }), { flag: 'wx' });
  await rename(staged, checkpoint);
  await rename(stagedMeta, metadata);
  console.log(JSON.stringify({ step, offset: before.size, records, checkpointBytes: (await stat(checkpoint)).size }));
} finally {
  output.destroy();
  await Promise.all([staged, stagedMeta].map(file => unlink(file).catch(() => {})));
}
