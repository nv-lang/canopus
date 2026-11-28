# 081 С5-1: RED и ограниченный tombstone-прототип

## Вердикт

На точной baseline-копии отложенный watch старой A выполнил side effect после
`releaseExecutor`; положительный независимый B тоже выполнил действие. Простой
durable tombstone блокирует queued A после перезапуска и сохраняет B, но не
обеспечивает сериализацию close/admission/effect: минимальная check/use гонка
выполнила side effect после C. Вывод: простой вариант недостаточен для REQ-03/05
и критерия L; на этом усложнение остановлено. SQLite, native broker и зависимости
не добавлялись и не разрешены этой сессией. Для выбора и проверки межпроцессной
authority/scope-примитивы требуется отдельный GO владельца.

## База и воспроизводимость

- Спецификация SHA256: `38aa3a2c36ece056435ca348b6b3b72bef5adf82a730d6d6c0035245f180f12e`.
- Baseline manifest: ревизия `7e23895b8cb2c3ea9e4ac506455fedd440e6afd0`, архив SHA256
  `cdae970cd7e84270a18ebfe159d72f9f23b12bd2c89bd991dd7a36798775f4e3`.
- Runtime: Node `v24.15.0`. Распакованный `source/` — экспорт, не Git repository;
  попытка `git rev-parse` завершилась 128 и не меняла baseline. Никаких системных
  установок не было. NTFS ACL/том и строгая граница прав scratch отдельно не
  подтверждались, поэтому выводы не относятся к security boundary L.
- RED-команда (из `opencode-plugin/`, через `crew_watch machine=true`):
  `node opencode-plugin/test/prototype081/red-close-watch.mjs '<baseline source>' '<approved temp root>'`.
  Код 0; A status `releaseExecutor returned`, side effect observed `true`; B
  `open control`, side effect observed `true`. Raw output SHA256:
  `a22d38aec9ef63abb557ec393ce10cbbc9f34f8015d0b034b80b3c6651944c3d`.
- Prototype-команда (через `crew_watch machine=true`):
  `node opencode-plugin/test/prototype081/tombstone-probe.mjs`. Код 0; queued A
  denied, A denied after reopening gate from same durable store, B admitted, race
  admitted and effect observed after close. Raw output SHA256:
  `6b22669fdcf76de6625509989f392f83afc9fa59ef34ad1487543ce432d8e711`.
- Первая попытка запуска RED использовала неверный relative path (exit 1, не probe).
  Первая версия race test закрывала A до второй проверки; assertion упал. Инъекцию
  перенесли после последней проверки и повторили: именно этот replay дал указанный
  результат. Никакой неуспешный вывод не переобъявлен успешным.

## Что проверено и что нет

- Наблюдался путь `requestWatch` → `pollWatches` → detached процесс, затем реальный
  `releaseExecutor` для A; эффект записан после возврата close. Это конкретная RED,
  не полный тест reassign/watch lifecycle.
- Прототип использует эксклюзивное создание durable tombstone-файла и проверки перед
  эффектом. Проверены очередь, повторное чтение после нового экземпляра gate и B.
  Проверка/эффект не сериализованы; stale consumer проходит на интервале после
  последней проверки. Это минимальный FAIL простого механизма.
- Не проверены независимые процессы/consumers, C<D/D<C с общим межпроцессным lock,
  crash/recovery, spawned-before-PID, descendant/write-handle scope, NTFS isolation,
  T=120, реальный reassign end-to-end, остальные writer/consumer surfaces и внешний
  OpenCode API. Никаких REQ/AC кроме указанных частных наблюдений нельзя объявлять
  PASS; L, полный контракт и global verdict остаются NOT VERIFIED/HOLD.
- Не заявляются полный `npm test`, guards, CI или независимая приёмка. Новые файлы
  прототипа не подключались к package scripts и не меняли production plugin.

## Границы и остаток

`durable-tombstone.mjs` — исследовательская fixture, не production code и не гарантия
межпроцессной durability. Для закрытия воспроизведённой гонки нужен общий
линеаризуемый close/admission/effect gate, который переживает restart и согласован
между consumers; его корректный OS/process scope и положительное восстановление в L
этой пробой не установлены. Старые Nova-сессии, legacy items, внешние clients и #94
не затронуты; HOLD остаётся. Сырые stdout доступны в журнале наблюдений сервера по
указанным digest; физические пути в публичный отчёт не перенесены.
