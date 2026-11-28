# Задание: причины ожидания (waitingOn) в списке сессий

- Что хотел владелец: «делай в суб-потоке малый путь» (владелец, 2026-11-27, чат оркестратора) — кандидат A отчёта `doc/research/2026-11-26-canopus-antipatterns.md` (рекомендация 2: закрытый словарь причин ожидания, как waitingOn у bb, и его показ в списке сессий).
- T = ~1,5 часа; ветка `task/322-waitingon-prichiny-ozhidaniya` от `origin/main` в рабочем дереве треда исполнителя (причина смены ветки — это слово владельца).
- Сделано: словарь `src/server/waiting.nv` (коды question/permission/busy/silent → дословные русские строки), поле `waiting_reason` в событии `session_list_status` (`hub.nv`), показ в строке списка (`src/web/state.js`, `app.js`, `view.js`). Проверено: `waiting_test.nv` (красный тест словаря: пустых строк нет), риг-сценарий `scenario_waiting_reason` в `src/server_live/hub_test.nv`, тест страницы в `src/web/test/attention.test.mjs`.

Принято, когда: названные тесты зелёные; приёмка — слово владельца на тестовом контуре.
