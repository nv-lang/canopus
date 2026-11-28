# Атомарная трасса требований С1п-1

Статус: собственная source→REQ/AC/DNC карта для черновика. Нормативный результат и ограничения полностью сформулированы в `spec.md`; этот документ — адресная трассировка, не замена первоисточника. FACT/INFERENCE/UNKNOWN разделены; hypotheses `task/message.md:22–26` не считаются фактами.

| ID | Атом исходного условия/уточнения | Класс / источник | REQ / AC / DNC | Основание и доказательство |
|---|---|---|---|---|
| T01 | P1: сохранить evidence, адресно сдержать старую сессию, исправить класс, RED→GREEN, независимая проверка/CI; публикация отдельно | полномочие owner, message 9,17–20 | REQ-09/11; AC-09/10; DNC-02/03 | Цель сохранена; эта С1 только черновые документы, без mutation |
| T02 | Дефект: после reassign CLOSED deferred command перезаписала данные нового worker; исправлять класс, не только carrier | факт задания/message 14; инцидентный материал | REQ-01…11; AC-01…10 | Запрет stale side effect, replacement test |
| T03 | Работать в задаче/worktree, профиль light; текущая сессия без plan/code/tests/admin | ограничение/message 15 и уточнение С1п | DNC-03 | Сверка task/branch; предметные actions не запускались |
| T04 | Не отменять #94 целиком и не трогать scratch/worktrees/refs/archive/logs; не менять Nova source/assets/release | полномочия/границы message 19,36,50–52 | REQ-09; DNC-02/03/04 | Preservation AC-09; запрет на destructive action |
| T05 | Admin actions только для exact старой identity и доказанно её watches/PID; неизвестная ownership => STOP | граница/message 20,30–32 | REQ-07/09; AC-07/09; DNC-03 | Exact owner, capture-before-mutation, неизвестное не считается отсутствующим |
| T06 | Предварительные гипотезы — не готовые факты | message 22–26 | REQ-11 | Исходники просмотрены независимо; помечены как hypotheses, не источник решения |
| T07 | Полный own before до предметных записей, hidden/untracked/code/config/history/.git hash only | метод/С1п N6-1 | REQ-09/11; AC-09; DNC-02/05 | `session-evidence/s1p-1/before-tree.json`, before copies |
| T08 | Сохранить доказательства до будущего admin action; raw path/commands не в публичном repo; отсутствующее не домысливать | message 30,36 | REQ-09/11; AC-09/10; DNC-02/05 | 87 historical saved copies, run1 missing; no reconstruction |
| T09 | Inventory именно old session; new worker watches нельзя приписывать old | clarification С1п; qualification S2-2 | REQ-07/09; AC-07/09 | Partition в `writer-consumer-matrix.md`; six IDs separated from eight old inventory IDs |
| T10 | Различить old-watch snapshot и причины исчезновения | qualification S2-2 43–54 | REQ-09/11; AC-09 | Six done at later snapshot; two missing; deletion cause UNKNOWN |
| T11 | Dossier expected должен быть полным 64-char SHA из первоисточника до новой проверки; старую ошибку не исправлять | qualification S2-2 56–63 | REQ-09/11; AC-09 | Правильный source digest указан в analysis; старый forensic JSON immutable |
| T12 | Проверять exact current OpenCode V2 metadata/inbox без bodies/mutation; попытка failure => UNKNOWN, продолжать доступный анализ | message 31; уточнение С1п | REQ-06/11; AC-06 | Более ранний interrupted UNKNOWN отделён от позднего GET exit 0/count 0 в существующем API evidence |
| T13 | Старые sessions не оживлять; нет Phase1/re-run/реального RED; никакого API mutation/interrupt/delete/taskkill/queue write | message/С1п safety | DNC-03/05 | С1п не выполняла calls/actions |
| T14 | Проследить lifecycle и каждую подконтрольную writer/consumer поверхность: watch/timer/request/claim/start/poll/recovery/restart/reassign/release/end-task/retry/resume/letters/direct deliver/prompt/command | message 32; clarification С1п | REQ-01…06/10; AC-02…06 | `writer-consumer-matrix.md`; code audit callsites с trust boundary и последствиями |
| T15 | Race/crash/idempotency: spawn до PID записи, потерянный intent, restart, concurrent consumers | S1/S4 + clarification | REQ-03/04/10; AC-02/04/05 | Один outcome на заданный порядок; неизвестный outcome STOP, никакой файловой+OS transaction claim |
| T16 | Два исхода обязаны быть различены: admitted-before-close и close-before-admission | S1/S4/M1 | REQ-03; AC-02 | При close-before — no admission/spawn; при admitted-before — close не success без exact terminal proof |
| T17 | Close определён наблюдаемым способом, не просто записью status | S1/S4 | REQ-01/03/04; AC-01/02/04 | Completion includes tombstone + terminal evidence; UNKNOWN => unresolved/STOP |
| T18 | Process threat model включает PID reuse, reparented descendants, open handles и остаточные права записи | S3 | REQ-07/08; AC-07/08; DNC-01/06 | Negative probes; exact proof/primitive остаются плану, обещания нет |
| T19 | Не предрешать sandbox/job/ACL или универсальную изоляцию | S3 | REQ-07/08; DNC-06 | Spec требует outcome; primitive выбирается после feasibility доказательства |
| T20 | Replacement worker должен работать независимо; никакого blanket block | message 33; S3 | REQ-08; AC-08; DNC-04 | Парная отрицательная old write и положительная replacement запись |
| T21 | Внешние API clients/server — отдельный trust boundary; не выдавать локальный interrupt за durable fence | S2 | REQ-05/06; AC-03/06; DNC-01/06 | Вопрос владельцу и HOLD при отсутствии внешней гарантии; это не принятое сужение цели |
| T22 | S5/M1: каждое условие задания/уточнения должно ссылаться на отдельный REQ/AC/DNC/constraint | message 11–56, квалификации | вся таблица | Нет укрупнённой строки, скрывающей сохранность/границы/цикл/вопросы |
| T23 | Нормативный spec самодостаточен; трасса/evidence может раскрывать подробные refs | уточнение С1п | REQ-11 | Spec содержит терминологию, требования, критерии, DNC, границы и вопросы |
| T24 | Публичная сдача без секретов, env dump, machine paths, private names; immutable source inputs | ADR-0006, AGENTS 15, message 36 | REQ-09/11; AC-09/10; DNC-02/05 | Guards перечислены для будущего запуска, не выполнялись в С1п |
| T25 | Полный набор plugin tests и отдельный CI guards; один не заменяет другой | AGENTS 7–10; package/CI/test README; S5/M2 | REQ-11; AC-10 | `npm test` 121 последовательный node script; CI команды перечислены в spec; ничего не запускалось |
| T26 | Targeted watch/flowwatch/restart suites и isolated fixture, сначала RED, затем GREEN; не реальная старая session | message 33, clarification С1п | REQ-02…10; AC-01…09; DNC-03 | Команды в spec, фикстуры только после plan gates |
| T27 | Machine-heavy tests идут через очередь; текущая сессия не запускает heavy | AGENTS 9–10; message 33 | REQ-11; AC-10 | Очередь указана как требование будущей проверки; не запускалась |
| T28 | Поведение README/help при необходимости; current только указатель на реальный landed result | message 42–45, AGENTS/process | REQ-11; DNC-04 | Target surfaces указаны; никаких действующих docs в С1п не меняли |
| T29 | Задача проходит методический цикл; сдача не равна утверждению/GO; владелец решает спорную гарантию | message 14,38–40; Canon | REQ-11; AC-10 | Next independent С2; owner question до ворот; HOLD остается |
| T30 | Не создавать task/agent/branch/ref, не трогать #061, #22, #045, #031 и #013 вне разрешения | текущие границы С1п | DNC-02/03/04 | Ничего такого не создавалось/менялось |

## Покрытие квалификации С2-2

| Finding | Ответ С1п | Где |
|---|---|---|
| S1: spawn до durable PID / потерянный intent | исправлено контрактом: admission/intent, crash recovery; failure => unresolved STOP; primitive плану | REQ-03/04; AC-04 |
| S2: writer/consumer и external boundary | полная project-owned inventory в отдельной matrix; независимый клиент отдельный trust boundary; цель не ослаблена | REQ-05/06; AC-03/06 |
| S3: exit/isolation overclaim | определены угрозы и negative oracle; universal primitive не обещан, неизвестное STOP; replacement не блокировать | REQ-07/08; AC-07/08 |
| S4: два исхода без oracle | close-before и admitted-before имеют разные фиксированные outcome; одна заданная schedule не принимает оба | REQ-03; AC-02 |
| S5/M1: неполная trace | 30 атомарных строк от полномочий/границ/тестов/документации до вопросов | T01–T30 |
| M2: команды публичной проверки | полный npm и CI приведены раздельно с targeted suites и queue; в текущей сессии не запускаются | REQ-11; AC-10 |
| Identity error | replacement IDs отделены от восьми old inventory records; старые JSON immutable | T09–T10; matrix |
| Digest error | expected из первичного intake, 64 hex; старая verification immutable | T11; analysis |
| Before incompleteness | own whole-tree before includes all existing files; root docs copied before edits | T07; `before-tree.json` |

## Первичные коды и команды

Сверенные callsites и точные текущие targets перечислены в `analysis.md` и `writer-consumer-matrix.md`. После разрешения реализации: `node test/crew-watch.test.mjs`, `node test/crew-flowwatch.test.mjs`, `node test/crew-restart.test.mjs`, затем весь `npm test` из `opencode-plugin/`; отдельно CI: shell syntax, `sh scripts/guards/run-all.sh --ci`, `python scripts/guards/guard-secrets.py --tree`, `python scripts/guards/check-wiring.py`, `sh scripts/guards/selftest/run-selftests.sh`, `sh scripts/guards/prove-red.sh`, `sh scripts/guards/probe-empty-root.sh` и commit-range checks workflow. Текущая трасса не является evidence запуска этих команд.
