import assert from 'node:assert/strict';
import test from 'node:test';
import { createSilenceWatch } from './acp-silence.mjs';

const update = sessionId => ({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: {} } });
const result = id => ({ jsonrpc: '2.0', id, result: {} });

test('silence belongs to the open prompt and its session', () => {
  const watch = createSilenceWatch(1000);
  assert.equal(watch.deadline(), null);
  assert.equal(watch.due(5000), null);
  watch.prompt('p1', 's1', 1000);
  assert.equal(watch.due(1999), null);
  assert.deepEqual(watch.due(2000), {
    id: 'p1', sessionId: 's1', quietMs: 1000, elapsedMs: 1000, cancelledMs: null, reason: 'silence',
  });
  watch.event(update('s1'), 2500);
  assert.equal(watch.deadline(), 3500);
  assert.equal(watch.due(3499), null);
  assert.equal(watch.due(3500).elapsedMs, 2500);
  watch.answered(result('p1'));
  assert.equal(watch.open(), false);
  assert.equal(watch.due(99999), null);
});

test('foreign sessions, missing sessions and reverse RPCs do not renew silence', () => {
  const watch = createSilenceWatch(1000);
  watch.prompt(3, 's1', 0);
  watch.event(update('s2'), 500);
  watch.event(update(undefined), 600);
  watch.event({ ...update('s1'), id: 3 }, 700);
  watch.event({ method: 'session/request_permission', id: 3, params: { sessionId: 's1' } }, 800);
  assert.equal(watch.deadline(), 1000);
});

test('only a terminal response with an exactly typed id closes the turn', () => {
  const watch = createSilenceWatch(1000);
  watch.prompt(3, 's1', 0);
  for (const message of [result('3'), result(4), { id: 3 }, { id: 3, result: {} },
    { jsonrpc: '2.0', id: 3, error: null }, { jsonrpc: '2.0', id: 3, error: {} },
    { ...result(3), method: 'session/request_permission' }, { ...result(3), method: null },
    { ...result(3), error: { code: -1, message: 'ambiguous' } }]) {
    watch.answered(message);
    assert.equal(watch.open(), true, JSON.stringify(message));
  }
  watch.answered({ jsonrpc: '2.0', id: 3, error: { code: -1, message: 'failed' } });
  assert.equal(watch.open(), false);
  // No null sentinel confusion: null is a JSON-RPC id too, although discouraged by the protocol.
  watch.prompt(null, 's2', 10);
  watch.answered(result('null'));
  assert.equal(watch.open(), true);
  watch.answered(result(null));
  assert.equal(watch.open(), false);
});

test('cancel has a fixed two-second deadline unaffected by updates or repeated cancels', () => {
  const watch = createSilenceWatch(10000);
  watch.prompt('p', 's', 0);
  watch.cancel('foreign', 100);
  assert.equal(watch.deadline(), 10000);
  watch.cancel('s', 500);
  watch.event(update('s'), 1000);
  watch.cancel('s', 2000);
  watch.event(update('s'), 2400);
  assert.equal(watch.deadline(), 2500);
  assert.equal(watch.due(2499), null);
  assert.deepEqual(watch.due(2500), {
    id: 'p', sessionId: 's', quietMs: 100, elapsedMs: 2500, cancelledMs: 2000, reason: 'cancel',
  });
  watch.answered(result('p'));
  assert.equal(watch.deadline(), null);
});

test('cancel never extends an earlier silence deadline', () => {
  const watch = createSilenceWatch(100);
  watch.prompt('p', 's', 0);
  watch.cancel('s', 50);
  assert.equal(watch.deadline(), 100);
  assert.equal(watch.due(100).reason, 'silence');
  watch.close();
  assert.equal(watch.due(10000), null);
});

test('a second prompt cannot overwrite an outstanding prompt or cancel', () => {
  const watch = createSilenceWatch(1000);
  watch.prompt('p', 's', 0);
  watch.cancel('s', 10);
  assert.throws(() => watch.prompt('p2', 'other', 500), /already open/);
  assert.equal(watch.deadline(), 1000);
  assert.equal(watch.due(1000).id, 'p');
});

test('invalid limits and prompt identities fail rather than disabling protection', () => {
  for (const limit of [0, -1, NaN, Infinity, '1000', undefined]) {
    assert.throws(() => createSilenceWatch(limit), /positive and finite/);
  }
  const watch = createSilenceWatch(100);
  assert.throws(() => watch.prompt(undefined, 's', 0), /request id/);
  assert.throws(() => watch.prompt('p', undefined, 0), /sessionId/);
  assert.equal(watch.open(), false);
});
