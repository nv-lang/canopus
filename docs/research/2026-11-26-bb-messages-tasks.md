# bb: реакция на сообщения, очередь доставки, tasks и «авто»-механизмы (исследование 2026-11-26)

Раздел «что перенести» отобран по критериям [doc/research/README.md](README.md).

Повод: владелец отметил, что ему нравится, как в bb происходит реакция на сообщения и авто-TODO, и попросил
детальное исследование. Источник — `get-bb/bb`, клон только для чтения вне репозитория, тег **`desktop-v0.50.1`**,
ревизия **`a08e116566d1785bc04578a866df8a0359157dd4`** (см. [2026-11-26-bb-architecture.md](2026-11-26-bb-architecture.md)).
Пути — от корня клона.

Обозначения: **[V]** — проверено по коду (путь:строка); **[I]** — вывод.

## Главное

- **Никакого auto-TODO из хода в bb нет** — это сознательное решение: задачи создаются только явно (пользователем
  в UI или агентом через CLI), «план → задачи» — продуктовый акт (пресеты, делегация, report-back contract), а не
  экстракция из хода. В `apps/server` слово `todo` не встречается вовсе. **[V]** (grep по `apps/server/src` пуст;
  плагин tasks не подписан на поток событий хода — [I])
- Автоматика сосредоточена вокруг **доставки и восстановления** (дурабельная очередь, ретраи, auto-resume) и
  **метаданных** (авто-заголовки, авто-commit-сообщения, live-статусы, системные комментарии). **[I]**
- Все решения о приоритизации сообщений проходят один наблюдаемый **dispatch checkpoint** с дословно читаемыми
  причинами ожидания в UI. **[V]**

## 1. Реакция на сообщения пользователя

### 1.1. Единая точка входа: dispatch checkpoint

Каждое сообщение к провайдеру — новое от пользователя, доставка из очереди, ретрай упавшего хода — проходит
ровно один раз через `attemptDispatch` в `apps/server/src/services/threads/dispatch-attempt.ts:324`.
Трёхшаговая схема (`dispatch-attempt.ts:303-322`): **[V]**

1. **Plugin policy** — хуки `message.dispatch`: плагин может пропустить, поставить в очередь с причиной или
   отказать (`experimental_hooks` из SDK). Исключения by design: Send-now пользователя и «операции над
   разговором» (компакция, пересылка отредактированного сообщения) хуки не проходят.
2. **Core waits** — планировочные/тредовые/host-ожидания ставят допущенное сообщение в очередь, пока оно
   физически не может выполниться.
3. **Dispatch** — свободная первая попытка переводит `pending`-тред в `starting` и едет с командой холодного
   старта; остальные — обычный send или steer.

«When nothing blocks it, no queued row is ever created» — если ничего не мешает, строки в очереди вообще не
появляется (`dispatch-attempt.ts:321-322`). Источники попытки: `inline` (шлют сейчас), `drain` (повторная
попытка захваченных строк), `operation` (компакция, edit-resend — мимо хуков) (`dispatch-attempt.ts:233-255`). **[V]**

### 1.2. Режимы отправки: start / steer / auto / queue-if-active

`resolveSendMode` (`apps/server/src/services/threads/thread-send.ts:234-278`): **[V]**

- `start` — только на не-активном треде, иначе 409 `already_active`.
- `steer` / `steer-if-active` — на активном треде steer; на idle (и на error для `steer-if-active`) → `start`.
- `queue-if-active` — на активном треде не шлёт: сообщение встаёт в очередь ожидания `thread-busy`.
- `auto` (умолчание) — активный тред ⇒ steer («join-turn»), иначе новый ход (`dispatch-attempt.ts:293-301`).

Особый случай: если активный ход помечен `turn.mainRun idle` (провайдер держит логический ход открытым, но
основной прогон закончился), `queue-if-active` переписывается в steer — сообщение вливается в «удерживаемый»
ход (`dispatch-attempt.ts:392-401`; семантика held turns — `docs/provider-bridge-protocol.md:169-176`). **[V]**

Delivery mode очереди: `queue-if-active`/`start` → `queue`, остальные → `steer` (`dispatch-attempt.ts:334-338`;
колонка `deliveryMode`, `packages/db/src/schema.ts:1121-1125`); группа, где хоть одна строка `queue`, шлётся как
`queue-if-active`, иначе как `auto` (`queued-messages.ts:348-354`). **[V]**

### 1.3. Core-ожидания (waitingOn) — полный словарь

Все причины, по которым сообщение встаёт в очередь (`dispatch-attempt.ts:513-639`; UI-тексты —
`queued-messages.ts:554-577`): **[V]**

| waitingOn | Когда | Текст для пользователя (дословно) |
|---|---|---|
| `time` | `sendAt` в будущем (scheduled-send, коалесцированные нотисы) | — |
| `app-update` | сервер заморожен под обновление | "bb is restarting to update" |
| `stopping` | тред останавливается | "the thread is still stopping" |
| `host-offline` | демон машины не подключён / maintenance | `the "<host>" host is not ready` |
| `thread-busy` | активный ход, manual compaction, retry впереди | "the thread is already running a turn" |
| `turn-starting` | ход принят, но `turn/started` ещё нет | "the current turn is still starting" |
| `provisioning` | environment ещё готовится | "the thread's workspace is still being prepared" |
| `interaction` | висит turn-bound pending interaction | "the thread is waiting for you to answer a pending interaction" |
| `plugin` | хук плагина удержал (concurrency-limit, provider-retry…) | `it is waiting on the "<plugin>" plugin` |
| `superseded` | после строки отправили более новое сообщение | "a newer message was sent after it" |

Хранение — `queued_thread_messages` (`schema.ts:1084-1192`): состояния
`queued/scheduled/waiting/claimed/failed_retrying/failed_exhausted` зафиксированы CHECK-констрейнтом
(`schema.ts:1162-1173`), парность `claimedAt`/`claimToken` — вторым CHECK. Единственная функция, создающая или
переписывающая строку, — `recordQueuedMessageWait` (`queue-waits.ts:116-172`): «Creating and re-queueing are one
function because they are one concept — "this message is waiting, and here is why"» (`queue-waits.ts:103-115`).
Постановка и снятие эмитят плагинные события `message.queued` / `message.dispatched` / `message.cancelled`
(`queue-waits.ts:169,179-181`). **[V]**

### 1.4. Очередь: claim, группы, retry, scheduling

- **Claim.** Drain захватывает группу CAS-операцией `claimQueuedThreadMessageGroup` с `claimToken`; потребление
  строк — `DELETE` в **той же транзакции**, что и append turn-запроса: «the claim CAS picked one winner, and the
  delete makes the dispatch and the consumption atomic, so a double drain dispatches once»
  (`dispatch-attempt.ts:831-853`). Проигравший получает 409 `queued_message_claim_lost` (`queue-waits.ts:34-44`).
  Протухшие claims снимаются sweep'ом через 5 минут (`STALE_QUEUED_MESSAGE_CLAIM_MS`, `queued-messages.ts:334`).
  Редактирование строки в UI берёт edit-hold lease на 2 минуты (`queued-messages.ts:335`). **[V]**
- **Группы и коалесцирование.** Смежные строки с `groupWithNext` клеймятся одной группой и сливаются в один
  dispatch (`queued-messages.ts:483-505`). Отдельно — **коалесцированные системные нотисы**:
  `postCoalescedSystemNotice` (`coalesced-system-notices.ts:41-117`) по `coalesceKey` в окне `windowMs` либо
  создаёт строку с `waitingOn: time`, либо переписывает содержимое существующей (`coalesceState` — merge-функция),
  либо отзывает её вовсе. Так сервер сворачивает потоки однотипных системных уведомлений (батчи исходов дочерних
  тредов) в одно сообщение, чтобы не спамить агента. **[V]**
- **Retry упавших dispatch'ей.** Ошибка drain'а → состояние `failed_retrying` с `nextAttemptAt`;
  `failedQueueRetrySweep` — «the only automatic path that may claim a row with a recorded failure»; исчерпанные
  попытки → `failed_exhausted` (`queued-message-dispatch.ts:565-602`). **[V]**
- **Wake-события** вместо поллинга (`queued-message-dispatch.ts:46-63`): `thread-ready`, `turn-started`,
  `workspace-ready`, `interaction-settled`, `edit-released`, `host-connected`, `app-update-released`,
  `time-reached`, `plugin-recheck`, `plugin-unregistered`, `idle-recovery`, `failed-retry`,
  `orphaned-plugin-recovery`; плюс три периодических sweep'а. Готовность группы решает
  `createAutomaticQueuedMessageGroupEligibility` (`queued-messages.ts:105-158`). **[V]**
- **Send-now.** Явная кнопка клеймит с `explicit-send`: обходит все plugin-ожидания и собственный `sendAt`, но
  **не** core-ожидания (они «guard invariants rather than express a policy») — кроме `stopping`, который Send-now
  как раз и означает снять; при отказе — 409 с человекочитаемой причиной (`queued-messages.ts:529-549`). **[V]**
- **Пауза после ручного стопа.** Ручной stop ставит тред на паузу автосенда (`isThreadQueueAutoSendPaused`);
  сообщение, написанное после стопа, несёт `waitingOn: stopping` и уйдёт, когда тред встанет в idle
  (`queued-messages.ts:228-246,338-346`). **[V]**

### 1.5. Доставка в провайдера и поведение в занятом треде

`sendThreadMessage` (`thread-send.ts:523-898`): **[V]**

- пишет событие `client/turn/requested` + запись в `thread_turn_requests` + уведомление — в одной транзакции
  (`thread-send.ts:421-492`);
- новый ход — `thread.start`/`turn.submit`; steer — `turn.submit` с `expectedTurnId` активного хода
  (`thread-send.ts:634-637,701-715`);
- steer по исчезнувшему ходу мост отклоняет recovery-hint'ом `staleTurn`, и runtime докладывает его как stale,
  а не как ошибку (`docs/provider-bridge-protocol.md:384`);
- сообщение от другого агентского треда оборачивается шаблоном `[bb message from thread:{{senderThreadId}}]`
  (`packages/templates/src/templates/agent-thread-message.md`); инициатор различается как
  `user | agent | system | plugin` (`thread-send.ts:621-626`);
- отправка в тред с висящим turn-bound interaction отвергается 409 `awaiting_user_interaction` — сначала ответь
  на вопрос/аппрув (`thread-send.ts:180-195`).

**Interrupt.** `thread/stop { intent: interrupt | release }`: interrupt сеттлит активный ход как interrupted
(мост обязан выдать `turn.boundary { interrupted }` и закрыть свои открытые items **до** ответа на stop), release
отцепляет idle-сессию без фабрикации прерывания (`docs/provider-bridge-protocol.md:492-510`). **[V]**

### 1.6. Ретрай упавшего хода

`retryFailedTurn` (`turn-retry.ts:242-365`) — обычный attemptDispatch с payload `kind: "retry"`, поэтому
«уважает» лимитеры и очереди как все: **[V]**

- ретраится только последний упавший ход; `turnRequestId` утверждает, какой ход имелся в виду
  (`turn-retry.ts:50-91`);
- одна ошибка = максимум один живой ретрай (дедуп через `hasQueuedRetryOfTurnRequest` + in-process set,
  `turn-retry.ts:222-301`);
- если провайдер **принял** input до падения — пересылка была бы дубликатом, поэтому шлётся continuation-nudge
  `"Please continue."` (`turn-retry.ts:98,115-142`); если не принял — input пересылается дословно; оба варианта
  с `visibility: "agent-only"`, чтобы не дублировать сообщение пользователя в таймлайне;
- execution tuple (модель/effort/permission) реплеится с упавшей попытки, а не перерезолвится
  (`turn-retry.ts:144-170`);
- ретрай никогда не steer'ит: `mode: "queue-if-active"` — «a thread that is busy again is something to wait
  behind rather than to interrupt» (`turn-retry.ts:320-323`);
- ретраи идут в голову очереди при включённом `resumeThreadsAfterRestart` (`dispatch-attempt.ts:477-490`).

**Авто-резюм после рестарта** (`restart-resume.ts`): если рестарт оборвал ход или убил фоновые задачи, треду
автоматически отправляется системный шаблон `[bb system] bb restarted {{details}}` с называнием прерванной
команды/джобов, задержка 5 с, максимум 4 попытки (`restart-resume.ts:35-38`; шаблон
`packages/templates/src/templates/system-message-restart-resume.md`, editingNotes: «Say that the restart, not
the user, stopped the work; agents otherwise read the stop as a rejection»). **[V]**

### 1.7. Pending interactions (вопросы и аппрувалы)

Таблица `pending_interactions` (`schema.ts:1302`), сервис
`apps/server/src/services/interactions/pending-interactions.ts`. Жизненный цикл: register (dedup по provider
request id) → active → `resolving` → `resolved` / `interrupted` (при стопе все висящие интеракции треда
инвалидируются). Каждая смена статуса добавляет событие `system/interaction/lifecycle` с полной записью
(`docs/provider-plugin-api.md:396-406`). Пока интеракция висит: новые промпты отвергаются (1.5), очередь встаёт
на `interaction`-ожидание, снимаемое wake'ом `interaction-settled` (`queued-message-dispatch.ts:413-426`).
Родительский тред получает шаблон «needs help» с summary блокера и инструкцией «If you can resolve it from
existing context, reply to the thread with guidance. Otherwise, ask the user»
(`system-message-child-thread-needs-attention.md`). **[V]**

### 1.8. Уведомления и внимание (sidebar)

Плагин `push-notifications` подписан на события `interaction.pending`, `thread.idle`, `thread.failed`,
`thread.read` (`plugins/push-notifications/server.ts:565-581`). Уровни на тред: `all / input-only / muted`,
фолбэк `childLevel` (по умолчанию `input-only` для дочерних), «every ancestor's own level caps it. Muting a
parent mutes its whole subtree, but a parent never makes workers louder»
(`plugins/push-notifications/PLUGIN_OVERVIEW.md`). Прочитанный на любом клиенте тред снимает уведомления везде.
В сайдбаре «внимание» — колонка `threads.latestAttentionAt` (`schema.ts:664`). **[V]**

### 1.9. Сообщения владельца против автономной работы

- steer по умолчанию (auto) — встроиться в живой ход; queue — дождаться; Send-now — продавить policy-ожидания;
  stop — прервать. **[V]**
- Плагинные хуки видят инициатора (`initiator: user|agent|system|plugin`) и могут по-разному обращаться с
  человеком и с автономией; «Send-now bypasses it by design» — человек всегда может продавить лимитер
  (`backend-contract.ts:2287-2293`). **[V]**
- Дочерние треды докладывают родителю батчами исходов через коалесцированные системные нотисы
  (`child-thread-notifications.ts`, шаблон `system-message-child-thread-outcome-batch.md`); настройка
  `parentNotifications` на треде (`schema.ts:653-657`). **[V]**

## 2. Tasks и «авто»-механизмы

### 2.1. Плагин tasks: явное создание, без auto-TODO

Трекер целиком живёт в плагине `plugins/tasks` на per-plugin БД (`plugins/tasks/db/schema.ts`): статусы
`backlog | todo | in_progress | in_review | done | canceled` (CHECK, `schema.ts:33`), ключи вида `PROD-1`,
иерархия, labels, приоритеты, due dates, subtasks, вложения, комментарии. Задачи создаются только явно —
пользователем в UI или агентом через CLI. **[V]**

**Связь с тредами** — таблица `task_threads` с `live_status IN ('starting','working','idle','completed','failed')`
(`plugins/tasks/db/schema.ts:91`). Маппинг из статуса треда bb: `pending/starting→starting`,
`active/stopping→working`, `idle→idle`, `error→failed`, удалён→`completed`
(`plugins/tasks/lifecycle/index.ts:16-30`). Lifecycle-подписки двигают live-статус и при терминальном переходе
пишут **системный комментарий** в задачу: `Thread "<title>" completed — final message posted · <threadId>`
(`lifecycle/index.ts:40-50,62-84`). **[V]**

**Делегация** (`plugins/tasks/delegate/index.ts`): пресет (provider, model, reasoning, permission mode,
instructions — задаёт пользователь заранее) → spawn worker-треда в связанном bb-проекте → attach к задаче →
задача переходит в `in_progress`. Seed-промпт собирается секциями: `# KEY · title`, Description, Project context,
Sub-tasks, Attachments (с командой `bb tasks attachment get <id> --out <path>`), Recent comments и
**Report-back contract** дословно: «You are working on task KEY. Use the bb tasks CLI: comment substantive
updates (bb tasks comment KEY --body ...), attach result artifacts, set status when done (bb tasks update KEY
--status in_review) or explain blockage in a comment. Your thread is already attached to the task.»
(`delegate/index.ts:88-125`). **[V]**

**Комментарий → агент (steer)** (`plugins/tasks/steer/index.ts:13-58`): переключатель «Notify last responding
agent» доставляет комментарий в тред последнего агентского ответа через `threads.send` с
`mode: "steer-if-active"`. Текст дословно: «New comment on task KEY from AUTHOR: BODY\n\nTreat this as updated
context for your work on this task; reply via bb tasks comment KEY when relevant.» Side-chat-треды исключены. **[V]**

**Поверхности для агента**: не agent tools, а **CLI + skill**. `bb tasks create|list|show|update|move|comment|
attachment|preset|delegate|attach|detach|threads|label|project|folder` (`plugins/tasks/PLUGIN_OVERVIEW.md`);
skill `tasks` (`plugins/tasks/skills/tasks/SKILL.md`) предписывает воркеру: прочитать задачу до действий, «Post
one substantive comment at each meaningful milestone», прикладывать артефакты, ставить `done`/`in_review`.
В composer'е `@` → Tasks шлёт задачу как контекст; агенты видят карточку `::task{key="PROD-1"}`
(`plugins/tasks/mentions`). **[V]**

### 2.2. Авто-заголовки тредов

`title-generation.ts`: при первом промпте (≥5 слов или slash-команда — `shouldGenerateThreadTitle`,
`title-generation.ts:153-164`) через `runTextAiTask("thread-title")` генерируется заголовок; фолбэк — текст
промпта, обрезанный до 80 колонок (`deriveTitleFallback`, :83-89). Заголовок ≤48 колонок, санитайзится.
Промпт дословно (`packages/templates/src/templates/generate-thread-metadata.md`): «You create concise titles for
coding tasks. Reply with only the title: short, clear, sentence case, in the same language as the task…
Summarize the task in your own words instead of copying its text. No quotes, no trailing punctuation, no
explanation.» Плюс эвристика: «if they detail specific tools to use to solve a problem, it is the problem that
should be the title, not the tools». **Регенерация** (`regenerateThreadTitle`, :393-432) подмешивает до 8
последующих сообщений пользователя и до 32 финальных реплик агента (по 125 колонок) с правилом «If that title
still describes the task…, reply with it unchanged». Fork-треды нумеруются `(1) Title` без AI
(`deriveForkTitle`, :91-105). Модель обслуживания выбирает пользователь (плагин `bb-ai` или локальный). **[V]**

### 2.3. Авто-commit-сообщения

Шаблон `packages/templates/src/templates/generate-commit-message.md`: conventional commit, один subject ≤72
символов, вход — shortstat + name-status + вырезка патча. Тот же `runTextAiTask`-конвейер; вызывается из
плагина `git`. **[V]**

### 2.4. Прочие «авто»

- **Auto-retry упавших ходов** — плагин `provider-retry` поверх `retryFailedTurn` с `sendAt`
  (`plugins/provider-retry/PLUGIN_OVERVIEW.md`); ядро даёт дедуп и join с уже ждущим ретраем
  (`turn-retry.ts:195-220`). **[V]**
- **Auto-resume после рестарта** — см. 1.6 (настройка `resumeThreadsAfterRestart`). **[V]**
- **scheduled-send** — сообщение с `sendAt` в будущем; в ядре это `waitingOn: time` +
  `requestQueuedMessageDispatchAt` (`queued-message-dispatch.ts:223-240`). **[V]**
- **automations** — cron/разовые запуски (тред с промптом или серверный скрипт); расписания — `plugin_schedules`. **[V]**
- **workflows** — фан-аут по агентам со structured output; ран переживает рестарты и продолжается с последнего
  завершённого шага (`plugins/workflows/PLUGIN_OVERVIEW.md`). **[V]**
- **concurrency-limit** — авто-лимит = 1 running thread на процессор хоста; реализован как dispatch-hook с
  видимой причиной (`waitingOn: plugin`). **[V]**
- **Авто-комментарии tasks** — системные комментарии о completed/failed воркеров (2.1). **[V]**
- **agent-annotations** — клик по элементу во встроенном браузере → заметка с селектором уходит агенту в промпт
  (`plugins/agent-annotations/PLUGIN_OVERVIEW.md`). **[V]**
- **Авто-имя ветки** — `sanitizeGeneratedBranchSlug` из заголовка для worktree-веток
  (`title-generation.ts:175-186`). **[V]**

## Что перенести в Канопус (отбор по критериям README)

1. **Единый dispatch checkpoint с читаемыми причинами ожидания** (`waitingOn`-словарь + дословные UI-тексты):
   вместо молчаливого «сообщение не ушло» — видимая машиночитаемая причина. Усиливает класс 320 (тихие
   зависания). **[I]**
2. **Режимы start/steer/auto/queue-if-active** с правилом «auto = steer в живой ход» — прямой ответ на вопрос,
   как встраивать слово владельца в автономную работу, не прерывая её. **[I]**
3. **Send-now обходит policy, но не инварианты**: человек всегда может продавить лимитеры, но не сломать
   core-гарантии. Согласуется с правами владельца в модели цели (синтез, раздел 2). **[I]**
4. **Ретрай без дубликатов**: принял input → nudge «Please continue.»; не принял → пересылка дословно; оба
   agent-only. Плюс «ретрай никогда не steer'ит». **[I]**
5. **Auto-resume с честным шаблоном** («остановил рестарт, не пользователь» — иначе агент читает стоп как
   отказ). **[I]**
6. **Коалесцированные системные нотисы** по `coalesceKey` с merge-функцией — батчить однотипные события
   (исходы дочерних окон) вместо спама агенту. **[I]**
7. **Tasks без auto-TODO**: явное создание + report-back contract в seed-промпте + комментарий→steer.
   Совместимо с нашим правилом «новые задачи — только через подтверждение владельца» (task-lifecycle). **[I]**
