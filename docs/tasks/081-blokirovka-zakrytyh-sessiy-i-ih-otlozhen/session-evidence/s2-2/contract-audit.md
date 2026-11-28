# Проверяемость контракта spec.md — С2-2

Основание: полное чтение `spec.md` (REQ-01…10, AC-01…07, DNC-1…5); ожидание и сценарии были заранее перечислены в `probe-plan.md`. Только ручная оценка текста/исходников, не исполнение product tests; GREEN/PASS не ставится.

| Clause | When / then expected in spec | Evidence/oracle in text | Reviewer result |
|---|---|---|---|
| REQ-01 | close/handoff → monotonic durable fence before next worker; stale writer cannot reopen | AC-01 partly; no defined close linearization point/crash state | Underdefined — S1/S4 |
| REQ-02 | closed actor invokes `crew_watch`/`crew_timer` → rejected before request/side effect | AC-01 denial + no request; replacement worker separate | Deterministic in principle; implementation still untested |
| REQ-03 | close vs request/claim/start race → exactly one serialized outcome; start-wins identity visible and close resolves it | AC-02 offers two alternatives but no oracle for close completion or crash recovery | Non-deterministic / not verifiable — S1/S4 |
| REQ-04 | close → only own pending/running operation invalidated/stopped; unknown identity → STOP | AC-03 unknown/PID reuse and no broad kill | Correct fail-closed intent, but no supported identity primitive/exit proof — S3 |
| REQ-05 | closed session → no new plugin prompt/retry/resume/dispatch; inbox inspected/revoked or UNKNOWN | AC-04 no new execution; repeat after interrupt | External OpenCode writer boundary and scope of “execution” unresolved — S2 |
| REQ-06 | failed kill, null code, stale exit record → not reported as proven exit | AC-03/05 kill error/timeout remains failure | Clear negative intent; needs positive process identity and observable terminal result in future test |
| REQ-07 | concurrent callers/restart/crash/retry → fence persists, no resurrection/duplicate | AC-05 repeats close/restart/concurrent instances | Missing enumerated crash points and exact idempotency oracle; tied to S1 |
| REQ-08 | old operation attempts write into replacement scratch → denied; replacement still acts | AC-01/06 separate worker and write fixture | No enforcement primitive/threat boundary; “impossible” claim cannot yet be proved — S3 |
| REQ-09 | evidence capture before any future permitted mutation; one missing source does not taint/erase others | AC-06 byte preservation; DNC-2 | Direction clear; lost raw run1 material cannot be regenerated; future fixture must test only available bytes and name loss |
| REQ-10 | refusal/transition/admin action bound to exact identity and safe audit record | AC-07 public safety | Safety goals listed, but exact sanitized fields/guard commands absent — S5/M2 |
| AC-01 | closed caller watch/timer → deny/no request; distinct replacement worker remains allowed | RED/green textual pair | Positive/negative predicate is clear, but no isolated tests supplied (expected at spec stage) |
| AC-02 | close between pre-check and claim/start → no silent post-close spawn or exact admitted process handled | race scenario | Two accepted outcomes make test verdict ambiguous — S4 |
| AC-03 | stale request + PID reused/unknown → no broad kill, no false done, other session unchanged | identity and cross-session assertions | Describes desired outcomes; exact creation identity/descendant oracle absent — S3 |
| AC-04 | retry/inbox/direct new turn after close and repeated interrupt → no controlled old execution | RED/green | External API writers not controlled; “no execution” exceeds stated CrewHarness surface — S2 |
| AC-05 | repeated close, multi-instance, restart at writes, kill timeout → no resurrection and no false exit | stated checks | Crash-point set and serialization result not fully specified — S1/S4 |
| AC-06 | old process writes replacement scratch; evidence bytes change | isolated side-effect fixture + hashes | Local fixture can only prove its own isolation; absolute old process inability needs a supported OS boundary — S3 |
| AC-07 | output contains no secret/env dump/private path/name | safe public repository evidence | No exact invocation/output or differentiated leak check yet — M2 |
| DNC-1 | no single status, interrupt, inbox deletion, `done`, exit code, missing PID used as durable fence/proof | negative rule | Clear and directly testable |
| DNC-2 | no raw evidence/scratch/archive/worktree/ref/log deleted or overwritten | negative rule | Clear; current actions read-only |
| DNC-3 | no broad kill/reset/stash/force/session delete/real rerun/mutation without gate | negative rule | Clear; current actions read-only |
| DNC-4 | no blanket block of replacement worker or scope expansion | negative rule | Clear intent; pair with AC-01/06 |
| DNC-5 | no full environment/credentials/secrets/parent environment | negative rule | Clear; API query redacted; reports must remain secret-free |

Result: there are ten REQ, seven AC and five DNC; no omission in this count. Textual existence is not proof of executable verification. The missing oracle in S1/S2/S3/S4 remains a requirements-level problem, not an invitation to invent the implementation architecture or weaken the owner-approved goal.
