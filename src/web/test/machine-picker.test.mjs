import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../view.js';
import { addDraft, initialModel, patchDraft } from '../state.js';
import { makeProject } from '../projects.js';
import { createFakeDocument } from './fake-dom.mjs';

test('338: пикер рядом с моделью, проектное умолчание и смена машины со статусом', () => {
  const doc = createFakeDocument();
  const refs = Object.fromEntries(['app', 'side', 'main', 'rail', 'status', 'overlay'].map(key => [key, doc.createElement('div')]));
  doc.body.append(...Object.values(refs));
  let machines = [
    { id: 'local', host: '127.0.0.1', port: 39329, status: 'online', last_contact: 1700000000000 },
    { id: 'project-host', host: '192.0.2.1', port: 39329, status: 'offline', last_contact: null },
  ];
  const project = makeProject({ id: 'project', name: 'Проект', default_daemon: 'project-host',
    machine_sources: { local: '/work/local', 'project-host': '/work/project' } });
  let model = addDraft(initialModel(), { id: 'draft', agent: 'opencode', projectId: project.id, now: 1 });
  const draw = () => view.render(model, { selected: 'draft', projects: [project], pins: {} }, { state: 'connected' });
  const view = createView(doc, refs, { agents: [{ id: 'opencode' }], now: () => 1, daemonMachines: () => machines, handlers: {
    queued: () => 0, queuedItems: () => [],
    onDraftDaemon(id, daemonId) { model = patchDraft(model, id, { daemonId }); draw(); },
  } });

  draw();
  const picker = refs.main.querySelector('.box-bar .daemon-picker');
  assert.ok(picker);
  assert.ok(refs.main.querySelector('.box-bar .agent-picker-button'));
  assert.match(picker.textContent, /project-host/);
  assert.equal(picker.dataset.status, 'offline');
  assert.match(picker.title, /Недоступна/);
  assert.match(refs.main.querySelector('.daemon-picker-warning').textContent, /не на связи/);
  picker.click();
  const rows = refs.main.querySelectorAll('[data-kind="daemon"] .menu-item');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dataset.status, 'online');
  assert.equal(rows[0].disabled, false);
  assert.match(rows[0].textContent, /local.*127\.0\.0\.1:39329.*На связи.*Последний контакт/);
  assert.equal(rows[1].getAttribute('aria-checked'), 'true');
  assert.equal(rows[1].dataset.status, 'offline');
  assert.equal(rows[1].disabled, false);
  rows[0].click();
  assert.equal(model.sessions.draft.daemonId, 'local');
  assert.match(picker.textContent, /local/);
  assert.equal(picker.dataset.status, 'online');

  picker.click();
  machines = machines.map(machine => ({ ...machine, status: 'offline' }));
  draw();
  assert.equal(refs.main.querySelector('[data-kind="daemon"] .menu-item').dataset.status, 'offline');
  assert.equal(picker.dataset.status, 'offline');
});


test('338: machine picker disables a machine without a project source', () => {
  const doc = createFakeDocument();
  const refs = Object.fromEntries(['app', 'side', 'main', 'rail', 'status', 'overlay'].map(key => [key, doc.createElement('div')]));
  doc.body.append(...Object.values(refs));
  const project = makeProject({ id: 'project', name: 'Project', default_daemon: 'selectel',
    machine_sources: { local: '/work/project' } });
  const model = addDraft(initialModel(), { id: 'draft', agent: 'opencode', projectId: project.id, now: 1 });
  const view = createView(doc, refs, { agents: [{ id: 'opencode' }], now: () => 1,
    daemonMachines: () => [{ id: 'selectel', status: 'online' }, { id: 'local', status: 'online' }],
    handlers: { queued: () => 0, queuedItems: () => [] },
  });
  view.render(model, { selected: 'draft', projects: [project], pins: {} }, { state: 'connected' });
  const picker = refs.main.querySelector('.daemon-picker');
  assert.match(picker.textContent, /local/);
  picker.click();
  const [remote, local] = refs.main.querySelectorAll('[data-kind="daemon"] .menu-item');
  assert.equal(remote.disabled, true);
  assert.equal(remote.dataset.status, 'offline');
  assert.match(remote.textContent, /нет рабочей папки/);
  assert.equal(local.disabled, false);
});
