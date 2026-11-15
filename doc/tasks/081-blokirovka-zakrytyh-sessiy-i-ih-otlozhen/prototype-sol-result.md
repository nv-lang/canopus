# 081 С5д-2: корректные пробы простого fence

## Результат

**Целевой queued lifecycle RED→GREEN→снятый gate RED получен одним неизменным
safety oracle.** Положительная B выполняется во всех трёх вариантах. Два реальных
одновременно запущенных consumers конкурируют за общий lock; эффект не дублируется
при повторе новым процессом. Разные effects одной O различаются.

**Этого простого gate недостаточно для полного контракта L.** Контролируемый crash
после durable D оставляет mkdir-lock; новый процесс close получает
`LOCK_UNRESOLVED`. Это конкретный дефект восстановления выбранного алгоритма,
не доказательство необходимости SQLite, broker или невозможности другого простого
решения. Production-код не исправлен. Оба legacy scope остаются HOLD.

## Доказательства

База: immutable export `081-prototype-base-o00ntsja`, ревизия
`7e23895b8cb2c3ea9e4ac506455fedd440e6afd0`. ZIP и все 262 файла source сверены
побайтно до проб. Spec SHA и первоначальные SHA прежних файлов —
`session-evidence/prototype-sol-1/intake.json`. Spec, прежние скрипты, raw, отчёты,
fixtures и qualification не исправлялись. Старый freeze использован только как
граница read-only: прежние процессы/очереди не возобновлялись и не чистились.

Неизменный `lifecycle-oracle.mjs` SHA256:
`c274a18bcaeec4cb0b584904fabd7114e4ec7ed737c1ef65e5b96ecf85adbc98`.
Baseline raw получен до написания исполняемого `filesystem-gate.mjs`.

| Проба | Exit внутреннего oracle | Факт после ожидания |
|---|---:|---|
| Baseline queued | 1, целевой assertion | Карточка A `running`→`closed` через actual `releaseExecutor`; затем poll, завершение, A.effect существует; B.effect существует |
| Gate queued, финальный replay | 0 | C(A), отказ admission A без spawn, B исполняется, A.effect отсутствует |
| Removed gate queued, финальный replay | 1, тот же assertion | A.effect снова существует; B положительна |
| Baseline running | 0 | Сначала запущен watch A и достигнут ready barrier; actual release; разрешён барьер effect; wrappers завершились, эффект учтён |
| Gate running, финальный replay | 0 | В gate log D(A)<C(A)<wrapper-terminal(A); это **не** успешный close/revoke scope |

Измерение effect выполняется после poll, получения done records и явного ожидания
`ChildProcess.close` собственных wrappers. `.exit`/done используются для цикла
проверки, но не выдаются за OS exit/write-scope proof. Queued safety assertion
не требует отсутствия ранее допущенного эффекта в отдельном running расписании.

Основные stdout SHA256:

- baseline queued: `022954bfe874e5e0e8079c9aa3ed1d7ee88dbdfbb982c42933e236dcef83ed50`;
- final gate queued: `fbb744f1ce3aa397d3d1edfa2f6bd64f457c9319cbd431d755425dc511a03ee8`;
- final removed queued: `b6bbad3a61af9f4640209be1d27d8bba8b0f5be7215c74d259cd5d1eb0b1063a`;
- final concurrency raw manifest: `172e6b829b7828d9447773a87139e71435d8f8d53aa88656c0ac0f72744fac6d`.

Полные exits, commands, PID, events, stderr SHA, fixture locators — в переносимых
JSON под `session-evidence/prototype-sol-1/`; финальные — в `final-replay/`.
Raw с физическими путями сохранён снаружи в approved temp:
`081-sol-baseline-raw-wvok50`, `081-sol-prototype-raw-pU8bx3`,
`081-sol-concurrent-SJjvYC`; промежуточные raw тоже сохранены.
Снимок финальных драйверов: `081-sol-final-drivers-7NCYi8` — точное
имя и SHA каждого файла указаны в `final-replay/drivers.json`.

## Реальная конкуренция и counterexample

`concurrent-probe.mjs` вызывает два async `spawn` до ожидания любого из них.
Оба процесса подтверждают ready, затем получают общий go. Первый держит lock
после D до effect-release; второй реально наблюдает EEXIST этого lock. Только
после обоих наблюдений контроллер отпускает effect. Получены один D, одна запись
реального эффекта и один duplicate. Последующий **новый Node-процесс** повторяет
тот же `(O,effectID)` без эффекта; `effect-2` той же O допускается отдельно.

Отдельные C<D пробы: закрытая S=A при R=B и закрытая R=A при S=B дают
`deny-closed`, ноль D и ноль фактических effects этих O. Новая независимая B
выполняет свою O. Это также проверка позднего old-wake, не host turn OpenCode.

Отдельный D<C: первый consumer удерживает критическую секцию с уже записанным D;
второй, выполняющий close, реально ждёт lock. После release эффект завершается,
пишется terminal синхронного fixture effect, затем C. Eventlog сохраняет именно
этот порядок; данный terminal не распространяется на произвольное дерево процессов.

Crash injection выполняет `process.exit(23)` **только собственного** consumer
после durable D и до effect. Контроллер явно ждёт его close. Новый процесс
пытается close, через 1500 мс возвращает exit2/`LOCK_UNRESOLVED`; C не записан,
intent D и owner lock сохранены, эффекта нет. Lock не крадётся по timeout/PID.
В алгоритме нет перехода восстановления такого lock: самопроизвольное ожидание
не даст terminal success даже при здоровом новом consumer. Бюджет T=120 секунд
не переопределён; полный 120-секундный recovery benchmark **не выполнялся**.
Это воспроизведённый провал положительной recovery-ветки, не PASS L за safe STOP.

## Test seams и граница выводов

Только новая изолированная копия baseline получает seams из `prepare.mjs`:

1. Во всех режимах observer получает ChildProcess и заменяет `unref()` на `ref()`
   для явного ожидания принадлежащего fixture wrapper. Команда, spawn и poll
   baseline сохраняются. Это отличие от detached production lifecycle раскрыто.
2. В gate-режиме `start` обёрнут общим filesystem lock/D с identity watch ID +
   `effectID=spawn`, S/R фиксированы fixture session-generation. `releaseExecutor`
   обёрнут тем же lock и монотонной записью C перед actual release.
3. На wrapper close сохраняется `wrapper-terminal`, явно `scopeExitProven=false`.
   Gate не заявляет, что spawn-return означает окончание процесса, и не обещает
   revoke уже работающего scope. C-marker также не назван close success.
4. `requestWatch` writer и прочие production поверхности **не интегрированы** с
   fence. Проверка queued consumer не доказывает REQ-02/05/12 в полном объёме.

До любых baseline imports: свежие `XDG_DATA_HOME`, `CREW_HARNESS_DB` и
`OPENCODE_CREW_PROJECTS={}`; проверяется точное BASE внутри fixture. Gate storage
также отдельный. Это предотвращает доступ к живому mailbox, но не создаёт OS
security boundary. Node v24.15.0, win32; том fixture C: наблюдался NTFS/Healthy.
Права/ACL, reparse aliases и внешние write handles не квалифицированы как L.
Применённые write/fsync не доказывают crash/power-loss атомарность directory entries.

| Требования | Область фактического результата |
|---|---|
| REQ-01/03, AC-01/02/12 | Частично: монотонный C и конкретные queued/running расписания в adapter; нет terminal close/revoke всех O |
| REQ-08/10, AC-05 | Частично: B, два consumers, stable per-effect ID, restart/retry и разные effects; нет всех fault points |
| REQ-04/15/16, AC-04/11/16 | Выбранный gate не проходит recovery после crash/D; OS scope и полный T не доказаны |
| REQ-09/11, AC-09/15 | Сохранены новые raw/commands/SHA и прежние bytes; это не восстановление missing исторического run1 |
| Остальные REQ/AC | Не проверены полностью; mailbox/role/reply/API/process revoke/документация production вне этой сессии |

Нет полного npm suite, полного guards CI или независимой приёмки; это не сдача
production-реализации. Нет оснований объявлять весь контракт достаточным.

Targeted privacy применяет существующие правила secrets/private-names ко всем
новым файлам, включая untracked. Первый audit обнаружил percent-encoded URL
локального пути в публичном stderr; исправлен только locator производной,
внешний raw и исходная ошибка assertion сохранены. Первый отрицательный audit
сохранён отдельно; итоговый вывод — `audit.json`. Это не полный guards CI.

## Запуски, остатки и применимость

Все пробы — `crew_watch machine=true`, последовательно; одновременно не больше
четырёх Node test-процессов, включая управляющие. Команды из корня дерева:

```text
node opencode-plugin/test/prototype081/sol-1/run-lifecycle.mjs <immutable-source> <approved-temp> baseline <evidence>
node opencode-plugin/test/prototype081/sol-1/run-lifecycle.mjs <immutable-source> <approved-temp> prototype <evidence>
node opencode-plugin/test/prototype081/sol-1/concurrent-probe.mjs <approved-temp> <evidence>
node opencode-plugin/test/prototype081/sol-1/final-replay.mjs <immutable-source> <approved-temp> <evidence>/final-replay
```

Первый запуск завершился ошибкой observer: pending top-level await после unref,
без stdout oracle. Это **не RED**. Raw `081-sol-baseline-raw-uztwsY` сохранён;
изменён только observer seam на ref, затем отдельный baseline replay получил
целевой RED. SHA safety oracle не менялся. Первую потерю ChildProcess ожидания
нельзя задним числом выдать за явное ожидание; адресный after отдельно маркирует
её metadata. Во всех принятых запусках собственные wrappers/consumers явно дожданы.
Ошибка cleanup не маскирует assertion: cleanup вообще не выполнялся.

Сохранены новые bounded fixtures, canaries и намеренно stale crash-locks; ни один
старый/чужой lock или процесс не останавливался и не удалялся. Реестр собственных
commands/PID/exits/остатков — `ownership-after.json` в evidence. PID absence,
`.exit` и done не считаются долговременным fence или доказательством OS scope exit.

- **Nova094:** только применимость воспроизведённого класса queued-after-close;
  нет адресного identity/revoke/exit-proof старого запуска, scratch/архивы не тронуты.
  **HOLD сохраняется**, local GREEN не разрешает Phase1/release/global GO.
- **orphan001:** отдельная legacy identity/возможные старые полномочия, прототип
  к её существующим операциям не подключён, процессов/очередей не касались.
  **HOLD сохраняется независимо от Nova094**.

Production/config/package/scripts/README/spec/refs не правились. Нет новых
зависимостей, SQLite/native broker, установки/elevation, API/admin/live действий,
Nova изменений, агентов, commits/push/merge. Пакет передаётся интегратору для
отдельной короткой независимой приёмки; продолжение/усложнение не начато.
