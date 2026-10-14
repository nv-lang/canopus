# 031 — Опись источников и трассировка С1

Сессия С1, 2026-10-13. Эта опись ведёт доказательства продолжения отдельно от исходного задания. Подробная трассировка к нормативным записям — в таблицах ниже; цитаты владельца и история постановки сохранены дословно в исходном `task/message.md` и дополнены записью в `log.md`.

## Опись источников

Накопленная опись источников спецификации, обновлена С1п3 по независимому spec-review-3.md. Единица — отдельный файл либо текущий входной бриф; ссылка на message 013 и сам файл не удваиваются. Изменяемый вход С1п3 закреплён SHA исходных байтов. Пункты 14/20/21 сохраняют чтение С1п2: в С1п3 они не перечитывались и не объявлены новым фактом полного чтения; их прежний статус не доказательство принятого registry/контракта. Остальные указанные ниже текущие документы прочитаны полностью.

1. `task/message.md` 031 — исходное требование/границы, целиком; SHA-256 `f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d`.
2. Входной `spec.md` 031 — целиком, 675 строк/147987 байт; SHA-256 `998bddacfa13305b69ffe25a1d61f905360b669b9b621c014e3096d823978b3e`, версия С2 захода 3.
3. Входной `spec-trace.md` 031 — целиком, 361 строка/53555 байт; SHA-256 `64605be394d67ae00fde7e008460a06986da9cd66e54600659aeb6adb64deefe`.
4. `spec-review-1.md` — целиком, все 14 существенных/0 поверхностных/5 проб; SHA-256 `83c74c54f08c7fb420b4e8701fe7a9397707c64505a0300a4b411862ef338efe`. Отчёт не правится.
5. Входной `log.md` — целиком, 22 записи/10268 байт, SHA-256 `263ea634d1ea7558a7b167446d41decedb357c71ee18344b4b336c58e36a001e`; далее только append. Решения «Сохранить след (Recommended)» и «До 5 заходов (Recommended)» прочитаны; счёт 3/5/серия 0, не утверждение spec/plan.
6. Входной `progress.log` — целиком, 21 строка/3115 байт, SHA-256 `16693611dff48f5bf89a4bbf93c550828f6c450c0cac253f4534d88bb27e59a1`, включая родительский С1п3 0/2 старт. Старые строки сохранены, старт не дублируется; новые через progress_line, не validation pass.
7. `AGENTS.md` — целиком; отдельное дерево/публичность/индекс/машина.
8. `doc/canon/README.md` — целиком; вход Канона/закрепление/размер.
9. `doc/canon/process.md` — целиком; формат журнала/вопросов/границы ворот.
10. `doc/canon/decisions/README.md` — целиком; реестр/границы применимых ADR.
11. `doc/canon/decisions/ADR-0001-work-by-methodology.md` — целиком; закрепление без копии.
12. `doc/canon/decisions/ADR-0006-public-repository.md` — целиком; публичность.
13. `doc/canon/decisions/ADR-0010-question-answering-modes.md` — целиком; вопросы/запрет автоответа на ворота.
14. `doc/tasks/013-runner-core/spec.md` в доступном дереве задачи 013 — целиком, SHA-256 `f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376`; REQ-24/28…30 совместимость, не возобновление/утверждение. Прежнее заявление про 965 строк не используется как доказательство текущего чтения.
15. `task-algorithm.md` методики — целиком через git show на `f333efa319e445efe029ee6963b477ca8fe3bc1c`, шаги 1–7/границы доказательств.
16. `task-sessions.md` методики — целиком тем же git show; полный промпт «С1 правка», статусы/циклы/REQ/AC/DNC.
17. `task-runner.md` методики — целиком тем же git show, в том числе длинная строка «Проверка (checker)» прочитана отдельно без обрезки; словарь/форматы/совещание/алгоритм/ворота.
18. Бриф С1п3 в диалоге — целиком; две находки, источник увеличения потолка без сброса, две единицы/точные маркеры/остановка для независимой С2 захода 4. Один входной текст, не дополнительный файл.
19. `spec-review-2.md` — целиком, 356 строк; SHA-256 `54aeedc770969cb86a6c0e016d336933128b7bdf36e4eb3b454d0f7d76bbaef1`. Все 5 существенных/0 поверхностных/4 пробы и 14 прежних закрытий прочитаны; отчёт неизменяемый.
20. `doc/tasks/013-runner-core/task/message.md` в доступном дереве 013 — **реально прочитан целиком**, 74 строки, SHA-256 `88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9`. Исходное задание по самостоятельной ссылке 031:40; не пункт 14 spec и не повтор ссылки. Код/план/реализация 013 не читаются/не меняются, пауза сохраняется.
21. `methodology.md` через git show на закреплённом коммите — применимые разделы 2–5, 8–10, 12–13, 18 прочитаны полностью; длинные строки 243/564/712/1571 прочитаны дополнительно без обрезки. Остальные разделы не использованы как новый вход задачи.
22. `README.md` методики — целиком через git show на том же коммите; вход/роли документов, не копия в проекте.
23. `spec-review-3.md` — целиком, 446 строк/37389 байт, SHA-256 `c7a06030423c4b780d2a578c262ff543d7059b46e9f0beb109bf55681ca41bdb`; 2 существенных/0 поверхностных/4 пробы, закрытие прежних 14+5 находок. Отчёт неизменяемый.

итого: 23

## Ограничения описи и отпечатки

Ранние `spec.md/spec-trace.md` предыдущей С1 в текущей правке отдельно не перечитывались: ранняя оценка 44 взята из входного trace, закреплённого SHA выше. Неверные/непроверяемые количества строк ранних версий удалены из действующей описи, не заменены догадкой о том, какую версию читала прежняя сессия. Код/конфиги/runtime и журналы/реализация 013 не читались. Опись не обещает готовый registry или parser.

Git blob IDs прочитанных неизменяемых проектных входов (git hash-object по их байтам):

| Файл | Blob |
|---|---|
| AGENTS.md | `47113c9bb1d199b1389bda700ff008c2cf4846e4` |
| doc/canon/README.md | `9bbf27de766d5482dbdb0f15a5b6162d2e3cc462` |
| doc/canon/process.md | `898c126fc1c37c00f51cf2054cc42498e4daa5a6` |
| doc/canon/decisions/README.md | `1d0506cc5a3825e4eaa064a1b03e0cc4bf2cb3bf` |
| ADR-0001 | `9131ccee6daa75a40f4df4cb0b520e1cc97c521b` |
| ADR-0006 | `e02f96d24746b2f348240ef85b487635aa918087` |
| ADR-0010 | `b17b7c9fd22a0022b7752f38aaca3965d8053c5c` |

Чтение методики выполнено git show по закреплённому коммиту (17-я единица включает всю длинную строку checker). Автоматический управляемый вывод инструмента — не копия методики в проекте/задаче. Накопленный счёт: 22 отдельных файла + один бриф = 23; пункты унаследованного чтения явно отмечены выше. Исторические 18/22 ниже относятся к прежним версиям, не текущему итого описи.

## Дословные входные цитаты и доказательства решений

| Источник | Цитата/фрагмент | Следствие в спецификации |
|---|---|---|
| Владелец, 2026-10-13, чат CrewHarness | «т.е. надо придумать спецификацию этого json под раннер» | предмет С1 — формат данных, не реализация; REQ-01…REQ-04 |
| Ответ владельца на вопрос физического формата предыдущей С1 | «JSONC» | REQ-02/03: комментарии разрешены в файле регламента; нормализованный результат — чистый JSON |
| Ответ владельца интегратору на ворота объёма | «Только формат (Recommended)» | ограничение задачи; REQ-01, DNC-01…05 |
| `task/message.md`, строки 20–26 | «граф фаз», «сессий», «ворот», «переходов и счётчиков»; «Предикаты — в коде, по именам»; исполнение и jump; «обычным JSON» для сценариев | REQ-05…REQ-25; REQ-31…REQ-34; внешние обязательства отдельно отмечены |
| Канон `process.md`, строки 104–108 | S/M/L по количеству REQ, >50 — предложение разбить; размер спецификации и trace | 36 REQ — L (26–50), объём ниже стоп-порога 50; риск высокий |
| Черновик 013, REQ-24 | JSON-сценарий связывает id, REQ/AC/норму, начальное состояние, события и ожидаемое состояние/действия или ошибку | REQ-31…REQ-34: формат сценария совместимый, JSON без комментариев |
| Черновик 013, REQ-28…30 | отдельный будущий контракт внутри 013; версия/hash/утверждение до реализации | только контекст совместимости, не источник обязательной схемы 031; UNKNOWN-06 |

## Покрытие фрагментов входа

| ID | Источник/фрагмент | Смысл | Покрытие |
|---|---|---|---|
| C01 | Владелец 2026-10-13 | придумать JSON для раннера | REQ-01, REQ-02; FACT-01 |
| C02 | Выбор предыдущей С1 | JSONC | REQ-02…REQ-04; FACT-02 |
| C03 | Ответ на ворота объёма | только формат | DNC-01…DNC-05 |
| C04 | 031 task/message.md, цель и строки 20–22 | регламент/паспорт/граф; обязательный дубль repo/commit в шапке и подробные комментарии nodes/edges | REQ-05…REQ-12; обязательность комментариев REQ-05, AC-06; формат сохранён, отказа нет |
| C05 | 031 task/message.md, предикаты | закрытый каталог именованных функций, не expression language | REQ-13…REQ-14 |
| C06 | 031 task/message.md, исполнитель/runtime | step/event, хранение и возобновление — внешний контракт | REQ-27…REQ-30; DNC-02 |
| C07 | 031 task/message.md, jump | только owner, запись, явные сбросы/пропуски — отложенная операция | REQ-29…REQ-30; DNC-02 |
| C08 | 031 task/message.md, JSON-сценарии | обычный JSON для переносимости | REQ-31…REQ-34 |
| C09 | 031 task/message.md, тесты и границы | не менять код/методику/013, не выполнять тяжёлые работы | DNC-01…05 |
| C10 | task-algorithm.md, шаги 1–7 методики | область полного задания, тип/слои/вопросы/проверки | опись, REQ/AC/DNC, проверочные требования, FACT/INFERENCE/UNKNOWN, вопросы и границы ниже |
| C11 | task-runner.md, словарь и таблица единиц шага, :46 | все коды, counted N и отсутствие единиц КОММИТ/ПУШ | REQ-05…08/19, AC-15; zero-unit/null, не unit.none |
| C12 | task-runner.md, Машинные форматы, :84–93,133 | документы/прогресс; 0/0 запуск неизвестно, 0/0 старт нет единиц | REQ-15…19, AC-15; одна zero-unit строка, counted ready/stop отдельно |
| C13 | task-runner.md, профили/язык/progress/display/учёт, :215,581–589 | параметры/сведения, без ПРОФИЛЬ у КОММИТ/ПУШ | REQ-19…22; progress не подтверждает outcome запроса/действия |
| C14 | task-runner.md, run_task/state/loop_review/ворота | маршруты, возвраты, условия/решения, потолки и сбросы | REQ-09…REQ-14, REQ-23…REQ-26, REQ-35 |
| C15 | Черновик 013, REQ-24 | общий формат JSON сценария state+events→state/actions/error | REQ-31…REQ-34 |
| C16 | Черновик 013, REQ-28…30 | контракт 013 первичен для его ядра, но ещё не определён/утверждён | FACT-03, UNKNOWN-06/08; steps — предложение 031, не стандарт 013 |
| C17 | Канон README/process и AGENTS; task-algorithm:95 | закрепление/размер/публичность/след; UNKNOWN не FACT | REQ-05/33/35, AC-30/39, DNC-04/05; отсутствующий mapping с причиной, не фиктивный source |
| C18 | Исходное message 013:1–27 | чистое ядро/сервис отдельно от плагина; исходное состояние и ссылки — контекст совместимости | FACT-03, DNC-01/02/04; не доказательство готовности/утверждения контракта |
| C19 | Исходное message 013:28–49 | step/event/actions; JSON state+events→state/actions; оболочка отдельно; «Контракт внутри 013» и отдельное утверждение до реализации | REQ-27…32, DNC-01/02, FACT-03, UNKNOWN-06/08, В-03; контекст среза, не новая работа 013 |
| C20 | Исходное message 013:51–74 | язык/команды/версия/границы/зависимости, минимальный контракт не универсальный интерпретатор | UNKNOWN-06/08, DNC-01…05; команды и готовность Новы не заявлены; 013 только read-only |

C01–C20 — карта предметных разделов, не production coverage каждого предложения методики. C18–C20 покрывают весь самостоятельный исходный message 013; заголовок/метаданные и разделы связей не выданы за требования реализации 031. Комментарии 031:22 и последовательность ожиданий сохранены. Код/связь плагина с форматом не исследованы.

## Перенесённая ранняя оценка объёма: исправление счёта

Оценка предыдущей С1 — 44 предполагаемых REQ по четырнадцати корзинам; суммы по строкам C01…C14: 2+4+3+4+4+3+4+4+3+3+3+3+2+2 = **44**. Любое прежнее упоминание 42 — арифметическое/текстовое противоречие, не отдельная оценка и не альтернативный источник. Эта спецификация содержит **36** нормативных записей REQ (ID непрерывны); число AC и DNC приведено в соответствующих разделах. Класс остаётся L, риск высокий. Объём не превысил 50; повторные ворота размера не требуются. Класс и риск — описательная оценка, не разрешение на реализацию.

## Трассировка нормативных требований

| REQ | Содержание | Источник |
|---|---|---|
| 01–04 | формат как данные и scope; JSONC→JSON; schema-version/compatibility; ошибки вместо fallback | владелец, 2026-10-13; ответ JSONC; task/message.md; Канон |
| 05–08 | паспорт/методика; фазы; session/node ids; counted единицы и zero-unit/null | task/message.md; task-runner.md «Словарь», «Единицы шага», :46/93/133; Канон |
| 09–14 | полный граф/ребро/маршрут возврата/конец; owner-gate; каталог предикатов/версии | task-runner.md run_task, state, «Ворота», loop_review; task-sessions.md; task/message.md |
| 15–19 | documents/status/summary/markers; counted/zero-unit progress, launch отдельно | task-runner.md «Машинные форматы», «Протокол прогресса», :46/84–93/133 |
| 20–22 | profiles без подсказки у КОММИТ/ПУШ; language/usage/display декларации | task-runner.md «Профили запуска», :215/581, «Языковые границы», «Учёт и сроки», «Что показывает интерфейс» |
| 23–26 | params/defaults/limits/reset operations; whole source norm coverage and extension policy | task-runner.md loop_review, gates, machine formats; task-sessions.md; requirement against incomplete slice |
| 27–30 | actions/events as descriptions; effect boundaries; resume; jump/reset authorization external | task/message.md; task-runner.md run_task/state; explicit user scope |
| 31–34 | сценарий/версия/отчёт; diagnostic category и причина null ref, mapping non-null | task/message.md; 013 REQ-24/28…30; task-algorithm:95; конкретизация С1п3 по review3:1 |
| 35–36 | schema validation, diagnostic classes, text quality/traceability and compatibility checks | task-runner.md; Канон; S1 prompt; concrete specification |

## Исторический след до первого полного независимого отчёта

Два описанных ниже обмена замечаниями сохранены как история входного trace, не два независимых чистых захода С2. Их заявления о structural pass/готовых ссылках отменены находками полного spec-review-1.md и текущей правкой. Источник сегодняшней правки — только полный отчёт (SHA в описи), никаких ворот эти старые абзацы не закрывают.

### Прежний круг 1: устранение пробела контрактов

С2 сообщила существенную находку: поля названы, но оставались открыты типы/nullability/enum/ссылки и недостаточен пример. Это вход текущей доработки, не решение владельца. Принято к исправлению: общий точный каталог полей добавлен в spec.md; непустой связный JSONC показывает structural validity; введено различие structural/semantic/full-coverage проверки. Закрытые enum заданы таблицами. Business registries и сценарные event signatures, которые невозможно достоверно восстановить/закрепить как окончательные по текущему решению только о формате, названы UNKNOWN-07/08; это прямо запрещает заявлять self-contained semantic validation и требует registry digest/version внешнего контракта.

| Область замечания | Исправление и требования | AC | Остаток/статус |
|---|---|---|---|
| routes/trigger/ссылки/counter effects | Таблица `route`, `counterEffect`; типизированный trigger `{kind,ref,value}` и точные ref namespaces; REQ-10, 23–24 | AC-31, 33–34, 41 | trigger business enum kind — UNKNOWN-07, runtime effect не исполняется |
| gates/decisions/effects/owner default | Таблицы `gate`, `decision`, `gateEffect`; ownerRequired/null/default, confirmation и resultEvent; REQ-11–12, 28 | AC-09–10, 32, 41 | полного набора бизнес-кодов В1–В13/исходов — UNKNOWN-07 |
| counters/parameters/resetPolicy | Таблицы с точными полями, scalar types, bounds, операциями и комбинациями resetPolicy/resetEvents; REQ-23–25 | AC-18–19, 33–34 | значение/семантика каждого предиката/исхода сверяется с external registry |
| documents/statusRules/fields/markers/progress | Таблицы document/statusRule/documentField/documentMarker/progressFormat; exact enums, multiplicity, normalization и onInvalid; REQ-15–19 | AC-12–15, 35 | полные бизнес grammar/status catalog — UNKNOWN-07 |
| profiles | закрытая shape `enabled/defaults/stageRules/limits`, tier bounds и inheritance cycle rule; REQ-20–21 | AC-16–17, 36 | stage/profile values — UNKNOWN-07; пример заполнен |
| actions/events/payloadSchema | таблицы action/event/fieldSchema, закрытые structural boundary, schema of object payload, registry-kind refs; REQ-27–28 | AC-21, 37 | business kind names/signatures — UNKNOWN-07; matching registry требуется |
| coverage | точная запись `{id,sourceFile,anchor,kind,targets,disposition}` и conditional reason; REQ-26, 36 | AC-20, 38, 41 | полнота семантическая сверка, не выводится из JSON schema |
| diagnostics | exact diagnostic/codes/severity/location/pointer/sourceRef; REQ-33 | AC-26, 39 | условие каждой бизнес-ошибки связано с правилом/registry |
| scenario contract | оболочка JSON сценария и ссылки REQ/AC/DNC/source, expected union; REQ-31–32 | AC-23–25, 40 | 013 контракт не утверждён, UNKNOWN-08 |
| root, graph, enums/outcomes and example | root keys закрыты/обязательны, local ID/link rules; connected example с nonempty graph/nodes/route/gate/counter/profile/doc/actions/events/coverage; REQ-04–14, 35 | AC-07–11, 29–30, 41–42 | пример проходит структурную, не полный coverage; production full registry data отсутствует |

Обновлённая спецификация не увеличивает нормативный счёт REQ: **36** (ниже порога 50); AC теперь **42**, DNC **5**. Проба connected JSONC документирует ожидаемый structural pass при фиктивных matching registry fixtures; она не запускается на валидаторе (код запрещён текущей задачей). Оставшееся UNKNOWN помечено явно и ограничивает любые заявления о полноценной проверке.

### Прежний круг 2: исправление графа и перечня неизвестного

Находка С2: connected example обозначал `node.approved` терминалом при исходящем ребре на `node.done`; кроме того, UNKNOWN-07/08 использовались вне явного списка UNKNOWN. Исправлено в `spec.md`: `graph.terminalNode` теперь `node.done`, как и `phase.terminalNodes`; `node.approved` сохранён как gate с outgoing edge; `node.done` — единственный конечный node без исходящих рёбер. UNKNOWN-07 и UNKNOWN-08 перенесены/определены внутри «Факты, выводы и неизвестное» с закреплёнными источниками и границами. AC-41 теперь прямо проверяет согласование graph terminal/phase terminal, что gate имеет исходящее ребро, отрицательную мутацию terminalNode и отсутствие исходящих у конечного узла; AC-42 ссылается на оба UNKNOWN и отдельно различает registry и scenario-contract неопределённость.

Проверка применимости: определения UNKNOWN-07/08 находятся в общем списке UNKNOWN-01…08, все упоминания разрешаются к ним; connected sample имеет graph terminal и phase terminal одного ID (`node.done`), а gate node не объявлен конечным. Структурные словари остаются закрытыми там, где таблицы дают enum; неизвестные бизнес-наборы не выдаются за закрытые и до внешнего registry остаются запретом semantic pass.

## С1 правка по spec-review-1.md — текущий результат

Раздел «Изменения захода 1» в spec.md содержит ровно 14 отдельных исходов «Исправлено», отклонений нет. Все таблицы/REQ/AC и затронутые примеры заменены вместе; текущая история не засчитывает/не закрывает находки самой С1. Маршрут только новая свежая С2. 36 REQ/42 AC/5 DNC, ранняя оценка 44 сохранена; L, высокий риск, порог >50 не достигнут. Размер spec после предметной правки 125585 байт (<150000), trace не нормативная копия spec. Статус черновик.

### Проба 1 — машинные формы и положительный контроль

Область: все 83 literal нормативных ID, непрерывность/пустые строки, первая строка статуса; пять вопросных блоков; последняя строка раздела описи; marker закрепления. Read-only Python stdin с re.findall по `^REQ-`, `^AC-`, `^DNC-`, `^В-...\?$`, `^Тип:`, `^Рекомендация:`; раздел описи ограничен следующим heading. Это счёт/осмотр текста, не validator.

Дословный вывод пробы до дописи истории (сама допись REQ/AC/DNC/вопросов не добавляет):

```text
REQ 36 continuous literal IDs
AC 42 continuous literal IDs
DNC 5 continuous literal IDs
draft status OK
questions 5 standalone Тип 5 recommendations 5
inventory final итого: 18
methodology literal marker True
bold normative IDs 0
```

Первый positive control — реальные literal REQ/AC/DNC, а не один отрицательный поиск bold; второй — marker Методика: найден. Блоки проверены на Тип:/Рекомендация:/адресат/срок/варианты/default/влияние/запрет автоответа. Вход message/review hashes совпали с описью. Прежнее машинное «0 literal IDs» исправлено; semantic completeness не этим счётом устанавливается.

### Проба 2 — конкретные examples и отрицательные мутации в памяти

Осмотрены **10** fenced JSON/JSONC блоков, в том числе две JSONC оболочки, parameter/session/subsystem/typedRef/effect/actionUse pairs и двусобытийный scenario. Из двух JSONC сняты только **7** известных целых comment lines шапки/node/edge точным replace; остальные блоки unchanged. json.loads дал деревья для всех десяти. Это НЕ JSONC parser: общие block comments/строковые escapes/duplicate-key/UTF-8/координаты не проверялись; поля illegal pairs закономерно тоже JSON-синтаксически законны.

Осмотр connected-fragment: 25 required корневых ключей и один optional language; 50 ID occurrences (ссылки включены), 3 nodes/2 edges/2 routes/1 counter/1 actionUse; все from/to/edgeId/routeId refs и target equality, preserve/индекс increment, пустые decision effects и required gateId binding. Контроль terminal=node.done, нет outgoing; phase terminal совпадает. Две мутации в copy.deepcopy: route target на существующий node.spec нарушил equality; второй scenario index на 0 нарушил последовательность. Проба именно relations, не прогон будущего валидатора и не закрытый registry.

Дословный вывод:

```text
blocks strict parse 10 known comment lines removed 7 NOT JSONC/semantic validation
connected required root 25 present True extra ['language']
ID occurrences 50 bad []
route edge backlinks/targets 2 agree; no duplicate counter writes
existing-target mutation ref exists True relation agrees False
counter index ['route.spec.done'] decision effects empty
action uses 1 required payload bound
terminal node.done outgoing 0
scenario event/step counts 2 2 indices [0, 1]
scenario duplicate index mutation [0, 0]
registry/coverage/JSONC dialect/coordinate checks NOT VERIFIED
```

Дополнительный ручной осмотр всех 12 пар: legal/illegal различают домен/nullable/namespace/owner/комбинации effects/bindings/relations/steps/filename/comments/текстовые маркеры. Параметр example исправлен с ID parameter.cleanChecks на parameter.clean-checks по regex; нормативное имя поля cleanChecksParam не ID. Внешние obligations примера явно перечислены, diagnosticCatalog/циклы/outcomes/source coverage неполны; старое обещание structural/full pass снято.

### Проба 3 — сохранность входа и границ

Команда `git diff --check` — exit 0, stdout пустой. Python stdin сравнил SHA входов, текущие журналы с `git show :<path>` (индекс исходных автора), fingerprint `git ls-files --stage`, `git diff --name-only` и отсутствие plan.md. Записи журналов только дописываются, не переписывают прежние шесть/десять строк. Полный список индекса до/после SHA-256 один:

`2e62d3f32e0303a32e03c72d4d96888a67b5d3668ad8458165699020bb92ee38`.

Дословный вывод (последующие добавления trace/log/progress не меняют spec или индекс):

```text
REQ 36 continuous
AC 42 continuous
DNC 5 continuous
spec bytes 125585 L limit 150000
changes individual findings 14
append only vs index log.md True
append only vs index progress.log True
index listing sha256 2e62d3f32e0303a32e03c72d4d96888a67b5d3668ad8458165699020bb92ee38
working changes ['doc/tasks/031-runner-regulation-in-plugin/log.md', 'doc/tasks/031-runner-regulation-in-plugin/progress.log', 'doc/tasks/031-runner-regulation-in-plugin/spec-trace.md', 'doc/tasks/031-runner-regulation-in-plugin/spec.md']
input unchanged task/message.md
input unchanged spec-review-1.md
013 unchanged
plan.md exists False
```

Code/Канон/другие задачи/main/metadata не изменялись; git add/reset/commit/push/перезапуск/агенты не вызывались. Входный untracked spec-review-1.md сохранён с SHA, не добавлен в индекс. Чтение длинной строки методики через PowerShell pipeline вернуло весь текст, но exit 1: успешным command-status не объявляется; ранее git show всего файла имел exit 0, затем прочитан весь управляемый вывод.

### Непроверенное и открытые вопросы

Стражы секретов/путей/private names **NOT VERIFIED**: единственная попытка `crew_watch(command="python scripts/guards/guard-secrets.py --tree", machine=true)` вернула «Наблюдение ставит только вкладка, не субагент.» Ничего не поставлено/не прогнано; обхода очереди нет. Интегратор может поставить проверку в разрешённой очереди, это не разрешение пуша. Полный npm test/тяжёлые команды не запускались. Parser/validator/runner не создавались, ни один будущий AC не назван выполненным на реализации.

Открыты В-01 (формы/версия), В-02 (доказательство coverage), В-03 (согласование strict JSON steps с 013), В-04 (полный registry/signatures/prompt/context/outcome mappings), В-05 (диалект/обязательные comments). UNKNOWN-01…08 честно сохранены; никакой auto gate/default не утверждает схемы/границ и не разрешает новую реализацию. Текущая С1 передаёт текст/доказательства и останавливается для следующей независимой С2.

### Итоговый отпечаток и ограничение журнала

SHA-256 исправленной spec: `a57c40a73119ba9d27db6ba01ee731013c5a9385ba938ca1f7b1842f75f5ccd8`, 125585 байт, 36/42/5. Повторный git diff --check: exit 0, stdout/stderr пустые. У пяти вопросов spec все восемь полей присутствуют по пять раз (Тип/Адресат/Срок/Влияние/Варианты/Default/Автоответ/Рекомендация), индекс fingerprint прежний.

Выявлено собственное отклонение С1п: подписи новых строк progress 1/5 и 4/5 длиной **92** и **83** символа при пределе методики 80; остальные две 77/78. Инструмент progress_line принял их (его технический предел 120 не разрешает отступления от нормы). Время получено инструментом, фактический ход сохранён; задним числом строки/время не переписывались. Это открытый дефект ведения журнала, не «чисто» и не фиктивный PASS, не изменение спецификации формата. Последняя подпись короче 80.

В-06 — Принять ли сохранение отклонений прошлой С1п (92/83 символа, нет exact старта/завершения, готово:) как разовое исключение без переписывания истории?
Тип: gate
Адресат: владелец CrewHarness через интегратора.
Срок: до принятия документального результата этой С1п; независимая С2 возможна без закрытия вопроса.
Влияние: нарушены предел и машинные маркеры task-runner.md; append-only не разрешает исправлять прошлое молча. Исторический вопрос до ответа, расширенный состав — находка 5 С2.
Варианты: сохранить как отклонение текущей сессии; не принять соответствие журнала, сохранить факт для следующей проверки.
Default: исключение не принято, отклонение остаётся открытым; черновик передаётся без заявления полного соответствия журналов.
Автоответ: запрещён
Рекомендация: сохранить как отклонение только этой С1п — записи отражают реальный ход и инструментальное время, их задним числом сокращать хуже для воспроизводимости; норму следующих сессий не менять.

### Ответ В-06 и полный состав отклонений

ОТВ-06 — **Отвечен в границе разового исключения.** Владелец, 2026-10-13, вопросник интегратора CrewHarness: «Сохранить след (Recommended)»; источник — log.md, запись решения 11:53 и бриф С1п2. Не автоответ/не авторский default. Только предыдущая С1п: строки progress 11/14 имеют подписи 92/83; нет первой 0/5 старт; финальная 15 начинается готово:, а не exact готово, потому точного завершения также нет. Все пять старых строк и время сохранены. Их соответствие **не принято**, принят проверяемый след ошибки без выдумывания прошлых меток. Новые сессии обязаны точным start/finish и пределу 80; потолок не сброшен, В-01…05/UNKNOWN открыты, spec/plan не утверждены. Исторические statements «открыт/ответа нет» выше относятся к моменту прежней С1п, заменены только этим новым ответом.

## С1п2 — правка по spec-review-2.md

Пять исходов «Изменения захода 2» в spec.md: четыре предметные правки и раскрытие полного состава принятого process exception. Отклонённых находок **0**. Это не самостоятельное закрытие находок; следующий шаг — свежая С2 захода 3. Официально остаются 2/4, чистая серия 0, потолок не сброшен. Сессия останавливается после передачи, агенты/метаприёмка не запускаются.

| Находка | Статус С1п2 / предметное доказательство | Остаток |
|---|---|---|
| 1 | Исправлено: шесть точных recursive fieldSchema, числовой domain, required/nullable/availability; REQ-23/27, AC-33/37, пара 13, usage example | matching context/grammar/action signatures UNKNOWN-07 |
| 2 | Исправлено: unique array<string> nSourceRules, unitRules namespace/binding/version/digest, node/linePattern↔k/N; REQ-08/19, AC-15, пара 14, connected grammar ref | не вымышленный unit registry/не semantic pass |
| 3 | Исправлено: review summary binding отдельно от facts context n; шесть строк семейств и их источники/grammar, REQ-15/17, AC-14/28, пара 15 | нет запуска meeting, facts fixture лишь пример формы |
| 4 | Исправлено: реально прочитаны 74 строки отдельного message 013, SHA пункт 20; C18–C20 и REQ-31/32/FACT-03 | исходная ссылка и файл не удвоены; 013 на паузе |
| 5 | Раскрыто и отвечено только разовым исключением ОТВ-06; строки 11–15 и время сохранены; REQ-19/AC-15 не ослаблены | старый журнал некорректен; новая С1п2 точные маркеры/≤80 |

### Проба П1 — нормативные записи и документальные маркеры

Read-only Python stdin: re.findall только по началу отдельной записи, осмотр полного раздела описи/пяти вопросов/«Изменения захода 2». Единицы — отдельные normative IDs, numbered input entries, поля вопроса; положительные контроли — сами реальные REQ и найденный Методика:. Это счёт текста, не reader/schema validation.

```text
REQ 36 True
AC 42 True
DNC 5 True
draft Статус: черновик
inventory entries 22 final итого: 22
questions 5 methodology marker True
question fields [('Тип', 5), ('Адресат', 5), ('Срок', 5), ('Влияние', 5), ('Варианты', 5), ('Default', 5), ('Автоответ', 5), ('Рекомендация', 5)]
five changes 5
```

Опись — 21 файл и один бриф, message 013 учтён один раз отдельно от его spec. Все 20 строк C01–C20 осмотрены. Старые числа 18/10 блоков ниже в исторических разделах не являются текущим итогом описи/числом examples.

### Проба П2 — все JSON examples и точечные мутации

Из текущей spec в память извлечены **12** fenced JSON/JSONC блоков (прежние десять + пары schema/N). Из двух JSONC убраны только **7 известных целых строк** комментариев шапки/node/edge. json.loads получил все 12 деревьев. Это не JSONC parser: блоковые comments, comments внутри строк, UTF-8/BOM, duplicate-key rejection и координаты не проверялись. JSON.parse также проверял бы лишь синтаксис чистого JSON, не полный JSONC. Validator/normalizer код не написан.

Сравнения в памяти — только конкретные поля примеров/копии с одним изменением: route target на существующий node, scenario второй index, required duplicate, array missing maxItems, N element number. Включение числового домена — арифметическое сравнение 1≥1 против 0≥1, не общая implementation проверки schemas. Дословные выводы:

```text
strict JSON trees 12 known whole comment lines removed 7 NOT general JSONC/schema/semantic validation
connected nodes/edges/routes 3 2 2
route route.spec.done backlink True target True
route route.approve backlink True target True
route negative existing target True equality False
unit sources ['unit.spec'] pattern unit.spec node unit.spec
nested object keys ['additionalProperties', 'nullable', 'properties', 'required', 'type'] required ['x'] illegal required ['x', 'x']
nested array keys ['items', 'maxItems', 'nullable', 'type'] maxItems type int
nested integer keys ['maximum', 'minimum', 'nullable', 'type']
array negative missing keys ['maxItems']
bounded context [1,safe-max] subset counter [1,safe-max] True context [0,safe-max] subset False
scenario indices [0, 1]
scenario negative indices [0, 0]
terminal outgoing 0
required subset True unique positive True unique negative False
N values positive type str negative type int
```

Положительные и отрицательные пары различаются по объявленному инварианту; незаконные payload/schemas остаются JSON-синтаксически законными. Полный structural/registry/semantic/full-coverage результат **NOT VERIFIED**, ни один будущий AC не объявлен PASS.

### Проба П3 — полный соседний проход форм и всех примеров

После правок текущая spec прочитана целиком, все 675 строк. Осмотрены **44** строки основной structural table, **6** точных fieldSchema branches, **6** строк filename families, все **15** пронумерованных пар/примеров и inline schemas/bindings. Перечень ветвлений, пройденных по таблице↔REQ↔AC↔example:

- fieldSchema string/integer/boolean/enum/array/object, включая nested object→array→boolean и object→integer; nullable отдельно от property presence, maxItems integer/required и безопасные границы;
- payloadSchema, args/action/event/effect signatures, шесть valueBinding ветвей, context/domain→counter bounds, когда optional source не годится required counter write;
- counters integer/boolean/enum и шесть операций, параметры integer/boolean/string/enum, cycle refs/domains/дубли; при проходе исправлен также ID parameter.minProbes→parameter.min-probes в частичном cycle example по общему regex;
- session agent/meeting/human/system, node kinds/unit, global/local typedRef owners, roles/prompts; две ветви numberBinding, namespace unitRules и named grammar refs;
- subsystem absence/disabled/enabled, profiles enabled/disabled/inheritance, graph/route reciprocity и trigger event/gate-decision/predicate-outcome, coverage dispositions;
- scenario state-only/actions-only/state+actions/error и terminal first error; partial/void не завершённый review; review/facts/feedback/customer/линзы — отдельные номера/grammar;
- обязательные JSONC comments до удаления, literal IDs/опись/вопросы, exact progress words/length и отдельный принятый след ошибки.

Дополнительный вывод конкретного осмотра (общий предварительный ID scan показал REQ-16 как несовпадение, затем namespace квалифицирован явно — это не local ID):

```text
table rows 44 fieldSchema branches ['string', 'boolean', 'integer', 'enum', 'array', 'object']
cycle param IDs parameter.clean parameter.min-probes parameter.ceiling all ID regex True
local example id occurrences excluding normative namespace 57 bad []
facts text lines 2 first не измерено last не читал summary present False
facts fixture n=2 vs filename=2 True mutated n=3 vs filename=2 False
```

Сверены источники task-runner: единицы/N (таблица 28–48), review/facts (71–74), progress (84–93), check_meeting (330–349). Facts без summary сохранён, положительный номер из n=2, отрицательный n=3 не замаскирован отсутствием summary. Собственный проход не независимая С2 и не подтверждение business registry; новых решений о формате не принято.

### Проба П4 — сохранность границ, входов и индекса

Read-only SHA-256 исходных байтов, git hash-object семи проектных входов, git ls-files --stage, git diff --name-only HEAD и **git diff --check HEAD** (с учётом уже staged файлов). Семь blob IDs совпали с таблицей описи. log первые 15 строк совпали с входным hash; оба журнала append-only относительно индекса. Старые строки progress 11–15 прочитаны и не заменены; новых прошлых timestamp нет.

```text
log prefix input hash matches True
append-only vs index log.md True
append-only vs index progress.log True
old S1p line 11 length 92 first word читаю
old S1p line 14 length 83 first word проверил
old S1p line 15 length 64 first word готово:
old S1p exact start 0 exact finish 0
013 read-only task/message.md 74 88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9
013 read-only spec.md 1060 f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376
index raw 2e62d3f32e0303a32e03c72d4d96888a67b5d3668ad8458165699020bb92ee38
plan exists False
git diff --check HEAD exit 0 stdout '' stderr ''
```

Входные message 031/spec-review-1/spec-review-2 SHA совпали с пунктами 1/4/19. Индекс fingerprint совпал с прежним **по сырым байтам subprocess**: PowerShell pipeline в начальном вызове дал иной hash d47a… из-за перекодирования/переводов строк, это не изменение индекса; сравнение до/после проводится одним byte-preserving subprocess способом. Рабочая ветка задачи проверена; вне четырёх разрешённых документов diff HEAD нет. Старые staged документы/два untracked независимых отчёта не добавлялись/не снимались с индекса. git add/reset/commit/push/merge/обновление main/перезапуск/агенты не вызывались.

### Итог и пределы доказательства С1п2

Spec: **36 REQ / 42 AC / 5 DNC**, 675 строк, **147987 байт** (<150000, запас 2013), L/высокий риск. SHA-256: `998bddacfa13305b69ffe25a1d61f905360b669b9b621c014e3096d823978b3e`. Статус черновик; опись итого: 22, карта C01–C20, пять отдельных исходов захода 2.

Изменены только `spec.md`, `spec-trace.md`, `log.md`, `progress.log` в папке 031. Время новых журнальных записей — только progress_line. Старт 0/4 родителя не дублирован; единицы 1/4…3/4 записаны сразу после групп правок с длинами 67/71/63; окончание 4/4 — exact готово, ≤80, после записи проверяется отдельно. Норма будущих сессий не изменена.

Открыты В-01 (версия/закрытые формы), В-02 (coverage/независимая сверка), В-03 (сценарный контракт 013), В-04 (полный registry), В-05 (диалект/комментарии). В-06 отвечен **только** сохранением следа предыдущей С1п. Все UNKNOWN-01…08 сохранены; отсутствие authoritative catalogs/fixtures 013 запрещает semantic/compatibility pass.

Guards privacy **NOT VERIFIED**: в этой сессии не запускались; предыдущий отказ очереди для субагента не обходился, интегратор может поставить проверку в разрешённой очереди. Полного npm test/сборки/тяжёлого прогона нет — документальная С1, кода нет. Чистая серия не засчитывается, ворота/метаприёмка не закрываются. Дальше только новая независимая С2 захода 3.

Финальный read-only контроль после строки готово подтвердил её, не дописал ещё progress:

```text
S1p2 records 5
units ['0/4', '1/4', '2/4', '3/4', '4/4']
signature lengths [5, 67, 71, 63, 51]
first words ['старт', 'fieldSchema:', 'nSourceRules:', 'facts-N:', 'готово']
single start True
exact last finish True
log original prefix hash e05ef91aba0faf23cb0de81c5eacef9268c5233173134e79c52489c46216191f
git diff --check HEAD final 0 b'' b''
```

Spec hash/размер, три immutable input hashes и raw index fingerprint повторно совпали. Статус Git сохраняет прежние staged входы и два untracked отчёта; новых файлов/индексных изменений нет. Ни одна строка после exact готово в progress этой С1п2 не создана.

## С1п3 — правка по spec-review-3.md

Вход: spec 147987 байт, SHA-256 `998bddacfa13305b69ffe25a1d61f905360b669b9b621c014e3096d823978b3e`; 36 REQ/42 AC/5 DNC, L/высокий риск. Полный отчёт захода 3 прочитан: две существенные, 0 поверхностных, 4 пробы. Прежние 14+5 находок не переоткрываются без нового доказательства. Слово владельца «До 5 заходов (Recommended)», 2026-10-13, вопросник интегратора, log 13:45: счёт 3/5, чистая серия 0, потолок увеличен без сброса. Эта С1 не засчитывает заход и не утверждает спецификацию.

### Исход 1 — диагностика без manifest

**Исправлено, не отклонено.** Таблица diagnostic, правила после sourceRef, REQ-33, AC-30/39, первый корень и пара 16 едины. Выбрана форма с обязательными category и sourceRefReason: null ref имеет точную причину по приоритету syntax-unavailable → manifest-missing → manifest-invalid → mapping-unavailable. Успешный mapping, напротив, требует ref/non-null и reason=null; источники деклараций predicate/parameter/action/event по-прежнему обязательны. Отсутствие/повреждение паспорта не заменяется шапкой/догадкой и не меняет category нарушенного правила. Код reader не создаётся.

Проба Д1 — read-only Python stdin: извлечён JSON пары 16 в память через json.loads, осмотрены обязательные ключи и две формы. Перечень осмотра: четыре null-причины; structural missing/type; syntax/duplicate-key; semantic unresolved-reference; положительный mapping с независимо подтверждёнными source bytes и отрицательные null/обе non-null/нет ключа/чужой file/commit/пустой anchor. Последний контроль условный, не подтверждение вымышленных hashes образца.

Дословный вывод:

```text
diagnostic pair fields ['category', 'code', 'column', 'jsonPointer', 'line', 'message', 'severity', 'sourceRef', 'sourceRefReason']
missing manifest category/ref/reason structural None manifest-missing
invented ref negative non-null with reason True True
branches stated ['syntax-unavailable', 'manifest-missing', 'manifest-invalid', 'mapping-unavailable']
REQ 36 True
AC 42 True
DNC 5 True
```

JSON-синтаксис незаконной записи остаётся допустимым. Проба устанавливает конкретное различие данных по норме текста, не structural/semantic pass и не runtime-поведение. Финальный общий проход, отпечаток и исход 2 дописываются после второй единицы; N сессии остаётся 2.

### Исход 2 — counted/zero-unit progress

**Исправлено, не отклонено.** Таблица progressFormat, инварианты unit/linePattern, REQ-07/08/19/20, AC-15, counted connected-fragment и пары 14/17 согласованы. Mode закрыт counted/zero-unit; unitRule ненулевой только counted, zero-unit требует оба unit/unitRule=null и код связанной session КОММИТ/ПУШ. Проверяется node.code=session.code, чтобы переименование display-кода не обходило выбор ветви. nSourceRules не получает null/фиктивный unit.none. Одна агентская zero-unit 0/0 старт без ПРОФИЛЬ не требует второй готово; 0/0 запуск оркестратора остаётся отдельным неизвестным N. Эти данные не выполняют коммит/пуш и не объявляют их успех.

Источник прочитан **целиком** git show на закреплённом SHA: task-runner.md, 697 строк (длинная 305 отдельно без обрезки), task-sessions.md, 399 строк (полный С1 правка :134–143 и Правила :90–105), task-algorithm.md, 370 строк, README методики. Проверены не только task-runner:46/93/133, но зависимые :48/78/82/84–92/97–134/215/253–259/552–589: выбор denominator, отдельная отметка запуска, длина/ключевые слова, append-only/offset, отсутствие подсказки для двух кодов и проверка артефакта/исхода вне progress. Новое исключение не введено; counted с фактически нулевым denominator не наследует специального хвоста этих кодов.

### Проба Д2 — парные данные и конкретные мутации обеих ветвей

Read-only Python stdin: извлечены **14** fenced JSON/JSONC блоков; сняты только семь заранее перечисленных **полных** comment lines, стандартный json.loads дал 14 деревьев. Проба не общий JSONC parser/schema/semantic validator. Оба linePattern legal/illegal имеют одни ключи и меняют ровно unitRule; node.spec сохраняет counted связь. В памяти отдельно составлены counted строки N=2, по одной zero-unit строке для обоих кодов, мутация второй готово и отдельные launch данные. Копии zero-unit node/pattern мутированы по одному полю; также осмотрены missing mode/дата и добавление ПРОФИЛЬ. Никаких runtime/git эффектов нет.

Дословный вывод:

```text
strict trees 14 known full comment lines 7 NOT JSONC/schema/semantic validation
connected counted mode/ref/source counted unit.spec unit.spec spec
pattern pair counted same keys True single difference ['unitRule'] legal mode/ref counted unit.spec illegal ref None
pattern pair zeroUnit same keys True single difference ['unitRule'] legal mode/ref zero-unit None illegal ref unit.spec
N rule set ['unit.spec'] non-null pattern references ['unit.spec']
counted concrete agent lines 3 k/N ['0/2', '1/2', '2/2'] last word готово
zero data КОММИТ agent lines 1 profiles 0 extra-ready mutation lines 2 launch/start distinct True
zero data ПУШ agent lines 1 profiles 0 extra-ready mutation lines 2 launch/start distinct True
zero node single mutation unit ['unit'] kind/code/unit session КОММИТ {'source': 'spec', 'numeratorRule': 'unit.spec'}
zero node single mutation code ['code'] kind/code/unit session С1 None
zero node single mutation kind ['kind'] kind/code/unit gate КОММИТ None
zero pattern single mutation unitRule ['unitRule'] unit.none
zero pattern single mutation mode ['mode'] counted
zero profile mutation [] -> ['ПРОФИЛЬ от КОММИТ: ...']
```

Данные без времени — базовая grammar с hasDate=false из пары 17. Connected-fragment имеет проектную counted hasDate=true; отсутствие требуемого времени у этой формы не названо законным. N=2 — счёт примера, не скрытые единицы данной С1п3 (их по-прежнему 2).

Диагностика повторно осмотрена после второй правки. Конкретные roots missing/null manifest, commit-int/files-null и условный mapped diagnostic (норма одной строки по task-runner) составлены в памяти, не получены из reader. Последний якорь — «Единицы шага и откуда берётся N», не выдуманное правило unknown-field из «Машинных форматов». Проверены обе одиночные мутации nullability и отдельные чужие file/commit/пустой section/нет ключа/category. Дословные наблюдения:

```text
manifest data missing present False value type NoneType expected category/reason structural manifest-missing
manifest data null present True value type NoneType expected category/reason structural manifest-invalid
manifest data commit-int present True value type dict expected category/reason structural manifest-invalid
manifest data files-null present True value type dict expected category/reason structural manifest-invalid
combined case priority True
conditional mapped data category/code/ref/reason semantic invalid-document-rule True None authoritative source bytes NOT VERIFIED
mapped single mutation sourceRef ['sourceRef'] null pair True True
mapped single mutation sourceRefReason ['sourceRefReason'] null pair False False
```

Причины syntax-unavailable/manifest-missing/manifest-invalid/mapping-unavailable осмотрены в тексте в этом порядке. Syntax/duplicate-key не названы structural; structural missing-field/type не названы syntax; semantic mapping-unavailable не заявлен semantic success. Неподтверждённый sample commit/hash остаётся условием fixture, не FACT о доступных источниках. Проверка единственного якоря/hash и реальные coordinate результаты reader **NOT VERIFIED**.

### Проба Д3 — полный собственный проход и соседние отношения

Перечень: все **44** строки основной structural table, **6** рекурсивных fieldSchema ветвей, **6** filename-семейств, **17** групп пар/примеров, все **83** REQ/AC/DNC, **8** UNKNOWN, **5** вопросных блоков, два исхода захода 3 и все **20** C01–C20. Прочитан полный вход spec/review1/review2/review3/trace/task/message/log/progress; предметная сверка старого текста с собственными правками не заменяет независимую С2.

Проверены соседние отношения: sourceRef деклараций не ослаблены вместе с diagnostic; null причина не позволяет произвольную потерю mapped ref; category определяется ошибкой, не паспортом. Counted nSourceRules остаётся typed refs, null не строковый ID; zero-unit не применяется к non-session или чужому session.code; дата/offset/stop остаются общими нормами. Roles/parameters/defaults, six fieldSchema/nullability/domain, context bindings, counters/route effects/reverse indices, graph↔route target, required action binding, terminal, scenario steps, numberBinding review/facts, lens/round/void и обязательные comments сохранены. Нового основания переоткрыть прежние 14+5 не найдено; общий registry/coverage всё ещё не подтверждён.

Дословный счёт/локальный контроль:

```text
route route.spec.done backlink True target True
route route.approve backlink True target True
route target mutation existing True equality False
scenario events/steps/indices 2 2 [0, 1]
nested object required unique/subset True True
nested array maxItems/int 2 int
terminal outgoing 0
REQ 36 continuous True paragraphs True
AC 42 continuous True paragraphs True
DNC 5 continuous True paragraphs True
table rows 44
fieldSchema branches ['string', 'boolean', 'integer', 'enum', 'array', 'object']
numbered data groups ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']
inventory 23 continuous True total ['23']
questions 5
question fields [('Тип', 5), ('Адресат', 5), ('Срок', 5), ('Влияние', 5), ('Варианты', 5), ('Default', 5), ('Автоответ', 5), ('Рекомендация', 5)]
changes 3 outcomes 2
session code guard True
connected code pair ['С1', 'С1']
```

Накопленная опись теперь 23 (пункт 23 — новый review3); три источника прежнего чтения явно не переобъявлены чтением С1п3. В C01–C20 **0** dispositions not_requirement, проверено 0 из 0; контекст 013 не стал заданием на реализацию/принятым контрактом. В-01…05 остаются открыты; В-06 только разовый сохранённый след. Исторические описи/числа/исходы в предыдущих разделах — история, не текущие N или результаты.

### Проба Д4 — сохранность и размер

SHA исходных байтов и read-only git ls-files --stage/git diff --check HEAD: четыре protected файла (task/message и review1/2/3) совпали с началом С1п3. Журналы сохраняют **байтовые** префиксы старта, не только одинаковые строки; старые некорректные записи не переписаны. Проверено отсутствие изменений вне папки задачи и только четыре разрешённых tracked пути. Индекс сравнен и по raw listing, и по байтам самого index.

```text
protected task/message.md True
protected spec-review-1.md True
protected spec-review-2.md True
protected spec-review-3.md True
append-only input log.md True
append-only input progress.log True
index listing 2e62d3f32e0303a32e03c72d4d96888a67b5d3668ad8458165699020bb92ee38
index bytes 12342f43ddd8b8dc8343145c50619c6fb878705582fcdb9acef0fe28b287c0fc
outside diff e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
task files ['message.md']
plan exists False
diffcheck 0 b'' b''
spec 167897 716 4df9e47e4cb09b2427fe5e27256438ea22f7c89ac2b87c0db1b7108807c9c1a1 L excess 17897
```

**Предупреждение L:** spec **167897 байт**, предел 150000, превышение **17897**. Вход был 147987 с запасом 2013; предметная правка добавила 19910 байт: закрытые формы/приоритет причин диагностики, counted/zero-unit инварианты, парные данные/REQ/AC и два обоснованных исхода. Требования/источники не сокращены ради числа; это предупреждение для ближайших ворот владельца, не утверждение/разрешение плана или самовольное разбиение. REQ/AC/DNC осталось **36/42/5**, L/высокий риск.

Изменены только spec.md/spec-trace.md/log.md/progress.log этой задачи. Нет кода/парсера/валидатора/production-регламента/плана, правок Канона/методики/013/metadata/индекса, агентов/коммитов/пуша/ворот/действий с живой системой. Privacy guards/JSONC/schema/semantic/registry/013 compatibility и будущие AC **NOT VERIFIED**, тяжёлые прогоны не запускались. Новое ready-сообщение progress дописывается только после этих проверок и отдельно перепроверяется; после него других progress строк С1п3 не будет. Старт родителя один, промежуточная подпись 64≤80; финальная подпись пересчитана 67≤80. Счёт 3/5, чистая серия 0, потолок не сброшен. Дальше свежая независимая С2 захода 4 от родителя; эта С1 останавливается.

Финальный контроль после успешного progress_line: инструмент записал С1п3 2/2 с exact первым словом готово, метка `2026-10-13 14:09`; она использована в append-only log, без часов/выдумывания времени. Дословный read-only вывод:

```text
S1p3 records 3
units ['0/2', '1/2', '2/2']
signature lengths [5, 64, 67]
first words ['старт', 'diagnostic:', 'готово']
single start True
exact last finish True
no rows after ready True
journal prefix log.md True
journal prefix progress.log True
spec 167897 4df9e47e4cb09b2427fe5e27256438ea22f7c89ac2b87c0db1b7108807c9c1a1
diffcheck 0 b'' b''
```

Повторные SHA task/message/review1/2/3 и оба fingerprint индекса совпали с Д4; готово не породило новых progress строк. Только доказательство финальной записи дописано здесь. Независимая проверка/утверждение/метаприёмка не объявляются.

## С1п4 — закрытое множество progress stopKinds

Вход: `spec.md` SHA-256 `4df9e47e4cb09b2427fe5e27256438ea22f7c89ac2b87c0db1b7108807c9c1a1`, 167897 байт, 36 REQ / 42 AC / 5 DNC; полный входной отчёт — `spec-review-5.md` (одна существенная находка, ноль поверхностных, четыре пробы). Прочитаны полный spec-review-5 и предметные документы/история, предыдущие пять review; закреплённые `task-runner.md`, `task-sessions.md`, `task-algorithm.md`, README, methodology и completeness-check получены через `git show` на `f333efa319e445efe029ee6963b477ca8fe3bc1c`, без копирования методики. Канон начат с README; применимые process/ADR сверены. Полный промпт С1 правка прочитан из закреплённой методики.

### Исход находки review-5

**Исправлено, не отклонено.** В `task-runner.md:92` закреплён точный вид: «вид — одно из слов: вопрос, план, ревизия, требования, ворота». Таблица `progressFormat` теперь требует `stopKinds` как точное множество этих пяти distinct строк; соседний инвариант задаёт выбор ровно одного из них с причиной при counted остановке. Успешный `готово` и специальный zero-unit `старт` остановкой не являются и не требуют stop-kind. Registry не расширяет закрытое множество.

Уточнены структурная таблица, соседний инвариант, connected-fragment, REQ-19 и AC-15; добавлен пункт с пробами в парных данных и этот отдельный исход. `spec-review-5.md` и прежние 14+5 находок не переоткрывались: новых оснований нет. Счёт С2 остаётся 5/7, чистая серия 0; эта С1 не засчитывает С2 и не принимает ворота.

### Контрактные пробы в памяти (не validator)

Сопоставлено с нормой: полный список `вопрос|план|ревизия|требования|ворота` принят; чужое `surprise` вместо `ворота` отвергается; удаление `ворота` отвергается как неполное множество; повтор `ворота` отвергается как дубль. Для остановочной строки разрешён `стоп: ворота — причина`; чужое значение, пустое/отсутствующее значение и отсутствие причины не соответствуют объявленной форме. Это ручное сравнение конкретных данных с текстовым контрактом, не прогон JSONC parser, validator, runtime или будущего AC. `JSON.parse` не использовался как общий JSONC pass.

### Соседние инварианты и отпечатки

Повторно сверены counted/zero-unit формы: k/N counted, `0/0 старт` только для связанных session КОММИТ/ПУШ, отдельный `0/0 запуск`, отсутствие дополнительного `готово`/ПРОФИЛЬ и отсутствие runtime/outcome обещаний. Диагностические category/sourceRef/sourceRefReason и причины сохранены; registry/UNKNOWN-01…08, В-01…05 и разовый В-06 не изменены. Утверждение «закрытого набора» относится только к stopKinds, не к остальным UNKNOWN-бизнес-каталогам.

После правки spec: SHA-256 `34fdba4b8ffda9b1a7aa42b1dc5ef70d86f5356e70237e13265f03216f2e5ddd`, 171234 байта, 36/42/5; предупреждение L — превышение 21234 байта над 150000, без сокращения требований. Read-only Python stdin пересчитал непрерывные ID и четыре множества stopKinds: полный пятёрочный список принят, чужой `surprise`, отсутствие нормативного вида и дубль отвергнуты; connected-fragment показывает все пять значений. Counted/zero-unit и диагностические соседние положения сохранены. Protected task/message/review1–5 SHA совпали с входными; index listing SHA `2e62d3f32e0303a32e03c72d4d96888a67b5d3668ad8458165699020bb92ee38`, raw index SHA `12342f43ddd8b8dc8343145c50619c6fb878705582fcdb9acef0fe28b287c0fc`. `git diff --check HEAD` — exit 0, пустой вывод. Изменённые пути только spec.md/spec-trace.md/log.md/progress.log папки задачи; прежние журнальные байтовые префиксы сохранены; исходный индекс и untracked review отчёты не изменялись. Это текстовые проверки/точечные данные, не JSONC parser/validator/schema semantic/runtime/будущий AC pass. Guards privacy и тяжёлые команды не запускались; 013 compatibility не проверялась. Маршрут — передача интегратору и остановка для свежей независимой С2 захода 6; самому её не запускать.

## Решения владельца после С2, 2026-10-14

В `spec.md` записаны ОТВ-01…05 с датой и источником вопросника интегратора;
точные слова владельца и инструментальные метки времени — в `log.md`.

- В-01: «Раздельные версии (Recommended)» — schemaVersion 1.0 отдельно от
  regulationVersion, закрытые формы приняты; UNKNOWN-05 закрыт.
- В-02: «Покрытие и сверка (Recommended)» — полный coverage нормативных ссылок
  и независимая ручная семантическая сверка; готовый extractor не заявлен.
- В-03: «Раздельные форматы (Recommended)» — JSONC регламента и strict JSON
  сценариев, отдельное согласование контракта 013; steps остаётся предложением.
- В-04: «Закреплённый реестр (Recommended)» — обязательный version/digest
  whitelist-комплект с signatures и матрицей исходов до зависимой реализации.
- В-05: «Строгий диалект (Recommended)» — // и /* */ comments, без trailing
  comma/duplicate key, обязательные описания до удаления комментариев.

Все ответы подтверждают проверенные предложения: структурные таблицы,
36 REQ / 42 AC / 5 DNC и 18 групп данных не изменялись. Изменены только
ответы, статус вопросов и UNKNOWN-05; остальные неизвестные не закрыты.
Авторитетный registry, production-crosswalk, parser и совместимость с 013
не объявлены готовыми; реализация 013 не возобновлена. Новые задачи не созданы.

Предметная серия 8/9 принята владельцем с двумя явными разовыми процессными
оговорками; исходные итоги 1/0/6 и 3/0/8 и ошибочные журналы не переписаны.
Это не два безусловно чистых исторических отчёта. Все материалы сохранены
в исходном рабочем дереве, окно интегратора переведено в main без слияния.
Общее утверждение spec получено отдельно: владелец, 2026-10-14, вопросник
интегратора «Утверждение спецификации»: «Утвердить (Recommended)».
Утверждён только документ формата JSONC 1.0 с пятью решениями, раскрытыми
внешними зависимостями и предупреждением размера. Исходные отчёты и
процессные оговорки сохранены. План, реализация, слияние и публикация не
разрешены; parser/registry/полный регламент не созданы, 013 остаётся на паузе.
