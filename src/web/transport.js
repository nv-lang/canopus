// transport.js — откуда берутся события и куда уходят решения владельца.
//
// Два режима за одним лицом { start, send, stop }:
//   mock — воспроизведение заглушки (mock.js) без сервера, по ?mock=1;
//   ws   — WebSocket к /ws сервиса: события приходят JSON-ом (одно или массив), решения
//          уходят JSON-ом. Пульт не хранит состояния: исходящее событие рисуется, только когда
//          сервер вернёт его в потоке (заглушка делает то же самое).
// Часы, таймеры и класс сокета приходят снаружи, чтобы разрыв и повтор проверялись под Node.
//
// Статусы (onStatus): { state: 'connecting' | 'connected' | 'mock' | 'nofile' } и
// { state: 'retry', seconds } — обратный отсчёт до следующей попытки.

/** Ступени ожидания между попытками, секунды; успех возвращает на первую. */
export const RETRY_STEPS = Object.freeze([2, 5, 10, 30]);

// Сигналы режимов работы (задача 192p): любой из них снимает идущий прогон шагов заглушки и ставит свой ответ.
const ROUTE_SIGNALS = ['session_route', 'route_run', 'route_reset', 'route_skip', 'route_stop', 'route_subtask_new', 'route_subtask_same', 'route_subtask_worktree', 'route_subtask_done', 'route_new_task',
  'route_merge', 'route_tests_run', 'route_tree_drop', 'session_worktree', 'route_subtask_parallel', 'route_subtask_choose',
  'route_prop', 'route_recognize', 'route_apply', 'route_ext_undo'];

/** Выбор режима по адресу страницы. Чистая функция, чтобы проверяться без браузера. */
export function chooseMode(search, protocol, host) {
  const params = new URLSearchParams(search);
  if (params.get('mock') === '1') return { mode: 'mock' };
  if (protocol === 'http:' || protocol === 'https:') {
    return { mode: 'ws', url: `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws` };
  }
  return { mode: 'nofile' };
}

/** Keep only public registry fields; command details never enter the page. */
export function parseAgentRegistry(payload) {
  if (!payload || !Array.isArray(payload.agents)) return [];
  return payload.agents.flatMap((entry) => {
    if (!entry || typeof entry.id !== 'string' || typeof entry.label !== 'string') return [];
    const id = entry.id.trim();
    const label = entry.label.trim();
    return id && label ? [{ id, label }] : [];
  });
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Parse the bound, fail-closed cold metadata snapshot; this never invents a family/model fallback. */
export function parseModelMetadata(payload, configuredFamilies, now = Date.now()) {
  const unavailable = (reason = 'metadata_unavailable', family = '') => ({ status: 'unavailable', reason, family, models: [] });
  if (isObject(payload) && payload.v === 2) {
    const { observed_at: observedAt, expires_at: expiresAt, families } = payload;
    if (!Number.isSafeInteger(observedAt) || !Number.isSafeInteger(expiresAt) || observedAt <= 0 || observedAt > now || expiresAt <= now || expiresAt <= observedAt || expiresAt - observedAt > 300000 || !Array.isArray(families)) return unavailable('metadata_expired_or_invalid');
    const seen = new Set(); const bound = Object.create(null);
    for (const item of families) {
      if (!isObject(item) || !configuredFamilies.includes(item.family) || seen.has(item.family)) return unavailable('family_unbound');
      seen.add(item.family);
      if (item.status !== 'ready') continue;
      if (item.source !== 'acp.session.new' || typeof item.source_version !== 'string' || !item.source_version || !Array.isArray(item.models) || !item.models.length) return unavailable('metadata_provenance_mismatch');
      const ids = new Set();
      for (const model of item.models) {
        if (!isObject(model) || typeof model.id !== 'string' || !model.id.trim() || typeof model.name !== 'string' || !model.name.trim() || ids.has(model.id) || !Array.isArray(model.efforts) || model.efforts.some(e => !isObject(e) || typeof e.id !== 'string' || !e.id || typeof e.name !== 'string')) return unavailable('metadata_models_invalid');
        ids.add(model.id);
      }
      bound[item.family] = item.models;
    }
    return {status: Object.keys(bound).length ? 'ready' : 'unavailable', reason: 'native_acp_catalog', family: '', models: [], families: bound, observedAt, expiresAt};
  }
  if (!isObject(payload) || payload.v !== 1) return unavailable('metadata_invalid');
  if (payload.status !== 'ready') return unavailable(typeof payload.reason === 'string' && payload.reason ? payload.reason : 'metadata_unavailable', typeof payload.family === 'string' ? payload.family : '');

  const family = typeof payload.family === 'string' ? payload.family : '';
  const known = Array.isArray(configuredFamilies) && configuredFamilies.includes(family);
  if (!known || !family) return unavailable('family_unbound', family);
  if (payload.source !== 'opencode.api.model' || payload.source_version !== '2.2.5' || payload.reason !== 'bound_native_snapshot') return unavailable('metadata_provenance_mismatch', family);
  if (payload.complete !== false || payload.permissions_status !== 'blocked') return unavailable('metadata_contract_mismatch', family);

  const observedAt = payload.observed_at;
  const expiresAt = payload.expires_at;
  if (!Number.isSafeInteger(observedAt) || !Number.isSafeInteger(expiresAt) || observedAt <= 0 || observedAt > now || expiresAt <= now || expiresAt <= observedAt || expiresAt - observedAt > 300000) {
    return unavailable('metadata_expired_or_invalid', family);
  }
  if (!Array.isArray(payload.models)) return unavailable('metadata_models_invalid', family);
  const modelIds = new Set();
  const models = [];
  for (const item of payload.models) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id.trim() || item.id !== item.id.trim() || typeof item.name !== 'string' || !item.name.trim() || !Array.isArray(item.efforts) || modelIds.has(item.id)) {
      return unavailable('metadata_models_malformed_or_duplicate', family);
    }
    modelIds.add(item.id);
    const effortIds = new Set();
    const efforts = [];
    for (const effort of item.efforts) {
      if (!isObject(effort) || typeof effort.id !== 'string' || !effort.id.trim() || effort.id !== effort.id.trim() || typeof effort.name !== 'string' || !effort.name.trim() || effortIds.has(effort.id)) {
        return unavailable('metadata_efforts_malformed_or_duplicate', family);
      }
      effortIds.add(effort.id);
      efforts.push({ id: effort.id, name: effort.name });
    }
    models.push({ id: item.id, name: item.name, efforts });
  }
  if (models.length === 0) return unavailable('metadata_empty', family);
  return {
    status: 'ready', reason: '', family, source: payload.source, sourceVersion: payload.source_version,
    observedAt, expiresAt, complete: false, permissionsStatus: 'blocked', models,
  };
}

/** Read only the bound metadata endpoint. The adapter never creates sessions or starts a provider. */
export async function loadModelMetadata(fetchFn, configuredFamilies, now = Date.now()) {
  try {
    const response = await fetchFn('/api/model-metadata', { cache: 'no-store' });
    if (!response || !response.ok) return { status: 'unavailable', reason: 'metadata_request_failed', family: '', models: [] };
    return parseModelMetadata(await response.json(), configuredFamilies, now);
  } catch {
    return { status: 'unavailable', reason: 'metadata_request_failed', family: '', models: [] };
  }
}

/**
 * @param deps.mode           'mock' | 'ws' | 'nofile'
 * @param deps.server         (mock) createMockServer(...)
 * @param deps.url            (ws) адрес сокета
 * @param deps.WebSocketImpl  (ws) класс сокета
 * @param deps.timers         { set(fn, ms) -> id, clear(id) }
 * @param deps.onEvent        (событие) => void
 * @param deps.onStatus       (статус) => void
 */
export function createTransport(deps) {
  const { mode, server, url, WebSocketImpl, timers, onEvent, onStatus, onSnapshot = () => {}, onSessionsIndex = () => {}, onSessionHistory = () => {} } = deps;

  // ---- заглушка ----
  const scheduled = new Map(); // id таймера -> trace

  function schedule(entries) {
    for (const { delay, event, tag } of entries) {
      const id = timers.set(() => { scheduled.delete(id); onEvent(event); }, delay);
      scheduled.set(id, tag ?? event.trace);
    }
  }

  function dropScheduled(trace) {
    for (const [id, tr] of [...scheduled]) {
      if (tr === trace) { timers.clear(id); scheduled.delete(id); }
    }
  }

  function startMock() {
    onSnapshot('loading');
    onStatus({ state: 'mock' });
    for (const event of server.journal()) onEvent(event);
    onSnapshot('ready');
  }

  function sendMock(event) {
    // Отмена хода снимает всё, что заглушка ещё не успела «сказать» по этой цепочке.
    if (event.kind === 'cancel') dropScheduled(event.trace);
    // Прогон шагов режима (задача 192p) живёт под своей меткой: смена режима, пропуск и остановка снимают только его.
    if (ROUTE_SIGNALS.includes(event.kind)) dropScheduled(`${event.trace}#route`);
    schedule(server.handle(event));
    return true;
  }

  // ---- сокет ----
  let socket = null;
  let attempt = 0;
  let timer = null;
  let stopped = false;

  function connect() {
    timer = null;
    onSnapshot('loading');
    onStatus({ state: 'connecting' });
    const ws = new WebSocketImpl(url);
    socket = ws;
    ws.onopen = () => {
      if (stopped || socket !== ws) return;
      attempt = 0;
      onStatus({ state: 'connected' });
    };
    ws.onmessage = (message) => {
      if (stopped || socket !== ws) return;
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      const list = Array.isArray(data) ? data : [data];
      for (const e of list) if (isObject(e)) {
        if (e.kind === 'sessions_ready' && Array.isArray(e.sessions)) onSnapshot('ready', e.sessions);
        else if (e.kind === 'sessions_index' && Array.isArray(e.entries)) onSessionsIndex(e.entries);
        else if (e.kind === 'session_history' && Array.isArray(e.entries)) onSessionHistory(e.trace, e.entries, e.unchanged === true);
        else onEvent(e);
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      onSnapshot('error');
      if (!stopped) countdown(RETRY_STEPS[Math.min(attempt, RETRY_STEPS.length - 1)]);
      attempt += 1;
    };
    ws.onerror = () => {}; // за ошибкой всегда следует close; повтор заводит он
  }

  function countdown(seconds) {
    onStatus({ state: 'retry', seconds });
    timer = timers.set(() => {
      if (seconds <= 1) connect();
      else countdown(seconds - 1);
    }, 1000);
  }

  function sendSocket(event) {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(event));
    return true;
  }

  // ---- лицо ----
  return {
    start() {
      if (mode === 'mock') startMock();
      else if (mode === 'ws') connect();
      else onStatus({ state: 'nofile' });
    },
    send(event) {
      if (mode === 'mock') return sendMock(event);
      if (mode === 'ws') return sendSocket(event);
      return false;
    },
    retry() {
      if (mode !== 'ws' || stopped) return;
      if (timer !== null) timers.clear(timer);
      if (socket) { const old = socket; socket = null; old.close(); }
      connect();
    },
    stop() {
      stopped = true;
      if (timer !== null) { timers.clear(timer); timer = null; }
      for (const id of scheduled.keys()) timers.clear(id);
      scheduled.clear();
      if (socket) { const ws = socket; socket = null; ws.close(); }
    },
  };
}
