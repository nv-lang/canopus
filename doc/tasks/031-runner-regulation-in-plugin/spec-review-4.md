Заход 4: существенных 0, поверхностных 0, проб 5
Версия: SHA-256 `4df9e47e4cb09b2427fe5e27256438ea22f7c89ac2b87c0db1b7108807c9c1a1`; `spec.md` — 167897 байт, 716 строк, 36 REQ / 42 AC / 5 DNC.

# Независимая С2 задачи 031 — заход 4

## Итог и границы

Обе находки захода 3 закрыты по действующим таблицам, инвариантам, REQ/AC и примерам, не по разделу «Исправлено». Новых существенных или поверхностных находок полный проход не дал. Прежние 14+5 не переоткрыты: нового доказанного основания нет.

Это новая независимая сессия проверки с полным чтением предмета и предыдущих отчётов по промпту С2. Прочитанные отчёты и заявления С1 не заменяли предметной проверки. Пять разных проб ниже — чтение, пересчёт и данные в памяти, не результат несуществующего reader/runtime.

Чистый результат этого отчёта **может быть только первым в новой серии**. Входной счёт — 3/5, серия 0; после записи отчёта имеется заход 4 из 5. Зачёт и запись серии остаются за управляющим циклом. Документы не утверждаются, ворота не принимаются; заход 5 не запущен и этим отчётом не разрешается автоматически.

Слово владельца от 2026-10-13 «До 5 заходов (Recommended)» проверено в `log.md:21`: потолок увеличен без сброса нумерации/истории, по-прежнему нужны два последовательных чистых захода. «Только формат (Recommended)» означает статический регламент и правила его проверки, не разрешение опустить закреплённую норму. Исполнитель, фактическое состояние и результат действий — отдельно. Контракт 013 не утверждён, реализация остаётся на паузе.

Разрешённые действия соблюдены: только чтение и лёгкие пробы в памяти; создан только этот новый отчёт инструментом patch. Перед созданием `spec-review-4.md` отсутствовал. Проверяемые документы, журналы, прежние reviews, индекс, Канон, код, методика и 013 не правились. Отдельная папка собственных журналов С2 не предоставлена; общий `progress.log`/`log.md` не дописывались, время не выдумывалось. Parser/validator/runtime, дополнительные агенты, тяжёлые проверки, публикация и действия с живой системой не выполнялись.

## Линзы и глобальный счёт

| Линза | Существенных | Поверхностных | Пробы и результат |
|---|---:|---:|---|
| Согласованность и исполнимость | 0 | 0 | П1, П2, П3, П4: формы, причины, применимость и отношения согласованы |
| Обход и неоднозначное толкование | 0 | 0 | П1, П2, П3, П4, П5: подмена источника, null после mapping, zero-unit для чужого кода, потеря покрытия/истории не разрешены |

Глобально **5 разных проб**, не сумма повторных ссылок двух линз. Находок 0; предупреждение размера не включено в находки.

## Отдельные исходы двух находок review3

### 1. Диагностика без manifest — закрыта

Источник исходного обязательства: `task/message.md:22`: «страж проверяет, что регламент соответствует закреплённой версии `task-runner.md` и таблице “Машинные форматы”». Закреплённый `task-algorithm.md:95`: «Нельзя молча превращать UNKNOWN в FACT, а INFERENCE в FACT без проверки».

Проверены `spec.md:64,136–142,241–249,333,350,566,584`: таблица diagnostic; общая sourceRef-форма; четыре причины и их приоритет; пара 16; REQ-33; первый корень; AC-30/39. Ссылки исходных predicate/parameter/action/event не стали nullable вслед за диагностикой.

Теперь diagnostic имеет ровно девять обязательных ключей. `sourceRefReason` не optional/default. Ненулевой ref требует reason=null; null ref — одну из четырёх точных причин. Category независима от доступности источника. При успешном mapping ref обязателен; потеря ссылки «по желанию» запрещена.

| Проверенный вход/ветвь | Предметный результат по контракту |
|---|---|
| Незакрытая строка/комментарий, duplicate-key | syntax; null / syntax-unavailable; дерево и последующие этапы не обещаны |
| Синтаксически корректный первый корень без manifest | structural / missing-field; null / manifest-missing для всех диагностик входа; pointer отсутствующего ключа, 2:1 содержащего объекта |
| Корень не object | structural / type, manifest-missing; не syntax |
| manifest=null, methodology=null, отсутствующий/неверного типа commit, files=null | structural нарушение формы; null / manifest-invalid; повреждённый паспорт не используется как источник |
| Невалидные элементы files, sha256/path, duplicate path, неизвестные ключи паспорта | manifest-invalid: закрытая форма/диапазоны/unique действуют и внутри methodology/files |
| Неверный commit вместе с недоступным файлом | manifest-invalid старше mapping-unavailable |
| Корректный паспорт; отсутствуют закреплённые байты либо расходятся hash/commit | null / mapping-unavailable для конкретной диагностики; не syntax и не автоматическая потеря refs остальных записей |
| Корректный паспорт; якорь отсутствует/неоднозначен | null / mapping-unavailable, без выдуманного section |
| Unknown sourceFile/sourceRef.file в декларации при корректном паспорте | ошибка адресации — semantic; mapping самой диагностики устанавливается отдельно, не копированием неверного file |
| Missing/null/неверного типа sourceRef в декларации | missing-field/type — structural; это не повреждение manifest и не разрешение пропустить источник декларации |
| Неверный sourceRef.commit либо пустой section декларации | нарушается равенство/форма ссылки; category по нарушенному правилу, причина доступности источника отдельно |
| Подтверждены закреплённые байты и один якорь нарушенной нормы | ненулевой корректный ref / reason=null; оба null, оба non-null, отсутствующий ключ, чужой file/commit/пустой section незаконны |

Для последней ветви П2 независимо прочитала реальные байты закреплённого `task-runner.md`, вычислила SHA и нашла ровно один заголовок таблицы единиц. Создан **образец данных**, не якобы ответ reader. Для схемных правил, которых нет в подтверждённых байтах методики, эта проба не приписывает успешный mapping: остаётся предусмотренная mapping-unavailable.

Приоритет `syntax-unavailable → manifest-missing → manifest-invalid → mapping-unavailable` согласован во всех перечисленных местах. Шапка и фиктивные hashes connected-fragment не заменяют manifest/проверку байтов. Illegal часть пары 16 остаётся JSON-синтаксически допустимой; незаконность пары ref/reason не объявлена syntax error. Нового противоречия после исправления не обнаружено.

**Входных отклонений находки: 0. Проверено 0 из 0 отклонений.** Исход С1 — исправление; самостоятельное закрытие здесь подтверждено предметным контрактом, не авторским статусом.

### 2. Counted/zero-unit прогресс — закрыта

Точные цитаты закреплённого `task-runner.md`:

- `:46`: «единиц нет: сессионная часть хвоста только “Сессия: <код>. Единиц нет: одна строка “<код> 0/0 старт”, строку ПРОФИЛЬ не пиши”».
- `:93`: «в строках с `0/0` слово “запуск” значит “единиц пока неизвестно”, слово “старт” — “единиц нет” (КОММИТ, ПУШ)».
- `:133`: «КОММИТ, ПУШ: только “Сессия: <код>. Единиц нет: одна строка “<код> 0/0 старт”, строку ПРОФИЛЬ не пиши”».
- `:215`: «После каждой сессии, кроме КОММИТ и ПУШ, агент пишет строку `ПРОФИЛЬ от <код>`».

Проверены `spec.md:35–36,50,99–107,136,224–230,251–259,281–283,305–307,435–437,536`: node/unit и linePattern; nSourceRules; обе ветви; пары 14/17; REQ-07/08/19/20; counted пример; AC-15. Источник дополнительно сверён по `task-runner.md:28–48,78,82,84–134,215,253–259,552–589`, не только трём цитатам.

linePattern теперь closed union с пятью обязательными ключами `{id,grammar,mode,hasDate,unitRule}`. Counted требует string rule и ненулевой node.unit, zero-unit — оба null. Применимость zero-unit определяется **кодом связанной session** КОММИТ/ПУШ; node.code=session.code. Null unit у gate/terminal либо неизвестный counted источник не разрешают zero-unit.

| Ветвь/отрицательная подстановка | Предметный результат |
|---|---|
| Counted С1, N=2 | 0/2 старт, 1/2 предмет, 2/2 готово — три агентские строки; последняя совмещена с последней единицей |
| Counted остановка/ворота | последняя k/N стоп: с видом/причиной вместо успешного готово |
| Counted N неизвестно | no-data с причиной, показ ?/?, не 0 и не zero-unit |
| Counted denominator действительно 0 | counted правило сохраняется; однострочное исключение КОММИТ/ПУШ и отсутствие ПРОФИЛЬ не наследуются |
| КОММИТ и ПУШ без единиц | по одной агентской 0/0 старт, profile lines=[]; дополнительный 0/0 готово запрещён |
| Отдельная предварительная 0/0 запуск | строка оркестратора/раннера до агента; неизвестно, не старт/завершение и не одна из агентских строк |
| Counted/null, zero-unit/string, unit.none, zero-unit на С1/gate | запрещены формой/применимостью, не исправляются новым registry |
| Переименовать только node.code в КОММИТ при связанной session С1 | равенство кодов и проверка связанной session закрывают обход |
| N-правила | unique array<string>; точное объединение node и ненулевых counted linePattern refs; null/фиктивное правило не добавляются |
| N С2/С3/С4/С8 | итого описи / число REQ / число REQ / число AC; summary.N и pass/потолок не знаменатели |
| ПРОФИЛЬ и outcome | КОММИТ/ПУШ имеют профиль запуска, но не подсказку; progress не доказывает успешный git-effect |

launchMarkers=[запуск], finishMarkers=[готово] относятся к своим ролям; старт не превращён в общий finishMarker. Пары hasDate=false не выданы за проектную hasDate=true grammar. Длина, строчные exact маркеры, время, offset, append-only и k>N сохранены. Внешнее завершение проверяется отдельно по `run:581–589`; ни сессии сдачи, ни git/runtime в этой С2 не запускались.

**Входных отклонений находки: 0. Проверено 0 из 0 отклонений.** Не введено новое процессное исключение; представлена уже существующая специальная норма источника.

## Полный проход и прежние 14+5

Осмотрены все **44** строки основной структурной таблицы, **6** рекурсивных fieldSchema ветвей, **6** filename-семейств, **17** групп пар/данных, **14** fenced JSON/JSONC блоков, **83** нормативные записи, **8** UNKNOWN, **5** открытых вопросов, отдельный ответ В-06 и **20** строк C01–C20.

| Группа | Проверенный результат по действующему предмету |
|---|---|
| Required/null/types/enums/domains | пропуск и null различены; закрытые объекты/ветви; безопасные integer, дополнительные диапазоны, enum и required/domain согласованы |
| Optional root | только language/usage/deadlines; absence/disabled/enabled не смешаны; storage логическое, не runtime файл |
| Роли и parameters/defaults | четыре session kind; human/system nullability; массив parameters, required ключ default, enum values, integer bounds и resetPolicy/resetEvents |
| Registry/crosswalk/signatures | не более одного binding kind; predicateCatalog хранит used names, signatures внешние; UNKNOWN не semantic pass; hash не полнота |
| TypedRefs/owners | глобальные namespace и локальные owner; коллизии document/gate/status разрешаются явно; prompt/role/context отдельные bindings |
| Effects/recompute/write domains/cycle Param | route — единственный источник writes; decision effects=[]; reverse indices/preserve; recompute только ссылочный snapshot; recursive inclusion/availability; положительные domains cycle параметров |
| Actions bindings | required payload связан; literal/пять ссылочных ветвей, без кода; event-field только edge.on; порядок действий и boundary/signature |
| Graph↔routes | взаимные IDs, единственный route на edge, target equality, trigger/decision outcome; terminal/phase/reachability/выходы; existing wrong target не unresolved-reference |
| Scenario events/expected.steps | непрерывные индексы, число ожиданий, state-only/actions-only/оба, первая ошибка последняя; события после неё без ожиданий; оболочка не утверждённый fixture 013 |
| Filenames/lenses/facts/N | review summary; facts context n без summary; round/void отдельно; lens ID, expansion/collision; partial/void не законченный заход |
| Comments/JSONC | шапка и node/edge комментарии обязательны до нормализации; диалект предложен явно; комментарии внутри строк не удаляются нормой |
| Coverage/markers/questions | источники и dispositions перечитаны; literal ID/пустые абзацы/итого/Методика; defaults не утверждают и не отвечают за владельца |

Исходы прежних находок перепроверены по этим отношениям:

- Заход 1, №1–4: optional root, human role, parameters/default/values, внешние predicate signatures — закрыты, регрессии не найдены.
- Заход 1, №5–8: typedRefs/local owner/prompt; kind=effect; единственные counter writes/recompute/Param; actual action bindings — закрыты, регрессии не найдены.
- Заход 1, №9–12: graph↔routes; последовательные expected.steps; filename/lenses; обязательные комментарии — закрыты, регрессии не найдены.
- Заход 1, №13–14: literal машинные маркеры/версии описи; пять полных вопросных блоков — закрыты, регрессии не найдены.
- Заход 2, №1: шесть полных nested fieldSchema и declared domains — закрыта; П4 имеет положительную/отрицательную пару required и maxItems.
- Заход 2, №2: nSourceRules/unitRules и k/N — закрыта; zero-unit исключена из множества, counted положительный контроль сохранён.
- Заход 2, №3: facts numberBinding=context и отдельная grammar — закрыта; summary фактам не приписывается.
- Заход 2, №4: отдельный исходный message 013 — закрыта; источник один раз в описи, C18–C20, SHA сверён.
- Заход 2, №5: сохранение плохого журнала — закрыта **только в разовой границе решения владельца**, не утверждением корректности старых строк.

Отклонённых прежних находок: **0**, проверено **0 из 0** отклонений в каждом из заходов 1, 2, 3. Вывод о закрытии не обещает реализацию AC, проверку registries или отсутствие будущих дефектов reader.

## Источники, dispositions, вопросы и журнал

### Пересчёт покрытия

Действующая накопленная опись С1п3: **23 последовательных пункта = 22 отдельных файла + 1 бриф**, последняя строка `итого: 23`. Пункты 14/20/21 явно сохраняют прежнее чтение С1п2, не изображают новое полное чтение С1п3. Новый пункт 23 — review3. Исторические итоги 18/22 не приняты за текущий N.

Все **20** C01–C20 перечитаны по содержанию. В действующей карте 031 **0** dispositions «не требование»/not_requirement; проверено **0 из 0** таких решений после полного пересчёта. Объявление not_requirement в схеме будущего coverage и исторические обсуждения не являются dispositions текущей карты.

Отдельно сверены контекстные части исходного 031: метаданные :3–5, ручное исходное состояние :16, состояние 013 :17, наличие плагина :18; C18–C20 охватывают весь самостоятельный message 013, включая границы/зависимости. Они не превращены в работу над 013 либо доказательство принятого контракта. В прочитанном spec 013 имеется **одна** собственная disposition «не требование: исходное состояние» (:110) — действительно контекст. Это не строка действующей карты 031 и не скрытый нулевой счёт по обоим документам.

Карта C01–C20 — карта предметных разделов, не production-crosswalk каждого предложения методики. Отсутствие authoritative registry/production регламента раскрыто и не предъявлено как самостоятельная существенная находка. Полнота будущего документа требует отдельной сверки по REQ-26/36; формальная schema её не доказывает.

### Вопросы и разрешения

В-01…В-05 открыты. У каждого ? в конце вопроса и восемь отдельных полей: Тип, Адресат, Срок, Влияние, Варианты, Default, Автоответ, Рекомендация. Содержательные рекомендации сверены:

- В-01: отдельно версия схемы/редакция регламента, принятие только после проверки;
- В-02: coverage и независимая сверка не заменяются hash или отсутствующим extractor;
- В-03: strict JSON сценарии и steps — отдельная совместимость, не якобы стандарт 013;
- В-04: version/digest/signatures до зависимой реализации, без нового задания её интегратору этой сессией;
- В-05: ограничения диалекта сохраняют дерево и обязательные исходные пояснения.

Рекомендации содержат вариант и довод, не принимают решений. Defaults сохраняют черновик/внешнюю неопределённость; автоответ запрещён. Срок не разрешает утверждение, публикацию, реализацию или отказ от требования.

### «Сохранить след» и новая С1п3

`log.md:14,17`, `spec-trace.md:224–236`, `spec.md:666`: решение владельца от 2026-10-13 «Сохранить след (Recommended)» ограничено прошлой плохой С1п — 92/83, отсутствие exact 0/5 старт и готово: вместо готово. История и время сохранены, строки не признаны корректными. На нынешнюю С1п3, эту С2 и zero-unit правило исключение не распространено. В-06 только разовое исключение, В-01…05 не закрыты.

Новая С1п3 содержит ровно три строки `progress.log:21–23`: родительский 0/2 старт 13:45, затем 1/2 и 2/2. Подписи **5/64/67≤80**, последнее первое слово exact готово, после него строк С1п3 нет. Родительский старт не дублирован. Префиксы журналов до правки С1п3 (22 строки log, 21 progress) побайтно совпали с входными SHA, сохранёнными в trace. Индексные префиксы также сохранены.

## Пробы — методы, положительные и отрицательные контроли

Все команды — лёгкий read-only Python stdin либо git чтение; временных исходников/фикстур/копий методики в репозитории не создавалось. Подстановки выполнялись только в памяти через copy.deepcopy. Ни один вывод ниже не является ответом validator/runtime.

### П1 — байты, отдельные записи, источники и журналы

Метод: SHA-256 исходных байтов; re.findall с якорем начала отдельной записи, проверка непрерывности и предыдущей пустой строки; ограниченный раздел описи; все C01–C20 по смыслу; полный осмотр вопросов/исходов. Подпись progress считалась после инструментальной отметки времени. Положительные контроли — реально найденные REQ/AC/DNC, пункты описи, вопросные поля и exact маркеры новой С1п3.

Дословные результаты:

```text
spec bytes/lines/SHA256 167897 716 4df9e47e4cb09b2427fe5e27256438ea22f7c89ac2b87c0db1b7108807c9c1a1
REQ 36 continuous True paragraphs True
AC 42 continuous True paragraphs True
DNC 5 continuous True paragraphs True
inventory 23 continuous True total ['23']
coverage rows 20 IDs C01,C02,C03,C04,C05,C06,C07,C08,C09,C10,C11,C12,C13,C14,C15,C16,C17,C18,C19,C20
coverage explicit not_requirement dispositions 0
structural rows 44
data groups ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']
questions 5
question fields [('Тип', 5), ('Адресат', 5), ('Срок', 5), ('Влияние', 5), ('Варианты', 5), ('Default', 5), ('Автоответ', 5), ('Рекомендация', 5)]
progress 11 С1п 1/5 2026-10-13 06:04 92 читаю
progress 14 С1п 4/5 2026-10-13 06:34 83 проверил
progress 15 С1п 5/5 2026-10-13 06:37 64 готово:
progress 21 С1п3 0/2 2026-10-13 13:45 5 старт
progress 22 С1п3 1/2 2026-10-13 13:51 64 diagnostic:
progress 23 С1п3 2/2 2026-10-13 14:09 67 готово
append-only vs index log.md True
append-only vs index progress.log True
report exists False
```

### П2 — diagnostic и доступность источника

Метод: извлечены 14 fenced JSON/JSONC блоков; из двух JSONC сняты только **семь известных целых строк** комментариев шапки/узлов/рёбер, затем стандартный json.loads. Это **не общий JSONC/schema/semantic validation**. Осмотрена пара 16; в памяти составлены пять отклонений паспорта и две одиночные мутации mapped diagnostic. Реальный источник прочитан командой `git show f333efa319e445efe029ee6963b477ca8fe3bc1c:task-runner.md` в read-only клоне методики; якорь посчитан по точному заголовку.

Дословный вывод основной части:

```text
strict trees 14 known full comment lines 7 NOT general JSONC/schema/semantic validation
diagnostic fields ['category', 'code', 'column', 'jsonPointer', 'line', 'message', 'severity', 'sourceRef', 'sourceRefReason']
missing manifest data structural None manifest-missing
invented reference data True manifest-missing
input specimen missing tree exists True manifest present False text expected reason manifest-missing
input specimen manifest-null tree exists True manifest present True text expected reason manifest-invalid
input specimen methodology-null tree exists True manifest present True text expected reason manifest-invalid
input specimen commit-int tree exists True manifest present True text expected reason manifest-invalid
input specimen files-null tree exists True manifest present True text expected reason manifest-invalid
independent pinned source commit f333efa319e445efe029ee6963b477ca8fe3bc1c SHA256 10396a7b7e8fb7b70553647b7204858bbe3ae5861b06b4c45f55a6b55bf4371f anchor occurrences 1
mapped diagnostic specimen semantic invalid-document-rule ref present True reason None NOT reader output
mapped single mutation sourceRef different keys ['sourceRef'] ref/reason False None
mapped single mutation sourceRefReason different keys ['sourceRefReason'] ref/reason True mapping-unavailable
source mismatch positive True one hash mutation False
diagnostic mapped mutations remain specimens; no validator/runtime called
```

Дополнительно предметно осмотрены **5** условий mapping-unavailable: unavailable-bytes, wrong-hash, wrong-commit, missing-anchor, ambiguous-anchor; **6** отклонений источников деклараций: unknown-source-file, missing-sourceRef-key, sourceRef-null, sourceRef-wrong-type, wrong-sourceRef-commit, empty-sourceRef-section. Положительный контроль — корректная ссылка на независимо прочитанный единственный якорь; отрицательные — точечные нарушения пары и подмена одного hash. Их ожидаемые исходы взяты из текста, **не измерены на reader**. Syntax при duplicate-key/неоднозначном дереве и structural/type корня не object проверены чтением правил :138–142, не этой strict JSON пробой.

### П3 — counted/zero-unit и nSourceRules

Метод: обе legal/illegal linePattern пары сравнивались по ключам; counted node/unit и точное множество refs — по connected-fragment. В памяти составлены три counted строки, по одной zero-unit строке для каждого из двух кодов, отдельные launch строки, добавление второй готово и одиночные подстановки mode/unitRule. Положительный контроль — counted совпадающая пара k/N и законные формы обоих кодов; отрицательные — null/string и unit.none/counted подстановки.

Дословный вывод:

```text
pattern counted keys ['grammar', 'hasDate', 'id', 'mode', 'unitRule'] single difference ['unitRule']
pattern zeroUnit keys ['grammar', 'hasDate', 'id', 'mode', 'unitRule'] single difference ['unitRule']
counted node/session code С1 С1 unit {'source': 'spec', 'numeratorRule': 'unit.spec'}
N union equals nSourceRules True ['unit.spec']
counted sample lines 3 expected N+1 3 first/last words старт готово
zero specimen КОММИТ agent lines 1 profiles 0 launch/start different True extra-ready mutation lines 2
zero specimen ПУШ agent lines 1 profiles 0 launch/start different True extra-ready mutation lines 2
counted known N=0 retains non-null rule; unknown N retains no-data reason; neither grants zero-unit mode (text inspection)
negative specimen counted-null mode counted ref None
negative specimen zero-string mode zero-unit ref unit.spec
zero mutation unitRule difference ['unitRule']
zero mutation mode difference ['mode']
NOT session/git/progress runtime execution
```

Семь точных строк источника **46/93/133/215/581/588/589** дополнительно выведены и прочитаны полностью. Законный неизвестный N не превратился в отсутствующие единицы; одна progress строка не названа доказательством коммита/пуша. Применимость к session.code, запрет non-session, временные grammar и остановки сверены по предметным абзацам и AC-15.

### П4 — соседние отношения и отрицательные мутации

Метод: осмотрены все 14 полученных деревьев в их заявленном статусе; в connected-fragment обе route↔edge пары, terminal, counter index и required action binding. В памяти изменены только target одного route, второй eventIndex, maxItems вложенного array. Положительные и отрицательные стороны nested schema, enum default, owner и disabled subsystem сравнивались непосредственно.

Дословный вывод:

```text
connected root/nodes/edges/routes 26 3 2 2
route route.spec.done backlink True target equality True
route route.approve backlink True target equality True
route mutation existing target True equality False
terminal outgoing 0
counter increment index ['route.spec.done'] decision effects []
action required/bound ['gateId'] ['gateId']
scenario events/steps/indices 2 2 [0, 1]
scenario single mutation indices [0, 0]
nested required legal/illegal ['x'] ['x', 'x']
nested array keys/maxItems ['items', 'maxItems', 'nullable', 'type'] 2
array mutation missing keys ['maxItems']
bounded domain 1..safeMax into 1..safeMax True 0..safeMax into 1..safeMax False
namespace pair owner legal/illegal doc.spec None
enum default legal/illegal membership True False
subsystem disabled legal/illegal storage None {'scope': 'task_state', 'key': 'usage'}
NOT full structural/registry/semantic/013 compatibility pass
```

14 блоков — **11** partial/условных пар либо одиночных структур, **1** предлагаемая scenario оболочка, **1** намеренно неполный корень, **1** connected-fragment. Facts и остальные inline/text пары проверены отдельно внутри 17 групп. Illegal значения закономерно могут быть JSON-синтаксически допустимыми. Connected-fragment имеет 26 ключей, но неполон по норме, registries, cycles/outcomes/coverage/diagnosticCatalog; полного structural или semantic pass ему не присвоено.

### П5 — сохранность входов/индекса и границы записи

Метод: повтор SHA-256 исходных байтов всех защищённых входов, `git ls-files --stage`, байты самого index через `git rev-parse --git-path index`, `git diff --check HEAD`, префиксы журналов. Сравнение выполнялось одним byte-preserving Python/subprocess способом; PowerShell text encoding не подменяло байты. Совокупный fingerprint 31 защищённого файла служит контролем сохранности, не счётом прочитанных источников; новый отчёт из него исключён.

Начальный и повторный отпечатки:

```text
protected files 31 aggregate SHA256 7c630b67d86509bdd4d8e7e152ab5c5a08a2e5958c8e9852d251ef2d7ecb49f9
index entries SHA256 2e62d3f32e0303a32e03c72d4d96888a67b5d3668ad8458165699020bb92ee38
index raw SHA256 12342f43ddd8b8dc8343145c50619c6fb878705582fcdb9acef0fe28b287c0fc
git diff --check HEAD 0 b'' b''
parent prefix log.md 22 263ea634d1ea7558a7b167446d41decedb357c71ee18344b4b336c58e36a001e
parent prefix progress.log 21 16693611dff48f5bf89a4bbf93c550828f6c450c0cac253f4534d88bb27e59a1
task files ['message.md']
plan exists False
```

Неизменяемые входы отдельно:

```text
input task/message.md f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d
input spec-review-1.md 83c74c54f08c7fb420b4e8701fe7a9397707c64505a0300a4b411862ef338efe
input spec-review-2.md 54aeedc770969cb86a6c0e016d336933128b7bdf36e4eb3b454d0f7d76bbaef1
input spec-review-3.md c7a06030423c4b780d2a578c262ff543d7059b46e9f0beb109bf55681ca41bdb
013 spec.md 1060 f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376
013 task/message.md 74 88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9
```

Начальная/конечная SHA spec совпала с версией отчёта. Индекс и защищённые входы сохранились; единственный новый артефакт — `doc/tasks/031-runner-regulation-in-plugin/spec-review-4.md`. `git diff --check HEAD` — только пробельная проверка существующего diff, не schema/semantic проверка и не проверка untracked отчёта; его хвостовые пробелы контролируются отдельно.

## Размер и ограничения доказательства

**Предупреждение L:** 167897 байт при пределе 150000, превышение **17897 байт**. Причина раскрыта в `spec-trace.md:486`: правка добавила 19910 байт к прежним 147987 — закрытые diagnostic причины/приоритеты, counted/zero-unit ветви, пары/REQ/AC и обоснования. Порог — предупреждение ближайшим воротам владельца, не самостоятельная существенная находка без предметного основания. Требования ради лимита не сокращены; самовольное деление/утверждение не выполняется.

Не выполнены и не объявлены выполненными:

- общий JSONC parse/нормализация, duplicate-key rejection, UTF-8/BOM/escape/общие block comments и реальные координаты reader;
- полный schema/structural validator, semantic success, authoritative registry/signatures, production-crosswalk и полнота production-регламента;
- совместимость с утверждённым контрактом 013 (его нет), сценарные/runtime прогоны, будущие AC на реализации;
- стражи приватности, сборки, npm test и тяжёлые тесты; они не запускались, отсутствие прогона не PASS;
- утверждение spec/plan, зачёт ворот, публикация и запуск следующего захода.

Существующий parser/runner плагина не исследовался и не использован как доказательство. Непроверенные external registries не превращены в дефект существующей реализации; проверена однозначность статической формы при этих открытых зависимостях.

## Перечень прочитанного

Все пути относительны соответствующим репозиториям/деревьям; локальные абсолютные пути машины не включены. Прочитаны **28 отдельных файлов + текущий бриф = 29 единиц собственного входа С2**; точный полный/применимый объём каждого указан ниже. Это не замена накопленного `итого: 23` С1п3.

**Проверяемое дерево — 20 файлов:**

- `AGENTS.md` — 113 строк; `README.md` — 43;
- `doc/canon/README.md` — 40; `doc/canon/process.md` — 118; `doc/canon/decisions/README.md` — 68;
- ADR-0001 — 43; ADR-0004 — 45; ADR-0006 — 49; ADR-0007 — 59; ADR-0008 — 51; ADR-0009 — 44; ADR-0010 — 46 строк, решения и границы с уточнениями;
- в `doc/tasks/031-runner-regulation-in-plugin/`: `spec.md` — все 716, `spec-trace.md` — все 506, `spec-review-1.md` — все 515, `spec-review-2.md` — все 356, `spec-review-3.md` — все 446, `log.md` — все 25, `progress.log` — все 23, `task/message.md` — все 46 строк.

**Дерево 013 — 2 файла:** `doc/tasks/013-runner-core/spec.md` — все 1060; `doc/tasks/013-runner-core/task/message.md` — все 74 строки. Разница закреплений/черновой статус/отдельное утверждение контракта и последовательность сценариев сверены по текстам. Его код/план/реализация не исследовались и не менялись.

**Методика — 6 файлов через git show на `f333efa319e445efe029ee6963b477ca8fe3bc1c`:**

- `task-algorithm.md` — все 370 строк;
- `task-sessions.md` — все 399, включая полный промпт С2 и протокол повторов;
- `task-runner.md` — все 697, длинная :305 дополнительно целиком без обрезки;
- `README.md` — целиком;
- `methodology.md` — полные применимые разделы 2–5, 8–10, 12–13, 18; длинные строки прочитаны с переносом только вывода, без потери текста;
- `completeness-check.md` — вводная :1–28 и полные применимые разделы 5–7 (:1110–1190), длинная :1190 также без обрезки.

Копий методики не создавалось. Управляемые полные выводы инструментов использованы для дочитывания обрезанных preview, не как нормативные копии в проекте. Ранние исторические версии spec и другие внешние ссылки 013 не объявлены новым чтением/новыми источниками требований этой С2.

## Маршрут

Передать этот отчёт родительской сессии. Предметной правки С1 по этому заходу не требуется. Если результат будет засчитан, это **только первый чистый заход** после серии 0; остаётся отдельная новая независимая проверка в разрешённом потолке 5. Решение о её запуске — у родителя, не выполнено этой С2. Открытые вопросы и предупреждение размера сохраняются владельцу на предусмотренном шаге.

Спецификация остаётся черновиком. Отчёт не утверждает документы, не принимает ворота, не возобновляет 013 и не разрешает реализацию или публикацию.
