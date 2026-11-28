# Спецификация: долговременная блокировка закрытой сессии

Статус: черновик С1-2; не утверждена, реализация не разрешена. Основание — локальный разбор `analysis.md` и уточнение интегратора к запуску С1-2. Цель — исправить класс исполнения отложенных действий закрытым/переданным исполнителем, не только инцидентный carrier.

## Результат и границы

Результат после отдельных ворот: согласованный механизм и тестируемое исправление CrewHarness в `opencode-plugin/` (watch/lifecycle/dispatch и смежные части по будущему плану), описание поведения рядом с кодом. Изолированные fixtures/тесты не должны использовать реальную старую сессию или её scratch. Эта спецификация не разрешает код, тесты, админ-действия, Phase1/rerun, публикацию либо обновление живого плагина.

В scope: закрытие/передача session lifecycle; постановка и claim/start отложенных watches; новые worker turns/inbox dispatch/recovery; race close/claim/start; рестарт, повтор и ошибка остановки; достоверный exit proof; изоляция нового исполнителя.

Вне scope: общий оркестратор/редактор Nova, отмена задачи Nova #94 целиком, переписывание архивов, изменение исходников/релиза Nova, общий терминальный процесс-менеджер, arbitrary admin API, изменение чужого OpenCode.

## Термины

- **Closed session** — lifecycle tombstone/закрытое состояние старого spawned-session; оно монотонно и не может снова стать активным вследствие устаревшего файла/card/message.
- **Fence generation** — version/epoch владельца, синхронно меняемая при закрытии и проверяемая всеми путями постановки, claims, запуска, возобновления и dispatch. Конкретная схема — предмет плана.
- **Exact identity** — идентификатор владельца и операции, устойчивый к PID reuse (watch ID, session ID, generation и process creation identity/OS handle где доступно), плюс происхождение команды и cwd; один PID или basename недостаточны.
- **Exit proof** — положительное доказательство, что именно идентифицированный процесс завершён; отсутствующий/ошибочный PID query, `done`, `code: null`, ошибка `taskkill` и истечение timeout сами по себе им не являются.

## Требования (атомарные REQ)

### REQ-01 — durable close fence

Закрытие/передача old session атомарно устанавливает монотонный fence до запуска новой рабочей сессии. Ни один stale writer, delivery route или retry не может снять tombstone или вновь выдать старому session рабочую полномочность.

### REQ-02 — постановка из closed

`crew_watch` и `crew_timer` от закрытой сессии отказаны до создания request/side effect. Проверка — не только на tool entry: lifecycle identity должна быть привязана к request, чтобы устаревший actor не обошёл проверку.

### REQ-03 — queued/claimed запуск

Перед irreversible spawn consumer атомарно сверяет session fence/generation и owner identity. Close выигрывает race — claim/request отзывается и процесс не создаётся; start выигрывает по сериализованной транзакции — close ждёт/видит exact running identity и отзывает её адресно. Не допускается окно «проверил открытую → закрылось → запустил» без согласованного арбитража.

### REQ-04 — текущий watch

Закрытие инвалидирует pending и останавливает только принадлежащие старой сессии процессы по сохранённой точной identity. Неизвестная или повторно использованная identity даёт UNKNOWN/STOP; запрещён broad kill.

### REQ-05 — новые ходы и inbox

После close система не создаёт старой сессии рабочие prompt/command/retry/resume и не dispatch-ит новые рабочие сообщения. Уже существующий OpenCode inbox должен быть адресно inspected/revoked по фактической V2 API-схеме либо явно остаться UNKNOWN; interruption не считается постоянным запретом.

### REQ-06 — доказательство выхода

Статус `done`, `.exit` без сопоставления процесса или подавленная ошибка kill не маркируют процесс остановленным. Протокол сообщает отдельно: request отменён, interrupt принят/не принят, процесс завершён/не подтверждён, inbox item удалён/не удалён.

### REQ-07 — restart/concurrency/idempotency

Закрытие и fence переживают рестарт плагина/сервера; одновременные экземпляры и повторные вызовы не создают дубликатов, не resurrect request и не маркируют неуспешную остановку как успех. Состояние устойчиво к crash между любыми записями перехода.

### REQ-08 — новый worker изолирован

Новый worker получает отдельную session ID, generation и scratch/worktree; защита old session не запрещает новый ход/действия нового worker и не разрешает old process писать в его scratch/archive/log.

### REQ-09 — сохранность доказательств

Capture предшествует любому разрешённому административному revoke/stop. Raw evidence immutable; сбой/недоступность одной операции не переписывает оригинал и не объявляет evidence отсутствующим или восстановленным.

### REQ-10 — аудитируемость

Каждый отказ/переход/административный шаг связан с watch/session/generation/identity и фактическим результатом, без секретов, полного environment или недопустимых приватных путей в публичном выводе.

## Критерии приёмки и RED→GREEN

- **AC-01 / REQ-01,02,08:** isolated RED — закрытая сессия вызывает crew_watch/timer; GREEN — denied до request и без side effect; отдельный новый worker остаётся рабочим в собственном scratch.
- **AC-02 / REQ-03:** isolated RED — request поставлен, затем close между pre-check и claim/start; GREEN — атомарный арбитраж либо недопускает spawn, либо фиксирует принадлежащий running process для адресного завершения; никакой «тихий» запуск после close.
- **AC-03 / REQ-04,06:** isolated RED — stale request и PID reused/неизвестный PID; GREEN — не broad-kill, не ложное done, явный UNKNOWN/STOP, другие сессии не задеты.
- **AC-04 / REQ-05:** isolated RED — closed session получает отложенный новый ход/retry/inbox item; GREEN — никакого нового рабочего исполнения; тест отдельно покрывает запрет повторной постановки после interrupt.
- **AC-05 / REQ-07:** повторная cancel/close, конкурентные plugin instances и restart между state writes не воскрешают request/ход; kill error/timeout остаётся неуспехом exit proof.
- **AC-06 / REQ-08,09:** RED side-effect fixture пытается писать в scratch нового worker из old watch; GREEN — запись невозможна, evidence обоих исходных запусков побайтно неизменны.
- **AC-07 / REQ-10:** отчёт безопасен для публичного репозитория; нет credentials, env dump, машинных путей или чужих приватных имён.
- Реальная Nova #94 никогда не используется как RED-fixture. После реализации: адресные тесты/guards, затем весь точный CI затронутой части и независимая проверка через очередь машины; ни один selftest не заменяет полный CI.

## DNC — не делать

- Не считать `CLOSED`, interrupt, удаление inbox item, статус `done`, exit code записи или отсутствие PID единственным durable fence/exit proof.
- Не удалять raw evidence, старые scratch/archive/worktrees/refs и logs; не переписывать intake или manifests.
- Не выполнять broad kill, reset/stash/force, удаление сессии, реальный #94 запуск/re-run или mutation API без отдельного gate.
- Не блокировать нового worker blanket policy; не распространять проект на общий оркестратор и Nova tooling.
- Не читать/собирать полные environment, credentials, секреты или env родителя.

## Открытые вопросы и допущения

1. Текущие GET session/inbox должны быть повторены read-only после доступности сервера; предыдущий вызов был прерван при перезапуске и не дал ответа. Рекомендация: повторить адресно до любого будущего admin gate.
2. Exact cross-process transaction/lock/storage semantics — неизвестны; план обязан выбрать supported mechanism, включая Windows и несколько экземпляров. Не считать rename отдельных файлов общей транзакцией.
3. OpenCode `session.interrupt` и `session.inbox.cancel` подтверждены именами актуальных OpenAPI operations, но фактическая схема их ошибок/гарантии и права не исследованы полностью; не обещать необратимое закрытие с их помощью.
4. Нужна отдельная явная приёмка владельца/интегратора на административный протокол и последующие implementation gates. Сейчас #94 HOLD.
