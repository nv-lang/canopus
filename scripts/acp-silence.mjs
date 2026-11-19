// Silence belongs to one exact ACP request and session, not to transport activity (task 317).
export function createSilenceWatch(limitMs) {
  if (!Number.isFinite(limitMs) || limitMs <= 0) throw new RangeError('ACP silence limit must be positive and finite');
  let turn = null;
  const deadline = () => turn === null ? null : Math.min(turn.lastAt + limitMs, turn.cancelAt === null ? Infinity : turn.cancelAt + 2000);
  return {
    prompt(id, sessionId, now) {
      if (turn !== null) throw new Error('An ACP prompt is already open');
      if (!(id === null || typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)))) {
        throw new TypeError('ACP prompt requires a request id');
      }
      if (typeof sessionId !== 'string' || !sessionId) throw new TypeError('ACP prompt requires a sessionId');
      turn = { id, sessionId, startedAt: now, lastAt: now, cancelAt: null };
    },
    event(message, now) {
      if (turn && message.method === 'session/update' && !Object.hasOwn(message, 'id') &&
          message.params?.sessionId === turn.sessionId) turn.lastAt = now;
    },
    answered(message) {
      const hasResult = Object.hasOwn(message, 'result');
      const hasError = Object.hasOwn(message, 'error');
      const validError = Number.isInteger(message.error?.code) && typeof message.error?.message === 'string';
      if (turn && message.jsonrpc === '2.0' && !Object.hasOwn(message, 'method') &&
          Object.hasOwn(message, 'id') && message.id === turn.id && hasResult !== hasError &&
          (hasResult || validError)) turn = null;
    },
    cancel(sessionId, now) {
      if (turn && sessionId === turn.sessionId && turn.cancelAt === null) turn.cancelAt = now;
    },
    close() { turn = null; },
    open() { return turn !== null; },
    deadline,
    due(now) {
      if (turn === null || now < deadline()) return null;
      const cancelledMs = turn.cancelAt === null ? null : now - turn.cancelAt;
      return { id: turn.id, sessionId: turn.sessionId, quietMs: now - turn.lastAt,
        elapsedMs: now - turn.startedAt, cancelledMs,
        reason: cancelledMs !== null && cancelledMs >= 2000 ? 'cancel' : 'silence' };
    },
  };
}
