# Отчёт задачи 254

## Причина красных

Две разные причины:

1. **pgdb / pgstore / server_pg** — тестам нужна база PostgreSQL, её на машине нет; тесты падали «no test database». Пропуск по образцу live-тестов отсутствовал.
2. **server_live (12/14)** — не среда, а дефект кода: задача 240 перевела отмену на сигнал протокола `cancel_request` (хаб шлёт `Incoming.signal("cancel_request", "")`, `src/server/hub.nv`), а проекция страницы `page_input_of` в `src/acp/project.nv` по-прежнему ждала имя `"cancel"` — строка отмены странице не уходила, сценарии «the cancel is shown» в `src/server/testkit.nv` падали. Маскировало поиск: вывод юнита обрезан до 600 символов, список красных виден только с `NOVA_DEBUG_RUN_DUMP=1`.

## Исправление

- `src/pgdb/testkit.nv` — `test_db_present` (свежая проверка `target/pg-test.json`, не кеш) и `db_or_skip`: нет базы — одна строка «skipped: no test database …» и тест проходит; сообщение всегда говорит, чего не хватает и как поднять базу (по образцу `src/acp_live/real_agent_test.nv` / `CREW_REAL_ACP`). Опечатка в `needs_test_db` попутно исправлена.
- Гард `if !db_or_skip() { return }` первой строкой во всех тестах с базой: pgdb (23), pgstore (9), server_pg (12); тест конфигурации без базы оставлен без пропуска.
- `src/acp/project.nv` — имя сигнала в проекции `cancel` → `cancel_request`; регрессионный тест в `src/acp/project_test.nv`.
- `src/pg/README.md` — политика: пропуск при отсутствии базы — норма, сообщение обязано говорить, что нужно.

## Прогоны

- Красная проба (на main, до правок): 4 папки красные — записана в log.md (первый коммит ветки).
- После правок: пять целевых папок (pgdb, pgstore, server_pg, server_live, acp) — PASS 5 FAIL 0 без базы.
- Ребейз на main 6b7be5e0 (пульт, слои конфигов): один конфликт в `src/acp/project.nv` (обработчики задачи 192 рядом со строкой cancel) — разрешён объединением; дефект отмены на новом main подтверждён, фикс нужен.
- Продукт: `alula test machines/product` (alula 0.27.0) — 81 of 81.
- `nova test src` весь набор: PASS 27 / FAIL 6; все шесть красных — следствия задачи 192 на самом main, не из diff задачи 254: `crew_hub` (хаб в тесте не находит machines/product), `server_live/hub_test` (сценарии 192: картинки, переменные проекта, состояния; сценарии отмены — зелёные), таймауты ~900 с у server_crew_live, server_route_live, server_wip_live, server_wip_slow_live. Доказательство атрибуции: базовый прогон тех же шести юнитов на чистом `origin/main 6b7be5e0` (helper-дерево crew-harness-254-main-probe, удалено после прогона) — те же 6 красных, PASS 0 / FAIL 6.
