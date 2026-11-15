# 296. Отчёт о совместимости: kimi acp как второй агент-бэкенд

Дата: 2026-11-14. Исполнитель: окно агента (ZCode). Согласование — владелец, 2026-11-14, чат («согласовано»).

## Что проверено

Зонд без правок продукта: ровно тот payload, что шлёт наш клиент (`src/acp/client.nv:129-133`), отправлен живому `kimi acp`:
`initialize` (protocolVersion 1, fs read/write false, terminal false, elicitation form, clientInfo canopus 0.1.0) → `session/new` (cwd = репозиторий, mcpServers []). Промпта не было — обращения к модели и к учётке нет.

Локальный kimi: `kimi --version` → 2.1.1 (npm-глобал, уже стоял на машине); свежайший в репо — 2.6.2.

## Результат: совместимо

- **`initialize` OK.** Ответ: `protocolVersion: 1`; `agentCapabilities`: loadSession, promptCapabilities (image true, audio false, embeddedContext true), sessionCapabilities (list, resume, close, delete, fork, additionalDirectories), `mcpCapabilities: {http: true, sse: true}`, authMethods (вход по аккаунту Kimi, терминальный device-code).
- **`session/new` OK.** Ответ: `sessionId` + `configOptions` (select «Model» со списком kimi-моделей и currentValue — наш механизм пресетов `AcpPreset` читает именно такие select'ы).
- **Наш AskSetup ложится:** `mcpCapabilities.http = true` у kimi — значит, наша передача MCP-сервера хаба с `ask_user_question` в `session/new` должна работать; elicitation-форма заявлена нами при initialize, у kimi в capabilities не упомянута — вопрос к реальному ходу, не к рукопожатию.

## Что не проверено (честно)

- ~~Реальный ход с промптом~~ — **проверено 2026-11-14** (см. ниже).
- Версия 2.1.1 ≠ 2.6.2: перед боевой проверкой стоит обновить (`npm i -g @moonshot-ai/kimi-code@latest`). Не блокирует — ход прошёл на 2.1.1.

## Боевой ход (разрешение владельца, 2026-11-14, чат: «согласовано»)

Тот же handshake + `session/prompt` «Ответь одним словом: пинг» (инструменты не нужны; на вопрос-разрешение зонд отвечает отказом). Результат — полный цикл без единой ошибки:

1. Поток kimi до ответа: `available_commands_update` (8 команд) → `session_info_update` (заголовок) → `agent_thought_chunk` (рассуждение, ~15 кусков) → `agent_message_chunk` («понг») → `stopReason: end_turn`.
2. Сверка с нашей проекцией (`src/acp/project.nv:214`): `agent_message_chunk` → наш `agent_chunk`, `agent_thought_chunk` → `agent_thought`, `available_commands_update` и `current_mode_update` — обработаны в `client.nv`; `tool_call`, `tool_call_update`, `plan`, `usage_update`, `config_option_update` — в проекторе есть. Единственный незнакомый вид — `session_info_update` (заголовок сессии) — попадает в `skipped(kind)` и безопасно игнорируется: не падает, ничего не ломает. Если захотим показывать заголовок kimi в UI — это маленькая отдельная правка проектора.
3. Разрешений и вопросов агент в этом ходе не задавал (инструменты не использовались) — ветки `session/request_permission` и `elicitation/create` на реальном потоке пока не гонялись; их контракт у нас уже реализован (задача 192i).

## Вывод

**Совместим — задача 296 проверена на реальном ходе.** Код продукта не менялся; на лайве Kimi Code уже подключён владельцем. Код-ревью и приёмка — за приёмщиком/владельцем по отчёту.
