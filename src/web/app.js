// app.js — вход страницы: связывает транспорт, редьюсер и рисование.
//
// Поток один: событие приходит из transport -> state.reduce даёт новую модель -> view рисует.
// Решения владельца (сообщение, отмена, разрешение, новая сессия) уходят событиями через тот же
// транспорт; сервер остаётся источником истории. Локальная копия delivery.js хранит текст до
// подтверждения, а не выдаёт запись в сокет за принятие сервером.

import {
  initialModel, reduce, makeEvent, nextStep, normalizeTheme, nextTheme, THEME_KEY, beginSwitch, undoSwitch,
  addDraft, dropDrafts, patchDraft, nameFromText,
} from './state.js';
import { waitingKeys, waitKey, SILENT_DEFAULT_MIN } from './attention.js';
import { createNotifier } from './notify.js';
import { t } from './strings.js';
import { createView } from './view.js';
import { createQueue, isBusy } from './queue.js';
import { uploadImages, messageInput } from './attachments.js';
import { chooseMode, createTransport, parseAgentRegistry, loadModelMetadata } from './transport.js';
import { createProjectsApi } from './projects-api.js';
import { routeSignal, normalizeRoute } from './routes.js';
import { canopusSignal } from './canopus-task.js';
import { createLoading } from './loading.js';
import { createDelivery, safeError } from './delivery.js';

const FLASH_MS = 4000;
const TICK_MS = 1000;

const timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id),
};

function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Тема: выбор владельца живёт в localStorage (без внешних запросов); недоступное хранилище не ломает страницу.
function readTheme() {
  try { return normalizeTheme(globalThis.localStorage.getItem(THEME_KEY)); } catch { return 'system'; }
}
function saveTheme(value) {
  try {
    if (value === 'system') globalThis.localStorage.removeItem(THEME_KEY);
    else globalThis.localStorage.setItem(THEME_KEY, value);
  } catch { /* закрытое хранилище: выбор живёт до перезагрузки */ }
}
// Переключатель Worktree новой сессии: по умолчанию выключен, последний выбор помнится на уровне пульта.
const WORKTREE_KEY = 'canopus-console-draft-worktree';
function readWorktreePref() {
  try { return globalThis.localStorage.getItem(WORKTREE_KEY) === '1'; } catch { return false; }
}
function saveWorktreePref(on) {
  try { globalThis.localStorage.setItem(WORKTREE_KEY, on ? '1' : '0'); } catch { /* закрытое хранилище: выбор живёт до перезагрузки */ }
}
function applyTheme(value) {
  const root = document.documentElement;
  if (value === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);
}

document.title = t('app.title');

// Внимание к сессии (задача 192.14): заголовок «(N) …», значок вкладки, уведомление и «динь»; выключатели помнятся в localStorage.
const notifier = createNotifier({
  doc: document, win: globalThis, storage: (() => { try { return globalThis.localStorage; } catch { return null; } })(),
  timers: { every: (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); } },
  Notification: globalThis.Notification, AudioContext: globalThis.AudioContext || globalThis.webkitAudioContext,
  baseTitle: t('app.title'), blinkText: t('attn.tab_title'),
});

let model = initialModel();
const delivery = createDelivery((() => { try { return globalThis.localStorage; } catch { return null; } })());
// Pending first messages must remain reachable even if creation never reached the server.
for (const saved of delivery.sessions()) {
  if (model.sessions[saved.id]) continue;
  model = addDraft(model, { ...saved, now: saved.createdAt || Date.now() });
  model = patchDraft(model, saved.id, { route: saved.route, worktree: saved.worktree, sourceBranch: saved.sourceBranch || '', source: saved.source || null, preset: saved.preset || '', approvals: saved.approvals || {} });
}
let status = { state: 'connecting' };
const UNREAD_KEY = 'canopus-console-unread';
const PINS_KEY = 'canopus-console-session-pins';
function readPins() {
  try {
    const v = JSON.parse(globalThis.localStorage.getItem(PINS_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function savePins(value) {
  try { globalThis.localStorage.setItem(PINS_KEY, JSON.stringify(value)); } catch { /* выбор живёт до перезагрузки */ }
}
function readUnread() {
  try {
    const v = JSON.parse(globalThis.localStorage.getItem(UNREAD_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function saveUnread(value) {
  try { globalThis.localStorage.setItem(UNREAD_KEY, JSON.stringify(value)); } catch { /* закрытое хранилище: пометки живут до перезагрузки */ }
}
// ссылка на сессию (#s=<id>): после загрузки журнала страница её открывает
const linked = /^#s=(.+)$/.exec(globalThis.location ? globalThis.location.hash : '');
const ui = {
  historyPending: new Set(),
  historyPreview: new Set(),
  restoreQueued: new Map(),
  selected: null, projects: null, pane: 'list', flash: '', flashTone: 'error', awaiting: linked ? decodeURIComponent(linked[1]) : null, theme: readTheme(), pins: readPins(), unread: readUnread(), acked: {}, silentMin: SILENT_DEFAULT_MIN, notify: { bell: notifier.bellOn(), sound: notifier.soundOn(), denied: false },
};
// A failed first create has no server row to select. Reopen its saved local copy on reload;
// an explicit session link always takes precedence. This never resends anything.
if (!ui.awaiting) {
  const recovery = delivery.sessions().at(-1);
  if (recovery) ui.awaiting = recovery.id;
}
applyTheme(ui.theme);

const ctx = { newId, now: () => Date.now() };
ui.sourceQuestions = new Map();
ui.handoffStatus = new Map();
const confirmSourceLabel = 'Применить';
let view = null;
let queued = false;
let transport = null;
let presetInfo = null; // наборы с сервера (задача 192.12): {active, presets, roles}
let agentList = []; // семьи агентов: нужны, чтобы выбрать первую для черновика новой сессии
let modelMetadata = { status: 'unavailable', reason: 'metadata_not_loaded', family: '', models: [] };
// fetch берётся при каждом вызове: в режиме ?mock=1 страница подменяет globalThis.fetch уже после старта
const projectsApi = createProjectsApi(() => globalThis.fetch.bind(globalThis), t('projects.offline'));
const loading = createLoading({ timers, projects: () => projectsApi.list(), changed() {
  ui.loading = loading.state;
  ui.projects = loading.state.projects.data;
  if (view) render();
} });
ui.loading = loading.state;

async function loadProjects() {
  await loading.loadProjects();
}

// Сессия, созданная первым сообщением, должна появиться. Таймаут не меняет её id: возможен поздний ответ.
const CREATE_WAIT_MS = 10000;
function watchCreated(trace) {
  timers.set(() => {
    if (model.sessions[trace] && !model.sessions[trace].draft) return;
    flash(t('chat.create_timeout', { n: CREATE_WAIT_MS / 1000 }));
    // Never invent a new session id on timeout: the old create may still arrive.
    ui.awaiting = null;
    ui.selected = trace;
    ui.pane = 'chat';
    render();
  }, CREATE_WAIT_MS);
}

let sessionTransportReady = false;
const requestedHistory = new Set();
const warmedHistory = new Set();
const requestedPreview = new Set();
const attemptedPreview = new Set();
const previewVersion = new Map();

function applySessionIndex(entries) {
  for (const event of entries) {
    if (event?.kind !== 'session_created' || typeof event.trace !== 'string') continue;
    const previous = model.sessions[event.trace];
    if (previous?.draft) continue;
    if (!previous) model = reduce(model, event);
    else {
      const { name, agent, folder, project_id, rank } = event.input;
      model = { ...model, sessions: { ...model.sessions, [event.trace]: {
        ...previous, name, agent, folder, projectId: project_id, rank,
        updatedAt: Math.max(previous.updatedAt, event.time),
      } } };
    }
    ui.historyPending.add(event.trace);
  }
}

function replayHistory(trace, entries) {
  let history = { ...initialModel(), catalog: model.catalog };
  const seen = Object.create(null);
  for (const event of entries) {
    if (event.trace !== trace || seen[event.id]) continue;
    // The reducer normally copies the growing seen map. A replay owns its map
    // and collects only the new marker returned by each event.
    history = reduce({ ...history, seen: {} }, event);
    Object.assign(seen, history.seen);
  }
  if (!history.sessions[trace]) return false;
  model = { ...model, seen: { ...model.seen, ...seen }, sessions: {
    ...model.sessions, [trace]: history.sessions[trace],
  } };
  return true;
}

function requestHistoryPreview(trace) {
  if (attemptedPreview.has(trace) || ui.historyPreview.has(trace)) return;
  attemptedPreview.add(trace);
  requestedPreview.add(trace);
  fetch('/api/session-history/' + encodeURIComponent(trace), { cache: 'no-store', signal: AbortSignal.timeout(3500) })
    .then(response => response.ok ? response.json() : null)
    .then(entries => {
      if (!ui.historyPending.has(trace) || !model.sessions[trace] || !Array.isArray(entries)) return;
      if (replayHistory(trace, entries)) {
        ui.historyPreview.add(trace);
        previewVersion.set(trace, { count: entries.length, last: entries.at(-1)?.id });
        render();
      }
    }).catch(() => { /* The authoritative history request remains available. */ })
    .finally(() => {
      requestedPreview.delete(trace);
      if (ui.selected === trace || ui.restoreQueued.has(trace)) requestHistory(trace);
      render();
    });
}

function requestHistory(trace) {
  if (!ui.historyPending.has(trace)) return;
  requestHistoryPreview(trace);
  if (!sessionTransportReady || requestedHistory.has(trace)) return;
  if (requestedPreview.has(trace)) {
    // Start authoritative recovery while HTTP still loads the transcript preview.
    if (!warmedHistory.has(trace) && transport.send(makeEvent('session_warm', trace, 0, {}, ctx))) warmedHistory.add(trace);
    return;
  }
  if (transport.send(makeEvent('session_history_get', trace, 0, previewVersion.get(trace) || {}, ctx))) requestedHistory.add(trace);
}

function draw() {
  if (!queued) return;
  queued = false;
  // сессию удалили (здесь или в другом окне): открытый чат закрывается
  if (ui.selected && ui.selected !== ui.awaiting && !model.sessions[ui.selected]) { ui.selected = null; ui.pane = 'list'; }
  if (ui.awaiting && model.sessions[ui.awaiting]) {
    ui.selected = ui.awaiting;
    ui.pane = 'chat';
    ui.awaiting = null;
  }
  // открытая и видимая сессия, которая ждёт, считается замеченной: подсветка в списке гаснет
  const viewing = typeof document.hasFocus === 'function' ? document.hasFocus() && !document.hidden : !document.hidden;
  const opened = ui.selected ? model.sessions[ui.selected] : undefined;
  if (viewing && opened && !opened.draft) {
    const key = waitKey(opened);
    if (key !== '' && ui.acked[opened.id] !== key) ui.acked = { ...ui.acked, [opened.id]: key };
  }
  const all = Object.values(model.sessions);
  for (const x of all) { const m = x.routeState && x.routeState.canopus ? x.routeState.canopus.silentMinutes : -1; if (m >= 0) { ui.silentMin = m; break; } }
  const names = {};
  for (const x of all) names[x.id] = x.name;
  notifier.update(waitingKeys(all, ui.acked), names, ui.selected || '');
  ui.notify = { bell: notifier.bellOn(), sound: notifier.soundOn(), denied: ui.notify.denied };
  requestHistory(ui.selected);
  for (const trace of ui.restoreQueued.keys()) if (trace !== ui.selected) requestHistory(trace);
  view.render(model, ui, status);
}

// Перерисовка склеивает близкие события в один кадр. Вторая страховка — таймер: в скрытой
// вкладке requestAnimationFrame не вызывается, и модель, уже обновлённая потоком, не
// доходила бы до экрана; таймер вызывает то же самое, кто первый — тот и рисует.
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(draw);
  timers.set(draw, 60);
}

function flash(text, tone = 'error') {
  ui.flash = text;
  ui.flashTone = tone;
  render();
  timers.set(() => { ui.flash = ''; render(); }, FLASH_MS);
}

function send(kind, trace, step, input) {
  const ok = transport.send(makeEvent(kind, trace, step, input, ctx));
  if (!ok) flash(t('conn.send_failed'));
  return ok;
}

function savedSession(trace) {
  const s = model.sessions[trace];
  return s ? { id: trace, agent: s.agent, projectId: s.projectId, project: s.project, folder: s.folder, branch: s.branch,
    route: normalizeRoute(s.route), worktree: s.worktree === true, sourceBranch: s.sourceBranch || '', source: s.source || null, preset: s.preset || '', approvals: s.approvals || {}, createdAt: s.createdAt } : null;
}
function sendMessage(trace, text, images = [], retry = null) {
  const event = makeEvent('user_message', trace, nextStep(model, trace), messageInput(newId(), text, images), ctx);
  if (retry) { event.id = retry.id; event.input.turn = retry.clientTurn || event.input.turn; }
  else {
    if (!delivery.add(event, savedSession(trace))) {
      flash(t('delivery.storage'));
      return false;
    }
  }
  try {
    if (!transport.send(event)) delivery.failed(event.id, 'offline');
  } catch { delivery.unknown(event.id); }
  timers.set(() => { if (delivery.items(trace).some(r => r.id === event.id && r.state === 'sending')) { delivery.unknown(event.id); render(); } }, 10000);
  render();
  return true;
}

// The confirmed selection stays local until the owner sends a message.
function prepareHandoff(trace, choice) {
  return new Promise(resolve => {
    const finish = (ok, message) => {
      timers.clear(timer);
      if (ok) ui.handoffStatus.delete(trace);
      else ui.handoffStatus.set(trace, { phase: 'error', message });
      resolve(ok);
      render();
    };
    const timer = timers.set(() => finish(false, t('handoff.unconfirmed')), 370000);
    ui.handoffStatus.set(trace, { ...choice, phase: 'preparing', finish });
    try {
      if (send('session_context_handoff', trace, nextStep(model, trace), choice.source)) { render(); return; }
    } catch { /* The transport could not confirm the send. */ }
    finish(false, t('handoff.unconfirmed'));
  });
}

// Очередь сообщений (Enter при работающем агенте): живёт только в странице, по сессиям, FIFO.
const queue = createQueue();

/** Ход закончился — следующее сообщение очереди уходит как обычная отправка; сессии нет в модели — очередь сброшена. */
function restoreTarget(session) {
  return JSON.stringify([session.agent, session.source, normalizeRoute(session.route)]);
}

const waitingRoute = new Set();
function sendAfterRestore(trace, text, images) {
  const session = model.sessions[trace];
  if (!ui.historyPreview.has(trace) || !session || !text || images.length || ui.restoreQueued.has(trace)) return false;
  if (session.source?.family === 'codex' && session.agent !== 'codex') return false;
  const event = makeEvent('user_message', trace, 0, messageInput(newId(), text, []), ctx);
  if (!delivery.add(event, savedSession(trace), 'waiting_restore')) {
    flash(t('delivery.storage'));
    return false;
  }
  ui.restoreQueued.set(trace, { id: event.id, target: restoreTarget(session) });
  render();
  return true;
}

function drainRestoreQueue() {
  const sent = new Set();
  for (const [trace, queued] of ui.restoreQueued) {
    if (ui.historyPending.has(trace) || waitingRoute.has(trace) || !sessionTransportReady) continue;
    const session = model.sessions[trace];
    if (session && (isBusy(session.state) || session.pendingQuestion)) continue;
    ui.restoreQueued.delete(trace);
    if (!session || restoreTarget(session) !== queued.target || ui.sourceQuestions.has(trace)
        || ['preparing', 'selected'].includes(ui.handoffStatus.get(trace)?.phase)) {
      delivery.failed(queued.id, t('delivery.restore_target_changed'));
      continue;
    }
    const item = delivery.beginRetry(queued.id, 'waiting_restore');
    if (item) { sendMessage(trace, item.text, [], item); sent.add(trace); }
    else delivery.failed(queued.id, t('delivery.storage'));
  }
  return sent;
}

function drain() {
  const justSent = drainRestoreQueue();
  queue.prune(model.sessions);
  for (const trace of queue.traces()) {
    if (justSent.has(trace) || ui.restoreQueued.has(trace) || ui.historyPending.has(trace)) continue;
    if (ui.handoffStatus.get(trace)?.phase === 'preparing' || ui.handoffStatus.get(trace)?.phase === 'selected') continue;
    const item = queue.take(trace, model.sessions[trace]);
    if (item === undefined) continue;
    // в очереди лежит { text, images }: картинки уходят на сервер при выдаче, а не при постановке
    const images = item.images ?? [];
    const delivered = handlers.onSend(trace, item.text, images);
    if (typeof delivered?.then !== 'function') {
      if (!delivered) queue.restore(trace, item);
    } else {
      Promise.resolve(delivered).then((ok) => { if (!ok) { queue.restore(trace, item); render(); } }, () => { queue.restore(trace, item); render(); });
    }
  }
}

// Картинка сообщения уходит на сервер сырыми байтами (не через WebSocket: тот несёт строки, а мегабайт текстом хаб читал бы десятки секунд).
async function postImage(trace, item) {
  const response = await fetch(`/api/session-image/${encodeURIComponent(trace)}`, {
    method: 'POST', headers: { 'Content-Type': item.type }, body: item.blob, cache: 'no-store',
  });
  if (!response.ok) {
    let reason = `${response.status}`;
    try { reason = (await response.json()).error || reason; } catch { /* тело не JSON: остаётся код */ }
    throw new Error(reason);
  }
  const data = await response.json();
  return { n: data.n };
}
const signal = (trace, { kind, input }) => [kind, trace, nextStep(model, trace), input];

function confirmPendingCodexTransfer(session, source) {
  if (!session || session.draft || source?.family !== 'codex' || session.agent === 'codex'
      || !session.messages.some((message) => message.role === 'user')) return false;
  if (session.agent === 'kimi') {
    handlers.onSource(session.id, source);
  } else {
    flash('Перенос истории в Codex из этого агента пока недоступен. Выберите текущего агента, чтобы продолжить этот чат.', 'error');
  }
  return true;
}

const handlers = {
  onRetryProjects() { loadProjects(); },
  onRetrySessions() { transport?.retry(); },
  deliveryItems(trace) { return delivery.items(trace); },
  onRetry(trace, id) {
    const session = model.sessions[trace];
    if (!session || session.draft || ui.historyPending.has(trace) || ['answering', 'permission'].includes(session.state)
      || ['preparing', 'selected'].includes(ui.handoffStatus.get(trace)?.phase)) return;
    const item = delivery.beginRetry(id);
    if (item) sendMessage(trace, item.text, [], item);
  },
  onForgetDelivery(id) {
    if (!delivery.forget(id)) return;
    for (const [trace, item] of ui.restoreQueued) if (item.id === id) ui.restoreQueued.delete(trace);
    render();
  },
  queued(trace) { return queue.count(trace); },
  onQueue(trace, text, images = []) {
    queue.push(trace, { text, images });
    render();
    drain();
    return true;
  },
  onUnqueue(trace) { queue.popLast(trace); render(); },
  queuedItems(trace) { return queue.items(trace); },
  /** «Вернуть на редактирование»: сообщение уходит из очереди, страница кладёт его в поле. */
  onUnqueueAt(trace, index) {
    const item = queue.removeAt(trace, index);
    render();
    return item;
  },
  /** «Отправить сейчас»: сообщение первым в очереди, текущий ход отменяется, как кнопкой «Отмена хода»; дальше выдача сама. */
  onSendNow(trace, index) {
    queue.moveToFront(trace, index);
    handlers.onCancel(trace);
    render();
  },
  onSelect(trace) {
    ui.selected = trace;
    ui.pane = 'chat';
    if (ui.unread[trace]) { ui.unread = { ...ui.unread, [trace]: false }; saveUnread(ui.unread); }
    requestHistory(trace);
    render();
  },
  async onBell() {
    const on = await notifier.setBell(!notifier.bellOn());
    ui.notify = { bell: on, sound: notifier.soundOn(), denied: !on && typeof globalThis.Notification === 'function' && globalThis.Notification.permission === 'denied' };
    render();
  },
  onSound() { notifier.setSound(!notifier.soundOn()); render(); },
  onUnread(trace, on) { ui.unread = { ...ui.unread, [trace]: on }; saveUnread(ui.unread); render(); },
  onMoveSession(trace, projectId) { send('session_move', trace, nextStep(model, trace), { project_id: projectId }); },
  onDeleteSession(trace, branch = '') { send('session_delete', trace, nextStep(model, trace), branch ? { branch } : {}); },
  onReorderSessions(ids) { if (ids.length > 0) send('session_reorder', ids[0], nextStep(model, ids[0]), { ids }); },
  // порядок проектов: страница показывает его сразу, сервер запоминает для всех страниц
  async onReorderProjects(ids) {
    const byId = new Map((ui.projects || []).map((p) => [p.id, p]));
    ui.projects = [...ids.map((id) => byId.get(id)).filter(Boolean), ...(ui.projects || []).filter((p) => !ids.includes(p.id))];
    render();
    const r = await projectsApi.order(ids);
    if (!r.ok) flash(t('projects.order_failed', { reason: r.error }));
    loadProjects();
  },
  onBack() { ui.pane = 'list'; render(); },
  // «+» у проекта: пустой чат новой сессии; на сервер она уходит с первым сообщением (задача 192)
  onNewToggle(open, projectId = '') {
    if (!open) {
      model = dropDrafts(model);
      if (ui.selected && !model.sessions[ui.selected]) ui.selected = null;
      render();
      return;
    }
    const project = (ui.projects || []).find((p) => p.id === projectId);
    const folder = project && project.folders[0] ? project.folders[0] : null;
    const agent = (agentList.find((a) => !a.disabled) || { id: '' }).id;
    const id = newId();
    model = addDraft(dropDrafts(model), {
      id, agent, projectId: project ? project.id : '', project: project ? project.name : '', folder: folder ? folder.path : '', branch: folder && folder.branch ? folder.branch : '', worktree: Boolean(project) && readWorktreePref(), now: Date.now(),
    });
    ui.selected = id;
    ui.pane = 'chat';
    render();
  },
  onDraftProject(trace, projectId) {
    const project = (ui.projects || []).find((p) => p.id === projectId);
    const folder = project && project.folders[0] ? project.folders[0] : null;
    model = patchDraft(model, trace, {
      projectId: project ? project.id : '', project: project ? project.name : '', folder: folder ? folder.path : '', branch: folder && folder.branch ? folder.branch : '', worktree: Boolean(project) && model.sessions[trace]?.worktree === true,
    });
    render();
  },
  onDraftFolder(trace, path) {
    const d = model.sessions[trace];
    const project = d && (ui.projects || []).find((p) => p.id === d.projectId);
    const folder = project && project.folders.find((f) => f.path === path);
    if (folder) { model = patchDraft(model, trace, { folder: folder.path, branch: folder.branch || '' }); render(); }
  },
  onDraftBrowseFolder(trace, path) {
    const draft = model.sessions[trace];
    if (!draft || !draft.draft || ui.selected !== trace) return;
    const currentProjects = ui.projects || [];
    const existing = currentProjects.find((p) => p.folders.some((f) => f.path.toLowerCase() === path.toLowerCase()));
    if (existing) {
      const folder = existing.folders.find((f) => f.path.toLowerCase() === path.toLowerCase());
      model = patchDraft(model, trace, { projectId: existing.id, project: existing.name, folder: folder.path, branch: folder.branch || '' });
      render();
      return;
    }
    const baseName = path.split(/[\\/]/).filter(Boolean).at(-1) || path;
    const used = new Set(currentProjects.map((p) => p.name.toLocaleLowerCase()));
    let name = baseName;
    for (let suffix = 2; used.has(name.toLocaleLowerCase()); suffix += 1) name = `${baseName} (${suffix})`;
    const api = projectsApi;
    if (ui.selected !== trace || model.sessions[trace] !== draft || !draft.draft) return;
    api.create({ name, folders: [{ path, worktree: false }], env: '' }).then((result) => {
      if (!result.ok) { flash(t('projects.create_failed', { reason: result.error })); return; }
      return loadProjects().then(() => {
        if (ui.selected !== trace || !model.sessions[trace]?.draft) return;
        const project = (ui.projects || []).find((p) => p.id === result.id);
        if (!project) return;
        model = patchDraft(model, trace, { projectId: project.id, project: project.name, folder: path, branch: '' });
        render();
      });
    });
  },
  onRename(trace, name) {
    const clean = String(name).trim();
    if (clean) send('session_rename', trace, nextStep(model, trace), { name: clean });
  },
  onProjectsChanged() { loadProjects(); },
  onNotice(text, tone) { flash(text, tone); },
  onPin(trace, pinned) { ui.pins = { ...ui.pins, [trace]: pinned }; savePins(ui.pins); render(); },
  onTheme() {
    ui.theme = nextTheme(ui.theme);
    applyTheme(ui.theme);
    saveTheme(ui.theme);
    render();
  },
  onCopy(text) {
    const clip = globalThis.navigator && globalThis.navigator.clipboard;
    if (!clip || typeof clip.writeText !== 'function') { flash(t('chat.copy_failed')); return; }
    clip.writeText(text).then(() => flash(t('chat.copied'), 'info'), () => flash(t('chat.copy_failed')));
  },
  // Без картинок — как раньше, сразу. С картинками — сначала они на сервер по очереди, потом сообщение с их номерами.
  onSend(trace, text, images = []) {
    const draft = model.sessions[trace];
    if (ui.sourceQuestions.has(trace)) return false;
    if (ui.historyPending.has(trace)) return sendAfterRestore(trace, text, images);
    if (ui.restoreQueued.has(trace)) return false;
    const choice = ui.handoffStatus.get(trace);
    if (choice?.phase === 'preparing') return false;
    if (choice?.phase === 'selected') {
      if (!draft || draft.agent !== choice.previous || isBusy(draft.state)) return false;
      return prepareHandoff(trace, choice).then(ok => ok && handlers.onSend(trace, text, images));
    }
    if (choice?.phase === 'error') ui.handoffStatus.delete(trace);
    if (confirmPendingCodexTransfer(draft, draft?.source)) return false;
    let reserved = null;
    if (draft && draft.draft) {
      // Protect the first message before even creating its session (creation may fail too).
      const event = makeEvent('user_message', trace, 0, { text, turn: newId(), images: images.map(i => ({ name: i.name })) }, ctx);
      if (!delivery.add(event, savedSession(trace))) { flash(t('delivery.storage')); return false; }
      reserved = { id: event.id, clientTurn: event.input.turn };
      // первое сообщение черновика: сначала создаётся сессия (проект, папка, агент), потом уходит сообщение
      const folderInfo = (((ui.projects || []).find((p) => p.id === draft.projectId) || { folders: [] }).folders).find((f) => f.path === draft.folder);
      const treeOk = !(folderInfo && folderInfo.repo === false); // папка не git: сессия создаётся без дерева
      const input = { name: nameFromText(text) || t('sessions.new_name_placeholder'), agent: draft.agent, route: normalizeRoute(draft.route), worktree: draft.worktree !== false && treeOk };
      if (draft.source) input.source = draft.source;
      input.worktree = Boolean(draft.projectId && draft.folder) && input.worktree;
      input.workspace_explicit = true; // new UI always states the chosen place, unlike old journal defaults
      if (draft.projectId && draft.sourceBranch) input.source_branch = draft.sourceBranch;
      if (draft.preset) input.preset = draft.preset;
      if (draft.approvals) input.approvals = draft.approvals;
      if (draft.projectId) {
        input.project = draft.project;
        input.project_id = draft.projectId;
        if (draft.folder) input.folder = draft.folder;
        if (draft.branch) input.branch = draft.branch;
      }
      model = dropDrafts(model, trace);
      let created = false;
      try { created = send('session_created', trace, 0, input); } catch { delivery.unknown(reserved.id); return false; }
      if (!created) {
        delivery.failed(reserved.id, 'offline');
        model = { ...model, sessions: { ...model.sessions, [trace]: draft } };
        render();
        return false;
      }
      ui.awaiting = trace;
      watchCreated(trace);
    }
    if (images.length === 0) return sendMessage(trace, text, [], reserved);
    return uploadImages(trace, images, postImage).then((up) => {
      if (!up.ok) {
        flash(t('images.upload_failed', { name: up.name, reason: safeError(up.error) }));
        if (reserved) delivery.failed(reserved.id, up.error);
        else {
          const event = makeEvent('user_message', trace, nextStep(model, trace), { text, images: images.map(i => ({ name: i.name })) }, ctx);
          if (delivery.add(event, savedSession(trace))) delivery.failed(event.id, up.error);
        }
        render();
        return false;
      }
      return sendMessage(trace, text, up.images, reserved);
    });
  },
  onCancel(trace) {
    const session = model.sessions[trace];
    const open = session ? session.messages.filter((m) => m.role === 'agent' && m.status === 'streaming').pop() : undefined;
    send('cancel', trace, nextStep(model, trace), open ? { turn: open.turn } : {});
  },
  onSwitchAgent(trace, agent) {
    if (model.sessions[trace] && model.sessions[trace].draft) { model = patchDraft(model, trace, { agent }); render(); return; }
    // Страница не ждёт сервера: сразу показывает значения новой семьи (каталог), а не остатки прежней (задача 192o).
    model = beginSwitch(model, trace, agent);
    render();
    if (!send('session_agent', trace, nextStep(model, trace), { agent })) {
      model = undoSwitch(model, trace);
      render();
    }
  },
  onChoose(trace, setting, value) {
    send('session_setting', trace, nextStep(model, trace), { setting, value });
  },
  onSource(trace, source) {
    const session = model.sessions[trace];
    if (ui.handoffStatus.get(trace)?.phase === 'preparing') return;
    if (!session || session.draft || isBusy(session.state)) { flash('Источник можно изменить только между ходами.', 'info'); return; }
    const handoffPair = (session.agent === 'kimi' && source.family === 'codex')
      || (session.agent === 'codex' && source.family === 'kimi');
    const handoff = handoffPair && session.messages.some((message) => message.role === 'user');
    if ((!handoff && source.family !== session.agent) || session.pendingQuestion) {
      if (!session.pendingQuestion) send('session_source', trace, nextStep(model, trace), source);
      return;
    }
    const question = {
      request: newId(),
      questions: [{
        header: 'Модель и усилие',
        question: handoff
          ? `Перейти на ${source.family === 'kimi' ? 'Kimi' : 'Codex'} в этом чате? Кеш ${session.agent === 'kimi' ? 'Kimi' : 'Codex'} не переносится. Вместимость полной истории не подтверждена.`
          : 'Применить выбор со следующего сообщения? История останется в чате. Кеш запроса может быть пересобран.',
        multiSelect: false,
        options: [{ label: confirmSourceLabel, description: '' }, { label: 'Отмена', description: '' }],
      }],
    };
    ui.sourceQuestions.set(trace, { ...question, source, handoff, previous: session.agent });
    render();
  },
  onApproval(trace, family, value) {
    const session = model.sessions[trace];
    if (!session) return;
    if (session.draft) {
      model = patchDraft(model, trace, { approvals: { ...(session.approvals || {}), [family]: value } });
      render();
      return;
    }
    send('session_setting', trace, nextStep(model, trace), { family, setting: 'mode', value });
  },
  onAnswer(trace, answer) {
    const pending = ui.sourceQuestions.get(trace);
    if (pending?.request === answer.request) {
      const session = model.sessions[trace];
      if (!answer.skipped && answer.answers?.[0]?.selected?.[0] === confirmSourceLabel) {
        if (!session || session.agent !== pending.previous || isBusy(session.state)) {
          flash('Источник можно изменить только между ходами.', 'info');
          return false;
        }
        if (pending.handoff) ui.handoffStatus.set(trace, { phase: 'selected', previous: pending.previous, source: pending.source });
        else {
          if (!send('session_source', trace, nextStep(model, trace), pending.source)) return false;
          ui.handoffStatus.delete(trace);
        }
      }
      ui.sourceQuestions.delete(trace);
      render();
      if (!pending.handoff || answer.skipped) drain();
      return true;
    }
    return send('question_answer', trace, nextStep(model, trace), answer);
  },
  // Режимы работы по методике (задача 192p): сигналы серверу; состояние вернётся событием route_state.
  onRoute(trace, route) {
    // черновик новой сессии: режим выбирается на странице и уходит с первым сообщением
    if (model.sessions[trace] && model.sessions[trace].draft) { model = patchDraft(model, trace, { route: normalizeRoute(route) }); render(); return; }
    send(...signal(trace, routeSignal.set(route)));
  },
  onDraftPreset(trace, name) { model = patchDraft(model, trace, { preset: name }); render(); },
  onDraftSource(trace, source) { model = patchDraft(model, trace, { source, ...(source.family ? { agent: source.family } : {}) }); render(); },
  onSessionPreset(trace, name) { send('session_preset', trace, nextStep(model, trace), { preset: name }); },
  onDraftWorktree(trace, on) { saveWorktreePref(on === true); model = patchDraft(model, trace, { worktree: on === true }); render(); },
  onWorkspace(trace, folder, choice) {
    const s = model.sessions[trace];
    if (!s || s.folder !== folder) return; // the project changed while the read-only dialog was open
    if (s.draft) {
      saveWorktreePref(choice.worktree);
      model = patchDraft(model, trace, choice);
      render();
    } else send('session_workspace', trace, nextStep(model, trace), { worktree: choice.worktree, source_branch: choice.sourceBranch });
  },
  onWorktree(trace, on) { send(...signal(trace, routeSignal.worktree(on))); },
  onResultRepo(trace, repoId) { send(...signal(trace, routeSignal.resultRepo(repoId))); },
  onRouteRun(trace) { send(...signal(trace, routeSignal.run())); },
  onRouteSkip(trace, step) { send(...signal(trace, routeSignal.skip(step))); },
  onRouteStop(trace) { send(...signal(trace, routeSignal.stop())); },
  onRouteSubtaskNew(trace) { send(...signal(trace, routeSignal.subtaskNew())); },
  onRouteSubtaskSame(trace) { send(...signal(trace, routeSignal.subtaskSame())); },
  onRouteSubtaskWorktree(trace, n) { send(...signal(trace, routeSignal.subtaskWorktree(n))); },
  onRouteSubtaskDone(trace, n) { send(...signal(trace, routeSignal.subtaskDone(n))); },
  onRouteNewTask(trace) { send(...signal(trace, routeSignal.newTask())); },
  // «Слить в main» — слово владельца на push в origin/main (хаб сам коммитит оставленное агентом одним коммитом, тесты не гоняет)
  onRouteMerge(trace) { send(...signal(trace, routeSignal.merge())); },
  // Отладочное состояние машины (задача 192.1): явный запрос; ответ вернётся событием machine_state, в журнал оно не пишется.
  onMachineGet(trace) { if (model.sessions[trace] && !model.sessions[trace].draft) send('machine_state_get', trace, nextStep(model, trace), {}); },
  // Состав запроса к агенту (задача 192.11): явный запрос хода; ответ вернётся событием turn_request, в журнал оно не пишется.
  onRequestGet(trace, turn) { if (model.sessions[trace] && !model.sessions[trace].draft) send('request_get', trace, nextStep(model, trace), { turn }); },
  onRouteTestsRun(trace) { send(...signal(trace, routeSignal.testsRun())); },
  onRouteTreeDrop(trace, force) { send(...signal(trace, routeSignal.treeDrop(force))); },
  onRouteSubtaskParallel(trace, n, on) { send(...signal(trace, routeSignal.subtaskParallel(n, on))); },
  // Распознавание задач (задача 192.2): кнопка «Распознать задачи», кнопки карточек, быстрый ответ
  onCanopusRecognize(trace) { send(...signal(trace, canopusSignal.recognize())); },
  onExtUndo(trace, id) { send(...signal(trace, canopusSignal.extUndo(id))); },
  onCanopusProp(trace, id, action, opts) { send(...signal(trace, canopusSignal.prop(id, action, opts))); },
  onChildrenMerge(trace) { send(...signal(trace, canopusSignal.childrenMerge())); },
  onCanopusApply(trace, items) { send(...signal(trace, canopusSignal.apply(items))); },
  onRouteSubtaskChoose(trace, n, tree) { send(...signal(trace, routeSignal.subtaskChoose(n, tree))); },
  // «Закончить задачу»: переключить режим и сразу прогнать шаги окончания — два сигнала подряд, шаг события у каждого свой
  onRouteFinish(trace, route) {
    if (!send(...signal(trace, routeSignal.set(route)))) return;
    send('route_run', trace, nextStep(model, trace) + 1, {});
  },
  onNotice(text) { flash(text, 'info'); },
  onDecide(trace, request, decision) {
    send('permission_decision', trace, nextStep(model, trace), { request, decision });
  },
};

// Любая ошибка запуска или обработки события — на экран блоком стража (boot-guard.js), а не молча в консоль.
function reportError(e) {
  const report = globalThis.__canopusBootError;
  if (typeof report === 'function') report(e && e.message ? e.message : String(e));
  if (globalThis.console) globalThis.console.error(e);
}

const picked = chooseMode(location.search, location.protocol, location.host);
async function start() {
  // каркас страницы уже в index.html, модули загружены и выполняются: старт состоялся, а ожидание списка агентов и соединения — не повод для тревоги
  document.documentElement.setAttribute('data-booted', '1');
  // mock.js (заготовленный журнал) грузится ТОЛЬКО в режиме ?mock=1: реальной странице он не нужен, и сбой его загрузки её не роняет.
  let mock = null;
  let agents = [];
  if (picked.mode === 'mock') {
    mock = await import('./mock.js');
    agents = mock.AGENTS;
  }
  const registryFailed = false;
  if (picked.mode === 'mock') globalThis.fetch = mock.mockFetch(globalThis.fetch.bind(globalThis));
  agentList = agents;
  // задача 192.12: наборы «роль → семья, модель, усилие» (GET /api/presets); без ответа выбора набора нет
  // Эти справочники не задерживают ни каркас, ни загрузку проектов и сессий.
  fetch('/api/presets', { cache: 'no-store' }).then(async (response) => {
    if (response.ok) { presetInfo = await response.json(); render(); }
  }).catch(() => { /* выбор набора просто не показывается */ });
  view = createView(document, {
    app: document.getElementById('app'), side: document.getElementById('side'),
    main: document.getElementById('main'), rail: document.getElementById('rail'),
    status: document.getElementById('status'), overlay: document.getElementById('overlay'),
  }, { agents, now: ctx.now, handlers, registryFailed, registryPending: picked.mode === 'ws', imageSrc: mock ? mock.mockImageSrc : undefined, projectsApi, presets: () => presetInfo, modelMetadata: () => modelMetadata });
  let metadataRequest = null;
  function refreshModelMetadata() {
    if (picked.mode !== 'ws' || !agentList.length || metadataRequest) return;
    if (modelMetadata.status === 'ready' && modelMetadata.expiresAt - ctx.now() > 60000) return;
    metadataRequest = loadModelMetadata((...args) => fetch(...args), agentList.map((agent) => agent.id))
      .then((next) => {
        if (next.status === 'ready' || modelMetadata.expiresAt <= ctx.now() || modelMetadata.status !== 'ready') {
          modelMetadata = next;
        }
        render();
      }).finally(() => { metadataRequest = null; });
  }

  if (picked.mode === 'ws') {
    fetch('/api/agents', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('agent registry unavailable');
      const next = parseAgentRegistry(await response.json());
      view.setAgents(next, false); agentList = next;
      modelMetadata = next.length ? { status: 'loading', reason: 'metadata_loading', family: '', models: [] }
        : { status: 'unavailable', reason: 'agent_registry_empty', family: '', models: [] };
      refreshModelMetadata();
      render();
    }).catch(() => { view.setAgents([], true); agentList = []; modelMetadata = { status: 'unavailable', reason: 'agent_registry_unavailable', family: '', models: [] }; render(); });
  }
  setInterval(() => view.tick(), TICK_MS);
  setInterval(() => { refreshModelMetadata(); render(); }, 30000); // «молчит N мин» в списке обновляется сам
  document.addEventListener('visibilitychange', () => { notifier.visibilityChanged(); refreshModelMetadata(); render(); });
  globalThis.addEventListener('focus', () => { notifier.visibilityChanged(); refreshModelMetadata(); render(); });
  globalThis.addEventListener('blur', () => notifier.visibilityChanged());
  let socketUrl = picked.url;
  if (picked.mode === 'ws') {
    try {
      const response = await fetch('/api/sessions-index', { cache: 'no-store', signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const index = await response.json();
        if (index && Object.hasOwn(index, 'entries')) {
          const url = new URL(socketUrl);
          url.searchParams.set('history', 'lazy');
          socketUrl = url.href;
          if (Array.isArray(index.entries)) {
            applySessionIndex(index.entries);
            loading.sessionsReady();
          }
        }
      }
    } catch { /* Older servers and missing indexes fall back to the socket snapshot. */ }
  }
  transport = createTransport({
    mode: picked.mode, url: socketUrl,
    server: mock ? mock.createMockServer({ now: ctx.now, machines: true }) : undefined,
    WebSocketImpl: globalThis.WebSocket, timers,
    onEvent(event) {
      try {
        const handoff = ui.handoffStatus.get(event.trace);
        if (event.kind === 'handoff_progress') {
          if (handoff?.phase === 'preparing' && event.input?.phase === 'compacting') {
            handoff.compacting = true;
            render();
          }
          return;
        }
        if (handoff?.phase === 'preparing' && event.kind === 'error' && !event.input?.turn && !event.input?.client_id) {
          handoff.finish(false, t('handoff.failed'));
          return;
        }
        if (event.kind === 'route_state') waitingRoute.delete(event.trace);
        if (event.kind === 'session_deleted') {
          const queued = ui.restoreQueued.get(event.trace);
          if (queued) delivery.failed(queued.id, t('delivery.restore_target_changed'));
          ui.restoreQueued.delete(event.trace);
        }
        if (event.kind === 'message_delivery') delivery.receipt(event.input);
        if (event.kind === 'error' && event.input) delivery.error(event);
        const next = reduce(model, event);
        const changed = next !== model;
        model = next;
        delivery.reconcile(model);
        const completed = handoff?.phase === 'preparing' && event.kind === 'session_source'
          && event.input?.family === handoff.source.family && event.input?.model === handoff.source.model
          && model.sessions[event.trace]?.agent === handoff.source.family;
        if (completed) handoff.finish(true);
        else if (changed) drain();
        if (changed || event.kind === 'message_delivery' || event.kind === 'error') render();
      } catch (e) {
        reportError(e);
      }
    },
    onStatus(next) {
      status = next;
      if (next.state === 'retry') {
        delivery.disconnected();
        for (const handoff of ui.handoffStatus.values()) {
          if (handoff.phase === 'preparing') handoff.finish(false, t('handoff.unconfirmed'));
        }
      }
      render();
    },
    onSessionsIndex(entries) { applySessionIndex(entries); },
    onSessionHistory(trace, entries, unchanged) {
      if (!requestedHistory.delete(trace)) return;
      if (!(unchanged && ui.historyPreview.has(trace)) && !replayHistory(trace, entries)) {
        flash(t('loading.history_error'));
        return;
      }
      if (ui.restoreQueued.has(trace)) waitingRoute.add(trace);
      ui.historyPending.delete(trace);
      warmedHistory.delete(trace);
      ui.historyPreview.delete(trace);
      requestedPreview.delete(trace);
      attemptedPreview.delete(trace);
      previewVersion.delete(trace);
      delivery.reconcile(model);
      drain();
      render();
    },
    onSnapshot(phase, ids) {
      if (phase === 'loading') {
        sessionTransportReady = false;
        requestedHistory.clear();
        warmedHistory.clear();
        if (loading.state.sessions.data !== null) loadProjects();
        else loading.sessionsStart();
      }
      else if (phase === 'error') {
        sessionTransportReady = false;
        requestedHistory.clear();
        warmedHistory.clear();
        if (loading.state.sessions.data === null) loading.sessionsError();
      }
      else {
        // Удалённые за время разрыва сессии исчезают только после полного снимка.
        if (ids) {
          const keep = new Set(ids);
          for (const [trace, queued] of ui.restoreQueued) {
            if (keep.has(trace)) continue;
            delivery.failed(queued.id, t('delivery.restore_target_changed'));
            ui.restoreQueued.delete(trace);
            waitingRoute.delete(trace);
          }
          model = { ...model, sessions: Object.fromEntries(Object.entries(model.sessions).filter(([id, s]) => s.draft || keep.has(id))) };
        }
        sessionTransportReady = true;
        loading.sessionsReady();
      }
    },
  });
  transport.start();
  loadProjects();
  render();
  globalThis.addEventListener('pagehide', () => { loading.stop(); transport.stop(); }, { once: true });
}
start().then(() => {
  // страж запуска (boot-guard.js) ждёт этот признак: нет его — показывает «Ошибка запуска», а не пустой экран
  document.documentElement.setAttribute('data-booted', '1');
  try { globalThis.sessionStorage.removeItem('canopus-boot-retry'); } catch { /* хранилища нет: счётчик повтора не нужен */ }
}, reportError);
