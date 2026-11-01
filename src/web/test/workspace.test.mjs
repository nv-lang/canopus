import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDocument, event, settle } from './fake-dom.mjs';
import { createProjectsUi } from '../projects-ui.js';
import { addDraft, initialModel, patchDraft } from '../state.js';
import { parseRouteState, whereText } from '../routes.js';

function setup(git) {
  const doc = createFakeDocument();
  const calls = [];
  const ui = createProjectsUi(doc, { api: { async fsGit(path) { calls.push(path); return git; } }, onChanged() {}, onNotice() {} });
  return { doc, ui, calls, q: selector => doc.body.querySelector(selector) };
}

test('workspace: source and folder are independent read-only preferences in one dialog', async () => {
  const s = setup({ ok: true, isRepo: true, branch: 'main', sources: ['refs/heads/main', 'refs/heads/chosen'] });
  const done = s.ui.pickWorkspace({ folder: 'C:/work/project', sourceBranch: 'refs/heads/chosen', worktree: true, preparation: true });
  await settle();
  const source = s.q('select[aria-label="Исходная ветка"]');
  const place = s.q('select[aria-label="Рабочая папка"]');
  assert.equal(source.value, 'refs/heads/chosen');
  assert.equal(source.disabled, false);
  assert.match(s.doc.body.textContent, /не новый clone/);
  assert.match(s.doc.body.textContent, /Подготовка задачи/);
  place.value = 'folder';
  place.dispatchEvent(event('change'));
  assert.equal(source.disabled, true);
  assert.match(s.doc.body.textContent, /ветка не переключается/);
  s.q('.primary').click();
  assert.deepEqual(await done, { worktree: false, sourceBranch: 'refs/heads/chosen' });
  assert.deepEqual(s.calls, ['C:/work/project']);
});

test('workspace: projectless/no-git never offer a fictional branch or a writable choice', async () => {
  for (const folder of ['', 'C:/work/notes']) {
    const s = setup({ ok: true, isRepo: false, branch: '' });
    const done = s.ui.pickWorkspace({ folder });
    await settle();
    assert.equal(s.q('.primary').disabled, true);
    assert.equal(s.q('select').children.length, 0);
    assert.equal(s.calls.length, folder ? 1 : 0);
    s.q('.actions button').click();
    assert.equal(await done, null);
  }
});

test('workspace: changing project drops only its source preference, not draft content', () => {
  let m = addDraft(initialModel(), { id: 'd', agent: 'opencode', projectId: 'p', folder: '/p', now: 1 });
  m = patchDraft(m, 'd', { sourceBranch: 'refs/heads/chosen', input: 'draft words', images: ['attachment'] });
  m = patchDraft(m, 'd', { projectId: 'q', folder: '/q' });
  assert.equal(m.sessions.d.sourceBranch, '');
  assert.equal(m.sessions.d.input, 'draft words');
  assert.deepEqual(m.sessions.d.images, ['attachment']);
  assert.equal(parseRouteState({ source_branch: 'refs/heads/chosen' }).sourceBranch, 'refs/heads/chosen');
  assert.match(whereText({ draft: true, projectId: '' }), /Без проекта/);
  assert.match(whereText({ draft: true, route: 'planning', worktree: true }), /не создаются/);
});
