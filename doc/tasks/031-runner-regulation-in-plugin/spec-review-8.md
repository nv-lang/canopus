Заход 8: существенных 1, поверхностных 0, проб 6
Версия: SHA-256 `5414f2feccdb128d5704dd0db3f79918697b1f8225fb26a2f4e5f55250d5da1e`; spec.md — 171509 исходных байт, 720 строк, 36 REQ / 42 AC / 5 DNC.

# Независимая С2-8: JSONC-регламент задачи 031

## Результат и предел вывода

Назначенное чтение и самостоятельный предметный проход завершены. Новых доказанных существенных или поверхностных находок в исходном пакете нет. **Есть одна существенная находка собственного протокола С2-8: источник22 отмечен завершённым до дочитывания обрезанного фрагмента. Это блокер зачёта чистого захода, исключения не получено.** Три дефекта свежего log из полного review7 устранены в разрешённых владельцем границах; прежние 23 существенных исхода сверены по действующим нормам и данным, не по заявлениям разделов «Изменения». Отклонённых находок нет.

**Чистый заход не заявлен, серия не увеличена.** Дочитывание закрывает фактический пробел чтения, но не исправляет преждевременную отметку журнала. Зачёт/решение по этому блокеру делает интегратор/владелец, не проверяющий. Исторический review7 остаётся 3/0/6 и не становится чистым от последующей коррекции или решения о его собственном progress. Отчёт не утверждает spec/plan, не принимает продукт, не закрывает вопросы и не запускает заход 9.

Сессия новая, работа выполнена в отдельном собственном дереве. Чтение именно назначенного незакоммиченного входа, не spec основной копии. Все прежние review и неполная попытка прочитаны по обязательному конверту/промпту С2. Независимость здесь — независимая сессия, самостоятельное полное чтение, пересчёты и пробы; не утверждение об опытном режиме methodology:712/719, который исключает чтение следа цикла. Это различие не скрывается.

Слово «Только формат (Recommended)» сохраняет границу статического формата и внешнего исполнителя, а не разрешает опустить ветви, комментарии или неизвестные контракты. Черновой статус 013, её отдельное утверждение контракта и пауза реализации сохранены. Registries/signatures/production crosswalk/fixture 013 не получены и не выданы за FACT или semantic success.

## Линзы и глобальный счёт

| Линза | Существенных | Поверхностных | Разные пробы |
|---|---:|---:|---|
| Согласованность и исполнимость | 1: собственный протокол | 0 | П1–П6: 6 |
| Обход и злоупотребление | 0 | 0 | П1–П6: 6 |

Глобально **1 / 0 / 6**, не сумма ссылок двух линз. Исходный предмет0/0; единственная finding — свой журнал, включённая в общий счёт как обязательный критерий приёмки этого конверта. Находок с неуказанной критичностью нет; предупреждение размера и раскрытые исторические исключения не добавлены как новые находки. Ни одна будущая AC не названа выполненной на реализации.

## Находка и блокер зачёта

1. **Источник22 был отмечен завершённым до полного дочитывания назначенного диапазона.**

   критичность: существенная — меняет доказательство фактического момента полного чтения и нарушает обязательный критерий собственного журнала. Не стилистика, не дефект JSONC-схемы.

   уровень: требования — протокол С2-8 из конверта и закреплённого Канона.

   **Цитата нормы:** конверт: «затем сразу по одной строке после каждого источника»; «Урезанный preview не полное чтение… полный managed output дочитать»; «Старые строки не менять и исключение себе не принимать». Закреплённый task-runner:87: «одна строка на каждую завершённую единицу, дописывается сразу после неё»; methodology:1005–1008: «Вывод не делается по обрезанному чтению».

   **Место:** собственный `s2-8/progress.log`, строка `С2в8 22/37 [2026-10-14 02:36] completeness-check: вводная и 5–7; опытные нормы не FACT`.

   **Доказательство:** git show completeness-check сохранён в managed output; назначенные строки1–28/1110–1190 читались. Supplemental вывод строк1184–1190 обрезал начало1188: preview начинался только концом этой строки; последующий read этого supplemental output1–9 завершился на заголовке `LINE 1188 CHARS 838`, **не на её тексте**. Несмотря на это записан22/37. При финальном self-check отдельным read строки10 того output получены все838 символов исходной1188 — про номера реестров/назначающего/резервирование и отсутствие практических прогонов. Это именно хвост назначенного раздела7, не ненужный новый источник.

   **Фактический исход:** теперь весь назначенный текст прочитан; предметные результаты после дочитывания пересмотрены, новых противоречий формата не обнаружено. Преждевременная progress строка сохранена и не названа корректной. Поздний read не превращён в своевременную completion отметку. Исключение С2-7 не применено, самостоятельного повторного захода нет. Требуется решение управляющего циклом по процессному блокеру; чистый PASS не выдаётся.

## Полный самостоятельный предметный проход

Ниже `spec:N` — строка назначенного spec задачи 031. Осмотрено всё содержимое **44** строк основной structural table, **6** рекурсивных ветвей, **6** строк filename-семейств, всех **36 REQ, 42 AC, 5 DNC**. Перечни структур/ID и численные результаты сохранены в `s2-8/probe-1.txt`.

### Корень, required/null/types/domains и закрытые ветви

`spec:17–23,27–70,74–89,267,279,313`: 25 обязательных корневых ключей; optional только language/usage/deadlines, object/non-null. Пропуск не null и не default. Пустой каталог допустим там, где нет отдельного запрета, но не доказывает полноту; phases непустой, graph.edges минимум один, diagnostic codes/display fields непустые. Unknown-field запрещён рекурсивно, расширение только через версию; unknown major/несовместимый reader не дают fallback.

Все 44 структуры перечислены собственной П1: корень, compatibility, manifest, methodology, registryBinding, sourceFile, phase, session, node, unit, graph, edge, route, gate, decision, gateEffect, counterEffect, predicate, predicateCatalog, document, statusRule, documentField, documentMarker, progressFormat, profile, profileValue, profileStage, profileLimits, counter, parameter, cycle, action, event, payloadSchema, fieldSchema, coverageEntry, diagnosticCatalog, diagnostic, display, displayField, scenarioContract, subsystem, lens, actionUse. Базовые типы/условные поля и исключения каждого сопоставлены с инвариантами, REQ/AC и примерами.

Closed unions не расширены догадкой: четыре session kind, пять node kind, три route trigger, шесть counter operations, три counter type, четыре parameter type, три resetPolicy, пять cycle stage, две progress mode, шесть valueBinding, две numberBinding, три coverage disposition, три diagnostic category и четыре sourceRefReason; multiplicity/normalization/onInvalid, severity, effect boundaries также прочитаны. Внешние business enums отличаются от этих локальных closed sets.

### fieldSchema и bindings-домены

`spec:60–61,74–89,218–224,325,584`: string/boolean содержат ровно type/nullable; integer добавляет mandatory minimum/maximum; enum — непустой distinct enum; array — mandatory items/maxItems; object — properties/required/additionalProperties=false. Ключи каждой ветви закрыты на любой глубине. Integer безопасный, boolean не integer; null границы не отменяет safe integer range. maxItems integer 1..10000, без null/default. Required unique/subset, пустой properties/required допустим. PayloadSchema — closed object без nullable.

Наличие свойства не равно nullable значения. В nested pair x required/nullable, y optional/non-null: {}, x:1/y:null незаконны; x:null и x:1/y:[] законны по тексту. П2 отдельно дала unique required против дубля и удаление maxItems. Включение всего source domain, а не удачного snapshot: числовые границы, enum inclusion, enum→string, array items/maxItems, object keys/required/recursive compatibility. Optional source не покрывает required получателя; nullable не покрывает non-null. Для counter set/recompute domain переводится по bounds и всегда required/non-null. П3 арифметически различила min=1 и min=0, maxItems=2 и 3, разрешённый enum и unknown. Это не общий schema validator.

### Roles, параметры, profiles, optional подсистемы

`spec:34–36,51–57,103–107,115,134,138,160–170,285–287,311–313,524,542–544,578,582`: agent/meeting требуют role/promptRef, human role ненулевой и prompt=null, system оба null. Node/session code и phase совпадают; gate/session refs взаимоисключаются по kind. Ненулевой unit только counted session, не gate/terminal.

Parameters — массив; default/minimum/maximum/values ключи mandatory. Required=true/default=null против false/type-correct non-null default. Integer bounds согласованы, enum values unique/default в домене; у других типов values=null, у неinteger min/max=null. On_named_event требует непустой unique resetEvents, never/on_new_task — []. Reset не придумывает ноль для обязательного внешнего input. П3 сверила sample enum default membership [True, False].

Profiles enabled/disabled, exact subkeys, external profile-value/stage, inheritance cycle и tier bounds согласованы. Disabled defaults={} и stageRules=[] — явная отдельная ветвь, не profileValue с отсутствующими ключами. Cycle stage не profile-stage. Запуск КОММИТ/ПУШ имеет профиль, но не подсказку ПРОФИЛЬ. Отсутствующая subsystem выключена; disabled все четыре nullable поля null; enabled closed input/output, logical storage и noData с обязательной причиной. Это не реальный файл состояния и не реализованный перевод/учёт.

### Refs, owners, registry/signatures и coverage

`spec:31–32,93–101,111,119–132,138,299,323,335,343,504–506,532,572,586,594`: простые refs разрешаются в названный каталог, не по префиксу ID. TypedRef имеет **20 глобальных** namespace и **5 локальных**; local owner обязателен у status/field/marker (document) и decision/gate-effect (gate), global owner запрещён. Route.invalidate/enqueue, document.requiredBy и display.source имеют разные ограниченные поднаборы; distinct по полной ссылке, enqueue упорядочен. AllowedNext/defaultDecision внутри своего owner. Совпадение ID document/gate разрешено, unqualified local status нет. П3 owner pair дала [True, False].

Все **16** видов registryBinding прочитаны; максимум один на kind, version/digest обязательны. PredicateCatalog содержит ровно used names, не declarations/signatures; external predicate args/result/outcomes, grammar/context domain/availability, prompt sourceRef/hash/substitutions, unit numerator/denominator и route-trigger outcome matrix закрепляются отдельно. Effect-kind не существует, kind=effect единственен. Binding без matching external bytes не даёт semantic success. SourceFile path — ограниченный relative POSIX путь, не исполняемый callback; sourceRef exact file/section/commit, commit по manifest.

Coverage represented требует targets и запрещает reason; external_contract/not_requirement требуют reason и допускают []. Все три ветви осмотрены, anchor/sourceFile/typed owner/ref не пропущены. Sample: **1 represented, 0 external_contract, 0 not_requirement**, не полная карта. C01–C20 — карта предметных разделов, не production crosswalk каждого предложения методики; hash подтверждает идентичность, не completeness. UNKNOWN-03/04/07/08 остаются неизвестными.

### Counter effects, recompute, cycles

`spec:39–43,55–57,89,113–115,182–194,317–321,331,546–548,576–578`: set требует совместимый binding, recompute — только ссылочный snapshot; literal recompute/выражение запрещены. Increment/decrement только integer/null binding и ±1; reset initial/null; preserve/null. When=route/event имеет точную null/event=edge.on комбинацию, не глобальную вторую подписку. Максимум один effect на counter/route, даже одинаковые дубли запрещены. Decision.counterEffects=[], route — единственный источник writes, preserve и incrementOn/resetOn точные обратные индексы.

Cycles уникальны по пяти stage, значения лишь по трём integer *Param refs с minimum≥1/≥0/≥1. Дубли cleanChecks/minimumProbes/ceiling в cycle запрещены. RepairRoute ведёт к fixer, не checker/terminal. Обычная правка/restart не неявный reset; jump требует явную политику каждого counter и owner/audit как внешнюю декларацию. П2 сверила обе реальные sample route operations и counter index; П3 counter vs literal recompute. Фактические значения при исполнении и переполнение не измерялись.

### Actions/payload/effect boundaries

`spec:58–60,70,111,117,196–202,325–331,453–465,552–554,584`: шесть exact valueBinding ветвей, без expression/dotted path/fallback. ActionUse связывает required и только объявленные optional свойства; event-field только edge.on, document-field через grammar domain/availability, object/array целым literal или совместимой ссылкой. PayloadSchema точно external signature; gateEffect.payload уже конечные значения effect signature. Boundaries и confirmation/resultEvent прочитаны по обеим таблицам и REQ. П2 нашла actual required gateId binding, не только schema declaration; П3 literal vs expression. Ни git, ни тесты, ни сессии, ни jump этими данными не исполнялись.

### Graph/routes/ворота

`spec:33–43,117–119,138,204,289–295,341,392–428,526–530,592`: граф единственный авторитет from/to/on/predicate/outcome/actions. Route аннотирует одно edge с взаимными edgeId/routeId и target=edge.to. Все три trigger ветви сверены: event↔on/outcome, predicate-outcome↔predicate/outcome, gate-decision↔gate узла from/local decision/route/outcome matrix. Orphan/second route и второй transition через decision запрещены. OwnerRequired=true не получает default; false default local и по основанию нормы. Отдельные delivery gates не слиты с push.

Start/terminal/phase ownership, обязательная достижимость, недублирование from/on/outcome, исчерпывающие outcomes, циклы с declared artifact/выходом остаются требованиями полной проверки. Gate ожидание не глобальный terminal. П2 дала обе backlinks/target=True, terminal node.done/outgoing=0 и совпадающий phase terminal; одиночная замена target на существующий node.spec нарушила equality, не addressability. Две sample ветви не выданы за полноту алгоритма.

### Scenarios и граница 013

`spec:67,146,206–212,333–335,556–560,590,594`; 013:445–451/461–512, message013:40–49/67: proposed shell exact/non-null, events/steps nonempty, requiredLinks, versions/ref; непрерывные eventIndex от 0, успех один step на событие. State-only/actions-only/оба различаются по наличию ключей, error только если enabled в expectedKinds, первый error последний step, дальнейшие events без ожиданий/не исполняются этим fixture. Actions упорядочены, expected независимые данные. П2 дала 2/2/[0,1], одиночная отрицательная мутация [0,0].

Оболочка совместима **по заявленному смыслу**, не доказана как утверждённый контракт 013. В 013 pin `cd3cb09290d66c6231020b0fb06a29c0b1c3cb8b`, не pin 031. Контракт внутри 013 ещё не разработан/утверждён, предложенные path/v1 не приняты этой сессией. Runtime state/actions/error/payload schemas и matching fixtures не доступны; запуск Новы/адаптера и future AC не выполнен. Иные ссылки/образцы 013 не открывались и не превращены в дополнительные источники этого С2.

### Filenames, lenses, facts, review и N

`spec:46,69,119–132,214,234–241,301–307,538,566`: шесть строк семейств, две numberBinding ветви. Basename, exact N/round/lens/void, запрет unknown/repeated tokens/glob/collisions; positive safe integer без leading zero, lens по ID, не title. Review N=summary.N=переданный pass; facts N=context current meeting n без summary; feedback/customer round и void ordinal отдельны. Partial/void не completed review/facts, не увеличивают max completed N. Facts: четыре начала ответа, source кроме не измерено, финальная не читал специально разрешена. П3 осмотрела две реальные text lines без summary и сравнения 2=2/3≠2.

Progress N не summary.N/pass/потолок: С2 — итого описи, С3/С4 — REQ, С8 — AC. Рефы unitRules unique/exact union node и counted pattern refs; zero-unit null не элемент. Нейтральный пример итого в spec:216 сверяется с actual С1 inventory23, но собственное чтение С2-8 — N37, не N23.

### Counted/zero-unit, stopKinds, JSONC/normalization/diagnostics

`spec:50,99–109,138,243–263,275–281,309–311,337,349–354,439–441,540,570,588`: counted требует non-null unit/rule и совпадающую session; zero-unit только КОММИТ/ПУШ по связанной session.code, unit/rule=null и одна 0/0 старт без ПРОФИЛЬ/второй готово. Gate/null, переименование node.code или counted denominator=0 не дают zero-unit. 0/0 запуск — отдельный доагентский маркер неизвестных единиц. П3 сверила обе пары, три counted строки и по одной строке каждого zero code, а также четыре stop sets. StopKinds полный unique набор **пяти**; чужое/missing/duplicate и stop без kind/причины противоречат тексту. HasDate=false учебных пар не подменяет hasDate=true проектную grammar.

UTF-8 без BOM, // и /* */ лишь вне строк, strict quotes/escapes, no trailing comma/duplicates/NaN/Infinity. Comments header/node/edge mandatory до нормализации; source header не заменяет manifest. Удаляются только comments, значения и порядок массивов сохраняются. Два JSONC sample имеют семь известных целых comment lines; их снятие в П2 — **не общий JSONC parse**. Дубликат ключа обычный json.loads принял как {'a':2}, поэтому его дерево не доказательство REQ-02/AC-03.

Diagnostic девять mandatory ключей; category syntax/structural/semantic отдельно от availability source. Четыре причины по приоритету syntax-unavailable→manifest-missing→manifest-invalid→mapping-unavailable; malformed manifest не syntax. У successful mapping ref обязательный, reason=null; обоим null/non-null, missing reason и ложному source нет разрешения. Декларационные predicate/parameter/action/event sourceRef остались non-null. П4 independently git show дала реальный hash и один anchor таблицы единиц; mapped diagnostic лишь conditional specimen, **не output reader/измеренные координаты**.

### Markers, вопросы и REQ/AC/DNC

`spec:273–343,512–606,618–672`, trace:5–33, log:7: все 83 literal ID последовательны и отдельными абзацами. Methodology marker найден. Пять В-01…05 с ?, восемью отдельными полями, recommendation+доводом и запрещённым autoanswer. Defaults оставляют proposal/UNKNOWN, не утверждают format/границы/registry. В-06/ОТВ-06 — только старое process exception, не ответ В-01…05. Каждый REQ/AC сопоставлен с формой, правилом или явной external boundary выше; DNC-01…05 сохранены собственными действиями и fingerprints. Требования E/F текста рассмотрены; это не PASS исполнения AC-01…42.

## Предметные исходы прежних 23 существенных находок

Каждая строка ниже — независимое сопоставление действующего текста с исходной finding, не доказательство фразой «исправлено». `trace/log` — назначенные документы С1; номера spec текущие.

| Исход | Статус С2-8 | Действующее доказательство |
|---|---|---|
| review1/1 optional root | Закрыта | spec:27,68,134,152–158,313,544; три subsystem, absence/disabled/enabled |
| review1/2 human role | Закрыта | spec:34,160–164,285,524; четыре role/prompt/null ветви |
| review1/3 parameters | Закрыта | spec:56,115,166–170,319,578; массив/default/values/границы |
| review1/4 predicate signatures | Закрыта | spec:45,97,172–178,299,532; used names и внешний registry |
| review1/5 namespaces | Закрыта | spec:93–99,111,121; owner, prompt/role, local/global и cycle stage |
| review1/6 effect binding | Закрыта | spec:31,42,97,180,293,574; effect, не effect-kind |
| review1/7 effects/cycles | Закрыта | spec:89,113–115,182–194,317–321; writes/indices/recompute/*Param |
| review1/8 payload uses | Закрыта | spec:70,111,196–202,325–327,453–456; actual required binding |
| review1/9 graph-route | Закрыта | spec:117,204,289–291,416–426,592; backlinks и existing wrong target |
| review1/10 scenario sequence | Закрыта | spec:146,206–212,333–335,556–558,590; steps/index/error |
| review1/11 lenses filenames | Закрыта | spec:46,69,119–132,214,301,538; tokens/catalog/expansion |
| review1/12 comments | Закрыта | message:22, spec:136,214,281,350–351,397–413,522 |
| review1/13 markers/version | Закрыта в прежнем составе | spec literal ID, trace:5–33/39–51, log:7; собственный П1 |
| review1/14 questions | Закрыта | spec:618–666; ?, поля, рекомендации, запрет autoanswer |
| review2/1 fieldSchema | Закрыта | spec:74–89,218–224,325,584; все шесть рекурсивных branches |
| review2/2 nSourceRules | Закрыта | spec:50,99–107,226–232,287,309,540; exact unitRules union |
| review2/3 facts.N | Закрыта | spec:121–132,234–241,301–305,538; context n без summary |
| review2/4 message013 | Закрыта | trace:28/86–90, spec:484/506; отдельные spec и message, полное своё чтение |
| review2/5 старый progress | Разово разрешён след | log:14/17, trace:224–236, spec:670; 92/83/no-start/готово: не корректны |
| review3/1 diagnostic | Закрыта | spec:64,138–144,243–251,337,354,570,588; category/ref/reason |
| review3/2 zero-unit | Закрыта | spec:35–36,50,99–109,253–261,285–287,309–311,540 |
| review5/1 stopKinds | Закрыта | spec:50,109,263,309,439–441,540; все пять distinct, kind+причина |
| review6/1 22/23 | Закрыта | spec:216,307,540; trace:5–33/51; neutral итого и actual23 |

Итого **14+5+2+1+1=23** разных существенных исхода. Review4 findings0, его пробы не вошли в наши. Отклонённых исходов review1/2/3/5/6 **0**, проверено **0 из 0** отклонений. Повторного открытия без нового основания нет.

## Три findings review7 и точные коррекции fresh log

Нормы перечитаны: process:46–49 — семь видов и датированная запись; AGENTS:94–99/ADR-0006:21–24/methodology:897–903 — публичность всех документов. П5 — свой полный разбор текущего log, не ссылка на исполнителя.

| Finding review7 | Результат по fresh log |
|---|---|
| 1: вид С1п5 вместо нормативного | log:33 — **2026-10-13 16:32 документ:**. С1п5 в тексте, не enum вида. Во всех 45 строках bad kind=[] |
| 2: склеенные 16:39/16:49 | log:34 и :35 самостоятельны, прежние date/time сохранены; 45 физических строк = 45 anchored = 45 всех dated prefixes, joined=[] |
| 3: два локальных пути | В log rooted local path tokens **0**; записи :34/35 используют нейтральное описание дерева/ветку. Значения прежних реквизитов не перенесены в этот отчёт |

Log:41 — решение владельца **2026-10-13 21:14 «Исправить (Recommended)»**: три точные коррекции, сохранить даты/факты, spec не менять. Log:42 — отдельный результат **21:18 документ:** с источником этого решения и без признания прежних строк корректными. Log:44 подтверждает технический перенос/коррекцию, не дополнительный С2.

Содержание :34 сверено с текущим message: существует, **46 строк**, тот же SHA `f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d`; correction предыдущего ложного сообщения не потеряна. :35 сохраняет full-reading claims как исторический след автора, spec171509/SHA, 36/42/5, inventory23=22+бриф, прежние fingerprints и времена. Источник прежних дефектов — полный review7 с exact датами/счётами и описание fresh записей. **Полного побайтного diff прежнего дефектного log нет:** старые байты не назначены/не доступны как отдельный вход. Не утверждаю побайтное сохранение каждого слова старой записи; проверена разрешённая судьба трёх findings, видимые даты/факты и действующий corrected input. Сохранность уже исправленного log во время этого С2 доказана собственной start/end парой.

Log:43 — отдельное **2026-10-14 01:47 «Сохранить след (Recommended)»** только для собственного progress автора полного С2-7: no-start, 85 символов, неверный N, grouped entries. Это не более старый В-06, не permission этой С2-8, не исправление старых строк и не чистый7. Последняя запись :45 — «Два захода (Recommended)», 02:24, последовательные независимые8/9, потолок9/история/серия0. Новый8 сам себе ничего не засчитывает.

## Опись, dispositions и полнота исходных фрагментов

Собственная опись: **36 файлов + бриф = 37 источников**, отдельно в своей spec-trace с заголовком С2-8. Накопленная опись С1: **23 = 22 файла + один бриф**, точные пункты/итого23; пункты14/20/21 явно сохраняют прежнее чтение С1п2. Исторические18/22 в trace и spec:696 не текущий итог. Учебный N18/summary2 в spec:232 — условная пара, не факт нынешнего N.

Все **20** C01–C20 прочитаны и пересчитаны. Реальных dispositions «не требование»/not_requirement в карте031 **0**, осмотрено **0 из 0**, а не ноль по всему репозиторию. В spec013:110 **одно** самостоятельное «не требование: исходное состояние» — действительно контекст, не product request031. Sample coverage одна represented; definition enum и исторические пробы не rows карты.

Собственное содержательное сопоставление C01–C20:

| ID | Судьба источника |
|---|---|
| C01 | REQ-01/02, FACT-01: формат раннера |
| C02 | REQ-02–04, FACT-02: выбранный JSONC |
| C03 | DNC-01–05: только формат |
| C04 | REQ-05–12/AC-06: паспорт/граф, обязательные comments |
| C05 | REQ-13/14: фиксированные named predicates |
| C06 | REQ-27–30/DNC-02: исполнитель external |
| C07 | REQ-29/30/DNC-02: jump owner/audit/явные resets |
| C08 | REQ-31–34: strict JSON scenarios |
| C09 | DNC-01–05: границы/машина/чужие входы |
| C10 | Опись, REQ/AC/DNC, тип/проверки/вопросы/UNKNOWN: шаги1–7 |
| C11 | REQ-05–08/19, AC-15: codes/units/N/zero-unit |
| C12 | REQ-15–19/AC-15: machine documents/progress/launch |
| C13 | REQ-19–22: profiles/language/display/usage, не runtime outcome |
| C14 | REQ-09–14/23–26/35: run_task/state/loop/ворота |
| C15 | REQ-31–34: sequence state/actions/error |
| C16 | FACT-03, UNKNOWN-06/08: draft contract013 |
| C17 | REQ-05/33/35, AC-30/39, DNC-04/05: Канон/mapping/UNKNOWN |
| C18 | FACT-03, DNC-01/02/04: отдельное message013, metadata/context |
| C19 | REQ-27–32/DNC-01/02, FACT-03/UNKNOWN-06/08/В-03 |
| C20 | UNKNOWN-06/08/DNC-01–05: язык/команды/связи/границы013 |

Четыре контекстных блока message031:3–5/16/17/18 пересмотрены по смыслу: metadata, ручной цикл, draft013, существование плагина. Не доказательство нового reader. Comments:22 и strict JSON scenarios:26 не контекст и не потеряны. Полный message013 отражён C18–C20, ссылки и файл не удвоены; иные требования/Go→Нова/оболочка013 не включены в новую работу.

## Все группы примеров в их заявленном статусе

Свой счёт: **18** numbered groups; **14** fenced JSON/JSONC = 12 json + 2 jsonc; отдельно **1 text** facts. Группы не равны blocks. Все inline pairs и comments тоже прочитаны.

| Группа | Конкретно осмотрено; статус |
|---|---|
| 1 | absent/disabled/enabled, четыре null поля; partial |
| 2 | human/system/agent/meeting role/prompt; partial |
| 3 | enum default и required/default/bounds; partial |
| 4 | signatures vs names, typed local owner/prompt; partial |
| 5 | effect binding и confirmation/resultEvent; inline/условно |
| 6 | recompute reference vs literal, event/filter/duplicates/index; partial |
| 7 | *Param/domain/stage/repair target; условный одиночный cycle |
| 8 | actual gateId binding, expression forbidden/context; partial |
| 9 | existing wrong target и backlink null; inline |
| 10 | 2events/2steps, state/actions/error; предложенная оболочка |
| 11 | lens token, unknown token, header/edge ID; inline |
| 12 | literal markers, neutral итого, question fields; текст |
| 13 | x/y schemas, nullable/required/duplicates/maxItems/domain; partial |
| 14 | unitRules/N sources vs int/duplicate/local counter/extra; partial |
| 15 | facts n2/name2 без summary против n3; conditional text |
| 16 | девять diagnostic keys, manifest/mapped ref/reason; conditional partial |
| 17 | counted/zero-unit, 3/1 строки, launch/date/profile; partial |
| 18 | пять unique stopKinds, foreign/missing/duplicate/cause; текст |

Первый корень только schemaVersion/compatibility: strict syntax tree возможно, обязательный structural missing-field, manifest-missing; comments не источник паспорта. Connected sample: **26 root keys =25 required+language**, 3nodes/2edges/2routes, по одному gate/session/counter/document/action/parameter, 2events, **15** фиктивных registry bindings, cycles/lenses=[], coverage1, diagnostic codes1 вместо20. П2 проверила локальные backlinks, terminal, reverse index, preserve и bound gateId. Сам пример прямо не проходит full regulation validation: нет полного registry/outcomes/cycles/norm coverage/diagnosticCatalog. Его partial/structural статус не повышен до full PASS.

## Шесть собственных проб: метод и дословные результаты

Все пробы лёгкие, read-only Python stdin/git show, стандартный JSON для конкретных уже извлечённых блоков, точные перечни и одиночные изменения **только в памяти**. Ни parser, ни schema/semantic validator/runtime не написан. Полные измеренные выводы: `s2-8/probe-1.txt` … `probe-6.txt`. В инструментарных вызовах остались сами stdin команды; в файлах — outputs без локальных реквизитов. Пробы можно воспроизвести по указанным диапазонам и finite сравнениям; это не выполнение AC.

### П1: независимый пересчёт текста

Anchored REQ/AC/DNC в начале абзаца; ranges описи до следующего heading, строки структур/ветвей/семейств/групп, все C и вопросы. Положительные контроли — найденные реальные ID/пункты и marker.

```text
spec raw bytes/lines/SHA256 171509 720 5414f2feccdb128d5704dd0db3f79918697b1f8225fb26a2f4e5f55250d5da1e
REQ count 36 ... continuous True paragraphs True
AC count 42 ... continuous True paragraphs True
DNC count 5 ... continuous True paragraphs True
S1 inventory count/total 23 ['23'] continuous True files+brief 22 1
S1 inventory equality positive True
S1 inventory equality wrong-total False
S1 inventory equality remove False
S1 inventory equality extra False
L bytes excess 21509
```

Здесь `...` — явная вырезка списков IDs только для компактности отчёта; дословные полные строки с **каждым** ID/структурой находятся в probe-1, не утрачены. П1 также содержит 44 структуры, шесть branches/families, groups1–18, C01–C20, UNKNOWN01–08 и восемь question field counts по5. Ранняя сумма 2+4+3+4+4+3+4+4+3+3+3+3+2+2=44 не подменяет 36REQ или42AC.

### П2: 14 деревьев и локальные relations

Из двух конкретных JSONC блоков сняты **ровно семь заранее известных целых comment lines**: две одинаковые шапки, три node, два edge. Остальные строки не преобразованы. JSON.loads даёт trees, не JSONC/schema PASS. Каждому block соответствует свой диапазон в полном выводе. Одиночные target/index/maxItems mutations не писались на диск.

```text
strict trees 14 known whole comment lines 7 NOT general JSONC/schema/semantic pass
connected required root 25 missing [] extra ['language']
negative route target exists True equals edge.to False
terminal node.done outgoing 0 phase terminals ['node.done']
action required ['gateId'] bound ['gateId'] literal {'kind': 'literal', 'value': 'gate.spec'}
scenario events/steps 2 2 indices [0, 1]
negative scenario indices [0, 0]
nested required positive ['x'] unique True negative ['x', 'x'] unique False
nested array maxItems 2 int single-delete missing ['maxItems']
sample diagnostic codes ['invalid-reset'] required codes 20
strict duplicate-key control {'a': 2} NOT duplicate rejection
```

Полный вывод содержит обе positive route пары, actual operations/index/preserve, все counts и coverage disposition. Illegal halves остаются JSON-синтаксически законными — отказ по norm, не обязательно syntax.

### П3: stop/progress/facts и конкретные домены

Finite comparison actual legal/illegal patterns; множество stop с three single changes; counted3 vs zero1 строки; text facts и номерcontext; арифметика domain inclusion, enum/default/role/owner/recompute/binding kinds. Не generic validator.

```text
stopKinds all size 5 unique True members True
stopKinds foreign size 5 unique True members False
stopKinds missing size 4 unique True members False
stopKinds duplicate size 6 unique False members True
stop specimen positive kind True reason True
stop specimen foreign kind False reason True
stop specimen missing kind False reason True
stop specimen empty-reason kind True reason False
domain inclusion concrete source[1,safeMax] -> target[1,safeMax] True source[0,safeMax] False
array domain concrete maxItems2 -> 2 True maxItems3 -> 2 False
parameter sample enum membership [True, False]
human sample role/null [True, False] prompt [None, None]
recompute sample kinds ['counter', 'literal']
actionUse sample binding kinds ['literal', 'expression']
typedRef local owner present [True, False]
```

Отдельные полный вывод/осмотр: counted/zeroUnit пары меняют только unitRule, два кода имеют по одной строке без profile, лишняя ready даёт2 строки; fake unit.none/node mismatch не становятся допустимыми. Facts две реальные text lines, summary отсутствует, positive2=2/negative3≠2. HasDate/project исключения не выдуманы.

### П4: diagnostic и immutable source

Девять keys пары16, missing/null/methodology-null/commit-int/files-null specimens; independently `git show pin:task-runner.md`, raw bytes SHA и exact heading count. Conditional mapped specimen на этот подтверждённый источник, две single ref/reason mutations. Координаты/pointer не измерены reader.

```text
pinned source raw bytes/SHA 122709 10396a7b7e8fb7b70553647b7204858bbe3ae5861b06b4c45f55a6b55bf4371f exact anchor count 1
conditional mapped specimen ref/reason True None NOT reader outcome
single mapped mutation sourceRef changed ['sourceRef'] ref/reason both-null True both-nonnull False
single mapped mutation sourceRefReason changed ['sourceRefReason'] ref/reason both-null False both-nonnull True
source priority ['syntax-unavailable', 'manifest-missing', 'manifest-invalid', 'mapping-unavailable']
hash positive True one-byte changed False
```

Прочитаны все пять mapping-unavailable conditions: unavailable bytes/hash/commit/missing anchor/ambiguous anchor. Для schema-only нормы неподтверждённый методический anchor не выдуман. Successful mapped ref не optional; category независима от reason.

### П5: свежий журнал и границы исключений

Regex для dated prefix/kind/rooted path **после полного чтения смысла**; семь допустимых видов из process. Положительные контроли — 45 реальных records, actual message/hash и dates; ни privacy guard, ни old-byte diff не заявлен.

```text
source log physical/anchored/all dated prefixes 45 45 45
noncanonical kind [] joined record lines []
dated correction/source decision 2026-10-13 16:32 lines [33] kind ['документ']
dated correction/source decision 2026-10-13 16:39 lines [34] kind ['документ']
dated correction/source decision 2026-10-13 16:49 lines [35] kind ['документ']
dated correction/source decision 2026-10-13 21:14 lines [41] kind ['решение владельца']
dated correction/source decision 2026-10-13 21:18 lines [42] kind ['документ']
source log absolute local path tokens 0 VALUES NOT PRINTED
16:39 preserves factual source message 46 lines/hash True True True
16:49 preserves spec 171509/SHA/36-42-5 True True True old-current inventory 23/22+brief True
```

Full output также измеряет progress С1п2/3/4/5/5д/6 и исторические92/83/готово:. С1п6 has 0/1,1/1, lengths5/74; старый exception и отдельный С2-7 exception сохранены только в своих границах. Правильность actual чтения автора старых сессий не восстанавливалась по его словам; это проверка текущей формы/коррекций.

### П6: собственные start/end fingerprints

До первого предметного чтения, после metadata-only перечисления каталогов и создания собственной копии, сняты **свои** файлы/index обоих исходных деревьев. Область: sorted distinct `git ls-files -z --cached --others --exclude-standard`, каждому relative path/raw byte count/SHA256; отдельно HEAD и raw index по git rev-parse --git-path index. JSON inventory hash — SHA256 sorted-key JSON массива этих записей с ensure_ascii=false. Повтор ровно тем же byte-preserving Python/subprocess способом после чтения и шести предметных проходов, без PowerShell text перекодирования.

```text
jsonc-source files 507 file changes 0 changed [] inventory 7e98218fd66acda6a3f7ad8f8cdc8967fe94f7afb32fea194f994e69407904d4 start=end True index 12342f43ddd8b8dc8343145c50619c6fb878705582fcdb9acef0fe28b287c0fc
core013-source files 354 file changes 0 changed [] inventory 350b5babcfdf07da3f5e1f997f314532af7b323d79c226e44ff35b7a8342ef6f start=end True index dfb3fda9ab2190693c6ea1c33776bfe3801d7b329f84d292df27620254241fe7
```

J HEAD `56e2b54dae5ab90f47985ada14c6061b33ac6ad8`, index56717B; C HEAD `7f2b0f6ea2f9ad55258a17eb614ed03b627ce596`, index38231B. End listing SHA дополнительно `2e62d3f32e0303a32e03c72d4d96888a67b5d3668ad8458165699020bb92ee38` и `b726ac200a021becb6dcb78d8d3d61bb15df4abbdf4f928b749249edd7127627`; собственная start/end index пара — **raw index**, не заимствованные listing hashes С1.

Артефакты: `s2-8/fingerprints-start.json`, `fingerprints-end.json`, `probe-6.txt`. Полные списки507/354 сохранены, не только aggregate. Проверяемые spec/trace/message/log/progress/reviews/неполная попытка/Канон/код013 входят в эту область и не изменились.

**Граница сохранности:** это совпадение перечисленных файлов/HEAD/index на двух моментах, не filesystem lock и не отсутствие промежуточной чужой записи с возвратом. Игнорируемые файлы, вся общая git metadata и live main не покрыты. Создание отдельного worktree изменяет общий реестр worktrees штатно, не правит проверяемые файлы/index. Методика читается immutable git objects; её рабочее дерево/index не предмет пары. Конфиги/код не прочитаны предметно, их хэш в snapshot не заявление об изучении. Перезапуск сервера по сообщению среды не выполнялся этой сессией; чтение продолжено без повторного выполнения сделанного, endpoint preservation после него измерена.

## Полный перечень чтения и объём

**36 файлов + бриф =37 источников. Реально прочитанные диапазоны файлов: 1285078 raw байт / 8374 строки**, без повторного счёта дочитывания, проб и брифа. Токенизация не выполнялась, bytes не tokens. `s2-8/reading-metrics.json` содержит каждому SHA, raw size, ranges и объём прочитанного. Копий методики в проекте нет; managed shell outputs — результаты инструмента для дочитывания, не нормативные копии.

Обозначения J/C/M как в собственной spec-trace. ADR ниже лежат в `doc/canon/decisions/`; остальные task filenames — внутри папки031, если не указан root path.

| J: файл | Raw bytes | Прочитано |
|---|---:|---|
| doc/canon/README.md | 4234 | 1–40 |
| AGENTS.md | 14083 | 1–113 |
| doc/canon/process.md | 18716 | 1–118 |
| doc/canon/decisions/README.md | 5010 | 1–68 |
| README.md | 3284 | 1–43 |
| ADR-0001-work-by-methodology.md | 3728 | 1–43 |
| ADR-0002-repository-layout.md | 2917 | 1–41 |
| ADR-0003-go-first-then-nova.md | 4860 | 1–53 |
| ADR-0004-agent-drivers-on-subscriptions.md | 3949 | 1–45 |
| ADR-0005-own-browser-console.md | 3184 | 1–42 |
| ADR-0006-public-repository.md | 4848 | 1–49 |
| ADR-0007-plan-in-task-epics.md | 5278 | 1–59 |
| ADR-0008-model-profiles-layer-and-window-files.md | 5357 | 1–51 |
| ADR-0009-merge-precheck-without-lock.md | 5026 | 1–44 |
| ADR-0010-question-answering-modes.md | 4983 | 1–46 |
| task/message.md | 6800 | 1–46 |
| spec-trace.md | 78655 | 1–526 |
| log.md | 33303 | 1–45 |
| progress.log | 5233 | 1–39 |
| spec-review-1.md | 46260 | 1–515 |
| spec-review-2.md | 34544 | 1–356 |
| spec-review-3.md | 37389 | 1–446 |
| spec-review-4.md | 45292 | 1–335 |
| spec-review-5.md | 15235 | 1–98 |
| spec-review-6.md | 36929 | 1–159 |
| spec-review-7-attempt-1-incomplete.md | 3218 | 1–13 |
| spec-review-7.md | 70864 | 1–447 |
| spec.md | 171509 | 1–720 |

J28 файлов, каждый целиком. Канон начат с входного README; AGENTS прочитан как отдельный исходник, не только injected text. Все десять ADR заранее включены, прочитаны решение/границы/уточнения. Прямо применимы0001/0006/0010; 0002 задаёт размещение, 0004 границу CLI/cache, 0007 план/эпик, 0008 профили, 0009 вливание. 0003/0005 — контекст будущего сервиса/пульта, не новые требования schema/plugin и не доказательства работы JSONC reader.

| C: файл | Raw bytes | Прочитано |
|---|---:|---|
| doc/tasks/013-runner-core/task/message.md | 9868 | 1–74 |
| doc/tasks/013-runner-core/spec.md | 112194 | 1–1060 |

C2 файла целиком. SHA spec `f86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376`; message `88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9`. Их код/план/реализация не изучались и не менялись.

M6 файлов через `git show f333efa319e445efe029ee6963b477ca8fe3bc1c:<file>`:

| Файл | Raw размер | Полностью прочитанные диапазоны | Байты чтения |
|---|---:|---|---:|
| README.md | 1839 | 1–24 | 1839 |
| task-algorithm.md | 51475 | 1–370 | 51475 |
| task-sessions.md | 52142 | 1–399 | 52142 |
| task-runner.md | 122709 | 1–697 | 122709 |
| methodology.md | 363338 | 67–339,452–760,868–1087,1364–1602 | 214699 |
| completeness-check.md | 205871 | 1–28,1110–1190 | 45464 |

Methodology — полные назначенные2–5/8–10/12–13/18; completeness — вводная и полные5–7. Остальные разделы не объявлены полным чтением. PromptС2 task-sessions:145–165 и весь task-runner machine tail:97–134 включены. Размеры raw git objects с LF, не прежний CRLF shell output; например122709 против123406 не разные версии pin.

Обрезанные shell previews дочитаны из полного managed output: algorithm1–284 перед видимым285–370; sessions1–302 перед303–399; runner1–635 перед636–697. Полностью раскрыты long runner305 (2371знак), methodology243/564/712/1571 (2081/2451/2111/4018), completeness1190 (4177); shell wrap только в выводе, без сокращения исходника. П1 отдельно перебрала все назначенные методические ranges и подтвердила ровно эти строки>2000. Project-файлы читались до EOF диапазонами, не по ограниченному preview; 013 дочитан после965 до1060. Исходный trace прочитан все526, не только initial336.

## Честная проверка собственного progress

До предметного чтения составлена собственная явная опись37 и через progress_line записан **С2в8 0/37 старт**. Бриф перечитан как единица1 после старта; исходный trace С1 не копировался/не правился. По одному следу каждому файлу, не batch после группы; **для источника22 след преждевременный**, что раскрыто в finding1. Поэтому полное соответствие собственного progress норме завершённых единиц не заявлено. Все labels пересчитаны JavaScript по Unicode scalar до каждого вызова, ограничение80 не технический120 инструмента.

Два первых вызова progress_line **ничего не записали**: дефис в коде был отвергнут, затем отсутствовал файл журнала. Создан empty own progress, выбран допустимый код С2в8, успешный0/37 записан до первого предметного file read. Это отказы подготовки, не скрытые строки/выдуманные past timestamps. Прерванный перезапуском вызов после ADR0006 также не записал строку; после сообщения среды источник12 отмечен один раз. Времена ставил только инструмент, clocks не вызывались.

В собственной описи N37 был явным до чтения; literal footer `итого: 37` добавлен после чтения machine format, без изменения состава/N или переписывания progress. Для methodology/completeness до завершения этих единиц явно уточнён именно назначенный объём, не весь файл; состав36файлов/37источников не поменялся. Это уточнения формы/объёма описи, а не придуманное полное чтение или новый знаменатель.

Строка37/37 после source013 **не начиналась готово**: чтение013 завершено, анализ/пробы/отчёт ещё продолжались. При финальной самопроверке обнаружен недочитанный фрагмент источника22; он дочитан поздно. Поэтому **готово не пишется**: итоговая строка `37/37 стоп: требования — ...` отражает блокер собственного протокола, не успешный чистый конец. Старые строки/время не меняются. Норма будущих сессий/старые exceptions себе не применены. Финальный инструментальный контроль собственного журнала — `s2-8/final-control.json`; после стоп новых progress этого кода не будет.

## Предупреждение, ограничения и не сделанное

Финальный контроль после дочитывания строки1188 и итогового стоп: J507/C354 — start/end равны, raw indices равны. Own progress39 строк:0/37,1/37…37/37, затем37/37 стоп; один exact старт, все N37, k не уменьшается, **максимальная подпись72≤80**, ready records0. Одна premature entry22 делает `progress_conformance=false`, несмотря на корректную форму остальных строк. Отчёт содержит одну numbered finding и шесть probe headings. В созданных текстовых артефактах rooted local paths0 и trailing whitespace0; это ограниченный скан формы, не privacy guard PASS. Usage_line подтвердил фактический `openai/gpt-6.1-sol`, variant high; никаких общих профилей не менялось.

Файл final-control.json создан после снимка собственного status; его status list относится к этому моменту, не скрывает последующее создание самого control. После стоп новых progress не добавлялись. Эти данные фиксируют блокер, а не исправляют прошлую completion отметку.

L по **36REQ**, высокий риск. **171509−150000=21509байт** превышения — только предупреждение к ближайшим воротам владельца. Без отдельного предметного основания не finding; требования не сокращались, spec не делился и не утверждался. В-01…05 и UNKNOWN01…08 сохранены.

Не выполнены и не названы PASS: общий JSONC parse/normalization, UTF-8/BOM/escape/arbitrary comments/duplicate rejection/реальные координаты reader; полный schema validator; authoritative registry/signatures/production crosswalk/full regulation semantic success; compatibility с утверждённым013; scenario/runtime/git/session/jump execution; будущие AC01…42; privacy guards, build/npm test/тяжёлые команды. Для документальной С2 нет исполняемого diff: A/B/C/D/G реализации не выполнялись, E выполнен как сверка текста/источников, F здесь лишь finite negative data relations. Это не закрытие AC по поведению.

Запись только собственной spec-trace, этого полного отчёта, s2-8 журналов/выводов в отдельной копии на ветке `task/20-s2-jsonc-nezavisimyy-zahod-8-sol-high`. Проверяемые входы/индексы не менялись, файлspec тот же pin. Нет parser/validator/runtime/plan/production файла, подагентов/самостоятельного9, commit/push/candidate/precheck/merge/accept/cleaned/удалений/правок main/службы/общих профилей. Своя копия создана от доступного HEAD; freshness origin/main не проверена и не подменяет hash назначенного входа. Коммит/публикация этим конвертом запрещены и не делались.

## Маршрут

Полный предметный отчёт, собственную опись, журналы и **конкретный блокер зачёта С2-8** передать интегратору. Самостоятельно чистым8 не засчитывать,9 не запускать. Входная серия0 не увеличена; дальнейшее действие по процессному нарушению решает управляющий циклом/владелец. Эта сессия не утверждает документы и не выполняет продуктовую приёмку. Открытые вопросы/предупреждение остаются владельцу на предусмотренных воротах.

## Ответ на доработку конверта, круг1

Источник — письмо приёмщика конверта20 от 2026-10-14: требуется новая независимая попытка в отдельной сессии/входном конверте, сохранение этого отчёта/улик, без правок старых строк и исходника. Это служебный маршрут приёмщика, не слово владельца и не принятое исключение.

В той же сессии исправить своевременность прошлого completion невозможно: позднее чтение и новое имя отчёта не дают свежую независимую попытку. Самостоятельный новый воркер/заход запрещён границами конверта. Поэтому этот результат повторно передаётся **с тем же блокером**, не как исправленный чистый проход.

Проверено read-only: собственный git status показывает только отчёт/опись/s2-8 внутри папки031; `git log 56e2b54dae5ab90f47985ada14c6061b33ac6ad8..HEAD` пустой — коммитов этой сессии нет. Status двух исходных деревьев прочитан с `--no-optional-locks`: их незакоммиченные изменения не удалялись и не присвоены этой сессии. Старый progress и timestamps, исходники, fingerprints и пробы сохранены; после итогового стоп новых строк progress не добавлено. Публикация/precheck/merge/новая попытка не выполнялись. Только это пояснение дописано к собственному отчёту; нужно переназначение интегратором новой сессии, а не исправление старого журнала.
