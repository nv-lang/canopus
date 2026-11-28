# Возможные переименования каталогов документации и входных материалов

Владелец согласовал `doc/` → `docs/` и `task/` → `input/` для всех проектов.
Реализация и применение миграции ещё не выполнены.
Эта заметка содержит предварительную оценку исполнителя.
Исполнитель не менял пути, настройки и код.

Источник: владелец, 2026-11-28, текущий чат: «doc/tasks - никогда не нравился, мне кажется должно быть docs/tasks»; «task/ - предложу рассмотреть input/».
Интегратор, 2026-11-28, сообщение `thr_wa737qrwf7` в текущем чате: «Переименования doc/→docs/ и task/→input/ НЕ делать и в конвенцию не вносить».

Последующее решение: владелец, 2026-11-28, текущий чат:

> со всем согласен
> `doc/` → `docs/` - мигрировать все проекты
> input/ вместо task/ - мигрировать все проекты

Это решение согласует оба переименования и охват всех проектов.
Порядок обновления живой системы остаётся по [AGENTS.md](../../AGENTS.md).

## Масштаб

Исполнитель проверил отслеживаемые файлы ветки `draft/task-folder-convention` после коммита `7c9b52a`.
В `doc/` находятся 2329 файлов.
Из них 2240 файлов находятся в `doc/tasks/`.
Входной файл `task/message.md` есть в 247 каталогах задач.
Поиск текста `doc/` нашёл 111 файлов вне `doc/`.
Поиск текста `doc/tasks` нашёл 73 файла вне `doc/`.
Поиск текста `task/message.md` нашёл 35 файлов вне `doc/`.
Числа описывают совпадения текста, а не полный перечень зависимостей.
Код также собирает пути из отдельных компонентов.

## Затронутые места

| Область | Файлы и каталоги | Что потребуется проверить при отдельной реализации |
|---|---|---|
| Настройки и значения по умолчанию | [configuration.md](../canon/configuration.md), [task-numbers.ts](../../opencode-plugin/task-numbers.ts), [shared-task-config.ts](../../opencode-plugin/shared-task-config.ts), [config-schema.ts](../../opencode-plugin/config-schema.ts), [resolved-policy.ts](../../opencode-plugin/resolved-policy.ts) | Изменение `tasks_dir` проекта отличается от изменения умолчания для всех проектов. Нужны сохранение явных настроек и проверка пустого значения. |
| Генератор задания и нумерация | [task-folders.ts](../../opencode-plugin/task-folders.ts), [task-number.mjs](../../scripts/task-number.mjs), [task-numbers.ts](../../opencode-plugin/task-numbers.ts) | Создание `input/message.md`, чтение из веток, сообщения об ошибках, начальный коммит и копирование вложений. |
| Хранилище и снимки | [tasks.ts](../../opencode-plugin/tasks.ts), [shared-task-snapshot.ts](../../opencode-plugin/shared-task-snapshot.ts), [task-store.mjs](../../scripts/task-store.mjs) | Записанные пути `folder`, пути при отзыве дополнений, исключение приватных файлов, перенос бинарных вложений без изменения содержимого. |
| Хаб: создание и публикация задач | [child_hub.nv](../../src/server/child_hub.nv), [child.nv](../../src/server/child.nv), [routes_hub.nv](../../src/server/routes_hub.nv), [taskwt_adapter.nv](../../src/server/taskwt_adapter.nv), [wip_hub.nv](../../src/server/wip_hub.nv) | Прямые `doc/tasks`, выдача номера, таблица детей, подготовка дерева, фильтры изменений и коммиты документов. |
| Читатели задания и интерфейс | [routes.nv](../../src/server/routes.nv), [canopus_task.nv](../../src/server/canopus_task.nv), [canopus_tools.nv](../../src/server/canopus_tools.nv), [preparation-agent.mjs](../../src/server/preparation-agent.mjs), [routes.js](../../src/web/routes.js) | Пути `message.N.md`, изображения и другие вложения, подсказки агента, показ задания и подготовка постановки. |
| Журналы и плагин | [journal.ts](../../opencode-plugin/journal.ts), [progress-scan.ts](../../opencode-plugin/progress-scan.ts), [branch-guard.ts](../../opencode-plugin/branch-guard.ts), [core.ts](../../opencode-plugin/core.ts), [canopus_journal_hub.nv](../../src/server/canopus_journal_hub.nv) | Обнаружение папок, запись журналов, подсказки и проверки принадлежности файлов задаче. |
| Стражи | [check-task-docs.py](../../scripts/guards/check-task-docs.py), [check-open-questions.py](../../scripts/guards/check-open-questions.py), [check-no-status-table.py](../../scripts/guards/check-no-status-table.py), [check-no-legacy-name.py](../../scripts/guards/check-no-legacy-name.py), [check-md-links.py](../../scripts/guards/check-md-links.py) | `tasks_dir`, шаблоны `task/message.md` и `task/children.md`, адреса Канона, границы исторических документов и корректность ссылок после переноса. |
| Исключения Git | [`.gitignore`](../../.gitignore), [tasks.ts](../../opencode-plugin/tasks.ts), [shared-task-snapshot.ts](../../opencode-plugin/shared-task-snapshot.ts) | Согласование прежних масок `task/*.json`, корневых служебных JSON и генерируемых правил исключения. Маска не должна скрыть входные документы. |
| Перенос данных | [migrate-task-layout.py](../../scripts/migrate-task-layout.py), [migrate-task-storage.py](../../scripts/migrate-task-storage.py) | Новая операция с отчётом, резервной копией, проверкой конфликтов и повторного запуска. Имеющиеся скрипты не считаются готовым решением для этих переименований. |
| Документация и промпты | [AGENTS.md](../../AGENTS.md), [README.md](../../README.md), [Канон](../canon/README.md), [README задач](../tasks/README.md), [маршруты](../routes/README.md), [README плагина](../../opencode-plugin/README.md) | Относительные ссылки, примеры путей, входной файл Канона и ссылки из кода. Для внешних ссылок и исторических цитат нужно отдельное правило перехода. |
| Проверки и образцы | [тесты плагина](../../opencode-plugin/test/README.md), [самотесты стражей](../../scripts/guards/selftest/stlib.py), [test-configured-task-dir.py](../../scripts/test-configured-task-dir.py), [test-migrate-task-layout.py](../../scripts/test-migrate-task-layout.py), [taskwt_test.nv](../../src/server/taskwt_test.nv), [routes_test.nv](../../src/server/routes_test.nv), [preparation-agent.test.mjs](../../src/server/preparation-agent.test.mjs) | Новая раскладка, явный иной `tasks_dir`, прежние записи, приватное состояние, вложения и ссылки. |

## Варианты и оценка

Оценки ниже включают реализацию, перенос данных и проверку исполнителем.
Они не включают ожидание решения владельца и независимую приёмку.

| Вариант | Предварительная оценка | Причина |
|---|---|---|
| Только каталог задач проекта `docs/tasks` через `tasks_dir` | 1–2 рабочих дня | Настройка уже существует, но хаб содержит прямые `doc/tasks`. Потребуется явный перенос активных данных. |
| Весь `doc/` → `docs/` | 2–4 рабочих дня | Затронуты Канон, задачи, исследования, ссылки и примеры вне каталога документации. |
| Входной `task/` → `input/` | 2–4 рабочих дня | Имя встроено в генераторы, читатели, стражи, снимки и подготовку задания. |
| Оба переименования совместно | 4–7 рабочих дней | Нужен единый переход путей без потери вложений и приватного состояния. Часть проверок общая. |

Владелец выбрал перенос всего `doc/` после этой оценки.
Вариант переноса только задач оставлен в таблице как рассмотренная альтернатива.
Исполнитель рекомендует реализовать оба выбранных переименования одним согласованным переходом данных.
Причина — один перенос активных задач и одна проверка сохранности путей.

## Условия готовности отдельной реализации

1. Исполнитель составляет опись активных задач, вложений и записанных путей.
2. Исполнитель проверяет переход на копии данных с контрольными суммами файлов.
3. Исполнитель доказывает, что приватное состояние отсутствует в снимке Git.
4. Исполнитель проверяет полный набор тестов каждой затронутой части.
5. Интегратор получает согласие владельца до изменения живой системы.
6. Владелец выполняет необходимый перезапуск по [AGENTS.md](../../AGENTS.md).

Исполнитель не должен заменять все вхождения `task/` механически.
Ветки вида `task/NNN-slug` и термин задачи не являются именем входного каталога.
Для чужих репозиториев исполнитель готовит предложения по [AGENTS.md](../../AGENTS.md).
