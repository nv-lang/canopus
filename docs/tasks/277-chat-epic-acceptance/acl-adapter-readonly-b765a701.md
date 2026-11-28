# 277. Предварительный read-only разбор Windows ACL adapter

## Вывод

**Материала достаточно для отдельного решения о следующем ограниченном инженерном этапе, но недостаточно для признания adapter готовым к интеграции или эксплуатации.** Production bootstrap и получение доказанного caller context не реализованы. Найдено одно статически доказуемое расхождение строгого JSON-протокола и дополнительный условно серьёзный риск process-tree containment в поставленном исходнике зависимости. Последний не объявляется доказанным дефектом выполненного бинарника.

Это технический разбор прежней сессией семьи Codex, не новая формальная независимая приёмка и не общая приёмка эпика. Межсемейная независимость не заявляется. Старый отрицательный аудит `92dec4860f02d8aeda81704d984978930610698b` не изменён; его FAIL/NOT VERIFIED, F-09 и три UNKNOWN полного server_live не закрыты.

## Полномочие, кандидат и способ

- Источник разрешения: интегратор, 2026-11-01, письмо 11:16; переданное им решение дежурного Codex по поручению владельца, question «Следующий шаг adapter», выбор «Разбор 277 (Recommended)». Это не новая цитата владельца.
- Начало подтверждено письмом 11:17, предельный срок 12:17, без автопродления. Разрешены чтение, git show/status/hash, обычное хеширование и только этот отдельный отчёт в своей папке задачи.
- Фиксированный кандидат: `b765a7011adda82b5e30940ccf7bd38a6402b5c0`. Читалось frozen дерево исполнителя, не старый source своего HEAD. HEAD и чистый status проверены перед чтением; повторная сверка приведена в завершении.
- Проверены все 18 записей `doc/tasks/269-agent-pools/acl-functional-snapshot.sha256`: фактические SHA256 совпали. Хеш самого списка: `c8532edbf9411f94aa31a57bd760b4583252db3918b2c7a2dcf933da0ff5f50e`.
- Прочитаны adapter/transport, policy/fixture/runtime/hostile/unit/capability tests, packaging/kit guard/selftests, `result.md`, `acl-adapter-stage.md`, исходный и финальный raw evidence. Дополнительно только чтением прослежена реализация process API в поставленной std/runtime.
- Проверяемый код не выполнялся. Новых compiler/runtime/test/guard прогонов, dot-source, ACL/FS fixtures, изменения ACL, веток/деревьев, модели/усилия и новых агентов не было. Старые raw не менялись. Живой контур, main, 8100, production и личные настройки не затронуты.

Все ссылки на source ниже обозначают **путь и строки указанного кандидата**, если прямо не сказано «поставленная зависимость». Они не обозначают файлы старого source дерева 277. Локальные пути и приватные proof/nonce остаются вне этого документа.

## Доказанный дефект

### RO-01 — Medium: tokenizer принимает не-JSON whitespace

**Категория:** доказуемое по source расхождение протокола; runtime-воспроизведение в этом разборе не разрешалось и не выполнено.

**Source:** `scripts/windows-acl-adapter.ps1:13–61`, особенно строки 21, 26, 39, 42, 53, 60; `scripts/test-windows-acl-policy.ps1:21–34`. Заявленный контракт: fixed flat-JSON v1 в `doc/tasks/269-agent-pools/acl-adapter-stage.md:24` и отказ malformed JSON.

**Цепочка:**

1. Внешний кадр декодируется строгим UTF-8, затем передаётся `Read-CHARequest` (`windows-acl-adapter.ps1:227–229`).
2. Tokenizer пропускает любой `[char]::IsWhiteSpace`, а не только разрешённые JSON байты SP/HT/LF/CR. Например, U+000B (VT), U+000C (FF) и U+00A0 (NBSP) относятся к .NET whitespace, но не к whitespace JSON.
3. Следующий корректный объект разбирается своим tokenizer. `ConvertFrom-Json` получает лишь отдельно заново обёрнутые key/value tokens; исходный полный кадр ему не передаётся. Поэтому лишний VT до `{` не будет отвергнут другим JSON parser.
4. Достаточный статический контрпример: байт `0x0B`, затем ASCII `{"v":1,"request_id":"x","op":"inspect_root","root":"C:/work/private"}`. Parser возвращает request, хотя исходный кадр не JSON. Операция затем зависит от реального состояния root; её успешное выполнение здесь **не** утверждается.

**Нарушение:** отказ невалидному JSON до операций с FS. Наличие 81 policy PASS не закрывает этот класс: negative list не содержит таких whitespace.

**Предел влияния:** это не доказательство обхода ACL, command injection или запуска произвольного executable. `invoke` сериализует нормальный JSON сам; расхождение непосредственно относится к raw byte `exchange`/script parser. Severity Medium относится к заявленной строгости security-протокола, не к доказанному повышению привилегий.

**Предмет следующего исправления, не выполнено:** ограничить whitespace JSON-набором и добавить независимые отрицательные контроли для VT/FF/NBSP снаружи строк. Обычные строковые данные и допустимые JSON whitespace должны остаться допустимыми.

## Подозрение / условный риск зависимости

### RO-02 — High при подтверждении бинарной связи: окно до Windows Job Object

**Категория:** окно доказано в прочитанном поставленном source зависимости; принадлежность именно этой реализации выполненному runtime archive и фактический escaping descendant **NOT VERIFIED**. Это не доказанный runtime-дефект кандидата.

**Source кандидата:** `src/windows_acl/transport.nv:60,75–95`, `src/windows_acl/transport_hostile_test.nv:44–53,73–75`, `scripts/tests/windows-acl-hostile.ps1:37–47`.

**Source поставленной зависимости:** `std/src/os/proc.nv:411–426` → `std/src/os/proc_ffi.nv:20` → `nova_rt/process.c:653–665,727–756`. Последний файл SHA256 `e5fab8a262bd87dc2aca76c2f83b55f80a61ee8c619905ceeb136cf090d845fa`. Дополнительно прочитан `nova_rt/libuv/src/win/process.c:1032–1105`.

**Цепочка:**

1. Adapter просит `Command.tree(Tree.Group)` и полагается на cleanup std/runtime при deadline/cancellation.
2. В поставленном `process.c` обычный Child запускается через `uv_spawn`, затем вызывается `_pc_make_job` с `AssignProcessToJobObject`. Комментарий `process.c:653–656` прямо признаёт гонку и отсутствие suspended-create/assign/resume в этом пути.
3. В прочитанном libuv `CREATE_SUSPENDED` выставляется только для `UV_PROCESS_DETACHED`. Windows-путь `_pc_spawn_on_loop` для обычного Group этого флага не устанавливает. Присоединение к глобальному libuv job также не делает позднее присоединение к отдельному child job атомарным.
4. Если рано исполняющийся child успевает создать descendant до присоединения к отдельному job, уже созданный descendant может не войти в этот job. Завершение отдельного job тогда не является blanket-доказательством завершения всех потомков.
5. Текущий hostile helper создаёт descendant лишь после старта PowerShell, исполнения скрипта, записи identity и чтения hash. Это осмысленная проверка обычного позднего descendant, но не отрицательный контроль окна до Assign.

**Требование под риском:** отсутствие переживших отмену/timeout собственных процессов. Зафиксированный PASS завершения конкретных parent+child не отменяется; он не обобщается на все расписания старта.

**Что не доказано:** source↔linked runtime correspondence, достижимость гонки у данного pinned production script, реальный оставшийся процесс и эксплуатация. Production script вообще не создаёт descendants явно. Источник зависимости и собственный compiler/runtime не правились; иных API, обхода или новых прогонов не предлагалось как уже разрешённых.

**Следующее решение:** отдельно установить контракт/происхождение реального process runtime и достаточность его tree containment. Исправление чужого репозитория или эксперимент требует отдельного полномочия; этот разбор его не даёт.

## Критический незакрытый предусловный контракт, не новая находка

### RO-03 — Blocker для интеграции: bootstrap не является validator/proof

**Source:** `src/windows_acl/adapter.nv:19–33,121–137`; `src/windows_acl/transport.nv:45–61`; `src/windows_acl_runtime_tests/transport_test.nv:14–25,29–53`; fixture setup `scripts/test-windows-acl-fixture.ps1:26–61,74–83` и `scripts/test-windows-acl-runtime.ps1:21–54`.

- `AclTrust` имеет закрытое представление, но `AclSetupEvidence` экспортирован и конструктивен. Экспортированная `acl_trust_from_verified_setup(Some(evidence), ...)` проверяет форму идентификатора/digest, физические пути и pins; она **не** устанавливает происхождение caller и не сравнивает `private_acl_sha256` с актуальной ACL.
- Полный 64-символьный произвольный ACL digest не становится доказательством read-back; tests проверяют отсутствующий digest, а не аутентификацию хорошо оформленной лжи. `powershell_sha256` тоже передаёт caller; wrapper сверяет bytes с ним, а не сам добывает доверенный OS pin.
- Следовательно, private type сам по себе не является невыдаваемым security capability. Без уже доверенного caller можно описать другой absolute Windows-like root/executable и его собственный hash. Это объясняет обязательность предусловия, но **не** runtime-доказательство произвольного запуска: такой fixture не создавался и не исполнялся.
- Текущий положительный hand-off имеет другой статус: доверенный тестовый установщик сам создаёт новые private каталоги, проверяет owner/DACL/ancestry, copy/read-back/hash файлов, известное OS-расположение executable и Valid Authenticode. Дальнейший тест получает его JSON через test-only env. Это контролируемый fixture, не production acquisition.
- Повторная native проверка pins непосредственно перед spawn полезна для identity, но не чинит отсутствующий источник доверия. Не заявляется защита от same-user/admin path replacement races. Не следует расширять эту оговорку до произвольного недоверенного writable install-root.

Это ограничение честно указано в исходниках и итоговом результате автора. **Ложного утверждения о готовом production bootstrap в итоговых разделах не обнаружено.** Интеграция F-09 до решения этого контракта была бы неподтверждённым расширением границы; статический read-only разбор её не разрешает.

## Проверенные свойства и точные пределы evidence

### Публичный API, pins, байты и typed binding

- `AclTrust.exchange` принимает сырые bytes, ограничивает input 32768 до spawn, повторяет trust checks и строит фиксированный argv `-NoLogo -NoProfile -NonInteractive -File <asset>`. В публичный production API не добавлены Command, executable, script или test-pin override. Private `run_acl_process` используется peer tests, не экспортируется (`transport.nv:48–67`). Возможность caller-конструкции evidence оговорена в RO-03.
- `env_clear`, ровно явные SystemRoot/WINDIR/PSModulePath, cwd доверенного asset-root и три pipe заданы явно (`transport.nv:53–60`). Это не проверка будущего ACP/cwd/env dispatch: Hub к adapter не подключён.
- SHA256 fixed script `eafb8728e9b33dbe7d7c80f98527c0fb8afae24e60de92e7ef3e3068b36d344e` совпадает у файла, native constant и manifest; версия/policy manifest проверяются до исполнения (`adapter.nv:103–137`).
- Capture читает порциями 1024, проверяет предел до append, сохраняет байты до UTF-8 conversion и сравнивает round-trip. ASCII S/E framing имеет закрытый набор ошибок; payload cap не расширен служебным байтом (`transport.nv:12–42`). Это source-аргумент, не измерение суммарной памяти runtime/OS.
- `exchange` намеренно может вернуть захваченный nonzero status. Только `invoke` требует typed success: protocol/policy/request_id/op, bool ok, code, ровно семь полей, exit=0 и ожидаемый path; затем повторяет native physical check (`adapter.nv:160–181`, `transport.nv:141–147`). Raw exchange нельзя описывать как уже проверенный успешный ACL результат.

### Primary failure, EOF, cancellation, timeout

- Writer и оба reader запущены независимо до `child.wait`; stdin закрывается после записи. Success требует отдельного wait/out/err/writer completion, непустой stderr отказывается. Primary wait failure сохраняется перед последующими capture/writer ошибками (`transport.nv:80–138`). Признаков превращения missing completion или wait error в exit=0 по source не найдено.
- `Interrupted` не выдаётся за доказанный timeout: возвращается `transport_interrupted`. Незавершённость fail-closed, но точная диагностическая категория при внешней отмене не доказана.
- Весь процессный scope имеет timeout; trust/file/hash preflight до него и typed JSON parsing после него этим process deadline не ограничены. Следовательно, это не доказанный end-to-end SLA всех FS/parse операций.
- EOF обычных завершившихся fixture child проходит через captures. Отдельные pipe_read/pipe_write failures, необычные сочетания EOF/cancel и explicit external caller cancellation не имеют собственного полного набора raw controls. Это пробел охвата, не доказанный дефект.
- Deadline helper спит 30 секунд, тест требует monotonic elapsed 2.5–15 секунд при configured 3s (`transport_hostile_test.nv:23–35`). Он проверяет этот допуск, не точное завершение не позднее 3s при любой нагрузке.
- Overflow helper выдаёт 32769 bytes и затем спит; `expect_capture_refusal(..., true)` допускает interruption. Поскольку основной поток сначала ждёт child, capture-cap error не обязан немедленно завершать процесс. Это известный combined overflow/deadline negative, не отдельное измерение cap-trigger, раннего abort или memory high-water.

### Private root/leaf, ancestors и исключения ACL

- `windows-acl-adapter.ps1:98–151`: private требует service owner, protected canonical ненулевую/непустую DACL, только явные Allow service/SYSTEM/Administrators и применимый service FullControl. Unknown/CommonAce callback/object/unknown flags/unknown rights, inherited private и Deny private отказываются.
- Ancestor predicate отдельный. Known GENERIC InheritOnly templates допускаются только как неприменимые к существующему ancestor; applicable GENERIC и неизвестные rights не становятся grants. Это не новая доверенная семья SID.
- Точный TrustedInstaller SID разрешён только как owner подтверждённого OS volume root. Любой TI Allow отвергается **до** template ветки, включая read-only/InheritOnly. Private исключения не получает (`:104–120,165–167`).
- Исключение foreign creation-only ограничено actual mask 4 и flags 0 на том же OS volume root, не mask `4|Synchronize`, не `FILE_DELETE_CHILD` 64 и не произвольный ancestor (`:142–147`).
- Проверка reparse/`.git`/bare-like markers выполняется literal enumeration и проходит всю цепочку. `create_session` ограничен новым direct child, не чинит существующие ACL, проверяет leaf и вновь private root (`:154–208`). Native physical check не заменён одной lexical проверкой (`adapter.nv:79–92`).
- В 81 policy assertions присутствуют raw/null/empty/unknown ACE/rights, TI read/InheritOnly, actual mask 4 и normal Local ancestry controls. Это не реальные hostile junction/bare/foreign-owner FS layouts: они остаются NOT RUN. Гонки same-identity/admin не закрыты.

### Release kit

- `scripts/package-release.sh:52–56` копирует fixed script/manifest в `tools/windows`. Test helper, setup proof и runtime tests не включаются.
- `scripts/guards/check-release-kit.py:182–217` отказывает лишним файлам, bounded-read script/manifest, duplicate manifest keys, неверной схеме/version/hash, отличию script от source и native wrapper pin. Это сравнение с source, не аутентификация исполняемого hub/front или его сборки.
- Самотесты используют синтетические `MZ` programs и синтетический fixed script/native pin (`scripts/guards/selftest/test-check-release-kit.py:29–30,64–83`). Их PASS доказывает проверки и упаковку fixtures, не готовый production kit. Отдельного отрицательного selftest несовпадения native wrapper pin в текущем списке probes нет; наличие ветки guard не равно такому negative control.

## Прочитанное сырое evidence

Ниже — существующие артефакты автора; это **не новые прогоны приёмщика**. Идентификаторы позволяют найти их приватно, но локальные пути/nonce/proof не публикуются.

| Артефакт | Фактически прочитано | Предел |
|---|---|---|
| `1793519623307-eezg5h.json` и `.out` | metadata status done/code 0; полный stdout 141 строка: policy 81; native 1/0; hostile 1/0; identity termination message; kit 24/0 + package 7/0 | Targeted snapshot, не полный продукт |
| `1793519792704-p49akb.json` и `.out` | metadata code 0; unit module PASS 1/0 | В source три test-блока с несколькими assertions; summary считает модуль, не один assertion |
| `1793518145593-rnk7y6.out` | Начальный setup read-back и existing-child refusal PASS | Старый setup не превращён в новый execution данного snapshot |
| `1793518905596-twnwi5.out`, `1793519037866-vidr3a.out` | Оба исходных hostile RED; assertion category и затем process_wait | Не удалены, не заменены объяснением без финального результата |
| Private process identity JSON | Прочитаны сохранённые records четырёх hostile групп; финальная группа содержит все 10 modes, общий nonce, положительные разные PID/start_ticks, parent mode tree и child mode child | Не новый OS liveness query; завершение в тот момент подтверждает исходный launcher/stdout |

Финальная identity группа соотнесена с stage по start_ticks: stdout overflow около Unix ms `1793519656039`, parent `1793519668376`, child `1793519669014`; все внутри сохранённого окна stage `1793519624408–1793519704007`. Это дополнительная привязка records, не доказательство source↔binary provenance и не собственная повторная проверка завершения процессов.

Контрольные суммы прочитанных evidence:

```text
73080b1bd291ee0e4628e5e84969e132642b6452f8cbea9921d68fad8a888a6a  1793519623307-eezg5h.out
cd9e66265f0cf25a85afbd896f33c49c8146bb5824644eaa2f3fdb274699cc44  1793519623307-eezg5h.json
7fab995572ab33bfe336294543a049c9dcfee11218066850b65073d8f1739676  1793519792704-p49akb.out
f703ab137466730b8235e40f3c98b0cd54cfd21e4705f939e8403d18850fdf8e  1793519792704-p49akb.json
d694fa5faaf9c95a93621cec42f10494c306758de87c05c8f9f492ae2574e86a  final process.parent.json
39788b4785fff0e6060d47768f6a5c2d96d5000b2b25c801b9ae515a0bf6a955  final process.child.json
```

Хеши дополнительных прочитанных источников зависимости:

```text
e5fab8a262bd87dc2aca76c2f83b55f80a61ee8c619905ceeb136cf090d845fa  nova_rt/process.c
bd91597e7a40ad48a3d8e9975214163f54778bc30e219888a27ca33917bd3dbb  std/src/os/proc.nv
10f2b2bde7c4d5aaa4e019b408a4f28805ee52f0cf02a26d6e3bf71515efc8ec  std/src/os/proc_ffi.nv
17ce9d0f80fd8217c456120beffbeb73c8429e54ccdc56e489ed64a9acb3b594  nova_rt/libuv/src/win/process.c
```

## Достаточность и завершение

1. Совпадение 18 hashes и прочитанные raw поддерживают именно перечисленный targeted checkpoint. Итоговые ограничения автора в `result.md:7–15`, `acl-adapter-stage.md:74–91` в основном честны; blanket security proof из PASS не следует.
2. Разумный следующий предмет решения — RO-01, контракт реального process runtime из RO-02 и доверенный production bootstrap из RO-03 с отдельной оценкой. Это рекомендация объёма, **не разрешение** на исправления или исполнение.
3. Explicit cancellation, hostile FS layouts, isolated cap/memory proof, реальный packaged smoke остаются незакрытыми. Новая интеграция F-09, старые неизвестные server_live исходы и весь эпик этим отчётом не приняты.
4. Коммит не выполняется: штатный `core.hooksPath` указывает на pre-commit, который запускает guards. Запуск guards запрещён текущим read-only полномочием; hooks не обходились. Передаётся незакоммиченный отчёт с hash приватным письмом.
5. По окончании — STOP без автоматического продолжения, submit/accept/contour/main/push. Остальные HOLD и запреты сохраняются; старый отчёт/контур/доказательства сохранены.

Повторная сверка после чтения: frozen HEAD по-прежнему `b765a7011adda82b5e30940ccf7bd38a6402b5c0`, status чистый; все 18 functional hashes вновь совпали. Свой HEAD остался `92dec4860f02d8aeda81704d984978930610698b`; единственное изменение своего дерева — этот новый незакоммиченный файл. Отчёт завершён в пределах выделенных 60 минут; точная отметка завершения и SHA256 файла передаются почтовым инструментом интегратору.
