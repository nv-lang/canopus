# Трасса требований С1п-2

Статус: авторское покрытие черновика, не независимый approval.
Самодостаточный контракт — `spec.md`. Ниже сначала историческая карта T01–T30,
затем новая атомизация N и история каждого ID. Историческая карта НЕ считается
атомарной полной: её T01/T14/T22/T25/T28/T30 смешивали разные обязанности.
Высказывания «полная», «нет укрупнённой строки», «исправлено» в старой таблице
описывают прежнюю авторскую заявку, которую С2-3 не подтвердила, а не текущий вердикт.
Гипотезы задания 22–26 не превращаются в FACT; первичные нормы и код прочитаны
в фактических диапазонах `session-evidence/s1p-2/read-map.md`.

## Историческая карта С1п-1 — не доказательство полноты

| ID | Атом исходного условия/уточнения | Класс / источник | REQ / AC / DNC | Основание и доказательство |
|---|---|---|---|---|
| T01 | P1: сохранить evidence, адресно сдержать старую сессию, исправить класс, RED→GREEN, независимая проверка/CI; публикация отдельно | полномочие owner, message 9,17–20 | REQ-09/11; AC-09/10; DNC-02/03 | Цель сохранена; эта С1 только черновые документы, без mutation |
| T02 | Дефект: после reassign CLOSED deferred command перезаписала данные нового worker; исправлять класс, не только carrier | факт задания/message 14; инцидентный материал | REQ-01…11; AC-01…10 | Запрет stale side effect, replacement test |
| T03 | Работать в задаче/worktree, профиль light; текущая сессия без plan/code/tests/admin | ограничение/message 15 и уточнение С1п | DNC-03 | Сверка task/branch; предметные actions не запускались |
| T04 | Не отменять #94 целиком и не трогать scratch/worktrees/refs/archive/logs; не менять Nova source/assets/release | полномочия/границы message 19,36,50–52 | REQ-09; DNC-02/03/04 | Preservation AC-09; запрет на destructive action |
| T05 | Admin actions только для exact старой identity и доказанно её watches/PID; неизвестная ownership => STOP | граница/message 20,30–32 | REQ-07/09; AC-07/09; DNC-03 | Exact owner, capture-before-mutation, неизвестное не считается отсутствующим |
| T06 | Предварительные гипотезы — не готовые факты | message 22–26 | REQ-11 | Исходники просмотрены независимо; помечены как hypotheses, не источник решения |
| T07 | Полный own before до предметных записей, hidden/untracked/code/config/history/.git hash only | метод/С1п N6-1 | REQ-09/11; AC-09; DNC-02/05 | `session-evidence/s1p-1/before-tree.json`, before copies |
| T08 | Сохранить доказательства до будущего admin action; raw path/commands не в публичном repo; отсутствующее не домысливать | message 30,36 | REQ-09/11; AC-09/10; DNC-02/05 | 87 historical saved copies, run1 missing; no reconstruction |
| T09 | Inventory именно old session; new worker watches нельзя приписывать old | clarification С1п; qualification S2-2 | REQ-07/09; AC-07/09 | Partition в `writer-consumer-matrix.md`; six IDs separated from eight old inventory IDs |
| T10 | Различить old-watch snapshot и причины исчезновения | qualification S2-2 43–54 | REQ-09/11; AC-09 | Six done at later snapshot; two missing; deletion cause UNKNOWN |
| T11 | Dossier expected должен быть полным 64-char SHA из первоисточника до новой проверки; старую ошибку не исправлять | qualification S2-2 56–63 | REQ-09/11; AC-09 | Правильный source digest указан в analysis; старый forensic JSON immutable |
| T12 | Проверять exact current OpenCode V2 metadata/inbox без bodies/mutation; попытка failure => UNKNOWN, продолжать доступный анализ | message 31; уточнение С1п | REQ-06/11; AC-06 | Более ранний interrupted UNKNOWN отделён от позднего GET exit 0/count 0 в существующем API evidence |
| T13 | Старые sessions не оживлять; нет Phase1/re-run/реального RED; никакого API mutation/interrupt/delete/taskkill/queue write | message/С1п safety | DNC-03/05 | С1п не выполняла calls/actions |
| T14 | Проследить lifecycle и каждую подконтрольную writer/consumer поверхность: watch/timer/request/claim/start/poll/recovery/restart/reassign/release/end-task/retry/resume/letters/direct deliver/prompt/command | message 32; clarification С1п | REQ-01…06/10; AC-02…06 | `writer-consumer-matrix.md`; code audit callsites с trust boundary и последствиями |
| T15 | Race/crash/idempotency: spawn до PID записи, потерянный intent, restart, concurrent consumers | S1/S4 + clarification | REQ-03/04/10; AC-02/04/05 | Один outcome на заданный порядок; неизвестный outcome STOP, никакой файловой+OS transaction claim |
| T16 | Два исхода обязаны быть различены: admitted-before-close и close-before-admission | S1/S4/M1 | REQ-03; AC-02 | При close-before — no admission/spawn; при admitted-before — close не success без exact terminal proof |
| T17 | Close определён наблюдаемым способом, не просто записью status | S1/S4 | REQ-01/03/04; AC-01/02/04 | Completion includes tombstone + terminal evidence; UNKNOWN => unresolved/STOP |
| T18 | Process threat model включает PID reuse, reparented descendants, open handles и остаточные права записи | S3 | REQ-07/08; AC-07/08; DNC-01/06 | Negative probes; exact proof/primitive остаются плану, обещания нет |
| T19 | Не предрешать sandbox/job/ACL или универсальную изоляцию | S3 | REQ-07/08; DNC-06 | Spec требует outcome; primitive выбирается после feasibility доказательства |
| T20 | Replacement worker должен работать независимо; никакого blanket block | message 33; S3 | REQ-08; AC-08; DNC-04 | Парная отрицательная old write и положительная replacement запись |
| T21 | Внешние API clients/server — отдельный trust boundary; не выдавать локальный interrupt за durable fence | S2 | REQ-05/06; AC-03/06; DNC-01/06 | Вопрос владельцу и HOLD при отсутствии внешней гарантии; это не принятое сужение цели |
| T22 | S5/M1: каждое условие задания/уточнения должно ссылаться на отдельный REQ/AC/DNC/constraint | message 11–56, квалификации | вся таблица | Нет укрупнённой строки, скрывающей сохранность/границы/цикл/вопросы |
| T23 | Нормативный spec самодостаточен; трасса/evidence может раскрывать подробные refs | уточнение С1п | REQ-11 | Spec содержит терминологию, требования, критерии, DNC, границы и вопросы |
| T24 | Публичная сдача без секретов, env dump, machine paths, private names; immutable source inputs | ADR-0006, AGENTS 15, message 36 | REQ-09/11; AC-09/10; DNC-02/05 | Guards перечислены для будущего запуска, не выполнялись в С1п |
| T25 | Полный набор plugin tests и отдельный CI guards; один не заменяет другой | AGENTS 7–10; package/CI/test README; S5/M2 | REQ-11; AC-10 | `npm test` 121 последовательный node script; CI команды перечислены в spec; ничего не запускалось |
| T26 | Targeted watch/flowwatch/restart suites и isolated fixture, сначала RED, затем GREEN; не реальная старая session | message 33, clarification С1п | REQ-02…10; AC-01…09; DNC-03 | Команды в spec, фикстуры только после plan gates |
| T27 | Machine-heavy tests идут через очередь; текущая сессия не запускает heavy | AGENTS 9–10; message 33 | REQ-11; AC-10 | Очередь указана как требование будущей проверки; не запускалась |
| T28 | Поведение README/help при необходимости; current только указатель на реальный landed result | message 42–45, AGENTS/process | REQ-11; DNC-04 | Target surfaces указаны; никаких действующих docs в С1п не меняли |
| T29 | Задача проходит методический цикл; сдача не равна утверждению/GO; владелец решает спорную гарантию | message 14,38–40; Canon | REQ-11; AC-10 | Next independent С2; owner question до ворот; HOLD остается |
| T30 | Не создавать task/agent/branch/ref, не трогать #061, #22, #045, #031 и #013 вне разрешения | текущие границы С1п | DNC-02/03/04 | Ничего такого не создавалось/менялось |

## Покрытие квалификации С2-2

| Finding | Ответ С1п | Где |
|---|---|---|
| S1: spawn до durable PID / потерянный intent | исправлено контрактом: admission/intent, crash recovery; failure => unresolved STOP; primitive плану | REQ-03/04; AC-04 |
| S2: writer/consumer и external boundary | полная project-owned inventory в отдельной matrix; независимый клиент отдельный trust boundary; цель не ослаблена | REQ-05/06; AC-03/06 |
| S3: exit/isolation overclaim | определены угрозы и negative oracle; universal primitive не обещан, неизвестное STOP; replacement не блокировать | REQ-07/08; AC-07/08 |
| S4: два исхода без oracle | close-before и admitted-before имеют разные фиксированные outcome; одна заданная schedule не принимает оба | REQ-03; AC-02 |
| S5/M1: неполная trace | 30 атомарных строк от полномочий/границ/тестов/документации до вопросов | T01–T30 |
| M2: команды публичной проверки | полный npm и CI приведены раздельно с targeted suites и queue; в текущей сессии не запускаются | REQ-11; AC-10 |
| Identity error | replacement IDs отделены от восьми old inventory records; старые JSON immutable | T09–T10; matrix |
| Digest error | expected из первичного intake, 64 hex; старая verification immutable | T11; analysis |
| Before incompleteness | own whole-tree before includes all existing files; root docs copied before edits | T07; `before-tree.json` |

## Первичные коды и команды

Эта историческая ссылка была неполной. Текущие exact команды/места и ограничения
определены в spec, «Проверки и порядок ворот», по первичным package/workflow/docs.
Ни старый, ни новый список команд не является evidence их исполнения.

## Опись источников

Единица — один адресуемый документ/набор первичных записей, не количество
упоминаний в таблицах. Для кода названы точные предметные диапазоны read-map;
прочтение диапазона не выдаётся за прочтение целого файла.

| № | Источник | Статус / роль |
|---|---|---|
| 1 | task/message.md | Полностью; цель/полномочия/границы |
| 2 | sol-correction-setup/assignment.md | Полностью; точное назначение С1п-2 |
| 3 | AGENTS.md | Полностью из среды; правила дерева/машины |
| 4 | doc/canon/README.md | Полностью; вход Канона |
| 5 | doc/canon/process.md | Полностью; отличия/журналы/ворота |
| 6 | decisions/README.md | Полностью; реестр применимых ADR |
| 7 | ADR-0001 | Полностью; методика/pin |
| 8 | ADR-0006 | Полностью; публичность |
| 9 | ADR-0008 | Полностью; generated config |
| 10 | ADR-0010 | Полностью; решения остаются владельцу |
| 11 | ADR-0011 | Полностью; форма задания |
| 12 | Методика README на pin081 | Полностью; вход |
| 13 | task-algorithm.md на pin081 | Полностью; разбор/FACT/DoD/доказательства |
| 14 | task-sessions.md на pin081 | Полностью; С1п/С2/история/формат |
| 15 | task-runner.md на pin081 | Полностью; формы/N/profile/ворота |
| 16 | methodology.md на pin081 | Применимые §§4–5,8–10,12–13,18; см. read-map |
| 17 | completeness-check.md на pin081 | Частично: длинные строки; не proof практики |
| 18 | spec-review-1.md | Полностью; находки, не полномочие |
| 19 | spec-review-2.md | Полностью; находки/раскрытые ошибки |
| 20 | spec-review-3.md | Полностью; находки/неполнота |
| 21 | integrator-intake.md | Полностью; первичная переносимая опись |
| 22 | integrator-s1-2-qualification.md | Полностью; поздняя квалификация |
| 23 | integrator-s2-1-qualification.md | Полностью; частичная С2-1 |
| 24 | integrator-s2-2-qualification.md | Полностью; identity/digest ошибки |
| 25 | integrator-s1p-1-qualification.md | Полностью; предыдущая правка |
| 26 | integrator-s2-3-qualification.md | Полностью; крайний маршрут/утечка |
| 27 | log.md / progress.log | Полностью на входе; парный запуск №7 |
| 28 | До-правки root3 | Полностью; own copies и bytes/SHA |
| 29 | s1p-1/root-before/spec.md | Полностью; исходные ID 10/7/5 |
| 30 | s1p-1 matrix/finding-response/regression/read-map | Полностью; прежняя заявка |
| 31 | s2-1 read-map-and-probes | Полностью; предел старой проверки |
| 32 | s2-2 requirement-map/contract-audit/package-doc-audit | Полностью; замечания |
| 33 | s2-2 forensic-verification/api-readonly | Полностью; ошибки/предел API snapshot |
| 34 | s2-3 read-map/probes | Полностью; неполнота/ограниченные snapshots |
| 35 | s1-2 evidence-verification/watch-inventory | Полностью; старый снимок 8 records |
| 36 | Первичный raw intake / raw-manifest | 87 bytes/SHA проверены; payload не перечитывался |
| 37 | Семь первичных watch records | Только нужные ID/session/status; без env/command |
| 38 | Внешний raw freeze С2-3 / manifest | Точный оригинал before побайтно сверён |
| 39 | opencode-plugin/watch.ts | Полностью; request/claim/spawn/poll/drop |
| 40 | opencode-plugin/core.ts | Все предметные writers/consumers, диапазоны read-map |
| 41 | opencode-plugin/index.ts | Все 7 direct deliver и связанные lifecycle тела |
| 42 | opencode-plugin/mcp.ts | Полностью; общий makeTools |
| 43 | opencode-plugin/hung-resume.ts | Полностью; interrupt не fence |
| 44 | opencode-plugin/package.json | Полностью, длинная test-цепочка декодирована |
| 45 | opencode-plugin/test/README.md | Полностью; пределы fake host и каталог |
| 46 | .github/workflows/guards.yml | Полностью; exact CI, отдельно от npm |
| 47 | README.md | Полностью; репозиторий/порядок вливания |
| 48 | opencode-plugin/README.md | 1–200: presence/turn economy/watch |
| 49 | core.ts HELP и tool descriptions | Предметные разделы прочитаны; docs targets |
| 50 | OpenCode skill / V2 API / plugins guides | Skill и нужные session API разделы; не весь SDK |
| 51 | Actual GET /openapi.json | Точная схема 6 маршрутов, не session snapshot |
| 52 | Microsoft Job Objects | Содержательный текст полностью; ограничения |
| 53 | Microsoft UpdateProcThreadAttribute | Параметры JOB_LIST/handles/capabilities |
| 54 | Node child_process | Точные detached/kill/killed/PID абзацы |

итого: 54

Полнота описи относится к используемым источникам и назначению, не утверждает
прочтение всех несвязанных файлов SDK/репозитория. Новые evidence outputs не
выдаются за первичные входы. Недочитанные строки реестра практики не используются
как норма или доказательство реализуемости. Все обязательные содержательные
контракты выводятся из первичных норм/задания и проверенного consumer cut.

## Текущая атомизация N — исходное задание

Обозначения: M=task/message.md, A=assignment.md, P=process.md, G=AGENTS.md.
С=сессионное ограничение, исполняется здесь и сверяется preservation/qualification;
это не требование новой функции. Н=не требование по названной причине.
У каждого атома ровно одна основная связь; соседние AC уточняются в самом spec.

| ID | Источник | Отдельный атом | Основная связь |
|---|---|---|---|
| N001 | M9 | P1: сохранить доказательства | REQ-09 / AC-09 |
| N002 | M9 | Адресно сдержать old | REQ-07 / AC-07 |
| N003 | M9,14 | Исправить класс deferred closed actions | REQ-01 / AC-02 |
| N004 | M9 | Изолированный RED→GREEN | REQ-18 / AC-16 |
| N005 | M9 | Независимая приёмка | REQ-18 / AC-18 |
| N006 | M9 | Полный CI | REQ-18 / AC-18 |
| N007 | M9,18 | Публикация отдельными воротами | С: сейчас не публиковать |
| N008 | M9,18 | Обновление live отдельно | С: не менять live |
| N009 | M9 | Заказ Nova не новое слово владельца | С: источник полномочия различён |
| N010 | M14 | Exact old session | REQ-12 / AC-12 |
| N011 | M14 | Нет новых задач | С: не создавать |
| N012 | M14 | Нет новых агентов | С: не создавать |
| N013 | M14 | Текущая стадия только черновые документы | С: без кода/плана |
| N014 | M14 | Дальнейшие spec/plan/code gates обязательны | REQ-18 / AC-18 |
| N015 | M15 | Свой worktree, не main | С: safe path gate |
| N016 | M15,A137 | Start первой собственной строкой | С: progress start |
| N017 | M15,A137 | Launch не агентом | С: парный №7, не записывался |
| N018 | M15,A138 | Step сразу после законченной единицы | С: журнал текущей сессии |
| N019 | M15,A13–16 | Исключение Sol081 не перенос 061 | С: настройки не менять |
| N020 | M18 | Исходные вопросы заказчику через integrator | С: не выдумывать разрешение |
| N021 | M19 | #94 целиком не отменять | DNC-04 |
| N022 | M19 | Scratch обоих запусков сохранить | DNC-02 |
| N023 | M19 | Worktrees сохранить | DNC-02 |
| N024 | M19 | Refs сохранить | DNC-02 |
| N025 | M19 | Архивы сохранить | DNC-02 |
| N026 | M19 | Логи сохранить | DNC-02 |
| N027 | M19 | Nova source не менять | DNC-04 |
| N028 | M19 | Nova assets не менять | DNC-04 |
| N029 | M19 | Nova tags/release не менять | DNC-04 |
| N030 | M19 | Broad kills запрещены | DNC-03 |
| N031 | M19 | Reset/stash/force запрещены | DNC-03 |
| N032 | M19 | Session delete запрещён | DNC-03 |
| N033 | M19 | Скрытая правка служебных JSON запрещена | С: protected hash check |
| N034 | M19 | #94 HOLD до полного proof | REQ-06 / AC-06 |
| N035 | M20 | Admin только exact old watch/PID | REQ-07 / AC-07 |
| N036 | M20 | Unknown ownership не основание mutation | REQ-12 / AC-12 |
| N037 | M20 | Capture/schema/identity до action | REQ-09 / AC-09 |
| N038 | M20 | При недоказанном протоколе точный STOP | spec В-02 |
| N039 | M23 | releaseExecutor может не interrupt | Н: гипотеза, сверена по core |
| N040 | M24 | poll может обойти lifecycle | Н: гипотеза, сверена по watch |
| N041 | M25 | cancel ownership-limited | Н: гипотеза, core/watch подтверждают |
| N042 | M25 | done может скрыть kill failure | Н: гипотеза, watch 217–240 |
| N043 | M26 | interrupt/inbox cancel не permanent fence | REQ-06 / AC-06 |
| N044 | M29 | Before всех existing hidden/untracked | С: before 734 entries |
| N045 | M29 | .git hash/bytes, без payload | С: before .git entry |
| N046 | M29 | Исходные root3 и expected до правок | С: before copies/expected |
| N047 | M29 | HEAD/ветка исходного дерева | С: назначение/readonly проверка |
| N048 | M29 | Установить весь plugin test set | REQ-18 / AC-18 |
| N049 | M30 | Raw копии до admin | REQ-09 / AC-09 |
| N050 | M30 | Raw commands/paths вне public repo | REQ-11 / AC-10 |
| N051 | M30 | Missing не домысливать | DNC-02 |
| N052 | M31 | Old inventory строго по owner | REQ-12 / AC-12 |
| N053 | M31 | Process identity/start/tree, не PID | REQ-07 / AC-07 |
| N054 | M31 | V2 actual schema до API-разбора | REQ-06 / AC-06 |
| N055 | M31 | Не V1 abort по памяти | DNC-06 |
| N056 | M31 | Не будить A для отмены | REQ-14 / AC-14 |
| N057 | M32 | Reassign/release lifecycle | REQ-01 / AC-01 |
| N058 | M32 | Queue request | REQ-02 / AC-03 |
| N059 | M32 | Claim | REQ-03 / AC-12 |
| N060 | M32 | Start | REQ-03 / AC-02 |
| N061 | M32 | Restart/recovery | REQ-04 / AC-04 |
| N062 | M32 | Reconcile | REQ-05 / AC-05 |
| N063 | M32 | Tool invocation | REQ-02 / AC-03 |
| N064 | M32 | Dispatch | REQ-05 / AC-13 |
| N065 | M32 | Poll | REQ-10 / AC-05 |
| N066 | M32 | Cancel и проверка exit | REQ-07 / AC-07 |
| N067 | M32 | Конкурентные процессы | REQ-10 / AC-05 |
| N068 | M32 | Идемпотентность | REQ-10 / AC-05 |
| N069 | M32 | Новые controlled turns A запрещены | REQ-05 / AC-03 |
| N070 | M32 | Внешние гарантии не обещать | REQ-06 / AC-06 |
| N071 | M33 | FACT/INFERENCE/UNKNOWN различены | С: analysis F/I/U |
| N072 | M33 | Атомарные REQ/AC/DNC | С: spec формы + эта карта |
| N073 | M33 | Отдельные результаты/места | REQ-17 / AC-17 |
| N074 | M33 | Реальные вопросы с рекомендацией | spec В-01/02 |
| N075 | M33 | Queued-after-reassign side effect | REQ-03 / AC-12 |
| N076 | M33 | Запрет watch из CLOSED | REQ-02 / AC-03 |
| N077 | M33 | Новый рабочий ход A не создаётся | REQ-05 / AC-14 |
| N078 | M33 | Kill failure не exit | REQ-07 / AC-07 |
| N079 | M33 | Новый worker в отдельном scratch | REQ-08 / AC-08 |
| N080 | M33 | Не реальный RED в #94 | DNC-03 |
| N081 | M33 | Нет продуктовых tests в этой стадии | С: не запускались |
| N082 | M33 | Targeted checks не заменяют полный CI | REQ-18 / AC-18 |
| N083 | M34 | After/hashes/manifest сдачи | С: единица 6 |
| N084 | M34 | Назвать, чего НЕ остановили | С: qualification, никаких admin |
| N085 | M34 | Done/profile/usage/submit и остановка | С: учёт после финала |
| N086 | M36 | Root3/E/три append журнала — exact outputs | С: expected/path gate |
| N087 | M36 | Слова владельца/log не переписывать | С: protected hash check |
| N088 | M36 | Папка 061 readonly | С: вне scope |
| N089 | M40 | Сохранённые copies не полнота run1 | REQ-09 / AC-09 |
| N090 | M40 | Nova verdict до rerun | REQ-06 / AC-06 |
| N091 | M44 | Код/selftests в plugin | REQ-18 / AC-18 |
| N092 | M44 | Поведение README/help | REQ-17 / AC-17 |
| N093 | M48 | Parent nova#100 | Н: связь заказа, не admin полномочие |
| N094 | M48 | Пересечения core/index/watch | С: не затронут код |
| N095 | M56 | Административный протокол требует решения | spec В-02 |
| N096 | M56 | Внешняя недоказанная гарантия требует решения | spec В-01 |

## Текущая атомизация — уточнения/Канон

| ID | Источник | Отдельный атом | Основная связь |
|---|---|---|---|
| N097 | A13 | Ровно одна текущая правка Sol | С: без нового цикла |
| N098 | A14 | Только одна последняя С2-4 Kimi | С: назначает интегратор |
| N099 | A14 | После любого исхода ворота владельца | С: нет автоapproval |
| N100 | A14 | Нет С2-5/сброса потолка | С: маршрут в spec |
| N101 | A29 | Immutable pin081, не main | С: git -C show только pin |
| N102 | A30–31 | Длинные строки дочитать, missing не выдумывать | С: read-map/ошибки |
| N103 | A48–50 | L определяется до результата | REQ-15 / AC-16 |
| N104 | A48 | Always STOP не завершает цель | REQ-16 / AC-16 |
| N105 | A51–53 | Legacy identity недостаточна — точный остаток | REQ-06 / AC-14 |
| N106 | A55 | C<D и D<C разные фиксированные oracle | REQ-03 / AC-02 |
| N107 | A56 | Spawn-before-PID в обязательной модели | REQ-04 / AC-11 |
| N108 | A56 | Потеря claim/intent не забывает O | REQ-04 / AC-04 |
| N109 | A57 | PID-write failure не вечный STOP | REQ-16 / AC-11 |
| N110 | A57 | Два consumers не избегают GREEN | REQ-10 / AC-05 |
| N111 | A59–61 | Primitive доказать плану, не FS+OS транзакция | REQ-15 / AC-11 |
| N112 | A61 | Не выдумывать feasibility | DNC-06 |
| N113 | A65 | Source immutable generation | REQ-12 / AC-12 |
| N114 | A65 | Recipient immutable generation | REQ-12 / AC-12 |
| N115 | A65 | Operation immutable generation | REQ-12 / AC-12 |
| N116 | A66 | Проверка до persistence | REQ-12 / AC-03 |
| N117 | A66 | Проверка при позднем выборе роли | REQ-13 / AC-13 |
| N118 | A67 | Проверка при claim | REQ-12 / AC-12 |
| N119 | A67 | Проверка при admission | REQ-03 / AC-02 |
| N120 | A67 | Проверка при execution | REQ-14 / AC-14 |
| N121 | A67 | Проверка при recovery | REQ-10 / AC-04 |
| N122 | A68 | A как source | REQ-12 / AC-12 |
| N123 | A68 | A как recipient | REQ-12 / AC-12 |
| N124 | A68 | Независимая B разрешена | REQ-08 / AC-08 |
| N125 | A68 | Role-addressed item | REQ-13 / AC-13 |
| N126 | A71 | Письмо persisted до C, resolved после | REQ-12 / AC-12 |
| N127 | A72 | .req persisted до C | REQ-03 / AC-12 |
| N128 | A72 | .claim захвачен до C | REQ-03 / AC-12 |
| N129 | A72 | D committed до C | REQ-03 / AC-02 |
| N130 | A73 | Consumer получил, effect ещё не начат | REQ-14 / AC-14 |
| N131 | A74 | Нет silent retarget в B | REQ-13 / AC-13 |
| N132 | A74 | Нет blanket block B | DNC-04 |
| N133 | A75 | Audit не разрешает wake старой A | REQ-14 / AC-14 |
| N134 | A76 | Crossed consumer boundary учесть terminal | REQ-06 / AC-14 |
| N135 | A81–83 | Раскрыть смешанные поля/историю ID | Эта карта + история ниже |
| N136 | A84 | Все direct deliver / общий postLetter | REQ-05 / AC-03 |
| N137 | A84 | Все существенные consumers | REQ-05 / AC-14 |
| N138 | A87–90 | Каждый AC отдельный proof | REQ-18 / AC-18 |
| N139 | A90 | Privacy не proof lifecycle | REQ-11 / AC-10 |
| N140 | A91–92 | Вопросы: адресат/срок/варианты/default | spec В-01/02 |
| N141 | A96–100 | Шесть run1 IDs относятся B, не A | REQ-12 / AC-15 |
| N142 | A102–106 | Правильный 64-char expected до actual | REQ-09 / AC-09 |
| N143 | A106 | 87 copies не восстановили run1 | DNC-02 |
| N144 | A110–114 | Root3 mutable inputs, не new exceptions | С: before copies/own expected |
| N145 | A116–121 | Только одна public derivative с raw сохранностью | REQ-09 / AC-15 |
| N146 | A121 | Entries bytes/SHA неизменны | REQ-09 / AC-15 |
| N147 | A122 | Не выдавать derivative за early raw | REQ-11 / AC-15 |
| N148 | A123–124 | RawSHA→derivativeSHA/exact diff/locator | REQ-11 / AC-15 |
| N149 | A125–127 | Новая утечка — external capture/точный scope | С: не broad cleanup |
| N150 | A129 | Старый вердикт не исправлять | С: reports protected |
| N151 | A134 | Все shell cwd=R | С: текущие вызовы |
| N152 | A135 | Safe resolved absolute output до write | С: allowlist gate |
| N153 | A136 | Новые outputs exclusive create | С: E отсутствовал; create-only |
| N154 | A136 | Python -B, без pycache | С: текущие вызовы |
| N155 | A155 | Нет credentials/full env/parent env/v9 | DNC-05 |
| N156 | A157 | GET только necessary metadata без bodies | С: только actual schema GET |
| N157 | A158 | Wrapper data положительно decode, null не [] | REQ-06 / AC-06 |
| N158 | A159 | Никаких kill/admin/queue/Phase1/rerun | DNC-03 |
| N159 | A161 | Все новые human-readable тексты русские | С: выводы/документы |
| N160 | A161 | 061 не менять | С: protected tree |
| N161 | A161 | #31 «merge lock» не делать | С: вне scope |
| N162 | A162 | 045 пауза | С: вне scope |
| N163 | A162 | #22 отменена, материалы сохранить | С: вне scope |
| N164 | A162 | 013 не возобновлять | С: вне scope |
| N165 | G7–8 | Полный suite до push | REQ-18 / AC-18 |
| N166 | G9–10 | Тяжёлое через machine queue/лимиты | REQ-18 / AC-18 |
| N167 | G11–12,18 | Live только с предупреждением/словом | С: live не меняется |
| N168 | G15,ADR-0006 | Нет private paths/names/secrets в public | REQ-11 / AC-10 |
| N169 | G16 | Другие repo только читать | DNC-04 |
| N170 | G17,P52–58 | Вопрос на воротах инструментом | С: ворота проводит интегратор |
| N171 | P131–152 | Остаток analysis назначен явно | analysis U1–U4 → задача 081 |
| N172 | P183–205 | Current только указатели/одно место результата | REQ-17 / AC-17 |
| N173 | P327–330 | Approval/сдача/live только владелец | С: текущий draft |
| N174 | task-sessions,Правила | Blank paragraphs/ID в начале строки | С: spec исправлен |
| N175 | task-sessions,С1п | Что исправлено/отклонено по каждой находке | finding-response |
| N176 | task-algorithm,7 | Вопросы не ответы владельца | spec В-01/02 без ответа |
| N177 | methodology,13 | Ранние expected/positive и negative controls | AC-16 + собственные пробы |
| N178 | task-runner,форматы | Profile/usage не выдумывать | С: учёт с null при отсутствии данных |

Нерегуляторных строк в текущих N — 5: N039–N042 (проверяемые гипотезы), N093
(контекст связи). Они не снимают требований; первичный код/схема служат источником
анализа, а не полномочием. Остальные строки — требования, запреты, полномочия
или точные ограничения сессии, не замаскированы под контекст.

## История идентификаторов — ничего не исчезло молча

Исходник 10/7/5: `s1p-1/root-before/spec.md`; редакция 11/10/6:
`s1p-2/before-spec.md`; текущая 18/18/6: root spec.

| Исходный REQ | С1п-1 | С1п-2: сохранение/уточнение |
|---|---|---|
| 01 close | 01 | 01 + C/D определения |
| 02 writer | 02 | 02,12: source/recipient |
| 03 queued/claimed | 03 | 03,12,13: точный order/role |
| 04 текущий watch | 04 crash + 07 stop | 04,07,15,16: recovery + positive L |
| 05 turns/inbox | 05 local + 06 external | 05,06,12,13,14 |
| 06 exit proof | 07 | 07: failure отдельно от exit |
| 07 concurrency | 10 | 10: один effect/O при recovery |
| 08 replacement | 08 | 08: положительная B и write denial |
| 09 preservation | 09 | 09: raw/derivative происхождение |
| 10 audit | 11 | 11 audit;17 docs;18 отдельные проверки |

Новые 12/13/14 раскрывают уже требовавшийся ownership/deferred scope;
15/16 фиксируют положительный oracle по С2-3/назначению, не новый unrelated feature.
17/18 выделяют уже существовавшие обязательства docs/проверок из смешанного audit.

| Исходный AC | С1п-1 | Текущие AC / что сохранено |
|---|---|---|
| 01 writer+replacement | 01,03,08 | 01,03,08,12: deny A + allow B |
| 02 race | 02,04 | 02,04,11,12,16: порядок и positive recovery |
| 03 PID/exit | 07 | 07,11: чужой PID не kill, exact scope terminal |
| 04 turns/inbox | 03,06 | 03,06,13,14: уже потреблённый input учтён |
| 05 concurrency | 04,05 | 04,05,11: нет дубликата/воскрешения |
| 06 isolation+preservation | 08,09 | 08,09,15: разделены write и immutable bytes |
| 07 public safety | 10 | 10 privacy;17 docs;18 full checks отдельно |

AC-12/13/14 выделены из 02/03/05/08, AC-15 из preservation,
AC-16 проверяет отсутствие вырожденного always-STOP oracle. Не продуктовый PASS.

| Исходный DNC | С1п-1 | Сейчас |
|---|---|---|
| 1 status не fence | 01 | 01, без ослабления |
| 2 preserve | 02 | 02, узкое разрешение derivative явно названо |
| 3 admin/destructive | 03 | 03, без ослабления |
| 4 B/scope | 04 | 04, без ослабления |
| 5 env/secrets | 05 | 05, явно также transcripts/bodies |
| Нет отдельного ID | 06 external/OS | 06: сохранён запрет overclaim, добавлен anti-STOP |

Вопросы исходника: GET повторить — исторически исполнен С2-2/3, не вопрос выбора;
lock/storage — И-01 плана; внешняя гарантия — В-01; будущие admin полномочия — В-02.
С1п-1 имела два owner вопроса и инженерный пункт; оба owner вопроса остаются
неотвеченными. Текущий профиль/T — авторское техническое требование, не слово владельца.

## История находок и доказательств

С2-1: неполная 2/7; С2-2: существенные S1–S5; С2-3: неполная, два предметных
замечания и два доказательственных остатка. Чистая серия 0, следующий заход 4/4.
Разрешение пары Sol/Kimi не засчитывает чистую проверку и не даёт С2-5.
Ответ на каждую находку — `s1p-2/finding-response.md`; её принятие только следующей
независимой проверкой/владельцем, не авторской пометкой «правлю».

Единственная производная: `s2-3/before-manifest.json`, raw bytes 130581,
SHA `676911c617282bb80dc3c4bd0f6c7b575ccd319a3794dc1046634fb9f9eaa147`.
Точный raw сохранён во внешнем freeze интегратора С2-3, относительный locator
`session-evidence/s2-3/before-manifest.json`. До изменения сверены bytes/SHA и
равенство текущему исходнику. Diff: только root→нейтральный и добавлен provenance;
все files entries неизменны. Derivative SHA/полный diff — в новом
`derivative-actual.json` и `derivative.diff`; это не raw early before и не чистый verdict.

## Каждый AC — отдельное будущее доказательство

AC-01 generations/state log; AC-02 два ordered schedules; AC-03 writer deny/allow;
AC-04 каждый crash point/intent; AC-05 два процесса/one O;
AC-06 external schema/host boundary; AC-07 PID/kill-error negative+positive;
AC-08 OS write isolation+B; AC-09 raw copies; AC-10 privacy guards;
AC-11 реальный Windows primitive/recovery; AC-12 обе стороны persisted/claim;
AC-13 два типа role item; AC-14 consumer receipt/D/effect;
AC-15 raw/derivative; AC-16 always STOP negative и success positive;
AC-17 docs/help/current; AC-18 полный пакет/CI/independent replay.
Точные future commands — spec. Пока все продуктовые AC NOT VERIFIED:
эта сессия выполняет документальные пробы, не реализацию.
