# Матрица writers → queue → consumers

Источник кода — текущее дерево задачи, просмотренные callsites. Это source audit, не dynamic proof; «нет обнаружено» ограничено указанными путями. Actor: plugin = CrewHarness, user = actor текущего tool/session, external = OpenCode/API вне проекта.

| Путь / callsite | Writer / actor и trust boundary | Queue/consumer | Риск для closed identity; требование |
|---|---|---|---|
| Reassign: `core.ts:startSession` 2092–2119, `releaseExecutor` 3325–3333 | plugin записывает старую session status `closed`, снимает obligation; новая сессия создаётся отдельно | task start в index | Close не увязан с watch/inbox/OS process. durable tombstone before replacement admission: REQ-01/03 |
| `crew_watch` `core.ts:3170–3185` | session actor → `requestWatch` пишет `.req.json` | `pollWatches` | Нет видимой closed guard в writer; request переживает turn/restart: REQ-02/05 |
| `crew_timer` `core.ts:3188–3209` | session actor → тот же request writer | `pollWatches` | Та же поверхность; нельзя считать timer особым безопасным типом: REQ-02/05 |
| Request serialization `watch.ts:70–76` | plugin writer принимает session string, пишет temp/rename | `pollWatches` | Файловый atomic write — не синхронизация с lifecycle/OS spawn: REQ-03/04 |
| Machine queue `watch.ts:149–163` | reader перечисляет `.req.json`, machine/project fields | `pollWatches` capacity check | Проверка слотов читает состояние до claim; lifecycle admission отдельна: REQ-03/05 |
| Claim `watch.ts:166–185` | poller rename `.req.json`→`.claim`, читает и удаляет claim | тот же poller; параллельный poller видит rename | Claim не транзакционен с close/spawn; crash после удаления теряет intent: REQ-03/04/10 |
| Start `watch.ts:103–116` | plugin вызывает detached OS spawn; callback error логирует | `.json` running record пишется caller после возврата | Crash после spawn до устойчивого PID даёт unknown child; outcome только STOP: REQ-04 |
| Poll `watch.ts:186–209` | plugin пишет running/done и вызывает post callback | следующий poll / letter delivery | `.exit` или `!pidAlive` через 10s может записать done; это не достаточный exit proof: REQ-07 |
| Cancel/drop `watch.ts:217–240` | user-owner cancel; drop удаляет request либо taskkill/process.kill | same watch record | Ownership проверяется по watch session, не обязательно lifecycle generation; kill failure всё равно done: REQ-07 |
| Finish task `index.ts:646–687` | plugin при accepted/cancelled перемещает watch: drop old + request new ID/cwd; также снимает watches | новый request будет поллиться | Может создать новую операцию при закрытой source session; не считать безусловным revoke: REQ-05/08 |
| Recovery `index.ts:580–619` resumeInterrupted | plugin пишет resume letter по card/obligation и DB metadata | inbox delivery/turn | Требуется проверка exact closed generation перед созданием и потреблением: REQ-05/10 |
| Retry `index.ts:624–641` retryFailed | plugin пишет retry letter | inbox delivery/turn | Аналогично; obsolete failure не даёт полномочия после close: REQ-05 |
| Start-task recovery `index.ts:1880–1898` | plugin retries task `starting`, sends status notice | `host.startTask`, next task pass | Task status/retry может обходить session close unless common gate: REQ-05/10 |
| Role queue `core.ts:1971–1988`; `index.ts:1901–1934` | user letter to role-tier queued; plugin chooses free holder and writes direct recipient letter | processQueue rename claim + postLetter | Queue item addressed role, target can be a stale/closed card; revalidate before dequeue/write/turn: REQ-05 |
| Direct `crew_send` explicit session `core.ts:1913–2008` | session actor; direct postLetter or role queue. Some task report has its own submitted/running check, not generic lifecycle guard | inbox / `deliver` | Stale sender can enqueue command-like instruction to old recipient; check source and recipient trust/generation; REQ-05 |
| General `postLetter` `core.ts:1111–1117` | plugin/shared function writes inbox file; many callers | deliver loop | No common closed check at this primitive; caller-specific checks insufficient: REQ-05 |
| Direct `deliver` `index.ts:295–...` | plugin delivery for card | OpenCode host wake/send path | Closed filter exists before main pass at 2040, not all direct invocation paths; common admission required: REQ-05 |
| Direct calls | `index.ts` lines 568, 797, 1035, 1376, 1865, 2042, 2161; plugin invokes deliver | OpenCode host | All callsites need inventory/revalidation, not only 2042 loop: REQ-05 |
| Reconcile `index.ts:2024` and poll pipeline | plugin recovers state, then resume, finish, queues, watch poll | same pass, other plugin instances | Ordering of sequential stages in one process doesn't establish cross-process serialization: REQ-03/10 |
| Restart | plugin starts pass and `resumeInterrupted`/`resumeTasks`/`pollWatches` | persistent files and OpenCode DB | Old request, claim, obligation or detached process can survive service restart: REQ-04/10 |
| Prompt/command through CrewHarness | indirect via inbox delivery/host APIs | OpenCode session turn | Need lifecycle gate before plugin-induced turn; no claim of checking each server internal transition yet: REQ-05 |
| External direct prompt/command/inbox API | independent OpenCode client/server, outside plugin trust boundary | OpenCode server | No local code can prove its exclusion. Exact external guarantee needed or HOLD/question, not local interrupt substitution: REQ-06 |
| `session.interrupt`, inbox cancel/list | OpenCode V2 operations (names from existing S2-2 evidence) | external server | Distinct current-turn interrupt, item cancellation and GET snapshot; none shown durable: REQ-06/07 |
| Replacement worker | new task session/session ID and own scratch | its own plugin operation | Must remain allowed while old generation denied; old process write denial requires actual isolation proof: REQ-08 |

## Identity и digest reconciliation

| Сведение | Источник | Смысл и ограничение |
|---|---|---|
| Old session ID | message.md / intake | `ses_mvawdsam690xeqwzpp` |
| Replacement session ID | integrator S2-2 qualification | `ses_mvcoxay3pjag7acd92`; не old containment target |
| Шесть replacement records | integrator S2-2 qualification | `1792260030319-ie8bde`, `1792260067690-t7zy8c`, `1792260097037-xabdxk`, `1792260111664-pr9xpd`, `1792260127576-aag98z`, `1792260159699-hre9bp`; `session_match:false` для old |
| Восемь old inventory IDs | integrator S2-2 qualification | `1792179830027-y3slcn`, `1792183468927-mmg9gt`, `1792187099073-itfcuj`, `1792190755214-ea51zn`, `1792194428378-i8kvs7`, `1792209979806-8xdhpt`, `1792224406828-s0k28y`, `1792264172390-3ns1ev` |
| Поздний old snapshot | integrator qualification | шесть done; первые два records отсутствовали. Snapshot не даёт причину исчезновения, exit proof или future fence |
| Dossier expected | первичный `integrator-intake.md` | bytes=15150; SHA-256 `7a1f831a85caa227d9d3c36c45f6bf34bab144ea29e1080b58607ed8825d9969` (64 hex) |
| Прежний expected | старый `s2-2/forensic-verification.json` | 63-символьный expected, ошибочен; immutable, не исправлять |
| Actual новой проверки | С1п | не выполнялась; нет ретроспективного PASS. Новый expected закреплён до любой будущей собственной digest-проверки |
| Raw availability | intake/qualification | 87 перечисленных copies существуют/прежняя сверка успешна; raw run1 archives/log bytes утрачены, их не восстановить из hashes |
| API snapshots | `s2-2/api-readonly.json` | Прерванная попытка = UNKNOWN в тот момент; последующий GET exit 0/exact ID/inbox 0 = отдельный поздний snapshot; не durable fence. С1п не выполняла повторный API GET |

## Trust boundaries и недоказанное

1. Внутри плагина перечисленные writers/consumers — требуемый scope будущей проверки. Матрица не доказывает, что перечисление исчерпывает весь граф; С2 должна сверить callsites самостоятельно.
2. Independent API callers и OpenCode server behavior — внешний trust boundary. Наличие маршрута не говорит о том, кто может его вызвать и какие durable guarantees применяются.
3. OS process containment: PID reuse, reparenting, descendants, handles и остаточные ACL/write rights остаются UNKNOWN до выбранной и испытанной primitive. Никакого универсального sandbox обещания.
4. Любая identity mismatch, crash-recovery ambiguity или не подтверждённый exit → STOP/HOLD; никакого успешного close/GO.
