Заход 5: существенных 1, поверхностных 0, проб 3
Версия: spec 22e641def114d3207f3ec303e6e5f5eebaaac82973cb2d2bc0ccbd46350aa43e; analysis 1750a21b58cf27840dc22113d4ffec5bca6c97c6d28108f405da9cc0bbea6ab6; trace cacad23b828a51c8a1e6d6c30ed1bca0a2b998bbf6e7b384635a24f71211752c

# Независимая проверка требований — С2-5

## Итог

Выполнена полная предметная проверка текущих 18 REQ, 18 AC, 6 DNC, 178 source atoms, истории ID, обеих линз, существенных consumers, первичных package/CI/docs/API/platform и forensic-сохранности. Найдено одно противоречие приёмочного oracle. Заход не чистый; спецификация не утверждена, план/реализация/admin/live не разрешены. Nova #94 остаётся HOLD.

Новая отдельная сессия Sol/OpenAI, не автор. Семья совпадает с автором по разовому решению владельца, переданному в replacement-spec-review-setup/assignment.md: «Одна Sol (Recommended)», доставка 2026-10-18 05:01. Это сессионная, не межсемейная независимость; прошлые reviews прочитаны как история по назначению, не основание вердикта и не отсутствие истории в строгом смысле methodology722. С2-4 остаётся неполной: итоговый spec-review-4.md отсутствует; чужие progress3/6 не дописаны. Чистая серия не сброшена. Никаких С2-6, авторской правки или нового цикла по этой сдаче.

## Находка

1. **S1 — AC-05 задаёт неверную кратность admission/effect относительно закрытия и нескольких границ одной O.**

   критичность: существенная. уровень: требования.

   **Источники:** task/message.md32–33 требует race/идемпотентность и положительную B; sol-correction-setup/assignment.md55–59,65–77 требует фиксированные C/D исходы и каждый consumer boundary. В spec45–50 D разрешает один effect, переход в чужой consumer учитывается отдельной effect-записью той же O; REQ-03 (164–165) требует сериализацию для каждого effect; REQ-14 (229–231) — D перед каждым подконтрольным effect. Однако AC-05 (307–310): «когда два consumers конкурируют, повторяются close/cancel/retry и restart, тогда ровно один admission/effect на O». Условия «O ещё разрешена» и отдельной identity эффектов в этом oracle нет.

   **Фиксированная трасса отрицательного случая:** новая локальная O A находится в .req/.claim до D; два consumers конкурируют; close C(A) фиксируется первым; затем retry/recovery после restart снова видит O. Вход остаётся в L, обязательный fault set не меняется. REQ-03, spec108/128–129 и AC-02/12 требуют отказ D, ноль user spawn/effects, terminal и положительную независимую B. AC-05 буквально требует ровно один admission/effect этой O. Честный consumer, оставивший 0, проваливает AC-05; consumer с1, удовлетворивший AC-05, нарушает AC-02/12. Audit record отказа не D: spec45 и55–56 их различают.

   **Положительная трасса того же класса:** допустимая O B записана в локальный mailbox, затем пересекает host consumer boundary; spec48–50 требует отдельного effect accounting той же O, а подконтрольный следующий effect требует своего D. AC-05 не определяет, считаются ли эти разные разрешённые этапы двумя admissions/effects либо одним повтором. Дедуп по O может заблокировать допустимый следующий этап B; пропуск всех последующих этапов как «та же O уже admitted» обходит требование per-effect D. Это не требование выбрать storage/lock/OS primitive в spec, а необходимость единого наблюдаемого oracle.

   **Связь с первичным кодом:** core1111–1215 → index295–383 реально разделяют persistence/claim, host prompt/synthetic и confirm; core3097–3124 и1688–1704/2039–2058 имеют дополнительные consumers, watch166–208 — claim/start/result. Поэтому различие этапов не отвлечённое расширение scope. Код приводится как свидетель топологии, не как выполненная реализация нового контракта.

   **Исправление:** согласовать AC-05 с C/D таблицей: ноль admissions/effects для O, отозванной до D; не более одного фактического исполнения каждого разрешённого effect; различимая identity/кратность нескольких effect-записей одной O либо явные дочерние O с сохранённой causation. По одной deny/allow/race/recovery проверке на выбранную семантику. Конкретный механизм остаётся плану. Любая правка только после нового решения владельца; эта сессия spec не правит.

   **Почему существенно:** меняются ожидаемое число и доказательство AC-05, а два прочтения дают противоположный исход на одном schedule. Редакция до С1п-2 имела «one terminal operation», а не нынешний безусловный «ровно один admission/effect на O»; точное противоречие относится к проверяемой правке, не чужому старому дефекту.

## Обе линзы

**Согласованность/исполнимость:** существенных1 (S1), поверхностных0; предметные группы проб P1/P2, forensic P3 поддерживает доказательственную часть. L задана входами до результата; crash-after-spawn-before-PID, claim-loss, PID-write failure и two consumers обязательны; success в конечный T и B положительны. Always STOP не проходит AC-16. Конкретный Windows primitive и часы/T до проб оставлены плану; их неизвестность сейчас не равна дефекту реализации либо доказательству невозможности модели. Ранняя гипотеза о достаточности ресурсных границ T не получила самостоятельного доказанного противоречия и отдельной находкой не засчитана.

**Обход/злоупотребление:** существенных1 (та же S1, не удвоение общего K), поверхностных0; предметная P2 и доказательственная P3. Проверены A-source/A-recipient/B-only, bound/open role item, persisted/claimed/received input, service causation, synthetic/quiet/final note, recovery/stale actor, PID reuse/reparenting/handles и работа B. Текущий контракт прямо запрещает эти обходы; S1 допускает неверную трактовку повторного effect admission. Независимые API/legacy writers не объявлены отозванными локальным C. Global GO по local PASS запрещён, цель P1 не ослаблена.

## Полнота и прежние замечания

- Полный первичный source-проход M/A/Канон и поатомное сопоставление N001–N178 — source-audit.md и consumer-audit.md. Все пять нерегуляторных строк перечитаны: четыре гипотезы N039–N042 не снимают требования, N093 — связь заказа, не полномочие. Исторические T-строки теперь обозначены неатомарными. Число178 само по себе не принято за полноту.
- История REQ10→11→18, AC7→10→18, DNC5→6 проверена по двум старым spec и текущей, с отдельным исходом каждого прежнего обязательства. Смешанные audit/privacy/docs/full-checks разведены. Потерянного исходного условия не обнаружено; сессионные ограничения не выданы за продуктовый proof.
- С2-1/2 spawn/intent/C/D/close: текст теперь задаёт recoverable intent/scope до user code, outcomes обоих порядков и положительный terminal. Замечание «план должен выбрать весь primitive уже в spec» не поддерживаю; сохраняется обязанность доказать primitive планом.
- С2-1/2 external boundary/process overclaim: есть отдельные local/external/legacy, exit/write proof не сводится к PID/done/kill; feasibility не заявлена. По реальному продукту всё ещё NOT VERIFIED, это не закрытие реализации.
- С2-2 S4/С2-3 ownership: source/recipient/O generations, bound против independent role, persisted/claimed/received schedules, audit без wake A и положительная B теперь названы. Новая S1 относится к точному счётчику результата, а не возврату к неопределённости всех сторон.
- С2-2 S5/M1/M2 и С2-3 доказательственные остатки: первичные package/workflow/test README/README/help прочитаны независимо; по каждому AC отдельный proof kind; full npm не подменён guards CI. Старые неверные степени/вердикты не переписаны.

## Пробы (P=3 различные группы, не число отдельных клеток)

Ожидания/input/route записаны до formal invocation в session-evidence/s2-5/probes.json. Пробы не product tests, не реальный RED/GREEN.

**P1 — положительная L против always STOP.** Ручная проверка пяти классов входа/oracle по spec68–114/235–245/285–372. Позитив: success и B прямо обязательны. Негатив: always STOP для обязательных crash/PID/claim случаев нарушает AC-11/16. Primitive не выбран; runtime/exit N/A. Фактическая трасса и точные пределы — consumer-audit.md.

**P2 — ownership/role/claim/consumer.** Ручные восемь schedules: deny A-source, deny A-recipient без retarget, allow B, bound/open role distinction, claim<C<D, D<C без начала effect, received/external accounting, два consumers/recovery одной O. Первые семь имеют определённые outcome, восьмой выявил S1; positive B различает запрет старой O от blanket STOP. Runtime/exit N/A, продуктовая модель не исполнялась.

**P3 — forensic/derivative/identity/privacy.** Собственный Python -B read-only пересчёт 87/87 copies =1804234bytes, mismatch0. Dossier15150, SHA совпал с заранее закреплённым первичным64. Семь raw watch records: шесть run1 — B, old run2 — A. Raw С2-3 сверён с внешним primary freeze manifest; rawSHA676911c617282bb80dc3c4bd0f6c7b575ccd319a3794dc1046634fb9f9eaa147 → derivativeSHAaeebd8404ff0b276d9ee17076aad9c9fe24fccccc896cb39bf38b2273230c97c; files/phase/excluded_exact равны, только root/provenance отличаются. Подмена size одного entry в памяти отвергнута; исторический expected63 и подмена шести B как old отвергнуты; подлинные entries/owners прошли. Новые originals не менялись. Это проверка сохранённых bytes, не живых процессов/инцидентной полноты.

P3 ошибки измерения сохранены: первая отрицательная подстановка получила TypeError (files ошибочно принят за dict), вторая KeyError (ожидалось bytes вместо фактического size), обе exit1/read-only и без записи результата. После адресного чтения keys отдельный исправленный вызов exit0 получил все positive/negative controls true. Ошибки не превращены задним числом в PASS; точный след в read-map.md. Узкий scan первых6 собственных файлов нашёл0 machine prefixes и положительный контроль шаблона; полный privacy guards PASS не объявляется. Финальные scope/output hashes — after-manifest.json и scope-audit.json.

## Форензика и неизменяемость

Все root3 совпали с назначением до записей; own whole-before769 включил hidden/untracked, .git-file только bytes/SHA и generated config. Три exact accounting prefixes зафиксированы bytes/SHA, не только выбранный git status. После-проверка охватывает полный nameset/bytes/hash; файлы вне exact новых outputs и трёх append журналов защищены. Log launch/submit и generated config — отдельно квалифицируемая динамика плагина, не права на запись агента. Новые outputs создавались exclusive, Python -B; одна собственная поправка уточнила six paths/seven methods, не меняла прежнее evidence.

Авторский actual-output-manifest независимо пересчитан: все32 entries совпали. Public derivative связана с сохранившимся внешним raw; public diff18 строк явно структурный с скрытым прежним root, не raw byte diff. Старый ошибочный forensic JSON остался ошибочным и неизменным. Snapshots8→6→5 не единый exit proof; missing run1 archives/raw CMake logs не восстановлены. С2-4 и все старые reports/evidence не дописывались. Физические raw/tool locators в публичный пакет не перенесены.

## Действующие места и будущие проверки

package scripts.test полностью декодирован:121 команд =cleanup+120 test scripts, scripts.build/typecheck нет. test/README описывает fake OpenCode/windows/models; реальный process в selftest не делает его OS containment proof. Все восемь targeted commands spec445–452 существуют в полной цепочке, npm test обязателен отдельно. Guards.yml1–75 содержит отдельные dash syntax, ci-mask, run-all --ci, secrets tree, wiring, commit-range/message checks, selftests/prove-red/empty-root; прямо не запускает plugin npm. Точные команды spec465–488 сверены. Выполнять их после разрешённой реализации, тяжёлое только через очередь машины; сейчас не запускались.

REQ-17/AC-17 называют существующие README presence/turn economy/watch, core HELP и tool descriptions, машинный формат рядом с consumer; current — будущий указатель на размещённый результат, не копия нормы. По каждому из18 AC отдельный будущий proof описан в consumer-audit.md; все18 продуктовых AC этой сессией NOT VERIFIED по прямому запрету реализации/прогонов. Текстовая проверяемость не присваивает PASS продукту.

## В-01/02 — самостоятельное небиндинговое мнение

В-01: сохранить полный global HOLD до внешнего/legacy terminal/fence proof. Actual V2 schema различает durable prompt, immediate command, pending inbox cancel и interrupt исполнения этого процесса; ни GET, ни один interrupt не запрещают будущие independent clients. Сужать цель вправе только владелец.

В-02: отложить любые admin до утверждённого плана и независимого безопасного exact scope proof; перед действием capture/provenance/schema/current identity. Старые owner/PID/status snapshots недостаточны. До ответа mutations запрещены.

Это мнение этой С2-5, не ответ владельца, не ретроактивное prior opinion и не согласие отсутствующего peer. Новый агент прямо запрещён, поэтому отдельного второго собеседника не запрашивал. Общие settings/model profile/потолок не менялись.

## Границы и маршрут

Не читались credentials/full env/parent env/transcripts/inbox bodies; не было admin/API mutations, kill/interrupt/cancel/inbox delete, queue writes, fixtures/product tests/build/guards, Phase1/rerun, живых изменений/restart, git writes/refs/commit/push, новых агентов/задач или правок чужого репозитория. Не остановлено ни одного старого запроса/процесса; fence/feasibility/GREEN не доказаны. #31 «merge lock» и другие сторонние действия не выполнялись.

Полное предметное чтение и адресные пределы — session-evidence/s2-5/read-map.md. Не прочитанные unrelated API/SDK/Win32/GUI разделы и payload forensic архивов не объявлены missing и не используются как доказательства. Никакого разрешения исправлять S1 эта сдача не даёт. После submit081 — остановка; обязательные ворота и дальнейший выбор остаются владельцу через интегратора.
