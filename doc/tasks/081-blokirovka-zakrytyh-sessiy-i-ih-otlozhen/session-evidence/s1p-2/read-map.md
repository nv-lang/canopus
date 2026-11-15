# Фактическое чтение

- AGENTS.md: полный текст предоставлен средой.
- doc/canon/README.md: 1–42.
- session-evidence/sol-correction-setup/assignment.md: 1–162.
- git status --short: прочитан; существовавшие untracked материалы включены в before.

## Содержательные входы

- `task/message.md` 1–56; root `analysis.md` 1–37, `spec.md` 1–68,
  `spec-trace.md` 1–54 — полностью до правки.
- `spec-review-1.md` 1–56, `spec-review-2.md` 1–87,
  `spec-review-3.md` 1–73 — полностью.
- `log.md` 1–21; `progress.log` 1–48; парный запуск №7 подтверждён.
- `integrator-intake.md` 1–14; квалификации `integrator-s1-2` 1–38,
  `integrator-s2-1` 1–39, `integrator-s2-2` 1–77,
  `integrator-s1p-1` 1–40, `integrator-s2-3` 1–51 — полностью.
- `s1p-1/writer-consumer-matrix.md` 1–52, `finding-response.md` 1–15,
  `regression-probes.md` 1–23, `read-map.md` 1–17 — полностью.
- `s1p-1/root-before/spec.md` 1–86 — исходные 10 REQ / 7 AC / 5 DNC.
- `s2-1/read-map-and-probes.md` 1–25; `s2-2/requirement-map.md` 1–34,
  `contract-audit.md` 1–30, `package-doc-audit.md` 1–11,
  `forensic-verification.json` 1–83, `api-readonly.json` 1–41 — полностью.
- `s2-3/read-map.md` 1–30, `probes.md` 1–12; `s1-2/evidence-verification.json`
  1–43 и `watch-inventory.json` 1–108 — полностью.
- Все 87 файлов первичного raw manifest пересчитаны побайтно; из 7 первичных
  records извлечены только ID/session/status, без command/env. Само содержимое
  архивов и логов не перечитывалось: требуется сохранить, а не исполнить его.
  `forensic-actual.json` — новый замер после раннего expected; первая ошибка locator
  отдельно в `measurement-error.md`.

## Канон и закреплённая методика

- `doc/canon/process.md` 1–357 полностью; реестр ADR 1–69;
  ADR-0001 1–43, ADR-0006 1–49, ADR-0008 1–51,
  ADR-0010 1–46, ADR-0011 1–51 полностью. Корневой README 1–43.
- Immutable blobs методики081 на `0442a4d3a380f01f437640b5dd9174e384e50d67`:
  README полностью; `task-algorithm.md` 1–370 полностью;
  `task-sessions.md` 1–428 полностью; `task-runner.md` 1–378 полностью.
- `methodology.md`: применимые разделы 4–5 (115–338), 8–10 (451–770),
  12–13 (878–1097), 18 до языковых границ (1375–1569).
  Длинные строки 242, 543, 563, 709, 722 и runner 89, 325 дочитаны отдельным
  выводом с переносом без изменения источника. Остальные разделы не выдаются
  за полностью прочитанные; они не используются как самостоятельное основание.
- `completeness-check.md` получен целиком командой `git -C … show`;
  длинные строки реестра не прочитаны полностью, поэтому он не служит
  доказательством практики/исполненности норм. Нормы взяты из первичного текста.

## Первичный граф кода

- `watch.ts` 1–265 полностью.
- `core.ts`: 1070–1369 (post/claim/recover/obligations),
  1370–1464 (help), 1675–1729 (takeReply/host), 1900–2119
  (send/wait/startSession), 2490–2554 (assign/order), 2630–2729
  (review/round/quiet), 2890–2994 (push/cancel/reassign),
  3088–3219 (inbox/watch/timer/help), 3310–3434 (release/expected/parent).
- `index.ts`: 150–809 (touch и полные deliver/nudge/resume/retry/finish/reviewerAssigned),
  805–909 (reconcile/assign), 995–1044 (selfResume), 1320–1384
  (form/owner-answer), 1710–1939 (start/resumeTasks/processQueue),
  1980–2059 (pass/recover/poll), 2145–2179 (roleTaken/tools).
- Все 7 прямых `deliver` callsites: 568, 797, 1035, 1376, 1865, 2042, 2161.
  Дополнительно `crew_inbox` и `takeReply` — реальные consumers вне `deliver`.
- `mcp.ts` 1–120 и `hung-resume.ts` 1–58 полностью.
- Поиск по всем `opencode-plugin/*.ts`: postLetter, deliver, requestWatch,
  releaseExecutor, prompt/command/synthetic, takeReply/claim/recover.
  Не заявляется чтение всех несвязанных UI/плановых функций целиком;
  они подчинены общему контракту writer/consumer, а не исключены из него.

## Команды, документация и внешние основания

- `package.json` 1–20; длинная test-строка декодирована целиком:
  121 команда (cleanup и 120 тестовых скриптов), от первого до последнего имени.
- `test/README.md` 1–113 и `.github/workflows/guards.yml` 1–75 полностью;
  `opencode-plugin/README.md` 1–200 (включая presence, turn economy, watch).
- OpenCode skill до API; официальные V2 API и plugins guides получены;
  в plugins прочитан раздел Sessions 783–860. Не весь справочник unrelated API.
- Фактический GET `/openapi.json` exit 0, 272870 bytes; выделены точные
  session/get/inbox/interrupt/cancel/prompt/command definitions в
  `api-schema-selected.json`. Полностью прочитаны выделенные 6 route definitions,
  включая cancel pending-only и command immediate callback.
  Это схема, не запрос чужого transcript/env.
  Повтор metadata/inbox старой сессии не выполнялся: для авторского исправления
  текущий count не изменяет контракт; прежние снимки не объявлены свежими.
- Microsoft Learn `Job Objects`: весь содержательный текст, включая создание,
  наследование, исключение Win32_Process.Create, breakaway, security limits,
  accounting, last-handle и nested jobs. `UpdateProcThreadAttribute`:
  параметры и JOB_LIST/SECURITY_CAPABILITIES/HANDLE_LIST. Это основания возможных
  primitives, не доказательство их работы в CrewHarness.
- Node child_process: найдены точные абзацы detached, killed, PID reuse;
  справочник не выдаётся за полностью прочитанный. Текущий код подтверждает
  отсутствие общей транзакции spawn + запись PID.
