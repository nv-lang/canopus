# bb: общение между тредами и вложенные (дочерние) треды (исследование 2026-11-26)

Раздел «что перенести» отобран по критериям [doc/research/README.md](README.md).

Повод: владелец спросил, как устроено общение между потоками/сессиями в bb и что за вложенные треды в сайдбаре
(пример: тред «интегратор» с детьми «http», «tls», «compress», «Карина», «alula», «Оракул 0.1.7»).
Источник — `get-bb/bb`, клон только для чтения вне репозитория, тег **`desktop-v0.50.1`**, ревизия
**`a08e116566d1785bc04578a866df8a0359157dd4`** (см. [2026-11-26-bb-architecture.md](2026-11-26-bb-architecture.md)).
Пути — от корня клона.

Обозначения: **[V]** — проверено по коду (путь:строка); **[I]** — вывод.

## Главное

- Вложенность в сайдбаре — отношение **`parentThreadId`**: организационная связь + канал отчётов родителю.
  Дети — полноценные независимые треды со своим провайдером, environment и ходами. **[V]**
- Общение — один канал: `bb thread tell <id>` (сообщение оборачивается `[bb message from thread:…]`) плюс
  **автоматическая доставка финального ответа ребёнка родителю** (`parentNotifications: auto|stuck|off`). **[V]**
- «Кто кому пишет» задано не кодом, а системными инструкциями агенту; код лишь валидирует отправителя. **[V]**
- Отдельного типа «manager» в коде нет — менеджером тред делает практика спавна детей. **[V]**

## 1. Вложенные треды

Вложенность — колонка `threads.parent_thread_id` (`packages/db/src/schema.ts:634-637`); сайдбар группирует
детей под родителем через `childrenByParentId` (плагин `thread-list`,
`plugins/thread-list/app/model/pinned-sidebar-threads.ts:51-64,110`). Глубина иерархии ограничена:
`MAX_THREAD_HIERARCHY_DEPTH = 4` (`apps/server/src/services/threads/thread-parent.ts:6`). **[V]**

**Как создаётся дочерний тред:** **[V]**

- Пользователем — при создании треда в UI или перетаскиванием; родителя можно сменить/снять в любой момент:
  `bb thread update --parent-thread <id> | --clear-parent-thread` (`apps/cli/src/commands/thread/actions.ts:174-175`).
  При снятии родителя ребёнок наследует секцию бывшего родителя
  (`packages/templates/src/templates/bb-guide-thread-messaging.md:60-62`).
- Агентом — `bb thread spawn --parent-self` (родитель = текущий тред через `BB_THREAD_ID`) или
  `--parent-thread <id>`; «Parenting is opt-in» (`packages/templates/src/templates/bb-guide-threads.md:36-37,105-106`).
  Родитель может быть в другом проекте.

**Наследование при спавне ребёнка** (`bb-guide-threads.md:105-121`): видимость (hidden-дети не попадают в
сайдбар, но адресуемы по id); permission mode родителя («Subagents inherit the parent's permission mode by
default… nesting a thread does not cap its permissions»); машина и environment («A child of a live thread in the
same project gets a worktree on its parent's machine; a child of an unmanaged non-Git folder reuses its parent's
environment»). **[V]**

**Три разных отношения** (`docs/system-overview.md:28-34`): **[V]**

| Отношение | Колонка | Смысл |
|---|---|---|
| Sidebar parent | `parentThreadId` | Организация в сайдбаре + канал отчётов родителю; меняется в любой момент |
| Fork source | `sourceThreadId` + `originKind: "fork"` | Тред-клон: скопирована провайдер-сессия и таймлайн; отчётов родителю не даёт — «only source-derived forks stay silent» (`bb-guide-threads.md:112`) |
| Lifecycle owner | `lifecycleOwnerThreadId` | Неизменяемое владение: архивирование владельца каскадно архивирует и останавливает зависимых, удаление — удаляет; stop не каскадирует (`bb-guide-threads.md:178-186`) |

`originKind` имеет ровно одно значение — `["fork"]` (`packages/domain/src/thread-origin-kind.ts:3`); «обычный
дочерний тред» = `parentThreadId != null && originKind == null` — именно это проверяет фильтр отчётов родителю
(`thread-parent.ts:13-31`). **[V]**

## 2. Общение между тредами

### 2.1. `bb thread tell` — единственный канал

Любой тред может отправить сообщение любому: `bb thread tell <id> <message>`, режимы
`--mode steer (default) | queue | auto` (`bb-guide-thread-messaging.md:15-30`). Механика — обычный
`sendThreadMessage` с `senderThreadId` (`apps/server/src/services/threads/thread-send.ts:303-320`); текст
оборачивается шаблоном (`packages/templates/src/templates/agent-thread-message.md`): **[V]**

```
[bb message from thread:{{senderThreadId}}]

{{messageText}}
```

Ответ — тем же `tell` в обратную сторону; отдельного RPC «ответить» нет. **[V]**

**Политика «кто кому пишет»** — системные инструкции, которые bb подкладывает каждому агенту (плагин bb-guide,
`plugins/bb-guide/introduction.ts:8-10`), дословно: **[V]**

> «Do not spawn new threads or message other threads unless the user has explicitly asked you to do so, except
> to answer a thread that messaged you.»

> «Answer a question or request from an agent with `bb thread tell <thread id>`, except your parent thread:
> answer it in your final response, which bb reports to the parent. If `bb status` shows `Parent notifications:
> stuck` or `off`, bb does not report your final response, so send results to the parent with `bb thread tell`.
> Send one message per command… Never send acknowledgements or thanks, and do not wait for a reply to a message
> that asks for nothing.»

Т.е. протокол: ребёнок по умолчанию **не пишет** родителю сам — его финальный ответ хода автоматически
доставляется родителю; `tell` родителю нужен только при `stuck/off`. Жёстких программных запретов «не писать без
запроса» нет — это инструкция; код лишь валидирует отправителя и запрещает отправку в тред, ждущий интеракции
(409, сообщение уходит в очередь до ответа, `bb-guide-thread-messaging.md:24-29`). **[V]**

### 2.2. `parentNotifications`: auto / stuck / off

Колонка `threads.parent_notifications`, default `auto` (`schema.ts:653-657`); фильтр —
`isParentNotifiableChildThread` (`thread-parent.ts:13-31`): **[V]**

- **auto** — ребёнок сообщает о каждом завершённом, упавшем или прерванном ходе и о каждом блокере;
  ход-«только компакция» не репортится; падение до старта хода (в т.ч. провайдер не начал ход за 5 минут)
  репортится как failed.
- **stuck** — пропускает completed; репортит failures, interruptions и блокеры на аппруве/вопросе; результаты
  ребёнок шлёт сам через `bb thread tell` («so say so in its prompt»).
- **off** — ничего; и снятие parent-назначения не уведомляет бывшего родителя.

Значение видно в `bb status` и `bb thread show` (`bb-guide-threads.md:113-121`). **[V]**

### 2.3. Доставка исходов детей родителю (child-thread-notifications)

Механизм — `apps/server/src/services/threads/child-thread-notifications.ts`: **[V]**

- По окончании хода ребёнка сервер собирает `ChildThreadOutcome` (статус, финальный вывод хода до 4000
  символов с маркером `[... output truncated ...]`, причина прерывания, число ещё работающих workflows)
  (`:28-45,90-96,144-168`).
- Уведомления **коалесцируются в батч с окном 2 секунды** (`CHILD_THREAD_TURN_NOTIFICATION_BATCH_DELAY_MS =
  2_000`, `coalesceKey = "child-outcomes"`, `:90-91`) через `postCoalescedSystemNotice` — несколько детей,
  финишировавших одновременно, дают одно сообщение «Child thread updates: …» (`:283-302`).
- Одиночное завершение: `@thread:… completed:\n\n<выдержка финального вывода>`; failed/interrupted:
  `@thread:… failed.\n\nReview the thread before deciding next steps.` (`:191-233`, guidance-строки `:97-103`).
  Если у ребёнка ещё крутится workflow: «A workflow it started is still running, so this output is not its final
  result. The thread will report again when the workflow finishes.» (`:100-103`).
- Причины прерывания называются явно: «because its host connection was lost / host daemon restarted / host was
  removed / provider turn went idle» (`:118-140`).
- Доставка — `queueParentSystemMessage` (`parent-system-messages.ts:149-189`): строка в `queued_thread_messages`
  родителя с `deliveryMode: "steer"` — **встроится steer'ом в живой ход родителя или начнёт новый**; родитель в
  статусе, не принимающем запись, уведомление молча пропускает.
- **Needs help**: ребёнок блокируется на pending interaction → родителю шаблон
  (`packages/templates/src/templates/system-message-child-thread-needs-attention.md`): «{{threadMention}} needs
  help. {{blockerSummary}} — Review the blocker. If you can resolve it from existing context, reply to the thread
  with guidance. Otherwise, ask the user for the missing decision.» Родитель **не может** аппрувить за
  пользователя (editingNotes шаблона) — только дать контекст через `tell`.
- **Ownership-события**: при назначении/снятии родителя старый и новый родитель получают нотисы
  «{{threadMention}} is now a child of this thread.» / «… is no longer a child of this thread.»
  (`system-message-thread-ownership-assigned.md`, `-removed.md`, батч-вариант `-batch.md`).

Все системные сообщения начинаются с префикса `[bb system]` — агент отличает их от слов пользователя и от
`[bb message from thread:…]`. **[V]**

## 3. Модель manager/worker

Отдельного типа «manager» в коде нет — это роль: «Threads can be **standard** (does work directly) or
**manager** (coordinates other threads)» (`docs/system-overview.md:18`); менеджером тред делает практика спавна
детей. (Событие `system/manager/user_message` в `packages/domain/src/thread-event-types.ts:10` — legacy-тип для
старых таймлайнов.) **[V]**

Типичный цикл менеджера (по гайдам, которые bb сам даёт агентам): **[V]**

1. `bb thread spawn --project <id> --parent-self --prompt-file -` — воркер; опции: провайдер/модель, worktree,
   `--visibility hidden` для фоновых воркеров, `--parent-notifications stuck` + явное «send results with
   bb thread tell» в промпте (`bb-guide-threads.md:113-118`).
2. Ожидание: «To follow a child thread, block on `bb thread wait <id>` rather than polling» — с
   `--status/--event/--timeout`, exit-коды 2/3/4 (`bb-guide-thread-inspection.md:112-123`).
3. Сбор результатов: авто-отчёты (auto) или `bb thread output <id>` — финальный вывод треда
   (`bb-guide-thread-inspection.md:108-110`), плюс `@thread:`-mentions для чтения конкретных сообщений.
4. Управление: `tell` (steer/queue), `bb thread stop`, очередь воркера. Concurrency — плагин concurrency-limit
   через dispatch-hook: воркеры встают в очередь `waitingOn: plugin` с видимой причиной, менеджер видит это в
   `bb thread queue list`.

Для массового фан-аута — плагин `workflows` (скрипт → N воркер-тредов → structured results, переживает
рестарты); каждый workflow-worker — lifecycle-dependent своего оригина (`docs/system-overview.md:33-34`). **[V]**

## 4. Side-chat

Плагин `plugins/side-chat` (`PLUGIN_OVERVIEW.md`): действие **Reply in side chat** на любом сообщении (с
выделением — только на выделенном тексте) создаёт **fork** треда в панели рядом; форк копирует разговор до
выбранного сообщения, переиспользует тот же workspace, цитируемый текст передаётся агенту как контекст.
Side-chat'и скрыты из сайдбара; раз в час плагин архивирует side-chat'ы старше 24 ч без пользовательских
сообщений. **Send to main thread** — ответ уходит в исходный тред (или в его очередь, если занят). Агентных
инструментов и CLI плагин не добавляет. Side-chat распознаётся по форме форка (`isSideChatShapedThread`) и,
например, исключается из доставки комментариев tasks (`plugins/tasks/steer/index.ts:41-43`). **[V]**

## 5. Иконки строки треда в сайдбаре

Рендер — `plugins/thread-list/app/rows/ThreadRow.tsx`, слева направо: **[V]**

1. **Иконка провайдера** (`ProviderIcon`, `ThreadRow.tsx:605-628`) — SVG-логотип провайдера треда (Claude Code,
   Codex…); отключается настройкой. Одинаковые иконки у родителя и детей на скриншоте = один провайдер у всех.
2. **Заголовок** (двойной клик — переименование).
3. **Иконка «папка со стрелкой»** (`FolderExport`, `:648-668`) — тред живёт **в другом проекте**, чем секция
   сайдбара; тултип «In project X» / «In another project» (`:341-347`). Поэтому стрелки у детей на скриншоте:
   они заспавнены в другие проекты (`--project`).
4. **Chevron** сворачивания детей — только на родительской строке (`:670-681`).
5. Справа — **статусный глиф** `ThreadStatusGlyph` (`:257-277`) с индикаторами: `unread-error`,
   `waiting-for-input`, `working-draft`, `workflow`, `background-agent`, `background-command`, `plan-mode`,
   `runtime`, `queued-failed`, `draft`, `unread-success`, `queued-waiting`
   (`packages/plugin-sdk/src/app-contract.ts:1386-1398`). Именно он показывает «работает / ждёт ввода / ошибка /
   черновик / ждёт в очереди».

## Разбор примера владельца

«nova — интегратор» — обычный тред, которому через `--parent-self`/`--parent-thread` (или в UI) назначили
детей: «http», «tls», «compress», «Карина», «alula», «Оракул 0.1.7» — worker-треды (заспавнены интегратором или
пользователем для параллельных задач; стрелочки у детей — «тред в другом проекте»). Общение: интегратор шлёт
задания через `bb thread tell` (сообщения приходят с префиксом `[bb message from thread:…]`), дети отвечают
либо финальным ответом хода (при `parentNotifications: auto` он автоматически доставляется интегратору
steer-сообщением `[bb system] @thread:… completed: <вывод>`), либо явным `tell` при `stuck/off`; блокеры детей
прилетают интегратору как «needs help». Иконки у всех одинаковые — логотип провайдера, не тип треда; статус
показывает правый глиф строки. **[I]**

## Что перенести в Канопус (отбор по критериям README)

1. **Три разделённых отношения** (sidebar-parent / fork-source / lifecycle-owner) вместо одного «родителя» —
   организация, происхождение и владение не смешиваются. **[I]**
2. **Авто-доставка финального ответа ребёнка родителю** с режимами auto/stuck/off и коалесцированием в батч
   (2 с окно) — родитель не опрашивает детей и не тонет в уведомлениях. Прямо переносимо на окна Канопуса. **[I]**
3. **Политика общения инструкциями, а не запретами кода**: «не пиши без запроса», «не шли благодарности», «ответ
   родителю — финальным ответом». Дёшево и гибко; код держит только инварианты (валидация отправителя,
   запрет записи в тред с висящей интеракцией). **[I]**
4. **Префиксы источника** `[bb system]` / `[bb message from thread:…]` — агент всегда отличает слово владельца
   от системы и от другого агента. **[I]**
5. **«Needs help» с запретом аппрувить за пользователя**: родитель может дать контекст, но не решение за
   владельца — согласуется с нашим правом владельца на разрешения. **[I]**
6. **Наследование permission mode и environment при спавне ребёнка** + «nesting does not cap permissions». **[I]**
