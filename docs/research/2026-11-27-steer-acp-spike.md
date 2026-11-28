# Спайк: steer через ACP (второй `session/prompt` в активном ходу)

Дата: 2026-11-27. Задача: понять, что происходит, если отправить второй `session/prompt` в сессию, пока первый ход
ещё не завершён, и какой вариант «steer» (вмешательства пользователя в идущий ход) реализуем в Канопусе.

Пробы — живые, на тестовых сессиях во временной папке `C:/work/steer-probe` (вне репозитория). Скрипт-пробник
`C:/work/steer-probe/probe.mjs`, сырые JSON-RPC логи — `C:/work/steer-probe/logs/<агент>-<проба>.jsonl`.

## 1. Спека и наш код

- **Спека ACP** ([prompt-turn](https://agentclientprotocol.com/protocol/prompt-turn)): второй `session/prompt` при
  открытом ходу не определён вообще — ни ошибки, ни очереди, ни steer. Единственное вмешательство —
  `session/cancel`: «Clients MAY cancel an ongoing prompt turn at any time», агент обязан ответить на висящий
  `session/prompt` с `stopReason: cancelled`. Локальный конспект: `doc/research/acp-client-spec.md:33`,
  `doc/research/acp-client-spec.md:131-136`.
- **Наш клиент** `src/acp/client.nv` одноходовый by design: один слот `@prompt_rpc` + `@active`
  (`src/acp/client.nv:961-964`), помпа блокируется при открытом ходу (`src/acp/client.nv:955`), `send` только в
  `@queue` (`src/acp/client.nv:1057-1069`). При втором prompt «в лоб»: ответ первого перестанет матчиться
  (`src/acp/client.nv:515`, `src/acp/client.nv:530`), чанки двух ходов сольются в один `@active`
  (`src/acp/client.nv:606-611`), `stop_event` первого закроет запрос второго.
- **Машина** `dialog.alula`: в состоянии ОЖИДАНИЕ строки для `сообщение_пользователя` нет — второе сообщение
  игнорируется с `event_ignored` (`machines/product/dialog.alula.md:9`, `machines/product/dialog.alula.md:69-91`);
  хаб отказывает «ход ещё идёт» (`src/hub/routes_hub.nv:883-885`). Зато `cancel_request` из ОЖИДАНИЯ доступен
  (`machines/product/dialog.alula.md:63`) — последовательность «cancel → немедленный новый prompt» машине доступна
  без переделки таблицы. Есть механизм `@handoff_context` + «[Новое сообщение пользователя]»
  (`src/acp/client.nv:970-973`).
- **Команды агентов**: Kimi — `kimi.cmd acp` (`src/server/README.md:590`); Codex — мост `codex-acp` 2.2.2 через
  `npx` (`README.md:173`, `README.md:241`); ZCode — мост `zcode-acp-server@0.84.2`
  (`scripts/zcode-acp/package.json:3`); Claude — `claude-agent-acp` 0.94.0 (`README.md:172`, `README.md:239`).

## 2. Пробы

Методика. Пробник — Node.js, JSON-RPC 2.0 newline-delimited через stdio:
`initialize (protocolVersion 1)` → `authenticate` при необходимости → `session/new` (cwd = временная папка,
`mcpServers: []`).

- **Проба A (steer-passthrough)**: `session/prompt` с долгой задачей («Посчитай от 1 до 100, перед каждым числом
  отдельное короткое размышление»), после начала апдейтов второй `session/prompt` в ту же сессию
  («Стоп, вместо этого напиши слово ПЕРЕХВАЧЕНО»).
- **Проба B (cancel+resume)**: в активном ходу `session/cancel` → дождаться `stopReason: cancelled` → немедленно
  новый `session/prompt` («Напиши одно слово: ГОТОВО»).

Пробы по одному агенту за раз, таймауты 2-3 минуты, процессы убивались после пробы.

### 2.1. Kimi (`kimi-code` 2.1.1, `main.mjs acp`)

Логи: `kimi-probeA.jsonl`, `kimi-probeB.jsonl`.

- Auth: `authMethods` содержит только `terminal login`; `authenticate {methodId: "login"}` проходит сразу
  (машина залогинена), `session/new` успешен.
- **Проба A**: второй `session/prompt` отклонён сразу (t=45.59 против t=45.57 отправки) ошибкой JSON-RPC:
  `{"code":-32600,"message":"Invalid request: another turn is already in progress","data":{"code":"turn.agent_busy"}}`.
  Первый ход при этом **не прерван** — продолжал слать `agent_message_chunk` до конца наблюдения. Склейки нет.
- **Проба B**: `session/cancel` → ответ на висящий prompt за ~20 мс с `stopReason: cancelled`; немедленный новый
  prompt принят и завершился `end_turn` с ответом «ГОТОВО».

Вывод: чистое, предсказуемое поведение — второй prompt отвергается с кодом `turn.agent_busy`, cancel+resume работает.

### 2.2. Codex (`codex-acp` 2.2.2, ChatGPT-auth)

Логи: `codex-probeA.jsonl`, `codex-probeB.jsonl`.

- Auth: метод `api-key` не настроен (`CODEX_API_KEY or OPENAI_API_KEY is not set`), метод `chat-gpt` проходит.
  Модель принудительно `gpt-6.1-terra[low]` через `session/set_model`.
- **Проба A**: второй `session/prompt` **принят без ошибки**, но семантика непрозрачна: первый ход не прерван и не
  перехвачен — агент досчитал до 100 полностью, а затем в том же потоке апдейтов дописал «ПЕРЕХВАЧЕНО».
  `stopReason: end_turn` пришёл **только на второй** запрос (id=7, t=47.84); на первый `session/prompt` (id=6)
  ответ не пришёл **никогда** (наблюдение до t=168). То есть мост молча «переехал» ответом на новый запрос, а старый
  повис — для одноходового клиента это потеря слота навсегда.
- **Проба B**: `session/cancel` → `stopReason: cancelled` за ~30 мс; новый prompt сразу после — `end_turn`,
  ответ «ГОТОВО» (пристыкован к оборванному тексту счёта: «…половина трГОТОВО» — сам ход отменён корректно,
  склейка только визуальная в конкатенации чанков).

Вывод: passthrough формально «принят», но ответ на первый запрос теряется — поведение несовместимо с нашим
одноходовым клиентом; cancel+resume работает быстро и надёжно.

### 2.3. ZCode (`zcode-acp-server` 0.84.2 → zcode CLI)

Логи: `zcode-probeA.jsonl`, `zcode-probeB.jsonl`.

- Запуск моста требует `ZCODE_BIN` (по умолчанию `D:/Program Files/ZCode/resources/glm/zcode.cjs`, как в
  `scripts/zai-acp.mjs:183`); без него — `zcode not found` и `session/new` падает с `-32603`. Это особенность
  пробной среды, не репозитория (хаб передаёт `ZCODE_BIN` сам).
- **Проба A** (дважды: GLM-5.3 и GLM-5.3-Flash через `session/set_config_option`): **заблокирована квотой** —
  оба хода упали с `-32603 "ZCode turn failed: 1310 [1310][Weekly/Monthly Limit Exhausted. Your limit will reset
  at 2026-11-28 06:11:31]"` (`data.type: zcode_turn_failed`). Лимит аккаунтный, Flash его не обходит.
- **Проба B**: не выполнялась по той же причине.
- Побочные наблюдения, полезные для клиента: мост отвечает на `session/prompt` **ошибкой JSON-RPC**
  (`-32603 zcode_turn_failed`), а не `stopReason`, когда ход падает на бэкенде; после такого ответа сессия остаётся
  живой и следующий prompt принимается (второй prompt в пробе получил собственный ответ, а не отказ «ход идёт»).
  Повтор пробы запланирован после сброса квоты (2026-11-28 утро).

### 2.4. Claude (`claude-agent-acp` 0.94.0)

Не пробовался (опционально; Kimi и Codex уже покрывают оба полюса поведения).

## 3. Вывод: какой steer реализуем

Три возможных уровня:

1. **Steer-passthrough** — агент принимает `session/prompt` в активном ходу и учитывает его.
2. **Soft-steer на границе запроса** — держать сообщение пользователя и подавать его между tool-запросами/ходами.
3. **Cancel+resume («бедный steer»)** — `session/cancel`, дождаться `cancelled`, немедленно отправить новый prompt
   (с контекстом через `@handoff_context`).

| Агент | Проба A (prompt в активном ходу) | Проба B (cancel → prompt) |
|---|---|---|
| Kimi 2.1.1 | отказ `-32600 turn.agent_busy`, ход 1 продолжается | cancelled за ~20 мс, новый ход работает |
| Codex-ACP 2.2.2 | принят, но ответ на 1-й запрос **теряется навсегда**; ход 1 не перехвачен | cancelled за ~30 мс, новый ход работает |
| ZCode 0.84.2 | не снято: квота GLM исчерпана (1310), сброс 2026-11-28 | не снято (та же квота) |

### Вывод

- **Уровень 1 (steer-passthrough) — не реализуем переносимо.** Спека его не определяет, и живые агенты ведут себя
  несовместимо: Kimi честно отказывает (`turn.agent_busy`), Codex молча принимает и **теряет ответ на первый
  запрос** — для одноходового клиента (`@prompt_rpc`, `src/acp/client.nv:961-964`) это зависший слот навсегда.
  Даже там, где «принято», перехвата хода нет: Codex досчитал до 100 и лишь потом дописал ПЕРЕХВАЧЕНО.
- **Уровень 3 (cancel+resume) — реализуем, цена минимальна.** У обоих проверенных агентов `session/cancel`
  отвечает `cancelled` за десятки миллисекунд, и немедленный новый `session/prompt` работает без ожиданий.
  Машина `dialog.alula` это уже позволяет: `cancel_request` доступен из ОЖИДАНИЯ (`machines/product/dialog.alula.md:63`),
  а перенос текста пользователя — через `@handoff_context` + «[Новое сообщение пользователя]»
  (`src/acp/client.nv:970-973`). Нужно только: на «сообщение пользователя в активном ходу» хаб делает
  cancel → по `stopReason: cancelled` шлёт новый prompt с handoff-контекстом. Таблицу переходов переделывать
  не требуется.
- **Уровень 2 (soft-steer на границе)** — запасной вариант без требований к агенту (хаб копит сообщение и подаёт
  после конца хода), но это не вмешательство в ход; имеет смысл как поведение по умолчанию, если cancel+resume
  у конкретного агента сломается (кандидат — ZCode, проба отложена из-за квоты).

Итого: steer в Канопусе = **cancel+resume** (уровень 3) с фолбэком на очередь (уровень 2); passthrough не
использовать даже там, где агент его «принимает» (Codex), — семантика ответа ломается.

Открытое: доснять ZCode после сброса квоты; при желании — Claude (`claude-agent-acp` 0.94.0) как третий полюс.
