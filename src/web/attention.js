// attention.js — задача 192.14: когда сессия ждёт владельца. Чистые функции, без DOM и часов (время приходит параметром).
//
// Состояния строки списка: running (идёт), waiting (ждёт вас), unread (закончила ход, непрочитанное), error (ошибка), silent (молчит N мин), idle.
// Подсветка ожидает действия по открытой форме, разрешению или пункту чек-листа владельца.

/** Сколько минут без событий от агента при идущем ходе — «молчит» (настройка `agent_silent_minutes`, по умолчанию 5). */
export const SILENT_DEFAULT_MIN = 5;

/** Последнее сообщение агента сессии, если оно закончено. */
export function lastAgentDone(session) {
  const m = [...session.messages].reverse().find((x) => x.role === 'agent');
  return m && m.status === 'done' ? m : null;
}

/** Есть ли в чек-листе задачи неотмеченный пункт «Владелец …». */
export function ownerItemOpen(session) {
  const task = session.routeState && session.routeState.task;
  if (!task || !Array.isArray(task.subtasks)) return false;
  return task.subtasks.some((s) => Array.isArray(s.items) && s.items.some((x) => !x.done && /^\s*владелец/i.test(x.text)));
}

/** Нужен ли владелец этой сессии, и по какой причине: 'question' | 'permission' | 'checklist' | '' . */
export function needsOwnerReason(session) {
  if (!session || session.draft) return '';
  if (session.pendingQuestion) return 'question';
  if (session.state === 'permission') return 'permission';
  if (session.state !== 'idle') return '';
  const last = lastAgentDone(session);
  if (!last) return '';
  if (ownerItemOpen(session)) return 'checklist';
  return '';
}

export const needsOwner = (session) => needsOwnerReason(session) !== '';

/** Ключ «что именно ждёт»: по нему запоминается, что владелец уже открыл сессию (подсветка гаснет). */
export function waitKey(session) {
  const reason = needsOwnerReason(session);
  if (reason === '') return '';
  if (reason === 'question') return `q:${session.pendingQuestion.request}`;
  const last = lastAgentDone(session);
  return `${reason}:${last ? last.turn : session.id}`;
}

/** Сколько минут сессия молчит при идущем ходе (0 — не молчит). `silentMin` 0 — выключено. */
export function silentMinutes(session, now, silentMin = SILENT_DEFAULT_MIN) {
  if (!session || silentMin <= 0 || session.state !== 'answering') return 0;
  const last = Math.max(session.updatedAt || 0, session.turnStartedAt || 0);
  if (last <= 0) return 0;
  const minutes = Math.floor((now - last) / 60000);
  return minutes >= silentMin ? minutes : 0;
}

/**
 * Состояние строки списка. ctx: { now, silentMin, unread: bool, acked: ключ, который владелец уже видел }.
 * Возвращает { state, blink, minutes }: blink — мигать (ждёт и владелец ещё не открывал).
 */
export function attention(session, ctx = {}) {
  const { now = 0, silentMin = SILENT_DEFAULT_MIN, unread = false, acked = '' } = ctx;
  if (session.state === 'error' || session.state === 'refused') return { state: 'error', blink: false, minutes: 0 };
  const key = waitKey(session);
  if (key !== '') return { state: 'waiting', blink: key !== acked, minutes: 0 };
  const minutes = silentMinutes(session, now, silentMin);
  if (minutes > 0) return { state: 'silent', blink: false, minutes };
  if (session.state === 'answering') return { state: 'running', blink: false, minutes: 0 };
  if (unread) return { state: 'unread', blink: false, minutes: 0 };
  return { state: 'idle', blink: false, minutes: 0 };
}

/** Ключи ждущих сессий, которых владелец ещё не открывал: «id|ключ». */
export function waitingKeys(sessions, acked = {}) {
  const out = [];
  for (const s of sessions) {
    if (s.draft) continue;
    const key = waitKey(s);
    if (key !== '' && acked[s.id] !== key) out.push(`${s.id}|${key}`);
  }
  return out;
}

/** Заголовок страницы: «(N) Пульт», при мигании — «● Нужен ваш ответ». */
export function pageTitle(base, count, blinkOn, blinkText) {
  if (count <= 0) return base;
  return blinkOn ? `(${count}) ● ${blinkText}` : `(${count}) ${base}`;
}
