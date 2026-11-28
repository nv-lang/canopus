Статус: черновик
База: ревизия 26429fa11424f4a5bb0b6a595dc0a95cea6e1601, 2026-10-18
Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть

# План 081: durable fence закрытых сессий

Ветка: `task/081-blokirovka-zakrytyh-sessiy-i-ih-otlozhen`.
Основание: exact утверждённая spec SHA256
`38aa3a2c36ece056435ca348b6b3b72bef5adf82a730d6d6c0035245f180f12e`;
18 REQ / 18 AC / 6 DNC. Полномочие С3 — `fast-path-setup/s3-assignment.md`.
Это план, не реализация, не доказанная feasibility и не разрешение live/admin.
Один будущий исполнитель и одна новая независимая проверка по быстрому пути;
самостоятельно новые сессии не запускать. После этой С3 — отдельные ворота интегратора.

## 1. База и применимость

Read-only main/origin/main на входе: `90253e6c16e1ab620bfed70b20bcac2f12bab03b`.
`watch.ts` между базой и этим main не менялся; дефектный cut request→claim removal→
detached spawn→PID persistence остаётся. В main у `deliver` всё ещё process-local
Set, prompt/synthetic и отдельный final note; это не общий C/D. Проверены также
диффы core/index/mcp/tasks/settings/precheck/package и свежий `test/stable.mjs`.
Изменения main затрагивают acceptance/landing, формы, настройки и тексты: их нельзя
заменять старыми файлами задачи. Подробности — `session-evidence/s3-1/basis.md`.

Перед кодом интегратор даёт актуальную интеграционную базу; исполнитель сверяет
каждый cut из plan-trace по функциям, не по старым номерам строк. Сам эта С3 ветку
не обновляла. На старой базе 121 команда npm, на прочитанном main 128
(cleanup + 127 test scripts). Список полного набора всегда извлекать из package
фактической проверяемой ревизии, не закреплять исторические 120 тестов.

## 2. Выбранный C/D протокол

**Authority:** новая отдельная локальная SQLite `lifecycle.db` под BASE, НЕ база
OpenCode. `lifecycle.ts` использует Node `node:sqlite` / Bun `bun:sqlite` по уже
имеющемуся в core паттерну адаптера. Для записи: `journal_mode=WAL`,
`synchronous=FULL`, foreign keys, ограниченный busy timeout; `BEGIN IMMEDIATE`
сериализует C и admission/launch gates между независимыми процессами. Ошибка
записи не успех. Только локальный NTFS. Файлы mailbox/watch — проекции/transport,
не authority; crash между БД и проекцией лечится outbox, а не новой O.

Новая versioned схема: sessions `(project,sessionID,generation,closedSeq)`;
operations `(operationID,operationGeneration,S,R?,addressing,causation)`;
effects с UNIQUE `(O,effectID)`, kind, immutable scope/external locator,
intent, D-sequence, launch reservation, state и proof; transitions/outbox.
Глобальный возрастающий sequence задаёт порядок C/D. `closedSeq` только NULL→C;
повтор close возвращает тот же C. Card — проекция, `saveCard`/touch/MCP не могут
очистить tombstone. Новое поколение создаётся только явной регистрацией новой
попытки; неизвестная/legacy identity не регистрируется как новая автоматически.

Стабильный effectID задаётся стадией и immutable delivery target, например
`watch.spawn`, `mail.persist:<target>`, `mail.consume:<R>`, `host.input:<R>`.
Разные effects одной O различимы; retry, claim recovery, reconcile и перемещение
проекции сохраняют прежний effectID. Нельзя генерировать ID на каждом retry.
Служебный actor имеет свою identity, но его authority включает исходную causation:
closed S/R в ней не очищаются подписью PLUGIN_SENDER.

Порядок:

1. Writer в транзакции проверяет S и известный R, сохраняет recoverable intent,
   scope descriptor и outbox до рабочего `.req`/mailbox. Отказ — только audit.
   Bound role item фиксирует intended attempt; open-role содержит явный тип и живой S.
2. Claim не выдаёт полномочия. Consumer проверяет обе стороны; open-role выбирает
   R ровно один раз в транзакции до D. Bound A и уже выбранный R=A не retarget-ятся.
   Legacy без семантики/поколения остаётся в quarantine с locator, не исчезает.
3. Admission в `BEGIN IMMEDIATE`: re-read S/R/causation, UNIQUE effect; C<D даёт
   terminal denied, без D и user effect; иначе commit единственного D с intent/scope.
4. Отдельный launch gate снова сериализуется с C. До OS вызова durable
   `launch_reserved` уже записан. В gate re-read C, затем native scoped create/resume;
   C не может вклиниться между этой проверкой и началом user code. Если C успел
   после D, но до gate — никакого запуска, terminal revoked с no-spawn proof.
5. C транзакционно закрывает exact generation и перечисляет все O по S/R/causation,
   включая outbox/claimed/admitted. После commit новые D/launch для неё запрещены.
   Revoke выполняется вне долгой DB-транзакции; success close записывается лишь
   после terminal proof всех effects. Выдача общего старого ресурса B ждёт этого;
   независимая B с другим scope не ждёт legacy unknown.

Для единственного выполнения **не переисполнять** `launch_reserved` после crash:
восстановить exact scope и завершить/отозвать его. Нет scope — доказывать no-spawn
либо уже завершённый fail-stop, а не делать второй spawn. Потеря `.claim` и PID
record ничего не стирает в БД. Crash до durable intent = «не принято», без effect.
Два consumers получают один общий исход UNIQUE-записи, а не два local Set.

Launch reservation коммитится **до** транзакции launch gate и не откатывается
вместе с ней при crash. Broker выполняет native create внутри gate, а не после
его освобождения; повторный broker сначала получает эксклюзивное ownership
(прежний launcher уже не может продолжить), затем восстанавливает reservation.
Session tombstones и нетерминальные intents не удаляются watch retention/GC.

Для локального persistence effect результат и outbox коммитятся вместе. Для
передачи payload/host effect — собственный D и общий gate в адаптере consumer;
удерживать сериализацию до фактического начала вызова, не отдавать reusable permit
stale caller. Не держать lock во время длительного процесса. Accepted-but-unknown
host call не replay-ить: locator/absence external ID и unresolved. БД+OS+host не
объявляются общей транзакцией. Уже полученный текст из памяти не отзывается.

## 3. Windows primitive и обязательная ранняя проверка

Выбор: небольшой native Node-API модуль `native/scope-win.cc` и отдельный Node>=24
broker `scope-broker.mjs`, переживающий reload плагина. Он исполняет только новые
контролируемые watch/timer scopes, не становится общим process manager.
Плагин/MCP общаются по локальному authenticated named pipe; broker и DB недоступны
write-restricted child. Эксклюзивный Win32 named mutex по canonical store identity
даёт одному broker право создавать scopes; abandoned ownership требует recovery
до приёма новых запусков. Не TTL lease, не PID-file lock. DB gates остаются общими
для MCP/plugin/broker; ответ pipe не является самостоятельным launch permit.

До user code: durable intent с random nonce/name Job и restricted SID; затем Job
с `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, без обоих BREAKAWAY flags; restricted primary
token `CreateRestrictedToken(WRITE_RESTRICTED | DISABLE_MAX_PRIVILEGE)`; создание
Git Bash через `CreateProcessAsUserW`, `STARTUPINFOEX` +
`PROC_THREAD_ATTRIBUTE_JOB_LIST` + `CREATE_SUSPENDED`, затем ResumeThread в gate.
Не вариант spawn→AssignProcessToJobObject. Наследование handles — только явный
`HANDLE_LIST` scoped stdin/out/err, без DB/pipe/job/B/archive handles. Child и
обычные detached/reparented descendants остаются в Job; PID — диагностическое поле.

У A/B разные restricting SID и отдельные writable NTFS roots. DACL scoped root
разрешает запись только соответствующему restricted SID вместе с обычной user
проверкой; B, архивы и authority не дают A write/WRITE_DAC/WRITE_OWNER/delete-child.
Бинарники читаются, TMP/HOME/output — только свой scope. Проверяются canonical
volume/file identity, отсутствие reparse/alias и чужих унаследованных handles.
Один cwd, случайное имя каталога или Job без token/DACL — не изоляция. Исходные
legacy файлы и их ACL этим планом автоматически не меняются.

Recovery: broker с прежней DB identity открывает **прежнее** имя Job, проверяет
nonce/ownership, отзывает через TerminateJobObject, наблюдает accounting active=0
и удерживаемые process handles до termination; IOCP — подсказка, не единственный
proof. Перед последним CloseHandle сохраняет terminal proof. При crash broker
last-handle close даёт fail-stop. По документации Job уничтожается после закрытия
последнего handle и прекращения процессов; recovery без Job допустим только с
доказанной цепочкой unique name→reserved launch→no-other-creator→last-handle lifetime.
Доступ denied не трактуется как not found. **Доступность имени на всём интервале
termination/его исчезновение и этот inference обязательно проверить реальным
fault probe**; при провале — технический возврат, не no-PID proof и не повтор spawn.

Поставка после утверждения новой зависимости: исходник и `native/build.ps1`
(MSVC Build Tools + Windows SDK, Node-API headers фиксированной версии/digest),
выход `.node` вне tracked source, manifest ABI/arch/SHA и проверка загрузки broker.
Без elevated service, account/password, runtime download или fallback taskkill.
Нужна проверка restricted-token launch без admin: документация освобождает
restricted copy caller token от assign-primary-token privilege, но не доказывает
все нужные права/работоспособность Git Bash на этой машине. Наличие toolchain и
бинарника сейчас **не проверялось**. Linux guards не заменяют Windows build/probe.

**T=120 s** фиксируется до проб. Часы — monotonic QPC в broker; сумма интервалов
активной работы от принятия close либо восстановления healthy broker после
последнего fault до terminal success, downtime отдельно. Ожидание machine slot
не входит в путь отзыва. Целевой внутренний бюджет: recovery/inventory 20 s,
scope revoke/exit 80 s, durable proof/ответ 20 s; это проверяемый deadline, не
измеренный результат и не математическая гарантия планировщика Windows.
Не вводить задним числом лимит числа потомков или новую исключённую категорию L.
Каждый обязательный L fault заканчивается success<=T и положительной B;
таймаут/вечный retry/always STOP — FAIL реализации. Произвольная fair scheduling
сама по себе не доказывает численную границу: достижимость бюджета — открытый
platform proof, не закрытое планом утверждение.

## 4. Последовательность одного исполнителя

Все пункты последовательны; никаких параллельных агентов. Нужны отдельное
разрешение кода, актуальная база интегратора, изолированный temp NTFS, Node>=24,
Git Bash, native toolchain. Реальные Nova-сессии не тестовые фикстуры.

| Шаг | Предшественник; область | Проверяемый результат |
|---|---|---|
| P0 | Ворота; база/окружение | Сверка drift, manifest версии/файлов/прав/тома без env dump; authority paths только fixture; без тестовых запусков |
| P1 | P0; новый `test/crew-lifecycle-red.test.mjs` | **Первая проба до кода:** A открыта, queued watch пишет канарейку, releaseExecutor/reassign закрывает A до poll, затем poll. На базе probe FAIL именно по old write; парная B выполняется. Сохранить revision/command/exit/raw hash; без live данных. Затем полный baseline suite по очереди, всё ещё до продуктовых правок |
| P2 | P1; новые native/broker/store fixtures | Минимальный primitive prototype + Windows build/probe: create-in-job, token/DACL, crash-before-PID/claim-loss/PID-write, two consumers, broker crash, name lifetime, потомки, B и T. Если L не достигается — остановка с точной причиной до широкой переделки writers; не урезать L |
| P3 | P2; новые `lifecycle.ts`, `lifecycle-schema.sql`, `process-scope.ts`, native/broker | Versioned schema, generations/C/D/outbox/proof, interprocess UNIQUE/gates/recovery; `crew-lifecycle.test.mjs`, `crew-lifecycle-race.test.mjs` GREEN |
| P4 | P3; watch/core/index/mcp/tasks | Все cut в plan-trace переведены на authority; transport projections восстанавливаются; lifecycle/handoff не success до proofs; исходная RED-проба GREEN. Ни один старый effect не перенесён в B |
| P5 | P4; tests + package/test README | Матрица AC/DNC ниже, targeted, полный набор package и полный guards CI после последней правки. Падение параллельного файла перепроверить отдельно, сохранить оба результата |
| P6 | P5; README/core HELP/descriptions/schema | Действующий lifecycle/границы/новая поставка на своих местах; help snapshot и ссылки GREEN. Повторить затронутое/full/guards после последних правок, если они меняют проверяемый пакет |
| P7 | P6; task current/result и evidence | `current.md` создаёт первый перенос результата: указатели на код/schema; отдельными строками дописать README, HELP/tool descriptions, native contract. `result.md` и 18 AC outputs с exact revision, missing/unresolved без сокрытия |
| P8 | P7; новая независимая проверка | Один проверяющий сам replay-ит RED на базе/GREEN на конечной ревизии, реальные Windows faults/T/B, все AC/DNC и полный suite/guards; это не авторский вывод и не старый CI. Интегратор затем свежий интеграционный пакет и отдельное «пушь» |

Тяжёлые build/probes/targeted/full/guards — только через machine queue;
отзыв scope не ждёт её. Из `opencode-plugin/`: targeted команды из spec446–457
плюс новые именованные suites в plan-trace. Полный текущий `npm test` обязателен;
для разрешённого параллельного прохода свежего main использовать
`node test/stable.mjs --all --runs 1 --jobs 4` (не default 8), с итогом каждого
файла и отдельным replay упавших. При нескольких прогонах общий лимит 4, при
нагрузке владельца — по одному с паузой 15 s. Новые suites подключить в package
`test`; Windows probe отдельный обязательный вывод, на Windows не silent skip.
Полный baseline/финальный npm можно выполнить последовательно, параллельный
runner не подменяет состав package и учёт пропусков.

Отдельный полный guards CI — восемь проверок из `.github/workflows/guards.yml`:
dash syntax, `run-all.sh --ci`, `guard-secrets.py --tree`, `check-wiring.py`,
commit-range→`guard-commit-message.py --ci`, selftests, prove-red, probe-empty-root;
плюс `ci-mask.sh CREW_PRIVATE_NAMES` без чтения значения. Exact команды spec467–491,
range реального пакета интегратора. До коммитов range-check NOT APPLICABLE, не PASS;
до публикации обязателен. Нет имеющегося TS typecheck/build script: не выдумывать
его; native build обязателен отдельно. Уровни A/B/C/E/F/G обязательны, UI D N/A.

## 5. Требует утверждения до реализации

1. Этот технический маршрут и новая security/dependency поверхность: отдельная
   lifecycle SQLite, native Node-API модуль, Node broker, MSVC/SDK поставка,
   restricted token/DACL, protocol/schema v1. Старые items не backfill-ятся
   выдуманной identity; quarantine и явный upgrade barrier для stale версий.
   Только контролируемые участники нового протокола входят в локальную гарантию;
   старый процесс, который ещё напрямую пишет transport, требует отдельного fence.
2. Разрешение одному исполнителю выполнить P0–P8 в пределах его части, включая
   изолированные процессы/Windows probes. Рекомендация: сначала P1/P2 с жёстким
   возвратом при FAIL L, не начинать широкую интеграцию на одном тексте Win32 API.
3. В-01 остаётся без ответа: global HOLD при независимых clients/legacy. В-02
   остаётся без ответа: никаких адресных live/admin mutations до отдельного
   разрешения и независимо проверенного capture→identity→revoke→exit-proof.

Изменение spec этим планом не требуется и не выполнено. Реализуемость комбинации
L, restricted launch/handles, recovery Job-name proof и T пока NOT VERIFIED;
это точные инженерные остатки 081 для P2/независимого replay, не новые исключения
L и не выполненные гарантии. При невозможности — возврат владельцу через
интегратора, без реализации «всегда STOP» и без самовольной правки требований.

## 6. Интерфейс Nova и граница результата

Выдаваемый versioned отчёт, **не существующий сейчас admin API**:
`{scope,S,R?,O/effectID[],C,D[],terminal,proofLocators,externalIDs,unresolved[],
beforeManifestSHA,afterManifestSHA,localVerdict,globalVerdict}`.
Публичная производная редактируется по allowlist; raw/provenance/bytes/SHA —
в отдельном разрешённом хранилище. Missing run1 и исторические ошибки остаются.
Local GREEN новых операций не выдаёт полномочий legacy A и не снимает HOLD.

Nova100/094: exact old session `ses_mvawdsam690xeqwzpp`, отдельно от replacement
и шести его watches. До Phase1 нужны durable адресный fence этой legacy identity,
independent before/after+negative old-wake oracle, принятый immutable v11
allowlist/redaction и отдельный GO Nova/владельца. «Отделить при fence» меняет
порядок, не выдаёт admin/release/build полномочие этой сессии.

Orphan001: exact worker/reviewer из `fast-path-setup/nova-scope-input.md` —
отдельный отчёт/scope; cancel Nova102 сейчас не каскадирует в child001.
Нужного cross-project administrative enumerate/fence/terminal-close интерфейса
нет; его реализация не прячется в эту spec. Не восстанавливать отдельный проект,
не менять JSON/card/force-role, не будить старых worker/reviewer. Их evidence,
ветка/дерево сохранены, HOLD не снят. Разрешение этой С3 не разрешает этот admin.
