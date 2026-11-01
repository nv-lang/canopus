# 277. Состав нового общего кандидата эпика 268

## Полномочие и границы

2026-11-01: прямое слово владельца о завершении всего 268 супер быстро и снятии рабочих HOLD передано действующим интегратором письмом 15:44 со ссылкой на дежурного 15:37; recovery-вход дежурного подтвердил продолжение. Это запись источника, не новая дословная цитата. Малый путь сохраняется. Новых исполнителей, моделей и усилий не назначается.

Собственная ветка сборки — `task/277-common-candidate`; исходный `task/277-chat-epic-acceptance` на `92dec4860f02d8aeda81704d984978930610698b` и его отдельный незакоммиченный ACL memo сохранены. Работа идёт через `git -C` без повторного `session_move`. Helper зарегистрирован `crew_task track`.

**База `782c6eba7419c2a88863bf6caa6aa5cfbf2d8f3a` — старый checkpoint, не новая принятая сборка.** Первый новый docs-only checkpoint — `2fe162c22df94e91f1dd1e0664de58cabfebc5c7`. Его продуктовый source пока совпадает с базой; положительные результаты старых запусков не являются тестами нового общего результата.

Main, живой OpenCode, личные настройки, 8099 и действующий 8100 не изменяются. Обновление 8100 требует отдельного действительного согласия; изготовление кандидата не ждёт этого согласия. Полная OS sandbox не новое требование REQ-19. Здоровые 279/280 не останавливаются и не являются зависимостями.

## Готовые части, уже присутствующие в базе

Здесь фиксируется происхождение кода, а не полное принятие соответствующих требований. SHA исходной сдачи и SHA совмещения различаются; одна ветка целиком не переносится.

| Ребёнок | Точный исходный checkpoint | Точные коммиты общего кандидата | REQ/AC |
|---|---|---|---|
| 269 | `984e1b83a5ec078b5fbbd78e8d11ffaecb8e969e`; словарь `0240df73d1e800f31be09746cc9f1b91c2c1c02d` | `d97f02d90093430d2aa8812d477b89b05471def1` → `d201937521f5854934f9c425dfd416ee55b72775` → `af9790ff43b86e0e3e0cebe478b0e9492e28fab1` | REQ-01..04; AC-01 |
| 270 | `7447a41a765d5197d823179394856d063ef37cfa`; `98f7aa401e30d60a488e1065825c108a4556979e` | `9f3ca1c7145964a92f90b3b4a9eb9e1af5ec6420`; `0fb6d8a1a7687ebe4be9401d292c74c4f1574b16`; совместные assertions `782c6eba7419c2a88863bf6caa6aa5cfbf2d8f3a` | REQ-05..07; AC-02 |
| 271 | `81daedf5314af12e7f96fe5d591d5970c4cda82c` | `981b9e88aa1fb64d9436dde4fe0d966370ab4c1c` и последующие guards 275 | REQ-08..10; AC-03, AC-10 |
| 272 | `5c1ca94eae14ff0a53fdf16d09bc3eed824c0a9e` | `513749f53dcb19f2310c285d948dfbcc2c77024e` → `904650ee4575ae2ccd7c016114d02a0854d5b063` → `73c97b5f3cda582831575a5133bc3375cba3e932` | REQ-11..12; AC-04 |
| 273 | `016f8497ad571af0447c28a639b46fabb4878995` — общий checkpoint, своих последующих code commits нет | существующие voice/stt/recorder в базе | REQ-13..14; AC-05 |
| 274 | `273edd4f151c787b593ad4f56c2e77a795795eb2` | `792552c744e58b755e7dda19e5d59bbffb79464a` → `64dddb5d008b140e33de0368c9af3bf35fe55ff7` | REQ-15..16; AC-06 |
| 275 | `d72605367e39139557d26cb6e558f4f27e0860be`; финальные документы `08ce214782e646e271d75d491854e51f2e353dcb` | `a5bffdd85b349db50f5a7a4a410236ac53e5fbc8` → `02fac7adc494b2e4d669b8224f762277dd15544d` → `aeedeb868538d855429c1786ce0e5238150623ae` → `18fd67ced54082ef3f5e15fd4f5f6d1ba9d8d8d2`; документы теперь `5c07695eb29d57d26c45e44e7a8a7b5f82af523f` | REQ-17..18; AC-07 |
| 276 | `a2920c12350b35ea8fb2142a09157e3dbe6fa567` | `102d55cfbc3b5f3edb66de928df1639a236648d8`; `ae952cf69b212300307f3bc0335eb626f2daebaa`; wrapper `016f8497ad571af0447c28a639b46fabb4878995` | REQ-19..21; AC-08, AC-10 |
| 277 | прежний отрицательный аудит `92dec4860f02d8aeda81704d984978930610698b` | сохранён в `2fe162c22df94e91f1dd1e0664de58cabfebc5c7` без изменения исходной матрицы | REQ-22..24; AC-09, AC-11 |

Все SHA в таблице развёрнуты чтением Git objects. Финальный immutable product manifest и общий SHA ещё **не** объявлены готовыми: последующие узкие исправления не сданы.

Проверенная patch identity: обе code delta 270 уже присутствуют в базе (`git cherry` отмечает их как одинаковые); словарь 269 `0240df73` равен `af9790ff`. Исполнитель 275 отдельно подтвердил совпадение своего контрактного кода с базой; повторный перенос своих четырёх code commits не выполнялся. Документальный delta 275 включён отдельно, а не выдан за проверку нового source.

Frozen ACL `b765a7011adda82b5e30940ccf7bd38a6402b5c0` не включается: это отдельный незавершённый adapter с bootstrap и другими непроверенными границами, не зависимость минимального REQ-19. Его разбор и старые raw не переписываются.

## Реальные остатки до общего SHA

- 269/270: F-02 frontend/backend уже совмещены на `49cf058ba854b1b414bce953797373eb17b6dec1`; общие smoke/replay и реальные captions ещё не проверены. Позднее O-23 о лимитах/смене семьи имеет источник и учитывается отдельно: минимальный converter не доказывает quota/dispatch runtime, а полная hot migration/OS sandbox не добавляются автоматически.
- 270: F-05 Escape/focus и F-06 anchor имеют готовый включённый delta, F-01 violet endpoint также включён; их фактическая браузерная проверка ещё нужна. F-07 cold metadata source разрабатывается отдельно 269/270.
- 271: готовый restricted backend включён как `68a3a9ca8146c752eef8179c78d03d23ec2a765c` с согласованным union; новый общий runtime ещё не проверен. Mock stateless generate не доказывает полный provider E2E. Нельзя разблокировать обычный ACP под видом restricted backend; доступы к реализации/Git/native tools не разрешаются. Обязательный runtime asset включён в kit.
- 276: готовый F-09/F-08 delta включён как `4ae5b811a8bb77d6742049ffb53eb5cfd5dfe23f`; обычный cwd/context/reopen — `data_dir/<session-id>`, stale runtime worktree не используется, проектная папка не меняется. Реальный общий smoke ещё нужен; ранний несданный wrapper WIP не переносился.
- 272/273/274/275: готовые части не означают общий GREEN. Реальные провайдеры, настоящий микрофон/browser SpeechRecognition/все устройства и браузерный pin/restart E2E не становятся проверенными от unit/fixture PASS.
- 277: миграция настроек требует честной карты сохранённого и unresolved; личные файлы не меняются. Полный source/build/web/server/live/guards выполняется только на новом общем кандидате через очередь, не повтор широкого аудита старого SHA.

## Последующие готовые product delta

270 передала signed `97e0dbd4ac9c10c71973e07baccdf88964e3640d`; в общем кандидате он включён как `85eac750c5e2749abc8d246eec69d4bb98875329`. Это семь web файлов: immutable per-turn author snapshot consumer, unknown author fallback, Escape/focus и picker anchor. Два конфликта с уже встроенной 272 разрешены вручную и подтверждены автором 270 письмом 18:39: statusGroup содержит только agentAnchor(familyButton, menu), native approvals остаются перед микрофоном; отдельный modeButton в группу не возвращён. Адресные четыре web test файла — **54/54 PASS**, штатные commit guards **10/10**, watch `1793547505076-395d6l`. Это не общий full и не backend/browser доказательство.

F-07 остаётся предметным отсутствием metadata-only cold catalog source: известный ACP cache после handshake не устанавливает полноту/актуальность до первого чата. По решению интегратора 2026-11-01 18:45 его минимальный hook поручен прежней 269 после F-02, UI-контракт — 270; доказанные mapping/provenance/freshness обязательны, session/new/start ради каталога и выдуманные defaults не допускаются. Этот остаток не блокирует перенос остальных готовых delta. Независимый purple endpoint шкалы исправлен отдельным готовым delta ниже; браузерное подтверждение остаётся за общей проверкой.

Квитанция 269 от 2026-11-01 19:22 уточняет конкретный предел: native mapping по версии 2.2.5 доказан отдельно, но ACP Standalone/XDG context не связан доказанно с personal `/api/model`. Интегратор подтвердил optional exact-bound hook; same-context endpoint/cache неизвестен. Stock `unavailable/same_context_binding_unverified` и pure mapper/freshness PASS не закрывают REQ-05. Personal fetch/новый program start ради маскировки не выполняются; готовый частичный hook рассматривается отдельно от факта готовности cold provider.

Дополнительно включены только готовые signed delta: F-01 `f6d4934406964cb4d7606ff4d927b2ecae1e39a4` → `f10f3a1d38fa398a1c807438bbfa98d3230b3a9d`, F-02 backend `257a9836dde112a7cf3eb1dda9ba4d0374e3df0f` → `49cf058ba854b1b414bce953797373eb17b6dec1`. Backend code применился без конфликтов; в двух документах сохранены только новая F-02 section/три journal записи, ACL/triage ancestors не включены. Watch `1793548879810-zq1ei5`: CSS/theme target **15/15 PASS**, штатные guards **10/10**, signed continue. Это не новый общий server/live/browser GREEN.

Ready source 276 `6f4795d9ca540e15efa26ac7a9d6650118a720fd` включён как `4ae5b811a8bb77d6742049ffb53eb5cfd5dfe23f`, девять explicit server/web/test файлов, без конфликтов кода. Сохранены одновременно F-02 dispatch_family/role setters и новый `@agent_cwd`. Авторский isolated live watch `1793550947601-2kf44i` — **1/1 PASS**, два distinct pre/post-move payload replay после restart; target web `1793549032545-q92sp2` — **59/59**, commit guards **10/10**. Ранний history RED `1793549219077` был неверным oracle по клиентским turn labels, не потерей продуктовой истории; замена проверяет два distinct message texts. Эти результаты не объявляются повторной общей проверкой.

Signed PARTIAL F-07 `f5109236ecf4582a1ae38acab324647801cf29b4` включён как `c761e132d54be5e3201b4cc76ce55b9033c64f2b`, девять файлов, без ACL ancestors. Stock front передаёт None и сообщает unavailable; conditional host hook не является JSON authority или реализацией native observer. Авторский targeted `1793550463482-25235i` — **PASS 3/0**, guards **10/10**; прежний Option-inference CC-FAIL сохранён и устранён обычным typed bounded reader, не toolchain workaround. REQ-05/real cold-ready по-прежнему **не закрыт**. См. [точный контракт](../269-agent-pools/followup-f07-metadata.md).

## Первая интеграционная сборка нового source

До включения 276/PARTIAL F-07 frozen `b9694ddae7c9cf7e344978ceae28cb472ac2ad11` собран собственным runner: watch `1793551183223-r77ndi`, **exit 0, hub/front build PASS**, около четырёх минут. Ни live server, ни provider/native probe не запускались. Artifact attestation и обе конкретные программы сохранены во внешнем приватном каталоге до следующего build; повторная hash-проверка перед архивацией совпала:

```text
65de5a67fc72cb6b986c495bbae51e8bc0db003cc22d50ab8a1a9e483fd5255b  crew-hub.exe
4525b7d3e1ffeaf6b265d7deccdda54b252579498716b1c1eb7dbff0938bdb25  crew-harness.exe
```

Это результат только b9694dda, не будущего общего source freeze с 271/276/F-07. Окончательный build/full/smoke выполняется отдельно на одном новом immutable SHA. Runner не перезаписывает существующий build attestation и сохраняет новые binaries в artifact `built/`.

## Общий Node/web checkpoint: RED сохранён

Watch `1793552640845-3902eh` выполнил signed checkpoint `c427331a2cd9f41f7d947b555ed14d143f92821d` (product tree `73926fa0dcef30cfa7ac047e73fcada8183b03cf`), затем весь Node/web с `test-concurrency=1`: **558 tests, 554 PASS, 4 FAIL, cancelled/skipped/todo 0**, exit 1. Прогон не прерывался. SHA256 полного raw `967b3e88cec1eff8bb8a7d2871af4cf61b2bbd3d264952eb378e9f96323ae350`.

- `src/web/test/list.test.mjs:91,133,157`: actual exact timeline содержит `author` после `user`, прежние expected arrays его не содержат. Передано 270 для сверки F-02 и узкой поправки oracle; порядок и проверка подписи не должны исчезать.
- `src/web/test/workspace.test.mjs:55`: ожидается `/Без проекта/`, actual — новое пояснение о данных сессии и невыбранном проекте. Передано 276 для сверки F-08 без ослабления сохранности draft/source.

Готовая corrective 276 `cd2324bf404046b0436166b3e46101ee0f97d57b` включена как `fc49351f439e9aecde131b1cb9d818395f9602b9`: только `workspace.test.mjs`, положительная проверка session-data и отрицательная «папке проекта», assertions input/images/source branch сохранены. Авторский target watch `1793553217583-ghedtj` — **3/3 PASS**, не новый общий GREEN. По сверке интегратора 2026-11-01 20:13 completed timeline ожидаемо получает author; корректировка должна сохранить также индексы text/work/diff, streaming/cancelled/empty случаи, а не фильтровать author.

До общего freeze нет нового промежуточного full/build (интегратор, письмо 2026-11-01 20:03/20:05). FE partial `b80001893e9c4e67117753db09b34e8c8e533a8c` **не включён**: backend Unix-ms против ISO-only parser и недостаточно строгий source/version schema; ждём signed corrective 270 и signed restricted 271. Ни RED c427, ни build b969 не переносится на будущий source.

После этой остановки получен и проверен готовый corrective 270: `b80001893e9c4e67117753db09b34e8c8e533a8c` + `68e5da4d8a854ad5193d437b6504ce37bf8bdc5c` включены последовательно как `abd511ea83d014d54531179345c3a38811830a6b` и `5cb70f8007ca166eb5487e9ddf34fc69bd1e566c`. F-01 не дублировался; конфликтов не было. Parser соответствует exact `opencode.api.model`/`2.2.5`/`bound_native_snapshot`, safe integer Unix-ms, TTL≤300000 и whole-response отказу schema/duplicate. Anchor — right-aligned с viewport clamp open/search/resize. Три exact completed arrays и индексы text/work/diff изменены совместно; streaming/cancelled/empty tests не удалены. Авторская квитанция 270 от 2026-11-01 20:16: **105/105 target PASS**, guards **10/10**, не общий full/browser. Интегратор подтвердил exact родителей/подписи и включение письмом 20:17. Stock unavailable/неподтверждённая вторая семья остаются видимыми; partial consumer не закрывает REQ-05. До подписи 271 общий freeze не объявлен.

Дополнительное runtime RED→GREEN exact-wire доказательство отделено от 105/105. По независимой сверке интегратора письмом 2026-11-01 20:23 старый parser на `b8000189` реально исполнил assertion с numeric wire и вернул `unavailable/metadata_expiry_missing` вместо `ready`, **exit 1**; это не compile/setup RED. Проверенный SHA256 raw `3cc08e933a0d54ba741e2b11bd6854ad066eb7d46444d77ea6db86122b971eca`. Та же assertion на signed `68e5da4d` поставлена автором в watch `1793553694670-jzy5wk`; результат пока не получен и GREEN заранее не заявляется. 271 на этот момент ещё не подписана: после privacy/index отказа исправляются synthetic fixture literals и выполняются только необходимые targeted/auth/backend/index guards; прежний PASS не переносится на эти новые bytes.

Последующая квитанция автора и независимая сверка интегратора от 2026-11-01 20:24: **exact-wire RED→GREEN доказан**. Старый watch `1793553609863-dx7w0v` — DONE/exit 1; corrective `1793553694670-jzy5wk` — DONE/exit 0, фактически `ready` с exact native IDs/numeric ms. Fixture body и ожидание совпадают, меняется только извлечённый parser snapshot. SHA256 corrective raw `dffe14a7ba89eef5b60e71e7b87ae2b0f3962c3315f3c334d79239ce2059497f` сверён интегратором. Короткий hash старого raw в письме автора был усечён; выше сохранён полный проверенный интегратором hash. После `68e5da4d` source не менялся; full/browser не выполнялись. Wire mismatch закрыт, **partial/stock unavailable/REQ-05 OPEN сохраняется**; ожидание signed 271 отдельно.

## Совмещённый restricted backend и общий freeze

Готовый signed delta 271 `c5e98ef5ed59ff509146101d0181484ebd987ac4` (parent `81daedf5314af12e7f96fe5d591d5970c4cda82c`) включён без ancestors как `68a3a9ca8146c752eef8179c78d03d23ec2a765c`. Авторская квитанция 2026-11-01 20:27 и независимая source сверка интегратора 20:28: host **208/208** и local HTTP fixture→real ACP backend **1/1** после early exact-session DI (`1793552449930-w29wvb`), затем fixture-only URL/auth/backend **1/1**, guards **10/10**, tree/index privacy GREEN (`1793553581389-ehxf4g`). Старые Packaging **18/18 + 5/5**, Node **10/10**, legacy **1/1** относятся к описанным автором более ранним снимкам, не к нашему union. Точные границы — [backend-result](../271-chat-work-modes/backend-result.md).

Пять конфликтных файлов совмещены вручную: `Hub.approval_policy` сохранён вместе с `preparation_fixtures`; ordinary workspace guard остаётся при `!preparation`; оба dispatch-family setter 269 сохранены; `rt.cwd_now` берётся из фактического `config.cwd`; restricted route-sync использует canonical session cwd, ordinary — `@agent_cwd` 276. В kit сохраняются family-approval машины и добавляется обязательный `preparation-agent.mjs`; общий recovery test сохраняет прежнее candidate окно 120000 мс, assertions не удалены. Автор 271 read-only подтвердил exact combined diff 2026-11-01 20:34.

До freeze выявлен отдельный union риск: безусловный ordinary `@agent_env` читал/копировал OpenCode config даже для fixed Node restricted adapter. По согласованию интегратора и автора 271 письмами 2026-11-01 20:34 preparation передаёт пустой **additional** env и вообще не вызывает этот helper; ordinary вызов сохранён. `no_ask`, отсутствие ordinary presets в restricted и root/cwd не менялись. Это **не** очистка inherited process env, **не** OS sandbox и **не** доказательство provider POST. Новый paired oracle в backend scenario проверяет отсутствие config-copy directory до/после Подготовки и её restart, затем наличие после возврата к ordinary ACP. Runner `union`/`live` задаёт только синтетический XDG config и выключает KEEP_PLUGIN: положительный контроль не должен исчезать от внешнего флага, owner config для проверки не используется. Этот новый union ещё требует собственного runtime.

Watch подписи union `1793554687602-15gl6u` — **exit 0**, штатные guards **10/10**, index privacy **21 files**, message guard **1**. Четыре своих verification/docs файла не попали в него. Следующий signed verification checkpoint фиксирует неподвижный общий source вместе с runner/browser/smoke: его exact SHA передаётся в каждую lane, а результаты будут отдельным дополнением. Первая lane — необходимый `union` host/restricted-backend; при RED дальнейшие полные проверки не начинаются. После GREEN — общий build, Node/web, unit (включая front и metadata), live (включая restricted backend), ACP fixtures, harness, migration, package и guards через очередь. Никакие исходные/авторские PASS не заменяют эти запуски. Asset hash и копия `preparation-agent.mjs` входят в новый build attestation вместе с обеими программами.

## Учёт доказательств

Старый `result.md` и `evidence.json` относятся только к `73c97b5f3cda582831575a5133bc3375cba3e932`. Их RED/NOT VERIFIED, три неизвестных server_live исхода и fixture границы не переименовываются в GREEN. Новые exact SHA, watch IDs, raw hashes и итоговая REQ/AC матрица будут отдельным дополнением, не переписыванием старого аудита.

Signed manifest checkpoint `61c3dd3193dcb805baeb106e15316b98c7e3972c` прошёл штатные commit guards 10/10 через machine queue, watch `1793545078463-gj90ln`. Предыдущий watch `1793544657030-6817fx` был RED из-за описательных состояний children, не входивших в закрытый формат. Исправлена форма документа, не ослаблен guard. Это доказательство документального checkpoint, не полного продуктового набора.

Для финального нового source подготовлены отдельные [runner](verify-common.ps1), [smoke](common-smoke.mjs) и [карта миграции](common-migration.md). Runner требует точный чистый HEAD; build записывает candidate/source-tree/binary hashes в приватный attestation. Smoke проверяет этот attestation, создаёт только новую синтетическую среду на отдельном 18179/18180, использует исключительно fixture ACP, проверяет per-turn actual/cwd/question/cancel/restart и останавливает только свои процессы. По контракту 269/270 от 2026-11-01 18:25 проверяется `agent_actual` с canonical `turn == turn_id`, отдельным `dispatch_id`, exact family/model/effort до chunks и replay после restart; сам общий harness пока не исполнялся. Синтаксический JS/PowerShell parse не считается продуктовым PASS.

Новый [narrow browser harness](common-browser.mjs) вызывается внутри того же собственного контура после restart, с новым headless-профилем/портом 19279 либо 19280. Проверяются реальные author captions, anchor/focus на 1024/360, selected-only fill и animations; системный clipboard/микрофон не используются, user prompts не отправляются. Stock unavailable draft должен показывать disabled configured families без выдуманных model rows; slider проверяется отдельно только на собственной session.options fixture-сессии. Purple endpoint проверяется по реально загруженному CSS rule и разрешённой переменной, **не выдаётся за измерение пикселя**: Chromium pseudo computed background может вернуть `none`. PNG сохраняются отдельно для визуальной сверки. Отсутствие browser executable означает явный NOT VERIFIED/FAIL, не API-only UI PASS. Managed voice выключен в синтетическом конфиге; ни новый recognizer, ни OpenCode/provider не запускаются. Browser также завершается через owned exit/port-release helper. Этот harness ещё не исполнялся, его ожидания не подменяют результаты; `node --check` новой версии прошёл, это только синтаксис. Smoke дополнен точным сравнением distinct message texts и их кратности до/после restart, не count двух pwd и не клиентскими turn labels.

Новые smoke artifacts размещаются вне существующих Git-репозиториев; harness отказывается создавать fixture внутри checkout. Это ограничение тестовой среды, чтобы не подменить нейтральный session cwd вложенным каталогом того же source repo, а не новое OS sandbox требование к продукту. Build attestation и приватные результаты остаются в том же новом внешнем каталоге.

### Контроли restart-обвязки

Замечание интегратора 2026-11-01 18:20: прежний новый `stop()` игнорировал exit status taskkill и заменял подтверждение завершения на `pause(500)`, поэтому старый health мог дать ложный restart PASS. До использования smoke это исправлено: [owned lifecycle](common-process.mjs) проверяет результат termination, ждёт exit именно своего ChildProcess и освобождения реального порта; start отдельно отказывается при занятом порте. Failed stop/нет exit/занятый порт — явный FAIL; sleep не увеличивался, global kill не применяется.

Целевые [контроли](common-process.test.mjs), watch `1793546764056-gj7gaq`: **7/7 PASS, exit 0**, без общего product full. Включены три отрицательных сценария, порядок exit → port-free → restart, отсутствие повторного kill уже завершённого процесса, настоящий занятый socket и реальное завершение собственного Node child. Перед запуском ожидалась очередь машины, тяжёлый full другой задачи не прерывался. Это tests собственной обвязки, не положительный результат restart продукта.

```text
38aa97ddde17b610c1583f61541f9cd3236528edf8c265a98b566767e0d69efc  common-process.mjs
31d1dadf04019c89f721f326c5054d58c76d22bf2cca7263deb15f41fbd884cd  common-process.test.mjs
3db6a56daae62a471a75896ce6e3b41f1f35a2d71bcbb1a82a6ff77ed4b66213  1793546764056-gj7gaq.out
```

Будущие полные lanes: build; все Node tests продукта; unit всех затронутых Nova модулей; общий server_live и целевые live модули; весь fixture ACP; converter migration tests; release-kit checks; все guards. Каждый запуск только через очередь, `jobs=1`/`test-concurrency=1`. На неизменённом source базы эти lanes заново не запускались.

`log_line` не принял абсолютный путь зарегистрированного helper: «файл вне папки проекта окна». Отказ передан интегратору; по его разрешению 17:48 existing parent log дополнен через patch ручной документальной записью, с датой слова/источником и без поддельного machine wall-clock. Успех `log_line` не заявляется, `session_move` не повторяется. Этот локальный API-предел не блокирует дальнейшую сборку.
