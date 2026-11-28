// work-phrase.js — вращающаяся фраза на спиннере работы агента (вместо «Агент работает»).
// Смена каждые 5.7 с; следующая фраза случайна, но не повторяет последние 20.
// Трансформация — «тихий перебор»: глифы приглушены, буквы защёлкиваются слева направо
// с цветной вспышкой (палитра вращается по кругу). Ширина фразы при смене плавно
// переезжает к длине итогового текста (1.2 с) — таймер рядом доезжает вместе с ней;
// содержимое перебора живёт внутри текущей ширины и обрезается ею (см. .work-phrase в app.css),
// поэтому на секундомер не вылезает.

import { h } from './dom.js';

const PHRASES = [
  'Синхронизация узлов', 'Синхронизация потоков', 'Балансировка нагрузки', 'Выравнивание векторов',
  'Конвергенция данных', 'Стабилизация контекста', 'Калибровка параметров', 'Сжатие семантики',
  'Декодирование интенций', 'Согласование состояний', 'Нормализация сигналов', 'Считывание сигнатур',
  'Сбор энтропии', 'Просчёт вариантов', 'Моделирование исходов', 'Формирование поля смысла',
  'На орбите задачи', 'В гиперпотоке', 'Сканирование горизонтов', 'Навигация по данным',
  'Построение маршрута', 'Пересечение слоёв', 'Фаза согласования', 'Резонанс выводов',
  'Гармонизация результатов', 'Выход на расчётную траекторию', 'Вычисление траектории',
  'В поле вероятностей', 'Квантовая обработка', 'Анализ аномалий',
  'Настраиваем рабочий контур', 'Входим в рабочий контур', 'Стабилизируем траекторию',
  'Выходим на операционную орбиту', 'Синхронизируем опорные точки', 'Прокладываем оптимальный маршрут',
  'Прокладываем логический маршрут', 'Набираем расчётную скорость', 'Фиксируем целевые координаты',
  'Активируем рабочий протокол', 'Запускаем вычислительный цикл', 'Связываем контекстные слои',
  'Калибруем целевую метрику', 'Сводим параметры в единый вектор', 'Формируем рабочий профиль',
  'Удерживаем расчётный режим', 'Переходим к основной фазе', 'Согласуем внутренние состояния',
  'Выравниваем вычислительные потоки', 'Входим в расчётный режим', 'Стабилизируем рабочие потоки',
  'Выстраиваем вычислительную траекторию', 'Фиксируем опорные параметры', 'Сканируем входные данные',
  'Оцениваем приоритетные направления', 'Удерживаем расчётную точность', 'Подтверждаем готовность к этапу',
  'Нормализуем входные сигналы', 'Конвергируем рабочие состояния', 'Декодируем смысловые слои',
  'Агрегируем ключевые признаки', 'Строим семантическую карту', 'Находим оптимальный путь',
  'Определяем расчётные координаты', 'Закрепляем рабочую ось', 'Балансируем контекстные векторы',
];
const GLYPHS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ01<>/\\|=+*#%$@';
// вспышка защёлкнутой буквы: [цвет, свечение]; палитра вращается от фразы к фразе
const ACCENTS = [
  ['#d9c2ff', '#b58cffaa'], // фиолетовый
  ['#a8f0ff', '#37c8e8aa'], // циан
  ['#b8ffc4', '#35d95caa'], // зелёный
  ['#ffd9a0', '#e8a33caa'], // янтарь
  ['#ffb8f0', '#e055c0aa'], // маджента
];
const PERIOD_MS = 9000; // владелец, 2026-11-16: «Смена каждые 9 с»
const STEP_MS = 26;     // сдвиг волны между буквами
const HOLD_MS = 420;    // пауза до начала защёлкивания
const NO_REPEAT = 20;   // владелец, 2026-11-16: «без повторов в последних 20 вариантах»

let hostDoc = null;
let current = PHRASES[0];
const recent = [];
let accentIdx = 0;
let measurer = null;
const busy = new WeakSet();

function nextPhrase() {
  let p;
  do { p = PHRASES[Math.floor(Math.random() * PHRASES.length)]; } while (recent.includes(p));
  recent.push(p);
  if (recent.length > NO_REPEAT) recent.shift();
  return p;
}

// замер по скрытому клону с копией свойств шрифта по отдельности —
// сокращённый computed 'font' в части браузеров бывает пустым
function measure(text, sample) {
  if (measurer === null) {
    if (!hostDoc.body) return 0;
    measurer = hostDoc.createElement('span');
    measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0';
    hostDoc.body.appendChild(measurer);
  }
  const cs = hostDoc.defaultView.getComputedStyle(sample);
  const ms = measurer.style;
  ms.fontFamily = cs.fontFamily;
  ms.fontSize = cs.fontSize;
  ms.fontWeight = cs.fontWeight;
  ms.fontStyle = cs.fontStyle;
  ms.letterSpacing = cs.letterSpacing;
  ms.fontVariantLigatures = cs.fontVariantLigatures;
  measurer.textContent = text;
  return measurer.getBoundingClientRect().width;
}

function setWidth(node, text) {
  node.style.width = (measure(text, node) + 2) + 'px'; // +2px запаса, чтобы хвост не резался
}

// тихий перебор: глифы приглушены до 35% и почти не мигают, буквы защёлкиваются волной
function transform(node, text, litColor, glow) {
  if (busy.has(node)) return;
  busy.add(node);
  const N = text.length;
  setWidth(node, text); // ширина сразу целится в итоговую — таймер рядом едет с ней (CSS transition)
  node.replaceChildren();
  const revealed = new Array(N).fill(false);
  const slots = [];
  for (let i = 0; i < N; i++) {
    const s = h(hostDoc, 'span', { class: 'ch', text: text[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)] });
    s.style.opacity = '0.35';
    node.appendChild(s);
    slots.push(s);
  }
  const start = performance.now();
  const timer = setInterval(() => {
    const t = performance.now() - start;
    let done = true;
    for (let i = 0; i < N; i++) {
      if (!revealed[i] && t >= HOLD_MS + i * STEP_MS) {
        revealed[i] = true;
        slots[i].textContent = text[i];
        slots[i].style.opacity = '1';
        slots[i].style.color = litColor;
        slots[i].style.textShadow = '0 0 9px ' + glow;
        setTimeout(() => { slots[i].style.color = ''; slots[i].style.textShadow = ''; }, 300);
      }
      if (!revealed[i]) {
        done = false;
        if (Math.random() < 0.5) slots[i].textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
    }
    if (done) { clearInterval(timer); busy.delete(node); }
  }, 60);
}

function tick() {
  current = nextPhrase();
  const [litColor, glow] = ACCENTS[accentIdx++ % ACCENTS.length];
  for (const node of hostDoc.querySelectorAll('.work-phrase')) transform(node, current, litColor, glow);
}

/** Идущая фраза settles в новый узел без анимации; тик докрутит при следующей смене. */
export function workPhraseNode(doc) {
  if (hostDoc === null) {
    hostDoc = doc;
    setInterval(tick, PERIOD_MS);
  }
  const node = h(doc, 'span', { class: 'work-phrase' });
  for (const ch of current) node.appendChild(h(doc, 'span', { class: 'ch', text: ch }));
  // Замер ширины — только после вставки узла в документ: отсоединённый узел отвечает
  // шрифтом по умолчанию, ширина выходит неверной и текст обрезается.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (node.isConnected) setWidth(node, current); });
  return node;
}
