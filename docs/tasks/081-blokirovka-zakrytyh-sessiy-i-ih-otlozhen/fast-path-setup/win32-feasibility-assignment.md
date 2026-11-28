# 081: ограниченная Win32 feasibility-проба

## Полномочие и границы

Владелец, 2026-10-18, ответ 23:45, передан оркестратором служебным письмом:
«Разрешить ограниченную исследовательскую Win32-пробу через PowerShell
Add-Type/PInvoke: Job до запуска пользовательского кода и restricted token/ACL.
Рамки: только изолированная scratch-fixture с уникальным идентификатором прогона;
без администратора и повышения прав; без изменения системных настроек, реестра
и ACL вне scratch; без установки, службы, broker, нативной компиляции и SQLite;
не трогать живые сессии, чужие процессы и live main; сырые логи, before/after
и независимая проверка сохраняются; при красном — остановиться и письмом назвать
причину и минимальный следующий шаг, без форм владельцу».

Это исключение для PowerShell Add-Type/PInvoke, не разрешение на C/C++ toolchain,
нативный addon/DLL, production-код или постоянный helper. Не устанавливать ничего,
не менять пользователей, группы, реестр, системные настройки, общие ACL/config.
Все исходники пробы, generated code, процессы и изменяемые ACL — в новой собственной
scratch-fixture в разрешённом временном каталоге; публичный отчёт/безопасные
производные — в папке задачи. Старые evidence/refs/worktrees не изменять.

## Четыре единицы

1. Прочитать Канон, approved spec целиком и pin из журнала, результат18 и review19.
   Зафиксировать before/SHA и уникальный run ID. Проверить non-elevated/platform
   preflight, составить конечную матрицу проб с лимитами и опись своих процессов.
   Не выдавать неизвестную L4 capability за выполненный вход. Один исполнитель
   вместо завершённого reviewer19, без новых агентов.
2. Подготовить минимальный finite launcher через разрешённый Add-Type/PInvoke:
   restricted token и scratch ACL, Job membership до user code, без временного
   окна исполнения вне Job. Проверить фактически доступные API и Win32 errors.
   Suspend-then-assign само по себе не закрывает crash между create и assign:
   этот cut надо явно проверить или признать unresolved. Job не security boundary.
   Нет рабочего контракта без elevation/нового компонента — предметный STOP.
3. Через machine queue выполнить bounded пробы: A пишет свой scratch, A не может
   открыть/изменить B, независимая B пишет; попытки escape через descendants,
   breakaway, наследование handles и изменение scratch B ACL; crash на launch/
   assignment/resume и после запуска, terminal wait и повторное восстановление
   по тому же O/effectID без replay. Сохранить точные before/after/commands/exits,
   доказательство запуска именно restricted child и Job до первого user effect.
   Разделить authority и instrumentation: observer handle/надзор fixture не
   доказывает recoverable ownership. Retained Job handle observer-а не должен
   скрывать реальную проверку kill-on-close. Unresolved не превращать в success.
   Все свои процессы конечны, ожидаются по доказанным собственным handles/scope;
   никакого broad kill/PID-only authority и действий с чужими процессами.
   Неожиданный RED — сохранить и остановиться, письмом причина/минимальный шаг,
   без форм владельцу и без смены архитектуры в этой сессии. Ожидаемые отрицательные
   controls (access denied и исходный RED) заранее отделить от failure кандидата.
4. Сдать короткий win32-feasibility-result.md с матрицей PASS/FAIL/UNRESOLVED,
   source/raw locators и SHA, всеми ошибками, ограничениями L/T/host/legacy,
   реальной описью и exit своих процессов. Проверить новые публичные производные
   реальными privacy judges с новым output, не перезаписывая старый audit.json.
   Это не full suite/production acceptance. При успехе — одна независимая проверка
   в следующей сессии того же слота; самому её не запускать. При RED — только
   доказательный STOP и письмо, без новой owner формы.

## Что результат не разрешает

Никаких production/all-carrier integration, main/push/live/restart, host mutations,
legacy wake/deny/revoke/old-wake, Nova/source/release действий. OLD094 и ORPHAN001
остаются отдельными HOLD. Успех scratch-пробы не означает host coverage, legacy
terminal proof, GREEN fence или Phase1 GO. Нельзя заменить approved spec условиями
fixture; при несовпадении входов L это явно указывается. Запрет SQLite/broker/
установок/elevation/нативной компиляции сохраняется. Новый общий вопрос о разрешении
не нужен: ответ владельца записан, после RED следующее действие — письмо.
