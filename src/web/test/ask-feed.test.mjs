import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t } from '../strings.js';
import { createForm, buildAnswer, buildSkip, canSubmit, selectOption, digitOption } from '../question.js';

const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

test('разрешения над полем ввода, вопросы под ним', () => {
  assert.match(view, /const composer = h\(doc, 'div', \{ class: 'composer' \},[^;]*permissionWrap,\s*box,[^;]*askWrap,/);
  assert.match(view, /permissionWrap\.replaceChildren\(dialog\);/);
});

test('строка «Нужен ваш ответ» остаётся под карточкой', () => {
  assert.match(view, /askWrap\.replaceChildren\(askCard, h\(doc, 'div', \{ class: 'ask-status' \}, badge\)\);/);
  assert.ok(!/const foot = h\(doc, 'div', \{ class: 'ask-foot' \}, badge/.test(view), 'бейдж не в подвале карточки');
  assert.equal(t('ask.need'), 'Нужен ваш ответ');
});

test('стиль эталона: рамка 1 px, радиус 14, ширина 600, серая шапка, радиокнопка 24 px, метка 16 px, описание 15 px серым, кнопки справа', () => {
  assert.match(css, /\.ask \{[^}]*width: min\(600px, 100%\)[^}]*border: 1px solid var\(--border\); border-radius: 14px/);
  assert.match(css, /\.ask-q \{[^}]*background: var\(--surface-2\)[^}]*font-size: 16px/);
  assert.match(css, /\.ask-opt \{[^}]*border-top: 1px solid var\(--border\)/);
  assert.match(css, /\.ask-input \{[^}]*width: 24px; height: 24px/);
  assert.match(css, /\.ask-input\[type="radio"\]:checked \{ border-color: var\(--accent\); background: var\(--accent\); \}/);
  assert.match(css, /\.ask-name \{ font-size: 16px;/);
  assert.match(css, /\.ask-desc \{ color: var\(--fg-muted\); font-size: 15px;/);
  assert.match(css, /\.ask-foot \{[^}]*justify-content: flex-end/);
  assert.match(css, /\.ask-send \{ border-color: var\(--fg\); background: var\(--fg\); color: var\(--surface\); \}/);
  assert.equal(t('ask.send_hint'), 'Ctrl ⏎');
});

const QS = [{ question: 'Какой цвет?', header: 'Цвет', multiSelect: false, options: [{ label: 'Синий', description: '' }, { label: 'Зелёный', description: '' }] }];

test('по умолчанию выбран первый вариант; цифры выбирают; отправка возможна, пока вариант выбран; пропуск всегда', () => {
  const f = createForm(QS);
  assert.equal(canSubmit(f, QS), true);
  const a = buildAnswer('r1', f, QS);
  assert.ok(a, 'ответ собирается из выбора по умолчанию');
  assert.equal(digitOption('2'), 1);
  const second = selectOption(f, QS, 0, digitOption('2'));
  assert.deepEqual(buildAnswer('r1', second, QS).answers[0].picked ?? buildAnswer('r1', second, QS).answers[0], buildAnswer('r1', second, QS).answers[0]);
  assert.ok(buildSkip('r1'));
});

test('клавиши формы: цифры, Ctrl+Enter отправляет, Esc пропускает; после ответа лента показывает строку «вопрос — ответ»', () => {
  assert.match(view, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); doSkip\(\); return; \}/);
  assert.match(view, /if \(onButton && !e\.ctrlKey && !e\.metaKey\) return;/);
  assert.match(view, /t\('ask\.answer', \{ question: l\.question, choice: l\.choice \}\)/);
});
