# Короткий разбор

Основа: `unitcraft/ai-dev-methodology @ 744e0af34dc9c7f9d4db2a91e312ee170c6642fd` (Канон, `doc/canon/README.md`, `process.md`; зафиксирована в журнале задачи).

## Причина и границы

`crew_spawn` уходит в `spawnInFolder` до `parseParent`, тогда как folderless путь проверяет заказ и записывает `task.parent`/`order.child`. Внутри folder-spawn сначала создаётся task и коммитится папка, поэтому поздняя проверка заказа оставила бы orphan. Исправление должно валидировать parent до любых эффектов и записывать обе стороны до запуска сессии. Обработка повторной/устаревшей связи требует отдельной операции, а не угадывания по task title.

Метаданные разных проектов лежат в общем локальном хранилище, но `saveTask` атомарен только для одного файла и не имеет CAS/межпроцессной транзакции. `updated=Date.now()` сам по себе недостаточен как expected version: два изменения при одинаковом времени могут коллидировать. Relation operation принимает SHA256 fingerprint текущей task record (`taskVersion`) плюс raw status; изменение serialized task content/history меняет fingerprint даже при одинаковом `updated`. Единый commit point связи — взаимно согласованная пара `order.child` + `child.parent`: операции изменения связи сериализованы, а propagation повторно проверяет оба указателя; неполная пара не является принятой связью. Никакой общей транзакционной инфраструктуры не вводится.

Завершение допускается только после exact reciprocal link и доказанного текущего terminal status; для legacy `done` требуется запись принятия и `merged_head` либо `commit`. Состояния вроде `reviewing`, `blocked`, `completed` и payload запроса не служат доказательством. Это сохраняет действующий контракт и не предрешает незавершённый lifecycle 136. Сеансы/реальные карточки 129/133/140 не читаются и не меняются.

## Сверка пересечений

По сообщению integrator от 2026-10-22 02:21, принятых интерфейсов 136/140 нет: кандидат 136 ещё на CI, 140 blocked и не активирована. Их непроверенный код не переносится. Из действующего `origin/main` сохраняется порядок `review → accept → cleanup`; folderless spawn и существующий `propagateToParent` остаются покрыты. Для распространения добавляется проверка reciprocal identity, поэтому orphan/half-link не закроет order.

## Проверяемые пробы

1. RED: folder spawn с корректным parent создаёт task без `parent` и оставляет `order.child` пустым; GREEN требует обе стороны до старта.
2. RED: отсутствующий/не тот order-target или занятый child не должен порождать task/folder/session/branch; GREEN проверяет отказ и отсутствие эффектов.
3. RED: reconcile отсутствует; GREEN проверяет exact pair, повтор и конфликт/устаревшую версию fail-closed, legacy `merged_head` без `commit` допустим только при `done` + acceptance.
4. RED: частичная связь/`reviewing` не должны завершать order; GREEN проверяет commit point, recovery и propagation только при двух совпадающих указателях.
5. GREEN: два реальных дочерних процесса одновременно attach разных детей к одному order; строго один получает взаимную связь, второй остаётся без `parent`.

Crash/race модель: файловая блокировка операций relation fail-closed при занятой блокировке; reconcile пишет persistent journal intent до новых pointer-записей. Folder spawn сохраняет авторизованный `child.parent` в первой записи задачи, а `order.child` — последним; если запуск оборван раньше, одна сторона не считается committed и exact reconcile повторно проверяет её. Падение после child pointer/history закономерно меняет child fingerprint. Retry перечитывает current version/status обеих сторон через `show`; helper принимает новый child fingerprint только при exact pair в pending journal и relation marker в истории частично записанной стороны; иначе drift — отказ. Propagation требует взаимную пару.

## Диагностика golden snapshots после checkpoint

Полный watch `1792628282083-477ryg` закончился FAIL до перезапуска: 4 AC-01 assertions, не GREEN. В его diff `show #1…#5` получили намеренные version/status/relationship/evidence строки; timestamp version различался между независимыми сборками. Изолированный `landing-golden` dump без унаследованных `CREW_*` подтвердил, что source diffs — эти пять `show`; дополнительный `reviewLetter #2` из полного прогона не воспроизвёлся при изоляции. Golden fixture фиксирует `updated=fixedAt+task.n`, snapshot хранит точные updated/status/evidence/relationship fields; только SHA256 fingerprint нормализуется из-за fixture-specific temp path/content. Cross проверяет fingerprint format/stability при reread, изменение при content/history mutation под замороженным same-ms `Date.now()`, точный fingerprint в show и отказ старого expected token; partial-write test сдвигает clock, проверяет отказ старого tuple, затем безопасный refresh по journal intent/marker. Golden runner очищает только дочерние `CREW_*`. Старый full остаётся FAIL; targeted текущего нового same-ms/recovery исправления ещё не запускались.
