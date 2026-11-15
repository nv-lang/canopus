2026-10-29 03:50 документ: задание заведено плагином: «Пример chat переехать в пакет nova-alula как examples/chat/ »; task/message.md — шаблон из полей задачи; основа — main 0651f2c3

2026-10-29 04:00 документ: исполнение начато по заданию интегратора (`task/message.md`). Работа — в пакете nova-alula: дерево `nova-alula-251`, ветка `task/251-chat-example` от `origin/main` пакета 2a8960a (метка v0.27.0; локальная `main` пакета отстаёт, не трогалась). Программа — `alula 0.27.0 (Алула 0.27)`, готовая сборка опубликованного пакета. Продукт только читается: `machines/product/` (chat), `src/chat/`.

2026-10-29 04:00 документ: **красная проба (первый коммит пакета 20e3410):** критерий `scripts/accept-251.sh` пакета на 2a8960a (`ALULA_PRODUCT_MACHINES=machines/product` продукта, `ACCEPT_251_SKIP_NOVA_TEST=1`) — красный, 9 красных:

```
КРАСНО: examples/chat/chat.alula.md: нет файла
КРАСНО: examples/chat/chat.alula.json: нет файла
КРАСНО: examples/chat/libs/call_cancel.alula.md: нет файла
КРАСНО: examples/chat/journal.md: нет файла
КРАСНО: examples/chat/README.md: нет файла
КРАСНО: examples/chat/tests: проверок chat-*.alula.test.json 0, нужно 39
КРАСНО: alula test examples/chat: «не прочитано», нужно 39 из 39
КРАСНО: alula test examples: «66 66», нужно 105 из 105 (66 и 39 chat)
КРАСНО: examples/chat не равен chat продукта
НЕ ПРИНЯТО 251 (9 красных): alula 0.27.0 (Алула 0.27); examples/chat ?; examples 66 66; продукт 81 81; nova test пропущен
```

Что проверяет критерий: версия 0.27.0; состав `examples/chat/` (таблица с шапкой `alula_version: 0.27`, дерево, библиотека, журнал, README, ровно 39 проверок); нет ссылок на продукт (номер задачи, `src/`, «продукт»/«product», имя продукта, «на Нове»); README называет демо-машину и пять исходов; `alula compile` таблицы; `alula test examples/chat` 39/39 и `alula test examples` 105/105; с `ALULA_PRODUCT_MACHINES` — 39 проверок побайтно равны продуктовым, таблица от «## Типы» и дерево равны продуктовым, кроме хеша библиотеки и `title`, продукт 81/81; `nova test` шести папок пакета, что встраивают `examples/journal.md` и списки `examples/` (`alula_cli`, `alula_eq`, `alula_tests`, `machine_nested_run`, `machine_run`, `machine_table`); стражи пакета.

2026-10-29 04:02 документ: сделано в пакете. 270b965 — `examples/chat/`: `chat.alula.md` (проза: «Демо-машина: одна беседа пользователя с агентом», без `src/chat` и «задача 240»), `chat.alula.json` (рукописное дерево; `title` без `src/chat`), `libs/call_cancel.alula.md` (проза: «Библиотека примера», без «задача 240», «как и машина на Нове», «чат и диалог» → «чат»; хеш библиотеки считается по всему файлу, стал `d0e4938fe0ed` — в подключении таблицы и в `includes` дерева), `journal.md` (7 кодов чата), `README.md` (демо-машина: одна беседа с агентом; ожидание, ответ, отказ, отмена, таймаут; файлы; запуск), 39 проверок `tests/chat-*.alula.test.json` побайтно как в продукте. ff0fff5 — вне `examples/chat/`, данные и тексты, не код: 7 кодов чата в `examples/journal.md` (программа берёт журнал хозяина только из папки, которую ей дали: без них `alula test examples` — 66 из 105, «the code user_message is in neither of the journal tables»), счёт в README (105 тестов, 51 код) и строка `ChatSession` в таблице примеров. Вопрос интегратору о выходе за границу — письмо 03:54, рекомендация «да»; ответа на момент записи нет, коммит отдельный — снимается одним `git revert`, если ответ «нет». Тесты Nova пакета подпапку не видят (`only_ending` в `src/examples/data.nv` отсекает пути с «/», `tests` — только `examples/tests`), код пакета не менялся.

2026-10-29 04:02 документ: быстрый прогон критерия на ff0fff5 без `nova test` — `ПРИНЯТО 251: alula 0.27.0 (Алула 0.27); examples/chat 39 39; examples 105 105; продукт 81 81; nova test пропущен`. Полный (с `nova test` шести папок) — через очередь машины.

2026-10-29 04:05 документ: план по `src/chat/chat.nv` продукта (для интегратора, удалений в этой задаче нет). Не удалять вслепую: (1) модуль держит и `dialog_session` (рукописная машина `dialog` на Нове, `multi: true`) — её берут `server/dialog_test`, `server/alula_test`, `machine_dialog_eq`; (2) `ChatSession` — демо-машина движка в тестах `acp_live/e2e_test`, `pgstore/engine_test`, `storage/files_engine_test`, `server/*`; (3) рабочий код продукта его не импортирует, только тесты (8 модулей). Рекомендация: оставить `chat.nv` рукописной сверкой (`machine_chat/equal_test`: таблица = машина на Нове), пока `chat` и `dialog` лежат в `machines/product/`; удаление — отдельной задачей после 0.28: тесты движка и хранилищ переводятся на машины-данные (`alula.machine_run`), сверка `chat` — на `examples/chat` пакета или снимается, `dialog_session` уходит вместе с `dialog` на Нове.

2026-10-29 04:08 документ: интегратор (письма 04:07 и 04:08, ответ на вопрос 03:54) одобрил ff0fff5: 7 кодов чата в `examples/journal.md` и README 105/105 остаются, код пакета не трогается; критерий 4 — «alula test examples целиком зелёный». Сверх одобренного `examples/README.md` в ff0fff5 — те же числа в `README.md` пакета, `src/alula_cli/README.md`, `src/machine/README.md` (только текст; интегратору сказано письмом 04:07). Дерево `nova-alula-245` по письму интегратора 03:51 (дошло после работы) переключено на ветку `task/251-examples-chat` = ff0fff5 — те же три коммита поверх origin/main 2a8960a; ветка `task/245-alula-2-27-p2` осталась на 2a8960a.

2026-10-29 04:13 документ: Результат тестов, не остановка на воротах владельца. Полный прогон критерия на ff0fff5 (`ALULA_PRODUCT_MACHINES=machines/product`, `nova test` шести папок по одной, `--jobs 2`; очередь машины, 10 мин) — ПРИНЯТО:

```
ПРИНЯТО 251: alula 0.27.0 (Алула 0.27); examples/chat 39 39; examples 105 105; продукт 81 81; nova test 6 из 6
```

Стражи пакета (`scripts/guards/run-all.sh`) — ок 4, FAIL 0; стражи продукта `check-private-names.py` и `guard-secrets.py --tree` с `--root` дерева пакета — ок. Пуша пакета не было (только по слову владельца, 0.28 целиком).
