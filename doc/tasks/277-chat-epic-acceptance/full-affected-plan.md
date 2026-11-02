# 277. Полный затронутый набор после fixture correctives

## Статус и точный source

План подготовлен, **не исполнен**. Основание: интегратор, письма 2026-11-02 00:30/00:37: отдельный explicit freeze, затем явное согласование полного набора; до ответа новых full/build/smoke запусков нет. Это не новое задание и не общий acceptance.

Product/test source freeze — signed `26098a9fa8d80a8d8f8df947d48c9555ddd78023`, `src` tree `a83821e3f263db765596b6a37bf9b31df7c2384a`. Следующий verification checkpoint меняет только этот план, [manifest](common-candidate-manifest.md) и [runner](verify-common.ps1). Его exact signed HEAD будет записан во внешний execution manifest и передан **каждой** команде как `-Candidate`; новый source tree обязан совпасть с указанным. Подстановка нового SHA в старый raw запрещена.

Runner исправляет доказанный archive defect: dot-source `setup-env.ps1` присваивает `$root` в scope вызывающего скрипта. Корень checkout теперь `$repoRoot`; archived binaries и restricted asset копируются именно из него, их hashes сверяются с origin до записи нового attestation. Старые origin binaries/attestations не переписываются и не используются как новый build. Синтаксический parse и проверка коллизии переменных — только проверка обвязки, не результат build.

## Общие условия

- Все тяжёлые команды — `crew_watch(machine:true)`, одна lane за раз; у 277 один слот, у 281 не больше двух, у Canopus не больше одного; суммарно не больше четырёх. `--jobs 1` / `--test-concurrency=1`.
- Внешний новый каталог артефактов, вне Git checkout. Отдельные полные stdout/stderr, exit, JSON results, exact argv/environment, SHA256 каждого raw/runner/input; прежние файлы не перезаписывать.
- До и после lane — exact clean HEAD. Во время исполнения source не меняется. Любой compiler/runtime/guard/setup RED сохраняется как факт, здоровая lane заканчивается естественно, следующие lanes не стартуют до разбора. Отсутствие ожидаемого модуля/case — UNKNOWN, не PASS.
- Nova/Clang используют отдельный ASCII TEMP по lane. Все fixture runtime lanes используют только синтетический XDG config, `CREW_OPENCODE_KEEP_PLUGIN` выключен, `CREW_REAL_ACP` не равен `1`. Прежний native once-probe 271 не повторяется.
- Main, owner settings/credentials, службы, 8099/8100, исходный аудит/ACL memo и контур 18177 не трогаются. Owned smoke — только 18179 либо 18180, browser — отдельный headless-профиль, без системного микрофона/clipboard и без provider prompts.

## Последовательность для согласования

Все команды lane имеют общую форму (не запускать до явного ответа интегратора):

```powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -File doc/tasks/277-chat-epic-acceptance/verify-common.ps1 -Candidate <exact-verification-sha> -NovaHome <oracle-dir> -Artifacts <new-artifacts> -Lane <lane>
```

| Порядок | Lane | Полный состав и граница доказательства |
|---|---|---|
| 1 | `web` | Все `src/**/*.test.mjs`, frozen discovery сейчас 54 файла; включает web и Node ACP/adapter fixtures. Не только прежние 17 targeted cases. Node fixtures не становятся real provider E2E. |
| 2 | `oracles` | `src/request_oracle_tests`, `src/chat_delivery_fixture_tests`: типизированные numeric/trace/range negatives, исходный request и chat, raw reminder replacement/changed/empty consumer. Заново на общем verification SHA, не перенос 3/3 с другого commit. |
| 3 | `server-live` | Весь `src/server_live`, семь test files в одном declared module. Это ранняя проверка прежнего 24/38 RED после новых fixture inputs. Никакой подмены aggregate результатами выборки. Known `scenario_preset` форма с trailing spread не исправлена и не waived; её исход фиксируется естественно. |
| 4 | `unit` | Десять каталогов ниже: 54 source test files, 12 declared modules; server/front/config/ACP/project/storage и agent/pool/metadata/machines. Прежние 460 не переносятся. |
| 5 | `live` | Все четырнадцать дополнительных file-store live каталогов ниже, не дублируя `server-live`. Включает restricted config-copy absence/restart и ordinary presence positive control на синтетическом XDG. |
| 6 | `acp` | Весь `src/acp_live`, шесть файлов одного module; только fake fixtures. `real_agent_test` печатает skip при выключенном флаге — это явный непроверенный native case, не native PASS. |
| 7 | `harness` | `common-process.test.mjs`: negative stop/exit/port checks собственной обвязки. Не restart PASS продукта. |
| 8 | `migration` | `python scripts/test-convert-model-presets.py`, плюс config/storage migration tests в unit. Не доказательство эквивалентной миграции всех token windows/O-23. Личные файлы не читаются/не мигрируют. |
| 9 | `build` | Заново обе программы, restricted `preparation-agent.mjs`, новый immutable `build-attestation.json`: exact candidate/src/machines/lock/toolchain/verifier и hashes двух binaries/asset; архивная копия сверена. |
| 10 | `package` | Два package/release-kit selftest, `scripts/package-release.sh <new-kit>`; входные binaries/asset обязаны совпасть с новым attestation. Не упаковка старых origin binaries. |
| 11 | `guards` | Весь `scripts/guards/run-all.sh`; все commit/manifest privacy и ссылочные проверки отдельно от runtime. |
| 12 | owned smoke/browser | `node common-smoke.mjs <exact-verification-sha> <new-artifacts> 18179 <browser-executable>` из папки задачи. Реальные собственные hub/front/Git/HTTP/WS, **fake ACP only**. Actual/cwd/question/cancel/restart, exact history multiplicity и browser narrow controls. Отсутствующий browser — NOT VERIFIED/FAIL, не API-only UI PASS. |

После RED одной lane оставшийся набор отмечается **не выполнен**, а не отменяет доказанный RED. Очерёдность выносит известный серверный риск до длинного build/остального live. `union` остаётся доступной диагностической lane, но в этот полный план отдельно не входит: её server unit и restricted backend покрываются lanes 4/5 на одном freeze без лишнего повторения.

### Unit: точный список

```text
src/config
src/acp
src/server
src/server/front
src/projects
src/storage
src/agent_pool_tests
src/family_approval_tests
src/model_metadata_tests
src/product_machines
```

### File-store live: точный список после server-live

```text
src/agent_pool_live_tests
src/server_preparation_live
src/server_preparation_backend_live
src/server_projectless_live
src/server_workspace_live
src/server_delivery_live
src/server_hidden_wait
src/server_crew_live
src/server_ext_live
src/server_loading_live
src/server_result_repo_live
src/server_route_live
src/server_wip_live
src/server_wip_slow_live
```

Последние семь consumers раньше отсутствовали в общем runner; теперь явно включены, поскольку импортируют общий server kit либо его route fixtures. Название каталога не заменяет declared module/result ID: состав module и индивидуальные outcomes снимаются из нового runtime, не угадываются по имени файла.

## Reuse и оставшиеся решения

**Никакого автоматического reuse прежних runtime PASS.** Изменены `testkit.nv`, `request_kit.nv`, fake agent и callers. На новом freeze повторяются даже ранее зелёные unit/live/ACP/oracles. Старые web 17/17, numeric 3/3, chat 3/3 — отдельные historical targeted доказательства, не новые full lanes. Новый docs/verifier checkpoint может иметь тот же `src` tree, но это не основание переименовать прошлый raw.

Исходные full Node/web 574/576 RED, server_live 24/38 RED (14 FAIL; именованные raw 14 PASS/11 FAIL/13 UNKNOWN), diagnostic 0/2 RED и первый chat 2/3 RED остаются неизменными. Новый targeted layer 3/3 не переписывает их.

Следующие границы требуют явного решения интегратора в плане, не молчаливого исключения:

1. `src/server_pg` тоже импортирует изменённый kit и использует прежние raw delivery constructors. Ему нужна отдельная test PostgreSQL среда. Сейчас изолированный PG endpoint не подтверждён; owner credentials/живой PG не разрешены. Lane **NOT VERIFIED**, не включать вслепую и не считать весь affected набор GREEN при её отсутствии. Аналогичный `scenario_preset` fixture не правится «заодно».
2. Три старых независимых audit probes (`app-boundary`, `agent-contract`, `requirements-gaps`) сохранены как артефакты прежнего отрицательного аудита. В них встречаются прежние контракты `agent_selected` без turn-bound `agent_actual` и picker unavailable; они требуют semantic review, а не слепого переноса как актуальный product oracle. В lane `harness` включён только новый lifecycle test; старый аудит не waived и его REQ-остатки остаются видимыми.
3. REQ-05 same-context/multi-family, quota runtime/O-23, token-window migration equivalence и реальные device/provider проверки не доказываются этими fixtures. Не открывать provider/device/credentials ради зелёного счётчика.

План и новый runner подготовлены; явный ответ о verification freeze/составе нужен **до** запуска первой полной lane.

## Решение интегратора 2026-11-02 (после brief 268-existing-integrator-recovery-brief.json)

1. **Verification freeze:** exact verification SHA = `5b13ff8bf33bf0398fa97b41ded077a3a57f378b` (signed HEAD общего кандидата; последний коммит меняет только `src/acp_live/client_test.nv` — уже разрешённую owner corrective). Его `src` tree передаётся каждой lane как `-Candidate`; подстановка нового SHA в старый raw по-прежнему запрещена, старые raw 26098a9f/e992c591 не переименовываются. Product source вне одного test-файла не менялся относительно freeze плана.
2. **Бюджет (точная сверка, артефакт 277-native-budget-original-reconcile-0632.json):** исходный T = 60–100 мин, 2T = 200 мин. Реконструированный native расход = 511.0 мин после известных wait-вырезаний (исключает async jobs и root-очереди; не монетарный счётчик). Даже при самом благоприятном прочтении остаток отрицательный (~−311 мин к 2T). Дополнительные 120 минут были только общим будущим бюджетом 281, на 277 не распространяются. Письмо интегратора 18:48 с «T60–90/2T180/≈120+» ошибочно и этим решением исправляется.
3. **Следствие:** ни одна heavy/full lane этого плана без нового слова владельца не запускается. Независимые дешёвые шаги (bookkeeping receipts, 282 source/transport сверка существующим исполнителем) не блокируются.
4. **Оставшееся решение для владельца:** либо (а) доп. бюджет на полный affected набор (12 lanes), либо (б) узкая минимальная lane по выбору владельца с точным расчётом. До ответа freeze действует, новых запусков нет.
