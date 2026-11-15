# 081 С5д-3: проверка OS-lock — STOP на contention

## Результат

**STOP: lock contention не доказан.** Windows PowerShell 5.1 доступен; контрольный отдельный запуск успешно создал и захватил именованный `.NET Mutex`. Однако новая изолированная fixture дважды завершилась на одном assertion: второй consumer получил exit 0 вместо ожидаемого exit 4 от наблюдаемого `WaitOne(0)` contention. Следовательно, в текущем driver оба consumer-ы, по видимым признакам, сочли mutex свободным. Это сбой пробы/её реализации, не доказательство того, что Windows Mutex не обеспечивает межпроцессную блокировку.

Из-за этого барьера намеренный crash собственного child, явное ожидание его `close`, и повторный захват новым owner после crash не выполнялись/не подтверждены. Не заявляются ни исправление stale-lock failure, ни OS lock PASS. Не следует продолжать к recovery тестам, пока contention не устранён и отдельно не подтверждён.

Даже при будущем успешном захвате OS mutex не разрешит outcome durable intent/D: при crash после D intent и стабильные `(O,effectID)` сохраняются, outcome остаётся `unknown`; mutex release не является terminal proof и не разрешает повтор эффекта. Неоднозначный effect требует STOP без дубликата и без ложного успеха.

## Источники и проверка

- Официальный Microsoft Learn: [Mutex Class](https://learn.microsoft.com/en-us/dotnet/api/system.threading.mutex?view=net-10.0), описывает синхронизацию между процессами и владение/освобождение mutex.
- Официальный Microsoft Learn: [about_PowerShell_exe](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1), документирует штатный Windows PowerShell CLI.
- Очередная короткая availability-проба: PowerShell `5.1.26100.9711`, `Mutex.WaitOne(0)` вернул true и mutex освободился штатно.
- `opencode-plugin/test/prototype081/os-lock-1/probe.mjs` — первая попытка завершилась exit 1 на `0 !== 4`; отдельный replay завершился тем же assertion и exit 1. Raw выводы watch сохранены вне task evidence системой наблюдения. Реальные пробы шли через `crew_watch machine=true`, по одной.
- Никаких старых fixtures/evidence, production-файлов, package/config, процессов или очередей не меняли. Crash child не запускался; повторный owner, intent recovery, D/C accounting и B в новой OS fixture не проверены.

## Точный остаток

| Область | Вердикт этой сессии |
|---|---|
| Доступность PowerShell/.NET Mutex | Проверена на этой машине; не гарантия для иных окружений |
| Реальный contention двух consumers | Не доказан; дважды assertion failure |
| Stale-lock после owner crash | Не проверен; исходная mkdir stale-lock находка остаётся |
| Durable intent/D, replay и отсутствие дубликата | Не проверены этим прототипом; ambiguous outcome требует STOP |
| OS scope, descendants, write handles, ACL/reparse | Не проверены; mutex не доказывает revoke или прекращение писателей |
| Общие C/D/admission и lifecycle | Fixture не подключена; Sol-прототип остаётся ограниченным, не production lifecycle PASS |
| L/T, положительная B, legacy scopes | Не доказаны этим прототипом; Nova094 и orphan001 остаются HOLD |

Следующий минимальный шаг: исправить только isolated fixture так, чтобы сохранить сырые наблюдения владения/конкуренции и доказать, что второй независимый процесс действительно видит mutex занят; затем повторить только contention пробу. Не менять выбранный oracle, не делать recovery выводов до прохождения этого барьера. SQLite/broker из этого результата не следуют.
