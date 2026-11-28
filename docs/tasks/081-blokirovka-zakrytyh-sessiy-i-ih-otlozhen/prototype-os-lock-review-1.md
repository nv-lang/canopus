# 081: независимая короткая проверка OS-lock-2

## Вердикт

**Принимаю ограниченный исследовательский вывод о contention и автоматической передаче владения после аварии**, с замечанием к журналированию идентичности mutex. Это не production fence, не успешное закрытие и не доказательство L/T, OS scope или legacy.

- **Contention:** два прямых `powershell.exe` child-процесса получают одно имя mutex; первый удерживает объект на барьере, второй фиксирует `WaitOne(0) == false` и выходит с кодом 4. Только первый записывает эффект. Реальные owner/contender барьеры и результат согласуются с исходниками и свежим прогоном.
- **Crash/recovery:** PowerShell owner сам получает mutex, до аварии создаёт и `Flush(true)`-ит durable intent `(S=A#1, R=A#1, O=O-crash#1, effectID=write#1, state=D, outcome=unknown)`, затем проходит барьеры и вызывает `GetCurrentProcess().Kill()` без обычного `finally`/`ReleaseMutex`. Живой contender создаёт mutex с переданным тем же `crashMutex`, сигналит `crash.contender-opened` до ожидания и получает `AbandonedMutexException`; запись recovery содержит `abandoned=true`, те же значения D и `replay=not-executed`.
- **D и эффект:** именно в этой пробе D существовал до аварии, исход оставлен `unknown`, эффект crash-owner отсутствует, повтор не выполнялся. Это наблюдение не разрешает общий retry, lifecycle или revoke. `ReleaseMutex` после recovery не считается successful close.
- **B:** отдельная операция прошла owned/go/effect с exit 0. Она подтверждает только позитивную canary-операцию своего mutex, не изоляцию OS scope.
- **Состав:** ровно пять PowerShell children: contention-owner, contention-contender, crash-owner, recover-contender и B. Все пять `close` завершены и отмечены `closed: true`; шестого retry/проверки идемпотентности здесь нет.

## Замечание к evidence

`probe.mjs` передаёт `mutexName` в каждый child, но `child-start` event записывает внешнюю переменную `mutex`, а не аргумент `mutexName`. Поэтому event-журнал ошибочно приписывает crash-паре и B имя mutex contention-пары. Не выдаю этот event field за подтверждение их идентичности. Источник напрямую передаёт `crashMutex` обоим recovery children и отдельное имя B; recovery record и исходник подтверждают ограниченный вывод. Это дефект наблюдаемости fixture, не основание расширять вывод и не изменение fixture в этой проверке.

## Независимый запуск

- Исходники прочитаны независимо; SHA-256 совпадают с зафиксированными в correction result: `probe.mjs` `D4BFA7CB821BACB49DFD0AD5E9EA2B9BD2FFDA638B78F93A6C4784989AEDBD1F`, `consumer.ps1` `D6B8F9CB95FAD4E672812DAB0F38B6C3D4D2C52CCDEF7020AC9681BD24725E82`.
- Неизменная команда из `opencode-plugin/`: `node test/prototype081/os-lock-2/probe.mjs`, через `crew_watch machine=true`; exit 0. `TEMP`/`TMP` направлены в разрешённый временный каталог. Raw и fixture запуска сохранены там; пути и digests — `session-evidence/prototype-os-lock-review-1/manifest.md`.
- Driver вывел уникальное имя contention mutex `Local\CrewHarness081OsLock2-57460-1792346593284`; по исходнику crash и B передают отдельные имена с суффиксами `-crash` и `-B`.
- Одновременно контроллером было запущено не более двух PowerShell children; все свои процессы дождались закрытия. Сторонние процессы не инвентаризировались и не трогались.

## Границы

Результат не доказывает OS scope/писателей/handles, revoke, successful close, полный L/T, lifecycle/API/admin, legacy PASS или general retry. Nova #94 и orphan001 остаются HOLD. Не делаю выводов о SQLite/broker/helper/compiled code. Production, config, package, spec, README, refs, авторский freeze и старые raw/fixtures не менялись; полный suite/guards, commit/push/merge и live/admin действия не выполнялись.
