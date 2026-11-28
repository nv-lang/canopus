Статус: черновик
Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть

# Требования: долговременный fence закрытых сессий

Основание — авторский проект требований по заданию и уточнениям С1п-1. Не утверждён. Не разрешает план, код, tests, API mutation, административные действия или rerun.

## Результат и границы

После отдельных ворот результат — code и selftests в `opencode-plugin/` (по плану: `watch.ts`, `core.ts`, `index.ts` и нужные смежные места), поведенческий README и help при изменении поведения. Документы задачи — история/спецификация/план/свидетельства, не вторая действующая норма. `current.md`, если будет создан в будущем шаге результата, содержит только ссылки на фактически внесённые места.

Цель — durable fence для закрытого/переданного исполнителя и его deferred operations при сохранении действий replacement worker в отдельном scratch. Не сводить цель к одноразовому interrupt. Nova #94 не является test fixture. Внешний OpenCode клиент вне доказанного контроля; не выдавать недостижимую гарантию за факт: если требуемое конечное состояние зависит от отсутствующей гарантии, STOP/HOLD и вопрос владельцу.

## Термины и наблюдаемый контракт

- **Close** — монотонная фиксация закрытия exact session identity + generation; после неё никакой stale actor не может выдать полномочие этой identity.
- **Admission** — единственная точка, после которой операция считается допущенной к запуску; её identity, generation и intent доступны для восстановления до внешнего OS side effect. Primitive и сериализация — будущий план.
- **Admitted-before-close** — admission уже committed до close. Close обязан дождаться/обнаружить exact operation и завершиться только после доказанного прекращения всех scoped effects. Неизвестная identity, timeout или неуверенное exit => close unresolved, STOP/HOLD, не успешное close.
- **Close-before-admission** — close committed первым. Admission отвергается; spawn, letter, prompt, command, retry/resume или side effect не допускаются.
- **Завершённый close** — монотонный tombstone плюс отсутствие допустимого незавершённого operation; каждое admitted operation имеет проверяемое terminal evidence. Если доказать невозможно, API/журнал сообщает unresolved/STOP, а не success. Универсальный таймаут не считается завершением.
- **Exit proof** — доказательство по exact immutable process identity и scoped descendants/права записи, не `done`, exit file отдельно, code 0, kill success, PID отсутствует, PID/PPID snapshot или истечение времени.
- **Trust boundary** — plugin-owned writers и consumers под контролем CrewHarness против независимых OpenCode API clients/серверных механизмов. Последним не приписывается fence без документированной внешней гарантии.

## Атомарные требования

- **REQ-01 — монотонный close.** When close/handoff принят, then tombstone exact owner+generation становится неотменяем stale writers; AC-01/02, evidence — state transitions и restart probes.
- **REQ-02 — request writers.** When closed actor вызывает `crew_watch`/`crew_timer`/retry request, then отказ до `.req.json` и без побочного эффекта; AC-03, fixture проверяет отсутствие записи.
- **REQ-03 — admission/close serialization.** Каждый request, claim, start и recovery использует одну проверяемую admission identity. Close-before-admission => no spawn. Admitted-before-close => close находит точную identity и ждёт terminal proof; crash/неизвестный intent => unresolved STOP. AC-02/04.
- **REQ-04 — crash recovery.** После crash в каждом переходе intent остаётся восстанавливаемым; crash после OS spawn до PID record не превращается в потерянный successful close. Если exact spawned identity не восстанавливается — держать unresolved, не допускать GO. AC-04.
- **REQ-05 — полный локальный writer/consumer fence.** Все подконтрольные CrewHarness пути постановки/доставки/исполнения/возобновления сверяют lifecycle: watch, timer, request, claim, start, poll, recovery, restart, reassign, release/end-task, retry/resume, letters, direct deliver, prompt/command, role queue. Для закрытой identity ничего не запускается и не создаётся. AC-03/05; матрица исходных путей и будущих тестов — `session-evidence/s1p-1/writer-consumer-matrix.md`.
- **REQ-06 — внешняя граница.** Независимый клиент/OpenCode server не считается подконтрольным writer. Не заявлять абсолютное отсутствие новых внешних turns без подтверждённой внешней гарантии. Если конечный GO зависит от неё — HOLD и вопрос владельцу; не заменять владельческую цель локальным interrupt. AC-06.
- **REQ-07 — stop, exit, process scope.** Остановка адресуется exact identity; PID reuse, reparented descendants, открытые handles и остаточные права записи входят в threat model. Unknown/partial observation => STOP. Kill exit code, `done`, code 0, нет PID или snapshot не доказывают exit. Не выбирать sandbox/job/ACL primitive в spec. AC-07.
- **REQ-08 — replacement worker.** Новый worker с новой session/generation вправе действовать в своём scratch. Старый operation не должен изменять новый scratch/archive/log; если isolation proof не доступен, STOP, но не blanket-block replacement. AC-08.
- **REQ-09 — сохранность.** До любой будущей разрешённой mutation фиксируются exact source records и provenance; failures не удаляют и не нормализуют исходники. Потерянные run1 архивы остаются missing, digest не восстанавливает bytes. AC-09.
- **REQ-10 — повтор/рестарт/concurrency.** Повторы close/revoke/retry, несколько consumers и restart сохраняют tombstone и не создают дубликатных side effects. Любой crash point из AC-04 даёт deterministic recovered state или STOP. AC-04/05.
- **REQ-11 — audit/privacy.** Публичные записи связывают результат с безопасной identity/provenance и наблюдаемым исходом, но не включают credentials, env dump, локальные machine paths или запрещённые private names. AC-10.

## Критерии приёмки (будущая реализация)

- **AC-01 / REQ-01:** When close фиксируется раньше admission, then tombstone persisted и на restart не снимается; независимая проверка читает идентичность поколения и доказывает запрет старого writer.
- **AC-02 / REQ-03:** When deterministic schedule close-before-admission, then результат единственный — отказ admission, no spawn и no side effect. When admission committed before close, then close не возвращает success до доказанного terminal outcome exact operation; если outcome UNKNOWN — STOP. Ни один тест не принимает оба outcome для одного заданного порядка.
- **AC-03 / REQ-02/05:** When closed session зовёт watch/timer/letter/retry/resume/queue/deliver путь, then каждый подконтрольный writer отказывает/no-op без request, inbox write или нового turn; assertions по всем таблицам matrix.
- **AC-04 / REQ-03/04/10:** Before каждого durable transition инжектировать crash: до admission, после admission/до spawn, после spawn/до PID persistence, после persistence/до claim removal, во время close и во время recovery. Then restart восстанавливает operation exact ID либо держит STOP; никогда не забывает spawned child и не выдаёт successful close. Подсунуть PID-write failure — критерий обязан стать красным.
- **AC-05 / REQ-05/10:** повторный close/cancel, два pollers, restart между шагами: one terminal operation, no resurrected request, stale request и claim отклонены; сравнить side-effect counter и persistent state.
- **AC-06 / REQ-06:** независимый OpenCode client делает direct prompt/command или inbox write в изолированной модели. Если доступной поддерживаемой внешней fence нет — результат документации STOP/HOLD, а не product PASS; interrupt и inbox cancel проверяются как отдельные операции, не как permanent fence.
- **AC-07 / REQ-07:** подставить reused PID, unknown identity, reparented descendant, retained write handle, permission/kill failure. Then нельзя успешное close/GO; требуются наблюдаемые identity+exit+write-denial evidence. Нулевой PID snapshot и `done` дают negative oracle.
- **AC-08 / REQ-08:** old worker попытался write в replacement scratch — отказ/нет изменения; replacement worker в отдельном scratch успешно создаёт собственную fixture запись. Нет blanket block.
- **AC-09 / REQ-09:** before/after hashes подтверждают сохранность всех доступных immutable inputs; утраченные bytes перечислены как missing, никакой реконструкции по digest.
- **AC-10 / REQ-11:** публичный пакет проходит `python scripts/guards/guard-secrets.py --tree`, `sh scripts/guards/run-all.sh --ci`, `python scripts/guards/check-wiring.py`; в CI workflow также shell syntax, commit-range checks и `sh scripts/guards/selftest/run-selftests.sh`, `prove-red.sh`, `probe-empty-root.sh`. Это не заменяет `npm test` из `opencode-plugin/` (точная цепочка 121 последовательный Node script); полный тестовый прогон — отдельно через очередь машины. Targeted suites: `node test/crew-watch.test.mjs`, `node test/crew-flowwatch.test.mjs`, `node test/crew-restart.test.mjs` из `opencode-plugin/`. Ничего из этого в С1п не запускается.

## DNC — запреты

- DNC-01. Не считать `CLOSED`, interrupt, inbox deletion, `done`, code 0, kill success, timeout или отсутствие PID достаточным fence/exit proof.
- DNC-02. Не менять/удалять старые evidence, scratch, archive, worktree, refs или logs; не восстанавливать утраченные bytes по digest.
- DNC-03. Не выполнять broad kill, reset/stash/force, session delete, Phase1/rerun или API mutation без отдельного разрешения и безопасного протокола.
- DNC-04. Не блокировать replacement worker и не распространять scope на Nova tooling/общий процесс-менеджер.
- DNC-05. Не читать/собирать credentials, secrets, полный environment или environment родителя.
- DNC-06. Не утверждать внешнюю гарантию OpenCode или universal OS isolation до документального доказательства.

## Открытые вопросы и safe defaults

1. Владельцу через вопрос до утверждения spec/plan: если независимые OpenCode writers нельзя запрещать поддерживаемым механизмом, сохранять ли HOLD вместо снижения конечной гарантии? Рекомендация: сохранять HOLD; довод — цель P1 нельзя заменить локальным interrupt. Срок: до ворот утверждения spec; полномочие — решение о границе гарантии. Safe default: HOLD, не запускать #94.
2. Владельцу/интегратору до любых будущих административных mutations: какой протокол capture→exact identity→адресное действие→exit proof допустим? Рекомендация: только после плана и доказательства идентичности/выхода; довод — старые состояния и PID снимок не достаточны. Safe default: не выполнять mutation; полномочие на текущие действия отсутствует.
3. Плану, не владельцу: выбрать межпроцессный lock/admission/storage и OS primitive только после проверки платформ/гарантий. Это открытая инженерная работа, не вопрос спецификации о принятой гарантии.

## Проверки и порядок ворот

Порядок: независимая С2-3; утверждение требований по слову владельца; план с доказательствами primitive; реализация только после plan gates; изолированные RED→GREEN; targeted suites; полный последовательный `npm test`; отдельный полный CI guards набор и независимая приёмка; Nova verdict отдельными воротами. Все тяжёлые прогоны — через очередь машины. `README.md`/`crew_help` меняются только при фактическом изменении поведения; `current.md` создаётся только как точный указатель после размещения результата. Спецификация сама по себе не утверждает feasibility или GO.
