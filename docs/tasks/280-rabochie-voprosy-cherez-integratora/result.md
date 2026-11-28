# 280 — состояние собственного checkpoint

**Не финальный GREEN-кандидат.** Реализация question routing и предметные регрессии готовы; совместная native база 279, полный plugin набор и финальные guards ещё не подтверждены. Живая система не менялась.

## Реализовано

- `question-router.ts`: исходный qid/task/project/source/context, устойчивый outbox, epoch/смена интегратора, отдельно queued/received, один native attempt до I/O, owner precedence, stale/replaced/unknown и ограниченная эскалация. Неизвестная версия сохраняется и показывается, не становится pending/разрешением.
- `question-routing.ts`/`question-native.ts`: источники только из проверяемых публичных `doc/` артефактов (границы realpath, SHA256, точная quote); текущие V2 Form.Detail/State/Reply и native ключ поля, не догадка q0; новый пользовательский ввод — только барьер stale ответа, не разрешение из текста.
- Реальные входы: `crew_question ask/status/claim/resolve/escalate/ack`, коррелированный `crew_send`, текстовые блоки, новые и уже открытые/старые формы. Legacy repeat/recommendation не стирает routed вопрос; старый queued autoanswer тоже не подменяет источник.
- Канон/ADR-0017, role/help/побудки согласованы; blanket reviewer exception снят по уже принятому ADR-0010. Закрытый список и личные answer_* не менялись. Операторская фраза не выдана за цитату владельца.
- Кейс 087: явный documentary criterion не заменяется URL; технический exact-SHA просмотр до финальной owner acceptance. Узкий small rework от интегратора требует замечания и exact candidate из последнего отчёта, возвращает submitted/reviewing прежнему исполнителю, без formal reviewer/full cycle/main/accept/ложного busy. Потолок и execution/legacy HOLD сохраняются.

## Доказательства

- Начальный RED: отсутствовал question-router; предметный RED настоящего makeTools/crew_send — 0 correlated records вместо 1.
- Отдельный RED 087: small corrective после отрицательного просмотра оставался submitted вместо rework; исправлен.
- `node test/crew-question-router.test.mjs`: 20 ячеек GREEN, включая concurrent instances/restart/timeout без второго POST, owner precedence, источники/эпохи, HOLD guard, unknown durable version.
- `crew-question-routing.test.mjs`, `crew-question-native.test.mjs`, `crew-question-entry.test.mjs`: source identity/attribution, native schema/statuses, настоящий text ask/resolve/ack с исходным reply_to; реальный small submit/rework, wrong SHA/retry/HOLD/смена интегратора.
- Реальный plugin entry: давно открытая native форма и полная матрица worker/reviewer с/без Recommended, проверенный источник, ровно один ответ на исходную форму, ноль interrupt. **Assertions проходят, но последний процесс пятого файла завершился exit 1 после cleanup**: старый базовый disposer не await-drain, фоновый index.pass получил ENOENT cards. Sleep/ослабление oracle/production fail-open не добавлены. Нужен lifecycle seam 279.
- Все новые fixtures изолируют XDG_STATE_HOME/data/config/cache/DB и запрещают unexpected transport. Реальные native формы/служба/credential не использовались. Пять файлов зарегистрированы в стандартном pretest; parallel runner учитывает pretest+test без дублей.
- [provenance.md](provenance.md): собственный read-only git show exact d7e541a и ls-tree двух blobs; чужой репозиторий не менялся, CLI/version/контур не запускались.

## Оставшийся обязательный шаг

Автору запрошен пригодный immutable checkpoint 279. Текущий чужой WIP не взят; её сообщённый full (35 RED/157) не объявляется GREEN и не дублируется нами.
После разрешённого переноса на своей ветке объединить get/spacingMs/questionIO factory, использовать getNative и executionHeld(taskHold(...)), сохранить обе стороны core/index и union pretest, await disposer drain. Только затем полный plugin набор/guards через machine queue, signed frozen SHA автору и его короткая независимая проверка. Автоматический платный reviewer не запускается (small/human); перед submit маршрут сверяется ещё раз.

Ни main/live update, ни merge/push/перезапуск, ни снятие текущих HOLD/пересмотр 269/277 этим checkpoint не разрешаются. Общий T=180 минут от исходного старта, 2T=360; время/объём не обнуляются.

## Отдельное дополнение после исходного SHA

Исходный checkpoint — **9f2deaef68eaaddeaae8764f2deb1f00d6973430**, signed, hook guards через очередь exit 0 (10/10). Он не переписывается и не объявляется полным GREEN.

По новому согласованию default/deadline добавлен отдельный diff: заранее фиксированный continue_assigned с проверяемым источником, trusted assignment/scope, ответственным и deadline; иначе durable адресный blocker без автоматического нового owner-вопроса. Источник цитаты/статус ahead-of-pin — датированные task/message, ADR/process и log. Нормативный кандидат методики не ждём, pin не меняем.

RED через реальный router: по сроку без default было owner вместо blocked. После исправления `crew-question-default` и real tool `crew-question-entry` — exit 0, базовый router — 20 ячеек exit 0. Ограничения источника/scope/deadline, gate/HOLD, смена ответственного, late owner/закрытая форма и отсутствие второго POST проверены. Шестой файл зарегистрирован в pretest.

Дополнен настоящий plugin кейс 087: текущий ответственный/тот же exact SHA/объём/проверенный источник снимают ожидание исходного fixture вызова и дают реальное продолжение; иной SHA/scope и второй ответ отвергаются. Все assertions этого кейса и AC-1 проходят, но процесс по-прежнему exit 1 на старом sync disposer после cleanup (ENOENT cards). Ни sleep, ни подавления ошибки нет; нужен frozen await-drain 279 и итоговый повтор exit 0. Готовность стенда/полного набора этим не подтверждается.

Последующий targeted повтор `npm run pretest` (шесть файлов) завершился **exit 0 без поздних ошибок**; 087 также воспроизводит durable ожидание 26 минут и подтверждённое продолжение исходного fixture вызова. Ранее воспроизведённый sync-disposer race этим не объявляется исправленным: deterministic await-drain контракт всё равно берётся только из пригодного frozen 279 и перепроверяется на совмещённых байтах. Полного набора/готового стенда пока нет.

## Совмещение разрешённой native базы

Разрешённые автором exact commits 279 `4d7a15d583c10bc5d4f7e51105eca60fe550b762` и `3287ed54b8432ec1f34fd213341730cc428c2c1d` перенесены после branch_note с ручным union в signed `8e728e04` и **`6e41a3be66218fbc0a43ca2b3ac2ac55d6359183`**. Конфликтов нет; оба собственных исходных checkpoints сохранены. Factory get/spacingMs/questionIO, общий getNative, executionHeld(taskHold), tracked question tools/I/O и async drain совмещены, pretest — union 17 файлов без дублей. Hook guards переноса exit 0 (10/10).

На совмещённых байтах targeted form/087/controlled unload без позднего POST, real entry/HOLD scopes, default и native — exit 0. Отдельный RED→GREEN: собственное outbound crew-mail больше не считается answered; проверяются точные session/id/text/time/mode/phase из trusted receipt и старшие страницы user history, чтобы crew-mail не скрывал другой новый ввод. Ни receipt, ни отсутствие receipt не объявляются owner approval. Исправлен query type filter изолированной native fixture без production fallback.

Этот checkpoint ещё не финал: общего full на моих байтах нет. Отдельный pending-create lifecycle RED 279 и новая immutable delta остаются у автора; дальнейший WIP не переносится без адресного разрешения. Повторные перезапуски сервиса не потеряли пяти файлов собственного follow-up; никакие main/live/push/merge/личные настройки не менялись.

## Контрольная точка перед управляемым переходом OpenCode

Подписанный HEAD — **`0242ec531e035d0fa5ba85750392afef93cc9c99`**. Watch `1793539830009-nage77`: совмещённый pretest 17 и hook guards 10/10 **exit 0**, подпись подтверждена git log. Этот результат повторять не нужно.

Автор адресно разрешил lifecycle delta 279 **`cc9a11f927003ef055088c765cba4c3b9a7529df`** (письма 2026-11-01 16:32/16:37). После branch_note применена через `cherry-pick -s --no-commit`; конфликты index/package разрешены вручную, union 18 pretest сохранён. Question I/O совмещён с lifetime.call и реальным AbortSignal; controlled never-return GET завершается локально при unload, поздний результат не начинает POST. Это не заявление об отмене уже принятой удалённой операции.

Watch **`1793542079767-efmgvb`**: `npm run pretest` (18 файлов) **exit 0**; последовавший `git cherry-pick --continue` — **exit 128**, потому что после `--no-commit` нет продолжаемой операции. Вся команда exit 128, **нового commit нет**, guards для этого WIP ещё не выполнены. Изменения сохранены и зарегистрированы в индексе, не удалять и не применять delta заново:

- документы 279 evidence/log/repeats; plugin README/index/native-state/package;
- новые plugin-lifetime и crew-native-dispose-late; обновлённый crew-native-dispose;
- собственные question-native/question-routing и question native/forms tests.

Следующий шаг после подтверждённого восстановления: проверить root/ветку/HEAD/status; обычный signed commit с явным перечнем этих файлов и hook guards через queue (не `cherry-pick --continue`, не повторный перенос). По разрешению автора взять только exact test-only settings delta после cc9a11f9, если требуется; неизвестный WIP не брать. Полный 279 **161/161 GREEN на `d01263fa064471bec3831ee2ac64c4c4242c0b0e`** — результат другой задачи, не собственный full 280. После итогового freeze нужен свой полный затронутый набор/guards через очередь, независимая проверка exact SHA и подтверждение small без платного auto reviewer перед submit.

Открытый технический остаток от письма автора 16:35: исторический streaming/empty question после restart при свежем forms=[]/active absent не считать живой формой и не POSTить старому id; нужен допустимый current-input путь для уже проверенного решения, со сохранением исходного subject/scope/source и подтверждённым продолжением. Минимальный вход уточняется у автора, не выдуман и не объявлен реализованным. HOLD/owner gates неизвестностью не снимаются.

По письму автора 17:04 до управляемого перехода OpenCode 2.2.5 **новых тяжёлых прогонов не начинать**, идущие не убивать. Сейчас активных собственных прогонов нет. Службу/main/личные настройки не менять. Это та же сессия и незавершённая единица 5/5, не новый запуск; сделанное/исходные T и 2T не сбрасываются.

Автор уточнил следующий разрешённый шаг (письмо 2026-11-01 17:12, ответ на технический вопрос): один durable Crew-letter в ту же исходную сессию через проверенный native idle/receipt 279; исходные qid/question id, актуальный ответственный, независимо проверенные решение/source/subject/scope. Исчезновение формы, собственный outbound receipt и текст модели не создают разрешение. Старому form id не POST, исторический question не править и не interrupt. Стабильные recovery letter/native ID сохраняются до I/O; restart/unknown/pending не создают повторный POST. Admission/enqueue не доказательство продолжения: нужен связанный новый assistant/tool. Active/unknown/HOLD/new gate/wrong SHA/scope не обходятся. После восстановления — RED→GREEN через настоящий plugin entry с forms=[]/историческим streaming call и отдельный absent-permission negative. **Это записанный следующий шаг, не сделанная реализация; до восстановления новых тяжёлых прогонов нет.**

## Возобновление после GO и current-input recovery

GO автора 2026-11-01 17:30: внешний переход завершён, та же сессия/ветка/единица продолжена. Обычный signed lifecycle commit **`8109d56f`** создан без повторного переноса cc9; предыдущие pretest 18 сохранены. Отдельный следующий diff реализует согласованный recovery-вход.

Реальный `crew-question-recovery` RED: нет correlated current-input recovery; второй RED после уточнения fixture — форма исчезла **до** resolve, прежний unknown отказал независимо проверенному решению. GREEN через настоящий plugin/tool: historical DB streaming question с пустым input остаётся неизменённым, свежий form list=[], verified current responsible/source/original SHA/scope → один устойчивый recovery Crew-letter; admission не закрывает вопрос, связанное новое assistant поколение подтверждает продолжение. Источник/текущий scope/HOLD/known native idle проверяются заново при native admission. Active/unknown/execution HOLD/new gate/иной SHA/scope/absent permission не разрешают recovery; restart сохраняет identity, старому form id POST и interrupt — 0. Unknown первой admission не разрешает второй POST. Седьмой question-файл включён в pretest; общий union — 19 файлов.

Этот targeted GREEN ещё не финальная сдача: собственный полный plugin набор/guards и независимый просмотр итогового SHA остаются обязательными. Чужие результаты 279 их не заменяют; main/live/pin/личные настройки/чужие репозитории не менялись.

## Полный RED и один разрешённый корректирующий проход

Собственный полный frozen **`5a7301e452585a4e14ce920986d97427bc24399f`**: watch `1793544932234-syhl0u`, **158/168 GREEN, 10 RED, exit 1**, jobs 4, 1138 с. Последующие guards в цепочке `set -e` **не запускались**. Последовательный isolated повтор этих 10 на неизменном SHA: watch `1793546209561-4sqimd`, **10/10 RED**, jobs 1, 943 с. Это не списано на нагрузку.

Владелец, 2026-11-01, текущий question о бюджете, дословно: **«Разрешаю один проход до 19:36»** (передано автором адресным письмом 18:32). Согласовано одно исключение только для 280: прежний scope, owner-gate wait/repeat RED→GREEN, один итоговый full/guards и короткий exact просмотр автора **до 19:36 по Москве**. Исходные T=180/2T=360 от 12:36, затраты/RED/commits не обнуляются; small сохраняется. Нет готовности/итоговый full RED к сроку — сохранить SHA/WIP/evidence и адресно доложить, не продлевать молчанием. Main/live/настройки/серверы/pin/push не разрешены.

Механизм исправлен, не только oracle: положительно распознанная существующей policy **gate FORM** становится owner и сохраняет owner при неизвестном native detail; это не unknown→idle и не расширение closed list. `formTick` больше не подавляет её прежний owner wait/repeat. Автоответ/reply source guard сохранён. Уже открытая owner форма не порождает лишнее письмо; первая local проверка выявила именно этот дубликат после исправления статуса, он устранён. Unknown рабочий вопрос всё ещё сохраняется командным blocker, а не самочинным owner gate.

Предметные изменения тестовых ожиданий (отменённых ADR-0017), без ослабления остальных проверок:

- MCP: строгий перечень 15 tools вместо 14, единственный новый — `crew_question`.
- Docs/idle: точная фраза маршрута через интегратора и «уже разрешённый шаг»; owner word/gates остаются.
- Golden: только EXPECTED delta — семь точных help substitutions (включая две ранее реализованные WC-1 small documentary handoff строки), явный раздел ADR-0017 и точный новый forward абзац. Actual не нормализуется; snapshot не перезаписан, spoiled-forward negative сохранён.
- Flowwatch: действующий integrator подтверждён настоящим role lock; исходный text/task/qid и source-backed reply проверяются вместо отменённого обходного `crew_send`.
- Answer-flow: все прежние generic non-task answer_* проверки сохранены. Только task-секции теперь требуют durable current-author route/исходные pack/gate/source/неизменность task-plan и отсутствие выдуманного autoanswer; роль автора зарегистрирована штатно.
- Form-auto-flow: прежний generic autoanswer/delay/counters/owner-first/closed-list прогон сохранён на non-task A; отдельная task T проверяет противоположную границу — исходный routed question, без угадывания/interrupt/ложной записи в task history.
- Loop/no-queue: предмет — genuine owner permission gates, они явно объявлены `Тип: gate` в fixture; все queue/repeat/owner-first/loop assertions оставлены. Рабочие факты отдельно проверяет реальный router matrix.

Первый корректирующий targeted набор `1793547560667-mbbfxg`: **11/11 GREEN, exit 0**, 64 с. Включает unchanged hidden-wait, genuine gate repeat/loop, form-auto boundary, MCP/docs/idle и question router/forms/default/recovery. Следующие text/task/golden проверки и итоговый full ещё не объявлены GREEN до фактического результата.

Последующий targeted `1793547949310-iog5tk`: flowwatch/hidden-wait GREEN, task-flow/golden ещё RED. Golden требовал двух уже реализованных small documentary help строк, добавленных в явную EXPECTED delta (не перепись snapshot). Task routing/readonly ячейки уже GREEN, но strict AC-15 owner-plan notice не появился в длинном fixture. Oracle не удалён: добавлено отдельное утверждение default planApprover=owner, notice фиксируется до следующей смены settings, лог fixture изолирован через существующий ownLog. При отказе сохраняется диагностический excerpt, approval по-прежнему не разрешается автоматически.

Изолированный повтор `1793548869249-qc5q9a` — **2/2 GREEN, exit 0**, 135 с: весь `crew-answer-flow` с generic non-task режимами, прежним strict plan notice/approval и новым task route; `crew-answer-golden` с испорченным negative control. Expected help отдельно побайтно сверена с actual, actual не фильтровалась. Причина прежнего отсутствия notice не выдаётся за доказанно исправленный production-дефект; новый итоговый full обязан подтвердить весь набор. В corrective pass нет отключения тестов, удаления closed-list проверок, повышения timeout и новых разрешений/настроек.

## Итоговый проверенный кандидат и сдача

**Runtime/testing SHA — `954d4e7246c24ba648a7ce7a89ef70ac1a8390af`**, signed. Tree `6aefdde9c5b6ec531a5064f93b0f41fed982a3ea`. После этого только evidence-only документы; `git diff <testedSHA> -- opencode-plugin` пуст. Никакого повторного full или изменения runtime/tests.

- Единственный разрешённый итоговый full: watch `1793549555694-m16tvn`, **exit 0**, **168/168 GREEN**, jobs 3, 844 с. До/после подтверждены exact HEAD и чистое дерево.
- В той же успешной цепочке: **guards 10/10 GREEN**, secrets/privacy tree — **2817 файлов, GREEN**. Это реальные завершённые процессы, не enqueue/частичные assertions.
- SHA256 raw operational вывода: `2e1bf8b1f0882ae6582ff4a1f0b613a2075cc3377fb4aaed3bf1e9fce884ad0b`; raw/manifest переданы автору, машинный путь в публичный артефакт не переносится.
- Автор лично подтвердил full/guards и exact source-review без блокирующих замечаний (письма 2026-11-01 19:25/19:31). Его независимая short archive проверка четырёх runtime файлов поставлена отдельно; **её результат на момент этой evidence-only записи ещё не подтверждён**, executor GREEN не подменяет независимую квитанцию.
- Штатный small/human, reviewer отсутствует и платный automatic reviewer не запустится — автор проверил актуальным show и live механикой, письмо 2026-11-01 18:04. Новое owner согласование перед submit не нужно.

Единицы плана: 1 — provenance/Канон/ADR; 2 — реальные изолированные RED; 3 — durable router/одноразовый native ответ/default/blocker; 4 — text/mail/form входы, help и совмещение frozen 279; 5 — signed exact кандидат, полный собственный GREEN/guards/manifest автору. Все пять выполнены. Исторические RED и исходный T/2T сохранены; один corrective pass разрешён только до **19:36**, молчанием не продлевается.

Результат — кандидат к независимой приёмке, **не live update/merge/push/перезапуск**. Canon pin, личные answer_* и machine slots не менялись; legacy/execution HOLD и owner closed list не ослаблены. 269/277 и чужие репозитории не изменены. Оставшаяся независимая runtime-квитанция принадлежит автору и должна быть явно получена перед дальнейшим принятием/живым внесением.

## Полученная независимая квитанция и документальный остаток

На границе **19:36** штатный `crew_task submit` уже состоялся, runtime/testing HEAD оставался **`954d4e7246c24ba648a7ce7a89ef70ac1a8390af`**. Неподписанный остаток был только в трёх документах: `result.md`, `log.md`, `progress.log`; plugin diff пуст. После границы до нового прямого разрешения файлы/коммиты/прогоны не менялись.

Независимая short archive проверка автора **фактически завершилась в 19:32**, до прежней границы: exact archive **`954d4e7246c24ba648a7ce7a89ef70ac1a8390af`**, watch `1793550515582-ni2vb8`, **4/4 GREEN, jobs 1, 13 с, exit 0** — recovery/default/hidden-wait/forms. Квитанция получена исполнителем позже; подтверждена автором письмом 2026-11-01 19:37 и дежурным по raw. Прежнее «ещё не подтверждено» описывало доступное на момент записи знание, **не является текущим blocker**. Вместе с full 168/168, guards/privacy и source-review это завершённые независимые доказательства, не очередь и не финальное согласие на live.

**Отдельное ограниченное решение владельца:** «Разрешить только документы до 19:46» (владелец, 2026-11-01, текущий чат, ответ на конкретный вопрос root; передано дежурным 19:39). Разрешены только эти три итоговых документа, внесение полученной short-квитанции, guards/privacy через штатную очередь и поимённый signed evidence-only commit до **19:46 по Москве**. Это не продление runtime-прохода, не новый full/приёмщик и не сброс исходных T/2T/затрат/RED/GREEN. После него интегратор сверяет подписанного потомка, три документальных пути, пустой plugin diff к tested SHA и фактические guards. Main/live/push/merge/pin/личные настройки/серверы по-прежнему не разрешены.
