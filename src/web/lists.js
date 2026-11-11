// lists.js — чистые функции вокруг модели вида: список сессий, лента разговора, подписи и числа.
// Ни DOM, ни часов (время приходит аргументом). state.js переэкспортирует всё отсюда, поэтому
// тесты и страница берут их из одного места; view.js только рисует результат.

// ---- список сессий: фильтр, закрепление, группы ------------------------------------------

const byRecency = (a, b) => (b.updatedAt - a.updatedAt) || (a.id < b.id ? -1 : 1);

const hasRank = (s) => Number.isFinite(s.rank);

/**
 * Порядок сессий внутри проекта (задача 192): место, которое владелец задал перетаскиванием (rank, меньше — выше), сильнее
 * сортировки по активности; сессии без места (новые) стоят над всеми, свежие выше.
 */
import { needsOwnerReason } from './attention.js';

export const byOrder = (a, b) => {
  if (hasRank(a) && hasRank(b)) return (a.rank - b.rank) || byRecency(a, b);
  if (hasRank(a) !== hasRank(b)) return hasRank(a) ? 1 : -1;
  return byRecency(a, b);
};

/**
 * Список id после перетаскивания: id переезжает перед targetId (after=false) или после него (after=true).
 * Неизвестный id или цель, совпадающая с переносимым, — список не меняется (копия).
 */
export function moveInOrder(ids, id, targetId, after) {
  const list = [...ids];
  if (id === targetId || !list.includes(id) || !list.includes(targetId)) return list;
  const rest = list.filter((x) => x !== id);
  const at = rest.indexOf(targetId);
  rest.splice(after ? at + 1 : at, 0, id);
  return rest;
}

/** Сессии, чьё название содержит запрос (без учёта регистра); пустой запрос — все. */
export function filterSessions(sessions, query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [...sessions];
  return sessions.filter((s) => String(s.name).toLowerCase().includes(q));
}

/** Все потомки сессии (дети, дети детей): им обязан сказать удаляющий родителя. Порядок — от ближних к дальним. */
export function descendantsOf(sessions, id) {
  const out = [];
  const seen = new Set([id]);
  let front = [id];
  while (front.length > 0) {
    const next = [];
    for (const s of sessions) {
      if (s.parent && front.includes(s.parent) && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
        next.push(s.id);
      }
    }
    front = next;
  }
  return out;
}

/** Множество закреплённых id: ручное решение (overrides[id]) важнее данных сессии. */
export function effectivePins(sessions, overrides = {}) {
  const out = new Set();
  for (const s of sessions) {
    const manual = overrides[s.id];
    if (typeof manual === 'boolean' ? manual : s.pinned === true) out.add(s.id);
  }
  return out;
}

/**
 * Дерево сессий группы: потомки под родителем, сирота и участник цикла — на верхнем уровне. У строки `kids` — сколько у неё прямых дочерних;
 * родитель из `collapsed` (множество id) свёрнут: его потомков в списке нет (`collapsed: true` у строки).
 */
function buildTree(list, collapsed = new Set()) {
  const present = new Set(list.map((s) => s.id));
  const kids = new Map();
  const roots = [];
  for (const s of [...list].sort(byOrder)) {
    if (s.parent && s.parent !== s.id && present.has(s.parent)) {
      if (!kids.has(s.parent)) kids.set(s.parent, []);
      kids.get(s.parent).push(s);
    } else {
      roots.push(s);
    }
  }
  const rows = [];
  const seen = new Set();
  // потомки свёрнутого родителя в списке не показываются и не всплывают на верхнем уровне
  const hide = (id) => {
    for (const k of kids.get(id) ?? []) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      hide(k.id);
    }
  };
  const walk = (s, depth) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    const mine = kids.get(s.id) ?? [];
    const folded = mine.length > 0 && collapsed.has(s.id);
    rows.push({ session: s, depth, kids: mine.length, collapsed: folded });
    if (!folded) for (const k of mine) walk(k, depth + 1);
    else hide(s.id);
  };
  for (const r of roots) walk(r, 0);
  for (const s of [...list].sort(byOrder)) walk(s, 0); // цикл родителей: ничего не теряем
  return rows;
}

/**
 * Группы для левой колонки: { pinned: [{session, depth:0}], projects: [{project, id, rows}] }.
 * Закреплённые вынесены, остальные собраны по проекту (свежие проекты выше).
 * Сессия с projectId — в группе этого проекта; если список проектов известен (projects — массив {id, name}), а такого
 * проекта в нём нет (удалён), сессия уходит в «Без проекта». Сессия только с именем project — в группе по имени (id пуст).
 * includeEmpty добавляет известные проекты без сессий (в конец, по имени): у них тоже есть кнопка «+».
 */
export function groupSessions(sessions, { pinned = new Set(), projects = null, includeEmpty = false, collapsed = new Set() } = {}) {
  const pinnedList = [];
  const known = projects ? new Map(projects.map((p) => [p.id, p])) : null;
  const byKey = new Map();
  const slot = (key, project, id) => {
    if (!byKey.has(key)) byKey.set(key, { project, id, list: [] });
    return byKey.get(key);
  };
  for (const s of sessions) {
    if (pinned.has(s.id)) { pinnedList.push(s); continue; }
    if (s.projectId && (!known || known.has(s.projectId))) {
      const real = known ? known.get(s.projectId) : undefined;
      slot(`id:${s.projectId}`, real ? real.name : (s.project || s.projectId), s.projectId).list.push(s);
    } else if (s.project && !s.projectId) {
      slot(`name:${s.project}`, s.project, '').list.push(s);
    } else {
      slot('', '', '').list.push(s);
    }
  }
  if (includeEmpty) slot('', '', ''); // «Без проекта» есть всегда: с «+» справа, даже пока в ней пусто
  if (includeEmpty && known) for (const p of known.values()) slot(`id:${p.id}`, p.name, p.id);
  // порядок проектов — тот, что владелец задал перетаскиванием и сервер хранит (порядок списка projects); остальные группы после них, свежие выше
  const place = new Map((projects ?? []).map((p, i) => [p.id, i]));
  const placed = (g) => (g.id !== '' && place.has(g.id) ? place.get(g.id) : Infinity);
  const groups = [...byKey.values()]
    .map((g) => ({ ...g, latest: g.list.length > 0 ? Math.max(...g.list.map((s) => s.updatedAt)) : -1 }))
    .sort((x, y) => {
      if (placed(x) !== placed(y)) return placed(x) < placed(y) ? -1 : 1;
      return (y.latest - x.latest) || (x.project < y.project ? -1 : (x.project > y.project ? 1 : 0));
    })
    .map(({ project, id, list }) => ({ project, id, rows: buildTree(list, collapsed) }));
  return {
    pinned: pinnedList.sort(byRecency).map((session) => ({ session, depth: 0, kids: 0, collapsed: false })),
    projects: groups,
  };
}

// ---- лента разговора -----------------------------------------------------------------------

/** Итог группы рабочих строк: сколько действий, сколько с ошибкой, сколько идёт. */
export function workSummary(rows) {
  let failed = 0;
  let running = 0;
  for (const r of rows) {
    if (r.type === 'tool') {
      if (r.status === 'failed') failed += 1;
      if (r.status === 'pending' || r.status === 'in_progress') running += 1;
    } else if (r.type === 'task') {
      if (r.status === 'failed') failed += 1;
      if (r.status === 'running') running += 1;
    }
  }
  return { count: rows.length, failed, running };
}

export function diffTotals(diffs) {
  return diffs.reduce((acc, d) => ({ files: acc.files + 1, added: acc.added + d.added, removed: acc.removed + d.removed }),
    { files: 0, added: 0, removed: 0 });
}

export function taskSummary(tasks) {
  const running = tasks.filter((x) => x.status === 'running').length;
  return { running, finished: tasks.length - running, total: tasks.length };
}

function workRows(session) {
  const rows = [];
  for (const x of session.tools) rows.push({ ...x, type: 'tool', key: `t:${x.id}` });
  for (const x of session.tasks) rows.push({ ...x, type: 'task', key: `b:${x.id}` });
  return rows;
}

/**
 * Лента разговора в порядке шагов: сообщения владельца, куски текста агента, рабочие строки (инструменты,
 * фоновые задачи) сгруппированы подряд, карточка правок хода, заметки об исходе,
 * действия под ответом и строка идущей работы. Ничего не знает о DOM; ключи устойчивы для повторного рисования.
 */
function canopusCallNote(chunk) {
  const match = /^▸ (canopus_\w+) (\{[^\n]*)(?:\s+— отказ)?$/u.exec(chunk.text);
  if (!match || !/(?:\}|\(обрезано, всего \d+ байт\))(?:\s+— отказ)?$/u.test(chunk.text)) return null;
  const failed = chunk.text.endsWith(' — отказ');
  return { name: match[1], args: failed ? match[2].slice(0, -8).trimEnd() : match[2], failed };
}

export function timeline(session) {
  const items = [];
  const rows = workRows(session);
  const agentTurns = new Set(session.messages.filter((m) => m.role === 'agent').map((m) => m.turn));
  const lastAgentTurn = [...session.messages].reverse().find((m) => m.role === 'agent')?.turn;
  const emitted = new Set();

  for (const m of session.messages) {
    if (m.role === 'user') {
      items.push({ type: 'user', key: m.key, text: m.text, turn: m.turn, images: m.images ?? [], at: m.at ?? 0 });
    } else if (m.role === 'skipped') {
      items.push({ type: 'skipped', key: m.key, agent: m.agent, count: m.count });
    } else if (m.role === 'session_error') {
      items.push({ type: 'note', key: m.key, tone: 'error', reason: m.reason, turn: m.turn,
        userText: session.messages.find(u => u.role === 'user' && u.turn === m.turn)?.text ?? '' });
    } else if (m.role === 'dropped') {
      items.push({ type: 'dropped', key: m.key, setting: m.setting, value: m.value, used: m.used });
    } else if (m.role === 'switch') {
      if (!((m.from === 'kimi' && m.to === 'codex') || (m.from === 'codex' && m.to === 'kimi'))) {
        items.push({ type: 'switch', key: m.key, from: m.from, to: m.to, shown: m.shown, total: m.total, cut: m.cut });
      }
    } else if (m.role === 'answer') {
      items.push({ type: 'answer', key: m.key, skipped: m.skipped, lines: m.lines });
    } else if (m.role === 'auto_extend') {
      const x = (session.routeState?.canopus?.extensions ?? []).find((e) => e.id === m.id);
      if (x) items.push({ type: 'autoext', key: m.key, id: x.id, task: x.task, title: x.title, text: x.text, undone: x.undone });
    } else if (m.role === 'route_note') {
      items.push({ type: 'routenote', key: m.key, n: m.n, action: m.action });
    } else if (m.role === 'agent') {
      const own = rows.filter((r) => r.turn === m.turn);
      const notes = new Set();
      for (const chunk of m.chunks) {
        const note = canopusCallNote(chunk);
        if (!note) continue;
        notes.add(chunk.step);
        const existing = own.find(r => r.type === 'tool' && !r.toolInput
          && (r.title === note.name || r.title === 'mcp.canopus.' + note.name));
        if (existing) existing.toolInput = note.args;
        else own.push({ type: 'tool', kind: 'other', key: 'ctl:' + m.turn + ':' + chunk.step,
          turn: m.turn, step: chunk.step, title: note.name, status: note.failed ? 'failed' : 'completed',
          detail: '', toolInput: note.args });
      }
      own.forEach((r) => emitted.add(r.key));
      const stream = [
        ...m.chunks.filter(c => !notes.has(c.step)).map((c) => ({ chunk: c, step: c.step, order: 0 })),
        ...own.map((r) => ({ row: m.status !== 'streaming' && r.type === 'tool' && ['pending', 'in_progress'].includes(r.status)
          ? { ...r, status: 'unreported' } : r, step: r.step, order: 1 })),
      ].sort((a, b) => (a.step - b.step) || (a.order - b.order));

      const content = [];
      let text = '';
      let group = [];
      let segment = 0;
      const flushText = () => {
        text = text.replace(/(▸ агент не нашёл новых задач)\s*Готово:\s*0 работ\.?\s*$/u, "$1");
        if (text.trim().length > 0) content.push({ type: 'text', key: `${m.key}:s${segment}`, text, streaming: false, turn: m.turn });
        if (text.length > 0) segment += 1;
        text = '';
      };
      const flushGroup = () => {
        if (group.length > 0) content.push({ type: 'work', key: `w:${m.turn}:${group[0].key}`, turn: m.turn, rows: group });
        group = [];
      };
      for (const part of stream) {
        if (part.chunk) { flushGroup(); text += part.chunk.text; } else { flushText(); group.push(part.row); }
      }
      flushText();
      flushGroup();
      const last = content[content.length - 1];
      if (m.status === 'streaming' && last?.type === 'text') last.streaming = true;
      if (m.status === 'streaming' && last?.type === 'work' && m.turn === lastAgentTurn) last.active = true;
      if (m.status === 'done' && m.text.trim().length > 0) {
        items.push({ type: 'author', key: `author:${m.turn}`, actual: m.actual || null, turn: m.turn });
      }
      items.push(...content);

      // расход токенов хода (задача 192): строка под ответом агента, только если агент его сообщил
      const used = usageSummary(m.usage);
      if (used && m.status !== 'streaming') items.push({ type: 'usage', key: `tok:${m.turn}`, turn: m.turn, ...used, context: m.turn === lastAgentTurn && session.usage ? { used: session.usage.used, size: session.usage.size } : null });

      const diffs = session.diffs.filter((d) => d.turn === m.turn);
      if (diffs.length > 0) items.push({ type: 'diffs', key: `d:${m.turn}`, turn: m.turn, rows: diffs, totals: diffTotals(diffs) });

      if (m.status === 'refused' || m.status === 'error' || m.status === 'cancelled') {
        items.push({ type: 'note', key: `n:${m.turn}`, tone: m.status, reason: m.reason, turn: m.turn, partialAnswer: m.text.trim().length > 0,
          userText: session.messages.find(u => u.role === 'user' && u.turn === m.turn)?.text ?? '' });
      } else if (m.status === 'done' && m.text.trim().length > 0) {
        const text = m.chunks.filter(c => !notes.has(c.step)).map(c => c.text).join('');
        if (text.trim()) items.push({ type: 'actions', key: `x:${m.turn}`, text, at: m.doneAt, turn: m.turn });
      }
    }
  }

  const orphans = rows.filter((r) => !emitted.has(r.key) && !agentTurns.has(r.turn)).sort((a, b) => a.step - b.step);
  if (orphans.length > 0) items.push({ type: 'work', key: `w:orphans:${orphans[0].key}`, rows: orphans });

  if (session.state === 'answering') items.push({ type: 'running', key: 'running', since: session.turnStartedAt, last: Math.max(session.updatedAt || 0, session.turnStartedAt || 0) });
  // задача 192.14: ход закончен, а агент ждёт ответа обычным текстом или пунктом чек-листа: полоса под его последним сообщением, пока владелец не ответит
  else if (needsOwnerReason(session) === 'checklist') items.push({ type: 'needs', key: 'needs' });
  return items;
}

// ---- безопасный разбор абзацев и кода в строке -------------------------------------------------

/** Поддерживаемые элементы Markdown в строке. HTML остаётся текстом. */
export function inlineSpans(text) {
  const spans = [];
  const s = String(text);
  const tokens = /`([^\x60\n]+)`|\*\*([^\n]+?)\*\*|__([^\n]+?)__|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/gu;
  const pushText = (value) => {
    if (!value) return;
    const last = spans.at(-1);
    if (last && !last.code && !last.strong && !last.href) last.text += value;
    else spans.push({ text: value, code: false });
  };
  let pos = 0;
  for (const match of s.matchAll(tokens)) {
    const [raw, code, stars, underscores, label, destination] = match;
    pushText(s.slice(pos, match.index));
    if (code !== undefined) spans.push({ text: code, code: true });
    else if (stars !== undefined || underscores !== undefined) spans.push({ text: stars ?? underscores, strong: true });
    else {
      try {
        const url = new URL(destination);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) pushText(raw);
        else spans.push({ text: label, href: url.href });
      } catch {
        pushText(raw);
      }
    }
    pos = match.index + raw.length;
  }
  pushText(s.slice(pos));
  return spans;
}

function tableCells(line) {
  if (!line?.includes('|')) return null;
  const cells = [];
  let start = 0;
  const cellText = (end) => line.slice(start, end).trim().replace(/\\[\\|]/gu, pair => pair[1] === '|' ? '|' : pair);
  for (const token of line.matchAll(/\\[\\|]|\|/gu)) {
    if (token[0] !== '|') continue;
    cells.push(cellText(token.index));
    start = token.index + 1;
  }
  if (cells.length === 0) return null;
  cells.push(cellText(line.length));
  if (!cells[0]) cells.shift();
  if (!cells.at(-1)) cells.pop();
  return cells.length ? cells : null;
}

/** Блоки Markdown. Содержимое остаётся текстом для безопасного построения DOM. */
export function paragraphs(text) {
  const blocks = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    blocks.push(cur.type === 'p' ? { type: 'p', text: cur.lines.join('\n') } : { type: cur.type, items: cur.lines });
    cur = null;
  };
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') { flush(); continue; }
    const headers = tableCells(line);
    const divider = headers && tableCells(lines[i + 1]);
    if (divider && divider.length === headers.length && divider.every(cell => /^:?-+:?$/u.test(cell))) {
      flush();
      const align = divider.map(cell => cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'end') : 'start');
      const rows = [];
      i += 1;
      for (let row = tableCells(lines[i + 1]); row; row = tableCells(lines[i + 1])) {
        rows.push(headers.map((_, col) => row[col] ?? ''));
        i += 1;
      }
      blocks.push({ type: 'table', headers, align, rows });
      continue;
    }
    if (/^▸ canopus_list\s+\{\s*\}\s*$/u.test(line)) {
      flush();
      blocks.push({ type: 'canopus-list' });
      continue;
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/u.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].replace(/\s+#+$/u, '') });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    let type = 'p';
    if (bullet) type = 'ul';
    else if (numbered) type = 'ol';
    if (!cur || cur.type !== type) { flush(); cur = { type, lines: [] }; }
    cur.lines.push(bullet ? bullet[1] : numbered ? numbered[1] : line);
  }
  flush();
  return blocks;
}

const JS_KEYWORDS = 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield';
const CODE_LANGUAGES = [
  [/^(js|javascript|jsx)$/i, 'slash', JS_KEYWORDS],
  [/^(ts|typescript|tsx)$/i, 'slash', JS_KEYWORDS + ' abstract as declare enum implements infer interface keyof namespace never private protected public readonly satisfies type unknown'],
  [/^(nv|nova)$/i, 'slash', 'assert break case const consume continue do else enum export false fn for if import in match module mut None return ro Some struct true type while with'],
  [/^(py|python)$/i, 'hash', 'and as assert async await break case class continue def del elif else except False finally for from global if import in is lambda match None nonlocal not or pass raise return True try while with yield'],
  [/^(bash|sh|zsh|shell)$/i, 'hash', 'case do done elif else esac exit export fi for function if in local read return select set then until while'],
  [/^(powershell|pwsh|ps1)$/i, 'hash', 'begin break catch class continue do else elseif end enum exit filter finally for foreach function if in param process return switch throw trap try until using while', true],
  [/^json$/i, 'json', 'false null true'],
].map(([aliases, style, words, ignoreCase]) => ({ aliases, style, words: new Set(words.split(' ')), ignoreCase }));

const CODE_TOKENS = {
  slash: /(?<comment>[/][/][^\n]*|[/][*][\s\S]*?(?:[*][/]|$))|(?<string>"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|\x60(?:\\[\s\S]|[^\x60\\])*\x60)|(?<word>[$\w]+)/gu,
  hash: /(?<comment>#[^\n]*)|(?<string>"{3}[\s\S]*?"{3}|[']{3}[\s\S]*?[']{3}|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*')|(?<word>[$\w]+)/gu,
  json: /(?<string>"(?:\\[\s\S]|[^"\\\n])*")|(?<word>[$\w]+)/gu,
};

/** Лёгкая подсветка для явно указанного языка. Все части остаются текстом. */
export function codeSpans(text, lang) {
  const language = CODE_LANGUAGES.find(entry => entry.aliases.test(lang));
  if (!language) return [{ text }];
  const parts = [];
  let start = 0;
  for (const token of text.matchAll(CODE_TOKENS[language.style])) {
    const { comment, string, word } = token.groups;
    const key = language.ignoreCase ? word?.toLowerCase() : word;
    const kind = comment !== undefined ? 'comment' : string !== undefined ? 'string'
      : language.words.has(key) ? 'keyword' : '';
    if (!kind) continue;
    if (token.index > start) parts.push({ text: text.slice(start, token.index) });
    parts.push({ text: token[0], kind });
    start = token.index + token[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}

// ---- числа и подписи -------------------------------------------------------------------------------

/** Доля занятого окна контекста, целые проценты 0..100. */
export function usagePercent(usage) {
  if (!usage || !(usage.size > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((usage.used / usage.size) * 100)));
}

/** Красная полоска — от 90 %. */
export function usageLevel(percent) {
  return percent >= 90 ? 'high' : 'normal';
}

/** Число токенов для подписи: { value, unit } с unit '' | 'k' | 'm'. */
export function tokenParts(n) {
  if (n < 1000) return { value: n, unit: '' };
  if (n < 1_000_000) return { value: Math.round(n / 1000), unit: 'k' };
  return { value: Math.round(n / 100_000) / 10, unit: 'm' };
}

/** Длительность двумя старшими единицами: [[1,'m'],[36,'s']]; единицы — 'd','h','m','s'. */
export function durationLabel(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const parts = [
    ['d', Math.floor(total / 86400)],
    ['h', Math.floor(total / 3600) % 24],
    ['m', Math.floor(total / 60) % 60],
    ['s', total % 60],
  ];
  const first = parts.findIndex(([, v]) => v > 0);
  if (first < 0) return [[0, 's']];
  const out = [[parts[first][1], parts[first][0]]];
  const next = parts[first + 1];
  if (next && next[1] > 0) out.push([next[1], next[0]]);
  return out;
}

/** «Сколько назад»: { unit: 'now' | 'min' | 'hour' | 'day', n }. */
export function agoParts(ms, now) {
  const diff = now - ms;
  if (diff < 60_000) return { unit: 'now', n: 0 };
  if (diff < 3_600_000) return { unit: 'min', n: Math.floor(diff / 60_000) };
  if (diff < 86_400_000) return { unit: 'hour', n: Math.floor(diff / 3_600_000) };
  return { unit: 'day', n: Math.floor(diff / 86_400_000) };
}

/** Путь файла -> имя и путь-пояснение. */
export function fileParts(path) {
  const p = String(path).split('\\').join('/');
  const i = p.lastIndexOf('/');
  return i < 0 ? { dir: '', name: p } : { dir: p.slice(0, i), name: p.slice(i + 1) };
}

export function normalizeTheme(v) {
  return v === 'light' || v === 'dark' ? v : 'dark';
}

export function nextTheme(current) {
  return normalizeTheme(current) === 'light' ? 'dark' : 'light';
}

// ---- выбор модели: поиск и группы по провайдеру (задача 192) -------------------------------

/** Провайдер модели — часть id до первой «/» ('' — у id без неё). */
export function providerOf(id) {
  const at = String(id).indexOf('/');
  return at > 0 ? String(id).slice(0, at) : '';
}

/** Модели, чьи id или название содержат запрос (без учёта регистра, пробелы по краям не считаются); пустой запрос — все. */
export function filterModels(models, query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [...models];
  return models.filter((m) => `${m.id}\n${m.name}`.toLowerCase().includes(q));
}

/** Модели по провайдерам в порядке первого появления: [{ provider, models }]. */
export function groupModels(models) {
  const groups = [];
  for (const m of models) {
    const provider = providerOf(m.id);
    let g = groups.find((x) => x.provider === provider);
    if (!g) { g = { provider, models: [] }; groups.push(g); }
    g.models.push(m);
  }
  return groups;
}

/** Общее первое слово имён значений («Thinking Low / Thinking High» → «Thinking»), если оно у ВСЕХ и после него есть ещё слово; иначе ''. */
export function commonWordPrefix(names) {
  if (names.length < 2) return '';
  const word = (n) => { const at = String(n).indexOf(' '); return at > 0 ? String(n).slice(0, at) : ''; };
  const first = word(names[0]);
  if (!first) return '';
  return names.every((n) => word(n) === first) ? first : '';
}

/** Значения усилия для показа: имя агента без общего первого слова; данные агента не меняются (id те же). */
export function effortChoices(efforts) {
  const prefix = commonWordPrefix(efforts.map((e) => e.name));
  return efforts.map((e) => (prefix ? { ...e, name: e.name.slice(prefix.length + 1) } : e));
}

// ---- расход токенов хода (задача 192) -----------------------------------------------------------

/** Число с узкими неразрывными пробелами между тысячами: 173312 -> «173 312». */
export function groupThousands(n) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return '';
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}

/** Форма слова по числу: 'one' (1, 21), 'few' (2-4, 22-24), 'many' (остальное). */
export function ruForm(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}

const STOP_LABEL = { end_turn: 'stop', tool_use: 'tool-call' };

/**
 * Расход токенов хода из события turn_usage: { steps, rows, latest, expandable }. rows - строки шагов (из input.steps, если агент
 * присылает расход по шагам; иначе одна строка итога); latest - последняя строка. Нет чисел - null (строки в ленте не будет).
 * «Всего» - то, что вошло в запрос: новые плюс из кэша (так считает и строка-образец); нет обоих - как дал агент.
 */
export function usageSummary(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : undefined);
  const row = (label, r) => {
    const fresh = num(r.new);
    const cached = num(r.cached);
    const given = num(r.total);
    const total = fresh !== undefined || cached !== undefined ? (fresh ?? 0) + (cached ?? 0) : given;
    return { label, new: fresh, cached, total };
  };
  const listed = Array.isArray(usage.steps) ? usage.steps.filter((x) => x && typeof x === 'object') : [];
  const rows = listed.length > 0
    ? listed.map((x, i) => row(typeof x.label === 'string' && x.label ? x.label : String(i + 1), x))
    : [row(STOP_LABEL[usage.reason] ?? (typeof usage.reason === 'string' && usage.reason ? usage.reason : 'stop'), usage)];
  const latest = rows[rows.length - 1];
  if (latest.new === undefined && latest.cached === undefined && latest.total === undefined) return null;
  return { steps: rows.length, rows, latest, expandable: rows.length > 1 };
}

/** Время сообщения под пузырём: { kind: 'now' | 'today' | 'yesterday' | 'older', clock: 'ЧЧ:ММ', date: 'дд.мм' } (местное время). */
export function messageTime(at, now) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(at);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  if (now - at < 60_000) return { kind: 'now', clock, date };
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(d)) / 86_400_000);
  if (days <= 0) return { kind: 'today', clock, date };
  if (days === 1) return { kind: 'yesterday', clock, date };
  return { kind: 'older', clock, date };
}
