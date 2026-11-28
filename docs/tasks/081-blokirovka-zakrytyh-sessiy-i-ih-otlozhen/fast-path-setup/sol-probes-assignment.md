# 081 С5д: одна Sol на корректные пробы простого fence

Владелец, 2026-10-18, question «081: исправление oracle», доставка 20:09:
«Одна Sol на пробы (Recommended)», по слову «fence я же разрешил делать по быстрой
схеме». Это новое ограниченное разрешение Sol, не перенос прежних разрешений.

Владелец через оркестратора, 20:11: «081 и fence и дп. задачи, чтобы выпустить
0.2.1 делай по быстрой схеме». Не возвращать routine engineering вопросы владельцу:
выбирать доказуемую рекомендацию и завершать работу. Новые SQLite/native broker,
неоднозначное изменение объёма и реальные чужие/live/release действия этим
разрешением не выданы. Цель текущей сессии — простой прототип и доказательство,
не проектирование новой архитектуры и не обещание legacy/global GO.

## Вход и неизменяемость

Начать с Канона/правил, прочитать всю утверждённую spec SHA
`38aa3a2c36ece056435ca348b6b3b72bef5adf82a730d6d6c0035245f180f12e`,
`prototype-assignment.md`, `prototype-correction-assignment.md`, оба авторских
отчёта и обе `integrator-qualification.md` в evidence prototype-1 и
prototype-correction-1. Старые ошибки/неполнота — история, их НЕ исправлять в
исходных файлах. Пять единиц, С5д N5, launch пишет плагин.

Тот же immutable baseline export `081-prototype-base-o00ntsja` от7e23895b;
физический путь передаётся в goal. Прежние fixtures/raw сохранены внешним freeze,
после EPERM старая fixture не удалялась. Работать только с новыми изолированными
копиями. Старую fixture можно только читать; не поллить её очередь, не удалять
и не останавливать её процессы. Нет orphan/legacy API calls.

## Пять предметных результатов

1. Проверить входы/сохранность, read-only границу предыдущих остатков и свой новый
   изолированный BASE/scratch до импорта. Не выдавать stale running/.exit/отсутствие
   PID за durable fence. Отсутствие безопасной изоляции — STOP с точной причиной.
2. Исправить lifecycle oracle в **новом файле**: real card A running→closed через
   actual release, queued request → close → poll → дождаться effect/terminal →
   измерить A, а не измерить до poll. Независимая B реально исполняется. Получить
   RED по целевому side effect, не cleanup/import/timeout. Running-before-close —
   отдельное расписание с учётом разрешённого D<C, не логическая подмена C=success.
   Зафиксировать SHA неизменного safety oracle и raw baseline до кода исправления.
3. Связать простой filesystem gate с этим же lifecycle oracle в isolated adapter/
   fixture seam: GREEN на той же проверке, B положительна; снятый gate опять RED.
   Не переписывать assert между RED и GREEN. Объяснить test seams и отличие от
   production integration. Не выдавать standalone gate PASS за lifecycle PASS.
4. Реальная конкуренция: async spawn двух независимых Node consumers **одновременно**,
   deterministic ready/release barriers и C/D/terminal event log. `map(spawnSync)`
   не конкуренция. Раздельно C<D deny и D<C accounting, stable `(O,effectID)` и
   различимые effects одной O, old-wake deny, B allow, fresh-process restart.
   Минимальный crash/stale-owner counterexample, если простой lock не восстанавливается;
   не красть lock по timeout/PID. Лишь фактический контрпример обосновывает
   ограничение простого варианта; один плохой `if` не доказывает нужность SQLite.
5. Сдать короткий доказательный отчёт: какие требования простое решение выполняет,
   где точный контрпример/непроверенная граница crash/OS/L/T/external/legacy.
   Вывод «достаточно» только в доказанной области, не полный контракт по одному
   queued GREEN. Своих fixture детей дожидаться явно, сохранение evidence до cleanup;
   лучше оставить новые bounded fixtures, чем маскировать oracle ошибкой rmSync.
   Реестр собственных commands/PID/scope/exit/остатков, raw SHA и версия драйверов.
   Затем submit и остановка: независимую короткую приёмку назначает интегратор.

## Запись и границы

Новые файлы только `opencode-plugin/test/prototype081/sol-1/`, новый
`prototype-sol-result.md` и `session-evidence/prototype-sol-1/`; журналы append.
Полный raw с физическими путями — во внешнем разрешённом temp, публично производные.
Spec/старые скрипты/отчёты/raw/refs не менять. Production/config/package/scripts/
README не править, не переносить целиком свежий main в старое дерево.

Пробы только через `crew_watch machine=true`; до4 тестовых файлов одновременно,
упавший replay отдельно. Собственные дети и контролируемые failure injection
допустимы только в новой fixture, не kill произвольных/старых процессов.
Нет SQLite/native broker/new dependencies/system install/elevation, API/admin/live,
Nova изменений/Phase1/release, commits/push/merge и новых агентов. Не читать full env,
credentials/transcripts/inbox bodies. Оба legacy scope остаются HOLD; результат
прототипа не снимает их отдельные условия. Не возвращать routine выбор драйвера/
синхронизации владельцу: сделать и доказать в разрешённых границах.
