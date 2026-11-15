# 081: независимая проверка STOP запуска 18

## Вердикт

**Исходный RED и узкий пробел Mutex+intent воспроизведены; вывод допустим только как основание для следующей feasibility-пробы, не как доказательство невозможности L или приёмка production.** Production fence, AC-18 и global terminal не реализованы/не проверены. OLD094 и ORPHAN001 остаются раздельными UNRESOLVED/HOLD.

## Источник, pin и независимый replay

- Полностью прочитана утверждённая `spec-approval-2026-10-18/approved-spec.md`: 44,357 bytes, SHA-256 `38aa3a2c36ece056435ca348b6b3b72bef5adf82a730d6d6c0035245f180f12e`. Pin совпадает с `before.json`; содержимое spec не менялось.
- Источник replay — сохранённый fresh export `081-durable18-before-64gP8e/source`; его `origin-main` cut `01b2c391cb1043022eaabe336ebca06d74f50707`, архив SHA-256 `4098954a4eacc756f725a0a7f5c8250b71afb853c4aba198a2de66578ce2d9d5`. Повторная команда:

  ```text
  cd opencode-plugin && node test/prototype081/durable-18/run.mjs '<approved-temp>/081-durable18-before-64gP8e/source' '<approved-temp>' '../doc/tasks/081-blokirovka-zakrytyh-sessiy-i-ih-otlozhen/session-evidence/durable-18/review-18-1'
  ```

  Выполнена через `crew_watch machine=true`; outer exit **0 за 9 s**. Это ожидаемый RED, не GREEN. `runs.json` и все raw созданы в новых выходах, старые не перезаписаны: raw locator `081-durable18-run-OSCGCh`.
- Независимые результаты: `unchanged-baseline` ожидаемый/actual exit 0; `scope` и `scope-repeat` ожидаемый/actual exit 1, оба stderr содержат `SAFETY ORACLE AC-08:`. Все дети закрыты (`closed:true`). SHA stdout/stderr — в новом `session-evidence/durable-18/review-18-1/runs.json`; scope stderr SHA у обоих `8bbb417ae0cabea3ede199c5790f6cff4118179ee94b16785ee42d353c44b9da`.
- Сверены драйверы: `run.mjs` `7635b01c3cc9a2b48ab5f26355c479514bc0dc0bf12dc7411b53f29c870dadd4`; `scope-oracle.mjs` `275ee62f9af9fd6d7fb26f5ae4af26628119b1980e1433c10c014c9a58cd1a4a`; baseline `run-lifecycle.mjs` `457492aa9cae431bc989310e8cc4004aa259cda9852ac7aef6e10f16ecf20cd9`. Из qualified evidence: owner PS `c49c9d04e1a40cce8032e2f0aa92fa433ee4d112b3630442e856739361927cd1`, writer `961144f73d650e83f113244378fab99f0b30ef79d3a53acf3d9482b439044d19`, capability probe `664f98ca563e9cc9d06b61edf01ba8f46e957dc86ed876d1a440c285d49c0b8b`.
- Два прежних Mutex review прочитаны: `prototype-os-lock-result.md` (первая contention-проба недействительна: дважды exit 0 вместо 4, recovery не запускался) и `prototype-os-lock-review-1.md` (ограниченно приняты contention/abandoned ownership; замечена ошибка mutexName в child-start event). Исправленная fixture и её отчёт `prototype-os-lock-correction-result.md` подтверждают D-before-self-crash/unknown/no-replay/B, но не scope и не terminal close.

## Оценка доказательств и границ

- **Существенное — подтверждён узкий контрпример:** обычный наследуемый Windows token позволяет дочернему Node writer после recovery открыть B через обычный `writeFileSync`; B bytes меняются при разных scratch, без заранее переданных B handles. Это подтверждает отсутствие обязательного write/scope fence у проверяемого Mutex+intent-механизма. Положительная B и exit/probe различаются в сохранённом qualified evidence.
- **Существенное ограничение вывода:** inherited token с `open(B)` означает, что fixture не удовлетворяет L/AC-08 исходному отсутствию B capabilities до user code. Поэтому это не «изолированная L», не доказательство невозможности L и не общий отрицательный verdict для Windows. Отчёт запуска 18 это ограничение оговаривает; вывод о gap точнее.
- **Узкая следующая проба обоснована, но не предрешена:** проверенный stock `ProcessStartInfo`/`Start-Process` surface не показывает pre-execution Job assignment плюс restricted token; Mutex не меняет security token и не ограничивает file ACL. Exact published SDK 2.0.26 вместе с фактической схемой подтверждает лишь объявленные API; permission update, prompt/synthetic/retry/shell и interrupt/cancel — разные поверхности, ни одна не является доказанным pre-user-code scoped launch/revoke контрактом. SDK `@opencode/plugin`/`@opencode/client` tar SHA и SRI/manifest перечислены в `sdk-surface.json`; это документация/declared types, не host runtime coverage. Installed runtime 2.0.26 GET/OpenAPI проверен; фактическое покрытие hook реализации, native tool, direct synthetic/retry и внешнего клиента остаётся неизвестным/NOT VERIFIED. Одного отсутствующего поля `Session.Info` для вывода не использовано.
- Следующий минимальный исследовательский кандидат — отдельная ограниченная Win32 feasibility-проба: создать процесс с restricted token, назначить Job **до** разрешения user code, ограничить B ACL/capabilities и проверить crash/descendant/handle lifetime и recoverable ownership. Сам Job не security boundary; нужна проверка токена и ACL. Эта рекомендация не означает, что механизм уже безопасен/достижим, и не обосновывает SQLite, постоянный broker, установку, elevation или production-код.
- **Legacy:** authoritative issued-O/legacy scope и executable revoke→terminal→old-wake отсутствуют для OLD094 и отдельно для worker/reviewer ORPHAN001. Capture/metadata — только наблюдение, не fence; negative old-wake не выполнялся.

## Scoped audit и незавершённое

Прочитан исходный scoped `audit.json`: `errors:[]`, `productionTrackedDiff:[]`, 190 сохранённых before entries (existing exact либо journal prefix), 32 результата аудита, 129 npm commands/128 test files из fresh package; `npmRun:false`, `fullGuardsRun:false`. Этот аудит предшествует новым файлам replay данной независимой сессии и не выдаётся за post-review audit. Повторный audit не запускался: штатный `audit.py` перезаписывает исходный `audit.json`, что нарушило бы сохранность; полный npm/guards не требуется для этого review без production diff. Сама новая запись отчёта и replay не проверены privacy judges в повторном аудите.

Не выполнены: production RED→GREEN/removed-fix, lifecycle L/T и положительный terminal close, все 18 AC после реализации, полный npm, guards/selftests, независимая production приёмка, legacy old-wake. Соответствующий статус остаётся NOT IMPLEMENTED/NOT VERIFIED; этот review не разрешает production-этап и не меняет approved spec или её pin.
