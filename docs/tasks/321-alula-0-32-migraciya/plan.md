Статус: утверждено
# 321 — переход на Алулу 0.32

Слово владельца, 2026-11-20, текущий чат: «по рекомендации» на ревью-сообщение — приёмка миграции
малым путём и коммит; пуш и лайв — по отдельным словам.

Слово владельца, 2026-11-20, текущий чат: «продолжай» — подтверждение предложения открыть миграцию
0.31→0.32 отдельной задачей малым путём (принятая 319 не расширяется). Основание передачи: слово
владельца «Канопус сам переводит» (делегированное письмо сессии пакета Алула, 2026-11-20): опубликован
тег v0.32.0 пакета nv-lang/nova-alula (main 706f235), Канопус мигрирует себя сам.

Малый путь: затронутые тесты + стражи, одно ревью-сообщение, ждать «принять»; пуш и обновление лайва —
только по отдельному слову владельца. Базлайн 0.31 (коммит 7ea0f356) и собранный кит 319
(target/319-release-7ea0f356 дерева 319) сохраняются до зелёного 0.32.

Смена места (Канон 6а): окно перешло из основной копии (main) в дерево .worktrees/321, ветка
task/321-alula-0-32 от origin/main 7ea0f356; причина — исполнитель работает в дереве своей задачи;
разрешил владелец словом «продолжай» 2026-11-20 (открытие задачи 321). В основной копии правок нет.

## Объём (инвентаризация 2026-11-20)

Ломающее изменение 0.32 (AL-160, docs/tasks/032-tree-type-words.md пакета): в дереве `machine/2` слова
типов — слова Новы `str`/`f64` вместо `text`/`float`; узлы, ключи провода и 13 сигнатур не меняются;
текст файлов не меняется (слова файла уже `строка`/`str`, `вещественное`/`f64`). Шов 2.25 сохраняет
`text`/`float` (версионная выдача). Сверка объявленного инструмента с реестром нормализует
`str≡text`, `f64≡float` — это делает пакет; своих сравнений слов типов с реестром у Канопуса нет
(grep по machine-модулям пуст). Читатель пакета принимает оба словаря, но версия 0.31 отвергается
с подсказкой `tools/migrate-alula-232.py`.

Что правится:
1. nova.toml: версия 0.31.0→0.32.0 + комментарий истории 0.32; nova.lock.toml — `nova update alula`
   (pin 0.32.0, commit тега 706f235). `ALULA_VERSION` загрузчика импортируется из пакета — поднимается сам.
2. machines/product/ (chat/dialog/work-mode/family-approval .md+.json, libs/call_cancel.alula.md,
   README.md) — скрипт пакета `tools/migrate-alula-232.py --alula <alula 0.32>`: шапка 0.31→0.32,
   хеши подключений библиотек (шапка входит в хеш), деревья — пересборка. Дерево dialog регенерируется
   через Canopus-API `translate_checked_with` (product_registry + translation_files), как в 319:
   border_test/table_test требуют текстового равенства report.json == committed, CLI и API дают разные
   derived reads (AL-138). Временный probe src/probe321.nv — не коммитится.
3. Литералы версии в src-тестах: alula_eq_machines/v212,v213,v217_test.nv; machine_dialog/table_test.nv;
   product_machines/disk_test.nv (0.31→0.32; «старая» версия отказа остаётся 0.27).
4. Проза: machines/README.md (format/пакет + абзац истории миграций), src/server/README.md:367
   (engine 0.31→0.32), machine_table_machines/support_test.nv:28 (комментарий «tree of 0.31»).

Вне объёма:
- Inline-фикстуры шва 2.25 (machine_table_machines/support_test.nv:41, machine_text_render_machines/
  v213_test.nv:10) — шов сохраняет прежние слова text/float, миграция их не касается; проверяется тестами.
- Selftest-фикстуры стражей — самосогласованы, версия берётся из lock динамически (как в 319).
- marker_test.nv «since 0.28» — историческая отметка.
- Установленный лайв (0.28) и кит 319 — не трогаются; замена лайва — отдельное слово владельца
  (ожидается решение: ставить 0.31 сейчас или один раз newest green после 321).

## План

1. Поднять nova.toml, `nova update alula` (env кита Oracle 0.1.6). Программа alula 0.32 — готовый
   target/alula.exe пакета (печатает `alula 0.32.0`), чужой репозиторий только читается.
2. `migrate-alula-232.py --dry-run` по machines/ (ожидание: 9 файлов, мест 0), затем боевой прогон
   с --alula; дерево dialog — регенерация probe321 через translate_checked_with; повторный dry-run —
   «файлов 0, мест 0».
3. Литералы версии в src-тестах и прозе.
4. Доказательство: `alula test machines/product` (84 сценария); затронутые src-наборы (alula_eq_machines,
   machine_dialog, machine_table_machines, machine_text_render_machines, machine_run_machines,
   product_machines, machines); стражи дерева. Красный до/зелёный после не требуется — миграция формата;
   критерий — затронутые наборы зелёные на 0.32.
5. Ревью-сообщение владельцу, ждать «принять». Коммит/пуш/лайв — по словам владельца.

## Результат (2026-11-20)

Перенос выполнен, доказательства зелёные:
- nova.toml 0.32.0 + комментарий истории AL-160; nova.lock.toml — pin `version:>=0.32.0, <0.33.0`,
  version 0.32.0, commit 706f2352c12e314919a837bbf54154d53b8a74f5 (тег v0.32.0).
- Мигратор 232: dry-run 9 файлов/мест 0; боевой прогон 9 файлов/мест 0 (target/321-migrate.log);
  повторный dry-run — файлов 0, мест 0. Новый хеш библиотеки «Отмена запроса» — 6bef98b024ee
  (сверен lib_hash скрипта 226 и шапками chat/dialog .md).
- Деревья: dialog регенерирован API-переводом translate_checked_with (временный src/probe321.nv,
  собран и удалён; артефакт target/probe321.exe gitignored); рукописные chat/work-mode/family-approval
  восстановлены из HEAD и поправлены точечно (версия, хеш, слова типов str/f64; имя инструмента `text`
  и имена данных не тронуты) — CLI-пересборка мигратора плющила рукописную форму, как и в 319.
- Адаптация тестов к словам типов дерева (обнаружено прогоном, класс миграции):
  machine_dialog/border_test.nv (3 фрагмента `type:text`→`str`), machine_table_machines/load_test.nv
  (spec_text result == "str", 5 фрагментов типов), machine_table_machines/check_test.nv (фрагмент
  `"result": "text"`→`"str"`), product_machines/disk_test.nv (ожидаемый хеш в ошибке 1fb52565681d→
  6bef98b024ee). Inline-фикстуры шва 2.25 сохранены (пакет выдаёт их прежними словами) — наборы зелёные.
- Ловушка item-32 при сборке probe: `.join`/Path last-wins лечится порядком импортов программы
  (std.fs перед std.text и модулями продукта) — подтверждено spikes/env/README.md, задача 108.
- Проза: machines/README.md (format 0.32/пакет 0.32.0 + абзац истории 321), src/server/README.md
  (engine 0.32), machine_table_machines/support_test.nv (комментарий «tree of 0.32»).
- Строки статуса планов: check-task-docs требовал «Статус: …» первой строкой; план 319 закоммичен без
  неё (страж на нём красный) — добавлено «Статус: утверждено» (владелец принял 319 2026-11-19),
  плану 321 — «Статус: черновик» (после приёмки — «утверждено»).

Доказательства (журналы target/321-*.log дерева 321):
- `alula check` chat/dialog/work-mode/family-approval — RC=0 каждый; `alula test machines/product`
  программой 0.32.0 — **84 of 84**, RC=0.
- 13 затронутых src-наборов (alula_cli_machines, alula_eq_machines, alula_tests_machines, machine_chat,
  machine_dialog, machine_registry, machine_run_machines, machine_table_machines,
  machine_text_eq_machines, machine_text_machines, machine_text_render_machines, machines,
  product_machines) — PASS:1 FAIL:0, RC=0 каждый (красные после первого прогона machine_dialog,
  machine_table_machines, product_machines исправлены адаптацией тестов выше и перепрогнаны).
- Стражи дерева `sh scripts/guards/run-all.sh` — **ок 12, FAIL 0** (включая check-release-kit.py:
  10 файлов машин продукта, версия берётся из lock динамически).

Кит и лайв не тронуты: кит 319 (target/319-release-7ea0f356 дерева 319) и лайв 0.28 остаются;
решение о последовательности замены лайва — за владельцем.