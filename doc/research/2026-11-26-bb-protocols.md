# Протоколы bb: систематический обзор (исследование 2026-11-26)

Раздел «что перенести» отобран по критериям [doc/research/README.md](README.md).

Повод: владелец попросил обзор протоколов bb. Источник — `get-bb/bb`, клон только для чтения вне репозитория,
тег **`desktop-v0.50.1`**, ревизия **`a08e116566d1785bc04578a866df8a0359157dd4`**
(см. [2026-11-26-bb-architecture.md](2026-11-26-bb-architecture.md)). Пути — от корня клона.

Обозначения: **[V]** — проверено по коду/докам (путь:строка); **[I]** — вывод.

## Главное

- В системе **семь независимых протоколов** плюс канонический формат событий. Два контрактных пакета
  (`server-contract`, `host-daemon-contract`) — жёсткие границы: «Implementation packages never import across
  these boundaries» (`docs/system-overview.md:90-98`). **[V]**
- Общий стиль: все границы — zod-схемы в отдельных contract-пакетах; версионирование либо exact-int (демон),
  либо capability-tolerance (bridge, mobile); события всегда append-only с последовательностью, а live-каналы
  несут только «что изменилось», не «чем стало». **[V]**

## 0. Provider bridge protocol (кратко)

Line-delimited **JSON-RPC 2.0 через stdin/stdout** между agent runtime и процессом-моста провайдера; протокол
версии 2, грамматика дельт `thread/delta` v3 (`grammarVersions: [3,3]`), recovery-hints, record/replay — см.
`docs/provider-bridge-protocol.md` (транспорт :34-47, версионирование :48-89) и разбор
[2026-11-26-bb-architecture.md](2026-11-26-bb-architecture.md), раздел 3. Схемы —
`@bb/provider-bridge-protocol`. **[V]**

## 1. server-contract: клиент ↔ сервер

**Транспорт:** HTTP (Hono) + один WebSocket. REST-маршруты под префиксом `/api/v1/` (`apps/server/src/server.ts:943`),
типизированные через `@bb/hono-typed-routes`: каждый endpoint — `Endpoint<{json: Req}, Res, Status>` в
`packages/server-contract/src/api/*.ts`. Версионирование — в префиксе пути. **[V]**

**WebSocket `/ws`** (`server.ts:983-993`) — realtime-канал: **[V]**

- Клиент → сервер: `subscribe`/`unsubscribe` с target'ом и `ping` (`packages/domain/src/change-kinds.ts:203-237`).
- Targets подписок — discriminated union: `thread-list`, `thread-detail`, `thread-timeline {threadId,
  segmentLimit, deferContent}`, `project-list/detail`, `environment-list/detail`, `host-list`, `plugin
  {pluginId}`, `plugin-read {pluginId, method, read}` (canonical JSON input ≤16 KiB) (`change-kinds.ts:85-198`).
- Сервер → клиент: `changed`-сообщения — **не данные, а уведомления об изменении** (клиент перечитывает по HTTP):
  закрытые словари change-kind'ов — у треда 17 видов (`thread-created`, `events-appended`, `status-changed`,
  `queue-changed`, `interactions-changed`, `history-rewritten`…, `change-kinds.ts:14-32`), у проекта 6, у
  environment 7, у хоста (`host-connected`, `provider-model-catalog-changed`…); плюс `pong` и эфемерные
  `plugin-signal {pluginId, channel, payload}`.
- Отдельные WS: `/ws/terminals/:terminalId` (поток терминала с `sinceSeq`/outputAcks, `server.ts:997-1013`);
  плагинные WS под `/api/v1/plugins/<id>/…` (`apps/server/src/routes/plugins.ts:394-399`).

Публичный API (`public-api.ts`) — тот же `/api/v1` для SDK/CLI/мобильного; на прямом bind неаутентифицирован
(`docs/multiple-devices.md:47-49`), доступ извне — только через account-gate bb connect (раздел 5). **[V]**

## 2. host-daemon-contract: сервер ↔ демон

**Версионирование:** целочисленный `HOST_DAEMON_PROTOCOL_VERSION = 268`; совместима ровно одна версия
(`HOST_DAEMON_COMPATIBLE_PROTOCOL_VERSIONS = [268]`), feature-gates по `>=` для отдельных возможностей
(connect-next 247, desktop-broker-proof 248, cleanup-inspection 249)
(`packages/host-daemon-contract/src/protocol.ts:1-38`). Демон никогда не даунгрейдится. **[V]**

**Подключение (инициирует демон):** **[V]**

1. Enroll: HTTP `POST /hosts/enroll-key` → `POST /hosts/enroll` — получает host key
   (`packages/host-daemon-contract/src/session.ts:1055-1068`).
2. `POST /session/open` — открытие сессии; при более новом сервере демон сам скачивает артефакт, проверяет
   SHA-256 и выходит, чтобы service manager его перезапустил (авто-апдейт, `docs/multiple-devices.md:198-208`).
3. WebSocket `/internal/ws` (`server.ts:1040-1045`): субпротокол `bb-host-daemon.v1`, авторизация
   `Authorization: Bearer <hostKey>` (`session.ts:1121-1135`), query `resumeFrom` + `sessionId`.

**WS-канал с resume** (`packages/host-daemon-contract/src/ws-channel.ts:1-27`): кадры `{seq, ack, message}` со
сквозной нумерацией, ack каждые 64 сообщения или 256 KiB, retention до 16 MiB для переотправки после reconnect;
некорректный resume — close-code 4409; shutdown сервера — reason `daemon-shutdown`. **[V]**

**Команды сервер → демон** — типизированный словарь `hostDaemonRpcCommandSchema`
(`packages/host-daemon-contract/src/commands.ts`), у каждой команды дескриптор: `transport: "onlineRpc" |
"settled"`, `retryable`, `flushEventsBeforeResult`, `envLane` (`commands.ts:1424-1490`). Словарь (~60 команд):
`thread.start`, `turn.submit`, `thread.stop {intent: interrupt|release}`, `thread.rewind.prepare/discard`,
`provider.list_models/health/usage/installation`, `host.read_file(_chunk)/write_file/list_files/mkdir/
move_path/remove_path/browse_directory/pick_folder`, `environment.attach(.cancel)`, `environment.hook.run
{kind: setup|teardown}`, `workspace.commit`, `project.clone/inspect`, `host.list_skills/write_skill/
install_global_skills`, `plugin.host.call/cancel/dispose`, `connect-tunnel.ensure-identity`,
`server_move.inspect/probe/prepare/activate/abort/delete_old_copy`, desktop-брокер `desktop.browser.*`
(управление браузером desktop-приложения с демона). **[V]**

**События демон → сервер** идут не по WS, а HTTP-батчами: `POST /session/events` (`session.ts:1083-1089`) —
сгруппированные по треду конверты `{threadId, events: ThreadEvent[]}` (`session.ts:332-353`); тик постинга 50 мс.
Сервер может отклонить событие с reason `thread_not_owned_by_host` (`session.ts:355-357`). Обратные каналы от
runtime: `POST /session/tool-call` (вызов bb-инструмента агентом) и `POST /session/interactive-request(+
/interrupt)` (аппрувалы/вопросы). Артефакты демон скачивает по HTTP: `/plugins/:pluginId/host/:digest` и
`/skills/tree/:hash(/content)` (`session.ts:1040-1053`). **[V]**

## 3. ACP-kit

`packages/provider-bridge-acp` (публикуется как `@get-bb/plugin-sdk/provider-bridge/acp`) — готовый мост от bb
provider bridge protocol к **ACP** (Agent Client Protocol, JSON-RPC Zed-стиля; Cursor, Amp и др.). Kit берёт
канонические схемы команд bb и добавляет ACP-специфику (`packages/provider-bridge-acp/src/bridge-protocol.ts:1-40`):
свой `model/list` с providerOptions, диалекты (`AcpDialect` — `dialect.ts:38-52`: идентификация tool-call'ов,
presentation делегаций, maintenance-политика, напр. `CURSOR_ACP_MAINTENANCE`), классификация tool-kind'ов ACP в
bb item shapes, перевод `session/update`-нотификаций ACP в `thread/delta` (`delta-translation.ts`),
auth-guidance (маппинг незалогиненного агента в recovery-hint `authRequired`,
`docs/provider-bridge-protocol.md:398-401`). Плагин `plugins/provider-acp` регистрирует через него несколько
провайдеров разом (`docs/provider-plugin-api.md:44-47`). **[V]**

## 4. MCP: bb как MCP-сервер

Плагин `plugins/mcp` (SDK `@modelcontextprotocol/server` ^2.4, `plugins/mcp/package.json:34`). bb expose'ит
MCP-endpoint **наружу**: удалённый адрес на bb connect URL (авторизация bb-аккаунтом + approval на аккаунте;
отзыв — дашборд или `bb mcp revoke <grant-id>`) и локальный адрес для приложений на той же машине
(`plugins/mcp/PLUGIN_OVERVIEW.md`). Всего **три инструмента**: `search` (поиск по командам bb CLI), `read`
(только инспектирующие команды, без подтверждения) и `run` (любые) — выполняют короткий скрипт, вызывающий
`bb` CLI в песочнице на сервере. Доступ all-or-nothing. Реализация: `mcp-handler.ts`, `tools.ts`, `sandbox.ts`,
`policy.ts`, `cli-runner.ts`. MCP-слой не дублирует API — он оборачивает CLI, единый интерфейс агентов. **[V]**

## 5. bb connect: туннели и удалённый доступ

Два поколения (`docs/connect-next.md`, пакеты `tunnel-contract` v1 и `next`): **[V]**

- **v1** (`tunnel-contract/src/index.ts`): свой мультиплексированный бинарный протокол поверх одного WS:
  `PROTOCOL_VERSION = 1` (query `v`), heartbeat `bbt:hb` / `bbt:hb-ack`, 8 типов кадров (`openHttp`, `bodyChunk`,
  `bodyEnd`, `respHead`, `openWs`, `wsOpenAck`, `wsData`, `closeStream`), чанки ≤1 MiB — полный TCP-over-WS
  reverse-proxy: HTTP и даже WebSocket'ы клиентов мультиплексируются в один исходящий туннель. Дубль соединения —
  close reason `replaced by a new tunnel connection`.
- **next** (`tunnel-contract/src/next.ts`): переход на **frp 0.71.0** (`FRP_VERSION`, пакет `frp-client` с
  супервизором бинаря), базовый домен `next.getbb.app`, WS-путь `/~!frp`, credential в meta. Доступ контролирует
  **gate**: подписанные assertion'ы (TTL 60 с, skew 30 с) в заголовке `x-bb-gate-assertion`, виды
  `session | machine | oauth | public`, публичные ключи на `/.well-known/bb-connect-gate-keys.json`; без gate'а
  доступны только install-пути (`/install.sh`, `/install.ps1`, `/install/version`, `/install/bb-app.tgz`)
  (`next.ts:6-28`).

**Пейринг устройств** (`docs/multiple-devices.md:94-149`): QR/код живёт 10 минут и одноразовый
(`bb connect machine-code` → `{code, serverUrl, apex, expiresAt}`); устройство enrol'ится как connect-машина с
собственным credential (в keychain, зашифрован OS), сессии минтятся из него на 7 дней; серверный pairing secret
устройство никогда не держит; отзыв с дашборда гасит сессию за ~20 с; неиспользуемые 14 дней устройства
сворачиваются. OAuth-grant'ы MCP — тот же gate с kind `oauth`. **[V]**

## 6. Плагинный протокол

Три канала для трёх сред плагина: **[V]**

- **Серверная часть — in-process.** Плагин получает `BbPluginApi` напрямую, без IPC:
  `settings/storage/http/rpc/realtime/background/cli/agents/providers/ui/events/hooks/sdk…`
  (`packages/plugin-sdk/src/backend-contract.ts:2255-2340`). Точки контакта: HTTP под
  `/api/v1/plugins/<id>/http/*`, RPC под `/api/v1/plugins/<id>/rpc/<method>` (`defineRpcContract` +
  StandardSchema), эфемерный `realtime.publish(channel, payload)` → WS-сообщение `plugin-signal` всем клиентам
  без подписок и без персистентности (`backend-contract.ts:928-936`).
- **Host-артефакт (`dist/host.js`) — на демоне, через команды.** Сервер вызывает host-entry командой
  `plugin.host.call` (transport `onlineRpc`, не retryable) по демон-WS; `plugin.host.cancel`/`dispose` — отмена и
  остановка (`commands.ts:1700-1726`). Клиентская сторона — `ExperimentalHostClient.call(method, input,
  {hostId, timeoutMs ≤ 30 мин, default 30 с})` + подписки `experimental_onWorkerExit` (только неожиданные выходы)
  и `experimental_onSignal` (`packages/plugin-sdk/src/host-contract.ts:18-57`). Байты артефакта демон кэширует
  по digest.
- **События ядра → плагины (`bb.events.on`)** — закрытый словарь (`backend-contract.ts:315-380`):
  `thread.created/active/idle {lastAssistantText}/failed/archived/unarchived/deleted`, `interaction.pending`,
  `message.queued/dispatched/cancelled {entry}`, экспериментальные (`experimental_thread.read`,
  `experimental_thread.parentChanged`…). Вопросные хуки `experimental_hooks` — сегодня один: `message.dispatch`
  (пропустить/подождать/отказать, `backend-contract.ts:745`).
- **Frontend плагина** — бандл в том же origin; exact-once disposal content-script генераций
  (`packages/plugin-sdk/README.md`). Extension state (`thread/extensionState/updated`, `<pluginId>/<name>`,
  latest-snapshot-wins, валидация на ingest) — `docs/provider-plugin-api.md:304-322`.

## 7. Мобильный протокол

`apps/mobile` — Expo: нативная оболочка (WebView) + **mobile-bridge** между JS веб-приложения и нативным кодом.
Глобальный объект `bb` (`NATIVE_BRIDGE_GLOBAL`), `MOBILE_BRIDGE_VERSION = 4`, минимум 1; сравнение версий —
`supported | older-peer | newer-peer | unsupported` (`packages/mobile-bridge/src/version.ts`). Handshake —
`nativeShellHandshakeSchema`: `{bridgeVersion, appVersion, platform: ios|android, profileMode: direct|connect,
secureContext, safeArea, capabilities}` с capabilities `haptic, badge, share, open-external, safe-area,
open-native` (`packages/mobile-bridge/src/handshake.ts:15-42`). Дальше веб-приложение общается с сервером
обычным server-contract; мост добавляет только нативные возможности. Push — через Expo relay
`https://exp.host/--/api/v2/push/send` (настраивается `expoPushUrl`), Apple/Google-ключи не нужны
(`docs/multiple-devices.md:124-131`). **[V]**

## 8. Канонические форматы событий

- **ThreadEvent** — единый персистируемый формат таймлайна: zod-схема `threadEventSchema`
  (`packages/domain/src/provider-event.ts:807-823`), строка в таблице `events`
  (`packages/db/src/schema.ts:867-951`). Собирается только delta-assembler'ом; словарь типов —
  `thread-event-types.ts` (`turn/*`, `item/*`, `thread/extensionState/updated`, `system/*`, `provider/unhandled`,
  legacy `system/manager/user_message`). **[V]**
- **Plugin events** — производные от ThreadEvent/очереди уведомления для плагинов; не персистируются сами. **[V]**
- **`system/interaction/lifecycle`** — ThreadEvent-тип на каждую смену статуса любой интеракции: запись
  `{id, status, origin, ask, answer}`, payload и resolution спарены по kind
  (`docs/provider-plugin-api.md:396-406`). **[V]**
- **ChangedMessage** (раздел 1) — «транспортный» формат: не событие домена, а подсказка инвалидировать кэш. **[V]**

## 9. Enrollment и жизненный цикл хоста (дополнение 2026-11-27)

Сверка — повторным клоном на том же пине `a08e116`.

- **Пользовательский путь**: Settings → Machines → Add a machine или CLI `bb machine create --provider manual`
  → сервер генерирует однострочник
  `curl -sSL --fail-with-body -H 'X-BB-Enrollment: <credential>' '<serverUrl>/install.sh' | sh`
  (Windows: `irm -Headers @{ 'X-BB-Enrollment' = '…' } '<serverUrl>/install.ps1' | iex`; Node ≥ 22.19, Git for
  Windows) — `apps/server/src/assets/install-machine.sh:10-14`,
  `apps/server/src/services/machines/manual-enrollment-command.ts:6-24`. Команда работает через bb connect,
  Tailscale и любой достижимый адрес. **[V]**
- **Enroll-key**: генерирует сервер (`issueHostEnrollKey`, `apps/server/src/services/machine-auth.ts:365-396`) —
  **одноразовый** (`remaining: 1`, `:377-383`) с **TTL 15 минут** (`ENROLL_KEY_TTL_SECONDS = 60 * 15`, `:16`);
  перевыпуск гасит прежние ключи хоста (`:372`). Сервер отдаёт `/install.sh`, впечатывая bootstrap JSON прямо в
  скрипт (`manual-enrollment-command.ts:60-66`); просроченная/использованная команда возвращает скрипт-ошибку
  «This enrollment command has already been used, replaced, or expired» (`apps/server/src/server.ts:596-606`).
  Управлять хостами может только человек: «Machine credentials cannot manage hosts»
  (`apps/server/src/routes/hosts.ts:89-97`); внутренний `POST /hosts/enroll-key` — только с loopback
  (`apps/server/src/internal/hosts.ts:28,54-73`). **[V]**
- **Инсталлер на машине** (`install-machine.sh`): проверка Node ≥ 22.19 (`:397-407`); data-dir
  `~/.bb-machines/<server-host>` (на каждый сервер свой); скачивание host-пакета **с самого сервера**
  `GET /install/bb-app.tgz` со **сверкой SHA-256** из заголовка `x-bb-artifact-sha256` (совпал с установленным —
  skip; conditional fetch по `If-None-Match`, `:719-776,808`; fallback — npm registry `:840-847`); установка в
  `~/.bb-machines/<server>/npm` без sudo (`:821`); сервис — launchd (macOS) / systemd user unit (Linux)
  (`:168-227`), старт с `--auto-update`; Windows — автозапуск при входе пользователя
  (`docs/multiple-devices.md:156-158`). **[V]**
- **Первое подключение**: `POST /hosts/enroll` — демон предъявляет одноразовый enroll-key, сервер гасит его и
  выпускает **постоянный host key** (`machine-auth.ts:359-364`; маршрут `internal/hosts.ts:82-104`) →
  `POST /session/open` → WS `/internal/ws` (`Bearer <hostKey>`, субпротокол `bb-host-daemon.v1`, seq/ack-кадры
  с resume — раздел 2). Строка в `hosts` создана при генерации команды (phase `creating → active`,
  `packages/db/src/schema.ts:104-152`); UI узнаёт через change-уведомление `host-connected`
  (`packages/domain/src/change-kinds.ts:56-63`). **[V]**
- **Отзыв**: `DELETE` хоста гасит оба ключа — enrol и daemon (`revokeHostAuthKeys`, `machine-auth.ts:407-413`);
  connect-credential отзывается с дашборда getbb.app (при недоступности connect — явное предупреждение в лог,
  `routes/hosts.ts:130-137`); удаление — фазы `removing → destroyed` с ретраями (`removeRetryAt`,
  `teardownAttempt/teardownStatus`, `schema.ts:133-141`); серверную машину удалить нельзя
  (`assertNotServerMachine`, `routes/hosts.ts:99-107`); локальный деинсталл —
  `install.sh --uninstall --host-id <id>` (`install-machine.sh:8`). **[V]**

### Что перенести в Канопус (enrollment)

1. **Одноразовый короткоживущий enroll-key с обменом на постоянный ключ** (15 мин, `remaining: 1`, перевыпуск
   гасит прежние) — компрометация команды установки не даёт повторного входа. **[I]**
2. **Bootstrap, впечатанный в скрипт установки** — владельцу нечего копировать руками, просроченная команда
   честно отвечает ошибкой. **[I]**
3. **Артефакт демона с SHA-256 с самого сервера** (+ skip при совпадении digest) — машина исполняет ровно тот
   код, что выдал сервер, без доверия к registry. **[I]**
4. **Исходящий WS от демона** (входящих портов на машине не нужно) + seq/ack-resume — NAT-friendly и
   восстановление после обрыва; у нас уже записано в разделе «Что перенести» (п. 3), здесь подтверждено на
   enrollment-пути. **[I]**

## Сводная таблица

| Протокол | Транспорт | Кодирование | Кто инициирует | Версия |
|---|---|---|---|---|
| Provider bridge | stdin/stdout процесса | JSON-RPC 2.0 | runtime (spawn моста) | protocol 2 + grammar [3,3] |
| Клиент↔сервер | HTTP `/api/v1` + WS `/ws` | typed REST + change-уведомления | клиент | префикс v1 |
| Сервер↔демон | WS `/internal/ws` (команды) + HTTP (события/артефакты) | seq/ack-кадры, JSON | демон (enroll→session/open→WS) | int 268, exact match |
| ACP | stdin/stdout агента | JSON-RPC (ACP) | ACP-kit внутри моста | по агенту |
| MCP | HTTP (connect URL / local) | MCP (JSON-RPC) | внешнее приложение | SDK 2.4 |
| bb connect v1 | один WS наружу | бинарный мультиплекс (8 кадров) | bb-сервер | v=1 |
| bb connect next | frp по WS `/~!frp` + gate JWT | frp 0.71 | bb-сервер / машины | frp + assertion v1 |
| Плагин server↔host | команды демона `plugin.host.call` | RPC-контракты (StandardSchema) | сервер | digest артефакта |
| Mobile bridge | JS-global `bb` в WebView | JSON handshake/messages | нативная оболочка | bridge v4 (min 1) |

## Что перенести в Канопус (отбор по критериям README)

1. **Отдельные contract-пакеты как жёсткие границы**: реализации не импортируют через границу, только контракт.
   У нас — схемы в отдельном модуле, общем для хаба и клиента. **[I]**
2. **Live-канал несёт «что изменилось», не «чем стало»**: change-kind'ы из закрытого словаря, клиент
   перечитывает по запросу — дешёвый WS и отсутствие рассинхрона. **[I]**
3. **WS с resume**: кадры `{seq, ack}` + retention для переотправки после reconnect — прямо переносимо на канал
   хаб↔демон/клиент, где сейчас обрыв теряет события. **[I]**
4. **Exact-int версионирование там, где обе стороны наши** (демон), capability-tolerance там, где чужие
   (bridge, mobile) — два разных режима совместимости осознанно. **[I]**
5. **MCP как обёртка над CLI, а не дубль API**: три инструмента (search/read/run) с песочницей — единая точка
   правды в CLI. **[I]**
6. **Команды с декларативным дескриптором** (`transport`, `retryable`, `flushEventsBeforeResult`) — семантика
   доставки объявлена рядом с командой, а не размазана по вызывающим. **[I]**
