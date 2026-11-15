# Карта чтения С2-4 (заход 4, запуск №8)

Составлена по факту, не по плану. Различает полное построчное чтение, программное
полное чтение hash-инвентарей и структурную сверку копий. Часть входов прочитана
в начале этой же сессии до компакции контекста (помечено «ранее в сессии»);
root3, задание, все reviews/квалификации и предметные evidence прочитаны или
перечитаны полностью в единице 2. Компакция контекста не засчитывается как чтение.

## Полное построчное чтение — задание, нормы, draft

- `final-spec-review-setup/assignment.md` — строки 1–142 (назначение С2-4, две линзы,
  шесть единиц, запреты). Ранее в сессии и перечитано.
- `task/message.md` — строки 1–56, перечитано в единице 2.
- `session-evidence/sol-correction-setup/assignment.md` — строки 1–162 (назначение С1п-2,
  источник атомов N097–N164).
- `spec.md` — строки 1–503, 43139 bytes, SHA-256
  `22e641def114d3207f3ec303e6e5f5eebaaac82973cb2d2bc0ccbd46350aa43e` — совпал с назначением.
  18 REQ / 18 AC / 6 DNC, термины S/R/O/C/D/terminal/L/T, таблица ownership, В-01/02, И-01.
- `spec-trace.md` — строки 1–412, 40896 bytes, SHA-256
  `cacad23b828a51c8a1e6d6c30ed1bca0a2b998bbf6e7b384635a24f71211752c` — совпал.
  T01–T30, опись 54 источников, N001–N178, история REQ/AC/DNC 10/7/5 → 11/10/6 → 18/18/6.
- `analysis.md` — строки 1–119, 10024 bytes, SHA-256
  `1750a21b58cf27840dc22113d4ffec5bca6c97c6d28108f405da9cc0bbea6ab6` — совпал. F1–F10/I1–I4/U1–U4.
- `integrator-s1p-2-qualification.md` — полностью (квалификация входов С1п-2). Ранее в сессии.
- `log.md`, `progress.log`, `profile.log`, `usage.log` — на входе полностью; запуск №8
  и собственный start зафиксированы в before. Ранее в сессии.

## Канон и закреплённая методика

- `AGENTS.md` — из среды этого дерева, применялся. Ранее в сессии.
- `doc/canon/README.md`, `doc/canon/process.md`, `doc/canon/decisions/README.md`,
  `doc/canon/decisions/ADR-0006-public-repository.md` — полностью. Ранее в сессии.
- Методика081 на pin `0442a4d3a380f01f437640b5dd9174e384e50d67` (immutable blobs через
  `git -C`, cwd — своё дерево; рабочий дамп blob'ов вне репозитория): `task-sessions.md`,
  `task-algorithm.md`, `task-runner.md`, `completeness-check.md` — полностью;
  `methodology.md` — применимые §§4, 10, 12, 18 (ворота, приёмка сессий, доказательства,
  независимость). Ранее в сессии. Плавающая main не читалась.

## Прежние reviews и квалификации — полное построчное чтение

- `spec-review-1.md` 1–56; `spec-review-2.md` 1–87; `spec-review-3.md` — полностью
  (ранее в сессии; 2 существенных, 2 поверхностных). Читались как история замечаний.
- `session-evidence/integrator-intake.md` 1–14; `integrator-s1-2-qualification.md` 1–38;
  `integrator-s1p-1-qualification.md` 1–40; `integrator-s2-1-qualification.md` 1–39;
  `integrator-s2-2-qualification.md` 1–77; `integrator-s2-3-qualification.md` 1–51.

## Evidence — полное построчное чтение

- `s1p-1/`: `finding-response.md` 1–15; `regression-probes.md` 1–23; `read-map.md` 1–17;
  `writer-consumer-matrix.md` 1–52 (30 строк матрицы, identity reconciliation, границы).
- `s2-1/read-map-and-probes.md` 1–25 (неполный заход, вердикт NOT VERIFIED).
- `s2-2/`: `contract-audit.md` 1–30; `requirement-map.md` 1–34; `package-doc-audit.md` 1–11;
  `read-map.md` 1–42; `probe-plan.md` 1–10; `package-doc-probe-plan.md` 1–3;
  `public-path-probe-plan.md` 1–3; `public-path-probe-initial-error.md` 1–5;
  `source-hash-plan.md` 1–5; `forensic-verification.json` 1–83 (63-char expected на строке 13
  подтверждён как историческая ошибка, не исправляется); `api-readonly.json` 1–41.
- `s2-3/`: `read-map.md` 1–30; `probes.md` 1–12; `own-expected.md` 1–15.
- `s1-2/`: `evidence-verification.json` 1–43; `submission-manifest.json` 1–62;
  `watch-inventory.json` 1–108 (8 old records, PID/PPID snapshot пуст);
  `after-qualification.json` 1–40; `after-qualification-corrected.json` 1–33.
- `s1p-2/`: `qualification.md` 1–77; `expected.json`; `forensic-actual.json`;
  `derivative-expected.json`; `derivative-actual.json`; `derivative.diff` 1–18;
  `measurement-error.md` 1–16; `probe-plan.md` 1–54; `preservation-actual.json`;
  `documentary-actual.json`; `api-schema-selected.json` 1–875 (6 маршрутов V2,
  OpenAPI 3.1.0); `actual-output-manifest.json` 1–150; `freeze-locator.json`;
  `finding-response.md`, `read-map.md`, `probes.md`, `platform-and-consumers.md` —
  полностью, ранее в сессии.

## Программное полное чтение hash-инвентарей и сверка копий

Большие JSON-инвентари прочитаны программно целиком (полный parse, ключи, счётчики,
стадии), не построчно глазами; это форма полного чтения inventory, а не их payload:

- `s1-2/before-manifest.json` (678 files, kind own-tree-before) и `after-manifest.json`.
- `s1p-1/before-tree.json` (715), `after-tree.json`, `after-final.json`.
- `s1p-2/before-manifest.json` (734 entries, root нейтральный), `after-manifest.json`
  (761 entry, стадия «до step6/done и accounting/submit»).
- `s2-2/`: `before.json` (9), `before-corrected.json` (14), `coverage-reconciliation.json`
  (26, помечен НЕ early before), `after-manifest.json`, `after-corrected.json`,
  `after-final.json`, `source-preservation.json`, `submission-manifest.json`,
  `submission-manifest-final.json`.
- `s2-3/before-manifest.json` — 723 entries, `phase: early-before`, root нейтральный,
  provenance с raw SHA `676911c6…`; фактический SHA-256 файла
  `aeebd8404ff0b276d9ee17076aad9c9fe24fccccc896cb39bf38b2273230c97c` — совпал с
  `derivative-actual.json`. `s2-3/after-manifest.json` (731).
- `s1p-2/root3.diff` — 1066 строк, три пары `до/`→`после/` для root3.

Побайтовая сверка копий (собственная, единица 2):

- `s1p-1/root-before/{analysis,spec,spec-trace}.md` = редакция С1-2
  (15183/`645ff6bb…`, 12258/`2b56bfb8…`, 6134/`e7ccec5c…`) — совпали с
  `s1-2/submission-manifest.json`. Первое предположение этой сессии ожидало редакцию
  С1п-1 — собственная ошибка таблицы ожиданий, исправлена по факту; файлы не менялись.
- `s1p-2/before-{analysis,spec,spec-trace}.md` = редакция С1п-1 (8859/16231/12415,
  SHA `1920eff2…`/`eab33a1c…`/`b2319ef5…`) — совпали; `before-{progress,profile,usage}.log`
  — префиксы журналов совпали.
- `s1p-2/frozen-root3/*` = текущие root3 (10024/43139/40896, SHA `1750a21b…`/`22e641de…`/
  `cacad23b…`) — совпали с корневыми файлами.

## Собственная независимая карта source → REQ/AC/DNC

Метод: до сверки с N-таблицей эта сессия самостоятельно разложила `task/message.md`
(по строкам M9–M56: полномочие, дефект, границы, гипотезы 22–26, программа N6 пп. 1–6,
критерии приёмки, результат, связи, границы, вопросы) и `sol-correction-setup/assignment.md`
(A13–A162), плюс нормы AGENTS/process/методики, в атомы и назначила каждому связь
REQ/AC/DNC/С/Н. Затем карта сверена с N001–N178 и историей ID.

Результат сверки:

- Каждый раздел message 9–56 имеет атомы в N001–N096; каждый раздел assignment
  С1п-2 — в N097–N164; нормы G/P/методики — в N165–N178. Потерянных регуляторных
  условий не найдено.
- Пять нерегуляторных атомов заявлены явно: N039–N042 — гипотезы message 22–26
  (помечены «Н: гипотеза, сверена по коду», что соответствует указанию message 26
  проверять самостоятельно), N093 — контекст связи nova#100. Замаскированного
  контекста под видом требований не обнаружено.
- История ID проверена по трём фактическим файлам: `s1p-1/root-before/spec.md`
  (С1-2: 10 REQ / 7 AC / 5 DNC — прочитан целиком, 86 строк), `s1p-2/before-spec.md`
  (С1п-1: 11/10/6 — перечень REQ-01…11 выгружен и сличён), корневой `spec.md`
  (18/18/6). Каждому исходному REQ/AC/DNC соответствует сохранение или задокументированное
  расширение; молчаливых исчезновений не найдено. Расширения 12/13/14 (ownership),
  15/16 (положительный L), 17/18 (docs/проверки) выводятся из замечаний С2-1…3 и
  assignment 46–92, не из новых unrelated требований.
- Наблюдение (не потеря требования): у M29 инструкция «запросить заказчику точные
  immutable evidence/время/ids обоих Phase1 runs, shared scratch и новый worker»
  отдельного атома не имеет; ближайший N020 покрывает M18. Это исполненная
  сессионная обязанность С1 (результат — integrator intake), а не требование к
  продукту; влияние оценивается в отчёте, здесь зафиксировано честно.
- У M31 обязанность «описать доступность чужого cancel/interrupt/inbox deletion»
  отдельного атома не имеет; по существу закрыта analysis F5 и В-02.

## Недочитанное и его влияние

- Payload 87 raw-копий intake не перечитывался и не открывался; в единице 5 — только
  bytes/SHA сверка по raw-manifest. Это не ограничение предметной проверки текста.
- Строки гигантских before/after manifests читались программным полным parse
  (см. выше), не глазами; на выводы о payload архивов эта сессия не претендует.
- SDK/OpenCode UI/нерелевантные репозитории не читались и не используются как норма.
- Старая Nova сессия A не открывалась и не будилась; transcripts/inbox bodies/env/
  credentials не читались (запрещено назначением); это не missing, а граница.
- Код `opencode-plugin/*` прочитан в единице 3; диапазоны — в разделе ниже.

## Первичный код и команды — диапазоны чтения (единица 3)

Полные файлы (построчно): `watch.ts` 1–265; `mcp.ts` 1–120; `hung-resume.ts` 1–58;
`gate-stop.ts` 1–75; `owner-answer.ts` 1–131; `queue-gate.ts` 1–144;
`package.json` целиком; `test/README.md` 1–113; `.github/workflows/guards.yml` 1–75;
`README.md` 1–1220 (весь).

`core.ts` (предметные диапазоны, тела функций целиком): `mayWakeCard` 1062;
`postLetter` 1111–1117; claim/release/confirmLetters и requeue 1154–1210;
`saveObligations`/`clearStuck`/`addObligation` 1280–1306; `askedClosedWhy`/
`closeAskedByLetter`/`settleObligation` 1310–1334; `HELP` 1384–1587, `helpFor` 1590;
замок роли (wx/tombstone) 1641–1667; `waitingFor`/`takeReply` 1682–1704;
`crew_send` 1913–2028 (tier/QUEUE 1967–1989, role 1990–2006); `crew_wait` 2030–2060;
`startSession` 2092–2113; `crew_inbox` 3090–3126; `crew_timer` 3188–3210;
`crew_help` 3212–3216; `releaseExecutor` 3326–3333; `expectedLetters`/`postExpected`
3358–3384 (ранее в сессии).

`index.ts` (предметные диапазоны, тела целиком): `deliver` 295–383; nudge →
deliver 560–568; `resumeInterrupted` 580–619; `retryFailed` 624–641;
`finishTasks` 646–739; assignReviewers → deliver 790–797; hung-resume → deliver
1028–1035; owner-answer → deliver 1370–1376; `startTask` 1855–1869;
`processQueue` 1901–1934; проход опроса 2000–2047 (шаги 2015–2035, фильтр closed
2040, цикл deliver 2039–2043); deps хоста makeTools 2150–2161 (roleTaken → deliver
2161). Вызов `pollWatches` 2035.

Полнота поиска писателей: `postLetter(` — 49 вхождений (1 определение + callsites
только в `core.ts`, `index.ts`, `review.ts`); `.req` — только `watch.ts` (плюс
перевыпуск в `finishTasks`, index.ts 662); QUEUE-запись — одна (core.ts 1985);
writeFileSync/renameSync по всем 52 исходникам сверены — иных писателей писем
нет (остальное — records: cards/forms/gates/idle-tabs/answers/status/tasks/
watches). Модули records/решений прочитаны или просмотрены по экспортам:
`form-wait.ts`, `idle-tab.ts`, `answer-loop.ts`, `answer.ts`, `review.ts`
(письма — только через deps/callsites index.ts, прочитанные выше).

## Собственный consumer cut против таблицы spec (17 строк)

Построен самостоятельно по первичному коду до сверки с
`s1p-1/writer-consumer-matrix.md`; совпадения и расхождения зафиксированы:

- Строка 1 (watch/timer → `.req` → claim → spawn): подтверждена. `crew_watch`
  (core.ts 3139–3186, ранее в сессии) и `crew_timer` (3207) пишут `.req.json`
  (watch.ts 75); consumer `pollWatches` (166–215): claim переименованием 179,
  rm 184, detached spawn 108, PID в запись 111, done 193–209. Проверки
  «владелец закрыт» перед spawn НЕТ; lifecycle-поколения нет вовсе.
- Строка 2 (перенос watch при finishTasks): index.ts 652–673 — `dropWatch` +
  `requestWatch` с тем же `session` (causation сохраняется), новый id.
- Строка 3 (done/cancel): watch.ts 202–208 (post письма владельцу),
  dropWatch 217–230, cancelWatch 235–241.
- Строки 4–6 (crew_send/postLetter): crew_send 1913–2028; отказа письму
  закрытому session-адресату НЕТ (persisted всегда; `askedClosedWhy` 1317
  только снимает обязательства); проверки source-closed НЕТ; role/tier —
  QUEUE (1983–1988) с поздним выбором R в `processQueue` (1903–1934, claim
  rename 1921, без проверки поколений).
- Строка 7 (обязательства): nudge 540–568, obligations core.ts 1280–1334.
- Строка 8 (resume/retry): `resumeInterrupted` 580–619, `retryFailed` 624–641,
  hung-resume 1028–1035 + `hung-resume.ts` 1–58 (interrupt API OpenCode).
- Строка 9 (reassign/startSession/release): `startSession` core.ts 2092+
  (прежняя → handed, новый plannedSessionId — новая попытка с другой identity),
  `releaseExecutor` 3326–3333 (`spawned.status = "closed"`).
- Строки 10–11 (startTask/resumeTasks/reconcile): index.ts 1855–1869,
  шаги опроса 2019–2024; `postExpected` core.ts 3379.
- Строки 12–13 (review/push/cancel, form/idle/gate/flow notices): callsites
  index.ts 779–878, 1211–1402, 1451–1648 — прочитаны; модули решений
  `gate-stop.ts`, `owner-answer.ts`, `queue-gate.ts` — полностью.
- Строка 14 (roleTaken и 7 прямых deliver): независимый подсчёт дал ровно 7
  прямых вызовов — 568 (nudge), 797 (assignReviewers), 1035 (hung-resume),
  1376 (owner-answer), 1865 (startTask), 2042 (опрос), 2161 (roleTaken) —
  совпало с формулировкой таблицы spec. В теле `deliver` (295–383) проверки
  `spawned.status === "closed"` НЕТ: фильтр closed стоит только в цикле опроса
  (2040); тихие письма (wake:false) закрытой вкладке всё равно пишутся
  в историю через synthetic (344–351, 366–368).
- Строка 15 (claim/release/recover): core.ts 1154–1210 — identity письма
  сохраняется, новой операции нет.
- Строка 16 (финальная запись): index.ts 702–707 — synthetic/prompt без хода,
  помечено «Сессия закрыта — письма больше не приходят».
- Строка 17 (MCP makeTools): mcp.ts 1–120 — те же makeTools из core.ts,
  posted/picked/roleTaken no-op; delivery остаётся за плагином.

Подтверждённые обходы текущего кода (предмет дефекта spec, не находка против
draft): `crew_inbox` (3097–3126) и `takeReply` (1687–1704) читают mailbox
напрямую без проверки closed — обход, названный REQ-05, реален; «closed» —
изменяемое поле карточки без поколения; stale re-read карточки поколение не
сравнивает; `pidAlive` (watch.ts 93–101) — `process.kill(pid, 0)`, подвержен
PID reuse (EPERM считается живым).

## package / CI / docs — собственная проверка (единица 3)

- `package.json` scripts.test декодирован программно: 121 последовательная
  команда `node` через `&&`; первая `node test/cleanup-tmp.mjs`, последняя
  `node test/crew-no-queue-behind-question.test.mjs`; все 8 targeted suites
  из spec присутствуют в цепочке (файлы существуют, проверено Test-Path);
  других scripts нет (typecheck/build отсутствуют — как заявлено spec 437).
- `test/README.md` 1–113: fake host; «Not covered» честно называет live
  OpenCode и типы — соответствует spec 460–461.
- `.github/workflows/guards.yml` 1–75: plugin tests не запускает; команды
  раздела «Проверки и порядок ворот» spec соответствуют workflow (dash -n,
  run-all, guard-secrets, check-wiring, selftests, prove-red, probe-empty-root,
  commit-range/guard-commit-message, ci-mask).
- `README.md` 1–1220 и `HELP` (core.ts 1384–1587): действующие тексты;
  ссылок на папку задачи 081 как на источник нормы нет (grep по
  `doc/tasks/081|tasks/081|задачи 081` в `opencode-plugin/*.{ts,md}` — пусто).
  Текущий документированный контракт («Presence: only open tabs are woken»,
  README 86–96; «ДОСТАВКА», HELP 1466–1469) описывает presence-модель, которую
  будущая реализация обязана будет согласованно изменить (REQ-17/AC-17) —
  без утверждения универсальной гарантии, чего текущие тексты и не делают.
