# Отдельный статус каждого AC, запуск 18

Это ранний технический STOP, **не приёмка реализации**. Нельзя переносить
ограниченные PASS прошлых прототипов в production или считать pending зелёным.

| AC | Вердикт этого запуска | Собственное доказательство / точный остаток |
|---|---|---|
| 01 | NOT IMPLEMENTED | Production C/generation не добавлены; stale reopen не проверен |
| 02 | FAIL baseline / NOT IMPLEMENTED fix | `probes/baseline/baseline-queued.json`: actual close, затем A effect; B positive; D<C running — отдельная прежняя bounded oracle, не terminal close |
| 03 | NOT VERIFIED | Полные writer deny/allow пары не созданы; direct/MCP не объявлены covered |
| 04 | FAIL candidate scope | `scope-owner.ps1`: durable admitted intent → spawn → crash до PID persistence; recovery unknown и scope=null, не successful close |
| 05 | NOT VERIFIED | В новой counterexample стабильный O/effectID сохранён, replay=not-executed; полной production concurrency/retry/restart матрицы нет |
| 06 | PARTIAL / HOLD | Actual schema/host2.0.26 в `host-schema.json`; external hook runtime proof отсутствует |
| 07 | NOT VERIFIED | Нет PID kill/TTL stealing; observer waits exact own handle, но отрицательная identity/error матрица отсутствует |
| 08 | **FAIL** | `scope-oracle.mjs`: A пишет B после durable C, before/after SHA различны; B positive. Instrumentation handle не ограничивает inherited token |
| 09 | PARTIAL | `before.json`: 190 existing files copied/hashed до предметных правок; legacy metadata captured; old run1 missing не реконструировался |
| 10 | PARTIAL: scoped privacy PASS | `audit.json`: реальные secrets/private-name judges на32 новых файлах без ошибок; это не полный guards CI и не lifecycle/exit |
| 11 | FAIL candidate scope | Реальный spawned-before-PID crash, persistent scope=null; observer-only PID/handle не выдан за восстановленную authority |
| 12 | NOT VERIFIED | Production source/recipient persisted/claimed schedules отсутствуют |
| 13 | NOT VERIFIED | Bound/open role semantics в production не реализованы |
| 14 | HOLD | Actual endpoints разделены в `host-boundary.md`; admitted external input/terminal revoke не проверены |
| 15 | PARTIAL | Raw вне repo, locators+SHA; новые производные отдельно, старые manifest/entries не правились |
| 16 | NOT VERIFIED | Always STOP не засчитывается. Counterexample сохраняет honest unresolved; positive terminal L не доказан, T close не измерялся |
| 17 | NOT DELIVERED | README/help/schema не менялись: production поведения нового fence нет; `current.md` указывает на STOP, не на готовый код |
| 18 | PARTIAL / NOT VERIFIED | Неизменный исходный RED выполнен; GREEN/removed-fix, production targeted/full npm/full guards и независимая приёмка не выполнены |

Новая counterexample проверяет **недостаточность** Mutex+intent для process/write
scope, а не всю L. Не доказаны обычные detached/reparented descendants, все fault
points, complete positive T. Неизвестное не стало success, пользовательский effect
не повторяется recovery. Это правильная безопасная остановка, но не GREEN.

L/4 не объявляется выполненным: A имеет обычный inherited token с правом открыть
B. Разные scratch/нет заранее открытых B handles не равны отсутствию такой
capability. Поэтому FAIL candidate boundary не является доказательством
невозможности L на её уже изолированных входах или законным исключением L из spec.
