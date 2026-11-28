# Конкуренты bb: честный разбор по коду (исследование 2026-11-26)

Раздел «что перенести» отобран по критериям [doc/research/README.md](README.md).

Повод: владелец попросил честный разбор конкурентов bb после оценки «насколько bb — лучшее решение в индустрии».
Метод: только чтение кода (shallow-клоны вне репозитория), находки с [V]-ссылками `путь:строка` от корня
соответствующего клона. Закрытые конкуренты (Cursor, Conductor) не включены — по ним нет кода, сравнение было бы
нечестным. bb — по пину `desktop-v0.50.1` (`a08e1165`), см. [2026-11-26-bb-architecture.md](2026-11-26-bb-architecture.md).

**Пины:**
- `sst/opencode` — `82d8fc5bec961043e47b4d2d3fcd03667f40148a` (2026-11-26)
- `BloopAI/vibe-kanban` — `3f095f0186f6e68d67143d38b02da2238f6524d8` (2026-11-15)
- `stravu/crystal` — `1e18e0bc981225f75b5226f82a300fa741970c6f` (v0.3.5, 2026-02-26)
- `cline/cline` — `cbc7d1419a74464c622117a740fdfe87a5e0a7b2` (2026-11-26)

Обозначения: **[V]** — проверено по коду; **[I]** — вывод.

## Главное

- **bb подтверждает лидерство в классе по строгости швов**, но не во всём: по durability-очереди и
  record/replay у него есть равные и превосходящие в отдельных частях — opencode (event-sourced ядро,
  record/replay как публичный пакет) и cline (durable FIFO run queue, sandbox-плагины). **[I]**
- Два конкурента мертвы: **vibe-kanban сворачивается автором** («Vibe Kanban is sunsetting», README),
  **crystal задепрекейчен** в пользу Nimbalyst (README.md:14, February 2026). Живых соперников по
  архитектуре — opencode и cline. **[V]**
- Никто, кроме bb, не разделяет «мост знает диалект, рантайм владеет таймлайном»: у всех либо статический
  реестр провайдеров в ядре (opencode, vibe-kanban, crystal), либо свой SDK-стек (cline). **[V]**

## Сводная матрица (всё [V] по разборам ниже)

| Критерий | bb | opencode | vibe-kanban | crystal | cline |
|---|---|---|---|---|---|
| Форма | хаб+демоны, desktop/web/mobile/CLI | CLI/TUI/desktop/web/сервис | локальный web (Rust+React) | Electron desktop | hub-демон + CLI/VS Code/desktop |
| Провайдер-шов | JSON-RPC мост, закрытая грамматика дельт, id минтит bb | 78 своих интеграций, статический реестр в ядре | enum из ~10 агентов + ACP-реестр | NDJSON из PTY + матчинг текстов ошибок | Vercel AI SDK + свой gateway; ACP-агент наружу |
| Id сессии/событий | минтит рантайм bb | минтит ядро (ULID, evt_/msg_) | **минтит агент**, VK вылавливает | хаб для своих id; claude id из потока | минтит рантайм |
| Ошибки/recovery | типизированные recovery-hints | типизированные TaggedError | типизированные, но recovery почти нет | **матчинг текстов** (`includes('ERROR')`) | гибрид: классификатор поверх regex |
| Сообщение в занятую сессию | steer/queue, durable-очередь с claim | steer/queue, **durable-инбокс в SQLite**, идемпотентный admission | очередь из 1, в памяти; при сбое **выбрасывается** | **исключение**; ввод байтами в PTY | queue/steer + durable FIFO run queue с ack |
| Переживает рестарт | всё (SQLite, очереди, интеракции) | сессии, инбокс, jobs, субагенты резюмятся | задачи/история; running → Failed, queued теряется | сессии/вывод; очередь теряется | сессии, run queue, cron; steer-очередь в памяти |
| Event-sourcing | append-only events + проекции | **да**: durable-события с seq, проекторы, replay→live граница | нет (JSON-Patch стрим в UI) | нет | снапшоты + журнал-проекция (не источник истины) |
| Субагенты/иерархия | parent/fork/lifecycle-owner, авто-отчёты | дочерние сессии, авто-отчёты через инбокс, глубина 1 | нет дерева; MCP-оркестратор плоско | нет | subagents + teams, ancestry в каждом событии |
| Расширяемость | плагины без привилегий (даже sidebar), digest-дистрибуция | in-process плагины (Effect), встроенное — тоже плагины | ACP-реестр; ядро привилегировано | нет API; расширение = правка исходников | плагины в **worker-sandbox** с авто-отключением |
| Record/replay шва | запись 4 направлений, replay на коммите | **публичный пакет http-recorder** (HTTP/WS кассеты) | нет (ручные фикстуры) | нет | нет (моки AI SDK) |

## 1. opencode (sst) — самый близкий по классу архитектуры

- Монорепо Bun/TS (~35 пакетов), всё на Effect-Layer'ах; сервер + TUI + desktop + web; фоновый сервис с
  приватным локальным креденшелом (`AGENTS.md:2,8`). **[V]**
- **Durable event-sourced ядро**: события — Effect Schema с версией, разделены durable/ephemeral
  (`packages/schema/src/session-event.ts:39`, `options = { durable: { aggregate: "sessionID", version: 1 } }`);
  seq на агрегат (`packages/core/src/bus.ts:9,25-40`), проекторы материализуют read-модель, граница
  replay→live — маркер `log.synced` (`packages/schema/src/event-log.ts:11-21`). SQLite WAL, работает даже на
  Cloudflare workerd (`packages/core/src/database/database.ts:42-49`). **[V]**
- **Инбокс = data model**: `Delivery = ["steer", "queue"]` с дословной семантикой («steer delivers before the
  agent's next model call, even mid-work», `packages/schema/src/session-inbox.ts:11`); идемпотентный admission
  («First admission wins», `packages/core/src/session/inbox.ts:174`), типизированный `LifecycleConflict`. **[V]**
- **Субагенты переживают рестарт**: «A server shutdown interrupts this job but must leave the child resumable on
  the next start» (`packages/core/src/session/subagent-job.ts:27-33`); авто-отчёт родителю — synthetic-сообщение
  в его инбокс со статусом и телом из последнего assistant-сообщения
  (`packages/core/src/session/execution/subagent-report.ts:60-93`). **[V]**
- **Record/replay как публичный пакет** `packages/http-recorder`: «Record real Effect HTTP and WebSocket traffic
  once, then replay it from deterministic JSON cassettes» — уникально открытая форма. **[V]**
- Слабости: Effect 4 beta повсюду (README требует `skipLibCheck` из-за багов деклараций); провайдер-шов —
  статический реестр импортов в коде (`packages/core/src/provider.ts:31`), добавление провайдера = патч ядра;
  ACP нет; глубина субагентов по умолчанию 1 (`subagent-depth.ts:12`); плагины in-process без изоляции. **[V]**

## 2. cline — самый близкий по durability и изоляции плагинов

- Уже не «VS Code-расширение»: монорепо с SDK-слоями (`shared→llms→agents→core→ui`) и **hub-демоном** — «One
  daemon serves every Cline client on the machine» (`sdk/ARCHITECTURE.md:170-179`). **[V]**
- **Durable FIFO run queue**: «Durable FIFO run queue with immediate acknowledgement», ack с `queuePosition`
  сразу; «queued rows to re-admit in FIFO order at the next startup, and running rows are marked interrupted —
  never silently resumed» (`sdk/packages/core/src/runtime/turn-queue/hub-run-queue.ts:1-14`); бэкпрешер 32
  pending на сессию. **[V]**
- **Steer-семантика**: `PendingPromptDelivery = "queue" | "steer"`; steer отменяет текущую генерацию
  (`agents/src/agent-runtime.ts:1796`); `steerFirst` атомарно продвигает голову очереди одной синхронной
  операцией (`ARCHITECTURE.md:1259-1265`). **[V]**
- **Долговечный event log хаба**: монотонный sequence до fan-out, реконнект с `sinceSequence` — «disconnect
  never implies data loss» (`hub/server/hub-event-log.ts:1-14`); но это «projection aid, not the source of
  truth» — журнал для догона, не event-sourcing. **[V]**
- **Плагины в worker-sandbox**: worker thread per plugin per session, RPC-sandbox, авто-отключение после 5
  сбоев подряд, таймауты на каждый вызов (`ARCHITECTURE.md:634-758`) — зрелее bb по изоляции. **[V]**
- Слабости: классификация ошибок провайдеров — regex по текстам
  (`llms/src/providers/error-classification.ts:17-44`); два параллельных стека (новый SDK и legacy VS Code);
  steer-очередь в памяти; record/replay нет; сложность на уровне bb (ARCHITECTURE.md — 1332 строки
  edge-case'ов). **[V]**

## 3. vibe-kanban — продуктовый цикл, слабый шов (проект сворачивается)

- Rust (axum, ~28 крейтов) + React; канбан → worktree → агент → ревью диффов → PR. Трейт
  `StandardCodingAgentExecutor` (`crates/executors/src/executors/mod.rs:311`), но диспетчеризация — закрытый
  enum из ~10 агентов (`mod.rs:102`); новые агенты без перекомпиляции — только через **ACP-реестр** с CDN
  (`executors/acp/registry.rs:17`). **[V]**
- Нормализация в типизированный `NormalizedEntry` с `ActionType`/`ToolStatus`
  (`crates/executors/src/logs/mod.rs:119-186`) — фронт агностичен к агенту. **[V]**
- Критические слабости: **id сессии минтит агент**, VK его вылавливает из потока
  (`crates/utils/src/msg_store.rs:73`); очередь — **одно сообщение в памяти**, replace-on-new
  (`crates/services/src/services/queued_message.rs:31-52`), при сбое execution сообщение **молча выбрасывается**
  (`local-deployment/src/container.rs:662-666`); рестарт помечает все running-процессы Failed
  (`services/src/services/container.rs:277-334`); record/replay нет. **[V]**
- Проект закрывается автором — как донор это снимок, а не живой конкурент. **[V]**

## 4. crystal — мультиплексор терминалов, не оркестратор (задепрекейчен)

- Electron; параллельные сессии Claude Code/Codex, каждая в своём git worktree — самая проработанная часть
  (worktree-изоляция, diff-панели, AI-нейминг веток). **[V]**
- Шов: спавн CLI в PTY + `JSON.parse` строк NDJSON; при не-JSON — **матчинг текстов**:
  `data.includes('ERROR') || data.includes('Error:') || … || data.includes('fatal:')`
  (`main/src/services/panels/claude/claudeCodeManager.ts:224-229`). **[V]**
- Сообщение в занятую панель — **исключение** «Claude process already running for panel»
  (`claudeCodeManager.ts:351-353`); очередь заданий в десктопе — in-memory (`taskQueue.ts:75`); ожидание
  готовности — поллинг `setTimeout(200)` × 15 (`taskQueue.ts:355-361`). **[V]**
- Уникально хорошее: **permission UX через MCP** — `approve_permission` как permission-prompt-tool с
  IPC-мостом в нативный диалог (`mcpPermissionServer.ts:37`, `claudeCodeManager.ts:139-148`). **[V]**
- Плагинного API нет; реестр `CliToolDefinition` — задел, наружу не экспортирован. Задепрекейчен в пользу
  Nimbalyst (README.md:14). **[V]**

## Выводы для оценки «bb — лучший?»

1. **bb лидирует** по: формализации шва (никто не разделяет «диалект vs таймлайн»), типизированному recovery,
   plugin-без-привилегий (даже UI), ширине оркестрации (три отношения тредов, авто-отчёты, workflows).
2. **opencode равен или сильнее** в: event-sourcing как основе ядра (у bb — журнал + read-модель, у opencode —
   события с seq и проекторами как единственный путь), durability инбокса с идемпотентным admission,
   открытости record/replay (публичный пакет). **[I]**
3. **cline сильнее** в: изоляции плагинов (worker-sandbox vs in-process у bb), честной семантике краха run
   queue («interrupted — never silently resumed»), hub-демоне как общем бэкенде всех клиентов. **[I]**
4. **vibe-kanban и crystal** подтверждают правило: шов, отданный агенту (id из потока, матчинг текстов,
   исключение вместо steer), обречён на хрупкость — и оба проекта не выжили. **[I]**

## Что перенести в Канопус (отбор по критериям README)

1. **Идемпотентный admission очереди** (opencode: «first admission wins», типизированный конфликт) — дешёвая
   защита от гонок двойной отправки. **[I]**
2. **«Running → interrupted, never silently resumed»** (cline) — формулировка-инвариант для нашего
   восстановления после рестарта хаба. **[I]**
3. **Record/replay как отдельный инструмент** (opencode http-recorder): кассеты HTTP/WS для тестов шва без
   живого провайдера — дополняет наш план replay-тестов ACP (302). **[I]**
4. **Permission-prompt как MCP-инструмент** (crystal): увод approvals агента в UI хаба без форка агента —
   применимо к окнам с внешними CLI. **[I]**
5. **Антипаттерны зафиксировать явно**: id из потока агента, матчинг текстов ошибок, очередь в памяти,
   исключение вместо steer — четыре причины, по которым конкуренты хрупки; в наших стражах/ревью это должно
   быть красным. **[I]**

## Ограничения

- Сравнение — снимок ревизий из пинов; opencode и cline активно развиваются. **[V]**
- Закрытые конкуренты (Cursor, Conductor) не разобраны — нет кода; их оценки в публичных сравнениях —
  маркетинг, не [V]. **[I]**
- Разборы выполнены четырьмя независимыми читателями по единой анкете; полные отчёты сжаты до этого документа,
  ключевые ссылки сохранены. **[I]**
