const variants = {
  claude: ['01 — Тёплая мастерская', 'Claude Code: спокойная навигация, читабельный ответ, отдельный контекст.', '01 / Читаемость и спокойствие · тёплый фон · самостоятельная область разговора'],
  codex: ['02 — Графитовый пульт', 'Codex: плоская рабочая область, компактные сессии, результаты на первом плане.', '02 / Рабочая плотность · графит · результаты рядом с диалогом'],
  studio: ['03 — Светлая студия', 'Сочетание: навигационная лента, просторный диалог и лёгкий инспектор.', '03 / Чёткая иерархия · белый холст · контрастная навигация'],
};
const key = new URLSearchParams(location.search).get('design');
const selected = Object.hasOwn(variants, key) ? key : 'claude';
document.documentElement.dataset.design = selected;
const [title, note, detail] = variants[selected];
document.getElementById('concept-title').textContent = title;
document.getElementById('concept-note').textContent = note;
document.getElementById('concept-detail').textContent = detail;
