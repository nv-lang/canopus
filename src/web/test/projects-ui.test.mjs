// Окна проектов на заглушке (?mock=1): создание, выбор папки, переменные, правка, удаление, клавиатура.
// DOM — fake-dom.mjs (без браузера); сеть — настоящий mockFetch из mock.js, так что ответы те же, что видит страница.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDocument, event, key, input as inputEvent, dbl, settle } from './fake-dom.mjs';
import { mockFetch } from '../mock.js';
import { createProjectsApi } from '../projects-api.js';
import { createProjectsUi } from '../projects-ui.js';

function setup(wrap = (api) => api) {
  const doc = createFakeDocument();
  const stored = new Map();
  doc.defaultView = { localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) } };
  const fetchFn = mockFetch(async () => { throw new Error('настоящий fetch не должен вызываться'); });
  const api = createProjectsApi(() => fetchFn);
  const log = { changed: 0, notices: [] };
  const ui = createProjectsUi(doc, {
    api: wrap(api), onChanged: () => { log.changed += 1; }, onNotice: (text, tone) => log.notices.push([text, tone]),
  });
  const layers = () => doc.body.children.filter((n) => n.className.includes('layer'));
  const top = () => layers().at(-1);
  const q = (sel, root = top()) => root.querySelector(sel);
  const textOf = (el) => el.textContent.trim();
  const click = async (el) => { el.click(); await settle(); };
  const type = async (el, value) => { el.value = value; el.dispatchEvent(inputEvent()); await settle(); };
  const submit = async (form) => { form.dispatchEvent(event('submit')); await settle(); };
  const pickItem = (path) => q(`.picker-item[data-path="${path}"]`);
  const enterItem = async (path) => { const item = pickItem(path); item?.click(); item?.dispatchEvent(dbl()); await settle(); };
  return { doc, api, ui, log, stored, layers, top, q, textOf, click, type, submit, pickItem, enterItem };
}

test('«Новый проект»: окно с ролью dialog и подписью, название обязательно', async () => {
  const s = setup();
  const done = s.ui.openEditor();
  await settle();
  const dialog = s.q('.dialog');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  const label = s.q(`#${dialog.getAttribute('aria-labelledby')}`);
  assert.equal(s.textOf(label), 'Новый проект');
  assert.equal(s.doc.activeElement, s.q('#project-name'), 'фокус на названии');
  assert.equal(s.textOf(s.q('.proj-env')), 'Переменные окружения' + 'Нет для этого проекта');
  await s.submit(s.q('form'));
  assert.equal(s.q('.field-error').hidden, false, 'без названия — ошибка');
  assert.equal(s.log.changed, 0);
  s.doc.dispatchEvent(key('Escape'));
  assert.equal(await done, null);
  assert.equal(s.layers().length, 0);
});

test('создание проекта: выбор папки, ветка из git, Worktree, переменные, сохранение', async () => {
  const s = setup();
  const done = s.ui.openEditor();
  await settle();
  await s.type(s.q('#project-name'), '  Мой сайт ');

  // ---- выбор папки
  await s.click(s.q('.add-folder'));
  assert.equal(s.layers().length, 2);
  assert.equal(s.top().querySelector('.dialog').getAttribute('aria-labelledby'), 'picker-title');
  assert.deepEqual(s.top().querySelectorAll('.picker-list .picker-item').map(s.textOf), ['C:', 'D:'], 'корни дисков');
  assert.ok(s.q('.picker-recent').querySelectorAll('.picker-item').length === 3, 'недавние');
  assert.equal(s.q('.primary').disabled, true, 'в корне выбрать нечего');
  await s.enterItem('C:/');
  await s.enterItem('C:/work');
  assert.equal(s.q('#picker-path').value, 'C:/work');
  assert.deepEqual(s.top().querySelectorAll('.picker-list .picker-item').map(s.textOf), ['api-server', 'canopus', 'docs-site', 'notes']);
  await s.click(s.pickItem('C:/work/canopus'));
  await s.click(s.q('.primary'));
  assert.equal(s.layers().length, 1, 'окно выбора закрыто');
  assert.equal(s.doc.activeElement.className.includes('add-folder'), true, 'фокус вернулся к кнопке');

  // ---- папка в списке: ветка и Worktree
  let rows = s.q('.proj-folders').querySelectorAll('.proj-folder');
  assert.equal(rows.length, 1);
  assert.match(s.textOf(rows[0]), /canopus/);
  assert.match(s.textOf(s.q('.chip', rows[0])), /main\s*Текущая/);
  const wt = s.q('input[type="checkbox"]', rows[0]);
  assert.equal(wt.disabled, false);
  wt.click();

  // не репозиторий: ветки нет, Worktree недоступен
  await s.click(s.q('.add-folder'));
  await s.type(s.q('#picker-path'), 'c:\\work\\notes');
  await s.submit(s.q('.picker-path-row'));
  assert.equal(s.q('#picker-path').value, 'C:/work/notes');
  await s.click(s.q('.primary'));
  rows = s.q('.proj-folders').querySelectorAll('.proj-folder');
  assert.equal(rows.length, 2);
  assert.match(s.textOf(s.q('.chip', rows[1])), /не репозиторий/);
  assert.equal(s.q('input[type="checkbox"]', rows[1]).disabled, true);

  // повтор той же папки не добавляется
  await s.click(s.q('.add-folder'));
  await s.enterItem('C:/');
  await s.enterItem('C:/work');
  await s.click(s.pickItem('C:/work/notes'));
  await s.click(s.q('.primary'));
  assert.equal(s.q('.proj-folders').querySelectorAll('.proj-folder').length, 2);
  assert.match(s.textOf(s.q('.plate')), /уже есть/);

  // ---- переменные окружения
  await s.click(s.q('.proj-env'));
  assert.equal(s.layers().length, 2);
  assert.match(s.textOf(s.q('p.muted')), /Задаются для сессий, запущенных в проекте Мой сайт/);
  const area = s.q('textarea');
  assert.match(area.getAttribute('placeholder'), /NODE_ENV=production/);
  await s.type(area, 'A=1\nплохая строка');
  assert.equal(s.q('.plate').hidden, false);
  assert.match(s.textOf(s.q('.plate')), /строка 2: нет знака «=»/);
  assert.equal(s.q('.primary').disabled, true, '«Готово» недоступно при ошибке');
  await s.type(area, 'A=1\nB="x\ny"\n# комментарий');
  assert.equal(s.q('.plate').hidden, true);
  assert.equal(s.textOf(s.q('.env-count')), '2 переменные');
  await s.click(s.q('.primary'));
  assert.equal(s.layers().length, 1);
  assert.match(s.textOf(s.q('.proj-env')), /2 переменные/);

  // ---- сохранение
  await s.submit(s.q('form'));
  assert.equal(s.layers().length, 0, 'окно закрылось');
  assert.equal(s.log.changed, 1);
  const id = await done;
  const listed = await s.api.list();
  const mine = listed.projects.find((p) => p.id === id);
  assert.ok(mine, 'проект есть в списке');
  assert.equal(mine.name, 'Мой сайт');
  assert.deepEqual(mine.folders.map((f) => [f.path, f.worktree]), [['C:/work/canopus', true], ['C:/work/notes', false]]);
  assert.deepEqual(mine.envKeys, ['A', 'B'], 'в списке только имена переменных');
  assert.equal(mine.env, '', 'значений в списке нет');
  const full = await s.api.get(id);
  assert.equal(full.project.env, 'A=1\nB="x\ny"\n# комментарий');
});

test('выбор папки: путь руками, «..», ошибка, двойной клик, недавние, Esc', async () => {
  const s = setup();
  const result = s.ui.pickFolder('');
  await settle();
  await s.type(s.q('#picker-path'), 'c:\\work\\api-server\\');
  await s.submit(s.q('.picker-path-row'));
  assert.equal(s.q('#picker-path').value, 'C:/work/api-server');
  assert.equal(s.q('.picker-up').disabled, false);
  await s.click(s.q('.picker-up'));
  assert.equal(s.q('#picker-path').value, 'C:/work');
  await s.type(s.q('#picker-path'), 'C:/work/missing');
  await s.submit(s.q('.picker-path-row'));
  assert.equal(s.q('.plate').hidden, false);
  assert.match(s.textOf(s.q('.plate')), /папка не найдена/);
  assert.equal(s.top().querySelector('.picker-list').dispatchEvent(dbl()), true);
  await settle();
  assert.equal(s.layers().length, 1, 'двойной клик по пустой области не подтверждает папку');
  await s.type(s.q('#picker-path'), 'C:/work');
  await s.click(s.q('.primary'));
  const picked = await result;
  assert.equal(picked, 'C:/work', 'после ошибки можно подтвердить текущую папку');

  const again = s.ui.pickFolder('');
  await settle();
  await s.click(s.q('.picker-recent .picker-item'));
  await s.click(s.q('.primary'));
  assert.equal(await again, 'C:/work/canopus', 'недавнее место выбирается и подтверждается');

  const third = s.ui.pickFolder('C:/work');
  await settle();
  assert.equal(s.q('#picker-path').value, 'C:/work');
  s.doc.dispatchEvent(key('Escape'));
  assert.equal(await third, null);
});

test('выбор папки: поиск фильтрует каталоги текущего реального ответа API', async () => {
  const s = setup();
  const result = s.ui.pickFolder('C:/work');
  await settle();
  const search = s.q('.picker-search');
  await s.type(search, 'crew');
  assert.deepEqual(s.top().querySelectorAll('.picker-list .picker-item').map(s.textOf), ['canopus']);
  await s.click(s.pickItem('C:/work/canopus'));
  await s.click(s.q('.primary'));
  assert.equal(await result, 'C:/work/canopus');
});

test('выбор папки: одиночный выбор не входит, Enter и двойной клик входят, breadcrumb и Назад ведут по истории', async () => {
  const s = setup();
  const result = s.ui.pickFolder('C:/work');
  await settle();
  const selected = s.pickItem('C:/work/canopus');
  await s.click(selected);
  assert.equal(s.q('#picker-path').value, 'C:/work', 'один клик только выделяет каталог');
  assert.equal(s.q('.picker-list').contains(selected), true, 'выделение не удаляет target до dblclick');
  assert.equal(s.pickItem('C:/work/canopus').getAttribute('aria-selected'), 'true');
  s.pickItem('C:/work/canopus').focus();
  s.pickItem('C:/work/canopus').dispatchEvent(key('Enter'));
  await settle();
  assert.equal(s.q('#picker-path').value, 'C:/work/canopus', 'Enter входит в выделенную папку');
  assert.equal(s.q('.picker-back').disabled, false);
  await s.click(s.q('.picker-back'));
  assert.equal(s.q('#picker-path').value, 'C:/work', 'Назад возвращает предыдущий каталог');
  const crumb = s.q('.picker-breadcrumbs').querySelectorAll('.picker-crumb')[0];
  assert.equal(s.textOf(crumb), 'C:/');
  await s.click(crumb);
  assert.equal(s.q('#picker-path').value, 'C:/', 'breadcrumb открывает выбранного предка');
  const again = s.pickItem('C:/work');
  await s.enterItem('C:/work');
  assert.equal(s.q('#picker-path').value, 'C:/work', 'двойной клик входит в каталог');
  assert.ok(again, 'папка была доступна для выделения');
  s.doc.dispatchEvent(key('Escape'));
  assert.equal(await result, null);
});

test('корень: одиночный выбор диска включает подтверждение и проверяется через fsList', async () => {
  const s = setup();
  const result = s.ui.pickFolder('');
  await settle();
  assert.equal(s.q('.primary').disabled, true, 'в корне без выбора подтверждать нельзя');
  const drive = s.pickItem('C:/');
  await s.click(drive);
  assert.equal(s.pickItem('C:/').getAttribute('aria-selected'), 'true');
  assert.equal(s.q('.picker-list').contains(drive), true, 'выделенная запись остаётся в списке до confirm');
  assert.equal(s.q('.primary').disabled, false, 'выбор диска разрешает подтверждение');
  await s.click(s.q('.primary'));
  assert.equal(await result, 'C:/', 'подтверждение перед возвратом проверяет выбранный диск через fsList');
});

test('выбор папки: избранное хранится локально, выбирается отдельно и подтверждается', async () => {
  const s = setup();
  const first = s.ui.pickFolder('C:/work');
  await settle();
  await s.click(s.q('.picker-favorite'));
  assert.deepEqual(JSON.parse(s.stored.get('canopus-folder-picker-favorites-v1')), ['C:/work']);
  s.doc.dispatchEvent(key('Escape'));
  assert.equal(await first, null, 'закрытие не подтверждает путь');

  const second = s.ui.pickFolder('');
  await settle();
  const fav = s.q('.picker-place.is-favorite');
  assert.ok(fav);
  await s.click(fav);
  assert.equal(s.q('#picker-path').value, '', 'клик по избранному только выбирает путь');
  await s.click(s.q('.primary'));
  assert.equal(await second, 'C:/work');
});

test('устаревшее избранное перепроверяется через API и не подтверждается при ошибке', async () => {
  const s = setup();
  s.stored.set('canopus-folder-picker-favorites-v1', JSON.stringify(['C:/missing']));
  const result = s.ui.pickFolder('C:/work');
  await settle();
  await s.click(s.q('.picker-place.is-favorite'));
  await s.click(s.q('.primary'));
  assert.equal(s.layers().length, 1, 'ошибочный путь не закрывает окно');
  assert.match(s.textOf(s.q('.plate')), /папка не найдена/);
  s.doc.dispatchEvent(key('Escape'));
  assert.equal(await result, null);
});

test('Esc закрывает только верхнее окно, Tab ходит по кругу, фокус возвращается', async () => {
  const s = setup();
  const opener = s.doc.createElement('button');
  s.doc.body.append(opener);
  opener.focus();
  const done = s.ui.openEditor();
  await settle();
  await s.click(s.q('.proj-env'));
  assert.equal(s.layers().length, 2);
  s.doc.dispatchEvent(key('Escape'));
  await settle();
  assert.equal(s.layers().length, 1, 'закрылось только подокно');
  assert.equal(s.doc.activeElement, s.q('.proj-env'), 'фокус вернулся на строку переменных');

  const focusables = s.q('.dialog').querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])');
  focusables.at(-1).focus();
  const tab = key('Tab');
  s.doc.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(s.doc.activeElement, focusables[0], 'Tab с последнего — на первый');
  const back = key('Tab', { shiftKey: true });
  s.doc.dispatchEvent(back);
  assert.equal(s.doc.activeElement, focusables.at(-1), 'Shift+Tab с первого — на последний');

  s.doc.dispatchEvent(key('Escape'));
  assert.equal(await done, null);
  assert.equal(s.doc.activeElement, opener, 'фокус вернулся туда, откуда открыли');
});

test('правка проекта: название обязательно, ошибка сервера — красная плашка и открытое подокно .env', async () => {
  const failing = (api) => ({ ...api, update: async () => ({ ok: false, status: 400, error: 'строка 2: кавычка не закрыта' }) });
  const s = setup(failing);
  const done = s.ui.openEditor('proj-docs');
  await settle();
  assert.equal(s.textOf(s.q('#project-title')), 'Изменить проект');
  assert.equal(s.q('#project-name').value, 'docs-site');
  assert.equal(s.q('.proj-folders').querySelectorAll('.proj-folder').length, 2);
  assert.match(s.textOf(s.q('.proj-env')), /Нет для этого проекта/);
  await s.type(s.q('#project-name'), 'docs-site 2');
  await s.submit(s.q('form'));
  assert.equal(s.layers().length, 2, 'ошибка сервера про .env открыла подокно');
  assert.match(s.textOf(s.q('.plate')), /строка 2: кавычка не закрыта/);
  s.doc.dispatchEvent(key('Escape'));
  await settle();
  assert.match(s.textOf(s.q('.plate')), /строка 2: кавычка не закрыта/, 'плашка осталась в окне проекта');
  assert.equal(s.log.changed, 0);
  s.doc.dispatchEvent(key('Escape'));
  assert.equal(await done, null);
});

test('правка проекта сохраняется (PUT) и видна в списке; удаление — сразу, с заметкой', async () => {
  const s = setup();
  const done = s.ui.openEditor('proj-crew');
  await settle();
  assert.match(s.textOf(s.q('.proj-env')), /2 переменные/, 'переменные подтянуты из полного проекта');
  await s.type(s.q('#project-name'), 'canopus-main');
  await s.submit(s.q('form'));
  assert.equal(await done, 'proj-crew');
  assert.equal(s.log.changed, 1);
  const after = (await s.api.list()).projects.find((p) => p.id === 'proj-crew');
  assert.equal(after.name, 'canopus-main');
  assert.equal(after.folders[0].branch, 'main', 'ветка папки сохранилась');

  assert.equal(await s.ui.removeProject(after), true);
  assert.equal(s.log.changed, 2);
  assert.match(s.log.notices.at(-1)[0], /удалён, его сессии остались в группе «Без проекта»/);
  assert.equal(s.log.notices.at(-1)[1], 'info');
  assert.ok(!(await s.api.list()).projects.some((p) => p.id === 'proj-crew'));
  assert.equal(await s.ui.removeProject({ id: 'proj-crew', name: 'x' }), false, 'повторное удаление — ошибка в заметке');
  assert.equal(s.log.notices.at(-1)[1], 'error');
});

test('проект, которого нет: заметка об ошибке, окно не открывается', async () => {
  const s = setup();
  assert.equal(await s.ui.openEditor('нет-такого'), null);
  assert.equal(s.layers().length, 0);
  assert.match(s.log.notices[0][0], /Не удалось открыть проект: проект не найден/);
});

test('выбор папки открывается без пути: сервер отдаёт родителя последней выбранной папки (last), страница показывает то, что пришло', async () => {
  const fs = await import('node:fs');
  const ui = fs.readFileSync(new URL('../projects-ui.js', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../projects-api.js', import.meta.url), 'utf8');
  assert.equal((ui.match(/await pickFolder\(''\)/g) || []).length, 2, 'оба выбора начинают с пустого пути');
  assert.match(ui, /state = \{ \.\.\.state, path: r\.path, parent: r\.parent/);
  assert.match(api, /last: typeof b\.last === 'string' \? normalizePath\(b\.last\) : ''/);
});

test('«Изменить проект»: «Папка деревьев» под списком папок — пусто, имя, путь; подпись, «..» не проходит, значение хранится', async () => {
  const s = setup();
  const done = s.ui.openEditor();
  await settle();
  await s.type(s.q('#project-name'), 'С деревьями');
  const trees = s.q('#project-trees');
  assert.ok(trees, 'поле есть');
  assert.equal(trees.value, '');
  assert.match(s.textOf(s.q('#project-trees-hint')), /рядом с папкой проекта/);
  await s.type(trees, 'worktrees');
  assert.match(s.textOf(s.q('#project-trees-hint')), /«worktrees» рядом с папкой проекта/);
  await s.type(trees, 'C:/work/trees');
  assert.match(s.textOf(s.q('#project-trees-hint')), /C:\/work\/trees/);
  await s.type(trees, '../out');
  await s.submit(s.q('form'));
  assert.equal(s.q('#project-trees-error').hidden, false, '«..» не проходит');
  assert.equal(s.log.changed, 0);
  await s.type(trees, 'worktrees');
  assert.equal(s.q('#project-trees-error').hidden, true);
  await s.submit(s.q('form'));
  const id = await done;
  const full = await s.api.get(id);
  assert.equal(full.project.worktreesDir, 'worktrees');
  // правка: значение возвращается в поле
  const again = s.ui.openEditor(id);
  await settle();
  assert.equal(s.q('#project-trees').value, 'worktrees');
  s.doc.dispatchEvent(key('Escape'));
  await again;
});
