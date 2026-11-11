// Строка статуса под полем (задача 192): семья, режим и модель с усилием — одна группа чипов, в этом порядке; у каждой подпись для чтения с экрана.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

test('группа status-group: семья отдельно, модель·усилие рядом; права перед моделью', () => {
  const group = view.match(/const statusGroup = h\(doc, 'div', \{ class: 'status-group' \}, ([^)]*)\);/);
  assert.ok(group, 'группа есть');
  const names = group[1].split(',').map((x) => x.trim());
  assert.deepEqual(names, ['agentAnchor']);
  assert.doesNotMatch(group[1], /\b(?:modeButton|modelButton|effortButton)\b/);
  assert.doesNotMatch(view, /familyApprovals\.root/);
  assert.match(view, /const agentAnchor = h\(doc, 'div', \{ class: 'agent-picker-anchor' \}, familyButton, effortButton, menu\)/);
  const row = view.match(/const status = h\(doc, 'div', \{ class: 'composer-status', [^}]*\}, ([^;]*)\);/);
  assert.match(row[1], /presetSelect/);
  assert.doesNotMatch(row[1], /\b(?:routeButton|modeButton|statusGroup|modelButton|effortButton)\b/);
  // Макет 268 (new-chat.png): режим, семья, модель и усилие — одной строкой внутри карточки композера.
  const bar = view.match(/const boxBar = h\(doc, 'div', \{ class: 'box-bar', 'data-empty': 'true' \},\s*([^;]*?)\);/);
  assert.ok(bar, 'нижняя панель композера есть');
  assert.match(bar[1], /^plusButton, routeButton, taskRouteLabel, h\(doc, 'span', \{ class: 'grow' \}\), modeButton, statusGroup, modelButton,\s*h\(doc, 'div', \{ class: 'box-row' \}, micWrap, cancelButton, sendButton\)$/);
  assert.match(view, /const box = h\(doc, 'div', \{ class: 'box' \}, attach\.row, input, recPanel\)/);
  assert.match(view, /box\.append\(boxBar\);/);
  assert.match(view, /boxBar\.dataset\.empty = /);
});

test('у каждого чипа title и aria-label; группа прижата вправо, на узком экране переносится влево', () => {
  for (const name of ['familyButton', 'modeButton', 'modelButton', 'effortButton']) {
    const line = view.split('\n').find((l) => l.includes(`const ${name} = h(doc, 'button'`));
    assert.match(line, /title: t\('(status\.agent|menu\.agent_permissions|status\.model|menu\.effort)'\), 'aria-label': t\('(status\.agent|menu\.agent_permissions|status\.model|menu\.effort)'\)/, name);
  }
  assert.match(css, /\.status-group \{[^}]*margin-left: auto/);
  assert.match(css, /@media \(max-width: 760px\)[^\r\n]*\.status-group \{ margin-left: 0/);
});

test('модель и усилие — два независимых чипа; разделитель «·» лежит вне подложки чипа', () => {
  assert.match(view, /effortButton\.addEventListener\('click', \(\) => toggleMenu\('effort'\)\)/);
  assert.match(view, /modelButton\.addEventListener\('click', \(\) => toggleMenu\('model'\)\)/);
  assert.match(css, /\.status-group > :not\(\[hidden\]\) ~ :not\(\[hidden\]\)::before \{[^}]*position: absolute; left: -/);
});
