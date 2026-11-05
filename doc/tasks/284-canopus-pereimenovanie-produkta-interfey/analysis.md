# Ведомость переименования CrewHarness → Canopus (задача 284)

База: HEAD `211161e24440f3553883f4f41a8263b3c47a109b` (= origin/main `47655385` + patch `9587aa40`, 145 путей,
protected JSON не менялся; plugin subtree `f080257398b70666a6d196dea39123d85af49117`). Счётчики — `git grep` на этой базе.

## Правила замены (порядок важен, длинные первыми)

| # | Старое | Новое | Тип |
|---|---|---|---|
| 1 | `OPENCODE_CREW_X` | `OPENCODE_CANOPUS_X` | env |
| 2 | `CREW_HARNESS_X` / `CREW_HARNESS` | `CANOPUS_X` / `CANOPUS` | env |
| 3 | `CREW_X` | `CANOPUS_X` | env |
| 4 | `crew_harness` | `canopus` | модуль Nova, пакет, фасад, пути |
| 5 | `crew-harness` | `canopus` | package name, serverInfo, ящик, URLs, [[bin]] |
| 6 | `CrewHarness` | `Canopus` | идентификаторы, заголовки |
| 7 | `crewharness` | `canopus` | строчные склейки |
| 8 | `crew_hub` / `crew-hub` | `canopus_hub` / `canopus-hub` | модуль/бинарник хаба |
| 9 | `crew_x` | `canopus_x` | инструменты, модули, файлы |
| 10 | `crewXxx` / `CrewXxx` | `canopusXxx` / `CanopusXxx` | camelCase идентификаторы |
| 11 | `Crew` (отдельное слово, `Crew-`) | `Canopus` | заголовки панелей/групп TUI |
| 12 | `/crew` | `/canopus` | slash-команды |

Отдельное слово `crew` (строчное) в прозе — термин методики (бригада окон), не бренд: не переименовывается
(решение исполнителя, 2026-11-01: задание переименовывает продукт и интерфейсы, не понятие методики).

## Счётчики на базе (активные области, без истории)

| Область | Файлов с брендом | Совпадений crew-harness/crew_harness/crewharness |
|---|---|---|
| opencode-plugin/ | 152 | 866 |
| scripts/ | 21 | 63 |
| src/ (Nova product) | 197 | 560 |
| doc/canon/ | 11 | 36 |
| README.md + AGENTS.md (корень) | 2 | — |
| tools/stt/manifest.json | 1 | 1 |
| **История — НЕ трогаем:** doc/tasks (552), doc/archive (2), doc/research (6) | 560 | 1642 |
| spikes/ — исследовательские репродукции, решение: не переименовывать (как doc/research) | 11 | 27 |

Уникальных env-имён `CREW_*`/`OPENCODE_CREW_*` в активном коде: 135. Уникальных токенов `crew_*`: 52.

## Интерфейсы (сверено с исходником на базе)

- Плагин, `makeTools` в `opencode-plugin/core.ts` (строки 2113–3969): ровно 15 инструментов `crew_*` →
  `canopus_*` (list, role, send, question, wait, spawn, task, config, inbox, doctor, branch_note, step_note,
  watch, timer, help). Фасад `crew_harness` → `canopus`; `serverInfo.name` в `opencode-plugin/mcp.ts:91`
  `crew-harness` → `canopus`; фасад — не 16-й инструмент.
- Nova product: `crew_tools*` (инструменты crew_progress_line, crew_log_line, crew_usage_line, crew_task_list →
  canopus_*), `crew_task*`, `crew_journal*`, `ask_mcp` (CREW_TASK_TOOL/CREW_TASK_LIST_TOOL), внутренний
  `crew_marker` (crew_task_hub.nv) → canopus_marker, не публичный.
- Модули/бинарники: `src/crew_harness.nv` → `src/canopus.nv` (module crew_harness.crew_harness → canopus.canopus),
  `src/crew_hub.nv` → `src/canopus_hub.nv`; nova.toml `[package] name = "crew_harness"` → canopus,
  `[[bin]]` crew-harness/crew-hub → canopus/canopus-hub (запись ведётся, Oracle 0.1.0 секцию не читает —
  сверено с комментарием в nova.toml; сборка `nova build src/<file>.nv`).
- Настройки: `.opencode/crew-harness.json` → `.opencode/canopus.json`; загрузчики: opencode-plugin/settings.ts
  (SETTINGS_FILE и 7 мест), config-diverge.ts, core.ts, form-auto.ts, profile-cmd.ts + тесты/гольдены.
- Ящик плагина: `paths.ts` CANOPUS_DIR = "canopus" ($XDG_DATA_HOME/opencode/crew-harness →
  .../opencode/canopus); перенос существующего ящика — явный migrateBase (см. раздел «Поправки по адресным AC»).
- package.json плагина: name crew-harness → canopus; repository url → github.com/unitcraft/canopus
  (публичный URL нового repo — до switch gate только в коде, фактический переименование repo отдельно).

## Потребители и проверки

| Потребитель | Проверка |
|---|---|
| OpenCode plugin API (makeTools/TUI/MCP) | npm test (полный зарегистрированный набор + pretest), сверка списка инструментов до/после |
| Nova product (сервер/хаб/фронт) | `nova test src --jobs 4 --timeout 600` + `--strict-effects` через очередь машины |
| Скрипты/стражи/CI | run-all.sh, самотесты, check-wiring (новый страж check-no-legacy-name) |
| Старые env/вызовы | отказ с новым именем, без исполнения — негативные проверки в тестах |
| Внешние клиенты (пусковые файлы владельца, регистрации OpenCode) | закрытый switch manifest, отдельный owner gate |

## Файлы с брендом в имени (активные, к переименованию)

~170 файлов: opencode-plugin/test/crew-*.test.mjs (~155), scripts/crew-answer.mjs, src/crew_harness.nv,
src/crew_hub.nv, src/server/crew_{tools,task,journal}*.nv (12), src/server_crew_live/ (папка + файл),
src/web/crew-task*.js (2), src/web/test/crew-*.test.mjs (2), .opencode/crew-harness.json.
Исторические имена файлов в doc/archive, doc/research, doc/tasks — сохраняются.


## Поправки по адресным AC интегратора (письма 1793565985953/1793566463019, подтверждение 2026-11-02 00:12)

1. **paths.ts: alias/fallback убран.** Никаких junction: LEGACY_DIRS = [прежнее имя продукта, opencode-peers,
   nova-peers]; canopusBase() только читает: есть новый — возвращает (рядом прежний — отказ «разберите
   вручную»); есть только прежний — понятный отказ-блокер с указанием migrateBase и задачи 284, новый пустой
   ящик НЕ создаётся; новая установка — просто новое имя. Явный перенос — migrateBase(): живое состояние машины
   владельца (настоящие данные в самом старом имени, остальные — junction) обрабатывается: ссылки снимаются,
   настоящая папка переименовывается; квитанция {from[], to}; два настоящих прежних ящика или ссылка наружу —
   отказ, разбор вручную. Откат — rollbackBase() (canopus возвращается в прежнее имя). Точка входа переноса —
   opencode-plugin/migrate-mailbox.mjs (печатает квитанцию; --rollback). Sentinel-тест — переписанный
   test/canopus-paths.test.mjs (23 проверки: блокер без сайд-эффектов, перенос с данными, откат, живое
   junction-состояние, «оба имени» — без молчаливого выбора).
2. **Отказ по старым env — раньше любых FS-сайд-эффектов.** Из paths.ts убран symlinkSync при импорте; BASE
   вынесен в base.ts (paths.ts чистый, его импортирует migrate-mailbox.mjs); в core.ts top-level mkdirSync
   заменён ленивым ensureBaseDirs() (12 функций-читателей/писателей + писатель canopus_wait); top-level записей
   в графе импорта не осталось (grep по ^mkdirSync/^writeFileSync/^appendFileSync). Проверки — секция 4
   canopus-legacy-env.test.mjs: изолированный XDG, старое env задано — setup() отказывает, папка opencode не
   появилась, чужие значения env не тронуты; old+new вместе — отказ старого, без молчаливого выбора (2d).
   Nova-сторона уже соответствовала: legacy_env_problem() — первый вызов main в canopus.nv и canopus_hub.nv.
