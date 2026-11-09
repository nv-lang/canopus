// projects-ui.js — окна проектов: «Новый проект / Изменить проект», «Переменные окружения» и «Выбор папки».
//
// Окна — слои поверх страницы (стопка): Esc закрывает верхний, Tab ходит по кругу внутри верхнего,
// при закрытии фокус возвращается туда, откуда окно открыли. Текст — только textContent (dom.js).
// Сеть — через projects-api.js (подставляется), поэтому на моке всё работает так же, как на сервисе.

import { t } from './strings.js';
import { h, icon } from './dom.js';
import {
  countEnv, folderName, joinPath, makeFolder, normalizePath, parentPath, parseEnv, pluralRu, projectPayload, samePath, uniqueProjectName, validateProject, worktreesDirHint,
} from './projects.js';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const ENV_COUNT_KEY = { one: 'project.env_one', few: 'project.env_few', many: 'project.env_many' };
const MAX_LISTED_ERRORS = 3;

/** Подпись числа переменных: «Нет для этого проекта» или «3 переменные». */
export function envSummary(n) {
  return n === 0 ? t('project.env_none') : t(ENV_COUNT_KEY[pluralRu(n)], { n });
}

/**
 * @param doc  document
 * @param deps { api, onChanged(), onNotice(text, tone) } — api из projects-api.js
 */
export function createProjectsUi(doc, deps) {
  const { api, onChanged, onNotice } = deps;
  const layers = []; // от нижнего к верхнему: { root, dialog, opener, close }

  // ---------------------------------------------------------------- слои

  function topLayer() { return layers[layers.length - 1]; }

  function closeLayer(layer, result) {
    const at = layers.indexOf(layer);
    if (at < 0) return;
    layers.splice(at, 1);
    layer.root.remove();
    if (layer.opener && typeof layer.opener.focus === 'function' && doc.contains(layer.opener)) layer.opener.focus();
    layer.done(result);
  }

  /** Показать окно поверх страницы. Возвращает слой; layer.promise закрывается значением из close(). */
  function pushLayer(dialog, { cancelValue = null, scrimClose = false } = {}) {
    const root = h(doc, 'div', { class: 'overlay layer' }, dialog);
    let done = () => {};
    const promise = new Promise((resolve) => { done = resolve; });
    const layer = { root, dialog, opener: doc.activeElement, done, promise, cancelValue };
    layer.close = (value) => closeLayer(layer, value === undefined ? cancelValue : value);
    if (scrimClose) root.addEventListener('mousedown', (e) => { if (e.target === root) layer.close(); });
    layers.push(layer);
    doc.body.append(root);
    return layer;
  }

  doc.addEventListener('keydown', (e) => {
    const layer = topLayer();
    if (!layer) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      layer.close();
      return;
    }
    if (e.key === 'Tab') {
      const items = [...layer.dialog.querySelectorAll(FOCUSABLE)].filter((n) => !n.closest('[hidden]'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = doc.activeElement;
      if (!layer.dialog.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  const dialogShell = (labelId, className, ...children) => h(doc, 'div', {
    class: `dialog modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelId,
  }, ...children);

  // ---------------------------------------------------------------- выбор папки

  /** Открыть окно выбора папки. Результат: нормальный путь или null (отмена). */
  function pickFolder(start = '') {
    let state = { path: '', parent: null, entries: [], recent: [], error: '', loading: true, search: '', selectedPath: '' };
    let ticket = 0;
    let history = [];
    let historyAt = -1;
    const FAVORITES_KEY = 'canopus-folder-picker-favorites-v1';
    let favorites = [];
    try {
      const saved = JSON.parse(doc.defaultView?.localStorage?.getItem(FAVORITES_KEY) || '[]');
      if (Array.isArray(saved)) {
        for (const value of saved) {
          if (typeof value !== 'string' || normalizePath(value) === '') continue;
          const path = normalizePath(value);
          if (!favorites.some((savedPath) => samePath(savedPath, path))) favorites.push(path);
        }
        favorites = favorites.slice(-20);
      }
    } catch { /* Browser storage may be disabled or contain invalid data. */ }
    const saveFavorites = () => {
      try { doc.defaultView?.localStorage?.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* Keep working for this dialog if storage is unavailable. */ }
    };
    const pathInput = h(doc, 'input', {
      type: 'text', id: 'picker-path', class: 'mono', autocomplete: 'off', spellcheck: 'false', placeholder: t('picker.path_placeholder'), 'aria-label': t('picker.path'),
    });
    const goButton = h(doc, 'button', { type: 'submit', class: 'picker-go', text: t('picker.go') });
    const upButton = h(doc, 'button', { type: 'button', class: 'picker-up', 'aria-label': t('picker.up'), title: t('picker.up') }, icon(doc, 'i-arrow-up'), h(doc, 'span', { text: '..' }));
    const backButton = h(doc, 'button', { type: 'button', class: 'picker-back', 'aria-label': t('picker.back'), title: t('picker.back') }, icon(doc, 'i-back'), h(doc, 'span', { text: t('picker.back') }));
    const favoriteButton = h(doc, 'button', { type: 'button', class: 'picker-favorite' });
    const listTitle = h(doc, 'div', { class: 'picker-head', id: 'picker-list-title' });
    const breadcrumbs = h(doc, 'nav', { class: 'picker-breadcrumbs', 'aria-label': t('picker.breadcrumbs') });
    const searchInput = h(doc, 'input', { type: 'search', class: 'picker-search', autocomplete: 'off', placeholder: t('picker.search'), 'aria-label': t('picker.search') });
    const list = h(doc, 'ul', { class: 'picker-list', 'aria-labelledby': 'picker-list-title' });
    const note = h(doc, 'p', { class: 'picker-note muted' });
    const recentBox = h(doc, 'div', { class: 'picker-recent', hidden: true });
    const errorBox = h(doc, 'p', { class: 'plate', role: 'alert', hidden: true });
    const cancel = h(doc, 'button', { type: 'button', text: t('picker.cancel') });
    const choose = h(doc, 'button', { type: 'button', class: 'primary', text: t('picker.choose') });
    const form = h(doc, 'form', { class: 'picker-path-row', novalidate: true }, pathInput, goButton);
    const dialog = dialogShell('picker-title', 'picker',
      h(doc, 'h3', { id: 'picker-title', text: t('picker.title') }),
      form, searchInput,
      h(doc, 'div', { class: 'picker-bar' }, backButton, upButton, favoriteButton, h(doc, 'span', { class: 'muted picker-hint', text: t('picker.hint') })),
      breadcrumbs, listTitle, list, note, recentBox, errorBox,
      h(doc, 'div', { class: 'actions' }, cancel, choose));
    const layer = pushLayer(dialog, { cancelValue: null, scrimClose: true });

    function paint() {
      const atRoots = state.path === '';
      listTitle.textContent = atRoots ? t('picker.roots') : state.path;
      backButton.disabled = historyAt <= 0 || state.loading;
      upButton.disabled = state.parent === null || state.loading;
      choose.disabled = state.loading || (!state.selectedPath && atRoots);
      const currentIsFavorite = favorites.some((p) => samePath(p, state.path));
      favoriteButton.disabled = atRoots || state.loading;
      favoriteButton.textContent = t(currentIsFavorite ? 'picker.favorite_remove' : 'picker.favorite_add');
      breadcrumbs.replaceChildren(...breadcrumbItems(state.path).map((crumb, index, crumbs) => {
        const last = index === crumbs.length - 1;
        const part = h(doc, 'button', { type: 'button', class: 'picker-crumb', disabled: last, text: crumb.label, 'aria-current': last ? 'page' : undefined });
        part.addEventListener('click', () => { if (!last) go(crumb.path); });
        return h(doc, 'span', { class: 'picker-crumb-part' }, part, last ? false : h(doc, 'span', { class: 'picker-crumb-separator', 'aria-hidden': 'true', text: '›' }));
      }));
      errorBox.hidden = state.error === '';
      errorBox.textContent = state.error;
      const entries = state.entries.filter((e) => e.name.toLocaleLowerCase().includes((state.search || '').trim().toLocaleLowerCase()));
      note.textContent = state.loading ? t('picker.loading')
        : state.entries.length === 0 && !state.error ? t('picker.empty')
        : entries.length === 0 && !state.error ? t('picker.no_matches') : '';
      list.replaceChildren(...entries.map((e) => {
        const target = joinPath(state.path, e.name);
        const selected = samePath(state.selectedPath, target);
        const item = h(doc, 'button', { type: 'button', class: `picker-item${selected ? ' is-selected' : ''}`, 'data-path': target, 'aria-selected': String(selected) },
          icon(doc, atRoots ? 'i-laptop' : 'i-folder'), h(doc, 'span', { text: e.name.replace(/\/$/, '') || e.name }));
        item.addEventListener('click', () => {
          state = { ...state, selectedPath: target };
          for (const row of list.querySelectorAll('.picker-item[data-path]')) {
            const isSelected = row.dataset.path === target;
            row.classList.toggle('is-selected', isSelected);
            row.setAttribute('aria-selected', String(isSelected));
          }
          choose.disabled = state.loading || (!state.selectedPath && state.path === '');
        });
        return h(doc, 'li', {}, item);
      }));
      const recent = state.recent.filter((p) => p !== '');
      const places = [
        ...favorites.map((p) => ({ path: p, kind: 'favorite' })),
        ...recent.filter((p) => !favorites.some((f) => samePath(f, p))).map((p) => ({ path: p, kind: 'recent' })),
      ];
      recentBox.hidden = places.length === 0;
      recentBox.replaceChildren(...(places.length === 0 ? [] : [
        h(doc, 'div', { class: 'picker-head', text: t('picker.places') }),
        ...places.map(({ path: p, kind }) => {
          const b = h(doc, 'button', { type: 'button', class: `picker-item picker-place${kind === 'favorite' ? ' is-favorite' : ''}`, title: p, 'data-path': p }, icon(doc, kind === 'favorite' ? 'i-pin' : 'i-folder'),
            h(doc, 'span', { class: 'picker-recent-name', text: folderName(p) }), h(doc, 'span', { class: 'muted picker-recent-path', text: p }));
          b.addEventListener('click', () => { state = { ...state, selectedPath: p }; paint(); });
          return b;
        }),
      ]));
    }

    function breadcrumbItems(path) {
      const out = [];
      let at = normalizePath(path);
      while (at) {
        out.unshift({ path: at, label: at === '/' ? '/' : folderName(at) });
        at = parentPath(at);
      }
      return out;
    }

    async function go(path, { record = true, historyIndex = null } = {}) {
      const mine = ticket + 1;
      ticket = mine;
      state = { ...state, loading: true, error: '', selectedPath: '' };
      paint();
      const r = await api.fsList(normalizePath(path));
      if (mine !== ticket) return false;
      if (!r.ok) {
        state = { ...state, loading: false, error: t('picker.failed', { reason: r.error }) };
        paint();
        return false;
      }
      state = { ...state, path: r.path, parent: r.parent, entries: r.entries, recent: r.recent.length > 0 ? r.recent : state.recent, error: '', loading: false, selectedPath: '' };
      if (historyIndex !== null) historyAt = historyIndex;
      else if (record && (historyAt < 0 || !samePath(history[historyAt], r.path))) {
        history = history.slice(0, historyAt + 1);
        history.push(r.path);
        if (history.length > 50) history.shift();
        historyAt = history.length - 1;
      }
      pathInput.value = r.path;
      paint();
      return true;
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); go(pathInput.value); });
    searchInput.addEventListener('input', () => { state = { ...state, search: searchInput.value }; paint(); });
    upButton.addEventListener('click', () => { if (state.parent !== null) go(state.parent); });
    backButton.addEventListener('click', async () => {
      const next = historyAt - 1;
      if (next < 0) return;
      await go(history[next], { record: false, historyIndex: next });
    });
    favoriteButton.addEventListener('click', () => {
      if (state.path === '') return;
      favorites = favorites.some((p) => samePath(p, state.path))
        ? favorites.filter((p) => !samePath(p, state.path))
        : [...favorites, state.path].slice(-20);
      saveFavorites();
      paint();
    });
    list.addEventListener('dblclick', (e) => {
      const item = e.target?.closest?.('.picker-item[data-path]');
      const target = item?.dataset.path;
      if (target && !state.loading) go(target);
    });
    cancel.addEventListener('click', () => layer.close());
    choose.addEventListener('click', async () => {
      const chosen = state.selectedPath || normalizePath(pathInput.value) || state.path;
      if (chosen !== state.path && chosen !== '' && !(await go(chosen))) return;
      if (chosen !== '') layer.close(chosen);
    });
    // стрелки ходят по папкам
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const active = doc.activeElement;
        const target = active?.classList?.contains('picker-item') ? active.dataset.path : '';
        if (target && !state.loading) { e.preventDefault(); go(target); }
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...list.querySelectorAll('.picker-item[data-path]')];
      const at = items.indexOf(doc.activeElement);
      if (at < 0) return;
      e.preventDefault();
      (items[at + (e.key === 'ArrowDown' ? 1 : -1)] || items[at]).focus();
    });

    go(start).then(() => pathInput.focus());
    return layer.promise;
  }

  // ---------------------------------------------------------------- переменные окружения

  /**
   * Подокно переменных .env. Результат: новый текст (кнопка «Готово») или null (Esc).
   * serverError — сообщение сервера «строка N: …», которое нужно показать сразу.
   */
  function editEnv({ projectName, text, serverError = '' }) {
    const area = h(doc, 'textarea', {
      id: 'env-text', class: 'mono env-text', rows: 10, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
      placeholder: t('env.placeholder'), 'aria-label': t('env.label'),
    });
    area.value = text;
    const counter = h(doc, 'span', { class: 'muted env-count', 'aria-live': 'polite' });
    const plate = h(doc, 'div', { class: 'plate', role: 'alert', hidden: true });
    const done = h(doc, 'button', { type: 'button', class: 'primary', text: t('env.done') });
    const dialog = dialogShell('env-title', 'env',
      h(doc, 'h3', { id: 'env-title', text: t('env.title') }),
      h(doc, 'p', { class: 'muted', text: t('env.hint', { project: projectName || t('project.unnamed') }) }),
      area,
      h(doc, 'div', { class: 'env-meta' }, counter),
      plate,
      h(doc, 'p', { class: 'muted env-format', text: t('env.format') }),
      h(doc, 'div', { class: 'actions' }, done));
    const layer = pushLayer(dialog, { cancelValue: null });

    function gotoLine(line) {
      const lines = area.value.split('\n');
      let from = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i += 1) from += lines[i].length + 1;
      area.focus();
      area.setSelectionRange(from, from + (lines[line - 1] ?? '').length);
    }

    function refresh() {
      const parsed = parseEnv(area.value);
      counter.textContent = envSummary(new Set(parsed.vars.map((v) => v.key)).size);
      const items = parsed.errors.slice(0, MAX_LISTED_ERRORS).map((er) => {
        const b = h(doc, 'button', { type: 'button', class: 'plate-line', title: t('env.goto', { line: er.line }), text: er.message });
        b.addEventListener('click', () => gotoLine(er.line));
        return b;
      });
      if (parsed.errors.length > MAX_LISTED_ERRORS) items.push(h(doc, 'span', { text: t('env.more_errors', { n: parsed.errors.length - MAX_LISTED_ERRORS }) }));
      if (items.length === 0 && serverError && area.value === text) items.push(h(doc, 'span', { text: serverError }));
      plate.hidden = items.length === 0;
      plate.replaceChildren(...items);
      done.disabled = parsed.errors.length > 0;
    }

    area.addEventListener('input', refresh);
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !done.disabled) { e.preventDefault(); layer.close(area.value); } });
    done.addEventListener('click', () => layer.close(area.value));
    refresh();
    area.focus();
    return layer.promise;
  }

  // ---------------------------------------------------------------- окно проекта

  /**
   * Открыть «Новый проект» (id не задан) или «Изменить проект» (id проекта).
   * Результат: id сохранённого проекта или null.
   */
  async function openEditor(id) {
    let project = { id: '', name: '', folders: [], env: '', worktreesDir: '' };
    if (id) {
      const r = await api.get(id);
      if (!r.ok) { onNotice(t('projects.open_failed', { reason: r.error }), 'error'); return null; }
      project = r.project;
    }
    const draft = { name: project.name, folders: project.folders.map(makeFolder), env: project.env, worktreesDir: project.worktreesDir || '' };
    const git = new Map(); // путь (нижний регистр) -> { isRepo, branch }
    const gitKey = (p) => normalizePath(p).toLowerCase();

    const nameInput = h(doc, 'input', {
      id: 'project-name', type: 'text', autocomplete: 'off', placeholder: t('project.name_placeholder'), 'aria-describedby': 'project-name-error',
    });
    nameInput.value = draft.name;
    const nameError = h(doc, 'p', { class: 'field-error', id: 'project-name-error', hidden: true, text: t('project.name_required') });
    const addButton = h(doc, 'button', { type: 'button', class: 'add-folder', title: t('project.add_folder_title') }, icon(doc, 'i-plus'), h(doc, 'span', { text: t('project.add_folder') }));
    const folderList = h(doc, 'ul', { class: 'proj-folders' });
    const folderNote = h(doc, 'p', { class: 'muted proj-empty', text: t('project.folders_empty') });
    // задача 192.5: «папка деревьев» проекта — под списком папок
    const treesInput = h(doc, 'input', {
      id: 'project-trees', type: 'text', class: 'mono', autocomplete: 'off', spellcheck: 'false', placeholder: t('project.trees_placeholder'), 'aria-describedby': 'project-trees-hint project-trees-error',
    });
    treesInput.value = draft.worktreesDir;
    const treesHint = h(doc, 'p', { class: 'muted field-hint', id: 'project-trees-hint' });
    const treesError = h(doc, 'p', { class: 'field-error', id: 'project-trees-error', hidden: true });
    const envValue = h(doc, 'span', { class: 'muted env-summary' });
    const envButton = h(doc, 'button', { type: 'button', class: 'proj-env' },
      icon(doc, 'i-terminal'), h(doc, 'span', { class: 'proj-env-label', text: t('project.env') }), envValue, icon(doc, 'i-chevron-right', 'chev'));
    const plate = h(doc, 'p', { class: 'plate', role: 'alert', hidden: true });
    const cancel = h(doc, 'button', { type: 'button', text: t('project.cancel') });
    const submit = h(doc, 'button', { type: 'submit', class: 'primary', text: project.id ? t('project.save') : t('project.create') });
    const form = h(doc, 'form', { class: 'proj-form', novalidate: true },
      h(doc, 'label', { class: 'field', for: 'project-name' }, h(doc, 'span', { text: t('project.name') }), nameInput, nameError),
      h(doc, 'section', { class: 'proj-section', 'aria-labelledby': 'project-folders-title' },
        h(doc, 'div', { class: 'proj-section-head' }, h(doc, 'h4', { id: 'project-folders-title', text: t('project.folders') }), addButton),
        folderList, folderNote),
      h(doc, 'label', { class: 'field proj-trees', for: 'project-trees' }, h(doc, 'span', { text: t('project.trees') }), treesInput, treesHint, treesError),
      envButton,
      plate,
      h(doc, 'div', { class: 'actions' }, cancel, submit));
    const dialog = dialogShell('project-title', 'project', h(doc, 'h3', { id: 'project-title', text: project.id ? t('project.edit_title') : t('project.new_title') }), form);
    const layer = pushLayer(dialog, { cancelValue: null });

    const showPlate = (text) => { plate.hidden = text === ''; plate.textContent = text; };

    function paintFolders() {
      folderNote.hidden = draft.folders.length > 0;
      folderList.replaceChildren(...draft.folders.map((f, index) => {
        const info = git.get(gitKey(f.path));
        const repo = info ? info.isRepo : null; // null — ещё не знаем
        const nameText = folderName(f.path);
        const remove = h(doc, 'button', { type: 'button', class: 'icon-btn small', 'aria-label': t('project.folder_remove', { folder: nameText }), title: t('project.folder_remove', { folder: nameText }) }, icon(doc, 'i-x'));
        remove.addEventListener('click', () => { draft.folders.splice(index, 1); showPlate(''); paintFolders(); });
        const box = h(doc, 'input', { type: 'checkbox', id: `wt-${index}`, disabled: repo === false });
        box.checked = f.worktree && repo !== false;
        box.addEventListener('change', () => { f.worktree = box.checked; });
        const wtLabel = h(doc, 'label', { class: 'check', for: `wt-${index}`, title: repo === false ? t('project.worktree_off') : t('project.worktree_tip') }, box, h(doc, 'span', { text: t('project.worktree') }));
        let chip = false;
        if (info && info.isRepo) {
          const shown = f.branch && f.branch !== info.branch ? f.branch : info.branch;
          const current = shown === info.branch;
          chip = h(doc, 'span', { class: 'chip', title: t('project.branch_title', { branch: shown }) }, icon(doc, 'i-branch'), h(doc, 'span', { text: shown }),
            current ? h(doc, 'span', { class: 'chip-note', text: t('project.branch_current') }) : false);
        } else if (info && !info.isRepo) {
          chip = h(doc, 'span', { class: 'chip chip-off', text: t('project.not_repo') });
        }
        return h(doc, 'li', { class: 'proj-folder' },
          icon(doc, 'i-folder'),
          h(doc, 'div', { class: 'pf-main', title: f.path }, h(doc, 'strong', { text: nameText }), h(doc, 'small', { class: 'muted', text: f.path })),
          chip, wtLabel, remove);
      }));
    }

    async function learnGit(path) {
      const key = gitKey(path);
      if (git.has(key)) return;
      const r = await api.fsGit(path);
      git.set(key, { isRepo: r.ok && r.isRepo, branch: r.branch });
      if (layers.includes(layer)) paintFolders();
    }

    function paintEnv() { envValue.textContent = envSummary(countEnv(draft.env)); }

    function paintTrees() {
      const hint = worktreesDirHint(treesInput.value);
      treesHint.textContent = hint.kind === 'beside' ? t('project.trees_beside') : hint.kind === 'absolute' ? t('project.trees_absolute', { path: hint.path }) : t('project.trees_named', { name: hint.name });
    }

    async function addFolder() {
      const path = await pickFolder('');
      if (path === null) return;
      if (draft.folders.some((f) => samePath(f.path, path))) { showPlate(t('project.folder_dup')); return; }
      showPlate('');
      draft.folders.push(makeFolder({ path, worktree: false }));
      paintFolders();
      await learnGit(path);
      addButton.focus();
    }

    async function openEnv(serverError = '') {
      const text = await editEnv({ projectName: nameInput.value.trim(), text: draft.env, serverError });
      if (text !== null) { draft.env = text; showPlate(''); paintEnv(); }
      envButton.focus();
    }

    addButton.addEventListener('click', addFolder);
    envButton.addEventListener('click', () => openEnv());
    cancel.addEventListener('click', () => layer.close());
    nameInput.addEventListener('input', () => { nameError.hidden = true; nameInput.removeAttribute('aria-invalid'); });
    treesInput.addEventListener('input', () => { draft.worktreesDir = treesInput.value; treesError.hidden = true; treesInput.removeAttribute('aria-invalid'); paintTrees(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      draft.name = nameInput.value;
      draft.worktreesDir = treesInput.value;
      const check = validateProject(draft);
      treesError.hidden = !check.errors.worktreesDir;
      if (check.errors.worktreesDir) {
        treesError.textContent = t(check.errors.worktreesDir === 'dots' ? 'project.trees_dots' : 'project.trees_control');
        treesInput.setAttribute('aria-invalid', 'true');
        treesInput.focus();
        return;
      }
      nameError.hidden = !check.errors.name;
      if (check.errors.name) { nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return; }
      if (check.errors.folders) { showPlate(t('project.folder_dup')); return; }
      if (check.errors.env) { showPlate(check.errors.env); openEnv(check.errors.env); return; }
      submit.disabled = true;
      submit.textContent = t('project.saving');
      const payload = projectPayload(draft);
      const r = project.id ? await api.update(project.id, payload) : await api.create(payload);
      submit.disabled = false;
      submit.textContent = project.id ? t('project.save') : t('project.create');
      if (!r.ok) {
        showPlate(r.error);
        if (/^строка\s+\d+/.test(r.error)) openEnv(r.error);
        return;
      }
      const savedId = project.id || (r.id ?? '');
      layer.close(savedId || true);
      onChanged();
    });

    paintFolders();
    paintEnv();
    paintTrees();
    for (const f of draft.folders) learnGit(f.path);
    nameInput.focus();
    return layer.promise;
  }

  /** «Новый проект»: только выбор одной папки; название — имя папки (при совпадении «имя (2)»), его можно поправить в настройках проекта. */
  async function createByFolder(names) {
    const path = await pickFolder('');
    if (path === null) return null;
    const name = uniqueProjectName(folderName(path) || path, names);
    const r = await api.create(projectPayload({ name, folders: [makeFolder({ path, worktree: false })], env: '' }));
    if (!r.ok) { onNotice(t('projects.create_failed', { reason: r.error }), 'error'); return null; }
    onChanged();
    return r.id || true;
  }

  /** Окно подтверждения: { title, text, ok, cancel } -> Promise<boolean>; Esc и «Отмена» — false, фокус сначала на «Отмена». */
  function confirm({ title, text, ok, cancel }) {
    const cancelButton = h(doc, 'button', { type: 'button', class: 'confirm-cancel', text: cancel });
    const okButton = h(doc, 'button', { type: 'button', class: 'confirm-ok danger', text: ok });
    const dialog = dialogShell('confirm-title', 'confirm-dialog',
      h(doc, 'h3', { id: 'confirm-title', text: title }),
      h(doc, 'p', { class: 'confirm-text', text }),
      h(doc, 'div', { class: 'actions' }, cancelButton, okButton));
    const layer = pushLayer(dialog, { cancelValue: false, scrimClose: true });
    cancelButton.addEventListener('click', () => layer.close(false));
    okButton.addEventListener('click', () => layer.close(true));
    cancelButton.focus();
    return layer.promise;
  }

  async function removeProject(project) {
    const r = await api.remove(project.id);
    if (!r.ok) { onNotice(t('projects.delete_failed', { reason: r.error }), 'error'); return false; }
    onNotice(t('projects.deleted', { project: project.name }), 'info');
    onChanged();
    return true;
  }

  // Both choices are preferences. This dialog only reads Git; it never opens a session.
  async function pickWorkspace({ folder, worktree = true, sourceBranch = '', preparation = false }) {
    const source = h(doc, 'select', { id: 'workspace-source', 'aria-label': 'Исходная ветка', disabled: true });
    const place = h(doc, 'select', { id: 'workspace-place', 'aria-label': 'Рабочая папка', disabled: true },
      h(doc, 'option', { value: 'folder', text: 'Папка проекта' }),
      h(doc, 'option', { value: 'tree', text: 'Отдельная папка (Git worktree)' }));
    place.value = worktree ? 'tree' : 'folder';
    const info = h(doc, 'p', { class: 'muted', text: folder ? 'Проверяем Git…' : 'Без проекта: исходной ветки и рабочей копии нет.' });
    const save = h(doc, 'button', { type: 'button', class: 'primary', text: 'Сохранить выбор', disabled: true });
    const cancel = h(doc, 'button', { type: 'button', text: 'Отмена' });
    const dialog = dialogShell('workspace-title', 'project',
      h(doc, 'h3', { id: 'workspace-title', text: 'Исходная ветка и рабочая папка' }),
      h(doc, 'label', { class: 'field' }, h(doc, 'span', { text: 'Исходная ветка' }), source),
      h(doc, 'label', { class: 'field' }, h(doc, 'span', { text: 'Рабочая папка' }), place), info,
      preparation ? h(doc, 'p', { class: 'plate', text: 'Подготовка задачи: выбор сохраняется для будущего исполнения. Ветки и рабочие копии сейчас не создаются.' }) : false,
      h(doc, 'div', { class: 'actions' }, cancel, save));
    const layer = pushLayer(dialog, { cancelValue: null, scrimClose: true });
    cancel.addEventListener('click', () => layer.close());
    save.addEventListener('click', () => layer.close({ worktree: place.value === 'tree', sourceBranch: source.value }));
    cancel.focus();
    if (folder) {
      const r = await api.fsGit(folder);
      if (layers.includes(layer)) {
        if (!r.ok || !r.isRepo) {
          info.textContent = !r.ok ? r.error : 'В папке проекта нет Git: исходной ветки и отдельной Git-копии нет.';
        } else {
          source.replaceChildren(h(doc, 'option', { value: '', text: 'По умолчанию (origin/main, main или текущая)' }),
            ...(r.sources || []).map(ref => h(doc, 'option', { value: ref, text: ref.replace(/^refs\/(heads|remotes)\//, '') })));
          source.value = sourceBranch;
          if (source.value !== sourceBranch) source.value = '';
          place.disabled = false;
          const paint = () => {
            source.disabled = place.value !== 'tree';
            const start = source.value.replace(/^refs\/(heads|remotes)\//, '');
            const current = r.branch && r.branch !== 'HEAD' ? `на ветке «${r.branch}»` : 'на текущем коммите без ветки';
            info.textContent = place.value === 'folder'
              ? `Агент будет работать прямо в папке проекта ${current}. Выбор исходной ветки здесь не применяется.`
              : `При первом запуске Canopus создаст отдельную рабочую папку. ${source.value ? `Возьмёт файлы из «${start}».` : 'Возьмёт файлы из origin/main, а если её нет — из main или текущей ветки.'} Ветка задачи появится при действии «В работу».`;
          };
          place.addEventListener('change', paint);
          source.addEventListener('change', paint);
          paint();
          save.disabled = false;
        }
      }
    }
    return layer.promise;
  }

  return { openEditor, createByFolder, confirm, removeProject, pickFolder, editEnv, pickWorkspace, openCount: () => layers.length };
}
