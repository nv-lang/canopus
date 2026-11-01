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
