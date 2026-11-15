# С5д-1: неполная доработка, адресный after и причины отказа

Автор честно остановился2/5, запуск12. Прочитаны все три новых скрипта, отчёт
и README evidence. Исходники/отчёты/журналы, пять первичных host stdout/exit и
сохранившаяся fixture (272 файла) побайтно сохранены во внешнем freeze.
Старые результаты и текущие файлы не менялись; тесты повторно не запускались.

## Предметные ошибки тестов

1. `lifecycle-oracle.mjs`38 измеряет `A.effect` **до** вызова `pollWatches`39.
   Затем poll запускает A, но поле `result.A.effectAfterClose` не пересчитывается.
   Assertion51 проверяет старое `false`, а не поведение после admission/effect.
   Поэтому ошибку нельзя квалифицировать только как «не удалось воспроизвести».
2. При read-only after в сохранившейся fixture **A.effect и B.effect существуют**.
   Raw stdout ранее показал card A running→closed через actual releaseExecutor.
   Это новое after-наблюдение фактической записи A после закрытия в изолированной
   fixture, а не исправленный задним числом raw и не целевой RED→GREEN oracle.
   Несовпадение с полем JSON объясняется порядком строк38–39.
3. `gate-probe.mjs`35 использует `map(...spawnSync...)`: второй consumer начинается
   только после завершения первого. Два процесса есть, конкурентной борьбы двух
   consumers нет. Сообщение «two consumers contend» и итоговый boolean этого
   не доказывают. Нужны async spawn обоих процессов и детерминированный barrier.
4. Строка23 с названием `cBeforeD` вызывает effect **до** close24. Это D<C,
   а не отдельный заявленный C<D schedule. После close проверяется повтор того же
   effectID; отдельную причину deny нельзя подменять общим false.
5. Gate — отдельный adapter без lifecycle/watch seam. Один и тот же safety oracle
   на baseline и исправлении не получен. File writes не дают обещанной crash
   durability сами по себе; stale lock не разрешён. SQLite/broker из этих ошибок
   не следуют. Production, L/T и legacy fence остаются NOT VERIFIED/HOLD.

## Scoped read-only опись после EPERM

- Пять host watches этой сессии помечены done, первичные stdout/exit сохранены.
- В fixture два watch records A/B остались running, но оба имеют `.exit` с0.
  Это stale metadata, не доказательство живого процесса и не terminal close.
- Известные PID этих семи запусков не обнаружены в текущем адресном OS snapshot.
  По exact fixture locator найдены только текущие диагностические PowerShell
  процессы самой проверки; их parent/PID/name/start metadata сохранены отдельно.
- Каталог fixture и два canary не удалялись; bytes сохранены. Само отсутствие
  известных PID и наличие `.exit` не global OS/scope-exit proof и не fence.
- Task081 idle, card автора busy=false. Новый исполнитель не запускался;
  слот пока не объявлен освобождённым по одному статусу. Legacy094/orphan001
  не обследовались этой описью и не остановлены.

## Рекомендация на новых воротах

Одна предметная сессия Sol с новым явным разрешением **только на эти пробы**:
исправить sampling, конкурентный запуск и schedule labels, соединить простой gate
с неизменным lifecycle oracle в изолированной fixture, сохранить raw и дождаться
своих конечных процессов до любого cleanup. Не новая spec/архитектура, не SQLite/
native broker, не production/admin/live. Предыдущие два авторских результата
остаются отрицательными/неполными; разрешение Sol-планирования не переносится.
До ответа и свежего согласования слота ничего не запускать.
