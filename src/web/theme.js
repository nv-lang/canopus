// Применяем сохранённый выбор до первой отрисовки. По умолчанию тема тёмная.
(function applyStoredTheme() {
  var theme = 'dark';
  try {
    if (window.localStorage.getItem('canopus-console-theme') === 'light') theme = 'light';
  } catch (e) {
    // При недоступном хранилище используем тёмную тему.
  }
  document.documentElement.setAttribute('data-theme', theme);
}());
