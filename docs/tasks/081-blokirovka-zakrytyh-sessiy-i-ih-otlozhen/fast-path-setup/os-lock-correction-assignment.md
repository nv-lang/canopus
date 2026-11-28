# 081: исправить OS-lock fixture, без новой архитектуры

Быстрый путь20:11: один обычный исполнитель, routine исправления тестового драйвера
без owner forms. Предыдущие os-lock-1 файлы/raw оставить неизменными; они сохранены
exact внешним freeze081-os-lock-1-freeze-xuah_b3e.

Конкретная ошибка: `consumer.mjs` печатает PowerShell `result.code`, но не
передаёт его в `process.exitCode`; Node-wrapper штатно выходит0 даже при PS exit4.
`probe.mjs`35 проверяет exit Node-wrapper, не владельца Mutex. Поэтому два
assertion0≠4 ничего не говорят о неработоспособности Mutex.

Ещё не выполненные части старого driver нельзя принять без исправления:
- повторно используется прежний `go`, crash phase уже не имеет отдельного barrier;
- PowerShell `exit23` проходит через finally/Dispose — это не убедительная проба
  аварии без нормального освобождения;
- `intent.json` пишется контроллером ПОСЛЕ child crash, а не владельцем до crash/D;
- Node-controller + два Node-wrapper + два PowerShell = пять процессов пробы,
  тогда как назначение требует максимум4 вместе. Убрать лишние wrappers:
  Node-controller может запустить двух PowerShell consumers напрямую (всего3).

## Четыре единицы, С5д N4

1. Прочитать spec/принятый prototype-review-1 и failed OS result. Подготовить новую
   isolated fixture с уникальным общим mutex name только для её consumers;
   exact before старых файлов. Подтвердить ошибки по коду/первичным выводам.
2. Direct async PowerShell children; stdout/stderr и exit различимы для каждого,
   awaited child.close и finite watchdog. Фактическое contention: первый владеет
   и держит до отдельного go, второй уже жив и наблюдает занятость того же Mutex.
   Не переименовать ожидаемый exit4 в0 ради PASS; проверить истинный PS результат.
   Оба имеют independent ready/owned/contended/go и события thread/PID/name identity.
3. Отдельная crash fixture/barriers: собственный owner захватывает Mutex, записывает
   **до аварии** durable intent/D со stable(O,effectID); contender открывает тот же
   объект пока owner жив, чтобы проверить takeover, а не создание нового объекта.
   Реальная авария только собственного PowerShell process (например self-termination
   через GetCurrentProcess().Kill), без чужих PID/broad kill и без нормального finally
   освобождения. Owner.close явно дождаться; contender корректно обрабатывает
   AbandonedMutexException как полученное владение. Не удалять lock/intent, не TTL/PID
   stealing. Durable D с неизвестным effect остаётся unresolved, не авторизация
   повторного исполнения и не terminal proof. Новый process retry не дублирует O;
   отдельная B действительно успешно действует. Исследовать границу, не придумывать
   успех generic operation recovery по одному lock release.
4. Новый отчёт с раздельными verdict availability/contention/auto-release/intent/
   OS-scope/L/T/legacy, точными commands/hashes/exits/raw и своими процессами. Если
   валидная проба действительно не проходит — минимальный counterexample; ошибки
   самого драйвера исправлять в рамках этой сессии, а не объявлять каждый assertion
   доказательством невозможности. Сдать готовый ограниченный результат и остановиться.

Новые файлы `opencode-plugin/test/prototype081/os-lock-2/`, новый
`prototype-os-lock-correction-result.md`, `session-evidence/prototype-os-lock-2/`,
append журналы. Старые outputs не править. Raw с путями снаружи, public производные.
Старые fixtures/очереди/PID не возобновлять и не чистить. Все пробы через machine
queue, максимум4 test processes вместе; упавший replay отдельно. Свои дети конечны
и явно дожданы, evidence и intentional fault state сохранить.

Никаких production/spec/config/package/scripts/README/refs изменений, SQLite,
новых broker/service/compiledhelper/Add-Type/addon/dependencies/install/elevation,
API/admin/live/Nova/Phase1, commits/push/merge и новых агентов. Только штатные уже
имеющиеся Windows/.NET средства в новой тестовой fixture. Мутекс не fence чужого
процесса; оба legacy scope HOLD. Независимый replay назначит интегратор после сдачи.
