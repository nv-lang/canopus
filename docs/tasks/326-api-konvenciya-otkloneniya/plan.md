Статус: утверждено (владелец, 2026-11-27)

# План 326 — отклонения от конвенции API + два фикса

Малый путь: страница канона с таблицей отклонений по §19 конвенции API, два фикса протокола, тесты маршрутов.

## Шаги

1. `doc/canon/api-deviations.md` — таблица «правило → сделано иначе → почему → цена → условие снятия» по
   [конвенции API](https://github.com/unitcraft/engineering-conventions/blob/main/api.md) (ред. 1.1, §19);
   ссылка из `doc/canon/README.md`.
2. Фикс «нет молчаливых исходов»: неизвестный query-параметр на `/api/*` и `/ws` → 400
   `{"error":…, "code":"invalid_parameter"}`. Общая обвязка `strict_query` рядом с таблицей маршрутов
   (`src/server/front/front.nv`, `build_router`); списки допустимых параметров сверены с клиентом `src/web/`
   (`history`, `lang`, `path`, `roots`, `from`, `to`, `mail_at`, `mail_bytes`).
3. Фикс «машинный код ошибки»: поле `code` (snake_case, закрытый набор) во всех JSON-ошибках API
   (`{"error", "code"}`); человеческий текст `error` сохраняется. Места: `front.nv`, `stt.nv`, `projects_api.nv`,
   `images.nv`, `trace_api.nv`.
4. `src/server/README.md`: перечень кодов и правило про неизвестные query-параметры.
5. Тесты: новый `src/server/front/front_routes_test.nv` (неизвестный параметр → 400 с code; ошибка несёт code);
   правка `stt_test.nv` под новый формат. Прогон затронутых юнитов (`src/server/front/*_test.nv`) на Oracle 0.1.6.
6. Коммит(ы) в ветке `task/326-api-konvenciya-otkloneniya`; без push — сдача отчётом.

## Критерии приёмки

Неизвестный query-параметр на любом `/api/*` и `/ws` даёт 400 с `code:"invalid_parameter"`; каждая JSON-ошибка API
несёт машинный код из закрытого набора; клиент `src/web` и тесты не ломаются (параметры, которые они шлют, допустимы);
затронутые тестовые юниты зелёные.
