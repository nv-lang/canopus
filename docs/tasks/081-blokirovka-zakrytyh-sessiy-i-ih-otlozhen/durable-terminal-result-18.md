Статус: технический STOP перед production-интеграцией; не готово.

# 081: durable admission/terminal, запуск 18

## Результат

**Исходный дефект воспроизведён на свежем origin/main. Mutex+durable intent
недостаточны для обязательного OS write/scope контракта. Production fence не
поставлен; OLD094 и ORPHAN001 остаются HOLD.** Это разрешённая назначением ранняя
остановка на конкретном техническом пробеле, не реализация «всегда STOP».

Новое разрешение production правок принято, прежний prototype-only запрет не
переносился. Причина отсутствия production diff — воспроизведённая недостающая
граница AC-08/11, а не отсутствие полномочий на обычный код. Незавершённый общий
gate не вносился под видом достаточного механизма.

## База и сохранность

- HEAD задачи: `26429fa11424f4a5bb0b6a595dc0a95cea6e1601`.
- После fetch origin/main: `01b2c391cb1043022eaabe336ebca06d74f50707`.
  Export exact archive SHA-256
  `4098954a4eacc756f725a0a7f5c8250b71afb853c4aba198a2de66578ce2d9d5`.
- Production `watch.ts` между этими cuts идентичен. Baseline выполнен именно на
  свежем export, не на предположении, что старый cut всё ещё актуален.
- Approved spec: 44357 bytes, SHA-256
  `38aa3a2c36ece056435ca348b6b3b72bef5adf82a730d6d6c0035245f180f12e`.
- До предметных правок 190 existing files сохранены побайтно с manifest вне repo:
  locator `081-durable18-before-64gP8e`. Включены dirty task docs, старые drivers,
  production boundary files и .git-pointer. Public inventory: `before.json`.
- Merge не требовался для раннего STOP: production не интегрируется, свежий source
  проверен отдельно. Dirty docs сохранены; reset/stash/force/ref/main изменений нет.

## Минимальная реальная counterexample

Новые файлы только `opencode-plugin/test/prototype081/durable-18/` и evidence
этого запуска. Старые oracle/scripts/fixtures/raw не редактировались.

1. `sol-1/lifecycle-oracle.mjs` неизменен, SHA-256
   `c274a18bcaeec4cb0b584904fabd7114e4ec7ed737c1ef65e5b96ecf85adbc98`.
   На fresh baseline queued сценарий даёт **exit 1 именно SAFETY ORACLE**:
   actual releaseExecutor меняет A running→closed, после poll A effect=true;
   B effect=true. Отдельный running сценарий exit0 — не terminal proof.
2. Новая Windows fixture: один Mutex owner сохраняет и Flush(true)-ит
   `(S=A#1,R=A#1,O=bounded-write#1,effectID=spawn#1,state=admitted,outcome=unknown)`.
   Запускает конечный обычный Node writer и действительно self-crash до
   authoritative PID/scope persistence.
3. Второй прямой PowerShell child заранее открыл тот же Mutex. Получает abandoned
   ownership, читает **тот же** intent, сохраняет C(A#1), оставляет unresolved,
   unknown и replay=not-executed. Не повторяет effect и не объявляет close success.
4. После C writer A обычным `writeFileSync` открывает файл B, хотя scratch разные,
   никаких B handles до user-code не выдано, нет reparse/delegation/elevation.
   **Запись разрешена**, B bytes изменились. Это исходный write/scope пробел, а не
   ошибка mutex contention/driver. Независимая B успешно пишет canary.
5. Observer-only exact process handle открыт до аварии исключительно для ожидания
   нашего finite child; WaitForExit и exit0 явно сохранены. Он НЕ находится в
   authoritative intent и НЕ выдаётся за решение crash recovery/всех descendants.
   Оба PowerShell children дожданы по ChildProcess.close, Node writer — по
   retained OS handle. Чужих PID/sessions не трогали; broad kill отсутствует.

Первая пара scope/repeat оба дала exit1 **на AC-08 safety assertion**, не routine
exception. Raw locators и children — в `session-evidence/durable-18/probes/`.
Начальные SHA B `4bc2f995f3746a98ddd862177035931feb3007b3ffcb1d9c68e89e210d00c34c`,
после A `cbe1c785f3208cac53ab143ac40995cf2dc5877704c5b17e2603716c0f8d68b3`.

Финальный replay добавляет **платформенный preflight до D**, не меняя safety assertion:
Windows10/11 family, Node>=24, Fixed NTFS, Elevated=false и T=120000ms.
Выходы отдельно `probes-qualified/`; первая пара сохранена, а не переписана.

Финальный queued baseline снова RED, scope и scope-repeat снова exit1 на том же
AC-08 assertion; outer exit0 за 13с. Все PS stderr пусты, оба recovery exit0,
оба crash-owner exit4294967295, оба observer WaitForExit exit0; B positive.
Итоговый raw locator `081-durable18-run-ChZ7n0`, SHA и имена всех прогонов в
`probes-qualified/runs.json`. Это четыре подтверждения недостающей boundary
(две ранние и две после platform preflight), не четыре реализации fence.

**Граница L/пункт4:** разные scratch и отсутствие заранее открытых B handles
проверены конструкцией fixture. Но inherited обычный access token A с самого начала
позволяет открыть B; требуемый pre-user-code запрет файловой capability **не
обеспечен и не доказан**. Поэтому fixture НЕ объявляется уже изолированной L,
а результат НЕ доказывает недостижимость L. Он воспроизводит недостающие
обязательные preflight/OS boundary у проверяемого простого механизма. Одна проверка
«нет открытых handles» не удовлетворяет полной части L/4 о capabilities.

## Точный технический пробел

Штатный .NET Mutex сериализует записи и переносит владение после crash, но не
ограничивает Windows token/файловые capabilities и не создаёт durable process
scope. Node spawn/.NET Process.Start запускают user code до последующего PID
учёта; PID/parent tree/taskkill не исправляют эту границу. Публичные параметры
установленного ProcessStartInfo/Start-Process не предоставляют pre-execution
Job assignment + restricted-token boundary (`stock-capabilities.json`).

Нужен **поддерживаемый OS launch/revoke primitive**, который до user code связывает
весь scope с recoverable O и ограничивает запись в B. Ни один такой primitive
среди проверенных разрешённых штатных публичных API не найден. Это не доказательство
невозможности любого Windows решения и не необходимость SQLite или постоянного
broker. Job сам по себе также не security boundary.

Следующий минимальный кандидат для отдельного разрешения — узкая Win32 interop
проба pre-execution Job membership + restricted token/ACL, без постоянного broker,
dependencies/install/elevation. Её feasibility, crash lifetime и отсутствие утечки
handles ещё НЕ доказаны. Сейчас Add-Type/addon/native component запрещены, поэтому
дальнейшая production интеграция полного обязательного контракта остановлена.

## Host, ownership и legacy

Actual host **2.0.26** и schema проверены GET, не через ensure. Runtime поддерживает
session permissions update, prompt/synthetic/shell и exact interrupt/inbox cancel
как разные APIs. Наличие endpoint не доказывает terminal/revoke. Installed hook
runtime coverage direct/retry/native tool не проверена; документный prompt-hook
bypass явно не объявлен покрытым.

Дополнительно получен, прочитан и проверен exact published plugin/client SDK2.0.26
(`sdk-surface.json`): permission/tool/session/shell declarations. Его собственный
Service.discover успешно подтвердил работающую 2.0.26 через `/api/info` (200),
повтор OpenAPI и metadata совпал. Старый SDK mismatch устранён, не причина STOP.
`Shell.create.before` не содержит sessionID/O в объявленном event. Actual shell/
persistentPty create/read/stop поверхности также рассмотрены: PID/status не
объявляют pre-execution security scope/полный terminal proof. Это карта конкретных
проверенных контрактов, не вывод из одного отсутствующего поля Session.Info.

Полная карта: `session-evidence/durable-18/host-boundary.md`. Там OLD094 и оба
ORPHAN001 участника раздельны; полный исполнимый legacy revoke протокол отсутствует
на точной границе trusted scope/issued-effects ownership. Исполнимы только уже
выполненные capture/metadata GET; negative-old-wake живых сессий не выполнялся.

## Команды и проверки

Из корня, аргументы внешних locators задаются локально, не в публичном коде:

```text
node opencode-plugin/test/prototype081/durable-18/capture.mjs <approved-temp> <evidence>
node opencode-plugin/test/prototype081/durable-18/host-readonly.mjs <cached-service-module> <approved-temp> <evidence>
node opencode-plugin/test/prototype081/durable-18/metadata-readonly.mjs <approved-temp> <evidence>
node opencode-plugin/test/prototype081/durable-18/run.mjs <fresh-export>/source <approved-temp> <evidence>/probes-qualified
```

Тяжёлые пробы только `crew_watch machine=true`, последовательно, не более двух
PowerShell детей одновременно. Outer driver exit0 означает **подтверждены ожидаемые
RED**, не fence GREEN. Имена, exits и SHA — `runs.json`; raw failures сохранены.
Первый host discovery exit1/health404 диагностирован и исправлен в этой сессии,
без owner формы/ensure/ложного архитектурного вывода.

Отдельная таблица всех18AC: `session-evidence/durable-18/ac-status.md`.
GREEN/removed-fix RED, production targeted/full actual npm, full guards/selftests
и independent acceptance **не выполнены**: исправленной production поставки нет,
ранний STOP до неё. README/help/машинная production schema не менялись и нового
контракта не обещают. Полный тестовый состав fresh package фиксируется аудитом,
а не берётся из устаревшей цифры spec. Локальный privacy audit нового пакета —
не замена полному guards CI или lifecycle доказательству.

Коммиты/push/main/live/restart/Nova/общие config/profile/task JSON/новые агенты
не выполнялись. Этот отчёт не снимает HOLD и не разрешает Phase1.

Фактический fresh npm script: **129 команд, 128 test files** плюс cleanup.
Полный suite не запускался; прежняя цифра120 из spec не использовалась как actual.
Первый host failure stdout побайтно скопирован во внешний before locator как
`initial-host-failure.out`; отсутствие healthy old-SDK не стало основанием STOP.

Scoped audit через machine queue: **exit0**, 32 новых файла без нарушений реальных
privacy judges, 190 before entries сохранены (existing exact либо journal prefix;
свои новые drivers могут меняться, их before bytes тоже сохранены), production
tracked diff пуст. `audit.json` содержит hashes и пофайловый результат. После этой
датированной фиксации статуса тот же audit повторяется, без изменений driver/code.
