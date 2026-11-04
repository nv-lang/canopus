# 283. Результат: sweep размещения обработчиков эффектов

Статус: исполнен. Дата: 2026-11-04. Ветка: codex/283-handler-sweep → ff в codex/268-ui-completion (020107a3).

## Что сделано

Три параллельных субагента с непересекающимися наборами файлов прошёл 128 мест per-call обёрток `with X = real_x()` в продукте.

**Снято 22** (эффект уже в сигнатуре объемлющей функции или добавлен в неё): hub.nv 7 (args/cwd/create_dir_all/pg_list/catalog_load/preset_family_of), projects 4 (result_repos_list, last_dir_load, list_folders, existing_ancestor), storage 3 (open_data_dir, list_sessions, migrate_flat_sessions), workspace_kit 2, wip_kit 1, front 3 (ws/stt detach-тела), observer_env 2.

**Оставлено ~92 с пометкой `// D454: …`** — обоснованные границы: экспортные адаптеры, цепочки которых уходят в чужие файлы (taskwt_adapter 21, routes_io 7, preparation_launch 7); замыкания полярис-маршрутов (тип Handler без эффектов — внешняя зависимость); тела handler-литералов (file_journal/file_store/pg_journal/pg_store — сигнатуру операции эффекта не объявить); testkit-моки (граница теста); методы за Link-эффектом.

## Попутно закрыты латентные баги 0.1.2 влитого кода 282

- ro-launder ServerSettings в request_kit.nv и testkit.nv — заменены spread-литералами `ServerSettings { ...base, поле }`.
- `.join` на []str в юните agent_source_kit — семейство item 32 вернулось на 0.1.2: `import std.fs` первым импортом первого файла юнита, помечено ORACLE-WORKAROUND(32) заново.

## Проверки

- Сборка обеих программ Nova 0.1.2 — чисто.
- Юниты зелёные: projects, storage, model_metadata_tests (3/3), server (agent_source_kit, front/agent_catalog), acp, product_machines.
- pgstore/engine_test — требует тестовую PostgreSQL (src/pg/testdb.ps1); среда, не следствие sweep.
- Узкий экран 360 (F-06) на живом 8100 — PASS ×4 (клэмп меню, 217 строк моделей, 135 слайдеров усилия, поиск в вьюпорте); пробник — [narrow360-cdp.mjs](narrow360-cdp.mjs) (свой headless Edge, порт CDP 19331).

## Канон

Правило записано в [doc/canon/nova-conventions.md](../../canon/nova-conventions.md) (владелец языка 2026-11-01, D61/D431/D454); коммит 8fefd65d.
