# Офлайн-конвертация прежних профилей

`scripts/convert-model-presets.py` принимает явный JSON-файл и явную таблицу соответствий ACP. Живые настройки для проверки не использовались.

```text
python scripts/convert-model-presets.py source.json --mapping mapping.json --default-weight medium
```

Это dry-run: выводятся SHA256 исходных байтов, число готовых пресетов и причины unresolved, без содержимого настроек. Файлы не создаются. `--default-weight` — явное решение для прежних клеток `tier: task`; без него такая клетка остаётся unresolved. Вес не переводится в уровень пула или effort.

Таблица mapping — JSON-массив точных соответствий, например:

```json
[
  {
    "family": "example",
    "model": "provider/model-id",
    "variant": "native-variant",
    "source": {"family": "example", "model": "acp-model-id", "effort": "acp-effort-id"}
  }
]
```

Provider/model и variant не угадываются по имени семьи или весу. Дубли mapping запрещены. Значения ACP должен подтвердить каталог конкретного агента; конвертер сам провайдеров не запускает.

Только при отсутствии unresolved можно добавить `--write-new-directory new-presets`. Каталог должен отсутствовать, его родитель должен существовать. Создаются только новые JSON-файлы; повтор с тем же каталогом отказывается без изменения файлов. Активации или копирования в действующий каталог пресетов нет.

Чистый план сохраняет исходные provider/model/variant и context/output/input в `preserved.profiles`, клетки и aliases — в `preserved.sets`, прежний активный набор — в `preserved.profile_set`. Эти значения не печатаются в публичный отчёт. **Наличие context/output/input даёт unresolved:** новый runtime не применяет их эквивалентно; metadata не выдаётся за миграцию поведения, активируемый файл не создаётся. Соответствие окон ACP пока не реализовано, флага игнорирования нет.

Для полностью разрешённого входа без окон исходные профили сохраняются в `migration.profiles`, явные клетки и alias `accept` — в `migration.stages`, наследование spec от plan и delivery на ступень ниже от develop — в `migration.inheritance`; `migration.was_active` сохраняет прежний выбор без активации. Canonical `develop_accept` вытесняет прежнее `accept`, как у старого читателя; в runtime это роль `dev_accept`. Ограничения tier_min/tier_max применяются после наследования. Неразрешённый spawn_models, неизвестные поля профиля и неоднозначные данные блокируют весь пакет, а не создают частичный активируемый результат. Произвольные поля настроек и учётные данные в metadata не копируются.

Старые Nova-пресеты не являются входом этой конвертации и остаются без изменений. Исходный JSON сохраняется побайтно. Проверка: `python scripts/test-convert-model-presets.py`.
