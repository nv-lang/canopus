# Карта чтения С2-3

## Первоисточники, прочитанные целиком

- `task/message.md` — все 56 строк (содержимое 19,795 bytes); его критерии/ограничения сопоставлялись с draft.
- `spec.md` — все 68 строк, SHA-256 `eab33a1c3cd77cf99c696b82acb7add65b46a837a23a06e2e9881b652dc4986a`, 16,231 bytes.
- `spec-trace.md` — T01–T30 и заключение, строки 1–54, 12,415 bytes, SHA-256 `b2319ef51501a3b714d91e4e88740bbbcc3265ebab167849af9d5672a0c6b90e`.
- `analysis.md` — строки 1–37, 8,859 bytes, SHA-256 `1920eff292b14a4d0e770395e08c6d14f149d6758200e30965cbd4b13b10ab14`.
- `session-evidence/s1p-1/writer-consumer-matrix.md` — строки 1–52; `regression-probes.md` — строки 1–23; `finding-response.md` — строки 1–15.
- `session-evidence/integrator-intake.md` — строки 1–14.
- `spec-review-2.md` — строки 1–87, история замечаний/сценариев, не используется как proof.
- Полностью прочитаны qualification `integrator-intake.md`, `integrator-s1-2-qualification.md`, `integrator-s2-1-qualification.md`, `integrator-s2-2-qualification.md`, `integrator-s1p-1-qualification.md`.
- `session-evidence/s1p-1/` в полном объёме не перечитан: открыты root copies, before/after details, `writer-consumer-matrix.md`, `regression-probes.md`, `finding-response.md`; все остальные файлы пакета остаются не прочитанными целиком. Все исторические evidence S1–S2 также не перечитаны целиком. Это существенное ограничение свежести/полноты.

## Канон и методика

- Прочитаны `AGENTS.md`, вход `doc/canon/README.md`, `doc/canon/process.md` (прочитаны строки 1–303; оставшаяся часть не дочитана), `doc/canon/decisions/README.md`.
- Официальная V2 API guide: `https://opencode.ai/v2/docs/api` (API surface и session/inbox GET маршруты). Фактический `/openapi.json` получен CLI, OpenAPI 3.1.0; проверены exact GET session/inbox definitions. Первый локальный JSON parse завершился ошибкой UTF-8 BOM, затем повторный parse `utf-8-sig` прошёл.
- Закреплённые локальные blobs `task-algorithm.md`, `task-sessions.md`, `task-runner.md`, применимые главы `methodology.md` из закреплённого коммита здесь полностью не прочитаны; это невыполненный обязательный пункт.

## Source audit в доступном объёме

- `watch.ts` целиком (строки 1–265): request, claim, detached spawn, PID persistence, poll, done, cancel/drop, machine queue.
- `core.ts`: `postLetter` 1111–1117; письма/claim-delivery частично 1119–1169; `startSession`/reassign 2092–2119; `crew_watch` 3138–3186, `crew_timer` 3188–3210; `releaseExecutor` 3325–3333; `expectedLetters` 3355–3384.
- `index.ts`: grep по всем deliver/watch/retry/recovery/queue callsites; конкретно прочитаны прямые вызовы и изолированные ranges только частично. Полные фактические consumer тела для всех callsites не были дочитаны.
- Не прочитаны целиком `package.json`, `test/README.md`, `.github/workflows/guards.yml`, `opencode-plugin/README.md`, генерация `crew_help` и все прямые callsites `deliver`; приведённые точные команды опираются на спецификацию/историю, а не полную независимую проверку этих файлов. Тесты, guards и сборки не запускались.

## Ограничения/версии

Текущий spec/review — один и тот же проект/семья модели автора и проверяющего: независимость контекста есть, межсемейной независимости нет. Light-профиль не менялся. `.opencode/opencode.json` включён в whole-tree manifest; его динамику отдельно не квалифицировал. Полный task-источник раскрывает Nova #94 как HOLD; никаких mutation или rerun не было.
