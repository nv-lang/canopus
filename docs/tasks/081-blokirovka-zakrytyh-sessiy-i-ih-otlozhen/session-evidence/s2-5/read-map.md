# Фактическое чтение С2-5

## Первичные документы задачи и Канон

Полностью: AGENTS из среды; doc/canon/README1–42; process1–357; decisions/README1–69; ADR-0001(43),0006(49),0008(51),0010(46),0011(51); root README1–43; task/message1–56; replacement assignment1–68, final assignment1–142, sol-correction assignment1–162; log1–24; root analysis1–119/spec1–503/trace1–412; integrator-s1p-2-qualification1–52.
Полностью прочитаны spec-review-1(56),-2(87),-3(73) как история; intake(14), integrator-s1-2(38),-s2-1(39),-s2-2(77),-s1p-1(40),-s2-3(51); finding-response С1п-2(63), qualification(77), read-map(91), platform-and-consumers(85), probes(66), probe-plan и measurement-error полностью. Две исторические spec: s1p-1/root-before1–86 и s1p-2/before-spec1–68. История10→11→18/AC/DNC и все178 N сопоставлены семантически с полным M/A, не только regex count.
Авторские JSON expected/preservation/derivative/documentary раскрыты без больших повторяющихся entries; actual-output-manifest пересчитан по всем32 entries, mismatches0. Большие before/after/root3.diff/повторные frozen copies не выдаются за новые первичные нормы: сохранность проверена hash/структурно, текущие и две старые spec прочитаны по содержанию. Не заявляю ручное чтение каждого повторного manifest entry либо архивного payload.

## Immutable первичные нормы

Все внешние Git вызовы только git -C из своего cwd, pin081 сверён с rootlog и обоими назначениями: 0442a4d3a380f01f437640b5dd9174e384e50d67. README целиком; task-algorithm1–370; task-sessions1–428; task-runner1–378. Полученный большой вывод дочитан из managed tool output, не только preview. Длинные runner89/325 и methodology543/563/722 раскрыты textwrap без изменения исходника;709 прочитана в полном диапазоне.
methodology:115–204,249–285,451–618,655–770,878–1097,1375–1569. Применимые роли/контракт/DoD/source-proof/проверка/неисполненная спецификация/сохранность/измерение/ворота/язык прочитаны первично. ADR/registry технические разделы205–248 и unrelated lifecycle/внедрение не объявляются полностью прочитанными и не служат основанием.
completeness-check: полный указатель всех строк реестра; вступление1/3/5/7/9/11 и полные содержательные строки34,42,43,45,47 раскрыты с переносом. Остальные подтверждения практики не прочитаны полностью и не используются как доказательство практики/продукта. Это сознательный адресный предел, не missing доступного источника.

## Первичный код

Поиск всех opencode-plugin/*.ts по postLetter/deliver/requestWatch/claim/takeReply/prompt/synthetic/command/shell/create/interrupt/reconcile/releaseExecutor. Существенные тела:
- watch1–265 целиком; mcp1–120 и hung-resume1–58 целиком.
- core1070–1464,1675–1739,1800–2119,2490–2729,2890–2994,3088–3219,3310–3434.
- index150–909,995–1044,1320–1384,1710–1939,1980–2059,2145–2184.
- answer279–310,372–439; review98–127; profile-windows125–181.
Полные семь callsites общего deliver с его телом, два дополнительных mailbox consumer и watch consumer прочитаны. Упростить cut до pass2040 нельзя. Другие простые notice writers найдены поиском и отнесены к общему postLetter, не исключены по service sender. Полного чтения всех unrelated UI/plan/git/settings функций не заявляю.

## package/docs/API/platform

package.json весь decoded, длинный scripts.test отдельно выведен121 строкой, cleanup+120test; test/README1–113; guards.yml1–75; plugin README1–200; HELP core1370–1464 и tool descriptions в указанных core диапазонах. Восемь targeted имён сверены с chain; выполнение команд запрещено.
OpenCode skill до API; официальные https://opencode.ai/v2/docs/api и https://opencode.ai/v2/docs/build/plugins; API surface/session routes и plugins Sessions783–860. Полную справку всех unrelated API/SDK не читал. Ранее сохранённый actual api-schema-selected JSON decoded:6paths/7 применимых methods (включая remove); из всего файла прочитаны предметные schemas/описания методов, не все необязательные Session.Info поля. Нового live GET/чтения session/inbox не делал. Provenance schema не выдаётся за сегодняшний snapshot или новый raw GET.
Microsoft Learn Job Objects: весь содержательный текст, включая tail accounting/last-handle/breakaway. UpdateProcThreadAttribute: definition/parameters и HANDLE_LIST/SECURITY_CAPABILITIES/JOB_LIST; остальная mitigation-матрица не нужна и полностью не читалась. Node child_process: detached1212–1224, kill/reuse/killed/PID1756–1826; не полный Node справочник. Это documentary sources, не проверенный primitive.

## Пробы и ошибки собственной процедуры

Expected3groups записан в probes.json до formal invocation. P1/P2 — ручные traces, runtime/exit N/A; actual в consumer-audit. P3 — независимый read-only пересчёт87/87,1804234bytes,mismatch0;7 raw ID/session/status records; source-manifest/derivative comparison. Full raw paths/payload/env не печатались и в outputs не перенесены; original raw только читался для bytes/hash/выбранной identity.
Первый вызов in-memory negative entry (после успешного raw87/derivative actual) завершился exit1 TypeError: list indices must be integers or slices, not dict: ошибочно ожидал dict files. Второй отдельный вызов exit1 KeyError bytes: фактический raw С2-3 entry использует size. Оба не создали files и не меняли originals. Отдельное чтение keys показало list и path/size/sha256; третий вызов exit0: raw_matches_freeze_manifest=true, genuine_fields=true, tampered_entry_rejected=true, historical_expected_length=63, historical_expected_rejected=true, B_owners_positive=true, B_as_old_rejected=true, old_run2_positive=true. Узкий privacy scan6 файлов:0hits, positive template control=true; full guards=false. Две ошибки не выдаются за PASS и не перезаписаны; исходные stack traces остаются в tool history.
Собственный preliminary source-audit содержит гипотезу про ресурсные границы T; после полного чтения она не признана отдельным доказанным противоречием: clock/primitive плану, нет обоснования невозможности всех допустимых вариантов. В отчёте считается только S1 с конкретными противоположными исходами. Одна собственная поправка consumer-audit уточнила6paths/7methods после сверки JSON, не меняла первичные данные.

## Сохранность и учёт

До своих предметных записей before769existing/hidden/untracked/.git metadata, exact expected и root hashes. Read-only HEAD/ветка подтверждены; внешнего gitdir payload не читали. Три accounting prefixes — bytes/hash раннего before; новые outputs exact allowlist. Generated config присутствовал в before и промежуточной проверке, не исключён; профильный lifecycle объяснён только по коду.
Поздний prefinal: из769 existing изменён только progress (append), missing0; .opencode/opencode.json на месте. Окончательные whole-after/name-set/output hashes/prefixes — after-manifest.json/scope-audit.json с отдельной самоссылкой. После них только штатные step/done/accounting/submit; поздний append не объявляется byte-identical journal. Сдача/динамика плагина вне собственных writes.
Старую Kimi/Nova не будил и чужие partial outputs не читал как вердикт, не дописывал. Не читал env/credentials/transcripts/inbox bodies. Не выполнялись product tests/guards/build/fixtures/admin/kill/queue/Phase1/rerun/live/restart/git writes/config changes/new agents/tasks. Не сделанные продуктовые AC не превращены в findings за отсутствие запрещённого исполнения.
