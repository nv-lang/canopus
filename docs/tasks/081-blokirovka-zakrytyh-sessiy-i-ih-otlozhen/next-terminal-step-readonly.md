# Следующий узкий шаг: host admission и terminal scope, только read-only вывод

Источник запроса — Nova integrator21:09, 2026-10-18. Исполнитель не запускался;
API/service/process mutations, live hooks и новые компоненты не выполнялись.
Результат прототипа по-прежнему `MUTEX_PRIMITIVE_ONLY`, не fence.

## Что меняет следующий шаг

Не нужен ещё один круг Mutex. Необходимо различить два независимых барьера:

1. **Будущий effect/turn старой identity больше не допускается.** Общий C/D gate
   CrewHarness должен охватывать собственные writers/consumers, но не заменяет
   серверный контроль независимого клиента/уже принятого OpenCode input.
2. **Ранее допущенный effect получил terminal proof.** Ни Mutex, ни permission deny,
   interrupt или restart не доказывают прекращение уже работающего writer.

## Что найдено в официальной документации V2

- [Plugins, Permissions](https://opencode.ai/v2/docs/build/plugins):
  `ctx.session.update({sessionID, permissions: [...]})` — поддерживаемая форма
  session-scoped rules; explicit deny окончателен. Уже существующие child sessions
  нельзя считать обновлёнными автоматически: наследование описано на момент создания.
- Там же, Prompt admission: hook до durable admission, но synthetic/shell/compaction/
  move не проходят через него; retry уже pending/delivered ID возвращает прежнее
  admission без повторного hook. Typed rejection API для prompt hook не заявлен.
  Следовательно, один prompt hook **не** durable session fence.
- Есть `permission.evaluate` и `tool.execute.before`, но наличие API не доказывает
  отзыв уже допущенного вызова или охват всех прямых сторонних effects. Нужна
  проверка точной установленной версии и её фактической схемы/реализации.
- [Client, local service](https://opencode.ai/v2/docs/build/client):
  `Service.discover()` читает здоровый зарегистрированный endpoint без запуска;
  `Service.ensure()` может запустить службу. Для будущего read-only осмотра нельзя
  выбирать ensure/restart как скрытое восстановление. Тот же действующий auth,
  без чтения/вывода credentials и full env.

Это чтение текущих публичных документов, не доказательство поддержки данной
службой и не выполненная проверка её OpenAPI. Страница API reference не дала
пригодного текстового контракта; её нельзя подменять угаданными HTTP routes.

## Рекомендуемый минимальный следующий результат

**Адресная capability/operation-карта без мутаций**, раздельно для
`ses_mvawdsam690xeqwzpp` и orphan001 worker/reviewer из
`fast-path-setup/nova-scope-input.md`:

- фактическая версия/схема и точные supported session/permission/interrupt/wait
  операции; immutable session/generation и наличие child/external IDs;
- coverage будущего admission: новый prompt, повтор старого ID, synthetic, shell,
  auto-resume/tool continuation, CrewHarness mailbox/watch/role items;
- полный доступный список O/effectID с causation и queued/claimed/admitted/running
  состояниями; для каждого ранее допущенного effect — какой **существующий**
  trusted scope/handle/receipt позволяет доказать terminal, и что неизвестно;
- preserved before bytes/SHA и missing явно, без реконструкции по digest.

По этой карте — один предлагаемый capture→C/host-deny→revoke→wait→terminal-proof→
negative-old-wake протокол. Его применение к живым identity — отдельное разрешённое
действие после scope proof, не часть текущего read-only результата. Заранее задать
положительную независимую B и неизменяемость archive/log обоих запусков.
Проба не должна будить старую сессию «для отмены» или терять её evidence.

## Где действительно требуется OS primitive

[Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
документируют membership, отсутствие breakaway, групповое завершение и accounting.
Job сам по себе не задаёт security ограничения процессов; IOCP notifications не
универсальное terminal proof. Job membership/идентичность должны предшествовать
пользовательскому code, иначе spawn-before-PID и уже отделившийся writer не учтены.

Для **новых** контролируемых операций это кандидат будущего scope-протокола,
не выбранный и не реализованный helper/broker. Для **legacy** нельзя приписать
такой scope задним числом: если trusted ownership/контроль отсутствуют, остаётся
unresolved с конкретной причиной. Один process tree/PID snapshot недостаточен.
Защита B/handles требует отдельного доказательства, не одного Job или random cwd.

## Критерий передачи Nova100

Нужен versioned отчёт с exact identity, C/admission coverage, перечнем effects,
terminal proof каждой допущенной O либо точным unknown, before/after digests,
результатом negative old-wake и положительной B. Только отсутствие unknown по
целевому scope допускает обсуждение адресного GREEN. До того OLD094/ORPHAN001 HOLD.

Рекомендация: сначала карта фактических возможностей сервера и существующих scope,
а не новый Mutex/SQLite/broker и не restart. Если карта покажет отсутствие нужного
host/OS механизма — предъявить этот минимальный технический пробел владельцу для
отдельного выбора компонента/границы, не маскировать его local GREEN прототипа.

Уточнение Nova21:36: условный GO на clean Phase1 уже дан после настоящего GREEN
fence и независимо принятого immutable v11; повторно его не спрашивать. Сейчас
условия не выполнены: fence GREEN и v11 acceptance нет, HOLD сохраняется.
