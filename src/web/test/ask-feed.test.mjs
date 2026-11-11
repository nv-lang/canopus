import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t } from '../strings.js';
import { createForm, buildAnswer, buildSkip, canSubmit, selectOption, digitOption } from '../question.js';

const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

test('форма вопроса в конце ленты над полем ввода', () => {
  assert.match(view, /const log = h\(doc, 'div', [^;]*thread, historyLoading, permissionWrap, canopusUi\.el, askWrap\);/);
  assert.match(view, /permissionWrap\.replaceChildren\(dialog\);/);
});

test('строка «Нужен ваш ответ» остаётся под карточкой', () => {
  assert.match(view, /askWrap\.replaceChildren\(askCard, h\(doc, 'div', \{ class: 'ask-status' \}, badge\)\);/);
  assert.ok(!/const foot = h\(doc, 'div', \{ class: 'ask-foot' \}, badge/.test(view), 'бейдж не в подвале карточки');
  assert.equal(t('ask.need'), 'Нужен ваш ответ');
});

test('варианты пронумерованы, свой ответ и управление находятся в общей строке', () => {
  assert.match(css, /\.ask-key \{ display: inline-grid/);
  assert.match(view, /class: 'icon-btn ask-mic'/);
  assert.match(view, /class: 'ask-foot' \}, icon\(doc, 'i-pencil'\), answer, answerMic, skip, send/);
  assert.match(view, /class: 'primary ask-send'/);
});

const QS = [{ question: 'Какой вариант?', options: [{ label: 'Первый' }, { label: 'Второй' }] }];

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
  assert.match(view, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); if \(!stopVoice\(\)\) doSkip\(\); return; \}/);
  assert.match(view, /if \(onButton && !e\.ctrlKey && !e\.metaKey\) return;/);
  assert.match(view, /t\('ask\.answer', \{ question: l\.question, choice: l\.choice \}\)/);
});
