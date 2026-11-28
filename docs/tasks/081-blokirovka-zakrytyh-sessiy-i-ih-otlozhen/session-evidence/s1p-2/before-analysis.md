# Анализ С1п-1 — блокировка закрытых сессий

## Итог

**Черновик исправлен, fence не доказан; Nova #94 остаётся HOLD.** S1–S5 и M1/M2 учтены в требованиях; старые материалы не переписаны. Это авторская правка, не утверждение spec и не разрешение на план, код, тесты или административные операции. Независимая проверка полноты нужна.

## Факты (FACT)

- F1. Ранний собственный снимок до чтения предметных источников: `session-evidence/s1p-1/before-tree.json`, 715 файлов, относительные пути, bytes и SHA-256; включая hidden/untracked и `.git` как файл без payload. Включены журналы, code/config, старые evidence и generated `.opencode/opencode.json`. Побайтные копии трёх разрешённых draft до правки — `root-before/`. Не заявляю снимок за рамками наблюдаемого дерева.
- F2. Первоисточник dossier: 15150 bytes, SHA-256 `7a1f831a85caa227d9d3c36c45f6bf34bab144ea29e1080b58607ed8825d9969`. Старый `forensic-verification.json` имеет 63-символьный expected и не исправлялся; прежний actual не объявляю PASS.
- F3. Шесть run1 IDs `1792260030319-ie8bde`, `1792260067690-t7zy8c`, `1792260097037-xabdxk`, `1792260111664-pr9xpd`, `1792260127576-aag98z`, `1792260159699-hre9bp` принадлежат replacement `ses_mvcoxay3pjag7acd92`, не old `ses_mvawdsam690xeqwzpp`. Восьмёрка old inventory: `1792179830027-y3slcn`, `1792183468927-mmg9gt`, `1792187099073-itfcuj`, `1792190755214-ea51zn`, `1792194428378-i8kvs7`, `1792209979806-8xdhpt`, `1792224406828-s0k28y`, `1792264172390-3ns1ev`. Поздний снимок интегратора увидел шесть done; первые два уже отсутствовали в живом каталоге. Причина неизвестна. Снимок не доказывает exit.
- F4. Intake сообщает о 87 сохранённых копиях; это результат прежней сверки, не новая пересверка С1п. Raw archives/CMake logs run1 утрачены, не восстановлены.
- F5. `session-evidence/s2-2/api-readonly.json`: поздний GET exact old session/inbox завершился exit 0, identity совпала, inbox count 0. Предшествующая прерванная попытка была UNKNOWN на свой момент. Поздний GET — отдельный снимок, не durable fence и не запрет независимым клиентам; повторного GET в С1п не было.
- F6. `core.ts:2092–2119,3325–3333`: reassign закрывает card и obligation. `core.ts:3170–3208`: watch/timer writers создают requests без видимой lifecycle gate. `watch.ts:70–76,103–116,166–209,217–240`: request, detached spawn, poll, drop/cancel.
- F7. `index.ts:580–641` resume/retry пишет письма по obligations; `646–687` перемещает watch в новый request и снимает watches завершённых задач; `1880–1898` возобновляет starting tasks; `1901–1934` раздаёт role queue; `2033–2042` опрашивает watch, а closed filter стоит только перед одним циклом `deliver`.
- F8. `core.ts:1111–1117` `postLetter` — общий файловый writer; `crew_send` explicit session — `1913–2008`. Прямые вызовы `deliver` в `index.ts` есть помимо poll (в частности 568, 797, 1035, 1376, 1865, 2042, 2161). Независимый OpenCode клиент может иметь собственные prompt/command маршруты; проект не доказал запрет таких клиентов.
- F9. `watch.ts:start` вызывает detached OS `spawn`, затем caller пишет running record с PID. Падение после OS spawn, до устойчивой записи PID, оставляет неизвестный процесс; удаление claim до spawn также способно потерять intent. Файловый rename не транзакционен с OS spawn.
- F10. `dropWatch` ловит ошибку kill и всё равно пишет `done/code:null`; PID/PPID snapshot не доказывает PID identity, отсутствие reuse, reparented descendants, открытых handles или остаточного права записи.
- F11. `opencode-plugin/package.json` содержит последовательную цепочку `npm test` из 121 Node script с cleanup в начале. `test/README.md` говорит: собственная mailbox, реальные child processes/HTTP, но OpenCode/windows/models — fake. `.github/workflows/guards.yml` отдельно запускает shell syntax, `run-all.sh --ci`, secrets tree, wiring, commit guard, selftests, prove-red, empty-root; plugin suite в workflow прямо исключён. Ничего не запускалось.

## Выводы (INFERENCE)

- I1. `closed` сейчас — card/task metadata, не доказанная durable граница полномочий всех writers/consumers.
- I2. Требуется сохранить владельческую цель долговременного fence для подконтрольных CrewHarness writers, recovery и consumers. Interrupt не отзывает watch и сам по себе не запрещает будущий ход.
- I3. Изоляция scratch не выводится из kill success, отсутствия PID или локального side-effect test. Неизвестная identity/lineage/handles/права записи означает STOP.
- I4. Close без доказуемого завершённого состояния остаётся HOLD. Любой успешный критерий требует одного бинарного oracle.

## UNKNOWN и вопросы

- U1. Межпроцессная сериализация, recovery spawn intent, identity и exit proof для поддерживаемых систем не установлены; это доказать будущему плану, реализации и проверке.
- U2. Внешняя гарантия OpenCode, запрещающая независимые prompt/command writers, здесь не подтверждена. Вопрос владельцу: если план не найдёт такую гарантию, сохранять HOLD до её получения? Рекомендация — да; иначе либо недостижимое обещание, либо самовольное сужение P1. Safe default — HOLD; до решения, не позднее следующих spec/plan ворот.
- U3. Причина исчезновения двух старых records и точная хронология инцидента неизвестны; raw run1 bytes утрачены.
- U4. Не доказаны lineage потомков, exit, handles, ACL и scratch isolation. Вопрос владельцу для будущих ворот: разрешать ли какие-либо адресные stop только после capture→identity→revoke→exit proof? Рекомендация — да; срок — до любой mutation; молчание означает HOLD. Это не полномочие выполнить stop сейчас.

## Проверки и границы

Читайте `session-evidence/s1p-1/`: before, partition/API digest reconciliation, writer-consumer matrix, regression probes и preservation. Выполнено чтение источников; API и процессы в этой сессии не трогались. Нет product tests, fixtures, build, guards, Phase1/re-run, interrupt, inbox delete, taskkill, queue write, commit или push. Нет PASS/GO/fence/exit-proof. После отдельных ворот: isolated targeted suites `crew-watch`, `crew-flowwatch`, `crew-restart`; полный `npm test` из `opencode-plugin/`; отдельно CI guards workflow. Тяжёлое — через очередь машины. Изменение пользовательского поведения требует README `crew_watch` и `crew_help`; будущий `current.md` только указатели на реально внесённый результат.
