# 081 С5д-4: исправленная OS-lock fixture

## Итог

**Новая ограниченная проба прошла:** два прямых PowerShell consumer-а на одном уникальном именованном `.NET Mutex` дали подтверждённую конкуренцию (владелец удерживал объект; contender получил `WaitOne(0) == false` и PS exit 4). Отдельно собственный PowerShell owner устойчиво записал intent/D до аварийного завершения; contender открыл тот же именованный объект при живом owner-е, затем поймал `AbandonedMutexException` после его самозавершения. Он сохранил `(S,R,O,effectID,D,unknown)` как unresolved и не повторил effect. Независимая B успешно создала свою canary-запись.

Это не production/lifecycle PASS и не закрытие общего дефекта. OS-scope, отмена полномочий/писателей, полный L/T, API-граница и оба legacy scope не проверены; Nova #94 и orphan001 остаются HOLD. Освобождение mutex не объявлено успешным close.

## Проба и воспроизводимость

- Новая fixture: `opencode-plugin/test/prototype081/os-lock-2/{probe.mjs,consumer.ps1}`. Контроллер запускает только прямые `powershell.exe` children, без Node-wrapper consumers. Каждый `close` явно awaited; в конце сохраняется реестр детей. Барьеры `owned`, `contended`, `go`, `crash.contender-opened` раздельны. Mutex name уникален для каждого контроллерного запуска.
- Точная команда из корня `opencode-plugin/`: `node test/prototype081/os-lock-2/probe.mjs`.
- Первый запуск через `crew_watch machine=true`: exit 1 из-за BOM в корректно записанном PowerShell JSON, Node `JSON.parse` не принимал BOM (`Unexpected token '﻿'`). Это исправлено удалением BOM в reader-е; PowerShell intent не менялся. Raw watcher output SHA-256 `60DE4FCACDAD832F4C08289469D74D46D14D2AA7DD69716BECC1ADA3820BEAD8`.
- Повтор той же команды через `crew_watch machine=true`: exit 0. Watcher output SHA-256 `FB8F05ED39CE6F5ACC546BDB9527E7DCBE3A089F4198695B41AB93DFDB5FF523`.
- Успешный run создал уникальный объект `Local\CrewHarness081OsLock2-78340-1792346232665`; события и raw hashes перечислены в `session-evidence/prototype-os-lock-2/manifest.md`. Raw-файлы и fixture/output сохранены во внешнем временном каталоге; публичный пакет содержит только переносимые события, коды и digest-ы, без локального пути.
- Хэши исходников: `probe.mjs` SHA-256 `D4BFA7CB821BACB49DFD0AD5E9EA2B9BD2FFDA638B78F93A6C4784989AEDBD1F`; `consumer.ps1` SHA-256 `D6B8F9CB95FAD4E672812DAB0F38B6C3D4D2C52CCDEF7020AC9681BD24725E82`.

## Наблюдения

Contention owner PS PID 52776, managed thread 16, exit 0; contender PID 77268, thread 16, действительное событие `contended`, exit 4. Только owner записал effect.

Crash owner PS PID 54308, thread 17, intent/D создан самим owner-ом и `Flush(true)` завершён до barrier; contender PID 83168 открыл тот же mutex пока owner был жив, thread 18. После разрешённого barrier owner сам вызвал `GetCurrentProcess().Kill()` без обычного освобождения mutex; child `close` exit `4294967295`. Contender получил владение через `AbandonedMutexException`, exit 0. Сохранённый recovery record имеет `abandoned=true`, те же `S=A#1`, `R=A#1`, `O=O-crash#1`, `effectID=write#1`, `state=D`, `outcome=unknown`, `replay=not-executed`; crash owner effect отсутствует.

B PS PID 54776, exit 0, отдельный mutex identity, успешный owned/go/effect. Все пять собственных PS children получили `close`; реестр и отсутствие остатков по этим PID — в manifest. Они запускались последовательно, одновременно было не более контроллера и двух PS children (3 test processes). Не применялись PID/TTL stealing, удаление lock/intent, broad kill или сторонний helper.

## Раздельный вердикт

| Область | Вердикт этой сессии |
|---|---|
| Lock availability/contention | Проверено: прямые PS процессы спорят за один именованный объект; второй получил PS exit 4 при удержании первым |
| Auto-release / abandoned ownership | Проверено для изолированной пары: собственный процесс аварийно завершён; contender, открывший тот же объект заранее, обработал abandoned ownership |
| Durable intent/replay | D записан до аварии владельцем; outcome остался unknown, повтор не выполнялся. Это правильное unresolved, не успешное восстановление операции |
| OS scope / writers / handles | Не проверено. Mutex не отбирает уже выданные права и сам по себе не доказывает прекращение писателей |
| L / T / lifecycle | Не доказаны. Fixture не подключена к lifecycle, не покрывает полный fault set, terminal close или бюджет T |
| Legacy | HOLD: Nova #94 и orphan001 не исследовались и не затрагивались |

Старые `os-lock-1`, прежние отчёты и их raw не изменялись. Production/spec/config/package/README/scripts/refs, API/admin/live, старые очереди и Phase1 не затрагивались. Полный suite, guards, commit/push/merge не запускались и не выполнялись в рамках назначения.
