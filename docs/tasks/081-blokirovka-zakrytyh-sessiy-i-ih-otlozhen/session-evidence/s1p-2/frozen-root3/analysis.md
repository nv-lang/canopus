# Анализ С1п-2 — блокировка закрытых сессий

## Итог

**Авторский контракт исправлен; реализация, feasibility и fence не доказаны.
Nova #94 остаётся HOLD.** Следующая независимая проверка — только С2-4 Kimi,
назначает интегратор, затем ворота владельца при любом результате, без С2-5.
Эта сдача не утверждает spec и не разрешает план/код/тесты/admin/live.

## Факты (FACT)

F1. Собственный before С1п-2 снят до предметных правок: 734 существовавших файла,
включая hidden/untracked/.git как bytes/SHA без payload. Root3 совпали с назначением;
их побайтные копии и три append prefixes сохранены в `session-evidence/s1p-2/`.
Before относится к этому запуску, не к инциденту и не к старым С2. Запуск №7
парно зарегистрирован в progress/log; агент написал только start/steps.

F2. Собственная повторная сверка первичного intake: 87/87 файлов, 1804234 bytes,
0 mismatches; dossier 15150 bytes, actual SHA
`7a1f831a85caa227d9d3c36c45f6bf34bab144ea29e1080b58607ed8825d9969`
совпал с ранним собственным expected из primary intake. Ошибка первой команды
с относительным saved locator сохранена отдельно, не выдана за PASS.

F3. Семь первичных records подтверждают: шесть run1 IDs
`1792260030319-ie8bde`, `1792260067690-t7zy8c`, `1792260097037-xabdxk`,
`1792260111664-pr9xpd`, `1792260127576-aag98z`, `1792260159699-hre9bp`
принадлежат replacement `ses_mvcoxay3pjag7acd92`; old run2
`1792264172390-3ns1ev` — `ses_mvawdsam690xeqwzpp`.
Восемь исторических old records перечислены в `s1-2/watch-inventory.json`;
изменение старых снимков 8→6→5 не является единым exit proof. Причина
исчезновения records неизвестна; нового live snapshot в этой сессии нет.

F4. Старый 63-char expected и смешанная выборка `s2-2/forensic-verification.json`
не менялись; новый результат не исправляет старый вердикт. Утраченные архивы и
raw CMake logs run1 не восстановлены. «0 missing» у 87 копий не полнота инцидента.

F5. Прочитана фактическая V2 OpenAPI 3.1.0 через GET `/openapi.json`, exit 0;
272870 bytes, SHA `e0cb7e64ae160e0b2f4cb58eee67ccb03ac3511abf0b5651f2d344c732373305`.
Нужные определения — `api-schema-selected.json`. Prompt допускает durable input,
command выполняет callback немедленно; interrupt/cancel не permanent fence.
Пример online plugins guide расходится с actual schema; будущие admin по памяти
запрещены. Нового session/inbox GET не было: прежние count 0 — только история.

F6. Первичный код: `core.ts:2092–2119,3326–3333` закрывает card/obligation;
`3170–3208` создаёт watch/timer request. `watch.ts:70–76,103–116,166–209,217–240`
разделяет request, claim removal, detached spawn, PID write и done/kill failure.
Нынешняя реализация не доказывает восстановимость scope при spawn-before-PID.

F7. Все 7 прямых `deliver` calls прочитаны с телами consumers:
`index.ts:568,797,1035,1376,1865,2042,2161`; общий consumer 295–383.
Дополнительные consumers: `crew_inbox` core 3097–3124 и `takeReply`
1688–1704/crew_wait 2039–2058. Closed filter только в одном pass не закрывает их.
`postLetter`, role mailbox/QUEUE, claims, retry/resume, start/reconcile/finish
связаны контрактом S/R/O; служебная подпись не очищает causation старого задания.

F8. Прочитаны первичные package/test README/workflow/README/help. `npm test`
содержит 121 команду: cleanup и 120 тестовых скриптов; OpenCode/windows/models
в selftests fake, процессы/файлы/HTTP реальны. Guards CI прямо не запускает npm.
Точные будущие команды и каждый proof раздельно записаны в spec, не исполнены.

F9. Microsoft документирует job membership/last-handle lifetime, создание с
JOB_LIST и capability/handle attributes, но job один не изолирует файловые права.
Это первичные основания исследовать механизм; не доказательство feasibility
комбинации L или работы текущего кода. Полные адреса и ограничения —
`platform-and-consumers.md`.

F10. Только разрешённый `s2-3/before-manifest.json` становится обозначенной
производной после сверки точного внешнего raw и manifest. Raw сохранён снаружи;
files entries не изменяются; before больше не выдаётся за raw. Raw SHA и точный
diff/новый SHA фиксируются отдельно. Это не чистая С2-3 и не исправление истории.

## Выводы (INFERENCE)

I1. `closed` сейчас metadata, не доказанная общая граница полномочий. Нужны
монотонный C и сериализованный D, а не отдельный `if open` до spawn/delivery.

I2. Старый контракт безопаснее ложного success, но допускает вечный STOP.
Новый профиль L определяется платформой/identity/локальностью/правами ДО результата;
обязательные crash/claim/PID-write/concurrency случаи не исключаются задним числом.
В L нужен успешный close с terminal proof в конечном T и независимая положительная B.
Невозможность реализации L требует возврата, а не выдачи безопасного отказа за GREEN.

I3. Ownership должен проверять обе стороны и causation: A-source и A-recipient
запрещают старое рабочее задание, B-only разрешает новую O. Связанное role item
не retarget-ится, независимая открытая заявка живого источника может выбрать B.
Полученный consumer payload ещё не разрешение произвольного side effect.

I4. Local GREEN необходим, но не устраняет unknown legacy/external writers.
Глобальная цель P1 не ослаблена: #94 и общий инцидентный scope остаются HOLD.

## UNKNOWN и вопросы

U1. Реализуемость primitive L, сериализация, recovery и platform proof не установлены.
→ задача 081: будущий план после ворот, затем реализация и независимая приёмка.

U2. Внешняя гарантия/legacy terminal неизвестны; В-01 spec содержит адресата,
дату, варианты, рекомендацию и HOLD без автоматического снижения цели.
→ задача 081: интегратор выносит выбор владельцу после С2-4.

U3. Историческая хронология/причины исчезновения records и missing run1 не доказаны.
→ задача 081: сохранять точный forensic остаток; не реконструировать и не подменять
его нулевым current snapshot. Новых live обращений для текстовой правки не нужно.

U4. Нет полномочия/доказанного безопасного admin протокола сейчас; В-02 spec
не разрешает mutation даже по наступлению срока. → задача 081: будущие отдельные
ворота после плана/proof. Общий `doc/open-questions.md` не меняется: вне exact scope.

## Проверки и границы

Новые свидетельства — `session-evidence/s1p-2/`: ранний before/expected/copies,
read-map с фактическими диапазонами, raw actual/partition, API schema,
platform/consumer audit, ответы findings, документальные пробы и preservation.
Содержательное первичное чтение не заменено историческим review. Большие старые
manifests служат для структурной/hash сверки, не утверждения о payload архивов.

Нет product tests, fixtures, builds, guards, Phase1/rerun, interrupt, inbox delete,
taskkill, queue writes, кода, плана, config/refs/live изменений, commit или push.
Собственные пробы — проверки текста/identity/сохранности, не реальный RED/GREEN.
AC реализации пока NOT VERIFIED: реализация этой сессией запрещена.
