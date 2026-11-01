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
