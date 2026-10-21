# Проверки 140

Все CI/run данные ниже — синтетические локальные пробы тестового harness; реальный GitHub workflow не запускался и не проверялся. Nova 092, её файлы, ветки и lock не читались.

## Targeted

- `crew-landing-verdict.test.mjs` — PASS: synthetic RED carrier, explicit fail/unknown, пустой/legacy verdict, base/candidate mismatch, positive protocol, invalidation/idempotency, old GREEN, cycle 1/2 gate and cycle change during merge read, права, finish/merge races.
- `crew-landing-precheck.test.mjs` — PASS.
- `crew-landing-letters.test.mjs` — PASS после исправления устаревшего тестового ожидания `protocol:1` → `protocol 1`.
- `crew-tool-texts.test.mjs` — PASS после сокращения описания действия до установленного лимита строки.
- `crew-progress.test.mjs` — первый isolated PASS: cold parse median 7.66 ms, p90 12.77 ms; plain read median 2.54 ms; ratios 3.01x/5.02x.
- `crew-landing-race.test.mjs` — isolated PASS: все пять раундов конкурентного замка и последующие проверки прошли.
- `crew-landing-gate.test.mjs`, section AC-08 — PASS.
- `sh scripts/guards/run-all.sh` — PASS: 9 guards, 0 skipped, 0 failures; финальный запуск после cycle-gate regression и очистки machine-path в задании (watch ID `1792610034900-gcjdr5`).
- `python scripts/guards/guard-secrets.py --tree` — PASS: scanned 2804 files after final source changes (watch ID `1792610086279-4u70d8`).

## Полные `npm test`

1. Первый полный запуск — FAIL на `crew-tool-texts.test.mjs` TT-5a: новая англоязычная строка действия превысила лимит 700 символов. Описание сокращено; targeted test стал PASS.
2. Второй полный запуск — FAIL на `crew-progress.test.mjs` AC-11 б: cold parse p90 21.69 ms при лимите 6x; isolated повтор прошёл с метриками выше. Порог теста не менялся.
3. Третий полный запуск — FAIL на `crew-landing-letters.test.mjs` AC-26: тест ожидал `protocol:1`, help говорит `protocol 1`. Ожидание исправлено; targeted test стал PASS.
4. Четвёртый полный запуск — FAIL на `crew-landing-race.test.mjs` AC-16 раунд 1: один дочерний процесс получил ENOENT при создании временной inbox-папки; остальные раунды этого теста прошли. Isolated повтор прошёл целиком.

## Последний полный прогон: точный сбой

- Watch ID: `1792599158406-luyept` (`npm test`, exit 1).
- `crew-landing-race.test.mjs`, AC-16 раунд 1: child `sesR3` exited 1 при создании временной inbox-папки; остальные 7 результатов раунда включали одного победителя lock и ожидаемые отказы, следующие раунды 2–5 прошли.
- Sanitized child error (temporary root and worktree path redacted to keep this repository public):

  ```text
  NO RESULT: at nudge (file:///[WORKTREE]/opencode-plugin/index.ts:557:9) {
    errno: -4058,
    code: 'ENOENT',
    syscall: 'mkdir',
    path: '<TEMP_ROOT>\\opencode\\crew-harness\\inbox\\sesR3'
  }
  Node.js v24.15.0
  ```

- Isolated repeat of `crew-landing-race.test.mjs` — PASS, all rounds; watch ID `1792600200197-rk7wp8`.

Владелец ответил через question tool 2026-10-21 на вопрос «Полный npm test» (текст: «Как поступить с полным `npm test`? Последний полный прогон упал один раз на временном `ENOENT` в `crew-landing-race`; изолированный повтор прошёл. Интегратор просил не запускать лишние дубли.»): **«Не повторять полный набор»**. Полный `npm test` остаётся честно отмечен как FAIL; пороги и тестовую инфраструктуру ради PASS не меняли. Реальную причину ENOENT не установили; нагрузочную флуктуацию не утверждаем. Независимая сдача — для диагностики, не готовность к landing/GREEN; новых полных прогонов, merge, push или accept без отдельного разрешённого решения и доказанного GREEN не будет.

## Узкий rework 1: права invalidate

- `crew-landing-verdict.test.mjs` — PASS после правки: watch ID `1792618760519-dmk845`. Добавлены проверки unassigned integrator, executor и foreign reviewer (отказ без мутации), назначенного integrator при `reviewer: worker` (разрешён) и назначенного integrator при `reviewer: acceptor` без роли acceptor (отказ без override).
- Owner authorised diagnostic submission: владелец, 2026-10-22, чат оркестратора «проверь сессии opencode, ответь на вопросы по твоей рекомендации»; ответ на вопрос «Диагностическая сдача»: «Сдать диагностически (Recommended)». Полный suite остаётся FAIL; это не разрешение на landing.
- `crew-landing-letters.test.mjs` — PASS после rework текста role guard/recovery.
- `sh scripts/guards/run-all.sh` — PASS после rework: 9 guards, 0 failures (watch ID `1792621365695-f90834`).
- `python scripts/guards/guard-secrets.py --tree` — PASS после rework: 2808 файлов (watch ID `1792621532936-hfwiy4`).
