# Архитектура bb: хаб + демоны, provider bridge, плагины без привилегий (исследование 2026-11-26)

Раздел «что перенести» отобран по критериям [doc/research/README.md](README.md).

Повод: владелец назначил bb **главным донором проекта** (2026-11-26) и попросил разбор архитектуры.
Источник — открытый репозиторий `get-bb/bb`, клон только для чтения вне репозитория, тег **`desktop-v0.50.1`**
(ровно та версия, что установлена у владельца), ревизия **`a08e116566d1785bc04578a866df8a0359157dd4`**
(TypeScript, pnpm-workspace + turbo). Всё ниже — чтение исходников, без запуска. Пути — от корня клона.

Обозначения: **[V]** — проверено по коду/докам (путь:строка); **[I]** — вывод.

## 1. Структура монорепо

Три слоя: `apps/` (процессы), `packages/` (библиотеки и контракты), `plugins/` (весь продуктовый и
provider-специфичный функционал), `docs/`.

Приложения (`docs/repository-overview.md:7-8`, `docs/system-overview.md:7-8`): **[V]**

| App | Роль |
|---|---|
| `apps/server` | Центральный хаб: HTTP API + WebSocket, SQLite как источник истины, сам stateless; маршрутизирует работу на хосты через daemon WebSocket |
| `apps/host-daemon` | Демон на каждой исполнительной машине: провижинит workspace'ы, запускает provider-процессы, шлёт события батчами; локальный HTTP API для app/CLI |
| `apps/app` | Веб-UI (React) |
| `apps/cli` | `bb` CLI — first-class интерфейс и для людей, и для агентов |
| `apps/desktop` | Electron-оболочка, супервизирует упакованный runtime |
| `apps/mobile` | Expo-клиент (iOS/Android) |
| `apps/web`, `connect(-next)`, `tunnel-*` | getbb.app и инфраструктура bb connect (Cloudflare Workers, туннели frp) |

Ключевые пакеты (`packages/`): **[V]**

- `bb-app` — публикуемый npm-пакет (`npx bb-app`): лаунчер + CLI + SDK-экспорт.
- `agent-runtime` — runtime-адаптеры и мосты провайдеров (Codex, Claude Code, Pi, ACP).
- `db` — SQLite-схема (Drizzle), миграции, data-access (`packages/db/src/schema.ts`).
- `domain` — доменные машины состояний (`thread-lifecycle.ts`, `environment-lifecycle.ts`; из них генерируется
  `docs/lifecycle-diagrams.md`).
- Два контрактных пакета — жёсткие границы: `@bb/server-contract` (клиент↔сервер) и `@bb/host-daemon-contract`
  (сервер↔демоны): «сервер не знает, как провижинятся workspace'ы; демон не знает про треды и проекты»
  (`docs/system-overview.md:90-98`).
- Provider-стек: `provider-bridge-protocol` (схемы JSON-RPC), `provider-bridge-acp`, `provider-parity`
  (replay-тесты по записям).
- Плагинный стек: `plugin-sdk` (`@get-bb/plugin-sdk`), `plugin-build`, `plugin-registry` (компонентный реестр UI),
  `bundled-plugins`.
- Прочее: `secret-storage`, `host-watcher`, `environment-provider-host`, `skill-index`, `thread-view`,
  `core-ui`/`shared-ui`, `file-transfer`, `mobile-bridge`, `frp-client`.

## 2. Модель выполнения

Сущности (`docs/system-overview.md:14-24`): **Project → Sources** (путь к коду на конкретном хосте; один проект
может жить на нескольких машинах) → **Thread** (единица работы, разговор с провайдером; бывают standard и
manager, умеют владеть дочерними тредами) → **Environment** (привязка workspace к хосту; unmanaged или managed,
чистится, когда не осталось живых тредов). Хост — долгоживущая идентичность демона; сервер сам работает на одном
хосте (`primaryHostId`) и может enrol'ить удалённые. **[V]**

Тред-лайфцикл — конечный автомат `pending/idle/starting/active/stopping/error` (`docs/lifecycle-diagrams.md:25-47`);
единственный писатель статуса — машина в `apps/server/src/services/threads/lifecycle/machine.ts` (там же
turn-запросы, ожидающие ответа демона, и owed-stop). Три независимых отношения между тредами: sidebar
`parentThreadId`, fork `sourceThreadId`, `lifecycleOwnerThreadId` (каскадное архивирование/удаление,
`docs/system-overview.md:28-52`). **[V]**

## 3. Provider bridge protocol — главный шов

Line-delimited **JSON-RPC 2.0 через stdin/stdout** процесса-моста, протокол версии 2
(`docs/provider-bridge-protocol.md`). **[V]**

Принцип: **«мост знает диалект, runtime знает таймлайн»**. Bridge парсит трафик провайдера в узкую грамматику
семантических дельт `thread/delta` (turn.open, item.open/close, item.textDelta, usage, contextWindow,
session.reset…), а **delta assembler** в демоне владеет всеми инвариантами таймлайна: минтинг turn/item id,
жизненный цикл, порядок, коалесцирование текстовых дельт (окно 50 мс), settlement. Все id, попадающие в
персистентность, минтит bb-код, никогда провайдер (`docs/provider-bridge-protocol.md:423-443`). **[V]**

Грамматика v3 (`grammarVersions: [3,3]`); core item kinds: `message, reasoning, plan, command, fileChange,
fileRead, search, webSearch, webFetch, imageView, imageGeneration, backgroundTask, delegation, planSteps,
compaction, tool` (`docs/provider-plugin-api.md:296-302`). Всё остальное — extension kinds `"<pluginId>/<name>"`
с обязательным декларативным `presentation` (label/icon/detail/tint), персистируемым вместе с item: строка
рендерится даже после удаления плагина. **[V]**

Поток событий в UI: провайдер → bridge (`thread/delta`) → assembler → канонические `ThreadEvent` → host-daemon
постит батчами (тик 50 мс) на сервер → вставка в таблицу `events` → WS-уведомления клиентам → серверная проекция
в `TimelineRow { kind, payload, presentation }` (`docs/provider-plugin-api.md:432-437`). **[V]**

Recovery типизирован, никогда не по тексту ошибки: `provider/recovery { kind: sessionArchived | authRequired |
restartRecommended | staleTurn | rateLimited }` (`docs/provider-bridge-protocol.md:371-421`). **[V]**

Провайдеры: Codex, Claude Code, Pi — first-party плагины-мосты; ACP-агенты (Cursor, Amp, …) через общий ACP-kit
(`@get-bb/plugin-sdk/provider-bridge/acp`); один плагин может регистрировать несколько провайдеров
(`docs/provider-plugin-api.md:44-47`). **[V]**

## 4. Хранение

SQLite через Drizzle, ~50 таблиц (`packages/db/src/schema.ts`). Главное: **[V]**

- `threads` (`schema.ts:609`) — статус, `parentThreadId`/`lifecycleOwnerThreadId`/`sourceThreadId`, visibility,
  архив/pin/delete.
- `events` (`schema.ts:867`) — append-only поток: `threadId + sequence` (unique), `scopeKind` turn|thread (CHECK),
  `turnId`, `itemId`, `itemKind`, `type`, JSON `data`; партиальные индексы под запросы таймлайна; отдельные
  `retained_event_outputs` для сохранённых выводов; курсоры прунинга (`thread_pruning_cursors`).
- `queued_thread_messages` (`schema.ts:1084`) — **дурабельная очередь сообщений**: состояния
  `queued/scheduled/waiting/claimed/failed_retrying/failed_exhausted` (жёсткий CHECK на форму каждого состояния),
  `nextAttemptAt`/`failureCount` для ретраев, `claimToken` для эксклюзивного захвата, `coalesceKey`,
  `deliveryMode: steer|...`, `retryOfTurnRequestId`. Переживает рестарт сервера; environment provisioning не теряет
  первое сообщение (`docs/environment-provisioning.md:25-27`).
- `thread_turn_requests` — журнал turn-запросов к демону с фазами.
- Плагины: `plugins`, `plugin_artifacts` (content-addressed бандлы), `plugin_state_snapshots`, `plugin_kv`,
  `plugin_settings`, `plugin_schedules` (cron).
- Прочее: `hosts`, `host_daemon_sessions`, `environments`, `provider_model_catalogs`, `terminal_sessions`,
  `pending_interactions` (аппрувалы/вопросы), `sweep_item_failures` (дурабельные ретраи фоновых sweep-задач,
  `docs/system-overview.md:60-88`), `thread_purges` (пакетное удаление строк удалённых тредов малыми срезами по
  10 мс).

Переживает рестарт всё: треды, события, очереди, pending-интеракции, ретраи, кэши каталогов; демоны
переподключаются, сессии провайдеров резюмятся по `providerThreadId`. **[V]**

## 5. Плагинная система

SDK — `@get-bb/plugin-sdk`; контракт — `BbPluginApi` (`packages/plugin-sdk/src/backend-contract.ts:2255`).
Плагин имеет серверную часть, опциональный `bb.host`-артефакт (host-side, там живёт provider bridge) и
frontend-бандл. Поверхности расширения: **[V]**

- `cli` — свои подкоманды `bb <plugin> …`;
- `agents` — **agent tools** (`registerTool`, zod-схемы) + per-turn инструкции/skills через `configure()`
  (`backend-contract.ts:1685-1725`);
- `providers.register` — целые провайдеры;
- `experimental_environments` / `experimental_machines` — свои environment-провайдеры и машины;
- `http`/`rpc`/`realtime`/`background` (long-lived сервисы + cron);
- `settings`, `storage` (KV + per-plugin DB);
- `ui` + frontend slots (timeline renderer, pending-interaction формы, nav panels, composer customization,
  app overlay, content scripts);
- `experimental_hooks` — dispatch-checkpoint (пропустить/поставить в очередь/отказать ходу);
- `experimental_aiServices` — helper-задачи: заголовки тредов, commit-сообщения, **voice-транскрипция**
  (`backend-contract.ts:2310-2312`).

Принцип **«zero first-party privilege»**: first-party плагины используют только публичный API; «everything a
provider touches is owned by its plugin» (`docs/provider-plugin-api.md:19-28`). Даже sidebar, навигация и
composer — плагины (`thread-list`, `navigation`, `composer`). **[V]**

Дистрибуция: content-addressed артефакты; демон скачивает `dist/host.js`, проверяет digest, запускает своим
node — нет daemon-bundled provider path (`docs/provider-plugin-api.md:479-489`). Маркетплейсы —
`plugin_marketplaces`. «Forkable plugins»: список встроенных плагинов, гарантированно собирающихся вне репо
только на публичном SDK, проверяется lint-правилом и CI (`docs/forkable-plugins.md:1-33`). **[V]**

Встроенные плагины (48 в `plugins/`) показывают ширину платформы: провайдеры (`provider-codex`,
`provider-claude-code`, `provider-pi`, `provider-acp`); environment-провайдеры (`environment-git-worktree`,
`environment-personal-workspace`, `environment-modal-sandbox`); продукт: `workflows` (фан-аут по агентам со
structured output, переживает рестарты), `automations` (расписания), `tasks`, `side-chat` (fork рядом с тредом),
`memory` (кросс-тредовая память агентов), `mcp` (управление bb извне по MCP), `account-pool` (пул аккаунтов
Claude/Codex с выбором при лимитах), `concurrency-limit`, `provider-retry`, `secrets` (маскированная форма →
dotenv на хосте), `browser-automation`, `push-notifications`, `scheduled-send`, `github(-pr-status)`, `git`,
`docs` (совместное редактирование Markdown с агентом), `inline-vis`, `keep-awake`, `bb-ai` (облачные
title/commit/voice). **[V]**

## 6. Хосты и окружения

- Enrolled hosts: one-line installer ставит host-only пакет `bb-app` с маршрута `/install/bb-app.tgz` сервера
  (SHA-256, без sudo), systemd/launchd-сервис, отдельный data-dir `~/.bb-machines/<server>` на каждый сервер —
  одна машина может обслуживать несколько bb-серверов; авто-апдейт демона по протоколу сервера с экспоненциальным
  backoff, без даунгрейдов (`docs/multiple-devices.md:151-208`). **[V]**
- Concurrency: плагин `concurrency-limit` — авто-лимит «один running thread на процессор» на хост, per-host
  override, глобальный лимит; сообщение к idle-треду ждёт в очереди с видимой причиной
  (`plugins/concurrency-limit/PLUGIN_OVERVIEW.md`). **[V]**
- Environments: `creating → provisioning → ready/error/destroyed` (`docs/lifecycle-diagrams.md:51-68`); claim пути
  до мутации, общие environment'ы живут до последнего треда, cleanup переживает рестарт. Managed worktrees —
  плагин `environment-git-worktree`: `git worktree add` на свежей ветке в
  `~/.bb/plugins/environment-git-worktree/host-data/worktrees/<thread-id>/`, `.worktreeinclude` (gitignore-синтаксис
  для копирования локальных файлов), `.bb-env-setup.sh` / `.bb-env-teardown.sh` (15-мин таймаут, bash на всех
  платформах), безопасное удаление веток только если ничего не потеряется (`docs/worktrees.md`). **[V]**
- **Выбор машины при создании треда** (дополнение 2026-11-27; сверка выполнена повторным клоном на том же пине
  `a08e116`): CLI — `bb thread spawn --machine <id-or-name>` («Execution machine ID or unambiguous name»),
  `--host` — алиас; для провайдеров машин — `--new-machine <provider-id>` + `--machine-inputs <json>`
  (`apps/cli/src/commands/thread/spawn.ts:355-367`). `--machine` несовместим с явным `--environment` — «it
  already selects its machine» (`packages/templates/src/templates/bb-guide-threads.md:100-104`). UI — выбор
  хоста внутри environment-пикера композера (`apps/app/src/components/pickers/EnvironmentPicker.tsx:45-96`).
  Серверный резолв — `resolveCreateThreadEnvironment` (`apps/server/src/services/threads/thread-default-policy.ts:364`)
  → placement (`thread-environment-placement.ts:461`, `machine: { type: "existing", hostId }`); команда треда
  уходит на `environment.hostId` (`dispatch-attempt.ts:201-208`, `thread-send.ts:796-809`). Ребёнок живого
  родителя в том же проекте получает worktree на хосте родительского environment —
  `hostId: parentEnvironment.hostId` (`thread-default-policy.ts:420-443`). **[V]**

## 7. Уникальное и интересное

1. **Всё provider-specific — в плагинах, ядро generic.** Даже Codex/Claude Code — обычные плагины без привилегий;
   ядро оперирует закрытым семантическим словарём + extension kinds с декларативным presentation, персистируемым
   в строке. Ни одной таблицы tool-name в ядре (`docs/provider-plugin-api.md:14-28,363-369`). **[V]**
2. **Разделение «bridge знает диалект, assembler владеет таймлайном»**: провайдер никогда не минтит id;
   conformance-kit и host-side live-enforcement грамматики на приёме событий
   (`docs/provider-bridge-protocol.md:535-544`). **[V]**
3. **Record/replay/parity-инфраструктура**: запись всех четырёх направлений трафика (runtime↔bridge,
   bridge↔provider) в NDJSON, редактированные записи в git, replay каждой ячейки на каждом коммите с пинами
   счётчиков событий, scenario-проверки (steer-race, provider-exit, settings-follow-up)
   (`docs/provider-bridge-protocol.md:621-754`). Редкость для такого класса инструментов. **[V]**
4. **Дурабельная очередь сообщений** с claim-токенами, лестницей ретраев и CHECK-констрейнтами на форму
   состояния — очередь и ретраи живут в БД, а не в памяти (`schema.ts:1084-1192`). **[V]**
5. **Typed recovery hints** вместо матчинга текста ошибок — runtime действует по `kind`
   (`docs/provider-bridge-protocol.md:371-385`). **[V]**
6. **Продукт как плагины**: sidebar, composer, навигация, список тредов — встроенные плагины; «Plugin Guide»
   (wireframes) и CI-гарантия форкабельности. **[V]**
7. **bb connect / multi-device**: туннель с аккаунт-гейтом (frp), мобильные клиенты с device-credential в
   keychain и отзывом за ~20 с, QR-пейринг с 10-минутными одноразовыми кодами; браузер — «control surface»,
   машина — «execution machine», независимо (`docs/multiple-devices.md`). **[V]**
8. **Voice input как plugin AI-service** (`transcribe` в `experimental_aiServices`, `backend-contract.ts:2063`),
   push через Expo без Apple/Google-ключей, `agent-annotations` (клик по элементу в браузере → аннотация в
   промпт), `account-pool` (фейловер между аккаунтами провайдера). **[V]**
9. **Lifecycle ownership как отдельное отношение** с каскадами и фоновым батч-пуржингом строк (`thread_purges`,
   10-мс срезы, уступает живому трафику) — продуманная GC-модель для event-sourced данных. **[V]**

## Что перенести в Канопус (отбор по критериям README)

1. Разделение «шов знает диалект, рантайм владеет таймлайном»: id минтит только наш код, recovery — типизированный.
   Согласуется с задачей 302 (ACP-шов, явная проверка возможностей). **[I]**
2. Дурабельная очередь сообщений в БД с claim-токенами и машиночитаемыми состояниями вместо очереди в памяти. **[I]**
3. Extension state как generic-механизм журнала (kind + payload + presentation) — уже легло в модель цели
   ([2026-11-26-bb-goals.md](2026-11-26-bb-goals.md), раздел «Что перенести»). **[I]**
4. Record/replay по записям трафика как способ тестирования шва без живого провайдера. **[I]**
5. Типизированные recovery-хинты вместо разбора текстов ошибок — усиливает класс 317. **[I]**
