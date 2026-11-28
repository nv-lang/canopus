# 081: короткая независимая проверка Sol-прототипа

Полномочие: быстрый путь владельца, письма оркестратора14:04/20:11;
после доказательного прототипа одна короткая независимая сессия и сразу передача
результата/критерия Nova100. Не новый С1–С2/плановый цикл, не приёмка production.
Автор Sol, проверяющий — другая сессия обычного профиля. Один наш слот;
orphan001 остаётся вторым потенциальным исполнителем.

Входы: неизменная spec; `prototype-sol-result.md`; все восемь файлов
`opencode-plugin/test/prototype081/sol-1/`; `session-evidence/prototype-sol-1/`
(intake, final-replay, audit, ownership-after и ограничения первых ошибок).
Пакет сохранён интегратором exact freeze `081-sol-1-integrator-freeze-6dwq4j7l`:
13 прежних SHA, 24 audit entries и262 baseline source сверены без расхождений.
Не заменять самостоятельное чтение/запуск авторским audit PASS.

Четыре законченных единицы, С6п N4; launch пишет плагин.

1. Прочитать код oracle/seams/gate/drivers и первичные evidence. Самостоятельно
   сверить SHA одного oracle, реальное создание/закрытие карточки и sampling после
   poll/terminal/ChildProcess.close. Отдельно проверить, что observer seam ref()
   не выдаётся за production OS proof и running D<C не назван успешным close.
2. Самому replay исходную baseline queued RED, затем queued gate GREEN и removed
   gate RED с той же safety assertion, B положительна везде. Отдельно running
   schedule. Новые изолированные BASE/scratch, новые отчёты и raw, не перезаписывать
   авторские evidence. Не менять драйверы, assert и production. Указать commands,
   driver SHA, revisions, внутренние exits и действительную причину RED.
3. Самому replay concurrent consumers и crash counterexample: async два ready,
   go/hold/release, фактическое EEXIST contention, один D/effect, stable retry/restart
   новым процессом, разные effects, C<D deny source/recipient, B success, D<C accounting.
   Crash после D оставляет lock и close LOCK_UNRESOLVED: это FAIL recovery этого
   алгоритма, не необходимость SQLite/native broker и не принятие «всегда STOP».
   Проверить вывод о сохранности/владении собственными процессами и raw.
4. Новый `prototype-review-1.md` и `session-evidence/prototype-review-1/`: три
   раздельных verdict — исходный defect; частная queued/concurrency корректность;
   недостаточность выбранного recovery/непроверенные OS/L/T/legacy границы.
   Чётко сказать, принимается ли прототип как доказательный исследовательский
   результат, не production fence. Замечания по факту, без нового полного аудита.
   Сдать и остановиться; никакого live GO, слияния или автоматической доработки.

Все запуски через `crew_watch machine=true`, последовательно или максимум4
процесса тестов; упавший при параллельном запуске отдельно. Локальный replay
`final-replay.mjs` включает prototype/concurrency, baseline replay требуется
дополнительно, не полагаться только на сохранённый baseline raw.

Имеющиеся outside locators переданы в goal: immutable baseline export и exact
freeze. Raw с физическими путями — в новом разрешённом temp, публично производные.
Старые fixtures/источники/raw/ошибки сохранить; cleanup не требуется, никаких
kill/poll старой очереди. Свои дети явно дожданы, остатки перечислены.

Не править авторский код/отчёты/spec/config/package/README; не запускать полный
npm/guards вместо ограниченного replay, не вводить новые dependencies/SQLite/native
broker, не делать system install/elevation/commits/push/merge/API/admin/live/Nova
или новых агентов. Короткая проверка не снимает Nova094 и orphan001 HOLD и не
подменяет их отдельный адресный fence/независимый proof.
