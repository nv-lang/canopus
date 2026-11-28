// Real local recognizer and front API, prerecorded fixture only. No microphone API.
// node .../stt-prerecorded.mjs <contour-artifacts> <whisper-server> <model> <wav>
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
const [dir, program, model, wav] = process.argv.slice(2);
const contour = JSON.parse(fs.readFileSync(path.join(dir, 'contour.json')));
const port = 19377, checks = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`); };
let recognizer;
try {
  await new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(port, '127.0.0.1', () => s.close(resolve)); });
  const help = spawnSync(program, ['--help'], { encoding: 'utf8', windowsHide: true });
  const helpText = help.stdout + help.stderr;
  const args = ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-t', '1'];
  if (helpText.includes('--no-gpu')) args.push('--no-gpu');
  const log = fs.openSync(path.join(dir, 'whisper.log'), 'a');
  recognizer = spawn(program, args, { windowsHide: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  let ready = false;
  for (let i = 0; i < 300; i++) {
    if (recognizer.exitCode !== null) throw Error(`isolated recognizer exited ${recognizer.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  check('isolated recognizer is healthy on its own port', ready);
  if (!ready) throw Error('recognizer startup timed out');
  const status = await (await fetch(`http://127.0.0.1:${contour.port}/api/stt/status`)).json();
  check('real front detects the unmanaged local recognizer', status.available === true);
  const bytes = fs.readFileSync(wav);
  const response = await fetch(`http://127.0.0.1:${contour.port}/api/stt?lang=en`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: bytes, signal: AbortSignal.timeout(120000) });
  const text = await response.json();
  fs.writeFileSync(path.join(dir, 'stt-response.json'), JSON.stringify(text, null, 2));
  check('prerecorded JFK WAV is transcribed through real front and local Whisper', response.status === 200 && /country/i.test(text.text || ''), JSON.stringify(text));
  const invalid = await fetch(`http://127.0.0.1:${contour.port}/api/stt?lang=en`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: 'not a wave' });
  check('front rejects invalid audio before inference', invalid.status === 400);
  const foreign = await fetch(`http://127.0.0.1:${contour.port}/api/stt?lang=en`, { method: 'POST', headers: { 'content-type': 'audio/wav', Origin: 'http://foreign.example' }, body: bytes });
  check('front rejects a foreign-origin audio upload', foreign.status === 403);
} catch (error) { check('prerecorded STT harness completed', false, error.stack); }
finally {
  if (recognizer?.pid) {
    recognizer.kill();
    if (recognizer.exitCode === null) await Promise.race([new Promise(r => recognizer.once('exit', r)), sleep(2000)]);
    if (recognizer.exitCode === null) spawnSync('taskkill', ['/PID', String(recognizer.pid), '/T', '/F'], { windowsHide: true });
  }
  fs.writeFileSync(path.join(dir, 'stt-result.json'), JSON.stringify({ recordedMicrophone: false, realRecognizer: true, checks, pass: checks.filter(c=>c.ok).length, fail: checks.filter(c=>!c.ok).length }, null, 2));
  console.log(`RESULT ${checks.filter(c=>c.ok).length}/${checks.length}; only our recognizer stopped`);
  process.exitCode = checks.every(c=>c.ok) ? 0 : 1;
}
