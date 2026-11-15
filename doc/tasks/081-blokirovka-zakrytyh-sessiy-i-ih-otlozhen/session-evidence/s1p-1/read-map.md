# Карта чтения С1п-1

## Прочитано полностью

- `task/message.md`; `analysis.md`, `spec.md`, `spec-trace.md`; `spec-review-2.md`; `integrator-intake.md`, `integrator-s1-2-qualification.md`, `integrator-s2-1-qualification.md`, `integrator-s2-2-qualification.md`.
- `doc/canon/README.md`, `doc/canon/process.md`, `doc/canon/decisions/ADR-0006-public-repository.md`; `AGENTS.md` прочитан из системного контекста.
- `opencode-plugin/watch.ts`; `package.json`; `.github/workflows/guards.yml`; `test/README.md`; публичный README раздел про `crew_watch`.
- `s2-1/read-map-and-probes.md`; `s2-2/contract-audit.md`, `requirement-map.md`, `api-readonly.json`; `s1-2/evidence-verification.json`.
- Точечные code ranges, указанные в `analysis.md`/`writer-consumer-matrix.md`: `core.ts` postLetter, crew_send, startSession/releaseExecutor, watch/timer; `index.ts` resume/retry, finishTasks, task startup recovery, role queue и poll/deliver.

## Не полностью прочитано / ограничения

- Не прочитаны целиком все файлы `session-evidence/s1-2/**` и `session-evidence/s2-2/**`, полный `spec-review-1.md`, полный test catalog до конца, вся методика в закреплённом внешнем клоне и каждый callsite вокруг всех 7 прямых вызовов `deliver`. Точная exhaustive-ness матрицы не доказана; С2-3 обязана независимо дополнить.
- `package.json` test command parsed read-only: 121 sequential `node test/*.mjs`, first `cleanup-tmp`, last `crew-no-queue-behind-question`. Не запускалось.
- Внешний API в этой сессии не вызывался. Поздний успешный GET и предшествующая interrupted attempt — только исторические записи `api-readonly.json`, разные snapshots.
- `before-tree.json` — весь текущий worktree до предметного чтения; этот snapshot неизбежно включает прежние drafts/reviews/evidence. Это правильная текущая точка, не ретроснимок до предыдущих сессий.
- Before includes `.opencode/opencode.json` if present at scan; file not edited/restored. Volatile generated files are subject to disappearance; report exact observed missing/changed, never repair without permission.
