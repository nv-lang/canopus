# 081: карта изменений и отдельные доказательства

Дополнение к `plan.md`, не второй контракт. Все будущие результаты сейчас
NOT VERIFIED. Новые функции ниже — проектируемый интерфейс, не найденный код.
Пути в таблице относительно `opencode-plugin/`, если не сказано другое.

## Cut writers/consumers

| Поверхность первичного кода | Изменение общего протокола |
|---|---|
| `watch.ts`: requestWatch/start/pollWatches/dropWatch/cancelWatch | S/R/O intent до req; claim без полномочий; D/launch через broker; revoke+proof, не done после taskkill; запрет GC нетерминальных evidence |
| `core.ts`: makeTools crew_watch/crew_timer, postLetter | Проверка S/R до persistence на tool и direct-call уровне; outbox и стабильные effectID, без служебного bypass |
| `core.ts`: crew_send explicit/all/role/tier, QUEUE write | Exact identity каждого explicit/all target; явный bound/open-role; поздний R в authority перед D |
| `core.ts`: claimLetters/confirmLetters/releaseLetters/recoverClaims | Сохранение O/effectID/S/R; lost claim не потеря intent; не повторять host effect из-за transport retry |
| `core.ts`: crew_inbox, takeReply/crew_wait | Gate перед рабочим payload; после C только безопасный audit, не старое задание даже через READ history |
| `core.ts`: obligations, expectedLetters/postExpected/propagateToParent, review/round/push/cancel | Causation исходной попытки; отдельная identity служебного actor не очищает closed authority; passive audit адресован интегратору/хранилищу |
| `core.ts`: startSession/releaseExecutor/reassign, Card/saveCard | C exact generation до передачи старого общего ресурса; закрытие pending/unresolved явно, новая identity B; stale card не снимает C |
| `index.ts`: touch, deliver; 7 direct calls: nudge, startReviewer, selfResume, flow, startTask, delivery pass, roleTaken | Один consumer-adapter с per-effect D для всех входов; quiet/synthetic не исключение; query-only predicate не барьер |
| `index.ts`: resumeInterrupted/retryFailed/selfResume, startTask/startReviewer/resumeTasks/reconcile, tier QUEUE picker | Re-read обеих сторон/causation на recovery; immutable R; intent/external ID при создании host input/session; неизвестное не повторять |
| `index.ts`: finishTasks move/drop/final note | Закрытая O не перезапускается с новым ID/cwd; новая санкционированная O только отдельно; после C final note — passive audit вне A, без prompt/synthetic в A |
| `index.ts`: form/owner-answer/idle/gate/flow notices; `mcp.ts`: touch/makeTools | Общий gate и authority; MCP не создаёт заново tombstone; accepted host effects учтены отдельно от mailbox |
| `tasks.ts`: TaskSession/attempt, `hung-resume.ts` | Хранение ссылки на generation/close verdict; interrupt остаётся отдельным действием, не proof; не менять unrelated landing/settings drift |

Исходные адресуемые cut в базе: watch70–116/166–240; core1111–1215,
1688–1704,1896–2058,2092–2119,3097–3124,3164–3208,3326–3419;
index188–383,538–738,748–878,1011–1035,1376,1766–1930,2035–2161;
mcp23–59. Main проверен по diff и актуальному deliver/poll; номера сдвинуты,
поэтому перед кодом повторно искать функции. Карта — не заявление о чтении
всех несвязанных строк большого index/core.

## Каждый REQ → файл/функция → изменение

| REQ | Путь/функция | Изменение |
|---|---|---|
| 01 | новый `lifecycle.ts`: closeGeneration; core releaseExecutor/startSession; index finishTasks | Монотонный C и отдельный close verdict до handoff |
| 02 | core crew_watch/crew_timer; watch requestWatch | Запрет рабочего persistence closed S |
| 03 | новый lifecycle admitEffect/withEffectGate; index deliver; watch start | Общая DB сериализация C/D и launch |
| 04 | новый scope-broker/recoverScopes, lifecycle recoverIntents | Восстановление reserved O/scope без PID/claim и второго запуска |
| 05 | core/index/mcp cut таблицы выше | Все direct writers/consumers используют authority |
| 06 | новый process-scope/host-effect adapter; index deliver | External receipt/ID/unknown без ложного global success |
| 07 | новый native/scope-win.cc: revokeScope/queryScope | Job handle/nonce вместо kill произвольного PID |
| 08 | native restricted token/ACL + process-scope preflight | Write denied A к B/архивам, независимая B успешна |
| 09 | новый test/crew-lifecycle-evidence.test.mjs; lifecycle audit | Capture и immutable manifest до разрешённого действия |
| 10 | lifecycle effects UNIQUE/recovery; core recoverClaims/postExpected | Stable effectID, повтор close/retry без нового исполнения |
| 11 | lifecycle appendTransition/terminalProof; README | Различимые audit исходы с C/D/S/R/O/proof locator |
| 12 | lifecycle checkAuthority; все cut таблицы | Проверка обоих концов при writer/resolve/claim/D/effect/recovery |
| 13 | core crew_send; index QUEUE/roleTaken | Bound/open-role контракт, legacy quarantine |
| 14 | index host-effect adapter; core inbox/takeReply | Отдельный D после получения payload, учёт внешнего результата |
| 15 | native preflight/createScope; новый test/crew-lifecycle-windows.test.mjs | Заранее заданная L, real OS proof без переопределения входов |
| 16 | broker close/recovery deadline; Windows suite | T=120, успешный close+B против always STOP |
| 17 | README/core HELP/descriptions; новый lifecycle-schema.sql | Согласованный runtime контракт/формат и task current указатели |
| 18 | package/test README + новый test/crew-lifecycle-*.test.mjs | Именованные доказательства и независимый конечный replay |

## DoD: отдельный output каждого AC

Новые suites запускаются `node test/<имя>.test.mjs` из `opencode-plugin/`.
Общий fixture root выделен до импорта; свои S/R/O и свой host, не live service.
Вывод сохраняется отдельно как `AC-NN` с revision/command/exit/output/SHA.
Fixture/driver для fault schedule — новый `test/lifecycle-fixture.mjs`.

| AC | Именованный тест / suite и отдельный oracle |
|---|---|
| 01 | `stale-card-cannot-reopen` / crew-lifecycle: C/generation после restart и stale touch/MCP; B allow |
| 02 | `close-before-admission`, `admission-before-close` / crew-lifecycle-race + windows: ноль D/spawn против учтённой D/terminal; success+B |
| 03 | `writer-surface-deny-allow` / crew-lifecycle-surfaces: по строке writer cut, файлы/host calls A deny и B allow, direct calls тоже |
| 04 | `fault-schedule-recovery` / crew-lifecycle-race + windows: каждый spec crash point отдельно, lost claim/PID-write failure, stable intent/scope, success<=120 |
| 05 | `two-process-per-effect` / crew-lifecycle-race: два реальных Node consumers; deny/allow/race/recovery, <=1 D/выполнение каждого ID, разные IDs одной O проходят |
| 06 | `host-boundary-not-global` / crew-lifecycle-host: актуальная V2 schema fingerprint + изолированный host contour после разрешения; accepted/unknown external => unresolved/global HOLD |
| 07 | `identity-and-stop-errors` / crew-lifecycle-windows: чужой/reused PID, wrong nonce, denied query/kill, timeout, stale exit/done не success; exact scope terminal, B жива |
| 08 | `restricted-writers-and-handles` / crew-lifecycle-windows: A пишет B/scratch/archive/log до/после C => denied/hash unchanged; B canary успешна; handle/ACL evidence |
| 09 | `capture-before-action` / crew-lifecycle-evidence: bytes/SHA/provenance/owner до fixture mutation/отказа; доступный raw сохранён, run1 missing явно |
| 10 | `public-package-privacy` / crew-lifecycle-evidence + secrets/private-name guards: отдельный privacy вывод, не lifecycle proof |
| 11 | `scope-before-user-code` / crew-lifecycle-windows: spawn-before-PID, reparent/detach, PID-write, broker crash/name lifetime; exact scope proof, success<=120+B; independent replay |
| 12 | `ownership-stage-matrix` / crew-lifecycle-surfaces: persisted/claimed/received × A-source/A-recipient/B-only × C/D; S/R/O неизменны, 0 old/1 B |
| 13 | `bound-open-role-legacy` / crew-lifecycle-surfaces: bound A не в B, open live S выбирает B до D, closed S и legacy quarantined |
| 14 | `received-is-not-admitted` / crew-lifecycle-host: receipt<C<D deny; D<C учёт/terminal; внешний unknown не success и не повтор |
| 15 | `raw-derivative-identity` / crew-lifecycle-evidence: первичный rawSHA→derivativeSHA, entries/owner partition равны; bad size/owner подстановка отвергнута, подлинник проходит |
| 16 | `anti-always-stop` / crew-lifecycle-windows + lifecycle-red: заранее записанные T/faults; always-STOP мутант FAIL, исправление success+B; removed-fix probe снова RED |
| 17 | `lifecycle-help-contract` / crew-help + новый crew-lifecycle-docs: README/HELP/tool descriptions/schema version, build/support limits; ссылки current и единственное действующее место |
| 18 | `complete-replay-manifest` / crew-lifecycle-docs и независимый отчёт: RED/GREEN одна проба, все outputs после last edit, targeted/full package, 8 guards, Windows build/probe, independent revision |

`crew-lifecycle-host` fake tests доказывают adapter, НЕ настоящий OpenCode revoke.
Если actual V2 изолированный contour недоступен, его часть AC-06/14 — точный
NOT VERIFIED/unresolved, а не GREEN по fake. Production API mutations требуют
отдельного разрешения, эта С3 их не запрашивала и не выполняла.

## DNC и действующие места — отдельные строки DoD

| Строка | Доказательство после последней правки |
|---|---|
| DNC-01 | `reject-metadata-as-proof` / crew-lifecycle-windows: отрицательные stale done/exit/PID/kill assertions плюс positive exact Job |
| DNC-02 | `preserve-evidence` / crew-lifecycle-evidence: before/after names/bytes/SHA и refs read-only, originals unchanged; новая raw копия не реконструкция missing |
| DNC-03 | `exact-scope-only` / windows: kill/query call inventory ограничен fixture Job; review diff/call log: нет broad kill/delete/reset/stash/force/live API/Phase1 |
| DNC-04 | `independent-B` / surfaces+windows: B succeeds, diff только CrewHarness; Nova не менялась, нет общего process manager |
| DNC-05 | `metadata-allowlist` / evidence: schema/capture разрешают только metadata keys, planted sensitive key не выходит; без чтения реальных env/credentials/transcripts/bodies |
| DNC-06 | `unsupported-overclaim` / host+docs: local GREEN не global GO, always STOP FAIL, L не менялась, limits/external unknown видны |
| Код/runtime schema | P7 `current.md` указывает точные lifecycle/watch/core/index/native/schema функции; independent diff/link check |
| README lifecycle | P6 README presence/turn economy/crew_watch новый текст, P7 current отдельная ссылка; crew-lifecycle-docs |
| HELP/tool descriptions | P6 core HELP/crew_watch/timer/inbox/wait descriptions + crew-help snapshot; P7 current отдельная ссылка |
| Машинный/native формат | P6 lifecycle-schema.sql и native protocol/manifest version рядом с consumer; docs/schema snapshot; P7 current отдельная ссылка |
| Копии | Действующие документы не ссылаются на task как норму; поиск вне doc/tasks, копии помечены; current — указатель, не дубликат правил |

Все evidence сохраняются до любых будущих действий; публично только redacted
производные с manifest связи. README/help и privacy checks не закрывают OS/L.
