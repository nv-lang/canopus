// view.js — рисование DOM по модели. Никакой логики «что произошло»: это в state.js и lists.js.
//
// Правила, на которых держится безопасность и спокойный вид:
//   * текст из событий попадает в DOM ТОЛЬКО через textContent / createTextNode — никакой
//     разметки из данных (проверка страницы ищет innerHTML и родню);
//   * каркас строится один раз; при каждой перерисовке меняется только то, что изменилось,
//     поэтому ответ агента растёт без мерцания, а черновик в поле ввода не пропадает;
//   * прокрутка вниз только если владелец уже был у конца: читающего историю не дёргаем;
//   * значки — один спрайт, встроенный в index.html (<use href="#i-имя">), цвет берут из темы; ширина полоски и кольца контекста
//     ставится свойством --fill / --ring через CSSOM, а не атрибутом style (его запрещает CSP).

import { t } from './strings.js';
import { approvalView } from './family-approvals.js';
import { BARS, barHeights, createMeter, recordingView } from './meter.js';
import { createDictation, speechCtor, createMicPress, micTitleKey, clockText } from './voice.js';
import { createLocalDictation } from './recorder.js';
import { createToast } from './toast.js';
import { h, icon } from './dom.js';
import { createProjectsUi } from './projects-ui.js';
import { createSideKit } from './session-row.js';
import { LANGS, createVoiceSettings, langFor, pageLang } from './stt.js';
import { isBusy, keyAction } from './queue.js';
import { historyStep, NO_HISTORY } from './history.js';
import { canSend } from './attachments.js';
import { createAttachUi } from './attach-ui.js';
import { createViewer } from './viewer-ui.js';
import { createMachinesPanel } from './machines-ui.js';
import { createRequestPanel } from './request-ui.js';
import { createCanopusTaskUi } from './canopus-task-ui.js';
import { subWaitsText } from './canopus-task.js';
import { labelOf } from './labels-ru.js';
import { createDraftStore, safeError, restoreText, afterSendText } from './delivery.js';
import { deliveryCard, deliveryLoadingWord } from './delivery-ui.js';
import {
  createForm, selectOption, setOtherText, setCursor, moveCursor, setActive, isAnswered, nextUnanswered, canSubmit,
  markSent, buildAnswer, buildSkip, digitOption, otherIndex,
} from './question.js';
import {
  STATE_KEYS, sessionList, splitBlocks, filterSessions, groupSessions, descendantsOf, effectivePins, timeline, paragraphs, inlineSpans, codeSpans, normalizeTheme,
  workSummary, messageTime, groupThousands, ruForm, shownOf, familyOf, filterModels, groupModels, usagePercent, usageLevel, tokenParts, durationLabel, agoParts, fileParts, taskSummary,
} from './state.js';
import { attention, SILENT_DEFAULT_MIN } from './attention.js';
import {
  CHAT_MODES, STEP_ICON, STEP_STATE_KEY, SUBTASK_STATE_KEY, routeName, routeDescription, counterText, stepToSkip, showStrip, stripActions,
  subtaskPercent, subtaskProgressText, showSubtasks, INTERACTIVE_STATE, NOTE_KEY, taskHeading, subtaskActions, hasSubtaskActions, bannerCount, subtaskCountText,
  mergeLabel, diffTotals, finishPrompt, readyPrompt, overlapPrompt, commitsText, filesText, branchTestsText, mainTestsText, testsRunnable, stalePrompt, whereText, wipStalePrompt,
} from './routes.js';

const NEAR_BOTTOM_PX = 40;
const FOLD_DIFFS = 3;
const FOLD_OUTPUTS = 4;
const FOLD_TASKS = 3;
const SIDEBAR_PAGE_SIZE = 12;
const WIDE_QUERY = '(min-width: 1101px)';

// Таблицы значков и подписей — литералами, чтобы проверка страницы и проверка строк видели каждый ключ.
const TOOL_LABEL = {
  read: 'tool.read', edit: 'tool.edit', delete: 'tool.delete', move: 'tool.move', search: 'tool.search',
  execute: 'tool.execute', think: 'tool.think', fetch: 'tool.fetch', other: 'tool.other',
};
const TOOL_STATUS = {
  pending: 'status.pending', in_progress: 'status.in_progress', completed: 'status.completed',
  failed: 'status.failed', cancelled: 'status.cancelled', unreported: 'work.unreported',
};
const TASK_STATUS = {
  running: 'task.running', completed: 'task.completed', failed: 'task.failed', stopped: 'task.stopped',
};
const USAGE_STEP_KEY = { one: 'usage.step_one', few: 'usage.step_few', many: 'usage.step_many' };
const TOOL_RESULT_ICON = { pending: 'i-clock', in_progress: 'i-play', completed: 'i-circle-check', failed: 'i-circle-x', cancelled: 'i-stop', unreported: 'i-dot' };
const TOOL_ACTION_ICON = { read: 'i-eye', edit: 'i-pencil', delete: 'i-trash', move: 'i-move', search: 'i-search', execute: 'i-terminal', think: 'i-think', fetch: 'i-globe', other: 'i-bolt' };
const TASK_ICON = { running: 'i-clock', completed: 'i-check', failed: 'i-x', stopped: 'i-stop' };
const FILE_ICON = { create: 'i-file-plus', edit: 'i-file-edit', delete: 'i-file-x' };
const THEME_ICON = { light: 'i-sun', dark: 'i-moon' };
const THEME_LABEL = { light: 'theme.light', dark: 'theme.dark' };
const UNIT_KEY = { d: 'unit.d', h: 'unit.h', m: 'unit.m', s: 'unit.s' };
const AGO_KEY = { now: 'ago.now', min: 'ago.min', hour: 'ago.hour', day: 'ago.day' };

/**
 * @param doc       document
 * @param refs      { side, main, rail, app, status, overlay } — корневые узлы из index.html
 * @param deps      { agents, now, handlers }
 *   deps.projectsApi — клиент проектов (projects-api.js); handlers.onProjectsChanged() — список проектов изменился, перечитать;
 *   handlers.onNotice(text, tone) — короткая заметка в строке статуса.
 *   handlers: onSelect(trace), onBack(), onNewToggle(open, projectId?) — пустой чат новой сессии, onDraftProject(trace, id), onDraftFolder(trace, path), onRename(trace, name),
 *             onSend(trace, text, images?) -> bool | Promise<bool> (images — вложения: сначала уходят на сервер, потом сообщение), onCancel(trace), onDecide(trace, request, decision),
 *             onPin(trace, pinned), onTheme(), onCopy(text),
 *             onAnswer(trace, answer) -> bool — ответ на вопросы агента (question_answer) или пропуск,
 *             onSwitchAgent(trace, agent) — продолжить этот разговор на другом агенте,
 *             onChoose(trace, setting, value) — выбор режима, модели или усилия (setting: 'mode' | 'model' | 'effort')
 */
export function createView(doc, refs, deps) {
  const {
    agents, now, handlers, imageSrc = (image) => image.src, projectsApi, presets = () => null, modelMetadata = () => null,
  } = deps;
  let { registryFailed = false, registryPending = false } = deps;
  const win = doc.defaultView;
  const drafts = createDraftStore((() => { try { return win?.localStorage; } catch { return null; } })());
  const attachDrafts = new Map(); // вложения по сессиям: как черновик, живут до отправки
  const workToggles = new Map();
  const open = new Set(); // раскрытые строки и карточки по ключу: переживают перерисовку
  let query = '';
  let railOpen = null; // null — «как задано шириной», true/false — выбор владельца
  let current = { session: undefined, ui: undefined };

  const agentLabel = (id) => {
    const a = agents.find((x) => x.id === id);
    return a ? (a.labelKey ? t(a.labelKey) : (a.label || a.id)) : id;
  };

  function modelLabel(family, model) {
    const label = agentLabel(family);
    if (!label || !model) return model;
    const name = model.toLocaleLowerCase();
    const prefix = label.toLocaleLowerCase();
    return name === prefix || name.startsWith(prefix + ' ') ? model : `${label} ${model}`;
  }

  function formatTime(ms) {
    const d = new Date(ms);
    const today = new Date(now());
    const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    return sameDay
      ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const durationText = (ms) => durationLabel(ms).map(([n, u]) => t(UNIT_KEY[u], { n })).join(' ');
  const agoText = (ms) => {
    const a = agoParts(ms, now());
    return t(AGO_KEY[a.unit], { n: a.n });
  };
  function tokensText(n) {
    const { value, unit } = tokenParts(n);
    const shown = String(value).replace('.', ',');
    if (unit === 'k') return t('tokens.k', { n: shown });
    if (unit === 'm') return t('tokens.m', { n: shown });
    return shown;
  }

  // ---------------------------------------------------------------- левая колонка

  const themeButton = h(doc, 'button', { type: 'button', class: 'icon-btn' });
  // задача 192.14: выключатели «колокольчик» (уведомления браузера) и «звук»; по умолчанию выключены, состояние ведёт notify.js
  const bellButton = h(doc, 'button', { type: 'button', class: 'icon-btn attn-toggle', 'data-kind': 'bell', 'aria-pressed': 'false', title: t('attn.bell_off'), 'aria-label': t('attn.bell_off') }, icon(doc, 'i-bell'));
  const soundButton = h(doc, 'button', { type: 'button', class: 'icon-btn attn-toggle', 'data-kind': 'sound', 'aria-pressed': 'false', title: t('attn.sound_off'), 'aria-label': t('attn.sound_off') }, icon(doc, 'i-volume'));
  bellButton.addEventListener('click', () => handlers.onBell && handlers.onBell());
  soundButton.addEventListener('click', () => handlers.onSound && handlers.onSound());
  let toggleSig = '';
  function renderToggles(ui) {
    const n = ui.notify || { bell: false, sound: false, denied: false };
    const sig = JSON.stringify([n.bell, n.sound, n.denied]);
    if (sig === toggleSig) return;
    toggleSig = sig;
    const bellText = n.bell ? t('attn.bell_on') : (n.denied ? t('attn.bell_denied') : t('attn.bell_off'));
    bellButton.setAttribute('aria-pressed', String(Boolean(n.bell)));
    bellButton.title = bellText;
    bellButton.setAttribute('aria-label', bellText);
    soundButton.setAttribute('aria-pressed', String(Boolean(n.sound)));
    soundButton.title = n.sound ? t('attn.sound_on') : t('attn.sound_off');
    soundButton.setAttribute('aria-label', soundButton.title);
  }
  const search = h(doc, 'input', {
    type: 'search', class: 'search-input', autocomplete: 'off', placeholder: t('sessions.search'), 'aria-label': t('sessions.search'),
  });
  const agentNotice = h(doc, 'p', { class: 'empty', text: t(registryFailed ? 'sessions.agents_unavailable' : 'sessions.agents_none'), hidden: agents.length > 0 || registryPending });
  const retryAgents = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('sessions.agents_retry'), hidden: !registryFailed });
  retryAgents.addEventListener('click', () => doc.defaultView.location.reload());
  const groupsBox = h(doc, 'nav', { class: 'groups', 'aria-label': t('sessions.title') });
  const listEmpty = h(doc, 'p', { class: 'empty', text: t('sessions.empty'), hidden: true });
  const loadingBox = h(doc, 'div', { class: 'list-loading', 'aria-live': 'polite', role: 'status' });
  let loadingSig = '';
  const notFound = h(doc, 'p', { class: 'empty', text: t('sessions.not_found'), hidden: true });

  refs.side.replaceChildren(
    h(doc, 'div', { class: 'side-head' }, h(doc, 'h2', { text: t('sessions.title') }), h(doc, 'span', { class: 'side-head-tools' }, bellButton, soundButton, themeButton)),
    h(doc, 'div', { class: 'side-tools' },
      h(doc, 'label', { class: 'search' }, icon(doc, 'i-search'), search)),
    agentNotice, retryAgents, loadingBox, groupsBox, listEmpty, notFound,
  );

  themeButton.addEventListener('click', () => handlers.onTheme());
  search.addEventListener('input', () => { query = search.value; if (current.ui) renderList(current.model, current.ui); });

  /** Метка «Нужен ваш ответ»: оранжевая точка и плашка; в списке сессий и в карточке вопросов. */
  function askBadge(text = t('ask.need')) {
    return h(doc, 'span', { class: 'ask-badge' }, h(doc, 'span', { class: 'ask-dot', 'aria-hidden': 'true' }), h(doc, 'span', { class: 'ask-badge-text', text }));
  }

  // ---- проекты: список приходит из страницы (ui.projects), окна живут в projects-ui.js
  let projectsList = null; // null — список ещё не загружен
  let groupMenu = ''; // id проекта, чьё меню «⋯» открыто
  const projectById = (id) => (projectsList ? projectsList.find((p) => p.id === id) : undefined);
  const projectsUi = createProjectsUi(doc, {
    api: projectsApi,
    onChanged: () => handlers.onProjectsChanged(),
    onNotice: (text, tone) => handlers.onNotice(text, tone),
  });

  const sideKit = createSideKit(doc, {
    handlers,
    projects: () => projectsList,
    confirm: (text, words = {}) => projectsUi.confirm({ title: t('session.delete_title'), text, ok: words.ok || t('session.delete_ok'), cancel: words.cancel || t('session.delete_cancel') }),
    descendants: (id) => descendantsOf(sessionList(current.model), id),
    linkFor: (id) => {
      const loc = win && win.location;
      return `${loc ? loc.origin + loc.pathname : ''}#s=${encodeURIComponent(id)}`;
    },
    render: () => { listSig = ''; if (current.ui) renderList(current.model, current.ui); if (typeof syncHeadMenu === 'function') syncHeadMenu(); },
  });
  let listSig = '';
  const foldedParents = new Set(); // родители, чьи дочерние свёрнуты в списке
  const expandedGroups = new Set();
  let activeProject = null; // проект выбранной сессии или черновика ('' - без проекта), null - ничего не выбрано
  /** Номер и название задачи сессии, если у неё есть задача с номером; иначе null. */
  function sessionTask(s) {
    const task = s.routeState && s.routeState.task;
    return task && task.number ? { number: task.number, title: task.title || '' } : null;
  }

  function sessionRow({ session: s, depth, kids = 0, collapsed = false }, ui, pins, gctx) {
    const active = s.id === ui.selected;
    const pinned = pins.has(s.id);
    const unread = Boolean(ui.unread && ui.unread[s.id] === true);
    const taskInfo = sessionTask(s);
    const stateLabel = t(STATE_KEYS[s.state]);
    const attn = attention(s, { now: now(), silentMin: ui.silentMin ?? SILENT_DEFAULT_MIN, unread, acked: (ui.acked || {})[s.id] || '' });
    const attnText = attn.state === 'waiting' ? t('attn.waiting') : attn.state === 'silent' ? t('attn.silent', { n: attn.minutes }) : attn.state === 'error' ? t('attn.error') : '';
    const merge = mergeLabel(s.routeState && s.routeState.task);
    const item = sideKit.isRenaming(s.id) ? sideKit.renameField(s) : h(doc, 'button', {
      type: 'button',
      class: 'session-item',
      'data-attn': attn.state,
      'data-blink': attn.blink ? 'true' : false,
      'data-merge': merge ? merge.kind : false,
      'aria-current': active ? 'true' : 'false',
      title: t('sessions.time_title', { state: stateLabel, time: formatTime(s.updatedAt) }),
    },
    depth > 0 ? icon(doc, 'i-branch', 'child-mark') : false,
    depth > 0 ? h(doc, 'span', { class: 'sr', text: t('sessions.child') }) : false,
    unread ? h(doc, 'span', { class: 'unread', role: 'img', 'aria-label': t('session.unread'), title: t('session.unread') }) : false,
    taskInfo ? h(doc, 'span', { class: 'task-no', text: taskInfo.number, title: taskInfo.title ? t('route.task_no_title', { number: taskInfo.number, title: taskInfo.title }) : t('route.task_head_bare', { number: taskInfo.number }) }) : false,
    h(doc, 'span', { class: 'session-name', text: s.name }),
    s.pendingQuestion ? h(doc, 'span', { class: 'ask-line' }, askBadge()) : false,
    attnText ? h(doc, 'span', { class: 'attn-label', 'data-attn': attn.state, text: attnText }) : false,
    h(doc, 'span', { class: 'dot', 'data-state': s.state, 'data-attn': attn.state, 'aria-hidden': 'true' }),
    h(doc, 'span', { class: 'sr', text: stateLabel }),
    merge ? h(doc, 'span', { class: 'session-merge', 'data-kind': merge.kind, text: merge.text }) : false);
    if (!sideKit.isRenaming(s.id)) item.addEventListener('click', () => handlers.onSelect(s.id));
    const cls = ['session', active ? 'is-active' : '', pinned ? 'is-pinned' : '', unread ? 'is-unread' : ''].filter(Boolean).join(' ');
    // родитель с дочерними сворачивается: стрелка перед строкой, число скрытых видно в подсказке
    let fold = false;
    if (kids > 0) {
      const label = collapsed ? t('sessions.unfold', { n: kids }) : t('sessions.fold');
      fold = h(doc, 'button', { type: 'button', class: 'icon-btn small fold-btn', 'aria-expanded': String(!collapsed), 'aria-label': label, title: label }, icon(doc, collapsed ? 'i-chevron-right' : 'i-chevron-down'));
      fold.addEventListener('click', (e) => {
        e.stopPropagation();
        if (foldedParents.has(s.id)) foldedParents.delete(s.id); else foldedParents.add(s.id);
        listSig = '';
        if (current.ui) renderList(current.model, current.ui);
      });
    }
    const li = h(doc, 'li', { class: `${cls}${kids > 0 ? ' has-kids' : ''}`, 'data-depth': Math.min(depth, 2) }, fold, item, sideKit.moreButton(s), sideKit.menuFor(s, { pinned, unread }) || false);
    sideKit.rowDnd(li, { id: s.id, group: gctx.key, ids: gctx.ids, projectId: s.projectId || '', enabled: gctx.draggable });
    return li;
  }

  function closeGroupMenu() {
    groupMenu = '';
    if (current.ui) renderList(current.model, current.ui);
  }

  function menuAction(label, iconId, onPick, danger = false) {
    const row = h(doc, 'button', { type: 'button', class: danger ? 'menu-item is-danger' : 'menu-item', role: 'menuitem' },
      h(doc, 'span', { class: 'menu-check' }, icon(doc, iconId)),
      h(doc, 'span', { class: 'menu-label' }, h(doc, 'span', { text: label })));
    row.addEventListener('click', onPick);
    return row;
  }

  /** Группа сессий. group.id пуст — «Без проекта» или проект только по имени (меню «⋯» только у настоящих проектов). */
  function groupNode(title, rows, ui, pins, group = null) {
    const isProject = Boolean(group) && group.id !== '';
    // перетаскивание сессий: внутри группы проекта; в «Закреплённых» порядок по активности
    const gctx = { key: group ? `${group.id}|${title}` : '', ids: rows.map((r) => r.session.id), draggable: Boolean(group) };
    const head = h(doc, 'div', { class: 'group-head' },
      h(doc, 'div', { class: 'group-title' }, isProject ? icon(doc, 'i-folder', 'group-icon') : false, h(doc, 'h3', { text: title }),
        group && group.id !== '' ? h(doc, 'span', { class: 'group-count', title: t('projects.count_title', { n: rows.length }), text: String(rows.length) }) : false));
    if (group) {
      const actions = h(doc, 'div', { class: 'group-actions' });
      const label = t('sessions.group_add', { project: title });
      const add = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': label, title: label }, icon(doc, 'i-plus'));
      add.addEventListener('click', () => handlers.onNewToggle(true, group.id));
      actions.append(add);
      if (group.id !== '') {
        const menuLabel = t('projects.menu', { project: title });
        const more = h(doc, 'button', {
          type: 'button', class: 'icon-btn small', 'aria-label': menuLabel, title: menuLabel, 'aria-haspopup': 'menu', 'aria-expanded': String(groupMenu === group.id),
        }, icon(doc, 'i-more'));
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          groupMenu = groupMenu === group.id ? '' : group.id;
          if (current.ui) renderList(current.model, current.ui);
        });
        actions.append(more);
        if (groupMenu === group.id) {
          const project = projectById(group.id);
          head.append(h(doc, 'div', { class: 'menu group-menu', role: 'menu', 'data-side': 'right' },
            menuAction(t('projects.edit'), 'i-pencil', () => { closeGroupMenu(); projectsUi.openEditor(group.id); }),
            menuAction(t('projects.delete'), 'i-trash', () => { closeGroupMenu(); if (project) projectsUi.removeProject(project); }, true)));
        }
      }
      head.append(actions);
    }
    const body = rows.length === 0 && current.ui?.loading && current.ui.loading.sessions.phase !== 'ready'
      ? h(doc, 'p', { class: 'group-empty', text: t('loading.sessions') })
      : rows.length === 0
      ? h(doc, 'p', { class: 'group-empty', text: t('projects.group_empty') })
      : (() => {
        const expanded = expandedGroups.has(group ? group.id : title);
        const visible = expanded ? rows : rows.slice(0, SIDEBAR_PAGE_SIZE);
        const list = h(doc, 'ul', { class: 'group-list' }, ...visible.map((r) => sessionRow(r, ui, pins, gctx)));
        if (rows.length > SIDEBAR_PAGE_SIZE) {
          const label = expanded ? t('sessions.show_less') : t('sessions.show_more', { n: rows.length - SIDEBAR_PAGE_SIZE });
          const more = h(doc, 'button', { type: 'button', class: 'link-btn group-show-more', text: label });
          more.addEventListener('click', () => {
            const key = group ? group.id : title;
            if (expandedGroups.has(key)) expandedGroups.delete(key); else expandedGroups.add(key);
            listSig = '';
            if (current.ui) renderList(current.model, current.ui);
          });
          return h(doc, 'div', { class: 'group-content' }, list, more);
        }
        return list;
      })();
    const active = Boolean(group) && activeProject !== null && group.id === activeProject;
    const section = h(doc, 'section', { class: 'group', 'data-active': active ? 'true' : false, 'data-project': isProject ? 'true' : false }, head, body);
    if (group) sideKit.projectDnd({ section, head, projectId: group.id, free: Boolean(group.free) });
    return section;
  }

  const projectsHeadNew = h(doc, 'button', { type: 'button', class: 'projects-new', title: t('projects.new') }, icon(doc, 'i-plus'), h(doc, 'span', { text: t('projects.new') }));
  projectsHeadNew.addEventListener('click', () => projectsUi.createByFolder((projectsList || []).map((p) => p.name)));
  const projectsHead = h(doc, 'div', { class: 'projects-head' }, h(doc, 'h3', { text: t('projects.title') }), projectsHeadNew);

  function renderList(model, ui) {
    const loading = ui.loading;
    const loadSig = JSON.stringify(loading);
    if (loadSig !== loadingSig) {
      loadingSig = loadSig;
      const nodes = [];
      if (loading) {
        const entries = [
          ['projects', 'loading.projects', 'projects.load_failed', handlers.onRetryProjects],
          ['sessions', 'loading.sessions', 'loading.sessions_error', handlers.onRetrySessions],
        ];
        for (const [key, label, errorLabel, retry] of entries) {
          const source = loading[key];
          if (source.phase === 'ready') continue;
          const text = source.phase === 'error' ? t(errorLabel, { reason: t('projects.offline') }) : source.refreshing ? t('loading.refreshing') : t(label);
          const row = h(doc, 'div', { class: 'load-source', 'data-source': key }, h(doc, 'p', { text }));
          if (source.phase === 'error') {
            const button = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('loading.retry'), 'aria-label': `${t('loading.retry')}: ${t(label)}` });
            button.addEventListener('click', () => retry?.()); row.append(button);
          } else {
            if (source.slow) row.append(h(doc, 'p', { text: t('loading.slow') }));
            if (!source.refreshing) row.append(h(doc, 'div', { class: 'load-skeleton', 'aria-hidden': 'true' }), h(doc, 'div', { class: 'load-skeleton', 'aria-hidden': 'true' }));
          }
          nodes.push(row);
        }
      }
      loadingBox.replaceChildren(...nodes);
      loadingBox.hidden = nodes.length === 0;
    }
    projectsList = ui.projects ?? null;
    const all = sessionList(model).filter((x) => !x.draft);
    const selectedSession = ui.selected ? model.sessions[ui.selected] : undefined;
    activeProject = selectedSession ? (selectedSession.projectId || '') : null;
    const pins = effectivePins(all, ui.pins);
    const filtered = filterSessions(all, query);
    const groups = groupSessions(filtered, { pinned: pins, projects: projectsList, includeEmpty: query.trim() === '', collapsed: foldedParents });
    const rowSig = (r) => [r.depth, r.kids, r.collapsed, r.session.parent, r.session.id, r.session.name, r.session.state, r.session.updatedAt, r.session.rank, r.session.projectId, (sessionTask(r.session) || {}).number, ui.unread ? ui.unread[r.session.id] : undefined, Boolean(r.session.pendingQuestion), (mergeLabel(r.session.routeState && r.session.routeState.task) || {}).text, (() => { const a = attention(r.session, { now: now(), silentMin: ui.silentMin ?? SILENT_DEFAULT_MIN, unread: Boolean(ui.unread && ui.unread[r.session.id] === true), acked: (ui.acked || {})[r.session.id] || '' }); return `${a.state}:${a.blink}:${a.minutes}`; })()];
    const sig = JSON.stringify([loading?.sessions.phase, ui.selected, activeProject, query, groupMenu, [...expandedGroups], sideKit.sig(), groups.pinned.map(rowSig), groups.projects.map((p) => [p.project, p.id, p.rows.map(rowSig)])]);
    const shown = groups.pinned.length + groups.projects.length;
    listEmpty.hidden = Boolean(loading && (loading.projects.phase !== 'ready' || loading.sessions.phase !== 'ready')) || all.length > 0 || (projectsList !== null && projectsList.length > 0);
    notFound.hidden = Boolean(loading && (loading.sessions.phase !== 'ready' || loading.projects.phase !== 'ready')) || !(all.length > 0 && shown === 0);
    if (sig === listSig) return;
    if (sideKit.isDragging()) { sideKit.deferRender(); return; } // пока тащат, список не пересобирается
    listSig = sig;
    const nodes = [];
    if (groups.pinned.length > 0) nodes.push(groupNode(t('sessions.pinned'), groups.pinned, ui, pins));
    const named = groups.projects.filter((p) => p.project !== '');
    const free = groups.projects.filter((p) => p.project === '');
    nodes.push(projectsHead);
    for (const p of named) nodes.push(groupNode(p.project, p.rows, ui, pins, { id: p.id }));
    for (const p of free) nodes.push(groupNode(t('sessions.no_project'), p.rows, ui, pins, { id: '', free: true }));
    sideKit.rebuild(() => groupsBox.replaceChildren(...nodes));
    sideKit.afterRender(groupsBox);
  }

  // меню «⋯» закрывается кликом в стороне и Esc
  doc.addEventListener('click', (e) => {
    if (groupMenu === '' || e.composedPath().some((n) => n && n.classList && n.classList.contains('group-menu'))) return;
    closeGroupMenu();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || groupMenu === '' || projectsUi.openCount() > 0) return;
    closeGroupMenu();
  });

  // ---------------------------------------------------------------- центр: заголовок и разговор

  const backButton = h(doc, 'button', { type: 'button', class: 'icon-btn chat-back', 'aria-label': t('chat.back'), title: t('chat.back') }, icon(doc, 'i-back'));
  // Заголовок переименовывается на месте (задача 192): поле лежит поверх текста тех же размеров, ничего не прыгает
  const titleText = h(doc, 'span', { class: 'title-text', title: t('chat.rename'), tabindex: '0', role: 'button' });
  const titleInput = h(doc, 'input', { class: 'title-input', type: 'text', maxlength: '200', autocomplete: 'off', 'aria-label': t('chat.rename'), hidden: true });
  // номер задачи сессии (если есть): приглушённо рядом с названием, без решётки
  const taskNo = h(doc, 'span', { class: 'task-no', hidden: true });
  // «родитель › ребёнок» (задача 192.3): у дочерней сессии перед названием стоит название родителя, клик открывает его чат
  const crumb = h(doc, 'button', { type: 'button', class: 'title-parent', hidden: true });
  const crumbSep = h(doc, 'span', { class: 'title-sep', 'aria-hidden': 'true', text: '›', hidden: true });
  crumb.addEventListener('click', () => { if (crumb.dataset.parent) handlers.onSelect(crumb.dataset.parent); });
  const title = h(doc, 'h2', { class: 'title' }, crumb, crumbSep, titleText, taskNo, titleInput);
  let renaming = false;
  function finishRename(save) {
    if (!renaming) return;
    renaming = false;
    title.classList.remove('is-editing');
    titleInput.hidden = true;
    const session = current.session;
    const name = titleInput.value.trim();
    if (save && session && name !== '' && name !== session.name) {
      titleText.textContent = name;
      handlers.onRename(session.id, name);
    }
  }
  function startRename() {
    const session = current.session;
    if (renaming || !session || session.draft) return;
    renaming = true;
    titleInput.value = session.name;
    title.classList.add('is-editing');
    titleInput.hidden = false;
    titleInput.focus();
    titleInput.select();
  }
  titleText.addEventListener('click', startRename);
  titleText.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startRename(); } });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finishRename(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishRename(false); }
  });
  titleInput.addEventListener('blur', () => finishRename(true));
  // черновик новой сессии: вместо названия — выбор проекта (и папки, если их несколько)
  // Выбор проекта новой сессии — списком посреди пустого чата (значок папки, галочка у выбранного) и кнопкой в строке под полем.
  let browseTicket = 0;
  const invalidateBrowse = () => { browseTicket += 1; };
  const draftFolder = h(doc, 'select', { class: 'draft-folder', 'aria-label': t('chat.draft_folder'), hidden: true });
  draftFolder.addEventListener('change', () => { invalidateBrowse(); if (currentTrace) handlers.onDraftFolder(currentTrace, draftFolder.value); });
  const projectPicker = h(doc, 'div', { class: 'project-picker', role: 'listbox', 'aria-label': t('chat.draft_project') });
  const draftBrowse = h(doc, 'button', { type: 'button', class: 'draft-browse', text: t('chat.project_browse') });
  const draftSearch = h(doc, 'input', { type: 'search', class: 'project-search', autocomplete: 'off', placeholder: t('chat.project_search'), 'aria-label': t('chat.project_search') });
  let draftSearchText = '';
  draftBrowse.addEventListener('click', async () => {
    const trace = currentTrace;
    if (!trace) return;
    const ticket = ++browseTicket;
    const path = await projectsUi.pickFolder('');
    if (path === null || ticket !== browseTicket || currentTrace !== trace || current.session?.draft !== true) return;
    handlers.onDraftBrowseFolder?.(trace, path);
  });
  draftSearch.addEventListener('input', () => { draftSearchText = draftSearch.value; draftSig = ''; if (current.session?.draft) syncProjectPicker(current.session); });
  let draftSig = '';
  function projectRow({ id, name, checked }) {
    const row = h(doc, 'button', { type: 'button', class: 'project-row', role: 'option', 'aria-selected': checked ? 'true' : 'false', 'data-project': id },
      icon(doc, 'i-folder', 'project-icon'),
      h(doc, 'span', { class: 'project-name', text: name }),
      h(doc, 'span', { class: 'project-check' }, checked ? icon(doc, 'i-check') : false));
    row.addEventListener('click', () => { invalidateBrowse(); if (currentTrace) handlers.onDraftProject(currentTrace, id); });
    return row;
  }
  // папка черновика из списка проектов страницы (с признаком repo) или null
  function draftFolderInfo(session) {
    const project = (projectsList ?? []).find((p) => p.id === session.projectId);
    return project ? project.folders.find((f) => f.path === session.folder) || null : null;
  }
  function syncProjectPicker(session) {
    const list = projectsList ?? [];
    const project = list.find((p) => p.id === session.projectId);
    const many = Boolean(project) && project.folders.length > 1;
    const sig = JSON.stringify([list.map((p) => [p.id, p.name]), session.projectId, many ? project.folders.map((f) => f.path) : [], session.folder]);
    if (sig === draftSig && projectPicker.parentNode) return;
    draftSig = sig;
    draftFolder.hidden = !many;
    draftFolder.replaceChildren(...(many ? project.folders.map((f) => h(doc, 'option', { value: f.path, text: f.path })) : []));
    if (many) draftFolder.value = session.folder;
    projectPicker.replaceChildren(
      draftSearch,
      projectRow({ id: '', name: t('chat.project_none'), checked: !project }),
      ...list.filter((p) => p.name.toLocaleLowerCase().includes(draftSearchText.trim().toLocaleLowerCase())).map((p) => projectRow({ id: p.id, name: p.name, checked: Boolean(project) && p.id === project.id })),
      draftBrowse,
      ...(many ? [h(doc, 'div', { class: 'project-folder' }, draftFolder)] : []));
  }
  // Шапка чата (задача 192.6): только название (с «родитель ›» и номером задачи) и шеврон ⌄ с меню действий сессии
  const headMenu = h(doc, 'span', { class: 'head-menu' });
  let headCtx = null; // { session, pinned, unread } показанной сессии
  function syncHeadMenu() {
    if (!headCtx) { headMenu.replaceChildren(); return; }
    const open = sideKit.menuFor(headCtx.session, { pinned: headCtx.pinned, unread: headCtx.unread, rename: startRename }, 'head');
    headMenu.replaceChildren(...[sideKit.headButton(headCtx.session), open].filter(Boolean));
  }
  const titleBlock = h(doc, 'div', { class: 'title-block', hidden: true }, title, headMenu);
  const railButton = h(doc, 'button', { type: 'button', class: 'icon-btn', 'aria-label': t('rail.toggle'), title: t('rail.toggle'), 'aria-pressed': 'true' }, icon(doc, 'i-panel'));
  const topbar = h(doc, 'header', { class: 'topbar' }, backButton, titleBlock, railButton);

  const pick = h(doc, 'p', { class: 'pick', text: t('chat.pick') });
  const thread = h(doc, 'div', { class: 'thread' });
  const historyLoading = h(doc, 'p', { class: 'history-loading', role: 'status', hidden: true, text: t('loading.history') });
  const log = h(doc, 'div', { class: 'log', role: 'log', 'aria-live': 'off' }, thread, historyLoading);
  const emptyChat = h(doc, 'p', { class: 'empty', text: t('chat.empty') });

  // поле ввода
  const input = h(doc, 'textarea', {
    id: 'composer-input', rows: 1, placeholder: t('composer.placeholder'), 'aria-label': t('chat.input_label'),
  });
  // Кнопки круглые, без видимого текста: имя — для чтения с экрана, подсказка о клавишах — в title (задача 192).
  const micButton = h(doc, 'button', { type: 'button', class: 'mic-btn', 'data-tip': `${t('voice.start')} · ${t('voice.right_click')}`, 'aria-label': `${t('voice.label')}: ${t('voice.start')}`, 'data-state': 'idle' }, icon(doc, 'i-mic'));
  const wave = h(doc, 'div', { class: 'wave', 'aria-hidden': 'true', hidden: true }, ...Array.from({ length: BARS }, () => h(doc, 'i')));
  const micTimer = h(doc, 'span', { class: 'mic-timer', 'aria-hidden': 'true', hidden: true });
  // стрелка рядом с микрофоном открывает меню: провайдер распознавания, язык, микрофон
  const micMore = h(doc, 'button', { type: 'button', class: 'mic-more', title: t('voice.menu'), 'aria-label': t('voice.menu'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon(doc, 'i-chevron-down'));
  const voiceMenu = h(doc, 'div', { class: 'menu voice-menu', role: 'menu', 'data-side': 'right', hidden: true });
  const voiceList = h(doc, 'div', { class: 'menu-list' });
  voiceMenu.append(voiceList);
  const micWrap = h(doc, 'div', { class: 'mic-wrap' }, micButton, micMore, voiceMenu);
  // Ошибки голоса — красная плашка над полем: position absolute, место в потоке не занимает, макет не прыгает
  const voiceToastText = h(doc, 'span', { class: 'voice-toast-text' });
  const voiceToastClose = h(doc, 'button', { type: 'button', class: 'voice-toast-close', title: t('voice.dismiss'), 'aria-label': t('voice.dismiss') }, icon(doc, 'i-x'));
  const voiceHint = h(doc, 'div', { class: 'voice-toast', role: 'alert', hidden: true }, voiceToastText, voiceToastClose);
  const voiceToast = createToast({
    show(text) { voiceToastText.textContent = text; voiceHint.hidden = false; },
    hide() { voiceHint.hidden = true; voiceToastText.textContent = ''; },
    timers: { setTimeout: (f, ms) => globalThis.setTimeout(f, ms), clearTimeout: (id) => globalThis.clearTimeout(id) },
  });
  voiceHint.addEventListener('click', () => voiceToast.hide());
  const cancelButton = h(doc, 'button', { type: 'button', class: 'cancel-btn', hidden: true, 'data-tip': t('chat.cancel'), 'aria-label': t('chat.cancel') }, icon(doc, 'i-stop'), h(doc, 'span', { class: 'sr-only', text: t('chat.cancel') }));
  const sendButton = h(doc, 'button', { type: 'button', class: 'send-btn', 'data-tip': t('composer.hint'), disabled: true }, icon(doc, 'i-return'), h(doc, 'span', { class: 'sr-only', text: t('chat.send') }));
  // счётчик очереди — над полем, position absolute: его появление не меняет высоту
  const queueButton = h(doc, 'button', { type: 'button', class: 'queue-count', hidden: true, title: t('composer.queued_hint') });
  // картинки сообщения: полоска превью — первой строкой карточки (задача 192)
  const viewer = createViewer(doc, { h, icon });
  const attach = createAttachUi(doc, {
    h, icon, showError: (text) => voiceToast.show(text), onChange: () => fitInput(),
    onView: (images, at, from) => viewer.open(images, at, from),
  });
  // панель записи (таймер и дорожка) лежит поверх карточки справа от места микрофона: ширина поля не меняется
  const recPanel = h(doc, 'div', { class: 'rec-panel' }, micTimer, wave);
  const plusButton = h(doc, 'button', { type: 'button', class: 'plus-btn', title: t('images.add'), 'aria-label': t('images.add') }, icon(doc, 'i-plus'));
  const box = h(doc, 'div', { class: 'box' }, attach.row, input, recPanel);
  attach.bindPicker(plusButton);
  attach.bindPaste(input);
  attach.bindDrop(box);
  // счётчик очереди (Enter при работающем агенте); клик убирает последнее сообщение

  // строка статуса под полем: слева режим (когда агент его сообщает), справа модель и спиннер хода
  // Голосовой ввод (задача 192): нажать и держать — пишет, отпустить — стоп; короткое нажатие и Пробел/Enter — переключатель.
  let storage = null;
  try { storage = win && win.localStorage ? win.localStorage : null; } catch { storage = null; }
  const page = pageLang(doc);
  const voiceSettings = createVoiceSettings({
    storage,
    fetchFn: (...args) => win.fetch(...args),
    mediaDevices: win && win.navigator ? win.navigator.mediaDevices : undefined,
    page,
  });
  const voiceChange = () => { fitInput(); if (currentTrace) drafts.set(currentTrace, input.value); };
  // Запись: «Слушаю…» вместо подсказки, дорожка уровня, «↵» вместо отправки (задача 192)
  const waveBars = [...wave.children];
  const paintWave = (levels) => { const px = barHeights(levels, 3, 22); waveBars.forEach((bar, i) => { bar.style.height = `${px[i]}px`; }); };
  const meter = createMeter({
    mediaDevices: win && win.navigator ? win.navigator.mediaDevices : undefined,
    AudioCtx: win ? (win.AudioContext || win.webkitAudioContext) : undefined,
    getMic: () => voiceSettings.state.mic,
    onLevels: paintWave,
  });
  let recordingNow = false;
  function paintRecording(state) {
    const v = recordingView(state);
    input.placeholder = t(v.placeholderKey);
    box.classList.toggle('recording', v.showWave);
    const micUse = micButton.querySelector('use');
    if (micUse) micUse.setAttribute('href', v.showWave ? '#i-mic-fill' : '#i-mic');
    wave.hidden = !v.showWave;
    recordingNow = v.hideSend;
    input.spellcheck = !v.showWave; // красные волны орфографии при записи не нужны
    syncSend(!cancelButton.hidden);
    if (v.showWave) meter.start(); else meter.stop();
  }
  // Таймер записи «0:07» рядом с кнопкой, пока идёт запись
  let micClock = null;
  let micStartedAt = 0;
  const paintMicTimer = () => { micTimer.textContent = clockText((now() - micStartedAt) / 1000); };
  function setMicTimer(on) {
    if (on && micClock === null) {
      micStartedAt = now();
      paintMicTimer();
      micTimer.hidden = false;
      micClock = setInterval(paintMicTimer, 500);
    } else if (!on && micClock !== null) {
      clearInterval(micClock);
      micClock = null;
      micTimer.hidden = true;
      micTimer.textContent = '';
    }
  }
  // Состояние кнопки и подсказка под полем: «недоступно» (серая: браузер без распознавания) и «ошибка» (можно повторить)
  const voiceStatus = (s) => {
    micButton.dataset.state = s.state;
    const hint = t(micTitleKey(s.state));
    micButton.dataset.tip = s.state === 'recording' || s.state === 'processing' ? hint : `${hint} · ${t('voice.right_click')}`;
    micButton.setAttribute('aria-label', `${t('voice.label')}: ${hint}`);
    setMicTimer(s.state === 'recording');
    paintRecording(s.state);
    if (s.state === 'unavailable') voiceToast.show(t('voice.unavailable', { reason: s.reason }));
    else if (s.state === 'error') voiceToast.show(t('voice.failed', { reason: s.reason }));
    else if (s.state === 'processing' && s.reason) voiceToast.show(t('voice.processing_note', { note: s.reason }));
    else if (s.state !== 'processing') voiceToast.hide();
  };
  const browserDictation = createDictation({
    Ctor: speechCtor(win),
    field: input,
    lang: () => langFor('browser', voiceSettings.state.lang, page),
    onChange: voiceChange,
    onStatus: voiceStatus,
  });
  const localDictation = createLocalDictation({
    field: input,
    mediaDevices: win && win.navigator ? win.navigator.mediaDevices : undefined,
    AudioCtx: win ? (win.AudioContext || win.webkitAudioContext) : undefined,
    fetchFn: (...args) => win.fetch(...args),
    getLang: () => langFor('local', voiceSettings.state.lang),
    getMic: () => voiceSettings.state.mic,
    workletUrl: new URL('./rec-worklet.js', import.meta.url).href,
    onChange: voiceChange,
    onStatus: voiceStatus,
  });
  // Одна ручка на два распознавателя: какой работает, решает выбор в меню на момент нажатия.
  let currentDictation = browserDictation;
  const dictation = {
    start() { currentDictation = voiceSettings.provider() === 'local' ? localDictation : browserDictation; return currentDictation.start(); },
    stop() { currentDictation.stop(); },
    cancel() { if (currentDictation.cancel) currentDictation.cancel(); },
    toggle() { if (currentDictation.active()) currentDictation.stop(); else this.start(); },
    active() { return browserDictation.active() || localDictation.active(); },
  };
  // серая кнопка — только если работать будет браузерный распознаватель, а его в этом браузере нет
  const syncMicIdle = () => {
    if (micButton.dataset.state !== 'idle' && micButton.dataset.state !== 'unavailable') return;
    micButton.dataset.state = voiceSettings.provider() === 'browser' && !speechCtor(win) ? 'unavailable' : 'idle';
  };
  syncMicIdle();
  voiceSettings.refreshStatus().then(syncMicIdle);

  // ---- меню голосового ввода
  const voiceRow = ({ name, description, checked, disabled, onPick }) => {
    const row = menuRow({ name, description, checked, onPick: disabled ? () => {} : onPick });
    if (disabled) row.setAttribute('aria-disabled', 'true');
    return row;
  };
  function renderVoiceMenu() {
    const st = voiceSettings.state;
    const provider = voiceSettings.provider();
    const offline = st.available === false;
    const rows = [
      h(doc, 'div', { class: 'menu-head', text: t('voice.provider_head') }),
      voiceRow({ name: t('voice.p_browser'), checked: provider === 'browser', onPick: () => { voiceSettings.setProvider('browser'); syncMicIdle(); renderVoiceMenu(); } }),
      voiceRow({
        name: t('voice.p_local'), description: offline ? t('voice.not_running') : false, checked: provider === 'local', disabled: offline,
        onPick: () => { voiceSettings.setProvider('local'); syncMicIdle(); renderVoiceMenu(); },
      }),
      h(doc, 'div', { class: 'menu-sep', role: 'separator' }),
      h(doc, 'div', { class: 'menu-head', text: t('voice.lang_head') }),
      ...LANGS.map((l) => voiceRow({
        name: l.id === 'auto' ? t('voice.lang_auto') : l.name, checked: st.lang === l.id,
        onPick: () => { voiceSettings.setLang(l.id); renderVoiceMenu(); },
      })),
      h(doc, 'div', { class: 'menu-sep', role: 'separator' }),
      h(doc, 'div', { class: 'menu-head', text: provider === 'local' ? t('voice.mic_head') : t('voice.mic_head_browser') }),
      voiceRow({ name: t('voice.mic_default'), checked: st.mic === '' || !st.mics.devices.some((d) => d.id === st.mic), onPick: () => { voiceSettings.setMic(''); renderVoiceMenu(); } }),
      ...st.mics.devices.filter((d) => d.id !== 'default').map((d, i) => voiceRow({
        name: d.label || t('voice.mic_n', { n: i + 1 }), checked: st.mic === d.id, onPick: () => { voiceSettings.setMic(d.id); renderVoiceMenu(); },
      })),
    ];
    if (!st.mics.labelled) {
      rows.push(voiceRow({
        name: t('voice.mic_allow'),
        onPick: async () => {
          try {
            const stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
            for (const track of stream.getTracks()) track.stop();
          } catch (e) {
            voiceStatus({ state: 'error', reason: e && e.name === 'NotAllowedError' ? t('voice.err_denied') : t('voice.err_no_mic') });
          }
          await voiceSettings.refreshMics();
          renderVoiceMenu();
        },
      }));
    }
    voiceList.replaceChildren(...rows);
    voiceMenu.hidden = false;
    micMore.setAttribute('aria-expanded', 'true');
  }
  function closeVoiceMenu() {
    voiceMenu.hidden = true;
    micMore.setAttribute('aria-expanded', 'false');
  }
  const toggleVoiceMenu = () => {
    if (!voiceMenu.hidden) { closeVoiceMenu(); return; }
    renderVoiceMenu();
    // статус сервера и список микрофонов узнаём при открытии: сервер могли запустить или остановить
    Promise.all([voiceSettings.refreshStatus(), voiceSettings.refreshMics()]).then(() => { if (!voiceMenu.hidden) renderVoiceMenu(); syncMicIdle(); });
  };
  micMore.addEventListener('click', toggleVoiceMenu);
  // правый клик на микрофоне — то же меню (провайдер, язык, микрофон), как и по стрелке рядом
  micButton.addEventListener('contextmenu', (e) => { e.preventDefault(); if (voiceMenu.hidden) toggleVoiceMenu(); });
  doc.addEventListener('click', (e) => { if (!voiceMenu.hidden && !e.composedPath().includes(micWrap)) closeVoiceMenu(); });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !voiceMenu.hidden) closeVoiceMenu(); });
  const micPress = createMicPress({ dictation, now, onStart: () => { voiceSettings.refreshStatus().then(syncMicIdle); } });
  micButton.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    micPress.down();
  });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dictation.active()) { e.preventDefault(); dictation.cancel(); } });
  micButton.addEventListener('pointerup', () => micPress.up());
  micButton.addEventListener('pointercancel', () => micPress.up());
  micButton.addEventListener('pointerleave', () => micPress.up());
  micButton.addEventListener('click', (e) => { if (e.detail === 0) micPress.key(); });

  const statusModel = h(doc, 'span', { class: 'status-model' });
  const familyButton = h(doc, 'button', { type: 'button', class: 'status-btn agent-picker-button', hidden: true, title: t('status.agent'), 'aria-label': t('status.agent'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  const modeButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, title: t('menu.agent_permissions'), 'aria-label': t('menu.agent_permissions'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const modelButton = h(doc, 'button', { type: 'button', class: 'status-btn', hidden: true, title: t('status.model'), 'aria-label': t('status.model'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const effortButton = h(doc, 'button', { type: 'button', class: 'status-btn effort-picker-button', hidden: true, title: t('menu.effort'), 'aria-label': t('menu.effort'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  // Режим работы по методике (задача 192p): слева в строке статуса, плоский текст без шеврона.
  const routeButton = h(doc, 'button', { type: 'button', class: 'status-btn route-chip', hidden: true, title: t('route.label'), 'aria-label': t('route.label'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  // Под полем новой сессии: Worktree · режим · агент · модель · усилие; проект выбирается только списком посреди пустого чата (задача 192.6).
  const worktreeButton = h(doc, 'button', { type: 'button', class: 'status-btn worktree-chip', hidden: true, 'aria-pressed': 'true', title: t('route.worktree_on') },
    icon(doc, 'i-branch'), h(doc, 'span', { text: t('route.worktree') }));
  worktreeButton.addEventListener('click', async () => {
    if (worktreeButton.disabled || !currentTrace) return;
    const s = current.session;
    if (!s || s.id !== currentTrace) return;
    const rs = s.routeState;
    const choice = await projectsUi.pickWorkspace({ folder: s.projectId ? s.folder : '',
      worktree: s.draft ? s.worktree !== false : rs && rs.useTree !== false,
      sourceBranch: s.draft ? (s.sourceBranch || '') : (rs && rs.sourceBranch || '') });
    if (choice) handlers.onWorkspace(s.id, s.folder, choice);
  });
  // Задача 192.12: набор «роль → семья, модель, усилие» — выбор под полем новой сессии и у открытой сессии
  // Задача 265: чип «Результат» — кнопка с общим меню, а не select (его ширина была по самой длинной строке):
  // чип ограничен и сокращает текст многоточием, полный текст — в title и aria-label, меню ограничено и слева.
  const resultRepoButton = h(doc, 'button', { type: 'button', class: 'status-btn result-chip', hidden: true, title: 'Репозиторий результата', 'aria-label': 'Репозиторий результата', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  let resultRepoRecords = [];
  let resultRepoShown = { selected: '', label: '' };
  function fillResultRepos(selected = '', label = '') {
    resultRepoShown = { selected, label };
    const record = resultRepoRecords.find((p) => p.id === selected);
    const text = selected ? `Сдача в: ${record ? `${record.dir} → ${record.remote}/${record.branch}` : (label || selected)}` : 'Сдача в репозиторий проекта';
    resultRepoButton.replaceChildren(h(doc, 'span', { text }));
    resultRepoButton.title = text;
    resultRepoButton.setAttribute('aria-label', text);
  }
  async function refreshResultRepos() {
    if (!projectsApi || !projectsApi.listResultRepos) return;
    const r = await projectsApi.listResultRepos();
    if (r.ok) {
      resultRepoRecords = (r.body && r.body.repositories) || [];
      fillResultRepos(resultRepoShown.selected, resultRepoShown.label);
      if (menuKind === 'result') renderMenu();
    }
  }
  async function registerResultRepo() {
    const trace = currentTrace;
    if (!trace) return;
    const path = await projectsUi.pickFolder();
    if (!path) return;
    const inspected = await projectsApi.inspectResultRepo(path);
    if (!inspected.ok) { handlers.onNotice(inspected.error, 'error'); return; }
    const target = inspected.body;
    const confirmed = await projectsUi.confirm({ title: 'Подтвердить репозиторий результата', text: `${target.dir}\n${target.common}\n${target.url}\n${target.remote}/${target.branch}\nКарточка проекта Canopus не создаётся.`, ok: 'Подтверждаю', cancel: 'Отмена' });
    if (!confirmed || trace !== currentTrace) return;
    const registered = await projectsApi.registerResultRepo(target);
    if (!registered.ok) { handlers.onNotice(registered.error, 'error'); return; }
    resultRepoRecords.push(registered.body);
    fillResultRepos(registered.body.id);
    handlers.onResultRepo(trace, registered.body.id);
  }
  resultRepoButton.addEventListener('click', () => toggleMenu('result'));
  const presetSelect = h(doc, 'select', { class: 'status-btn preset-chip', hidden: true, title: t('preset.label'), 'aria-label': t('preset.label') });
  presetSelect.addEventListener('change', () => {
    if (!currentTrace) return;
    if (presetSelect.dataset.draft === 'true') handlers.onDraftPreset(currentTrace, presetSelect.value); else handlers.onSessionPreset(currentTrace, presetSelect.value);
  });
  // Задача 192.4: где идёт работа (main, ветка папки проекта или своя ветка wip/задачи)
  // Задача 192.6: подпись — отдельной строкой под строкой чипов, чтобы не отнимать у них ширину
  const whereNote = h(doc, 'p', { class: 'where-note', hidden: true });
  const menu = h(doc, 'div', { class: 'menu composer-menu', role: 'menu', hidden: true });
  const agentAnchor = h(doc, 'div', { class: 'agent-picker-anchor' }, familyButton, effortButton, menu);
  // The model picker owns its anchor; the lower mode selector is the only visible mode control.
  const statusGroup = h(doc, 'div', { class: 'status-group' }, agentAnchor);
  // Композиция нижней панели по макету 268 (task/design/new-chat.png): режим, семья, модель и усилие —
  // пилюли одной строкой ВНУТРИ карточки композера, а не отдельной строкой под ней.
  const boxBar = h(doc, 'div', { class: 'box-bar', 'data-empty': 'true' },
    plusButton, routeButton, h(doc, 'span', { class: 'grow' }), modeButton, statusGroup, modelButton,
    h(doc, 'div', { class: 'box-row' }, micWrap, cancelButton, sendButton));
  box.append(boxBar);
  const status = h(doc, 'div', { class: 'composer-status', 'data-empty': 'true' }, worktreeButton, whereNote, resultRepoButton, h(doc, 'span', { class: 'grow' }), presetSelect);

  // Меню выбора режима, модели и усилия (задача 192): показывает только то, что агент отдал по ACP.
  // Задача 265: сюда же меню репозитория результата ('result').
  const MENU_MODELS = 4;
  let menuKind = null; // null | 'agent' | 'route' | 'result' | 'mode' | 'model' | 'more' | 'effort'
  let options = null;
  let currentAgent = '';
  let currentSession = null;
  let currentRoute = INTERACTIVE_STATE.route;
  let menuQuery = '';
  let menuSig = '';
  let menuTrigger = null;
  const menuSearch = h(doc, 'input', { type: 'search', class: 'menu-search', placeholder: t('menu.search'), 'aria-label': t('menu.search'), autocomplete: 'off', hidden: true });
  const familyFilter = h(doc, 'select', { class: 'menu-family-filter', 'aria-label': 'Семья моделей', hidden: true });
  const menuList = h(doc, 'div', { class: 'menu-list' });
  menu.append(h(doc, 'div', { class: 'menu-controls' }, familyFilter, menuSearch), menuList);
  let familyFilterSignature = '';
  const nameOf = (list, id) => (list.find((c) => c.id === id) || { name: '' }).name;
  // Режимы и усилие — по-русски там, где перевод известен; оригинал агента остаётся в title (labels-ru.js).
  const labelFor = (kind, list, id) => labelOf(kind, list.find((c) => c.id === id) || { name: '' });
  function directModelsFor(family) {
    const session = currentSession;
    const metadata = modelMetadata();
    const catalogModels = metadata?.status === 'ready' && metadata.expiresAt > now() ? metadata.families?.[family] : undefined;
    if (family === 'codex' && catalogModels?.length) return catalogModels;
    if (!session?.draft && session?.agent === family && session.optionsAgent === family && session.options.models.length > 0) {
      return session.options.models.map((model) => ({ ...model, efforts: session.options.efforts }));
    }
    if (catalogModels) return catalogModels;
    if (metadata && metadata.status === 'ready' && metadata.family === family && Number.isFinite(metadata.expiresAt) && metadata.expiresAt > now()) return metadata.models;
    return null;
  }

  const codexModelVariant = (id) => /^(.*)\[(low|medium|high|xhigh|max|ultra)\]$/.exec(id);

  // The legacy Codex catalog encodes effort in model IDs; modern ACP sets it separately.
  function pickerModelsFor(family, models) {
    const entries = new Map();
    for (const model of models || []) {
      const variant = family === 'codex' && codexModelVariant(model.id);
      if (!variant) {
        entries.set(model.id, { ...model, family, efforts: model.efforts || [] });
        continue;
      }
      const [, id, effort] = variant;
      if (!entries.has(id)) {
        entries.set(id, { id, family, name: (model.name || id).replace(/ \((low|medium|high|xhigh|max|ultra)\)$/i, ''), efforts: [], aliases: [] });
      }
      const entry = entries.get(id);
      entry.aliases?.push(model.id);
      if (!entry.efforts.some((option) => option.id === effort)) {
        entry.efforts.push(model.efforts?.find((option) => option.id === effort) || { id: effort, name: effort });
      }
    }
    return [...entries.values()];
  }

  let activeEffortModel;
  let pickerSource;
  let activeEffort = '';
  let canChooseEffort = false;
  let syncEffortMenu;
  const effortMenuSignature = () => JSON.stringify(activeEffortModel);

  function closeMenu() {
    menuKind = null;
    syncEffortMenu = undefined;
    menu.hidden = true;
    modeButton.setAttribute('aria-expanded', 'false');
    modelButton.setAttribute('aria-expanded', 'false');
    effortButton.setAttribute('aria-expanded', 'false');
    familyButton.setAttribute('aria-expanded', 'false');
    routeButton.setAttribute('aria-expanded', 'false');
    resultRepoButton.setAttribute('aria-expanded', 'false');
  }

  function choose(setting, value) {
    if (currentTrace) handlers.onChoose(currentTrace, setting, value);
    closeMenu();
  }

  function pickSource(source, { keepMenu = false } = {}) {
    if (!currentTrace || !currentSession) return;
    if (currentSession.draft) handlers.onDraftSource?.(currentTrace, source);
    else if (typeof handlers.onSource === 'function') handlers.onSource(currentTrace, source);
    else handlers.onNotice?.('Этот сервер не поддерживает выбор источника агента');
    if (!keepMenu) closeMenu();
  }

  function positionMenu() {
    if (menu.hidden || !menuTrigger?.getBoundingClientRect || !menu.getBoundingClientRect) return;
    const trigger = menuTrigger.getBoundingClientRect();
    const viewportWidth = win?.innerWidth || doc.documentElement?.clientWidth;
    const viewportHeight = win?.innerHeight || doc.documentElement?.clientHeight;
    if (!viewportWidth || !viewportHeight) return;
    const bounds = menuKind === 'mode' ? { left: 0, right: viewportWidth } : chat.getBoundingClientRect();
    const gap = 8;
    const minLeft = Math.max(gap, bounds.left + gap);
    const right = Math.min(viewportWidth, bounds.right) - gap;
    menu.style.maxWidth = `${Math.max(0, right - minLeft)}px`;
    menu.style.minWidth = menuKind === 'agent' || menuKind === 'effort' ? '0' : `${Math.min(250, right - minLeft)}px`;
    const above = trigger.top - gap * 2;
    const below = viewportHeight - trigger.bottom - gap * 2;
    const openBelow = above < 180 && below > above;
    menu.style.top = openBelow ? `${trigger.bottom + gap}px` : 'auto';
    menu.style.bottom = openBelow ? 'auto' : `${viewportHeight - trigger.top + gap}px`;
    menu.style.maxHeight = `${Math.max(0, openBelow ? below : above)}px`;
    const width = menu.getBoundingClientRect().width;
    const desiredLeft = ['agent', 'effort', 'model', 'more'].includes(menuKind) ? trigger.right - width : trigger.left;
    menu.style.left = `${Math.max(minLeft, Math.min(desiredLeft, right - width))}px`;
  }

  function menuRow({ name, description, family, checked, number, arrow, tip, disabled = false, onPick }) {
    const row = h(doc, 'button', { type: 'button', class: 'menu-item', role: 'menuitem', 'aria-checked': checked ? 'true' : 'false', 'aria-disabled': disabled ? 'true' : undefined, disabled: disabled || undefined, title: tip || false },
      h(doc, 'span', { class: 'menu-check' }, checked ? icon(doc, 'i-check') : false),
      family ? h(doc, 'span', { class: 'menu-family', text: family }) : false,
      h(doc, 'span', { class: 'menu-label' }, h(doc, 'span', { text: name }), description ? h(doc, 'small', { text: description }) : false),
      arrow ? h(doc, 'span', { class: 'menu-end' }, icon(doc, 'i-chevron-right')) : h(doc, 'span', { class: 'menu-end menu-num', text: number ? String(number) : '' }));
    if (!disabled) row.addEventListener('click', onPick);
    return row;
  }

  function renderMenu() {
    menuList.replaceChildren();
    menu.dataset.kind = menuKind || '';
    familyFilter.hidden = menuKind !== 'agent';
    if (menuKind === 'agent') {
      menuSearch.hidden = false;
      menuSearch.placeholder = 'Поиск модели или пула';
      menuSearch.setAttribute('aria-label', 'Поиск модели или пула');
      menu.dataset.side = 'right';
      const signature = JSON.stringify(agents.map(agent => [agent.id, agentLabel(agent.id)]));
      if (signature !== familyFilterSignature) {
        const previous = familyFilter.value;
        familyFilter.replaceChildren(h(doc, 'option', { value: '', text: 'Все семьи' }),
          ...agents.map(agent => h(doc, 'option', { value: agent.id, text: agentLabel(agent.id) })));
        familyFilter.value = agents.some(agent => agent.id === previous) ? previous : '';
        familyFilterSignature = signature;
      }
      familyFilter.hidden = agents.length < 2;
      const family = familyFilter.hidden ? '' : familyFilter.value;
      const query = menuQuery.trim().toLocaleLowerCase();
      const rows = [];
      const sourceInfo = presets() || {};
      const preset = (sourceInfo.presets || []).find((p) => p.name === (currentSession && currentSession.preset || sourceInfo.active || 'default'));
      const pools = preset && preset.pools && typeof preset.pools === 'object' ? preset.pools : {};
      const source = pickerSource;
      const rawMetadata = modelMetadata() || {};
      const metadata = rawMetadata.status === 'ready' && rawMetadata.expiresAt <= now()
        ? { ...rawMetadata, status: 'unavailable', reason: 'metadata_expired' }
        : rawMetadata;
      rows.push(h(doc, 'div', { class: 'menu-head menu-columns' },
        h(doc, 'span', { text: 'Семья' }), h(doc, 'span', { text: 'Модель или пул' })));
      if (metadata.status === 'ready' && metadata.complete === false) rows.push(h(doc, 'div', { class: 'menu-head menu-catalog-partial', text: 'Каталог неполный: доступны только подтверждённые модели.' }));
      const familyModels = new Map(agents.map((agent) => [agent.id, directModelsFor(agent.id)]));
      const allModels = agents.flatMap((agent) => pickerModelsFor(agent.id, familyModels.get(agent.id)))
        .filter((m) => (!family || m.family === family)
          && (!query || `${m.family} ${agentLabel(m.family)} ${m.name} ${m.id}`.toLocaleLowerCase().includes(query)));
      for (const m of allModels) {
        const chosen = source && !source.pool && source.family === m.family
          && (source.model === m.id || m.aliases?.includes(source.model));
        const chosenEffort = chosen && (m.aliases?.includes(source.model) ? codexModelVariant(source.model)?.[2] : source.effort);
        const currentEffort = m.efforts.find((option) => option.id === chosenEffort);
        const effort = currentEffort?.id || m.efforts[0]?.id || '';
        rows.push(menuRow({ name: m.name || m.id, family: agentLabel(m.family), checked: chosen,
          onPick: () => pickSource({ family: m.family, model: m.id, effort }) }));
      }
      for (const agent of agents) {
        if ((family && agent.id !== family) || (familyModels.get(agent.id) || []).length) continue;
        const reason = metadata.status === 'loading' ? 'Каталог загружается'
          : metadata.status === 'unavailable' ? metadata.family === agent.id ? `Каталог недоступен: ${metadata.reason || 'не подтверждён'}` : 'Источник этой семьи не подтверждён'
            : metadata.status === 'ready' ? 'Для этой семьи нет подтверждённого каталога'
              : 'Каталог не подтверждён';
        if (!query || `${agent.id} ${agentLabel(agent.id)} ${reason}`.toLocaleLowerCase().includes(query)) rows.push(menuRow({ name: reason, family: agentLabel(agent.id), disabled: true }));
      }
      for (const [poolName, levels] of Object.entries(pools)) for (const level of ['light', 'medium', 'heavy']) {
        const choices = Array.isArray(levels && levels[level]) ? levels[level] : [];
        for (const choice of choices) {
          if (choice.active === false || (family && choice.family !== family) || (query && !`${poolName} ${level} ${choice.family} ${choice.model}`.toLocaleLowerCase().includes(query))) continue;
          rows.push(menuRow({ name: `${poolName} · ${level}`, description: choice.model, family: agentLabel(choice.family), checked: Boolean(source && source.pool === poolName && source.level === level), onPick: () => pickSource({ pool: poolName, level }) }));
        }
      }
      if (!rows.some(row => row.classList.contains('menu-item'))) rows.push(h(doc, 'div', { class: 'menu-head', text: 'Ничего не найдено' }));
      menuList.append(...rows);
      menu.hidden = false;
      positionMenu();
      return;
    }
    if (menuKind === 'route') {
      menuSearch.hidden = true;
      menu.dataset.side = 'left';
      menuList.append(h(doc, 'div', { class: 'menu-head', text: t('route.label') }), ...CHAT_MODES.map((r, i) => menuRow({
        name: routeName(r.id), description: routeDescription(r.id), checked: r.id === currentRoute, number: i + 1,
        onPick: () => { if (currentTrace && r.id !== currentRoute) handlers.onRoute(currentTrace, r.id); closeMenu(); },
      })));
      menu.hidden = false;
      return;
    }
    if (menuKind === 'result') {
      menuSearch.hidden = true;
      menu.dataset.side = 'left';
      const { selected, label } = resultRepoShown;
      const rows = [
        h(doc, 'div', { class: 'menu-head', text: 'Репозиторий результата' }),
        menuRow({ name: 'Свой репозиторий', checked: selected === '', onPick: () => { if (currentTrace && selected !== '') handlers.onResultRepo(currentTrace, ''); closeMenu(); } }),
        ...resultRepoRecords.map((p) => menuRow({
          name: p.dir, description: `→ ${p.remote}/${p.branch}`, tip: `${p.dir} → ${p.remote}/${p.branch}`, checked: p.id === selected,
          onPick: () => { if (currentTrace && p.id !== selected) handlers.onResultRepo(currentTrace, p.id); closeMenu(); },
        })),
      ];
      if (selected && !resultRepoRecords.some((p) => p.id === selected)) rows.push(menuRow({ name: label || selected, checked: true, onPick: () => closeMenu() }));
      rows.push(h(doc, 'div', { class: 'menu-sep', role: 'separator' }),
        menuRow({ name: 'Подтвердить другой репозиторий…', onPick: () => { closeMenu(); registerResultRepo(); } }));
      menuList.append(...rows);
      menu.hidden = false;
      return;
    }
    if (menuKind === 'effort') {
      if (!activeEffortModel || activeEffortModel.efforts.length < 2) { closeMenu(); return; }
      menuSearch.hidden = true;
      menu.dataset.side = 'right';
      const efforts = activeEffortModel.efforts;
      const index = Math.max(0, efforts.findIndex((effort) => effort.id === activeEffort));
      const slider = h(doc, 'input', { type: 'range', class: 'effort-slider', min: '0', max: String(efforts.length - 1), step: '1', value: String(index), disabled: !canChooseEffort, 'aria-label': t('menu.effort') });
      const control = h(doc, 'div', { class: 'effort-control' });
      const ticks = efforts.map((_, step) => {
        const tick = h(doc, 'span', { class: 'effort-tick' });
        tick.style.setProperty('--effort-stop', String(100 * step / (efforts.length - 1)) + '%');
        return tick;
      });
      const tickLayer = h(doc, 'span', { class: 'effort-ticks', 'aria-hidden': 'true' }, ...ticks);
      const sparkleLayer = h(doc, 'span', { class: 'effort-sparkles', 'aria-hidden': 'true' });
      const caption = h(doc, 'div', { class: 'menu-head' });
      const paintEffort = (at) => {
        const name = labelOf('effort', efforts[at]).name;
        const captionName = name.replace(/(?:ое|ее)$/u, (ending) => ending === 'ое' ? 'ая' : 'яя');
        caption.textContent = `${modelLabel(activeEffortModel.family, activeEffortModel.name || activeEffortModel.id)}: ${captionName}`;
        slider.setAttribute('aria-valuetext', name);
        const ratio = efforts.length < 2 ? 1 : at / (efforts.length - 1);
        control.style.setProperty('--effort-fill', String(ratio * 100) + '%');
        ticks.forEach((tick, step) => {
          tick.hidden = step === at;
          tick.dataset.filled = String(step < at);
        });
        sparkleLayer.dataset.active = String(ratio >= 0.5);
      };
      for (let n = 0; n < 8; n += 1) {
        const star = h(doc, 'span', { class: 'effort-sparkle', text: '✦' });
        star.style.setProperty('--star-height', String(10 + (n * 3 % 7) * 13) + '%');
        star.style.setProperty('--star-offset', String(n * 11) + 'px');
        star.style.setProperty('--star-delay', String(-1.5 * n / 8) + 's');
        sparkleLayer.append(star);
      }
      let shownEffort = activeEffort;
      paintEffort(index);
      syncEffortMenu = () => {
        slider.disabled = !canChooseEffort;
        if (shownEffort === activeEffort) return;
        shownEffort = activeEffort;
        const at = Math.max(0, efforts.findIndex((effort) => effort.id === activeEffort));
        slider.value = String(at);
        paintEffort(at);
      };
      slider.addEventListener('input', () => { const at = Number(slider.value); paintEffort(at); });
      slider.addEventListener('change', () => {
        if (!canChooseEffort) return;
        const at = Number(slider.value);
        paintEffort(at);
        pickSource({ family: activeEffortModel.family, model: activeEffortModel.id, effort: efforts[at].id }, { keepMenu: true });
      });
      control.append(slider, sparkleLayer, tickLayer);
      menuList.append(caption, control);
      menu.hidden = false;
      return;
    }
    if (menuKind === 'mode' && current.session) {
      menuSearch.hidden = true;
      const { groups } = approvalView(current.model, current.session, agents, pickerSource);
      const busy = isBusy(current.session.state);
      for (const group of groups) {
        menuList.append(h(doc, 'div', { class: 'menu-head', text: agentLabel(group.family) }));
        if (group.unavailable) menuList.append(h(doc, 'div', { class: 'menu-head', text: group.unavailable }));
        if (group.pending) menuList.append(h(doc, 'div', { class: 'menu-head', text: 'Выбор ожидает подтверждения агента' }));
        for (const mode of group.modes) {
          const label = labelOf('mode', mode);
          menuList.append(menuRow({
            name: label.name, description: label.description, checked: mode.id === group.selected, disabled: busy,
            onPick: () => {
              if (!isBusy(current.session.state)) handlers.onApproval(current.session.id, group.family, mode.id);
              closeMenu();
            },
          }));
        }
      }
      menu.hidden = false;
      return;
    }
    if (!options || !menuKind) { menu.hidden = true; return; }
    const rows = [];
    const searchable = menuKind === 'model' || menuKind === 'more';
    menuSearch.hidden = !searchable;
    const searching = searchable && menuQuery.trim().length > 0;
    const numbered = (list, setting, current) => list.map((c, i) => {
      const l = setting === 'model' ? { name: c.name, description: c.description, title: '' } : labelOf(setting, c);
      return menuRow({
        name: l.name, description: l.description, tip: l.title, checked: c.id === current, number: i < 9 ? i + 1 : 0, onPick: () => choose(setting, c.id),
      });
    });
    menu.dataset.side = 'right';
    if (searching) {
      const found = filterModels(options.models, menuQuery);
      if (found.length === 0) rows.push(h(doc, 'div', { class: 'menu-head', text: t('menu.none') }));
      rows.push(...found.map((c) => menuRow({ name: c.name, description: c.description, checked: c.id === options.modelId, onPick: () => choose('model', c.id) })));
    } else if (menuKind === 'model') {
      rows.push(...numbered(options.models.slice(0, MENU_MODELS), 'model', options.modelId));
      if (options.models.length > MENU_MODELS) rows.push(h(doc, 'div', { class: 'menu-sep', role: 'separator' }));
      if (options.models.length > MENU_MODELS) rows.push(menuRow({ name: t('menu.more_models'), arrow: true, onPick: () => openMenu('more') }));
    } else if (menuKind === 'more') {
      rows.push(menuRow({ name: t('menu.back'), onPick: () => openMenu('model') }));
      const groups = groupModels(options.models);
      for (const g of groups) {
        if (g.provider) rows.push(h(doc, 'div', { class: 'menu-head', text: g.provider }));
        rows.push(...g.models.map((c) => menuRow({
          name: g.provider ? c.name.replace(`${g.provider}/`, '') : c.name, description: c.description, checked: c.id === options.modelId, onPick: () => choose('model', c.id),
        })));
      }
    }
    menuList.append(...rows);
    menu.hidden = false;
    menuList.querySelector('[aria-checked="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  // Задача 265: меню не открывается, когда выбирать не из чего или чип выключен; причина — в подсказке чипа.
  const hasOpts = (key) => Boolean(options && options[key].length > 0);
  function openMenu(kind) {
    if (kind === 'agent' && agents.length === 0 && !Object.values((presets() || {}).presets || {}).some((p) => p && p.pools)) return;
    if (kind === 'result' && resultRepoButton.disabled) return;
    if (kind === 'mode' && !current.session) return;
    if ((kind === 'model' || kind === 'more') && !hasOpts('models')) return;
    if (kind === 'effort' && !canChooseEffort) return;
    menuKind = kind;
    menuTrigger = { agent: familyButton, route: routeButton, result: resultRepoButton, mode: modeButton, model: modelButton, more: modelButton, effort: effortButton }[kind] || null;
    if (kind === 'agent' || kind === 'effort') agentAnchor.append(menu); else status.append(menu);
    menuQuery = '';
    menuSearch.value = '';
    menuSig = kind === 'effort' ? effortMenuSignature() : kind === 'route' ? currentRoute : kind === 'result' ? JSON.stringify(resultRepoShown) : JSON.stringify(options);
    familyButton.setAttribute('aria-expanded', kind === 'agent' ? 'true' : 'false');
    routeButton.setAttribute('aria-expanded', kind === 'route' ? 'true' : 'false');
    resultRepoButton.setAttribute('aria-expanded', kind === 'result' ? 'true' : 'false');
    modeButton.setAttribute('aria-expanded', kind === 'mode' ? 'true' : 'false');
    modelButton.setAttribute('aria-expanded', kind === 'model' || kind === 'more' ? 'true' : 'false');
    effortButton.setAttribute('aria-expanded', kind === 'effort' ? 'true' : 'false');
    renderMenu();
    positionMenu();
    if (kind === 'result') refreshResultRepos();
    if (kind === 'model' || kind === 'more' || kind === 'agent') menuSearch.focus();
    else menu.querySelector(kind === 'effort' ? '.effort-slider' : '.menu-item')?.focus();
  }

  menuSearch.addEventListener('input', () => { menuQuery = menuSearch.value; renderMenu(); });
  familyFilter.addEventListener('change', () => renderMenu());
  win?.addEventListener?.('resize', positionMenu);
  win?.addEventListener?.('scroll', positionMenu, true);
  // стрелки ходят по строкам, Enter в поиске берёт первую найденную
  menu.addEventListener('keydown', (e) => {
    const items = [...menuList.querySelectorAll('.menu-item')].filter((item) => !item.disabled);
    const at = items.indexOf(doc.activeElement);
    if (e.target === familyFilter || e.target?.classList?.contains('effort-slider')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items[at + 1] || items[0])?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (at <= 0 && !menuSearch.hidden) menuSearch.focus(); else (items[at - 1] || items[items.length - 1])?.focus();
    } else if (e.key === 'Enter' && doc.activeElement === menuSearch && items.length > 0) {
      e.preventDefault();
      items[0].click();
    }
  });

  const toggleMenu = (kind) => {
    const button = { agent: familyButton, mode: modeButton, model: modelButton, effort: effortButton }[kind];
    // aria-disabled оставляет кнопку доступной с клавиатуры: Enter/Space, как и клик,
    // объясняют отсутствие выбора через общую доступную строку уведомлений.
    if (kind === 'agent' && (familyButton.getAttribute('aria-disabled') === 'true' || familyButton.dataset.noChoices === 'true')) {
      closeMenu();
      handlers.onNotice?.(familyButton.title);
      return;
    }
    if (button?.getAttribute('aria-disabled') === 'true' && kind !== 'agent') {
      closeMenu();
      handlers.onNotice?.(button.title);
      return;
    }
    if (menuKind === kind) closeMenu(); else openMenu(kind);
  };
  familyButton.addEventListener('click', () => toggleMenu('agent'));
  routeButton.addEventListener('click', () => toggleMenu('route'));
  modeButton.addEventListener('click', () => toggleMenu('mode'));
  modelButton.addEventListener('click', () => toggleMenu('model'));
  effortButton.addEventListener('click', () => toggleMenu('effort'));
  // номера строк — горячие клавиши; у строк без номера (Назад, подменю) их нет
  doc.addEventListener('keydown', (e) => {
    if (!menuKind) return;
    if (e.key === 'Escape') { const trigger = menuTrigger; closeMenu(); trigger?.focus(); return; }
    if (/^[1-9]$/.test(e.key)) {
      const rows = [...menuList.querySelectorAll('.menu-num')].filter((n) => !n.closest('.menu-item')?.disabled);
      const at = rows.findIndex((n) => n.textContent === e.key);
      if (at >= 0) { e.preventDefault(); rows[at].closest('.menu-item').click(); }
    }
  });
  // Клик вне меню и его кнопки закрывает меню.
  doc.addEventListener('click', (e) => {
    if (!menuKind) return;
    const path = e.composedPath();
    if (path.includes(menu) || path.includes(menuTrigger)) return;
    if (menuKind === 'effort' && path.includes(askCard)) return;
    closeMenu();
  });

  // Полоса шагов режима (задача 192p): абсолютно над полем ввода, макет не сдвигает.
  const routeStrip = h(doc, 'section', { class: 'route-strip', hidden: true, 'aria-label': t('route.label') });
  let stripSig = '';
  function renderRouteStrip(session) {
    const rs = session.routeState;
    if (!showStrip(rs)) {
      if (stripSig !== '') { stripSig = ''; routeStrip.hidden = true; routeStrip.replaceChildren(); }
      return;
    }
    const folded = open.has('route-folded');
    const sig = JSON.stringify([session.id, rs, folded]);
    if (sig === stripSig) return;
    stripSig = sig;
    const acts = stripActions(rs);
    const skipStep = stepToSkip(rs.steps);
    const fold = h(doc, 'button', { type: 'button', class: 'route-fold', 'aria-expanded': String(!folded), title: t('route.fold') },
      icon(doc, 'i-chevron-down', 'chev'),
      h(doc, 'span', { class: 'route-title', text: t('route.steps_title', { name: routeName(rs.route) }) }),
      h(doc, 'span', { class: 'route-count', text: counterText(rs.steps) }));
    fold.addEventListener('click', () => {
      if (open.has('route-folded')) open.delete('route-folded'); else open.add('route-folded');
      stripSig = '';
      renderRouteStrip(current.session);
    });
    const run = h(doc, 'button', { type: 'button', class: 'route-btn primary', text: t('route.run'), disabled: !acts.run });
    const skip = h(doc, 'button', { type: 'button', class: 'route-btn', text: t('route.skip'), disabled: !acts.skip });
    const stop = h(doc, 'button', { type: 'button', class: 'route-btn danger', text: t('route.stop'), disabled: !acts.stop });
    run.addEventListener('click', () => handlers.onRouteRun(session.id));
    skip.addEventListener('click', () => handlers.onRouteSkip(session.id, skipStep));
    stop.addEventListener('click', () => handlers.onRouteStop(session.id));
    const steps = h(doc, 'ol', { class: 'route-steps', hidden: folded }, ...rs.steps.map((x) => h(doc, 'li', {
      class: 'route-step', 'data-state': x.state, title: t(STEP_STATE_KEY[x.state]), 'aria-label': `${x.title}: ${t(STEP_STATE_KEY[x.state])}`,
    }, icon(doc, STEP_ICON[x.state]), h(doc, 'span', { text: x.title }))));
    routeStrip.replaceChildren(h(doc, 'div', { class: 'route-head' }, fold, h(doc, 'div', { class: 'route-actions' }, run, skip, stop)), steps);
    routeStrip.dataset.running = String(rs.running);
    routeStrip.hidden = false;
  }

  // Баннер «Задача разрослась»: над полем, рядом с полосой шагов; «Продолжить» запоминается до следующей подзадачи.
  const routeBanner = h(doc, 'section', { class: 'route-banner', hidden: true, role: 'status' });
  const bannerDismissed = new Map(); // «сессия:задача» -> число подзадач на момент «Продолжить»
  let bannerSig = '';
  function renderRouteBanner(session) {
    const rs = session.routeState;
    const task = rs && rs.task;
    const count = bannerCount(rs, task ? bannerDismissed.get(`${session.id}:${task.id}`) : undefined);
    const sig = JSON.stringify([session.id, count, task && task.id]);
    if (sig === bannerSig) return;
    bannerSig = sig;
    if (count === 0) { routeBanner.hidden = true; routeBanner.replaceChildren(); return; }
    const close = h(doc, 'button', { type: 'button', class: 'route-btn primary', text: t('route.banner_close') });
    const keep = h(doc, 'button', { type: 'button', class: 'route-btn', text: t('route.banner_keep') });
    close.addEventListener('click', () => handlers.onRouteNewTask(session.id));
    keep.addEventListener('click', () => {
      bannerDismissed.set(`${session.id}:${task.id}`, count);
      bannerSig = '';
      renderRouteBanner(session);
    });
    routeBanner.replaceChildren(
      h(doc, 'span', { class: 'route-banner-text', text: t('route.banner', { count: subtaskCountText(count) }) }),
      h(doc, 'div', { class: 'route-actions' }, close, keep));
    routeBanner.hidden = false;
  }

  // Карточки задачи над полем (задача 192p): «Закончить задачу», «Задача готова», пересечение подзадач.
  const routeCards = h(doc, 'div', { class: 'route-cards', hidden: true });
  const staleKept = new Set(); // «сессия:задача», у которых владелец нажал «Оставить» на устаревшей сессии
  const overlapSeen = new Map(); // «сессия:задача:N:M» -> когда выберется «Отдельное дерево» (мс страницы)
  let cardsSig = '';
  const numberOf = (task) => task.number || task.id;
  function renderTaskCards(session) {
    const task = session.routeState && session.routeState.task;
    const finish = finishPrompt(task);
    const ready = readyPrompt(task);
    const overlap = overlapPrompt(task);
    const diffKey = `route-diff:${session.id}`;
    const showDiff = open.has(diffKey);
    let deadline = 0;
    if (overlap) {
      const key = `${session.id}:${task.id}:${overlap.n}:${overlap.with}`;
      if (!overlapSeen.has(key)) overlapSeen.set(key, now() + overlap.seconds * 1000);
      deadline = overlapSeen.get(key);
    }
    const stale = stalePrompt(task) && !staleKept.has(`${session.id}:${task.id}`);
    const kids = (session.routeState && session.routeState.kids) || { unmerged: [], child: null };
    const held = kids.unmerged;
    const toParent = Boolean(kids.child) && kids.child.target === 'parent';
    // у дочерней задачи эпика с веткой кнопка закрытия — «Влить в ветку эпика K», подпись называет ветку; иначе «Слить в main» (push в origin/main)
    const epicNo = kids.child ? kids.child.parentNo : '';
    const epicBranch = kids.child ? kids.child.parentBranch : '';
    const sig = JSON.stringify([session.id, task && [task.id, task.number, task.branch, task.state, task.unmergedCommits, task.diff, task.tests, task.testsRunning, task.stale, task.idleDays], finish, ready, overlap, showDiff, deadline, stale, held, toParent, epicNo, epicBranch, wipStalePrompt(session.routeState) && !staleKept.has(`${session.id}:wip`) && session.routeState.where]);
    if (sig === cardsSig) return;
    cardsSig = sig;
    const cards = [];
    const button = (text, cls, run) => {
      const b = h(doc, 'button', { type: 'button', class: `route-btn ${cls}`.trim(), text });
      b.addEventListener('click', run);
      return b;
    };
    // тесты не блокируют слияние, но видны: у ветки задачи и у main, с кнопкой «Прогнать тесты»
    const testsBlock = () => {
      const when = now();
      return h(doc, 'div', { class: 'route-tests' },
        h(doc, 'p', { class: 'route-tests-line', 'data-state': task.tests.branch.state, text: branchTestsText(task.tests.branch, when) }),
        h(doc, 'p', { class: 'route-tests-line', 'data-state': task.tests.main.state, text: mainTestsText(task.tests.main, when) }),
        task.testsRunning ? h(doc, 'p', { class: 'route-tests-line muted', text: t('route.tests_running') }) : false,
        testsRunnable(task) ? button(t('route.tests_run'), '', () => handlers.onRouteTestsRun(session.id)) : false);
    };
    if (finish) {
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'finish' },
        h(doc, 'strong', { class: 'route-card-title', text: t('route.finish_title', { number: numberOf(task) }) }),
        testsBlock(),
        held.length > 0 && !toParent ? h(doc, 'span', { class: 'route-card-text', text: t('route.children_unmerged', { list: held.join(', ') }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          h(doc, 'span', { class: 'route-merge' },
            button(toParent ? t('route.finish_merge_parent', { n: epicNo }) : t('route.finish_merge'), 'primary', () => handlers.onRouteMerge(session.id)),
            h(doc, 'small', { class: 'route-merge-note', text: toParent ? t('route.finish_merge_parent_note', { branch: epicBranch }) : t('route.finish_merge_note') })),
          button(t('route.finish_fast'), '', () => handlers.onRouteFinish(session.id, 'fast')),
          button(t('route.finish_full'), '', () => handlers.onRouteFinish(session.id, 'full')))));
    }
    if (stale) {
      const work = task.unmergedCommits > 0;
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'stale' },
        h(doc, 'strong', { class: 'route-card-title', text: t('route.stale_title', { days: task.idleDays }) }),
        h(doc, 'span', { class: 'route-card-text', text: t('route.stale_ask', { number: numberOf(task) }) }),
        work ? h(doc, 'span', { class: 'route-card-text', text: t('route.stale_work', { commits: commitsText(task.unmergedCommits) }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          work ? button(t('route.stale_drop_work'), 'danger', () => handlers.onRouteTreeDrop(session.id, true)) : button(t('route.stale_drop'), 'danger', () => handlers.onRouteTreeDrop(session.id, false)),
          button(t('route.stale_keep'), '', () => { staleKept.add(`${session.id}:${task.id}`); cardsSig = ''; renderTaskCards(current.session); }))));
    }
    const wipRs = session.routeState;
    if (wipStalePrompt(wipRs) && !staleKept.has(`${session.id}:wip`)) {
      const w = wipRs.where;
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'stale' },
        h(doc, 'strong', { class: 'route-card-title', text: t('where.stale_title', { branch: w.branch, days: w.idleDays }) }),
        h(doc, 'span', { class: 'route-card-text', text: t('where.stale_ask') }),
        w.work ? h(doc, 'span', { class: 'route-card-text', text: t('route.stale_work', { commits: w.unmergedCommits > 0 ? commitsText(w.unmergedCommits) : t('session.delete_wip_dirty') }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          w.work ? button(t('route.stale_drop_work'), 'danger', () => handlers.onRouteTreeDrop(session.id, true)) : button(t('route.stale_drop'), 'danger', () => handlers.onRouteTreeDrop(session.id, false)),
          button(t('route.stale_keep'), '', () => { staleKept.add(`${session.id}:wip`); cardsSig = ''; renderTaskCards(current.session); }))));
    }
    if (ready) {
      const totals = diffTotals(task.diff);
      const summary = t('route.ready_summary', {
        branch: task.branch || '—', commits: commitsText(task.unmergedCommits), files: filesText(totals.files), added: totals.added, removed: totals.removed,
      });
      const files = task.diff.files.length === 0
        ? [h(doc, 'li', { class: 'muted', text: t('route.diff_none') })]
        : task.diff.files.map((f) => h(doc, 'li', { class: 'route-diff-row', title: f.path },
          h(doc, 'span', { class: 'route-diff-path', text: f.path }),
          h(doc, 'span', { class: 'counts' }, h(doc, 'span', { class: 'plus', text: `+${f.added}` }), h(doc, 'span', { class: 'minus', text: `−${f.removed}` }))));
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'ready' },
        h(doc, 'strong', { class: 'route-card-title', text: t('route.ready_title', { number: numberOf(task) }) }),
        h(doc, 'span', { class: 'route-card-text', text: summary }),
        testsBlock(),
        showDiff ? h(doc, 'ul', { class: 'route-diff' }, ...files) : false,
        held.length > 0 && !toParent ? h(doc, 'span', { class: 'route-card-text', text: t('route.children_unmerged', { list: held.join(', ') }) }) : false,
        h(doc, 'div', { class: 'route-actions' },
          h(doc, 'span', { class: 'route-merge' },
            button(toParent ? t('route.ready_publish_parent', { n: epicNo }) : t('route.ready_publish'), 'dark', () => handlers.onRouteMerge(session.id)),
            h(doc, 'small', { class: 'route-merge-note', text: toParent ? t('route.finish_merge_parent_note', { branch: epicBranch }) : t('route.finish_merge_note') })),
          button(showDiff ? t('route.ready_hide') : t('route.ready_show'), '', () => {
            if (open.has(diffKey)) open.delete(diffKey); else open.add(diffKey);
            cardsSig = '';
            renderTaskCards(current.session);
          }))));
    }
    if (overlap) {
      const timer = h(doc, 'span', { class: 'route-card-timer', 'data-until': deadline, text: t('route.overlap_timer', { seconds: Math.max(0, Math.ceil((deadline - now()) / 1000)) }) });
      cards.push(h(doc, 'section', { class: 'route-card', 'data-card': 'overlap' },
        h(doc, 'span', { class: 'route-card-text', text: t('route.overlap', { n: overlap.n, with: overlap.with, files: overlap.files.join(', ') }) }),
        timer,
        h(doc, 'div', { class: 'route-actions' },
          button(t('route.overlap_own'), 'primary', () => handlers.onRouteSubtaskChoose(session.id, overlap.n, 'own')),
          button(t('route.overlap_shared'), '', () => handlers.onRouteSubtaskChoose(session.id, overlap.n, 'shared')))));
    }
    routeCards.replaceChildren(...cards);
    routeCards.hidden = cards.length === 0;
  }

  const canopusUi = createCanopusTaskUi(doc, handlers, { agents: () => Object.keys((current.model && current.model.catalog) || {}).sort() });
  const routeOver = h(doc, 'div', { class: 'route-over' }, canopusUi.el, routeCards, routeBanner, routeStrip);

  const askCard = h(doc, 'div', { class: 'ask', role: 'dialog', hidden: true });
  const askWrap = h(doc, 'div', { class: 'ask-wrap', hidden: true }, askCard);
  const permissionWrap = h(doc, 'div', { class: 'permission-wrap', hidden: true });
  const handoffHint = h(doc, 'div', { class: 'handoff-hint', role: 'status', hidden: true });
  const composer = h(doc, 'div', { class: 'composer' },
    routeOver,
    handoffHint,
    permissionWrap,
    box,
    voiceHint,
    askWrap,
    queueButton,
    status);

  // Кнопка «вниз»: круглая, по центру над полем; есть, только когда лента не в самом низу; точка — пришло новое, пока читали выше.
  const jumpButton = h(doc, 'button', { type: 'button', class: 'jump-btn', hidden: true, title: t('chat.to_bottom'), 'aria-label': t('chat.to_bottom') },
    icon(doc, 'i-arrow-down'), h(doc, 'span', { class: 'jump-dot', hidden: true, 'aria-hidden': 'true' }));
  const jumpDot = jumpButton.querySelector('.jump-dot');
  const jumpWrap = h(doc, 'div', { class: 'jump-wrap' }, jumpButton);
  let followTail = true;
  let lastScrollTop = 0;
  let unseen = false; // пока лента не в самом низу, что-то появилось или дописалось
  const distanceFromBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight;
  function syncJump() {
    const away = distanceFromBottom() > (followTail ? NEAR_BOTTOM_PX : 1);
    if (!away) unseen = false;
    jumpButton.hidden = !away;
    jumpDot.hidden = !(away && unseen);
    jumpButton.setAttribute('aria-label', unseen ? t('chat.to_bottom_new') : t('chat.to_bottom'));
    jumpButton.title = unseen ? t('chat.to_bottom_new') : t('chat.to_bottom');
  }
  function followLatest() {
    if (followTail && currentTrace) {
      log.scrollTop = log.scrollHeight;
      lastScrollTop = log.scrollTop;
    }
    syncJump();
  }
  log.addEventListener('scroll', () => {
    if (distanceFromBottom() <= 1) followTail = true;
    else if (log.scrollTop < lastScrollTop) followTail = false;
    lastScrollTop = log.scrollTop;
    syncJump();
  });
  jumpButton.addEventListener('click', () => {
    followTail = true;
    if (typeof log.scrollTo === 'function') log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    else followLatest();
  });
  const chat = h(doc, 'section', { class: 'chat', hidden: true }, log, jumpWrap, composer);
  if (win?.ResizeObserver) {
    const watchFeedSize = new win.ResizeObserver(() => {
      const gutters = String(log.offsetWidth - log.clientWidth) + 'px';
      if (chat.style.getPropertyValue('--log-gutters') !== gutters) chat.style.setProperty('--log-gutters', gutters);
      followLatest();
    });
    watchFeedSize.observe(log);
    watchFeedSize.observe(thread);
  }
  refs.main.replaceChildren(topbar, pick, chat);

  backButton.addEventListener('click', () => handlers.onBack());
  railButton.addEventListener('click', () => {
    const wide = Boolean(win && win.matchMedia && win.matchMedia(WIDE_QUERY).matches);
    railOpen = !(railOpen === null ? wide : railOpen);
    if (current.ui) refs.app.dataset.rail = railOpen ? 'open' : 'closed';
    railButton.setAttribute('aria-pressed', String(railOpen));
  });

  let currentTrace = null;
  const nodes = new Map(); // key элемента ленты -> { node, sig, item }

  let historyState = NO_HISTORY; // где мы в истории отправленных сообщений (↑ и ↓ в поле)
  let uploading = false; // картинки уходят на сервер: второй отправки пока нет
  function submit() {
    const originalText = input.value;
    const text = input.value.trim();
    const images = attach.items();
    if (!currentTrace || uploading || (text.length === 0 && images.length === 0)) return;
    // пока вопрос агента ждёт ответа, обычное сообщение не уходит: форма просит ответить или пропустить
    if (current.session && current.session.pendingQuestion) { nudgeAsk(); return; }
    const trace = currentTrace;
    historyState = NO_HISTORY; // после отправки история с пустого поля: новое сообщение в её конце, ↑ показывает его первым
    // агент занят ходом: сообщение (и его картинки) встаёт в очередь страницы и уходит, когда ход закончится
    if (current.session && !current.ui?.historyPending?.has(trace) && isBusy(current.session.state)) {
      if (handlers.onQueue(trace, text, images)) {
        input.value = '';
        attach.clear();
        drafts.delete(trace);
        attachDrafts.delete(trace);
        fitInput();
      }
      return;
    }
    const result = images.length ? handlers.onSend(trace, text, images) : handlers.onSend(trace, text);
    if (typeof result?.then !== 'function') {
      if (result) {
        input.value = '';
        fitInput();
        drafts.delete(trace);
      }
      return;
    }
    uploading = true;
    fitInput();
    const finish = (ok) => {
      uploading = false;
      if (ok) {
        if (currentTrace === trace) {
          input.value = afterSendText(originalText, input.value);
          if (input.value) drafts.set(trace, input.value); else drafts.delete(trace);
          const remaining = attach.take().filter(item => !images.some(sent => sent.id === item.id));
          attach.restore(remaining);
          if (remaining.length) attachDrafts.set(trace, remaining); else attachDrafts.delete(trace);
        } else {
          const keep = afterSendText(originalText, drafts.get(trace) || '');
          if (keep) drafts.set(trace, keep); else drafts.delete(trace);
          attachDrafts.set(trace, (attachDrafts.get(trace) || []).filter(item => !images.some(sent => sent.id === item.id)));
        }
      }
      fitInput();
    };
    result.then(finish, () => finish(false));
  }
  // «↵» нет совсем, пока нечего отправлять (пустое поле, нет картинок) и во время записи: правая группа не двигается, поле сжимается
  function syncSend(busy) {
    const can = canSend(input.value, attach.items(), uploading);
    // в записи место кнопки остаётся (visibility), чтобы поле не меняло ширину и текст не перетекал в нижнюю строку
    sendButton.hidden = !can || recordingNow;
    const restoring = current.ui?.historyPending?.has(currentTrace);
    const unavailable = current.ui?.restoreQueued?.has(currentTrace) || (restoring
      && (!current.ui.historyPreview?.has(currentTrace) || attach.items().length > 0));
    sendButton.disabled = !can || recordingNow || unavailable;
  }
  // Авторазмер: высота по содержимому, не выше 5 строк (дальше — внутренняя прокрутка, см. max-height в app.css).
  function fitInput() {
    syncSend(!cancelButton.hidden);
    input.style.height = 'auto';
    if (input.scrollHeight > 0) input.style.height = `${input.scrollHeight}px`; // 0 — чат скрыт: оставить auto
  }
  sendButton.addEventListener('click', () => submit());
  input.addEventListener('keydown', (e) => {
    // в записи Enter останавливает её и вставляет текст, а не отправляет сообщение
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && dictation.active()) { e.preventDefault(); dictation.stop(); return; }
    if (keyAction(e)) { e.preventDefault(); submit(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.isComposing && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && current.session) {
      const texts = current.session.messages.filter((m) => m.role === 'user' && m.text.trim().length > 0).map((m) => m.text);
      const step = historyStep({ texts, state: historyState, value: input.value, caret: input.selectionStart, key: e.key });
      if (step.handled) {
        e.preventDefault();
        historyState = step.state;
        input.value = step.value;
        input.setSelectionRange(step.value.length, step.value.length);
        fitInput();
        if (currentTrace) drafts.set(currentTrace, input.value);
      }
    }
  });
  queueButton.addEventListener('click', () => { if (currentTrace) handlers.onUnqueue(currentTrace); });
  input.addEventListener('input', () => {
    // правка текста историю не сбрасывает: ↑ и ↓ ходят по ней и с изменённым текстом (history.js)
    fitInput();
    if (currentTrace) drafts.set(currentTrace, input.value);
  });
  cancelButton.addEventListener('click', () => { if (currentTrace) handlers.onCancel(currentTrace); });

  // ---- элементы ленты

  function spans(text) {
    return inlineSpans(text).map((span) => {
      if (span.code) return h(doc, 'code', { class: 'inline', text: span.text });
      if (span.strong) return h(doc, 'strong', {}, ...spans(span.text));
      if (span.href) return h(doc, 'a', { class: 'md-link', href: span.href, target: '_blank', rel: 'noopener noreferrer', text: span.text });
      return doc.createTextNode(span.text);
    });
  }

  function proseNodes(text) {
    const out = [];
    for (const b of splitBlocks(text)) {
      if (b.type === 'code') {
        const code = codeSpans(b.text, b.lang).map(part => part.kind
          ? h(doc, 'span', { class: 'code-' + part.kind, text: part.text })
          : doc.createTextNode(part.text));
        out.push(h(doc, 'pre', {}, h(doc, 'code', { 'data-lang': b.lang || undefined }, ...code)));
        continue;
      }
      for (const p of paragraphs(b.text)) {
        if (p.type === 'p') out.push(h(doc, 'p', {}, ...spans(p.text)));
        else if (p.type === 'table') {
          const header = h(doc, 'tr', {}, ...p.headers.map((cell, col) =>
            h(doc, 'th', { scope: 'col', 'data-align': p.align[col] }, ...spans(cell))));
          const rows = p.rows.map(row => h(doc, 'tr', {}, ...row.map((cell, col) =>
            h(doc, 'td', { 'data-align': p.align[col] }, ...spans(cell)))));
          out.push(h(doc, 'div', { class: 'md-table-scroll' },
            h(doc, 'table', { class: 'md-table' }, h(doc, 'thead', {}, header), h(doc, 'tbody', {}, ...rows))));
        }
        else if (p.type === 'heading') out.push(h(doc, 'h' + p.level, { class: 'md-heading' }, ...spans(p.text)));
        else if (p.type === 'canopus-list') out.push(h(doc, 'div', { class: 'canopus-list-note' }, icon(doc, 'i-file'), h(doc, 'span', { text: t('work.canopus_list') })));
        else out.push(h(doc, p.type, {}, ...p.items.map((item) => h(doc, 'li', {}, ...spans(item)))));
      }
    }
    return out;
  }

  const summaryText = (sum) => [
    t('work.summary', { n: sum.count }),
    sum.failed > 0 ? t('work.failed', { n: sum.failed }) : '',
    sum.running > 0 ? t('work.running', { n: sum.running }) : '',
  ].filter(Boolean).join(' · ');

  function rowLabel(r) {
    if (r.type === 'tool') return t('work.tool', { kind: t(TOOL_LABEL[r.kind]), title: r.title });
    return t('work.task', { status: t(TASK_STATUS[r.status]), title: r.title });
  }

  function rowIcon(r) {
    if (r.type === 'tool') return icon(doc, TOOL_RESULT_ICON[r.status], 'row-leading');
    return icon(doc, TASK_ICON[r.status], 'row-leading');
  }

  function rowStatus(r) {
    if (r.type === 'tool') {
      const started = r.startedAt > 0;
      const live = r.status === 'in_progress' && started;
      const elapsed = started && r.finishedAt >= r.startedAt;
      return h(doc, 'span', { class: 'row-status' },
        (r.status === 'completed' || r.status === 'in_progress')
          ? h(doc, 'span', { class: 'sr-only', text: t(TOOL_STATUS[r.status]) })
          : h(doc, 'span', { text: t(TOOL_STATUS[r.status]) }),
        live || elapsed ? h(doc, 'span', { class: 'row-duration', 'data-since': live ? r.startedAt : undefined,
          text: durationText((live ? now() : r.finishedAt) - r.startedAt) }) : false);
    }
    if (r.type === 'task') {
      return r.finishedAt === null
        ? h(doc, 'span', { class: 'row-status', 'data-since': r.started, text: durationText(now() - r.started) })
        : h(doc, 'span', { class: 'row-status', text: durationText(r.finishedAt - r.started) });
    }
    return false;
  }

  function workRow(r) {
    const isCommand = r.type === 'tool' && r.kind === 'execute';
    const detail = r.type === 'task' ? '' : r.detail;
    const output = isCommand ? detail.split('\n').filter(line => !/^terminal: (?:exec-[\da-f-]+|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}|\?)\s*$/iu.test(line)).join('\n') : detail;
    const command = isCommand ? (r.command || (r.title !== r.id && !/^(?:bash|shell|terminal|command|execute|powershell|pwsh|cmd)$/iu.test(r.title.trim()) ? r.title : '')) : '';
    const showDetail = output && (!r.command || output !== JSON.stringify({ command: r.command }));
    const clipped = [command, showDetail && output].filter(Boolean).join('\n').trimEnd().split('\n').length > 11;
    const toolOutput = r.type === 'tool';
    const label = rowLabel(r);
    const key = `${currentTrace}:row:${r.key}`;
    const active = ['pending', 'in_progress', 'running'].includes(r.status);
    const expanded = workToggles.get(key) ?? active;
    const details = command || showDetail ? h(doc, 'div', { class: 'row-content', hidden: !expanded, tabindex: '0', 'data-clipped': clipped ? 'true' : undefined },
      command ? h(doc, 'code', { class: 'row-command', text: command }) : false,
      showDetail ? h(doc, toolOutput ? 'pre' : 'div', {
        class: toolOutput ? 'row-detail row-output' : 'row-detail',
        'aria-label': toolOutput ? t('work.output') : undefined, text: output,
      }) : false) : null;
    const actionIcon = r.type === 'tool' ? TOOL_ACTION_ICON[r.kind] : 'i-bolt';
    const heading = h(doc, details ? 'button' : 'div', details
      ? { type: 'button', class: 'row-label row-toggle', 'aria-expanded': String(expanded) }
      : { class: 'row-label row-heading' },
    icon(doc, actionIcon, 'row-action'), h(doc, 'span', { text: label }));
    if (details) heading.addEventListener('click', () => {
      const next = details.hidden;
      workToggles.set(key, next);
      heading.setAttribute('aria-expanded', String(next));
      details.hidden = !next;
    });
    return h(doc, 'div', { class: 'work-row', 'data-state': r.status },
      rowIcon(r),
      h(doc, 'div', { class: 'row-main' }, heading, details),
      rowStatus(r));
  }

  function toggleOpen(key, button, body) {
    const next = !open.has(key);
    if (next) open.add(key); else open.delete(key);
    button.setAttribute('aria-expanded', String(next));
    if (body) body.hidden = !next;
  }

  // Подробности по умолчанию скрыты. Раскрытие сохраняется при перерисовке по ключу карточки.
  function toggleCard(key, button, body) {
    const detailKey = `delivery-detail:${key}`;
    const next = open.has(detailKey);
    if (next) open.delete(detailKey); else open.add(detailKey);
    button.setAttribute('aria-expanded', String(!next));
    body.hidden = next;
  }

  function fillWork(entry, item) {
    const single = item.rows.length === 1 ? item.rows[0] : null;
    const key = `${currentTrace}:${item.key}`;
    const override = workToggles.get(key);
    const active = item.rows.some(r => ['pending', 'in_progress', 'running'].includes(r.status));
    const isOpen = override ?? active;
    const label = active ? t('work.current', { n: item.rows.length })
      : single ? rowLabel(single) : summaryText(workSummary(item.rows));
    const toggle = h(doc, 'button', { type: 'button', class: 'disclosure', 'aria-expanded': String(isOpen), 'data-state': single ? single.status : 'group' },
      icon(doc, 'i-chevron-right', 'chev'),
      h(doc, 'span', { class: 'disc-text', text: label }),
      single && !active ? rowStatus(single) : false);
    const body = h(doc, 'div', { class: 'work-body', hidden: !isOpen }, ...item.rows.map(workRow));
    toggle.addEventListener('click', () => {
      const next = toggle.getAttribute('aria-expanded') !== 'true';
      workToggles.set(key, next);
      toggle.setAttribute('aria-expanded', String(next));
      body.hidden = !next;
    });
    entry.node.replaceChildren(toggle, body);
  }

  function fillDiffs(entry, item) {
    const key = `more:${item.key}`;
    const all = open.has(key);
    const rows = all ? item.rows : item.rows.slice(0, FOLD_DIFFS);
    const list = h(doc, 'ul', { class: 'diff-list' }, ...rows.map((d) => {
      const fp = fileParts(d.path);
      return h(doc, 'li', { class: 'diff-row' },
        icon(doc, 'i-file'),
        h(doc, 'span', { class: 'file-name', text: fp.name }),
        fp.dir ? h(doc, 'span', { class: 'file-dir', text: fp.dir }) : h(doc, 'span', { class: 'file-dir' }),
        h(doc, 'span', { class: 'counts' },
          h(doc, 'span', { class: 'plus', text: `+${d.added}` }),
          h(doc, 'span', { class: 'minus', text: `−${d.removed}` })));
    }));
    const more = item.rows.length > FOLD_DIFFS
      ? h(doc, 'button', { type: 'button', class: 'link-btn', text: all ? t('diffs.hide') : t('diffs.show_all', { n: item.rows.length }) })
      : h(doc, 'span');
    more.addEventListener('click', () => {
      if (all) open.delete(key); else open.add(key);
      entry.sig = null;
      fillDiffs(entry, item);
    });
    entry.node.replaceChildren(
      h(doc, 'div', { class: 'card-title', text: t('diffs.title', { n: item.totals.files }) }),
      list,
      h(doc, 'div', { class: 'diff-foot' }, more, h(doc, 'span', { class: 'counts' },
        h(doc, 'span', { class: 'plus', text: `+${item.totals.added}` }),
        h(doc, 'span', { class: 'minus', text: `−${item.totals.removed}` }))),
    );
  }

  function fillItem(entry, item) {
    const { node } = entry;
    switch (item.type) {
      case 'delivery': {
        node.replaceChildren(...[
          item.state !== 'error' && !item.hasUserMessage ? h(doc, 'div', { class: 'bubble' }, ...proseNodes(item.text)) : null,
          deliveryCard(doc, { ...item, collapsed: !open.has(`delivery-detail:${item.key}`) }, {
            canRetry: item.retryAllowed,
            retry: id => handlers.onRetry(currentTrace, id),
            restore: text => putInField(text),
            copy: text => handlers.onCopy(text),
            forget: id => handlers.onForgetDelivery(id),
            toggle: (head, body) => toggleCard(item.key, head, body),
          })].filter(Boolean));
        break;
      }
      case 'user': {
        // картинки сообщения — миниатюры над текстом; клик открывает просмотрщик (стрелки листают картинки этого сообщения)
        const shown = item.images.map((image) => ({ src: imageSrc(image), name: image.name }));
        const thumbs = shown.length > 0
          ? h(doc, 'div', { class: 'thumbs' }, ...shown.map((image, at) => {
            const label = t('images.open', { name: image.name });
            const button = h(doc, 'button', { type: 'button', class: 'thumb', title: label, 'aria-label': label },
              h(doc, 'img', { class: 'thumb-img', src: image.src, alt: t('images.alt', { name: image.name }), loading: 'lazy' }));
            button.addEventListener('click', () => viewer.open(shown, at, button));
            return button;
          }))
          : false;
        node.replaceChildren(h(doc, 'span', { class: 'sr', text: t('chat.you') }),
          h(doc, 'div', { class: 'bubble' }, thumbs, ...(item.text.trim().length > 0 ? proseNodes(item.text) : [])),
          messageActions(item));
        break;
      }
      case 'queued': {
        // сообщение в очереди: приглушённый пузырь под текущим ходом, ряд иконок виден всегда
        node.dataset.queued = 'true';
        node.replaceChildren(h(doc, 'span', { class: 'sr', text: t('chat.you') }),
          h(doc, 'div', { class: 'bubble' },
            item.images.length > 0 ? h(doc, 'p', { class: 'queued-images', text: t('msg.images_n', { n: item.images.length }) }) : false,
            ...(item.text.trim().length > 0 ? proseNodes(item.text) : [])),
          messageActions(item));
        break;
      }
      case 'skipped':
        node.replaceChildren(h(doc, 'span', { text: t('chat.images_skipped', { agent: agentLabel(item.agent) }) }));
        break;
      case 'text':
        node.dataset.streaming = String(item.streaming);
        node.replaceChildren(h(doc, 'span', { class: 'sr', text: t('chat.agent') }), h(doc, 'div', { class: 'prose' }, ...proseNodes(item.text)));
        break;
      case 'author': {
        const label = item.actual
          ? [item.actual.family, item.actual.model, item.actual.effort || 'усилие не подтверждено'].join(' · ')
          : 'Автор не подтверждён';
        node.replaceChildren(h(doc, 'span', { class: 'agent-signature', text: label, 'aria-label': `Фактический автор ответа: ${label}` }));
        break;
      }
      case 'work':
        fillWork(entry, item);
        break;
      case 'diffs':
        fillDiffs(entry, item);
        break;
      case 'usage': {
        const n = item.steps;
        const parts = [
          item.latest.new !== undefined ? t('usage.new', { n: groupThousands(item.latest.new) }) : '',
          item.latest.cached !== undefined ? t('usage.cached', { n: groupThousands(item.latest.cached) }) : '',
          item.latest.total !== undefined ? t('usage.total', { n: groupThousands(item.latest.total) }) : '',
        ].filter(Boolean);
        if (item.context) parts.push(t('usage.context', { used: groupThousands(item.context.used), size: groupThousands(item.context.size) }));
        const text = t('usage.line', { steps: t(USAGE_STEP_KEY[ruForm(n)], { n }), parts: parts.join(' · ') });
        if (!item.expandable) {
          node.replaceChildren(h(doc, 'span', { class: 'usage-line', text }));
          break;
        }
        const key = `usage:${item.key}`;
        const isOpen = open.has(key);
        const toggle = h(doc, 'button', { type: 'button', class: 'usage-toggle', 'aria-expanded': String(isOpen), title: t('usage.toggle') },
          h(doc, 'span', { class: 'usage-sign', 'aria-hidden': 'true', text: isOpen ? '\u2212' : '+' }), h(doc, 'span', { text: ` ${text}` }));
        toggle.addEventListener('click', () => {
          if (open.has(key)) open.delete(key); else open.add(key);
          entry.sig = null;
          fillItem(entry, item);
        });
        const table = isOpen
          ? h(doc, 'table', { class: 'usage-table' },
            h(doc, 'thead', {}, h(doc, 'tr', {}, ...['usage.col_step', 'usage.col_new', 'usage.col_cached', 'usage.col_total'].map((key) => h(doc, 'th', { text: t(key) })))),
            h(doc, 'tbody', {}, ...item.rows.map((r) => h(doc, 'tr', {},
              h(doc, 'td', { text: r.label }),
              h(doc, 'td', { text: r.new === undefined ? '' : groupThousands(r.new) }),
              h(doc, 'td', { text: r.cached === undefined ? '' : groupThousands(r.cached) }),
              h(doc, 'td', { text: r.total === undefined ? '' : groupThousands(r.total) })))))
          : false;
        node.replaceChildren(...(table ? [toggle, table] : [toggle]));
        break;
      }
      case 'dropped':
        node.replaceChildren(h(doc, 'span', {
          text: t({ mode: 'chat.dropped_mode', model: 'chat.dropped_model', effort: 'chat.dropped_effort' }[item.setting] ?? 'chat.dropped_mode', { value: item.value, used: item.used }),
        }));
        break;
      case 'switch': {
        const text = t('chat.switched', { agent: agentLabel(item.to) });
        node.replaceChildren(h(doc, 'span', { text: item.cut ? `${text} ${t('chat.switched_cut', { shown: item.shown, total: item.total })}` : text }));
        break;
      }
      case 'answer': {
        const lines = item.skipped
          ? [t('ask.skipped', { question: item.lines.length > 0 ? item.lines[0].question : '' })]
          : item.lines.map((l) => t('ask.answer', { question: l.question, choice: l.choice }));
        node.replaceChildren(...lines.map((text) => h(doc, 'div', { text })));
        break;
      }
      case 'autoext': {
        const label = t(item.undone ? 'route.ext_undone' : 'route.ext_line', { task: item.task, title: item.title, text: item.text });
        const undo = item.undone ? false : h(doc, 'button', { type: 'button', class: 'link-btn', text: t('route.ext_undo') });
        if (undo) undo.addEventListener('click', () => { if (currentTrace) handlers.onExtUndo(currentTrace, item.id); });
        node.replaceChildren(h(doc, 'span', { text: label }), ...(undo ? [undo] : []));
        break;
      }
      case 'routenote':
        node.replaceChildren(h(doc, 'span', { text: t(NOTE_KEY[item.action], { n: item.n }) }));
        break;
      case 'note': {
        let text = t('chat.cancelled');
        if (item.tone === 'refused') text = item.reason ? t('chat.refused', { reason: safeError(item.reason) }) : t('chat.refused_plain');
        if (item.tone === 'error') text = item.reason ? t('chat.error', { message: safeError(item.reason) }) : t('chat.error_plain');
        node.dataset.tone = item.tone;
        if (item.tone === 'error' || item.tone === 'refused') {
          const failureState = item.turn ? (item.tone === 'refused' ? 'agent_refused' : 'agent_error') : 'error';
          node.replaceChildren(deliveryCard(doc, { id: item.key, state: failureState, text: item.userText || '', images: [], reason: item.reason, partialAnswer: item.partialAnswer, checking: item.checking, collapsed: !open.has(`delivery-detail:${item.key}`) }, {
            copy: text => handlers.onCopy(text), restore: text => putInField(text),
            toggle: (head, body) => toggleCard(item.key, head, body),
          }));
        } else node.replaceChildren(h(doc, 'span', { text }));
        break;
      }
      case 'needs': {
        node.dataset.needs = 'true';
        node.replaceChildren(askBadge(t('attn.need_reply')));
        break;
      }
      case 'actions': {
        const copy = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': t('chat.copy'), title: t('chat.copy') }, icon(doc, 'i-copy'));
        copy.addEventListener('click', () => handlers.onCopy(item.text));
        node.dataset.row = 'hover';
        if (hotTurn === item.turn) node.dataset.hot = 'on';
        else node.removeAttribute('data-hot');
        node.replaceChildren(copy, h(doc, 'span', { class: 'ago', 'data-ago': item.at, text: agoText(item.at) }));
        break;
      }
      default: {
        const dots = h(doc, 'span', { class: 'dots', 'aria-hidden': 'true' }, h(doc, 'i'), h(doc, 'i'), h(doc, 'i'));
        node.replaceChildren(dots, h(doc, 'span', { text: t('chat.running') }),
          item.since > 0 ? h(doc, 'span', { class: 'elapsed', 'data-since': item.since, text: durationText(now() - item.since) }) : false,
          h(doc, 'span', { class: 'silent-note', hidden: true, 'data-last': item.last || 0 },
            h(doc, 'span', { class: 'silent-text' }),
            (() => { const b = h(doc, 'button', { type: 'button', class: 'link-btn silent-cancel', text: t('attn.interrupt') }); b.addEventListener('click', () => { if (currentTrace) handlers.onCancel(currentTrace); }); return b; })()));
      }
    }
  }

  // Ряд под ответом агента показывается при наведении на любую часть этого ответа (и по касанию): items одного хода несут data-turn
  let hotTurn = '';
  function setHot(turn) {
    if (turn === hotTurn) return;
    hotTurn = turn;
    for (const row of thread.querySelectorAll('[data-row="hover"]')) {
      if (turn && row.dataset.turn === turn) row.dataset.hot = 'on'; else row.removeAttribute('data-hot');
    }
  }
  thread.addEventListener('mouseover', (e) => {
    const item = e.target.closest?.('.item');
    if (item) setHot(item.dataset.turn || '');
  });
  thread.addEventListener('mouseleave', () => setHot(''));
  // Ряд иконок под сообщением владельца раскрывается по касанию пузыря только пальцем: клик мышью (и по самим кнопкам ряда) его не «залипает».
  function clearTaps(except) {
    for (const n of thread.querySelectorAll('[data-tap="on"]')) if (n !== except) delete n.dataset.tap;
  }
  thread.addEventListener('click', (e) => {
    const item = e.target.closest ? e.target.closest('.item-user, .item-text') : null;
    if (!item) { clearTaps(null); return; }
    const touch = e.pointerType === 'touch';
    if (item.classList.contains('item-user')) {
      if (!touch || (e.target.closest && e.target.closest('button'))) return;
      clearTaps(item);
      item.dataset.tap = item.dataset.tap === 'on' ? '' : 'on';
    } else if (touch && !e.target.closest?.('a, button')) setHot(hotTurn === item.dataset.turn ? '' : item.dataset.turn);
  });
  thread.addEventListener('mouseleave', () => clearTaps(null));

  // ---- сообщения владельца: ряд мелких иконок под пузырём (при наведении; в очереди — всегда)
  function timeText(at) {
    if (!at) return '';
    const m = messageTime(at, now());
    if (m.kind === 'now') return t('msg.time_now');
    if (m.kind === 'today') return m.clock;
    if (m.kind === 'yesterday') return t('msg.time_yesterday', { clock: m.clock });
    return t('msg.time_older', { date: m.date, clock: m.clock });
  }
  function iconButton(doc2, id, label, onClick) {
    const b = h(doc2, 'button', { type: 'button', class: 'msg-btn', title: label, 'aria-label': label }, icon(doc2, id));
    b.addEventListener('click', onClick);
    return b;
  }
  /** Текст сообщения в поле ввода: перед тем, что уже набрано (через пустую строку); фокус в поле, курсор после вставленного, ничего не уходит. */
  function putInField(text, images = []) {
    const keep = input.value;
    input.value = restoreText(text, keep);
    if (images.length > 0) attach.restore([...attach.items(), ...images]);
    fitInput();
    if (currentTrace) drafts.set(currentTrace, input.value);
    input.focus();
    input.setSelectionRange(text.length, text.length);
  }
  function messageActions(item) {
    const queued = item.type === 'queued';
    const row = h(doc, 'div', { class: 'msg-actions', 'data-queued': queued ? 'true' : undefined });
    if (queued) {
      row.append(h(doc, 'span', { class: 'msg-state', text: t('msg.queued') }));
    } else {
      row.append(h(doc, 'span', { class: 'msg-check', title: t('msg.delivered'), 'aria-label': t('msg.delivered') }, icon(doc, 'i-check2')),
        h(doc, 'span', { class: 'msg-time', 'data-at': item.at || undefined, text: timeText(item.at) }));
    }
    row.append(iconButton(doc, 'i-copy', t('msg.copy'), () => handlers.onCopy(item.text)),
      iconButton(doc, 'i-undo', t('msg.restore'), () => putInField(item.text)));
    if (queued) {
      row.append(iconButton(doc, 'i-x', t('msg.unqueue'), () => {
        const back = handlers.onUnqueueAt(currentTrace, item.index);
        if (back) putInField(back.text, back.images ?? []);
      }));
      const now2 = h(doc, 'button', { type: 'button', class: 'msg-now', text: t('msg.send_now') });
      now2.addEventListener('click', () => handlers.onSendNow(currentTrace, item.index));
      row.append(now2);
    }
    return row;
  }

  function makeEntry(item) {
    const cls = { diffs: 'item card diffs', work: 'item item-work' }[item.type] ?? `item item-${item.type}`;
    return { node: h(doc, 'div', { class: cls, 'data-key': item.key, 'data-turn': item.turn || undefined }), sig: null, item };
  }

  // Напоминание при открытии сессии: в задаче есть не влитые коммиты (один раз за сессию страницы).
  const reminded = new Set();
  function remindUnmerged(session) {
    const task = session.routeState && session.routeState.task;
    const label = mergeLabel(task);
    if (!label || label.kind !== 'unmerged' || reminded.has(session.id)) return;
    reminded.add(session.id);
    if (handlers.onNotice) handlers.onNotice(t('route.remind_unmerged', { number: numberOf(task), commits: commitsText(task.unmergedCommits) }));
  }

  function renderChat(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    pick.hidden = Boolean(session);
    chat.hidden = !session;
    titleBlock.hidden = !session;
    if (!session) { browseTicket += 1; currentTrace = null; closeMenu(); return; }
    chat.dataset.draft = String(Boolean(session.draft));
    const awaitingHistory = Boolean(ui.historyPending?.has(session.id));
    chat.dataset.historyPending = String(awaitingHistory);
    const preview = ui.historyPreview?.has(session.id);
    chat.dataset.historyPreview = String(Boolean(preview));
    historyLoading.textContent = preview ? t('loading.history_connect') : t('loading.history');
    historyLoading.hidden = !awaitingHistory;

    if (currentTrace !== session.id) {
      browseTicket += 1;
      if (currentTrace) {
        drafts.set(currentTrace, input.value);
        attachDrafts.set(currentTrace, attach.take());
      }
      currentTrace = session.id;
      setHot('');
      followTail = true;
      unseen = false;
      historyState = NO_HISTORY;
      nodes.clear();
      thread.replaceChildren();
      input.value = drafts.get(session.id) ?? '';
      attach.restore(attachDrafts.get(session.id));
      fitInput();
      finishRename(false);
      closeMenu();
      remindUnmerged(session);
    }
    title.hidden = Boolean(session.draft);
    headMenu.hidden = Boolean(session.draft);
    headCtx = session.draft ? null : { session, pinned: effectivePins(sessionList(model).filter((x) => !x.draft), ui.pins).has(session.id), unread: Boolean(ui.unread && ui.unread[session.id] === true) };
    syncHeadMenu();
    if (!renaming) titleText.textContent = session.name;
    const parentSession = session.parent ? model.sessions[session.parent] : undefined;
    crumb.hidden = !parentSession;
    crumbSep.hidden = !parentSession;
    crumb.textContent = parentSession ? parentSession.name : '';
    crumb.dataset.parent = parentSession ? parentSession.id : '';
    crumb.title = parentSession ? t('chat.parent_crumb', { name: parentSession.name }) : '';
    const taskInfo = sessionTask(session);
    taskNo.hidden = !taskInfo;
    taskNo.textContent = taskInfo ? taskInfo.number : '';
    taskNo.title = taskInfo ? (taskInfo.title ? t('route.task_no_title', { number: taskInfo.number, title: taskInfo.title }) : t('route.task_head_bare', { number: taskInfo.number })) : '';
    // Что показать про семью, модель, режим и усилие: данные показанной семьи (собственная сводка сессии, иначе каталог семьи)
    const shown = shownOf(model, session);
    const busy = isBusy(session.state);
    const handoff = ui.handoffStatus?.get(session.id);
    handoffHint.hidden = handoff?.phase !== 'preparing' && handoff?.phase !== 'error';
    handoffHint.dataset.phase = handoff?.phase || '';
    const handoffText = handoff?.phase === 'error' ? handoff.message
      : handoff?.compacting ? t('handoff.compacting')
      : handoff?.phase === 'preparing' ? t('handoff.preparing', { agent: agentLabel(handoff.source.family) }) : '';
    if (handoffHint.textContent !== handoffText) handoffHint.textContent = handoffText;
    const queued = handlers.queued(session.id);
    queueButton.hidden = queued === 0;
    if (queued > 0) queueButton.textContent = t('composer.queued', { n: queued });
    cancelButton.hidden = !busy;
    syncSend(busy);
    options = shown.options;
    currentAgent = shown.agent;
    currentSession = session;
    currentRoute = session.route || INTERACTIVE_STATE.route;
    routeButton.hidden = false;
    routeButton.dataset.route = currentRoute;
    routeButton.replaceChildren(h(doc, 'span', { text: routeName(currentRoute) }));
    // проект и Worktree: у черновика — выбор; у открытой сессии без дерева — переключатель на следующую задачу
    const task = session.routeState && session.routeState.task;
    const hasTree = Boolean((task && task.worktree) || (session.routeState && session.routeState.where && session.routeState.where.kind === 'wip'));
    const resultRepo = session.routeState ? session.routeState.resultRepo : '';
    const resultLabel = session.routeState ? session.routeState.resultLabel : '';
    resultRepoButton.disabled = Boolean(task) || hasTree || busy || Boolean(session.routeState && session.routeState.where && session.routeState.where.kind === 'preparing');
    resultRepoButton.hidden = Boolean(session.draft) || currentRoute === 'planning' || !session.projectId
      || (resultRepoButton.disabled && !resultRepo);
    fillResultRepos(resultRepo || '', resultLabel);
    const treeOn = session.draft ? session.worktree !== false : (session.routeState ? session.routeState.useTree !== false : true);
    worktreeButton.hidden = currentRoute === 'planning' || !session.projectId;
    worktreeButton.dataset.draft = String(Boolean(session.draft));
    worktreeButton.setAttribute('aria-pressed', String(treeOn || hasTree));
    // задача 192.6: папка проекта не git-репозиторий — дерево сделать нельзя, переключатель выключен и недоступен
    const draftFolder0 = draftFolderInfo(session);
    const noRepo = !session.projectId || !session.folder || (Boolean(draftFolder0) && draftFolder0.repo === false);
    worktreeButton.setAttribute('aria-pressed', String((treeOn && !noRepo) || hasTree));
    const preparingTree = Boolean(session.routeState && session.routeState.where && session.routeState.where.kind === 'preparing');
    worktreeButton.disabled = hasTree || preparingTree || Boolean(task && task.id !== 'draft') || busy || noRepo;
    const sourceBranch = session.draft ? session.sourceBranch : (session.routeState && session.routeState.sourceBranch);
    const noProject = !session.projectId;
    const location = session.routeState?.where;
    const folder = task?.worktree || location?.worktree || session.folder;
    const folderName = folder?.split(/[\\/]/).filter(Boolean).pop() || session.project || 'Папка проекта';
    const branch = (task?.branch || location?.branch || session.branch || sourceBranch || '').replace(/^refs\/(heads|remotes)\//, '');
    const workspaceText = noProject ? t('where.projectless_workspace') : [(hasTree || treeOn) && !noRepo ? 'Работа в отдельной папке' : 'Работа в папке проекта', session.project || folderName, branch].filter(Boolean).join(' · ');
    worktreeButton.replaceChildren(icon(doc, 'i-folder'), h(doc, 'span', { text: workspaceText }));
    const workspaceHint = noRepo ? t('route.worktree_not_repo') : hasTree || preparingTree
      ? t('route.worktree_locked') : session.draft && !treeOn ? t('where.draft_off') : whereText(session);
    worktreeButton.title = [folder, branch, workspaceHint].filter(Boolean).join(' · ') || workspaceText;
    if (resultRepo) resultRepoButton.title = `Учёт: ${session.folder || session.project} → результат: ${resultLabel || resultRepo}`;
    worktreeButton.setAttribute('aria-label', workspaceText);
    worktreeButton.setAttribute('aria-haspopup', 'dialog');
    routeButton.title = `${t('route.label')}: ${routeDescription(currentRoute)}`;
    // набор: показываем, когда сервер отдал больше одного
    const presetInfo = presets();
    const presetList = presetInfo && Array.isArray(presetInfo.presets) ? presetInfo.presets : [];
    presetSelect.hidden = presetList.length < 2;
    if (presetList.length >= 2) {
      const chosen = session.preset || (presetInfo.active || 'default');
      const sig = `${presetList.map((p) => p.name).join('|')}`;
      if (presetSelect.dataset.sig !== sig) {
        presetSelect.replaceChildren(...presetList.map((p) => h(doc, 'option', { value: p.name, text: p.name === 'default' ? t('preset.default_name') : p.name, title: p.description || '' })));
        presetSelect.dataset.sig = sig;
      }
      presetSelect.value = chosen;
      presetSelect.dataset.draft = String(Boolean(session.draft));
    }
    whereNote.hidden = !worktreeButton.hidden;
    whereNote.textContent = whereNote.hidden ? '' : whereText(session);
    whereNote.title = whereNote.textContent;
    // Задача 265: текущий агент виден при любом числе доступных. Выбора нет (0/1 агент) — чип приглушён,
    // а подсказка называет фактическую причину, а не прячет чип.
    // session_source confirms the current pin. agent_selected may describe an earlier turn.
    pickerSource = handoff?.source || session.source;
    const directSource = pickerSource && !pickerSource.pool ? pickerSource : undefined;
    const selectedModel = directSource?.model || session.selectedModel || options.modelId || shown.model;
    const selectedEffort = directSource ? directSource.effort : session.selectedEffort || options.effort;
    const selectedFamily = directSource?.family || shown.agent;
    activeEffortModel = pickerSource?.pool || (!directSource && session.selectedPool) ? undefined
      : pickerModelsFor(selectedFamily, directModelsFor(selectedFamily))
        .find((m) => m.id === selectedModel || m.aliases?.includes(selectedModel));
    const legacyEffort = activeEffortModel?.aliases?.includes(selectedModel)
      ? codexModelVariant(selectedModel)?.[2] : '';
    activeEffort = legacyEffort || selectedEffort;
    const hasEfforts = Boolean(activeEffortModel?.efforts.length > 1);
    const preparingSource = handoff?.phase === 'preparing';
    canChooseEffort = hasEfforts && !preparingSource && !session.selectionPending;
    const selectedPool = directSource ? '' : session.selectedPool ? `${session.selectedPool} · ${session.selectedLevel}` : session.source && session.source.pool ? `${session.source.pool} · ${session.source.level}` : '';
    const modelName = modelLabel(selectedFamily, activeEffortModel?.name || selectedModel);
    const pickerLabel = session.selectionPending && !handoff?.source ? 'Подтверждение…' : [modelName || (shown.loading ? t('session.loading') : t('session.model_unknown')), selectedPool].filter(Boolean).join(' / ');
    familyButton.hidden = false;
    familyButton.replaceChildren(h(doc, 'span', { text: pickerLabel || 'Выбрать агента' }));
    const presetData = presets() || {};
    const activePreset = (presetData.presets || []).find((p) => p.name === (session.preset || presetData.active || 'default'));
    const availablePools = activePreset && activePreset.pools && Object.values(activePreset.pools).some((levels) => Object.values(levels || {}).some((entries) => Array.isArray(entries) && entries.some((e) => e.active !== false)));
    const hasConfiguredFamilies = agents.length > 0;
    const canChoose = Boolean(hasConfiguredFamilies || availablePools);
    familyButton.setAttribute('aria-disabled', String(preparingSource));
    familyButton.dataset.noChoices = String(!canChoose);
    familyButton.title = preparingSource ? handoffHint.textContent : busy && canChoose ? t('handoff.choose_next') : canChoose ? t('menu.agent') : registryPending ? t('status.agents_loading') : t(registryFailed ? 'sessions.agents_unavailable' : (agents.length === 1 ? 'status.agent_one' : 'sessions.agents_none'));
    familyButton.setAttribute('aria-label', `Агент: ${pickerLabel || 'не выбран'}`);
    const hasModels = Boolean(options && options.models.length > 0);
    // Причина отсутствия вариантов — по факту: грузятся; у черновика без записи каталога появятся после запуска; агент не предоставляет.
    const catalogEntry = model.catalog ? model.catalog[shown.agent] : undefined;
    const paramWhy = (unsupported) => (shown.loading ? t('status.options_loading')
      : !catalogEntry && session.draft ? t('status.options_after_start') : unsupported);
    modeButton.hidden = false;
    modeButton.textContent = approvalView(model, session, agents, pickerSource).label;
    modelButton.hidden = true;
    effortButton.hidden = !hasEfforts;
    effortButton.setAttribute('aria-disabled', String(!canChooseEffort));
    const effortLabel = labelFor('effort', activeEffortModel?.efforts || [], activeEffort);
    effortButton.title = !hasEfforts ? paramWhy(t('status.effort_unsupported'))
      : canChooseEffort ? effortLabel.title || t('menu.effort') : familyButton.title;
    effortButton.replaceChildren(h(doc, 'span', { text: effortLabel.name || t('menu.effort') }));
    statusModel.hidden = true;
    statusModel.textContent = shown.model || (shown.loading ? t('session.loading') : t('session.model_unknown'));
    statusModel.title = hasModels ? '' : paramWhy(t('status.model_unsupported'));
    status.dataset.empty = String(worktreeButton.hidden && !whereNote.textContent && resultRepoButton.hidden && presetSelect.hidden);
    boxBar.dataset.empty = 'false';
    if (menuKind === 'agent') renderMenu();
    else if (menuKind === 'effort') {
      const sig = effortMenuSignature();
      if (sig !== menuSig) renderMenu();
      else syncEffortMenu?.();
      menuSig = sig;
    }
    else if (menuKind === 'route') {
      if (menuSig !== currentRoute) renderMenu();
      menuSig = currentRoute;
    } else if (menuKind === 'result') {
      if (resultRepoButton.disabled || resultRepoButton.hidden) closeMenu();
      else {
        const sig = JSON.stringify([resultRepoShown, resultRepoRecords]);
        if (sig !== menuSig) renderMenu();
        menuSig = sig;
      }
    } else if (menuKind === 'mode') {
      const sig = JSON.stringify([session.approvals, options, model.catalog, busy]);
      if (sig !== menuSig) renderMenu();
      menuSig = sig;
    } else if ((menuKind === 'model' || menuKind === 'more') && !hasModels) closeMenu();
    else if (menuKind) {
      const sig = JSON.stringify(options);
      if (sig !== menuSig) renderMenu();
      menuSig = sig;
    }

    renderRouteStrip(session);
    renderRouteBanner(session);
    renderTaskCards(session);
    canopusUi.render(session);

    const checking = ui.loading?.sessions.phase === 'loading';
    const items = timeline(session).map(item => checking && item.type === 'note' && ['error', 'refused'].includes(item.tone)
      ? { ...item, checking } : item);
    const localDelivery = handlers.deliveryItems?.(session.id) || [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (localDelivery.some(r => r.errorId && items[i].key === `err:${r.errorId}`)) items.splice(i, 1);
    }
    for (const saved of localDelivery) {
      if (saved.state === 'error' && model.seen[saved.id]) continue;
      if (saved.state === 'error' && saved.turn && session.messages.some(m => m.role === 'agent' && m.turn === saved.turn && m.status === 'done' && m.doneAt >= saved.at)) continue;
      if (saved.state !== 'error' && session.messages.some(m => m.role === 'user' && m.turn === (saved.turn || saved.clientTurn))) continue;
      const user = saved.state === 'error' && saved.turn ? session.messages.find(m => m.role === 'user' && m.turn === saved.turn) : null;
      const card = { ...saved, checking: checking && saved.restored, ...(user ? { state: 'agent_error', text: user.text, hasUserMessage: true, partialAnswer: session.messages.some(m => m.role === 'agent' && m.turn === saved.turn && m.text.trim().length > 0) } : {}), retryAllowed: !session.draft && !isBusy(session.state), type: 'delivery', key: `delivery:${saved.id}` };
      const userIndex = user ? items.findIndex(item => item.type === 'user' && item.turn === saved.turn) : -1;
      if (userIndex >= 0) items.splice(userIndex + 1, 0, card);
      else if (saved.restored && saved.state === 'error') items.unshift(card);
      else {
        const next = items.findIndex(item => (item.type === 'user' && item.at > saved.at)
          || item.type === 'running' || item.type === 'needs');
        items.splice(next < 0 ? items.length : next, 0, card);
      }
    }
    // сообщения в очереди — под текущим ходом, в порядке постановки
    handlers.queuedItems(session.id).forEach((q, index) => {
      items.push({ type: 'queued', key: `queued:${index}:${q.text.length}:${q.text.slice(0, 24)}`, text: q.text, images: q.images ?? [], index });
    });
    if (items.length === 0) {
      if (session.draft) {
        syncProjectPicker(session);
        if (!projectPicker.parentNode) thread.replaceChildren(projectPicker);
      } else if (!emptyChat.parentNode) thread.replaceChildren(emptyChat);
    } else {
      if (emptyChat.parentNode) emptyChat.remove();
      if (projectPicker.parentNode) projectPicker.remove();
    }
    let changed = false;
    const alive = new Set();
    items.forEach((item, i) => {
      let entry = nodes.get(item.key);
      if (!entry) { entry = makeEntry(item); nodes.set(item.key, entry); }
      alive.add(item.key);
      entry.item = item;
      const sig = JSON.stringify(item);
      if (sig !== entry.sig) { entry.sig = sig; fillItem(entry, item); changed = true; }
      if (thread.children[i] !== entry.node) thread.insertBefore(entry.node, thread.children[i] ?? null);
    });
    for (const [key, entry] of nodes) if (!alive.has(key)) { entry.node.remove(); nodes.delete(key); }
    if (!followTail && changed) unseen = true;
  }

  // ---------------------------------------------------------------- правая колонка

  function card(titleText, ...children) {
    return h(doc, 'section', { class: 'card' }, h(doc, 'h3', { class: 'card-title', text: titleText }), ...children);
  }

  function fileRow(path, iconId) {
    const fp = fileParts(path);
    return h(doc, 'li', { class: 'file-row', title: path },
      icon(doc, iconId),
      h(doc, 'span', { class: 'file-name', text: fp.name }),
      h(doc, 'span', { class: 'file-dir', text: fp.dir }));
  }

  function foldButton(key, total, fold) {
    if (total <= fold) return false;
    const showAll = open.has(key);
    const button = h(doc, 'button', { type: 'button', class: 'link-btn', text: showAll ? t('rail.show_less') : t('rail.show_more', { n: total - fold }) });
    button.addEventListener('click', () => {
      if (showAll) open.delete(key); else open.add(key);
      railSig = '';
      renderRail(current.session);
    });
    return button;
  }

  function envCard(s) {
    const row = (iconId, labelKey, value) => h(doc, 'div', { class: 'env-row' },
      icon(doc, iconId),
      h(doc, 'dt', { text: t(labelKey) }),
      h(doc, 'dd', { text: value || t('rail.none'), class: value ? '' : 'muted' }));
    return card(t('rail.env'), h(doc, 'dl', { class: 'env' },
      row('i-folder', 'rail.project', s.project),
      row('i-folder', 'rail.folder', s.folder),
      row('i-branch', 'rail.branch', s.branch),
      row('i-terminal', 'rail.agent', agentLabel(s.agent))));
  }

  function meterNode(pct) {
    const meter = h(doc, 'span', { class: 'meter', 'data-level': usageLevel(pct), 'aria-hidden': 'true' }, h(doc, 'span', { class: 'meter-fill' }));
    meter.style.setProperty('--fill', `${pct}%`);
    return meter;
  }

  function contextCard(s) {
    const closed = open.has('ctx-closed');
    const pct = usagePercent(s.usage);
    const head = h(doc, 'button', { type: 'button', class: 'card-head', 'aria-expanded': String(!closed) },
      icon(doc, 'i-chevron-down', 'chev'),
      h(doc, 'span', { class: 'card-title', text: t('rail.context') }),
      h(doc, 'span', { class: 'grow' }),
      s.usage ? h(doc, 'span', { class: 'pct', 'data-level': usageLevel(pct), text: `${pct} %` }) : false,
      s.usage ? meterNode(pct) : false);
    const lines = [];
    if (s.usage) {
      lines.push(h(doc, 'p', { text: t('rail.ctx_detail', { used: tokensText(s.usage.used), size: tokensText(s.usage.size) }) }));
      if (s.usage.cost) {
        const cost = `${s.usage.cost.amount.toFixed(2)} ${s.usage.cost.currency}`.trim();
        lines.push(h(doc, 'p', { text: t('rail.ctx_cost', { cost }) }));
      }
    } else {
      lines.push(h(doc, 'p', { class: 'muted', text: t('rail.ctx_unknown') }));
    }
    const body = h(doc, 'div', { class: 'card-body', hidden: closed }, ...lines);
    head.addEventListener('click', () => {
      toggleOpen('ctx-closed', head, null);
      const nowClosed = open.has('ctx-closed');
      head.setAttribute('aria-expanded', String(!nowClosed));
      body.hidden = nowClosed;
    });
    return h(doc, 'section', { class: 'card card-context' }, head, body);
  }

  function outputsCard(s) {
    const key = 'more:outputs';
    const rows = open.has(key) ? s.outputs : s.outputs.slice(0, FOLD_OUTPUTS);
    return card(t('rail.outputs'),
      s.outputs.length === 0
        ? h(doc, 'p', { class: 'muted', text: t('rail.outputs_empty') })
        : h(doc, 'ul', { class: 'file-list' }, ...rows.map((o) => fileRow(o.path, FILE_ICON[o.kind]))),
      foldButton(key, s.outputs.length, FOLD_OUTPUTS));
  }

  function tasksCard(s) {
    const key = 'more:tasks';
    const sum = taskSummary(s.tasks);
    const ordered = [...s.tasks].sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1));
    const rows = open.has(key) ? ordered : ordered.slice(0, FOLD_TASKS);
    const list = h(doc, 'ul', { class: 'task-list' }, ...rows.map((x) => h(doc, 'li', { class: 'task-row', 'data-state': x.status, title: x.title },
      icon(doc, TASK_ICON[x.status]),
      h(doc, 'span', { class: 'task-title', text: x.title }),
      x.finishedAt === null
        ? h(doc, 'span', { class: 'task-time', 'data-since': x.started, text: durationText(now() - x.started) })
        : h(doc, 'span', { class: 'task-time', text: durationText(x.finishedAt - x.started) }))));
    return card(t('rail.tasks'),
      s.tasks.length === 0 ? h(doc, 'p', { class: 'muted', text: t('rail.tasks_empty') }) : list,
      foldButton(key, s.tasks.length, FOLD_TASKS),
      sum.finished > 0 ? h(doc, 'p', { class: 'finished', text: t('rail.tasks_finished', { n: sum.finished }) }) : false);
  }

  // Задача режима (задача 192p): заголовок с номером и веткой, подзадачи с прогрессом done/total; клик раскрывает чекбоксы (только чтение),
  // меню «⋯» отдаёт серверу сигналы по подзадаче.
  let subMenu = null; // ключ подзадачи с открытым меню «⋯»
  const subKey = (task, sub) => `sub:${task.id}:${sub.n}`;
  function subtaskMenu(sessionId, sub) {
    const acts = subtaskActions(sub);
    const row = (text, run) => {
      const b = h(doc, 'button', { type: 'button', class: 'menu-item', role: 'menuitem' }, h(doc, 'span', { class: 'menu-label', text }));
      b.addEventListener('click', () => { subMenu = null; run(); railSig = ''; renderRail(current.session); });
      return b;
    };
    return h(doc, 'div', { class: 'rsub-menu', role: 'menu' },
      acts.same ? row(t('route.sub_act_same'), () => handlers.onRouteSubtaskSame(sessionId)) : false,
      acts.fresh ? row(t('route.sub_act_new'), () => handlers.onRouteSubtaskNew(sessionId)) : false,
      acts.worktree ? row(t('route.sub_act_worktree'), () => handlers.onRouteSubtaskWorktree(sessionId, sub.n)) : false,
      acts.done ? row(t('route.sub_act_done'), () => handlers.onRouteSubtaskDone(sessionId, sub.n)) : false);
  }
  function subtaskRow(s, task, sub) {
    const key = subKey(task, sub);
    const isOpen = open.has(key);
    const pct = subtaskPercent(sub);
    const meter = h(doc, 'span', { class: 'meter route-meter', 'data-level': sub.state === 'done' ? 'done' : 'part', 'aria-hidden': 'true' }, h(doc, 'span', { class: 'meter-fill' }));
    meter.style.setProperty('--fill', `${pct}%`);
    const toggle = h(doc, 'button', { type: 'button', class: 'rsub-head', 'aria-expanded': String(isOpen), title: t(SUBTASK_STATE_KEY[sub.state]) },
      icon(doc, 'i-chevron-right', 'chev'),
      h(doc, 'span', { class: 'rsub-title', text: t('route.sub_title', { n: sub.n, title: sub.title }) }),
      sub.merged ? h(doc, 'span', { class: 'rsub-merged', text: t('route.sub_merged') }) : false,
      sub.merging ? h(doc, 'span', { class: 'rsub-merging', text: t('route.sub_merging') }) : false,
      h(doc, 'span', { class: 'rsub-count', text: subWaitsText(sub) || subtaskProgressText(sub) }));
    const items = sub.items.length === 0
      ? [h(doc, 'li', { class: 'rsub-item muted', text: t('route.sub_items_empty') })]
      : sub.items.map((x) => h(doc, 'li', { class: 'rsub-item', 'data-done': String(x.done) },
        h(doc, 'span', { class: 'rsub-box', 'aria-hidden': 'true' }, x.done ? icon(doc, 'i-check') : false),
        h(doc, 'span', { text: x.text })));
    const body = h(doc, 'ul', { class: 'rsub-items', hidden: !isOpen }, ...items);
    toggle.addEventListener('click', () => {
      const next = !open.has(key);
      if (next) open.add(key); else open.delete(key);
      toggle.setAttribute('aria-expanded', String(next));
      body.hidden = !next;
      railSig = '';
    });
    const more = hasSubtaskActions(sub)
      ? h(doc, 'button', { type: 'button', class: 'rsub-more', text: '⋯', title: t('route.sub_more'), 'aria-label': t('route.sub_more'), 'aria-haspopup': 'menu', 'aria-expanded': String(subMenu === key) })
      : false;
    if (more) {
      more.addEventListener('click', () => { subMenu = subMenu === key ? null : key; railSig = ''; renderRail(current.session); });
    }
    const where = [sub.branch ? t('route.sub_branch', { branch: sub.branch }) : '', sub.worktree ? t('route.sub_tree', { worktree: sub.worktree }) : ''].filter(Boolean).join(' · ');
    return h(doc, 'li', { class: 'rsub', 'data-state': sub.state, 'data-merged': String(sub.merged) },
      h(doc, 'div', { class: 'rsub-row' }, toggle, more),
      where || sub.worktree ? h(doc, 'div', { class: 'rsub-where' }, sub.worktree ? h(doc, 'span', { class: 'rsub-own', text: t('route.sub_own_tree') }) : false, where) : false,
      sub.needsOwner ? h(doc, 'div', { class: 'rsub-owner', role: 'alert', text: sub.ownerText || t('route.sub_owner') }) : false,
      meter, body,
      more && subMenu === key ? subtaskMenu(s.id, sub) : false);
  }

  function panelTestsButton(s) {
    const b = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('route.tests_run') });
    b.addEventListener('click', () => handlers.onRouteTestsRun(s.id));
    return b;
  }

  function subtasksCard(s) {
    const task = s.routeState && s.routeState.task;
    if (!task) return false;
    const withSubs = showSubtasks(s.routeState);
    const list = h(doc, 'ul', { class: 'rsub-list' }, ...task.subtasks.map((sub) => subtaskRow(s, task, sub)));
    const newTask = h(doc, 'button', { type: 'button', class: 'link-btn', text: t('route.new_task') });
    newTask.addEventListener('click', () => handlers.onRouteNewTask(s.id));
    const label = mergeLabel(task);
    return card(taskHeading(task),
      label ? h(doc, 'p', { class: 'rsub-label', 'data-kind': label.kind, text: label.text }) : false,
      task.branch ? h(doc, 'p', { class: 'rsub-task', text: t('route.task_branch', { branch: task.branch }) }) : false,
      task.worktree ? h(doc, 'p', { class: 'rsub-task', text: t('route.task_tree', { worktree: task.worktree }) }) : false,
      task.worktree ? h(doc, 'p', { class: 'rsub-tests', 'data-state': task.tests.branch.state, text: branchTestsText(task.tests.branch, now()) }) : false,
      task.worktree ? h(doc, 'p', { class: 'rsub-tests', 'data-state': task.tests.main.state, text: mainTestsText(task.tests.main, now()) }) : false,
      task.worktree && testsRunnable(task) ? panelTestsButton(s) : false,
      task.worktree && task.testsRunning ? h(doc, 'p', { class: 'rsub-tests muted', text: t('route.tests_running') }) : false,
      task.stale ? h(doc, 'p', { class: 'rsub-label', 'data-kind': 'unmerged', text: t('route.stale_title', { days: task.idleDays }) }) : false,
      withSubs && task.subtasks.length === 0 ? h(doc, 'p', { class: 'muted', text: t('route.sub_none') }) : false,
      withSubs && task.subtasks.length > 0 ? list : false,
      newTask);
  }

  // Вкладки правой колонки (задача 192.1): «Сведения» и «Машины» в той же колонке; выбор помнится в localStorage (без него — «Сведения»).
  const RAIL_TAB_KEY = 'canopus-rail-tab';
  let railTab = 'info';
  try { if (win && win.localStorage) { const saved = win.localStorage.getItem(RAIL_TAB_KEY); if (saved === 'machines' || saved === 'request') railTab = saved; } } catch (e) { railTab = 'info'; }
  const machinesPanel = createMachinesPanel(doc, {
    now,
    durationText,
    onCopy: (text) => handlers.onCopy(text),
    onGet: (id) => { if (handlers.onMachineGet) handlers.onMachineGet(id); },
    rerender: () => { railSig = ''; renderRail(current.session); },
  });
  const requestPanel = createRequestPanel(doc, {
    onCopy: (text) => handlers.onCopy(text),
    onGet: (id, turn) => { if (handlers.onRequestGet) handlers.onRequestGet(id, turn); },
    fetchTrace: (id, from, to) => win.fetch(`/api/session-trace/${encodeURIComponent(id)}?from=${from}&to=${to}`, { cache: 'no-store' }).then((r) => r.json()),
    rerender: () => { railSig = ''; renderRail(current.session); },
  });
  const railTabInfo = h(doc, 'button', { type: 'button', class: 'rail-tab', role: 'tab', 'data-tab': 'info', text: t('rail.tab_info') });
  const railTabMachines = h(doc, 'button', { type: 'button', class: 'rail-tab', role: 'tab', 'data-tab': 'machines', text: t('rail.tab_machines') });
  const railTabRequest = h(doc, 'button', { type: 'button', class: 'rail-tab', role: 'tab', 'data-tab': 'request', text: t('rail.tab_request') });
  const railTabs = h(doc, 'div', { class: 'rail-tabs', role: 'tablist', 'aria-label': t('rail.tabs') }, railTabInfo, railTabMachines, railTabRequest);
  function pickRailTab(tab) {
    if (railTab === tab) return;
    if (menuKind === 'mode') closeMenu();
    railTab = tab;
    try { if (win && win.localStorage) win.localStorage.setItem(RAIL_TAB_KEY, tab); } catch (e) { /* выбор вкладки не сохранится */ }
    if (tab === 'machines' && current.session && handlers.onMachineGet) handlers.onMachineGet(current.session.id);
    if (tab === 'request' && current.session && current.session.requests.length === 0 && handlers.onRequestGet) handlers.onRequestGet(current.session.id, 0);
    railSig = '';
    renderRail(current.session);
  }
  railTabInfo.addEventListener('click', () => pickRailTab('info'));
  railTabMachines.addEventListener('click', () => pickRailTab('machines'));
  railTabRequest.addEventListener('click', () => pickRailTab('request'));

  let railSig = '';
  function renderRail(raw) {
    // при смене семьи правая панель называет уже новую (задача 192o)
    const session = raw ? { ...raw, agent: familyOf(raw) } : raw;
    if (!session) {
      if (railSig !== 'none') { railSig = 'none'; refs.rail.replaceChildren(h(doc, 'p', { class: 'rail-pick', text: t('rail.pick') })); }
      return;
    }
    const queued = handlers.queuedItems ? handlers.queuedItems(session.id) : [];
    const sig = JSON.stringify([railTab, railTab === 'machines' ? machinesPanel.signature(session, queued) : '', railTab === 'request' ? requestPanel.signature(session) : '', session.id, session.project, session.folder, session.branch, session.agent, session.usage, session.outputs,
      session.tasks.map((x) => [x.id, x.title, x.status, x.started, x.finishedAt]), session.routeState && session.routeState.task, session.routeState && session.routeState.canopus,
      [...open].filter((k) => k.startsWith('more:') || k.startsWith('sub:') || k === 'ctx-closed'), subMenu]);
    if (sig === railSig) return;
    railSig = sig;
    for (const b of [railTabInfo, railTabMachines, railTabRequest]) {
      const on = b.dataset.tab === railTab;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('on', on);
    }
    const cards = railTab === 'machines'
      ? machinesPanel.render(session, queued)
      : railTab === 'request'
        ? requestPanel.render(session)
        : [envCard(session), canopusUi.panel(session), subtasksCard(session), contextCard(session), outputsCard(session), tasksCard(session)].filter(Boolean);
    refs.rail.replaceChildren(railTabs, ...cards);
  }

  // ---------------------------------------------------------------- диалог разрешения

  let shownRequest = null;
  function renderDialog(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    const pending = session ? session.pending : null;
    if (!pending) {
      if (shownRequest !== null) {
        shownRequest = null;
        const hadFocus = permissionWrap.contains(doc.activeElement);
        permissionWrap.hidden = true;
        permissionWrap.replaceChildren();
        if (hadFocus && !chat.hidden) input.focus();
      }
      return;
    }
    const requestKey = JSON.stringify([session.id, pending.turn, pending.request]);
    if (shownRequest === requestKey) return;
    shownRequest = requestKey;

    const allow = h(doc, 'button', { type: 'button', class: 'primary', text: t('perm.allow') });
    const deny = h(doc, 'button', { type: 'button', class: 'danger', text: t('perm.deny') });
    allow.addEventListener('click', () => handlers.onDecide(session.id, pending.request, 'allow'));
    deny.addEventListener('click', () => handlers.onDecide(session.id, pending.request, 'deny'));
    const dialog = h(doc, 'div', { class: 'dialog', role: 'group', 'aria-labelledby': 'perm-title' },
      h(doc, 'h3', { id: 'perm-title', text: t('perm.title') }),
      h(doc, 'dl', {},
        h(doc, 'dt', { text: t('perm.action') }),
        h(doc, 'dd', { text: pending.action }),
        pending.detail ? h(doc, 'dt', { text: t('perm.detail') }) : false,
        pending.detail ? h(doc, 'dd', { class: 'detail', text: pending.detail }) : false),
      h(doc, 'div', { class: 'actions' }, deny, allow));
    permissionWrap.replaceChildren(dialog);
    permissionWrap.hidden = false;
  }

  // ---------------------------------------------------------------- форма вопросов агента (задача 192)

  const askForms = new Map(); // `${сессия}:${запрос}` -> форма (question.js); переживает переключение сессий
  let askShown = null;
  let askUi = null; // { key, sync, focusFirst, nudge } построенной сейчас карточки

  askCard.addEventListener('keydown', (e) => { if (askUi) askUi.onKey(e); });
  function nudgeAsk() { if (askUi) askUi.nudge(); }

  function buildAsk(trace, pq, key) {
    const { questions } = pq;
    const get = () => askForms.get(key);
    const multi = questions.length > 1;
    let panels = [];
    let tabs = [];
    let badge = null;
    let badgeText = null;
    let skip = null;
    let send = null;

    function sync() {
      const f = get();
      panels.forEach((p, qi) => {
        const q = questions[qi];
        const a = f.answers[qi];
        p.node.hidden = qi !== f.active;
        p.inputs.forEach((inp, oi) => {
          const on = oi === otherIndex(q) ? a.other : a.picked.includes(oi);
          inp.checked = on;
          p.rows[oi].dataset.on = String(on);
        });
        p.text.hidden = !a.other;
        if (tabs[qi]) {
          tabs[qi].setAttribute('aria-selected', String(qi === f.active));
          tabs[qi].tabIndex = qi === f.active ? 0 : -1;
          tabs[qi].dataset.done = String(isAnswered(f, questions, qi));
        }
      });
      askCard.setAttribute('aria-labelledby', `ask-q-${f.active}`);
      send.disabled = !canSubmit(f, questions);
      skip.disabled = f.sent;
      badge.dataset.alert = 'false';
      badgeText.textContent = t('ask.need');
    }
    const put = (form) => { askForms.set(key, form); sync(); };

    const optionRow = (qi, oi, name, description, isOther) => {
      const q = questions[qi];
      const input = h(doc, 'input', {
        type: q.multiSelect ? 'checkbox' : 'radio', class: 'ask-input', name: `ask-${qi}`, 'data-oi': oi,
      });
      const text = h(doc, 'span', { class: 'ask-text' },
        h(doc, 'span', { class: 'ask-name', text: name }),
        description ? h(doc, 'span', { class: 'ask-desc', text: description }) : false);
      const row = h(doc, 'label', { class: isOther ? 'ask-opt ask-opt-other' : 'ask-opt' }, input, text, h(doc, 'span', { class: 'ask-key', 'aria-hidden': 'true', text: String(oi + 1) }));
      input.addEventListener('change', () => {
        put(selectOption(get(), questions, qi, oi));
        if (isOther && get().answers[qi].other) panels[qi].text.focus();
      });
      return { row, input };
    };

    panels = questions.map((q, qi) => {
      const rows = q.options.map((o, oi) => optionRow(qi, oi, o.label, o.description, false));
      const other = optionRow(qi, otherIndex(q), t('ask.other'), '', true);
      const text = h(doc, 'textarea', { class: 'ask-text-input', rows: 2, placeholder: t('ask.other_placeholder'), 'aria-label': t('ask.other_label'), hidden: true });
      text.value = get().answers[qi].text;
      text.addEventListener('input', () => put(setOtherText(get(), qi, text.value)));
      const heading = h(doc, 'h3', { class: 'ask-q', id: `ask-q-${qi}`, text: q.question }, q.multiSelect ? h(doc, 'span', { class: 'ask-multi', text: t('ask.multi') }) : false);
      const list = h(doc, 'div', { class: 'ask-options', role: q.multiSelect ? 'group' : 'radiogroup', 'aria-labelledby': `ask-q-${qi}` }, ...rows.map((r) => r.row), other.row, text);
      const node = h(doc, 'div', { class: 'ask-panel', id: `ask-panel-${qi}`, role: multi ? 'tabpanel' : false, hidden: true }, heading, list);
      return { node, inputs: [...rows, other].map((r) => r.input), rows: [...rows, other].map((r) => r.row), text };
    });

    tabs = multi ? questions.map((q, qi) => {
      const tab = h(doc, 'button', {
        type: 'button', class: 'ask-tab', role: 'tab', id: `ask-tab-${qi}`, 'aria-controls': `ask-panel-${qi}`,
      }, h(doc, 'span', { text: q.header || t('ask.tab_n', { n: qi + 1 }) }), icon(doc, 'i-check'));
      tab.addEventListener('click', () => { put(setActive(get(), questions, qi)); panels[qi].inputs[get().cursor[qi]].focus(); });
      return tab;
    }) : [];
    const tabRow = multi ? h(doc, 'div', { class: 'ask-tabs', role: 'tablist', 'aria-label': t('ask.tabs') }, ...tabs) : false;

    badgeText = h(doc, 'span', { class: 'ask-badge-text', text: t('ask.need') });
    badge = h(doc, 'span', { class: 'ask-badge' }, h(doc, 'span', { class: 'ask-dot', 'aria-hidden': 'true' }), badgeText);
    skip = h(doc, 'button', { type: 'button', class: 'ask-skip', title: t('ask.skip_title'), text: t('ask.skip') });
    send = h(doc, 'button', { type: 'button', class: 'ask-send', title: t('ask.send_title') }, h(doc, 'span', { text: t('ask.send') }), h(doc, 'kbd', { text: t('ask.send_hint') }));
    const foot = h(doc, 'div', { class: 'ask-foot' }, h(doc, 'span', { class: 'grow' }), skip, send);
    askCard.replaceChildren(...[tabRow, ...panels.map((p) => p.node), foot].filter(Boolean));
    askWrap.replaceChildren(askCard, h(doc, 'div', { class: 'ask-status' }, badge));

    const focusRow = (qi, oi, intoText) => {
      const p = panels[qi];
      if (intoText && get().answers[qi].other) p.text.focus();
      else p.inputs[oi].focus();
    };
    const deliver = (answer) => {
      put(markSent(get()));
      if (!handlers.onAnswer(trace, answer)) put(markSent(get(), false));
    };
    const doSkip = () => { if (!get().sent) deliver(buildSkip(pq.request)); };
    const doSend = () => {
      const f = get();
      const answer = buildAnswer(pq.request, f, questions);
      if (answer) { deliver(answer); return; }
      // не всё отвечено: Enter ведёт к первому вопросу без ответа
      const next = nextUnanswered(f, questions, f.active);
      if (next >= 0 && next !== f.active) { put(setActive(f, questions, next)); focusRow(next, get().cursor[next], false); }
    };
    skip.addEventListener('click', doSkip);
    send.addEventListener('click', doSend);

    const onKey = (e) => {
      if (e.isComposing) return;
      const f = get();
      const qi = f.active;
      const q = questions[qi];
      const target = e.target;
      const onText = target.tagName === 'TEXTAREA';
      const onButton = target.tagName === 'BUTTON';
      if (e.key === 'Escape') { e.preventDefault(); doSkip(); return; }
      if (e.key === 'Enter') {
        if (onText && e.shiftKey) return; // перенос строки в «Другом»
        if (onButton && !e.ctrlKey && !e.metaKey) return; // Enter на кнопке нажимает её
        e.preventDefault();
        doSend();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const digit = digitOption(e.key);
      if (digit >= 0 && !onText) {
        if (digit > otherIndex(q)) return;
        e.preventDefault();
        put(selectOption(f, questions, qi, digit));
        focusRow(qi, digit, digit === otherIndex(q));
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (onButton) return;
      if (onText && !(e.key === 'ArrowUp' && target.selectionStart === 0 && target.selectionEnd === 0)) return;
      e.preventDefault();
      const from = onText ? otherIndex(q) : Number(target.dataset.oi);
      const moved = moveCursor(setCursor(f, questions, qi, from), questions, qi, e.key === 'ArrowDown' ? 1 : -1);
      const oi = moved.cursor[qi];
      put(q.multiSelect ? moved : selectOption(moved, questions, qi, oi));
      focusRow(qi, oi, !q.multiSelect && oi === otherIndex(q));
    };

    askUi = {
      key,
      onKey,
      focusFirst() { const f = get(); focusRow(f.active, f.cursor[f.active], false); },
      nudge() {
        badge.dataset.alert = 'true';
        badgeText.textContent = t('ask.blocked');
        askUi.focusFirst();
      },
    };
    sync();
  }

  function renderAsk(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    const pq = session ? session.pendingQuestion : null;
    const key = pq ? `${session.id}:${pq.request}` : null;
    const open = new Set(Object.values(model.sessions).filter((s) => s.pendingQuestion).map((s) => `${s.id}:${s.pendingQuestion.request}`));
    for (const k of [...askForms.keys()]) if (!open.has(k)) askForms.delete(k);
    if (key === askShown) return; // состояние формы ведёт сама карточка; перерисовка не нужна
    const hadFocus = askCard.contains(doc.activeElement);
    askShown = key;
    if (!pq) {
      askUi = null;
      askWrap.hidden = true;
      askWrap.replaceChildren(askCard);
      askCard.hidden = true;
      askCard.replaceChildren();
      askCard.removeAttribute('aria-labelledby');
      if (hadFocus && !chat.hidden) {
        const slider = menuKind === 'effort' ? menu.querySelector('.effort-slider:not(:disabled)') : null;
        (slider || (menuKind === 'effort' ? effortButton : input)).focus();
      }
      return;
    }
    if (!askForms.has(key)) askForms.set(key, createForm(pq.questions));
    buildAsk(session.id, pq, key);
    askCard.hidden = false;
    askWrap.hidden = false;
    askUi.focusFirst();
  }

  // ---------------------------------------------------------------- строка статуса

  function statusText(status) {
    switch (status.state) {
      case 'loading': return t('loading.all');
      case 'refreshing': return t('loading.refreshing');
      case 'load_error': return t('loading.error');
      case 'connected': return t('conn.connected');
      case 'mock': return t('conn.mock');
      case 'retry': return t('conn.retry', { seconds: status.seconds });
      case 'nofile': return t('conn.nofile');
      default: return t('conn.connecting');
    }
  }

  let statusSig = '';
  function renderStatus(status, flash, tone, loading) {
    if (loading && status.state === 'connected') {
      const sources = Object.values(loading);
      if (sources.some((s) => s.phase === 'error')) status = { state: 'load_error' };
      else if (sources.some((s) => s.phase !== 'ready')) status = { state: sources.some((s) => s.refreshing) ? 'refreshing' : 'loading' };
    }
    const sig = JSON.stringify([status, flash, tone]);
    if (sig === statusSig) return;
    statusSig = sig;
    refs.status.dataset.state = status.state;
    refs.status.replaceChildren(
      h(doc, 'span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h(doc, 'span', { class: 'status-text', text: `${t('conn.label')}: ${statusText(status)}` }),
      ...(flash ? [h(doc, 'span', { class: 'status-flash', 'data-tone': tone, text: flash })] : []),
    );
  }

  // ---------------------------------------------------------------- тема и время

  let themeSig = '';
  function renderTheme(value) {
    const theme = normalizeTheme(value);
    if (theme === themeSig) return;
    themeSig = theme;
    const label = t(THEME_LABEL[theme]);
    themeButton.setAttribute('aria-label', label);
    themeButton.setAttribute('title', label);
    themeButton.replaceChildren(icon(doc, THEME_ICON[theme]));
  }

  /** Обновить «идёт 1 мин 36 с» и «5 мин назад», не трогая остальное: вызывается раз в секунду. */
  function tick() {
    for (const node of doc.querySelectorAll('[data-delivery-loading]')) {
      const at = now();
      if (!node.dataset.changedAt) node.dataset.changedAt = String(at);
      if (at - Number(node.dataset.changedAt) < 3000) continue;
      node.dataset.changedAt = String(at);
      node.textContent = deliveryLoadingWord(win?.navigator?.language, node.textContent);
      if (!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        node.animate?.([{ opacity: .45 }, { opacity: 1 }], { duration: 220 });
      }
    }
    for (const node of doc.querySelectorAll('[data-since]')) {
      const text = durationText(now() - Number(node.dataset.since));
      if (node.textContent !== text) node.textContent = text;
    }
    for (const node of doc.querySelectorAll('[data-until]')) {
      const text = t('route.overlap_timer', { seconds: Math.max(0, Math.ceil((Number(node.dataset.until) - now()) / 1000)) });
      if (node.textContent !== text) node.textContent = text;
    }
    for (const node of doc.querySelectorAll('.msg-time[data-at]')) {
      const text = timeText(Number(node.dataset.at));
      if (node.textContent !== text) node.textContent = text;
    }
    const silentMin = (current.ui && current.ui.silentMin) ?? SILENT_DEFAULT_MIN;
    for (const node of doc.querySelectorAll('.silent-note[data-last]')) {
      const last = Number(node.dataset.last);
      const minutes = silentMin > 0 && last > 0 ? Math.floor((now() - last) / 60000) : 0;
      const show = minutes >= silentMin && silentMin > 0;
      node.hidden = !show;
      const textNode = node.querySelector('.silent-text');
      if (show && textNode) { const text = t('attn.silent_line', { n: minutes }); if (textNode.textContent !== text) textNode.textContent = text; }
    }
    for (const node of doc.querySelectorAll('[data-ago]')) {
      const text = agoText(Number(node.dataset.ago));
      if (node.textContent !== text) node.textContent = text;
    }
  }

  doc.addEventListener('click', (e) => {
    if (subMenu === null) return;
    const path = e.composedPath();
    if (path.some((n) => n.classList && (n.classList.contains('rsub-menu') || n.classList.contains('rsub-more')))) return;
    subMenu = null;
    railSig = '';
    renderRail(current.session);
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || subMenu === null) return;
    subMenu = null;
    railSig = '';
    renderRail(current.session);
  });

  let formSig = '';
  return {
    tick,
    setAgents(next, failed) {
      registryPending = false;
      registryFailed = Boolean(failed);
      agents.splice(0, agents.length, ...next);
      agentNotice.textContent = t(failed ? 'sessions.agents_unavailable' : 'sessions.agents_none');
      agentNotice.hidden = agents.length > 0;
      retryAgents.hidden = !failed;
      menuSig = ''; draftSig = '';
    },
    /** Вернуть текст в поле ввода сессии (черновик не создался: сообщение не теряется). */
    putText(trace, text) {
      drafts.set(trace, text);
      if (currentTrace === trace) { input.value = text; fitInput(); }
    },
    /** ui: { selected, projects, pane, flash, theme, pins }; status: { state, seconds? } */
    render(model, ui, status) {
      const session = ui.selected ? model.sessions[ui.selected] : undefined;
      current = { model, ui, session };
      refs.app.dataset.pane = ui.pane;
      refs.app.dataset.rail = railOpen === null ? 'auto' : (railOpen ? 'open' : 'closed');
      const wide = Boolean(win && win.matchMedia && win.matchMedia(WIDE_QUERY).matches);
      railButton.setAttribute('aria-pressed', String(railOpen === null ? wide : railOpen));
      renderTheme(ui.theme);
      renderToggles(ui);
      renderList(model, ui);
      renderChat(model, ui);
      renderRail(session);
      renderDialog(model, ui);
      renderAsk(model, ui);
      renderStatus(status, ui.flash, ui.flashTone, ui.loading);
      tick();
      followLatest();
    },
  };
}
