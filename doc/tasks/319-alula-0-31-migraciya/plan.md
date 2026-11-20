Статус: утверждено
# 319 — переход на Алулу 0.31

Слово владельца, 2026-11-19, текущий чат: «мигрировать 0.28→0.31, малый путь» — возобновление
задачи после паузы («ждать 0.31»). Пауза снята: тег v0.31.0 пакета nv-lang/nova-alula опубликован
2026-11-19 13:58 UTC (v0.30.0 — 09:12 UTC). Малый путь: затронутые тесты + стражи, одно ревью-сообщение,
ждать «принять»; пуш и обновление лайва — только по слову владельца.

Слово владельца, 2026-11-19, текущий чат (после ревью-сообщения): «продолжай по рекомендации, если не
все» — продолжение по рекомендации малого пути: приёмка ревью и локальный коммит миграции. Пуш и
обновление лайва остаются за отдельным словом владельца (рекомендация их явно резервировала).

Смена места: окно интегратора перешло из дерева 320 в дерево 319 (ветка task/319-alula-030) по этому
слову владельца; причина — возобновление 319, исполнитель работает в дереве своей задачи (Канон 6а).

## Объём (инвентаризация 2026-11-19)

Версия пакета закреплена в nova.toml (`alula = … version = "0.28.0"`) и nova.lock.toml (pin 0.28.0,
commit c040a9b). `ALULA_VERSION` загрузчика src/product_machines/data.nv импортируется из пакета
(alula.machine_table) — поднимается сам с версией пакета, не правится.

Ломающие изменения пакета (скрипты tools/migrate-alula-229/230/231.py, клон v0.31.0 в скретче):
- 0.29 (AL-153…AL-157): шапка alula_version 0.28→0.29, хеши подключений библиотек, деревья
  *.alula.json (пересборка `alula compile`). Ручное место AL-154: равенство необязательного с голым
  значением — сначала `есть(x)`, затем `обязательно(x) == v`; называет проверка компилятора.
- 0.30 (AL-158): секция `## Внешние функции`→`## Инструменты` (англ. `## External functions`→`## Tools`);
  шапка, хеши, деревья. JSON-оп `primitive_call` и Nova-API пакета прежние.
- 0.31 (лямбда в форме Новы, решение владельца 2026-11-19): `x => выр`→`|x| выр`, `(a,b) => выр`→
  `|a,b| выр`; в ячейке таблицы бары `\|x\|`, в блоке кода `|x|`; ветки `выбор`, тела функций, строки,
  комментарии не трогаются; узел дерева lambda {params,body} прежний. Шапка, хеши, деревья.

Что правится:
1. nova.toml: версия 0.28.0→0.31.0 + комментарий истории 0.29/0.30/0.31; nova.lock.toml — `nova update alula`.
2. machines/product/ (10 файлов с alula_version 0.28: chat/dialog/work-mode/family-approval .md+.json,
   libs/call_cancel.alula.md, README.md) — скрипты 229→230→231 с `--alula target/alula.exe`, ручные AL-154.
3. src-тесты, ассертящие строку версии машин с диска (поднять 0.28→0.31 и «старую» версию в тестах отказа):
   alula_eq_machines/v212,v213,v217_test.nv; machine_dialog/table_test.nv; product_machines/disk_test.nv.
4. Проза: machines/README.md (format 0.28/пакет 0.28.0), src/server/README.md (engine 0.28),
   machine_table_machines/support_test.nv:28 (комментарий «tree of 0.28»).
5. Адаптация Canopus к ломающим изменениям API/семантики пакета (обнаружено прогоном затронутых наборов):
   - AL-158 (0.30): поле `MachineDef.primitives`→`tools`, `Registry.primitives`→`tools`, функция
     `find_primitive`→`find_tool`, тип `PrimitiveHost`→`ToolHost` (JSON-ключ деревьев `primitives` и оп
     `primitive_call` прежние). Правки: machines/data_test.nv (import + reg.tools + find_tool),
     machine_dialog/table_test.nv (def.tools, имя теста и комментарий),
     machine_text_render_machines/render_test.nv (комментарий), machine_run_machines/support_test.nv
     (удалён устаревший неиспользуемый импорт PrimitiveHost — тело использует ScriptedHost).
   - AL-153 (0.29): различимый optional на проводе снапшота — присутствующий `{"$some": v}`, отсутствующий
     `null` (в 0.28 присутствующий был голым значением; проверено по тегу v0.28.0 — `$some` там нет).
     Правка: machine_chat/equal_test.nv `code_name` разворачивает `$some` (иначе `Failed|` вместо
     `Failed|StoppedByHuman`). Класс охвачен: другие чтения optional-данных (machine_run_machines)
     ассертят только отсутствующий `null` — не затронуты.
   - Дерево dialog.alula.json регенерируется через Canopus-API перевода `translate_checked_with`
     (product_registry + translation_files), а не через CLI `alula compile`: border_test/table_test
     требуют ТЕКСТОВОГО равенства report.json == committed, а CLI и API дают разные derived reads
     (AL-138) из-за разного контекста реестра. Временный probe src/probe319.nv использован и удалён
     (не коммитится); target/probe319.exe — артефакт сборки (gitignored).
   - Деревья chat/work-mode/family-approval сохранены в pretty-формате HEAD с минимальной правкой
     (версия 0.28→0.31; у chat и dialog хеш подключения 1fb52565681d): загрузчик 0.31 принимает
     опущенный ключ `data` (j_arr_or_empty), same_tree игнорирует ключи с пустым списком;
     text-equality тестов для work-mode/family-approval нет (v213 проверяет только chat/dialog).

Вне объёма:
- Inline-фикстуры формата 2.25 (machine_table_machines/support_test.nv:41, machine_text_render_machines/
  v213_test.nv:10) — seam-деревья, которые пакет сохраняет (комментарий «which the package keeps»);
  миграция 0.28→0.31 их не касается. Проверить тестами: если 0.31 их не читает — отдельный разбор.
- Selftest-фикстуры стражей (stlib.py, test-check-release-kit.py, test-package-release.py) самосогласованы
  на 0.28 (lock+машины одной версии), guard check-release-kit.py берёт версию из lock динамически —
  логика не зависит от версии, не правятся.
- marker_test.nv:2 «since 0.28» — историческая отметка появления признака, не текущая версия.

## План

1. Поднять nova.toml, `nova update alula` (lock 0.31.0 + commit тега). Собрать alula.exe пакета 0.31.0
   (`nova build <клон>/src/alula.nv -o target/alula.exe`, env кита Oracle 0.1.6).
2. Прогнать скрипты 229→230→231 по machines/ с --alula; исправить ручные AL-154 по подсказкам компилятора;
   `--dry-run` в конце — «файлов 0, мест 0».
3. Поднять литералы версии в src-тестах и прозе.
4. Доказательство: `alula test machines/product` (сценарии); сборка Canopus + затронутые src-наборы
   (machine_chat, machine_dialog, machine_registry, *_machines, product_machines, alula_eq_machines);
   страж check-release-kit.py (дерево) + затронутые стражи. Красный до/зелёный после не требуется —
   миграция формата, не дефект; критерий — затронутые наборы зелёные на 0.31.
5. Ревью-сообщение владельцу с diff и номерами наборов; ждать «принять». Пуш/лайв — по слову владельца.

## Результат (2026-11-19)

Diff: 23 файла +68/−53 (+ этот plan.md). Доказательство на 0.31:
- 13 канонических directory-наборов src зелёные (PASS:1 FAIL:0 RC=0 каждый): machines,
  product_machines, alula_eq_machines, alula_tests_machines, alula_cli_machines, machine_chat,
  machine_dialog, machine_registry, machine_run_machines, machine_table_machines,
  machine_text_machines, machine_text_render_machines, machine_text_eq_machines.
- `alula check` машин продукта — ok; `alula test machines/product` — 84 из 84.
- Стражи: check-release-kit — ок (10 файлов машин продукта); guard-secrets --tree — ок (3433);
  check-wiring — ок (27); check-md-links — ок (1496).

Примечание о machine_run_machines: канонический прогон — directory-режим (`nova test src/machine_run_machines`),
весь модуль сливается в один юнит (имя по первому файлу accepts_signal_test), зелёный. Прогон СПИСКОМ
файлов (`nova test run_test.nv v217_test.nv`) компилирует каждый файл отдельным юнитом и падает
CODEGEN-FAIL E_RECV_METHOD_MISMATCH на `parts.join(...)` (support_test.nv:65,83): per-file юнит не несёт
слитый `import std.text`, single-key fallback резолвит `join` в чужой Path (last-wins) — известное
ограничение item 32 (`[]str.join` требует std.text в юните, см. ORACLE-WORKAROUND(32) в alula eval.nv:30).
Это артефакт режима списка, не миграционный дефект: `.join()` и импорты run_test/v217 — неизменный
HEAD-код, правка миграции в модуле — только удаление неиспользуемого PrimitiveHost. Сам пакет 0.31
использует `.join()` повсюду и компилируется в directory-режиме.

Связь: 320+318 (класс отмены пайпов) ждёт починку item 19 в Nova 0.1.7 — независимая работа, ведётся
параллельно; 319 не трогает src/acp/link.nv и src/server/front/front.nv.