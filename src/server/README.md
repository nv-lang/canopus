# server: the session server of the product

## Родные подтверждения по семьям (272)

`session_setting` принимает `{family,setting:"mode",value:<точный native id>}`.
При создании сессии `approvals:{family:modeId}` переносит выбор черновика.
Запрошенные значения сохраняются по сессии/семье существующим `setting_chosen`, независимо от source, model, effort и pool level.
`session_model` сообщает фактический режим ACP; сохранённый выбор не выдаётся за подтверждение неактивного адаптера.
Неизвестный режим остаётся блокирующим намерением, не сбрасывается при restart и не заменяется широким умолчанием.
Перед prompt ACP должен подтвердить точный set; отказ, несовпадение или отзыв возможности блокируют очередь.
Build/Plan OpenCode — родные режимы агента, а не универсальная шкала прав модели.
Нативные права не обходят fail-closed Подготовки; отсутствие backend 278 не маскируется.
Оба ресурса `family-approval.alula.json` и `.md` обязательны в `machines/product` и release-kit manifest.
Отсутствие любого из них останавливает загрузку хаба с ошибкой, без широкого режима по умолчанию.

## Agent sources and model pools (269)

`GET /api/presets` additionally returns `pools` for each preset:
`{"mix":{"heavy":[{"family":"codex","model":"model-id","effort":"high","active":true}]}}`.
Levels `light`, `medium`, `heavy` are independent of native model effort and task weight.
Existing preset role records remain readable; a role can instead use `{"pool":"mix","level":"heavy"}`.

The `session_source` page signal takes either `{family,model,effort}` or `{pool,level}` as its input.
Preset role assignments also accept `{default: source, by_weight: {light?: source, medium?: source, heavy?: source}}`.
The optional `role` and `weight` of `session_preset` are journaled; old events mean `dev` and no weight.
No weight means the role default, never an inferred medium level or effort. Unknown values are refused.
Independent roles cannot be launched through this user input. The server review operation resolves `dev_accept`
with the explicit task weight and excludes the actual executor family. Explicit invalid or empty review sources
fail closed. ACP model/effort requests must all settle before its prompt; `review_selection` and `review_selected`
record the requested and confirmed independent choice separately from the executor's pinned source.
`session_created.input.source` accepts the same source. The source is persisted in the session journal.
`agent_selection` records a requested choice; `agent_selected` records the confirmed model and native effort.
`agent_actual` is emitted for every ACP prompt dispatch after pending settings settle, even when a pinned model does not change. Its journal payload carries the dispatch request id and confirmed family/model/native effort/role; page projection adds canonical `turn` and `turn_id` using the same mapper as `agent_chunk`/`agent_done`. Requested selections are not evidence of the model that produced a response. Missing native model/effort stays unknown, never substituted from a preset or pool level.
The selection stays pinned across turns and restarts while that exact pool entry remains active and available.
Availability requires the exact family/model pair in the ACP catalog; an empty level is an error, never a fallback.
ACP prompts wait for source settings to settle; refusal fails closed rather than running the default model.

Current boundaries: automatic source-family changes after conversation messages are refused before sending,
because the existing driver's bounded, separate transfer prompt cannot guarantee a full context transfer.
The ACP driver has no structured quota-exhaustion contract, so transport/RPC errors are not interpreted as
quota signals and no uncertain or already-started turn is retried automatically.

The first slice of the MVP: **open the page in a browser, create a session, talk to an agent.** The server serves the page of
[`src/web/`](../web/README.md), keeps a WebSocket `/ws` for it, and runs one state machine engine
(`alula.engine` of the package `alula`) per session: the machine of a many-turn dialog, **written as data in Alula and run by `AlulaMachine`**
(task 114, "The chat runs on Alula" below), the store and the journal in files ([`src/storage`](../storage/files.nv)) or in PostgreSQL
([`src/pg`](../pg/README.md)), the agent over ACP ([`src/acp`](../acp/README.md), by default `opencode acp`). Task 099
(`doc/tasks/099-session-server/`). Built by **Nova Oracle 0.1.0 on Windows (Clang)**.

## Two programs

```
browser <--HTTP, WebSocket /ws--> canopus (the front, Polaris)  <--lines over pipes-->  canopus-hub (the hub)
                                                                                              |-- engines, one per session
                                                                                              |-- the store: files or PostgreSQL
                                                                                              '-- agent processes (ACP over stdio)
```

| Program | Source | What it does |
|---|---|---|
| `canopus` (the front) | `src/canopus.nv`, `src/server/front/` | HTTP on `127.0.0.1`: the files of the page (CSP `default-src 'self'`, as `src/web/serve.mjs`), `/health`, the WebSocket `/ws`; starts the hub as a child process and passes the page through |
| `canopus-hub` (the hub) | `src/canopus_hub.nv`, `src/server/` | the sessions: engines, agents, the store; speaks lines over its stdin and stdout; ends when its stdin is closed (so it never outlives the front) |

**Why two programs.** The PostgreSQL driver and Polaris cannot be in one program on Oracle 0.1.0: the driver has a variant
`Message`, Polaris has a type `Message`, and the compiler keeps one table of names for the whole program
(`spikes/env/repro_server/src/pg_polaris_message`). The front and the hub talk by lines, so each is built with what it needs.
The front must not import the module `canopus.server` (it holds the hub, hence the driver): it reads its own few settings
(`src/server/front/front_settings.nv`).

## Connections of the front (task 192)

Polaris counts every open connection against `max_inflight` (16 by default): an idle keep-alive socket of a browser for 60 s, a WebSocket of a page for good. A few tabs used it up, and the 17th request got a `503` or a reset, so a module of the page did not load and the page stayed blank (`node repro-conns.mjs`: 16 idle sockets and `GET /` was reset). The front sets `max_inflight` to 1024, serves ONE request per connection (`max_requests_per_conn(1)`: the response carries `Connection: close` and the server closes the socket cleanly; there is no `Keep-Alive` header; the idle deadline is 10 min), and pings every page twice a minute (about every 25 s): a page that is gone without a word (a sleeping computer) fails at the write and gives its permit back. `index.html` asks for all modules at once (`modulepreload`, the list is checked against the import graph by `src/web/test/graph.test.mjs`), and `boot-guard.js` reloads a start that hung (no `data-booted` in 15 s) once with a new address. Why one request per connection: a keep-alive socket idle over the old deadline (60 s) was dropped by the server with a reset, and the browser (Chromium ignores `Keep-Alive: timeout`) sent the next request into the dead socket - `/api/fs/list` failed the first time after a pause, and the page hung after a long idle. A WebSocket is an upgrade and is not touched. `node src/server/test/idle-conn.mjs [port] [pause_seconds]` checks it against a running front (66 s pause by default).

## Run

Build the two current executables, then run `target/canopus.exe`. The ordinary launch starts the default instance. `canopus serve` is equivalent; `canopus --help` prints usage. `--config <file>` is the only configuration selector. For example:

```powershell
nova build src/canopus_hub.nv -o target/canopus-hub.exe
nova build src/canopus.nv -o target/canopus.exe
.\target\canopus.exe --config C:/work/instances/demo/config.json
```

The selected file's parent owns `data/sessions`, `state`, `cache`, `tools`, `backups`, and `secrets.json`. The default file is `~/.canopus/config.json`. Runtime paths, hub executable and web resources are derived; they are not editable JSON keys. This release still has a hub implementation; removing it is outside task286.

## Settings

The complete public app schema is `port`, `store`, `agents`, `voice.language`, `voice.model`. `voice: false` disables voice. Values come from built-in defaults, selected global config, repository `.canopus/config.json`, then personal `.canopus/local.json`; later files override earlier ones. Objects merge; arrays replace. The instance folder cannot be discovered as a repository override.

```json
{"port":8099,"store":"files","voice":{"language":"auto","model":"small"}}
```

Agent launch definitions preserve their own arguments and environment. Authentication remains in the agent/provider's native storage. For `store: pg`, put `database_url` in the neighboring `secrets.json`; never in public config or a command line. Infrastructure PostgreSQL administration keeps its separate `postgres` secrets section. Configuration transition does not start Docker or change the chosen backend/database.

`CANOPUS_HOME`, `CANOPUS_SERVER_*`, settings environment variables, positional JSON, `--home`, `--set`, and `--file` are retired and refused. There is no implicit `.env` layer. Named internal defaults in `policy_keys()` preserve the old policies and implementations for possible future public exposure. Internal session/task/watch context and OS/provider environment are separate protocols, not a settings layer.

`canopus config list|get|set` exposes only the five fields; `canopus doctor` diagnoses files and computed paths without printing secrets. See the authoritative [configuration Canon](../../doc/canon/configuration.md) for exact instance and plugin semantics. The historical directory mover remains explicit (`scripts/migrate-canopus-layout.py`); new schema migration is explicit, reviewed and backed up.

### Roles and presets (task 192.12)

A **role** is a place in the process, not a model (`src/config/roles.nv`): `dev` (the executor of a task), `dev_accept` (the acceptor, not the author), `plan`, `plan_accept`, `spec`, `spec_accept`, `delivery`, `delivery_accept` (the stages of the plugin of the owner in short form) and `integrator`. `roles.json` of a layer changes them field by field or adds new ones: `{"dev": {"title": "...", "rule": "...", "independent": false}}`; `independent: true` means the holder must not be the author. A **preset** is a named table `role -> {family, model, effort}` in `presets/<name>.json` (`{"description": "...", "roles": {"dev": {"family": "codex", "model": "...", "effort": "high"}, "dev_accept": {"family": "claude"}}}`); the project's file covers the user's file of the same name. The built-in preset `default`: `dev` and `dev_accept` are the first two families of `route_reviewer_order`. The sets and profiles of the plugin of the owner are not copied here.

The built-in active preset is `default`; a session may choose its own. A session chooses by the select under the field of a new session (`session_created` carries `preset`) or later by the message `session_preset {preset}` (the journal keeps it; the page gets the event `session_preset`; an unknown name is refused with a line to the owner; `""` returns to the preset of the settings). **The independent step** of a mode (`independent`) takes the family of the role `dev_accept` of the preset of the session; `route_reviewer_order` is the reserve when the preset has none, the family is the author, or it is not an agent of the settings. `GET /api/presets` gives `{"active", "presets":[{name, description, origin, roles}], "roles":[...]}` (a broken file adds `"error": "file:line: reason"` and leaves the built-in preset).

### The texts of the hub in files: `prompts/<name>.md` (task 192.12)

The texts that the hub says to the agents are files by layers: `.canopus/prompts/<name>.md`, then `<instance>/prompts/<name>.md`, then the built-in text in the code (so the product works with no file). The hub reads the file at every use (a changed text acts at once). `{name}` is replaced by the value of that name; an unknown `{...}` stays as written. An empty file or a file that is not text is not used: the built-in text is, and a line goes to the log of the hub. The names (the values in braces): `tool_<tool>` (the description of a tool of the MCP server `canopus`: `tool_ask_user_question`, `tool_canopus_task`, `tool_canopus_task_list` and the other `tool_canopus_*`; the file holds the description only), `recognize_request` (the note "Распознать задачи"), `route_reminder` (`{route}`, `{step}`, `{place}`), `tasks_hint` (`{rows}`), `ask_hint` and `task_hint` (the notes about the tools), `ext_applied` (`{number}`, `{brief}`, `{shown}`), `ext_withdrawn` (`{brief}`, `{shown}`), `auto_extend`, `auto_extend_own`, `decision_new` / `decision_extend` (`{n}`, `{title}`, `{shown}`), `decision_queued` (`{n}`, `{title}`), `decision_no`.

### Internal policy constants

Route thresholds, timeouts, confirmation words, trace policy and resource limits remain named built-in values in `policy_keys()`. They are absent from public JSON and configuration forms. Runtime behavior still uses the same consumers; future releases can explicitly reopen selected controls.

### The catalog of the families: `agents.json`, `/api/agent-catalog` (task 192o)

The hub keeps, for every agent (family), the last lists of models, efforts and modes that the agent gave and its current values, in `<cache>/agents.json` (`<instance>/cache/agents.json`; in the flat layout `<data_dir>/agents.json`)
(`{"agents":{"<id>":{"updated":<ms>,"model","model_id","models":[{id,name}],"effort","effort_name","efforts":[{id,name}],"mode","modes":[{id,name,description}]}}}`).
Every `agent_model` of a session (the answer to `session/new`, `config_option_update`, `current_mode_update`) is merged into the record of the agent of that session
(`catalog.nv`: a list the summary lacks stays the last one given; nothing changed - nothing is told or written). A changed record is told to every page at once as the event
`agent_catalog` `{ agent, ...record }` (id `catalog/<agent>/<updated>`, trace `agents`), and every page that attaches gets all the records before the sessions. The file is written
whole (a temporary file, then a rename), not oftener than every 2 s; at the start the hub reads it, a damaged one is ignored with a line in the log. `GET /api/agent-catalog` gives the file
as it is (`{"agents":{}}` when there is none; a foreign `Origin` is 403). The values are ids and names the agent offers, no secrets.

### The voice: `/api/stt`

The front turns a recording into text with a local recognizer (task 192f); nothing is sent to a cloud service.

- `POST /api/stt?lang=<ru|en|auto|...>`: the body is a WAV (`Content-Type: audio/wav`, 16 kHz, mono, 16 bit; up to 25 MiB). The front passes it to `stt.url` as `multipart/form-data` (`file`, `language`, `response_format=json`) and answers `200 {"text":"..."}`. Without `lang` the `language` of the settings is used. Errors are `{"error":"<reason>"}`: 400 (not a WAV, empty, a bad language), 403 (a foreign `Origin`), 502 (the recognizer answered something else), 503 (it cannot be reached). A body over 25 MiB is refused by the server itself with 413 and a plain-text body.
- `GET /api/stt/status`: `{"available":true|false,"provider":"local","model":"small"}`; when `available` is false the answer also has `reason`: `starting` (the model is loading, up to 30 s), `not_installed` (also `"hint":"scripts/install-stt.ps1"`), `failed` (it did not start or ended), `not_running` (a foreign or an unmanaged recognizer does not answer).

### Speech recognition (Whisper)

Whisper is a part of the control panel: the front starts it and ends it with itself. The files (whisper.cpp with CUDA, 685 MB, and the model `small`, 488 MB) are not in the repository (the public repository takes no file over 100 MB); `tools/stt/manifest.json` lists the addresses, sizes and SHA256.

- **Install, one command:** `powershell -File scripts/install-stt.ps1` downloads the files of the manifest, checks the size and SHA256 (a mismatch stops it and the file is deleted), and unpacks them into the tool folder: `tools/whisper` beside the selected app config (`-Config <file>` selects an instance). A second run downloads nothing when everything is in place. `-Model medium` installs the larger model (then set `voice.model` to `medium`); `-Check` only says whether everything is there.
- **Autostart:** with `stt.managed` (the default `true`) the front, at its start, (1) ends an orphan of ours left by a front that died (`<state>/stt.pid` names a live `whisper-server`); (2) if something already answers at `stt.url`, uses it and never touches or ends it; (3) else, if `stt.dir` holds `bin/whisper-server.exe` and `models/ggml-<model>.bin`, starts `whisper-server` hidden on `127.0.0.1` at the port of `stt.url` and waits up to 30 s for `GET /` to answer 200 (the status is `starting` meanwhile); (4) else the status says `not_installed` and the log names `scripts/install-stt.ps1`. The front never fails because of the recognizer.
- **Autostop:** the recognizer is a child of the front in a Job Object (`Tree.Group`), so it ends with the front however the front ends (Ctrl+C, a kill, a crash). The pid file is the second line of defence: if a recognizer of ours is somehow left, the next start ends it and starts a new one.
- **Selection:** `voice.language` and `voice.model` in the selected app config; `voice: false` disables the managed recognizer. Tool paths and loopback endpoint are computed. No STT environment override.

- **Check:** `curl http://127.0.0.1:<port>/api/stt/status` gives `"available":true`; `curl -X POST --data-binary @voice.wav -H "Content-Type: audio/wav" "http://127.0.0.1:<port>/api/stt?lang=en"` gives `{"text":"..."}`.
- **By hand (emergency):** `scripts/start-stt.ps1` and `scripts/stop-stt.ps1` start and stop a recognizer on `127.0.0.1:8178` outside the front (the front then uses it as a foreign one).
- Tests: `powershell -File scripts/tests/test-install-stt.ps1` (the installer), `nova test src/server/front/sttproc_test.nv` (the plan, the pid file, the orphan, the status).

### The pictures of a message: `/api/session-image` (task 192)

The owner pastes a screenshot from the clipboard (or drops an image file) into the card of the control panel and sends it with the message.

- `POST /api/session-image/<session>`: the body is the raw bytes of a picture (`Content-Type`: `image/png`, `image/jpeg`, `image/webp` or `image/gif`; up to `max_image_bytes`; the first bytes must say the same as the type). The front keeps it as
  `<data_dir>/<session>/images/<n>.<ext>` (`n` grows through the whole session: 1, 2, ...) and answers `200 {"n": 3, "bytes": 1234}`; `400` the bytes are not that type or the id is not a safe name, `413` too big, `415` another type.
- `GET /api/session-image/<session>/<n>`: the file with its `Content-Type` (`404` none). The session id and the number are checked by a mask (a safe name, digits without a leading zero): no address leaves the images folder.
  Only `127.0.0.1` listens, and an upload from a page of another origin is refused (as the WebSocket).
- The message names the pictures by number: `{"kind":"user_message", "input":{"turn":..., "text":..., "images":[{"name":"image.png","n":3}]}}` (the hub also takes `{"name","mime","data"}` with base64 and keeps the file itself; at most 6 pictures, each up to `max_image_bytes`).
  **Why not base64 in the message:** the hub reads its stdin one byte at a time (about 40 microseconds a byte, workaround 31), so a screenshot of a megabyte in a line would stop the hub for 40 seconds.
- The journal keeps a record before the message: the signal `message_images` `{"images":[{"n","name","mime","bytes"}]}` (never the bytes); the page gets the same line and puts the thumbnails into the bubble of the message that follows; after a reload the page loads them from `GET /api/session-image/...`.
- To the agent: `session/prompt` gets `[{"type":"text","text":...},{"type":"image","mimeType":...,"data":<base64>}]` ONLY if the agent said `agentCapabilities.promptCapabilities.image = true` at `initialize`. Otherwise no picture is sent: the text goes with the note
  `[приложено изображений: N, агент их не принимает]` and the feed shows the line "the agent does not take pictures; only the text was sent" (the signal `images_skipped`). When the family changes in the window, a picture in the protocol is the line `[изображение: имя]`.
- The raw trace (`<session>.acp.jsonl`) holds `"data":"<image N bytes>"` instead of the base64.

## Questions of the agent (Вопросы агента)

Task 192i. The owner asked for the form of questions with a choice that the assistant itself has (`AskUserQuestion`), and for the agents to use it. The page shows a form;
the hub gives the agent the answer in the shape that agent wants.

### How each agent asks (read from the sources of the adapters installed on this machine, and from the raw exchange `<session>.acp.jsonl`)

All four ask with the same call of ACP: **`elicitation/create` in the mode `form`** (a call of the agent to the client: `{mode:"form", sessionId, toolCallId?, message, requestedSchema}`), and only if the client
said so at `initialize` with `clientCapabilities.elicitation.form`. **Not by `session/request_permission` with `rawInput.questions`**: no adapter of the four does that for the questions (Kimi uses
`session/request_permission` as a fallback, see below). There is no method `session/elicit`; `elicitation/create` and the notification `elicitation/complete` (the mode `url`) are in the SDKs of all four.
The hub did not declare the capability before this task; it does now (`ask_form`), and **Claude Code has no tool `AskUserQuestion` at all without it** (the adapter lists the tool as disallowed).

| Agent (version) | Its tool | Without `elicitation.form` | The form it sends | How to answer (`result` of `elicitation/create`) |
|---|---|---|---|---|
| **Claude Code** (`claude-agent-acp` 0.94.0) | `AskUserQuestion` | the tool is switched off | `message` = the question (one) or "Please answer the following questions."; a field `question_<n>`: a string with `oneOf` (`const` = `title` = the label, `description`), or, for `multiSelect`, an array with `items.anyOf`; the `title` of the field is the header, with many questions its `description` is the question; a field `question_<n>_custom` (string) for an own answer | `{action:"accept", content:{"question_0":"<label>", "question_0_custom":"<own text>"}}` (an array of labels for a multi-select; the own text joins the choice of a multi-select, is the answer of a single when nothing is chosen, or a note to it). `{action:"decline"}`: the model is told the user skipped. `{action:"cancel"}`: the tool use is aborted |
| **Codex** (`codex-acp` 2.2.2) | `request_user_input` | answers come empty | `message` = "Codex needs your input to continue."; a field named by the id of the question: `title` = the question, `description` = the header, a string with `oneOf` (label, description) and an option "None of the above" when `isOther`; a field for a note that names its question in `_meta.codex.questionId`; all `required` | `accept` with `content:{"<id>":"<label>", "<id>_note":"<text>"}`; `decline` and `cancel`: empty answers |
| **Kimi Code** (2.1.1) | `AskUserQuestion` | `session/request_permission`: a tool call titled `AskUserQuestion` with the text of the FIRST question, options `q0_opt_<i>` (`allow_once`, the label) and `q0_skip` (`reject_once`); multi-select is asked as single. Answer `{outcome:{outcome:"selected", optionId:"q0_opt_1"}}`, `cancelled` or the skip is "dismissed" | fields `q<n>`: a string with `oneOf` or an array with `anyOf` (`minItems` 1), `title` = the header, `message` = the questions joined by a line break, all `required`; no field for an own answer | `accept` with `content:{"q0":"<label>", "q1":["<a>","<b>"]}`; `decline`/`cancel`: dismissed |
| **OpenCode** (2.0.26) | `question` | the tool fails; the model reads "The question couldn't be shown to the user in this client. Continue without an answer" | fields `<key>` (string with `oneOf`, `const` = the value, `title` = the label; or an array with `anyOf`) and `<key>_custom` for an own answer; a form with a field that looks like a secret (password, token, key...) is not sent | `accept` with `content:{"<key>":"<value>", "<key>_custom":"<text>"}`; `decline`/`cancel`: the form is cancelled |

`initialize` of the four (checked live): `mcpCapabilities.http` is true for all four (`sse` too for Claude Code and Kimi Code; Codex adds `acp:false`); `promptCapabilities`: `image` and `embeddedContext` for all, `audio:false` for Kimi.
An agent says nothing about elicitation: it is a capability of the client. A request of an agent is withdrawn with `$/cancel_request` (Claude Code does it when the tool use is aborted): the hub answers `cancel` and takes the form away.

So **every one of the four has its own tool of questions, and the native way (this section's table) is the one the hub uses**: `ask: native` is the default of an agent; no MCP server is started for them.
For an agent without its own tool the hub has the universal way below (`ask: mcp` in the settings of that agent).

### What the hub does (native questions)

`Hub` -> `AcpClient.on_elicitation` (`src/acp/client.nv`) -> `project_question` (`src/acp/ask.nv`). A form is read by its fields, not by the name of the agent: a field with options is a question, a text field named
`<key>_custom` or marked as the note of a question (`_meta.codex.questionId`) is the place for an own answer of that question, a plain text field is a question with no options. The text of the question, the header and the label of an option
are taken as the agents write them (the four shapes above are the tests of `ask_test.nv`). A call that is not a set of questions (the mode `url`, a number field...) is declined.

The page protocol (the contract with the page of the control panel):

| Direction | `kind` | `input` |
|---|---|---|
| server to page | `question_request` | `{ turn, request, tool_call, questions:[{ question, header, multiSelect, options:[{ label, description }] }] }`; `request` is the key of the call (the JSON-RPC id, or `mcp-<n>` for the MCP tool) |
| page to server | `question_answer` | `{ request, skipped:false, answers:[{ index, selected:[label...], other }] }` or `{ request, skipped:true }`; `other` is the own text of the owner or an empty string |
| server to page | `question_resolved` | `{ request }`: the question is settled (answered, skipped, withdrawn by the agent, the turn was cancelled); the page takes the form away. A term passed (the MCP tool) does NOT settle it (task 263): the question waits on, marked `late` |

A skip is `decline` (the agent goes on, told that the user skipped); a cancel of the turn answers `cancel` to the agent and tells the page `question_resolved` before the `cancel`; the request is in the journal (`question_request`
as a progress of the turn, `question_answer` as the owner's event), so a reloaded page sees the form again if the question is still open and a settled one as settled. An answer nobody asked for changes nothing.

### The universal way: the MCP tool `ask_user_question`

For an agent with no tool of its own (`ask: mcp` in its settings). The hub starts a small MCP server (`ask_mcp.nv`, `ask_mcp_server.nv`) when some agent needs it:

- `127.0.0.1` and a port the system chooses (one for the hub; the log says which); `POST /mcp/<session>` with the header `Authorization: Bearer <token>` (a random token for the hub); a request with an `Origin` header is refused, a `GET` is `405`.
  Streamable HTTP of MCP as far as needed: `initialize`, `ping`, `tools/list`, `tools/call`, a notification is `202`. One JSON-RPC message per `POST`, one JSON answer, the connection closed.
- The tool `ask_user_question`: `questions:[{ question, header, multiSelect, options:[{ label, description }] }]` (options may also be plain strings); the result is a text, `Вопрос: ... Ответ: ...` for each question, or
  "Пользователь пропустил вопрос."; a call that is not answered in `ask_timeout_seconds` (30 minutes) gives "таймаут ожидания ответа", but the form stays (task 263):
  the question keeps waiting for the owner (the pending is marked `late`); his answer settles it and is saved as a non-waking stale recovery letter. A restart restores open questions from the journal.
  The contract of the late answer: the HTTP request of the original call is answered already (the term text) or the connection died with the hub — **the original call_id cannot be given a tool result any more**, so the answer goes
  as a canopus letter marked `stale`, with session/question/opening/task identity and answer text. It never wakes the session and never authorizes an action: the owner must confirm the current gate anew. All late answers are conservatively stale, including after restart; missing legacy correlation is not evidence of freshness. The pending
  is taken at the first answer: a repeated answer for the same key and an answer for an unknown key are refused (a line in the log, nothing shown, the form is settled at most once).
- It is handed to the agent in `session/new` (`mcpServers`: an `http` server `canopus` with the address of the session and the token in `headers`) **only when the agent said `mcpCapabilities.http`**; otherwise nothing is given
  and the log of the session gets a note (`acp_note`). The first prompt of the session (and of an agent after a change of the family) gets a short note before the text of the owner: "Если нужно что-то уточнить у пользователя или
  выбрать между вариантами - вызывай инструмент ask_user_question (сервер canopus), не пиши вопрос текстом"; the note is not in the journal and not in the feed.
- The call blocks until the page answers (`question_answer` with the key `mcp-<n>`), a cancel of the turn answers it "skipped".

The trace `<session>.acp.jsonl` holds the line of `session/new` with this token and the address; the token lives as long as the hub run and works on the loopback only.

Checked live (2026-10-26, a hub of its own on port 8105, the real agents): Claude Code asked by `AskUserQuestion` and got the choice, Kimi Code the same; Claude Code with `ask: mcp` was handed the server, called
`mcp__canopus__ask_user_question` after the note and got the choice; Codex did not ask in 140 s (its tool `request_user_input` is for the plan mode of Codex, so it may never ask in a plain chat); OpenCode could not be
checked: its model answered "Free usage limit reached" (the quota of the account, not the hub).

Tests: `src/acp/ask_test.nv` (the forms and the answers, pure), `src/acp_live/client_test.nv` (the fake agent asks, is answered, is skipped, is cancelled; the server goes to `session/new` only to an agent that takes HTTP),
`src/server/ask_mcp_test.nv` (the messages), `src/server_live/mcp_test.nv` (the sockets: the token, the origin, a call that waits, a term), `src/server_live/hub_test.nv` (the scenarios `scenario_question`,
`scenario_question_off`, `scenario_question_mcp`, `scenario_question_mcp_timeout`, `scenario_question_mcp_restart`; the fake agent `src/acp/testdata/fake_agent.mjs` asks with `ask`, `ask2`, calls the tool with `askmcp`).

Task 263 has a separate executable test entry: `nova test src/server_hidden_wait --jobs 1 --timeout 180 -v`.
It exercises the live MCP reply, foreign-session isolation, timeout recovery, restart, stale keys and duplicate answers.
It does not replace the full `nova test src/server_live --jobs 1 --timeout 600` regression run.

### The tools of the hub in the four families (task 192.9)

The tools `canopus_task_list` (the button "Распознать задачи"), `canopus_task` (with `route_auto_propose`) and, for `ask: mcp`, `ask_user_question` are the MCP server `canopus` of the hub; it is handed to every agent in `session/new`
(`mcpServers`, type `http`, the token in `Authorization`) when the agent says `mcpCapabilities.http` (all four do). Checked live with the four adapters of this machine (a probe client with its own MCP server):

| Family | How the agent sees the tool | Leave to call | Note |
|---|---|---|---|
| OpenCode 2.0.26 | in the tool `execute` as `tools.canopus.canopus_task_list({...})` (a list `tools.canopus.*`, not a tool of its own) | none | the hidden request of the hub names this form; the plugin of the owner is not loaded (below) |
| Claude Code (`claude-agent-acp` 0.94) | `mcp__canopus__canopus_task_list`, a deferred tool: the agent finds it with `ToolSearch` first | none | the request names `ToolSearch` |
| Kimi Code 2.1.1 | `mcp__canopus__canopus_task_list` | `session/request_permission` for every MCP tool | the client answers `allow_once` itself for the tools of the server `canopus` (`is_canopus_tool_title`), the owner is not asked |
| Codex (`codex-acp` 2.2.2) | `mcp.canopus.canopus_task_list` | none (its own "Guardian" approves a call that the user asked for) | |

**The fallback marker.** An agent that does not call the tool writes one line `[[canopus_task_list]] {json}` (or `[[canopus_task]] {json}`) at the end of its answer. The client of ACP (`src/acp/marker.nv`, `AcpClient.on_update`)
cuts it out of the chunks of the answer while they travel: it holds back the beginning of a name and an open marker until it is closed, so a marker that comes in parts is never shown; in the middle or at the end of the answer, in a code
fence (the lines of the fence go with it), a marker that is cut off (no closing brace) is dropped, a name in an ordinary sentence (not followed by `{`) stays text. The marker is given to the hub as the event `canopus_marker` `{text}`
(a line of the page, not a text of the answer: the journal has no marker in the text of the answer); when the turn is over the hub reads these lines (`markers_of`, `ct_marker`) and shows the card or the table as for a call of the tool.

**OpenCode without the plugin.** The plugin `opencode-plugin/` is an experiment of the owner and is not a part of the product of Canopus: the plugin of OpenCode canopus is not a part of the product; the agents the hub starts do not get it. OpenCode reads
its global configuration (`~/.config/opencode/opencode.jsonc` and `cli.json`, `XDG_CONFIG_HOME` moves the folder) and loads the plugins named there; the lists `plugins` of the files are summed up with the project ones, not replaced.
The global files of the owner are not touched (his live service uses them). At every start of an agent whose id or program is `opencode` the hub makes `<data_dir>/agent-config/xdg/opencode/` (`agent_config.nv`): the same files without the entries
of the `plugins` that name `canopus/opencode-plugin` and without the property `canopusMcp` (the path to the MCP of the plugin in the settings of the claude-code provider); the providers, the models, the other plugins and the rules stay,
the text is cut, not parsed, so the comments stay. The agent is started with `XDG_CONFIG_HOME=<data_dir>/agent-config/xdg` (over the variables of the project); the data of OpenCode (`XDG_DATA_HOME`, the sign-in) are shared as before.
The named `OPENCODE_KEEP_PLUGIN` code constant is `false`; this policy is not selected through the environment. The internal explicit-policy function retains the alternate behaviour for tests and future schema changes. The names of the tools of the hub do not clash with the plugin's ones in the agent any more (the plugin has its own `canopus_task`, the tool of
the integrator for the tasks of a project: `show`, `assign`, `submit`...; the `canopus_task` of the hub proposes one task to the owner).

### The tools `canopus_*` of the plugin in the product (task 250, ADR-0015)

The tools that the plugin of OpenCode gives its agents (`opencode-plugin/core.ts` and the three journals of `journal.ts`) work in the product itself, over the same MCP server (`canopus`), by the same names (the owner, 2026-10-28: «инструменты crew_* должны работать
в самом продукте Крю; плагин OpenCode в этом никак не участвует»). The plugin is read only for the ideas; the hub does not call it. The inventory with the decision for every tool is
`doc/tasks/250-crew-tools-port/task/inventory.md`. A call is a message of the MCP server of kind `ctl` (`ask_mcp.nv` checks the arguments that need no hub, `canopus_tools_hub.nv` does the work); the result is a text for the agent.
Every call is written to the journal of the session (a line `▸ canopus_…` in the feed) and to the panel «Машины» («Служебные подсказки»: the arguments and the result).

| Tool | What it does in the hub | Differs from the plugin |
|---|---|---|
| `canopus_list {all?}` | the sessions of the project (role, busy or free, task, epic, parent), the open tasks, «в работе N из route_max_active» | sessions, not tabs |
| `canopus_role {role?}` | the role by the mode and the tree: orchestrator (children or an epic), executor (a task or a child), acceptor, worker | not assigned by a call; a different `role` is refused |
| `canopus_send {to, text, wake?, expect_reply?, reply_to?}` | a service letter; `to`: session id, number of a task, `parent`, `children`; wake=true is a service turn of the recipient when its agent is free (the feed shows «[canopus] Письмо от …»), wake=false waits in `canopus_inbox` | no `tier`, no `project.role`, no `all` |
| `canopus_inbox {limit?}` | the letters of the session: new ones are handed over (and read), then the read ones | the same |
| `canopus_wait {target?, seconds?}` | up to 300 s in the same turn: the answer to a qid; a child by number, id or title until it is «готово» or «слита» (a child that waits for the owner's yes is waited for too); `children`; any letter | the same, wider targets |
| `canopus_spawn {goal, criteria?, title?, touches?, kind?, agent?}` | a work for a NEW worker: a card for the owner; the child (or a task of its own) is made only after his «да», under `route_max_active` | a proposal, not an order of the integrator |
| `canopus_task {action?, …}` | without `action` the old proposal of a task (as before); `list`, `show {n}`, `submit {text}` (a child reports to its orchestrator), `push {n, text}`; the other actions of the plugin are buttons of the owner and are refused with the reason | one tool for both meanings |
| `canopus_timer {minutes\|seconds, note?}` | a letter wakes the session later; up to 719 min, 20 per session | lives while the hub runs |
| `canopus_watch {on, target?, note?, minutes?}` | a subscription: `child`, `children`, `reply`, `idle`; without `on` the list; `action: cancel` | the hub does not run a `command` (refused with the reason) |
| `canopus_doctor` | the hub and the session: folder, tree, branch, limit, children that wait, unread letters | no settings |
| `canopus_step_note {reason, minutes?, done?}` | a note of the step in the journal of the session | no terms and no owner's decisions of the plugin |
| `canopus_branch_note {what, why, who, directory?, branch?}` | the reason of a change of the folder or the branch (AGENTS.md, 6a) in the journal, with the folder and the branch the hub knows | the hub does not block commands |
| `canopus_progress_line {code, kind, k?, n?, pass?, stop?, text?, to?}` | the line of `progress.log` of the task of THIS session, built by the hub (the keyword, the local time) and checked against the earlier lines of the session: start, then steps with no gap, then done or stop; a correction; a step also marks the k-th box of `progress.md` when N is the number of the boxes. A session with no task: «задачи нет»; a path out of the folder of the task, the folder of another task and another file name are refused | `progress_line` of the plugin under a new name; no launch line |
| `canopus_log_line {kind, text}` | an entry `YYYY-MM-DD HH:MM <kind>: <text>` of `log.md` of the task, the kind from the closed list of the Canon | `log_line` under a new name |
| `canopus_usage_line {code, result}` | one JSON line (`v: 1`) of `usage.log` next to the `progress.log` of the task | `usage_line` under a new name; no tokens or cost (the hub does not measure them) |
| `canopus_help` | this table, shortened | |
| `canopus_config` | **not here**: the structure of the configs is being discussed with the owner; the call answers «not available yet», no settings file is read or written | postponed |

The ordinary letters, waits, timers and watches live in the memory of the hub (a restart forgets them); the records of the calls stay in the journal. The exception is stale MCP recovery (task 263): the late answer and its recovery marker are one journal input, unread recovery is materialized once by stable session/question identity after restart, and a journaled read marker prevents redelivery after reading. This never wakes the agent or restores the expired HTTP call. Dangerous things go the existing way: a new worker only
by the card of the owner and under the limit; nothing changes the settings. The tools come with every set of the MCP tools but the old «question only» one (`ask_user_question`); which agent family sees them is task 192.9.
Tests: `src/server/canopus_tools_test.nv` (the definitions, the checks, the roles, the letters), `src/server/canopus_task_test.nv` (the sets), the scenario `scenario_canopus_tools` (`canopus_tools_kit.nv`, run by `src/server_canopus_live/canopus_tools_live_test.nv`;
the fake agent calls any tool with the word `ctl <tool> <json>`).

### The projects of the control panel (task 192m)

A project is a name, folders and environment variables for the agents; the sessions are made inside a project (the folder is chosen from the project's folders).

- **The file.** `<data_dir>/projects.json`: `{"version":1,"projects":[{"id","name","folders":[{"path","branch"?,"worktree"}],"env"}]}`. It is replaced as a whole (a temporary file in the same folder, then a rename), so a reader never sees half of it. The front writes it (it has the routes), the hub only reads it. **The values of `env` are kept in this file as plain text** (the machine of the owner is its only reader): keep the data folder as private as the other files of the owner. The id is 12 random hex digits (a mask is checked on every request).
- **The routes** (`127.0.0.1` only, a foreign `Origin` is 403, as for `/api/stt`; an error is `{"error":"<reason>"}`): `GET /api/projects` (the list: `id`, `name`, `folders`, `env_keys` - **the names of the variables, never the values**), `GET /api/projects/<id>` (the whole project with the text of `env`), `POST /api/projects` (body `{name, folders, env}` -> 201 `{"id"}`), `PUT /api/projects/<id>` (all the fields are replaced -> 200), `DELETE /api/projects/<id>` (200; the sessions made in the project stay with their `project_id`). A text of `env` that does not parse is 400 `{"error":"строка N: ..."}`, the line where the entry begins.
- **The format of `env`** is the `.env` format: `KEY=VALUE` lines; empty lines and `# comments` are skipped; `export KEY=VALUE` is allowed; blanks around `=` are allowed; a value in double quotes may span lines and has the escapes `\n`, `\r`, `\t`, `\"` and `\\` (any other backslash stays as it is); a value in single quotes is taken as it is (it may span lines too); without quotes the value ends at the end of the line and ` #...` starts a comment; a name that comes twice keeps the last value; at most 64 KiB and 256 variables (`src/projects/dotenv.nv`).
- **The folders.** `GET /api/fs/list?path=<absolute path>` -> `{"path","parent":"D:/"|null,"entries":[{"name","dir":true}],"truncated","recent"}`: the folders only (never a file), sorted by name without the case, the hidden ones (a name that begins with `.` or `$`) at the end, at most 500 (`truncated` says more were cut); no `path` -> the roots (the drives `C:/`, `D:/`...) as the entries and `recent` (the folders of the projects, the newest first). There is no limit by roots (the owner chooses his own folders); the path is checked (absolute, no `..`). `GET /api/fs/git?path=` -> `{"is_repo","branch"}`: the branch is read from `.git/HEAD` (also from a work tree, whose `.git` is a file), so no `git` process is started and there is nothing to wait for; `HEAD` is a detached head, as in `git rev-parse --abbrev-ref HEAD`.
- **A session of a project.** The page adds `project_id` and `folder` to `session_created`. The hub checks that the project exists and that `folder` is one of its folders (without `folder`, the first one); the folder is the working folder of the agent (`session/new` `cwd` and the folder of the process), and `session_created` keeps `folder` and `project_id` (**only the id**: no variable is in the journal, the snapshot, the trace of ACP, the inbox, a log line or an error). A project that is not there, or a folder that is not in it, is an `error` event and no session. A session without `project_id` is as it was (the working folder of the hub, no variables).
- **How the variables reach the agent.** In the environment block of the process of the agent, at its start (`Command.env` of `std.os`), and nowhere else: not the command line, not a file, not the protocol. The block is the environment of the hub **plus** the variables of the project, the project wins (on Windows the names are the same in any case). *Why the hub builds the whole block:* the runtime of Nova Oracle 0.1.0 starts a process with an explicit environment with exactly the variables it was given (the rest of the environment is not added), so a block of the project alone would leave the agent without `PATH`. The variables are read from `projects.json` at **every** start of an agent (a session that starts again after a restart of the hub, a change of the family `session_agent`), so a change of the project reaches the next start; a project that was deleted gives no variables, the session goes on in its folder and the log says that the session starts without them (no value). The running agent keeps the environment it started with.
- **The agent for the tests.** `src/acp/testdata/fake_agent.mjs`: the prompt `env NAME...` answers `env NAME=[value]; OTHER=<unset>`, the prompt `cwd` answers `cwd: <folder>`. The scenario is `scenario_project` (`src/server/testkit_project.nv`, `src/server_live/project_test.nv`).

## The modes of work (task 192q)

The four modes are in the control panel under the input field: **Interactive** (the small route: the owner writes, the agent does; the default of a new session), **Fast task** (the fast route, six steps), **Full path** (the full route, eight steps) and **Planning** (the agent does not do the task and does not change the code: it brings the assignment to readiness, four steps).
The texts - the instruction for the agent and the steps with their prompts - are files, `doc/routes/{interactive,fast,full,planning}.md` ([format](../../doc/routes/README.md)), parsed by `routes.nv`.

- **The mode of a session** is the signal `route_set` of its journal (`session_route` of the page); it comes back on resume; the default is interactive. A page that attaches gets `route_state` of every session.
- **The instruction** of the mode (fast, full) is put as a hidden note before the message of the owner once per change of the mode and per start of the agent, and the files of the subtask each time (`AcpClient.set_prelude`; it is in neither the feed nor the journal).
- **The debug state of the machine** (task 192.1, `machine_hub.nv`). The page event `machine_state` `{machine, table:"dialog", state, since, started, last_input, data, journal:[{code,at,note}]}` goes to every page when the state of the machine of a session changes (the data alone - at most every 400 ms), when a page attaches (after the lines of the sessions) and on the signal `machine_state_get` of the page. `since` is the time the machine came into the state; `journal` is the last 20 lines of the journal of the machine; a part (`data`, `last_input`) above 64 KiB is replaced by `{truncated:true, size, head}`. It is state to look at, not history: it is not written to the journal of the session and not kept in the lines a page gets on attach. The data of the table of the dialog are the texts of the turn and counters, no secrets.
- **Recognition of the tasks (task 192.2).** The messages of the owner are **not a journal**: in the mode interactive the hub makes no task, no `message.N.md` and no tree by itself. The way to a task is the button **"Распознать задачи"** (signal `route_recognize`): the hub sends the agent a hidden note ("[canopus] Распознай задачи ...") with the list of the tasks of the session and the candidates already kept, the agent calls the MCP tool **`canopus_task_list`** `{tasks:[{id, kind:"new"|"extend", title, summary, extends, touches:[files], note}]}` (a fallback for an agent without tools: a line `[[canopus_task_list]] {json}` at the end of its answer, read when the turn is over), and the hub shows **one card** `route_state.proposals` (`listed:true`): a row for each work with the buttons "В работу" / "Дополнить K" (for `extend`), "Обсудить дальше", "Забыть" (`route_prop {id, action}`: `start`, `extend`, `discuss`, `forget`, and at a problem `wait`, `parallel`, `over`, `queue`) and a field for the quick answer (`route_quick {text}`: `1, 2, 4 — в работу; 3 — обсудить; 5 — забыть`, also ranges `1-3` and `work`/`discuss`/`forget`; what is not understood applies nothing and the feed says the format). "Обсудить дальше" keeps the item as a **candidate** (`route_state.candidates`; the next recognition does not repeat it); "Забыть" drops it and remembers the title (the agent is told not to propose it again). "В работу" makes a **session of its own** with a task (see "Child sessions" below; with `route_children` off the old way is kept: the first work is the task of the session, the next ones are subtasks inside it with `message.N.md`); "Дополнить K" appends the summary with the date to the message file of the task K and gives its agent a service turn. Each row of the card has a choice of the way (`route_prop {id, action, mode, target, agent}`): a task of its own (the default, or what the agent marked with `kind`), a subtask of the task K, a task of the epic E, an addition to the task K. After a decision the agent gets a service turn with the note (it does not touch the files before). **The rules of the parallel work are automatic:** the `touches` of the new work are compared with the ones of the subtasks in work (`taskwt` `overlap`): no overlap - a tree of its own and a parallel turn at once; an overlap (or unknown files while something runs) - the card says "пересекается с задачей K по: files" with "Подождать" (the subtask waits for K and starts by itself when K is done) and "Всё равно параллельно в своём дереве". **The limit** `route_max_active`: reached - "в работе уже N задач (лимит N)", the over-limit word or "Запустить сверх лимита" / "Поставить в очередь" (the queue starts when a place is free). The panel shows "в работе N из лимита M". With `route_auto_propose` the agent may also propose a single work by `canopus_task` (the same fields, one card, the code word `route_confirm_word`). The modes with steps keep their rule: the first message makes the task, the next ones extend the last subtask or open a new one. Old tasks with a subtask for each message are read as they are.
- **Child tasks of an epic (tasks 192.3 and 192.5; [ADR-0014](../../doc/canon/decisions/ADR-0014-child-tasks.md)).** A work that the owner takes "в работу" is a session of the hub of its own (an agent, a branch and a tree of its own, a folder `doc/tasks/NNN-slug/` with `task/message.md` and `task/progress.md`, the number is the next common number, flat, no dots, the slug is the plain slug of the title). The way is chosen in the row of the table of the candidates (`route_apply {items:[{id, action: work|discuss|forget, mode: new|child|epic|extend, target, agent}]}`; the word "подзадача" of the old hub is read as a child): a **task of its own** (the default; a session on the top level, no `Эпик:` line, no table); a **child task of the epic K** (`kind=child`, `epic=K`; the old `subtask`/`epic_task` are read as it) - a session under the session of K, the first line of `message.md` is `Эпик: K`, the tree is cut from the branch of K and the branch ALWAYS merges into it by its own button "Влить в ветку эпика K" (a conflict is resolved by the agent of the child, then the owner); an epic with no branch gives children cut from main that go to main by "Слить в main"; an **epic** (`kind=epic`) - a task that is an epic from the start (the mark and an empty table `task/children.md`; a session with a detached wip tree gets the branch `task/NNN-slug` in it, as for any first work). There is one kind of a parent: any open task becomes an epic when its first child appears (`cs_make_epic`: the mark and the table). The hub keeps the table `task/children.md` in the folder of the epic (columns: number, kind "дочерняя" (the old tables hold "подзадача", "задача эпика"), title, folder, branch, session, state, touches; written at the creation, at a change of the state, at the merge and every 2 s; a hand may edit it, the rows are read back) and sends the panel `children` (with the progress of each child), `children_unmerged`, `child` (the epic of this session, its number and branch, and where it merges), `epic`, `targets` (the open tasks a work may be a child of or extend), `hints` in `route_state`. The epic goes to main at any moment by its own "Слить в main": the children not merged yet are only named ("не слиты: ..., останутся отдельно"; `children_unmerged`), they never hold it; after the epic is published their `ptree` is cleared (`child_detach`) and they go to main by their own buttons; "Влить все дочерние" (`route_children_merge`) merges the children that go into the branch one by one when the owner wants it. A clash of the `touches` with a running task, the limit `route_max_active` (by the whole hub) and the queue work as before; a waiting child has a session and a tree and its agent starts when the sibling is ready. The children of an epic come back under it after a restart (`parent` in the journal of the session and in `route_task open`). `route_children` (default on) off keeps the old subtasks inside one session. The old tasks with `message.N.md` are read as they are. **The service hints to the agent** (the mode instruction, the list of the tasks, the request "Распознать задачи", the decision on a task) are kept in the process only (`RouteSession.hints`, the last 20 of a session), sent in `route_state.hints` `[{ms, kind, text}]` for the panel "Машины" and never written to the feed or to the journal. **The folder of the trees** (`worktrees_dir` of the project in `projects.json`; `taskwt` `worktrees_dir` / `worktrees_dir_check`): empty - the trees lie beside the folder of the project, a name (`worktrees`) - a folder of that name beside it, an absolute path - that folder; `..`, a control character, and a folder inside the main copy are refused; the trees of the children lie beside the tree of the epic.
- **The addition to an open task is applied at once (task 192.7; the owner, 2026-10-27: always on, there is no setting).** When the agent calls `canopus_task` / `canopus_task_list` with `kind=extend`, `extends=K` and `confidence` `high` (the constant `AUTO_EXTEND_CONFIDENCE` in `canopus_task.nv`) and the task K is open (not merged, not closed, near this session: its own, child, epic, sibling or of the same project), `ct_auto_extend` (`canopus_task_hub.nv`) appends the section "Дополнение" with the date to `task/message.md` of K without a card, gives the agent of K a service turn ("Новое требование владельца ..."; not when K is the session itself, which already has the message), writes `task_extended {id, task, title, text, at, file, added}` to the journal of the session and shows `route_state.extensions` as a grey line "Дополнено в задачу K «название»: ..." with the button "Отменить" (`route_ext_undo {id}`). The undo takes the exact added text out of the file (a commit that takes it back when the section was committed already), tells the agent "Требование отозвано" and writes `task_extend_undone {id, task, at}`. A lower confidence, a merged or closed K, a task that is not there: the ordinary card. New tasks, epics, children and "Обсудить" are only made after the owner's confirmation. Scenario: `scenario_route_auto_extend` (`ext_kit.nv`, `src/server_ext_live/ext_live_test.nv`).
- **The compaction of the context of the agent (task 192.5; the owner, 2026-10-27).** ACP has no event of the compaction; the sign is `usage_update {used, size}` (the page shows "контекст: used / size", the lines are in `<data_dir>/<session>/acp.jsonl`): after the compaction `used` falls. On every pump `ctx_watch` (`canopus_task_hub.nv`, the pure `ctx_scan` in `canopus_task.nv`) reads the new lines of the journal of each session and compares each `used` with the one before it; a fall by more than `context_drop_percent` (default 40) is a compaction, unless the agent was changed in between (`agent_switched`) or the session has just begun (the old value is forgotten). Then the hub: sets `told = false`, so the instruction of the mode goes again IN FULL with the next message (the same way as at the start of the agent or a change of the mode); writes a grey line of the feed "Контекст агента сжат (было N, стало M), инструкция режима повторена"; writes the event `context_compacted {before, after, at}` to the journal of the session. `route_state.context {used, size, compactions:[{ms, before, after}]}` feeds the section "Контекст" of the panel "Машины" (the use now and the history "было → стало"). Before every message the agent also gets a short reminder of the main (`route_reminder`: the mode, the step now, where the task and the branch are, when to call `canopus_task` / `canopus_task_list`), and the same rules are in the descriptions of the tools `canopus_task` and `canopus_task_list` (the word RULES), which reach the agent with every request. **Which agents report the use** (checked on `acp.jsonl` of the test sessions, 2026-10-27): Claude Code (size 1000000, `_meta` `_claude/model`), Codex (size 258400, `_meta` `codex`) and Kimi Code (size 262144) all send `usage_update {used, size}`, so the sign works for them; OpenCode: no session of it was in the checked data, not determined - if it sends no `usage_update` its compaction is not detected.
- **The wip tree (task 192.4; changed by the owner 2026-10-27, task 192.5; [ADR-0014](../../doc/canon/decisions/ADR-0014-child-tasks.md)).** With the switch "Worktree" on, the FIRST message of a session in the mode interactive makes a tree `<worktrees>/<repo>-<name>` (`<name>` is up to 8 characters of the id of the session) on a DETACHED head cut from a fresh `origin/main` (`taskwt` `wip_tree_create`: `git fetch origin` first, a failure of the fetch is a note, not an error; `git worktree add --detach`), NO branch `wip/...`; the agent works in that tree (`RouteSession.agent_dir`), the journal keeps it (`route_task` op `wip` `{worktree, base}`) and a restart brings the session back with the same tree. There is no number, no `doc/tasks` folder and no `message.md` yet. With the switch off (or `route_wip` off, or a folder that is not a repository, or a session that has talked already) the agent works in the folder of the project on its branch. `route_state.where` `{kind: "wip"|"folder", branch, worktree, unmerged_commits, work, idle_days, stale}` (only while the session has no task; `branch` is empty for "wip": the page says "работа идёт в отдельной копии (без ветки)") tells the page where the work goes; the branch of the folder is read from the files of git (no process) every 2 s, the commits and changed files of a wip tree every 10 s. **"В работу" of the first work of a session with a wip tree** (`wip_hub.nv` `wip_take`, called from `cs_spawn`) makes no new session: the branch `task/NNN-slug` is made in the tree (`git switch -c` on the current head, `taskwt` `branch_create`: the changes made before and the commits made on the detached head go with it; a refusal falls back to a session of its own), the tree stays where it is, `doc/tasks/NNN-slug/task/message.md` and `progress.md` are written in it and committed (`NNN files of the task`), the images go to `images/`, the `open` of the task (kind `child`, no epic) clears the wip fields; the session is the session of the task (with the way "Эпик" - an epic) and its agent gets the service turn. The next separate works are sessions of their own with trees cut from a fresh `origin/main`; a child task is cut from the branch of its epic. Publishing ("Слить в main") and its clean-up are unchanged (the tree by the path of the journal). **The end:** deleting a session with a wip tree removes the tree silently when there is nothing to lose (no commits outside `origin/main`, no changed files), else the page asks (`session_delete {branch: "keep"|"drop"}`; without the word the work stays); `route_keep_days` of silence (the last message, or the last own commit) only raises `where.stale`, the page shows a card and `route_tree_drop {force}` drops the tree (work only with `force`), the hub deletes nothing by itself. The switch "Worktree" cannot be turned off once the tree is made.
- **The task and the subtasks.** A message in a mode with tasks opens a task `NNN-<slug>` (NNN is the greatest number in `doc/tasks/` and in the branches `task/*` plus one; outside a repository - in `<data_dir>/<session>/tasks/`): the folder `.../task/` with `message.N.md` (the message and its date) and `progress.N.md` (an empty checklist of the steps). In a git repository with `doc/tasks/` the folder is in the **tree of the task** (branch `task/NNN-<slug>`, next to the repository in `worktrees/`, from `origin/main` or the current branch); the agent works in that tree. The mode interactive makes a task and a tree too (in a repository), with no steps. The next message **extends** the last subtask (a supplement in `message.N.md`, `merged_into` in `route_state`) while its checklist is not complete, else opens subtask N+1; the owner can force it for the next message (`route_subtask_new`, `route_subtask_same`).
- **The observer** reads the progress files every 2 s (`- [x]` and `- [ ]`) and sends `route_state` when something changed (`{route, steps:[{n,title,state}], running, task:{id, number, title, branch, worktree, state, unmerged_commits, subtasks:[{n,title,state,done,total,items,...}], ...}}`).
- **The run of the steps** (`route_run`): a step of kind `self` is a service turn of the same agent (the feed shows "Шаг режима: <title>", the prompt of the step is the hidden note); a step of kind `independent` is done by a hidden agent of **another family** (`route_reviewer_order`), who gets the prompt, the message of the task, `git status`, `git diff HEAD` and the last answer, and whose answer comes into the feed as the block "Независимая проверка (<family>)"; `route_skip` skips a step that is not required, `route_stop` ends the run. The state of the steps is `route_step` in the journal.
- **Finishing and merging.** A task lives as long as its session is in the list: its tree and its branch stay. There is no "keep" and no list of parked tasks; closing a task whose tree holds work (`route_new_task`) is refused with a word to finish it. A task whose tree holds work is offered **three ways** (`task.finish`, `finish_options`): **"Слить в main"** (`route_merge`; `route_publish` is the same signal), **the steps of the finishing as a fast task** or **as a full path** (the mode is switched and the run goes on; the run makes the state `ready`, and the card "ready" has the same merge button).
  - **"Слить в main" is the word of the owner to push** (the card says "push в origin/main"): the hub commits the work in one signed commit with an explicit file list (temporary files and test-run records excluded), then uses `publish` of `taskwt.nv`: fetch, `rebase --rebase-merges origin/main`, conflict resolution, push without force, fast-forward of a clean main copy on `main`, and cleanup. Tests are displayed, not required by this product path. The tree and main copy must belong to the same git repository; `publish`/`publish_continue` refuse a mismatched pair before publishing.
  - **Result repository (task 257, isolated implementation under review).** Targets do not require Canopus projects. The page's folder picker previews canonical main-copy/common-dir and remote URL/ref (`GET /api/result-repositories/inspect?path=...`); the owner confirms the displayed snapshot, then POST `/api/result-repositories` revalidates it and saves a stable ID in `<layout.data>/result-repositories/<id>.json`. GET lists targets. Registration is not exposed through MCP or `route_apply`. **Trust boundary:** the owner accepted ordinary UI confirmation in the existing local model (2026-10-30). The local HTTP/WebSocket service and filesystem do not isolate the owner from an agent with arbitrary shell/HTTP under the same OS account. `Origin`, a confirmation string and an exact snapshot do not independently authenticate a human; they provide the normal UI operation and drift checks, not a new authentication system.
    Task signals accept only `session_result_repo {repo_id}`, never a path. Empty means the session's repository (unchanged default). The first vertical supports `origin/main`, matching fetch/push URLs and a main copy on `main`. Identity, URL and ref are pinned in the journal and revalidated before work, publish and cleanup. Missing/substituted targets block actions after restart; `route_set` cannot redirect an open task. A foreign result requires a worktree; unnumbered wip creation is skipped. In A→B, numbering and `A/doc/tasks/NNN-slug/task/` stay with the posting session; task/child trees, publication and cleanup belong to B. Publishing B does not modify A. The panel shows A→B and children inherit the pinned identity. Endpoints, page signal and journal fields are API additions: any deployment requires coordinated client/front/hub update and the owner's separate permission and restart. No live deployment is performed here.
  - **The tests are shown, not required.** The record of the last run of the tests of a branch is the file `tests-run.json` in the folder of the task (`{commit, at, result, command}`; written by the step of the tests of the mode - the step whose prompt asks for the last line `ТЕСТЫ: ЗЕЛЁНЫЕ` / `ТЕСТЫ: КРАСНЫЕ` - and by the button "Прогнать тесты"; it is never committed). `route_state.task.tests` says `{branch: {state, result, commit, head, at, command}, main: {state, source, ...}}`: `state` is `green`, `red`, `never` (no run) or `outdated` (the run was not on the head of the branch now, with the last result in `result`). The state of main is the last run of CI on GitHub (`gh run list`, asked at most every two minutes, 15 s at most; no `gh`, no network, no run: `never`, the page says "CI: нет данных"). `route_tests_run` (the button) starts, in the background and without blocking the chat, a hidden agent of the family of the session in the tree: it runs the tests of the affected part and ends with the mark of the verdict, the hub writes the record and a line in the feed (`task.tests_running` while it goes; the requests of this agent for permission are allowed, as the button is the owner's word; the independent review is never allowed anything).
  - **A stale session.** `route_keep_days` (30, 0 - none): a session with a tree that nobody touched that many days (the last event of its journal, the last page signal, the last commit of the tree) is `task.stale` with `idle_days`; the page asks "delete the tree and the branch?". The hub deletes nothing by itself. `route_tree_drop {force}` (the button) takes the tree and the branch away (the folder of the task is first copied to the data folder and the task goes on without a tree); work that is not merged only with `force`. Deleting a session (`session_delete {branch?}`) takes its tree and branch with it only when there is nothing to lose (no commits not in `origin/main`, no changed files); else they stay unless the owner said `branch: "drop"` (the page asks).
- **The place of work (the switch "Worktree").** `session_created` takes `route` (default interactive) and `worktree` (default true). With the switch **on** a task gets a tree and a branch (as above); **off** - the agent works in the folder of the project on its current branch, no tree is made (the mode interactive keeps no task then; the fast and the full keep one in the data folder), and `task.finish`/merge do not apply. `session_worktree {on}` turns it on later (a task that has none gets a tree at once) or off (only while there is no tree). `route_state.use_tree` tells the state.

  Уточнение 275: меню «Исходная ветка и рабочая папка» сохраняет независимые `worktree` и `source_branch` (точный `refs/heads/...` либо `refs/remotes/...`; пусто — прежнее умолчание). `session_created` и `session_workspace` проверяют источник до журнала/создания копии. `session_workspace` — только предпочтение до первого исполнения; Подготовка разрешает его через таблицу `WorkModePolicy`, но не разрешает `tree`/`execute`. При первом interactive-исполнении source разрешается в commit detached-копии; папка проекта никогда не переключается. Папка проекта без worktree использует собственную текущую ветку. `route_state.source_branch` не является текущей веткой, после restart читается из `route_set`. `GET /api/fs/git` отдаёт read-only список `sources`. Projectless guards задачи 276 остаются обязательными.

  Явный выбор отличим от старого неявного журнала: новый UI передаёт `workspace_explicit: true`, `session_workspace` и `session_worktree` записывают его в `route_set`; непустой `source_branch` также считается явным. Alula разрешает `dispatch` только после `workspace_ready`; ошибка или timeout записывают `workspace_failed`, убирают только held-данные транспорта и не запускают ACP в основной папке. Исходящее сообщение остаётся у клиента. Остановка переживает restart; снять её можно только новым явным сохранением выбора, затем отдельным повтором сообщения. `TreeDone.generation` сверяется с текущей попыткой: поздний результат не запускает старое сообщение и не подтверждает новую попытку. Физические поздние копии не удаляются.
- **Подготовка задачи** (`planning`, прежний идентификатор сохранён для журналов): обсуждение и запись постановок, без шагов исполнения. Черновик принадлежит сессии: `<data_dir>/<session>/tasks/draft/task/`; подтверждённые постановки — `drafts/<slug>/task/message.md`. Номер задачи не резервируется, git не вызывается для создания черновика. Подтверждение карточки сохраняет постановку, не создаёт дочернюю сессию и не будит исполнителя. Смена режима сохраняет черновик, но сама не создаёт дерево. Решения жизненного цикла — `machines/product/work-mode.alula.md` (`WorkModePolicy`); сервер проверяет и поддельные сигналы запуска/ветки/дерева. **Ограничение:** это запрет операций хаба, не sandbox внешнего ACP-процесса; native fs/shell агента требуют отдельного ограниченного backend и не считаются запрещёнными одной инструкцией режима.
- **Signals of the page:** `session_route`, `route_run`, `route_skip {step}`, `route_stop`, `route_new_task`, `route_subtask_new`, `route_subtask_same`, `route_subtask_worktree {n}`, `route_subtask_done {n}`, `route_subtask_parallel {n,on}`, `route_subtask_choose {n,tree}`, `route_merge`, `route_tests_run`, `route_tree_drop {force}`, `route_diff`, `session_worktree {on}`. Signals of the journal: `route_set`, `route_task`, `route_step`, `route_note`, `route_review`.
- **Ограниченный backend 271:** `ensure_client` выбирает только встроенный `preparation-agent.mjs`, без fallback на обычный ACP. Adapter использует stateless `/api/experimental/generate/text` существующего OpenCode 2.2.5, не создаёт OpenCode session/CLI, не предоставляет tools/MCP/shell и не передаёт native permissions. Ответ содержит только `reply` и необязательный `statement`. Модель не выбирает путь: statement пишется в `<data_dir>/<session>/tasks/draft/task/message.md`, история — в `tasks/draft/history.json`; карточки постановок по-прежнему сохраняются отдельно в `task/drafts/<slug>/task/message.md`. Это доверенный host с узкой файловой целью, не OS sandbox произвольного provider/драйвера.

- **Источник транспорта/модели:** существующий `service.json` из `$XDG_STATE_HOME/opencode` либо `~/.local/state/opencode`; URL/password читаются только adapter в память, Basic auth отправляется только проверенному loopback, redirect запрещён. Служба не запускается автоматически. Модель берётся из сохранённого выбора назначенной семьи или её существующего `dev`-пресета в формате `provider/model`; неизвестный ref явно отклоняется. Прежние параметры подготовки сохранены как именованные `PREPARATION_*` константы кода; переменные окружения их не переопределяют. Изолированные тесты используют явную доверенную инъекцию, связанную с конкретной сессией. Встроенный adapter находится относительно установки — в исходниках или рядом с бинарником; модель и усилие берутся из существующего выбора и пресета. Нужен Node с builtin fetch. Личные настройки не меняются.

- **Закрытая граница:** смена режима закрывает старый клиент, смена модели во время хода запрещена до его завершения/отмены, ограниченная сводка не перезаписывает общий каталог семьи. Широкий native mode и неизвестные ACP fs/terminal/tool methods не расширяют возможностей. При неизвестной регистрации/версии/модели отказ относится к конкретной генерации, не разрешает обычный ACP и не блокирует Интерактивный. Минимальный backend текстовый: картинки/embedded parts отклоняются явно.

- Tests: `nova test src/server/routes_test.nv` (the parser, the numbers, the progress files, the rules, the state), `src/server/taskwt_test.nv` (the git module), `src/server_route_live/routes_live_test.nv` (the scenarios `scenario_route_*` of `routes_kit.nv` on the fake agent, on a temporary repository and on a temporary repository with a remote: tasks, trees, the run, the review, the merge with a conflict, publishing only by `route_publish`).

Task 257 checks: `nova test src/projects/result_repos_test.nv src/server/routes_test.nv src/server/taskwt_test.nv --jobs 1 --timeout 900`;
`nova test src/server_result_repo_live/result_repo_live_test.nv --jobs 1 --timeout 900 --verbose --keep-artifacts` runs exactly
the two new A→B tests in an isolated entrymodule (the ordinary recursive `nova test src` discovers it too). Existing
`src/server_route_live/routes_live_test.nv` remains a separate regression run; passing the new entry does not certify that suite.

## The request to the agent (task 192.11)

The tab "Запрос" of the right column shows what the hub sent to the agent for each turn (`request_view.nv`, the page `src/web/request.js`, `request-ui.js`).

**The honest border: the hub sees only what it sends to the agent by ACP.** It sees: `session/new` (the folder, the MCP server `canopus`, the mode, model and effort the owner chose); the blocks of `session/prompt` that it makes itself (the reminder of the mode, the instruction of the mode, the list of the tasks, the note of the files of a task, the decision on a task, the request "Распознать задачи", a step of the mode, the message of the owner, the pictures); the tools that it gives itself (the MCP server `canopus`: `ask_user_question`, `canopus_task`, `canopus_task_list` - names, descriptions, schemas, taken from the answer of the server itself to `tools/list`); what the agent said about itself (`tool_call` with `kind` and `title`, `available_commands_update`); the usage. It does **not** see the own system prompt of the agent (Claude Code, Codex, OpenCode, Kimi) and the full list of its built-in tools: the agent puts them together itself and they never reach the hub. The page says so in one line over the parts, and marks what the agent said as "со слов агента".

The event `turn_request` (to every page for each turn, to a page that attaches - the last 20 turns of each session, again on `request_get {turn}`): `{ session, turn, at, agent, cwd, mode, route, model, effort, label, parts, tools, mcp, raw_ref }`.
- `parts`: `[{ kind, title, text, chars, approx_tokens, truncated }]`; `kind` is `hub_note`, `mode_instruction`, `reminder`, `task_list`, `owner_message`, `images`, `tool_result_hint` or `other`; `approx_tokens` is `chars / 4`; a text over 64 KiB is cut with a note (`truncated` true). The parts come in the order of the prompt; the bytes of a picture are never there, only its name and type.
- `tools`: `hub` - `[{ name, description, schema }]` (`schema` is the text of JSON); `agent` - `[{ name, kind, title }]` (from the `tool_call` the agent made, one for a name and a kind, at most 40); `commands` - the lines `name - description` of `available_commands_update`.
- `mcp`: `[{ name, url_kind }]` - only the kind, never the address or the token.
- `raw_ref`: `{ file: "acp.jsonl", from_line, to_line }` - the lines of the raw exchange that this turn wrote (from 1, both ends included). `to_line` is 0 until the next turn begins; then the hub tells the finished turn again with `to_line` = the line before the next turn. `from_line` 0 - the trace is off (`acp_trace`).
- **It is state to look at, not history.** The events are kept in the process (`RouteSession.reqs`, the last 20) like the service hints; they are not written to the journal of the session, not to the feed, and gone after a restart. Every text, schema and folder passes `secret_redact` (`src/storage/redact.nv`: the token after `Bearer`, the value of a field named token/password/secret/api_key/authorization, `NAME_TOKEN=...`, keys of known kinds, the user and the password of an address, the name of the user in a path); the values of the environment variables are never put there.

`GET /api/session-trace/<session>?from=&to=` (the front, `front/trace_api.nv`) gives the lines of `<data_dir>/<session>/acp.jsonl`: `{ lines:[{ n, t, dir, line }], from, to, total, truncated }`; at most 200 lines and 256 KiB per answer, a line over 16 KiB is cut, every line passes `secret_redact`. A bad session name or a missing file is `{ "error": ... }`.

## The chat runs on Alula

Since task 114 the hub runs every session on the machine of the many-turn chat written as a table of Alula (2.11 at the start, 2.22 since task 152: blocks, `=>`, `тип Имя перечисление`, a free input of the user),
`src/machine/machines/dialog.alula.md` of the package `alula`, and not on the machine written in Nova.

- **Where the machine comes from.** `dialog.alula.json` is the translation of the table `dialog.alula.md` (`alula compile`, no hand edit; a test compares the translation with the committed file).
  Since task 248 nothing of `machines/` is compiled into the programs: the hub reads the folder of the machines when it starts (`start_hub`, `canopus.product_machines.load_product_machines`):
  the setting `machines_dir` (`CANOPUS_SERVER_MACHINES_DIR`), else `machines/product` beside the program (the release kit), else `machines/product` beside the folder of the program (the build of the tree:
  `target/` beside `machines/`). It reads `dialog.alula.json`, `dialog.alula.md`, `journal.md` and the libraries they connect (`libs/call_cancel.alula.md`) and checks them: every file is there,
  the `alula_version` of the tree, the table and every library is the version of the engine (0.28), the hash of every connection is the `definitions_hash` of the file of the library. A failure stops the start
  with the path (`the hub cannot start: the machines of the product cannot be read: <path>: ...`); there is no copy to fall back on. The hub writes the folder to its log
  (`the machines of the product: <folder> (DialogSession)`). `src/server/alula.nv` makes `AlulaMachine` once from the tree read; a machine that cannot be made stops the start with the message
  `the dialog machine cannot be made: ...`. The release kit is `sh scripts/package-release.sh <folder> [--build]`: `canopus.exe`, `canopus-hub.exe` and `machines/product` (the dialog, the journal, `libs/`;
  no `tests/`, no chat), checked by `scripts/guards/check-release-kit.py --kit <folder>`.
- **The states.** `Idle` (waits for a message), `Awaiting` (a request to the agent is open) and the end `Closed`. After an answer, a refusal, an idle term and a cancel the session
  goes back to `Idle` and forgets the turn (the data of the turn are cleared, as the state `Idle` of the machine in Nova holds nothing). The journal codes and their parameters, the numbers of requests
  (`agent-1`, `agent-2`...) and the notes of an event the state does not expect (`event_ignored`) are the same as before. The end `Closed` is reached by the signal `close_session`, which only the table has: the
  hub never sends it (a table needs one reachable end), the machine in Nova takes it for an event of an unknown name.
- **The idle term.** It is the parameter `СРОК_БЕЗДЕЙСТВИЯ` (the name as written in the table, AL-46) of the table with the key of the project `проект.срок_бездействия` (format 2.7, P-9, default 900000 ms). The hub gives it
  `idle_term_seconds * 1000` of the settings through the table of the parameters of the project (`alula_machine_with`); nothing else of the settings reaches the machine.
- **What the page sees.** Nothing changed: `page_event` takes the events of the engine (the journal codes and the names of the events), the states for the page (`Idle`, `Awaiting`)
  are the names of the states of the table (for people: the code does not compare them, see the next section), `/ws` and `src/web/` are as they were.
- **Snapshots.** The state of a session in the store is now the state of the Alula machine: `{"state":"Awaiting","started":true,"input":null,"data":{...}}`. A snapshot of the old form
  (`{"state":"Awaiting","user":...,"reply":...}`) is **not migrated**: there are no such sessions in a product base; the hub does not resume it and writes `the session <id> cannot be resumed: no usable snapshot` to its log.
  A session of the new form is found by the store after a restart and goes on through `resume_engine`.
- **Primitives.** The chat has none (`## Примитивы` is empty); the step reads the world through its event only (the clock is the stamp of the event). The default host of the engine is enough,
  so the server has no host of its own with a real clock: a step stays a function of the state and the event.
- **How it was checked.** `src/machine_dialog` of `alula` takes every row of the table by a scenario (the mark `taken`, 8 rows of 8) and checks the parameter of the idle term. The ten scenarios of the hub
  (`testkit.nv`) run over files and over PostgreSQL on the Alula machine. The machine in Nova (`dialog_session`) and its comparison with the table (`src/machine_dialog_eq`) were removed on the word of the owner (2026-10-26).
- **No switch.** The hub runs on Alula only; there is no setting "nova/alula".

## The border of the table and the code (Граница таблицы и кода)

Task 126. Where the behaviour of a session is written in the table `dialog.alula.md` (`src/machine/machines/` of the package `alula`), and where it is written in code. The hub does not know the name of any
state of the table: it asks the table.

**The table decides** (change it in the table, the code stays): the states and what leads from one to the other; which signal a state takes (`сигнал(...)` for a signal of a party and for a signal of the machine, `часть(...)`, `ответ`, `сбой`, `срок`; since the language 2.14 the signals of a party stand in the column `сигналы` of its row, AL-38);
the codes of the journal and their parameters; the data of the turn (the two texts) and when they are cleared; the numbers of the requests of the agent (`agent-1`, `agent-2`...: the counter of the party, the mechanics);
what the request to the agent holds (`подсказка`, `реплика`); the cancel of the open requests (`отменить_открытые`); the idle term (the parameter `СРОК_БЕЗДЕЙСТВИЯ` as it is written in the table, the key of the project `проект.срок_бездействия`);
the end `ЗАКРЫТО` (the signal `закрыть_сессию`, which the hub never gives).

**The code decides** (change it in the code, the table stays): which event of the page becomes which signal (the table below); whether a signal may be given now (`Hub.takes_message`, one question to the machine, see below);
the process of the agent (start, stop, the pump of its events); how an update of ACP becomes a signal (`project_update`) and how a stop reason becomes an outcome (`stop_event`); the term as a timer of the engine (the event
`срок`); the store (files or PostgreSQL), the journal, the snapshot; the lines of the page (`page_event`), the `turn` of the page, the synthetic `error` events of the page (they are not kept).

### The signals the code gives to the table

The list as data is `signals.nv` (`signals_given_by_code`, `signals_from_agent`); `signals_test.nv` keeps it equal to the table and to the sources.
The source check discovers production `hub.nv` and `*_hub.nv` modules, including independent-review emitters in `routes_hub.nv`, not only the original hub file.

| signal | who gives it | fields | the table |
|---|---|---|---|
| `user_message` | the hub, `Hub.say`, from the page | `content` (text) | declared: a signal of the party `пользователь`; the row of `ПОКОЙ` |
| `cancel` | the hub, `Hub.cancel`, from the page | none | declared once, as a signal `отмена`; the row `сигнал(отмена)` of `ОЖИДАНИЕ` (in `ПОКОЙ` it is a note `event_ignored`) |
| `permission_decision` | the hub, `Hub.decide`, from the page | `request`, `decision` (JSON text) | **not known** on purpose: it goes to the client of the agent, and the engine journals it; the machine writes `event_unknown` |
| `message_delivery` | the hub, `Hub.handle`, before and after handling a page message (260) | `client_id`, `accepted`, `turn` (JSON text) | **not known** on purpose: durable host metadata; it does not drive the scenario or grant permission to retry an uncertain send |
| `question_answer` | the hub, `Hub.answer`, from the page (and `Hub.cancel` for the questions it withdraws) | `request`, `skipped`, `answers` (JSON text) | **not known** on purpose, like `permission_decision`: the client of the agent or the MCP tool gets the answer, the engine journals it |
| `setting_chosen` (task 192t) | the hub, `Hub.watch_agent`, when the agent took a choice of the owner | `agent`, `setting`, `value`, `at` (JSON text) | **not known** on purpose, no page event. The last word per `(agent, setting)` is read back at the resume of the hub; every agent that is started for the session (first start, after a death or a restart of the hub, after a change of the family to that family) is asked for these choices after `session/new` (`AcpClient.set_presets`), and the first summary of the page waits (at most 5 s) until they are settled |
| `setting_dropped` (task 192t) | the hub, `Hub.watch_agent`, when the new agent does not offer a saved value | `agent`, `setting`, `value`, `used` (JSON text) | **not known** on purpose; the page gets the event `setting_dropped` (a grey line in the feed); the saved choice is dropped (a later start does not ask for it) |
| `session_created` | the hub, `Hub.create`, from the page | `name`, `agent`, `folder`, `project`, `project_id` (JSON text) | **not known** on purpose (below) |
| `session_preset` | the hub, `Hub.set_preset` | `preset`, `role`, `weight` (JSON text; old events omit role/weight) | **not known** on purpose: journaled host assignment, not a scenario transition |
| `session_source` | the hub, `Hub.set_source` | direct `family, model, effort` OR `pool, level` (JSON text) | **not known** on purpose: journaled requested source |
| `agent_selection`, `agent_selected` | the hub, `Hub.source_for_turn`, `Hub.watch_agent` | `family, model, effort, source_effort, pool, level, role, weight` (JSON text) | **not known** on purpose: requested versus ACP-confirmed executor choice; neither grants permission to retry a turn |
| `review_selection`, `review_selected` | `Hub.route_start_review`, `Hub.route_review_poll` in `routes_hub.nv` | `family, model, effort, pool?, level?, role, weight` (JSON text) | **not known** on purpose: requested versus ACP-confirmed independent choice, separate from executor pinning; confirmation precedes dispatch |
| `agent_chunk` | the client of ACP, `project_update` | `content` (text) | declared: a part of the answer of the party `агент`; the row of `ОЖИДАНИЕ` |
| `agent_done` | the client of ACP, `stop_event` (`end_turn`) | none | the answer: the row `ответ` of `ОЖИДАНИЕ` |
| `agent_refused` | the client of ACP, `refused_event` | the code of `FailCode` | the failure: the row `сбой(код)` of `ОЖИДАНИЕ` |
| `timeout` | the engine, when the term of a request ends | none | the term: the row `срок` of `ОЖИДАНИЕ` |
| `agent_thought`, `tool_call`, `tool_call_update`, `usage_update`, `plan`, `permission_request`, `question_request`, `question_resolved`, `acp_skipped`, `acp_note`, `agent_model` | the client of ACP (`question_request` is also the hub's own event for the MCP tool) | JSON text or text | **not known** on purpose: the page sees them (`page_event`), the machine writes `event_unknown` and nothing changes |

- **`session_created` is a signal the table does not know, on purpose.** The first event of a session is made by the server and kept in the journal like any other (`Engine.history` tells the whole story after a restart),
  so it is given to the machine; the machine has no row for it and writes `event_unknown` (the state does not change, nothing is saved). The page needs the event and the machine does not.
- **The stop reason of the agent** is turned into an outcome by `stop_event` of the client of ACP (`src/acp/project.nv`): `end_turn` is the answer (`agent_done`); `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`
  and any other reason are the refusal `agent_refused` with a code of `FailCode`: `MaxTokens`, `MaxTurnRequests`, `ModelRefused`, `StoppedByHuman`, and for the rest `NoResult`. The table sees only the outcome, never the reason.
- **The question to the table.** `Hub.takes_message` asks `AlulaMachine.accepts_signal(state, "user_message")` (`src/machine_run/accepts.nv` of `alula`): the signal is declared and the common events or the rows of the state have a row for it.
  The condition of a row is evaluated with the data of the state and without the bindings of the signal; a condition that cannot be evaluated that way counts as taking the signal. When the state does not take it, the hub
  writes `a message to <session> while a turn is open: ignored` to its log and does not give the signal. Rename a state in the table, and nothing in the code changes: the scenario `scenario_renamed_table`
  (`testkit.nv`, `src/server_live`, `src/server_pg`) runs the hub on the table with `Idle` and `Awaiting` named `Resting` and `Waiting`.
- **How it is kept.** `signals_test.nv`: every signal the code gives is declared in the table or named "the table does not know"; the sources (`hub.nv`, `src/acp/project.nv`, `client.nv`) give only the signals of the list and every signal
  of the list is in a source; the hub and the scenarios name no state of the table. `accepts_test.nv` (`src/machine_run` of `alula`): the question on the dialog, the chat and a common event. `src/machine_dialog/border_test.nv`: the field
  `содержание` and the cancel declared once.

## The protocol of `/ws`

One WebSocket text frame is one JSON event (the server may also send an array of events in one frame). The event is the one of
[`src/web/README.md`](../web/README.md), "The format of the event": `{ id, trace, step, kind, input, time }`; **`trace` is the id of the session.**

### Page to server

The page says what the owner did. It does not apply its own words: they appear on the screen when the server returns them.

| `kind` | `input` | What the server does |
|---|---|---|
| `session_created` | `{ name, agent, project?, project_id?, folder? }`; `trace` is the id the page chose; `project_id` and `folder` are those of [the projects](#the-projects-of-the-control-panel-task-192m) | makes the session (the id must be a safe file name: letters, digits, dot, dash, underscore), starts the agent. An unknown agent or a bad id is answered by `session_created` and `error` for that page only, nothing is kept |
| `user_message` | `{ turn, text }` | gives the text to the agent as the next turn. `turn` is not used (see below). Ignored while a turn is open (the page does not offer sending then) |
| `cancel` | `{ turn? }` | cancels the open turn (`session/cancel`); **the session stays open** |
| `session_agent` (task 192) | `{ agent }` | the owner changed the family in the window: `Hub.switch_agent` starts the new agent (a failure keeps the old one), closes the old one, writes `agent_switched` `{ from, to, shown, total, cut }` into the journal of the SAME session (a restart reads it back) and hands the new agent the whole protocol of the conversation (`transfer.nv`: messages word for word, tools as one line; over 400000 bytes whole messages from the end, the earlier ones as headers) as a turn that is not a turn of the engine, so the feed does not show it and the answer to it is discarded |
| `session_setting` (task 192) | `{ setting, value }`; `setting` is `mode`, `model` or `effort` | the owner chose; the hub asks the agent (`Hub.choose`, `AcpClient.select_option`), the engine does not see it; the answer is a new `session_model` |
| `request_get` (task 192.11) | `{ turn }` (0 - the last) | the page asks for the request of a turn; the event `turn_request` of that turn goes to every page again |
| `permission_decision` | `{ request, decision }`; `decision` is `allow` or `deny` | answers the request for permission of the agent; a decision nobody asked for changes nothing |
| `question_answer` (task 192i) | `{ request, skipped, answers:[{ index, selected:[label], other }] }` | answers a question of the agent (see "Questions of the agent"); an answer nobody asked for changes nothing |

### Server to page

After every attach the hub sends a transport control message `{"kind":"sessions_ready","sessions":["id",...]}`,
after the catalog, histories and auxiliary states, even when there are no sessions. It is not a journal event.
An open WebSocket alone does not mean the snapshot is ready. On reconnect the page keeps its data until this marker;
the ids let it discard sessions deleted while it was disconnected. A page waiting for this marker needs a hub built with this protocol.

| `kind` | `input` | When |
|---|---|---|
| `session_created` | `{ name, agent, folder, project?, project_id? }` | a session exists (`folder` is where its agent works; `project_id` names the project it was made in) |
| `session_model` | `{ model, model_id?, models?, effort?, effort_name?, efforts?, mode?, modes? }` | current model explicitly reported by ACP (empty `model` - not reported) and, task 192, what the agent offers to choose: models, effort, modes (see `src/acp/README.md`) |
| `user_message` | `{ turn, text }` | the owner's message was accepted |
| `agent_chunk` | `{ turn, text }` | a piece of the answer; the page glues pieces in the order of `step` |
| `agent_done` | `{ turn }` | the turn ended well |
| `agent_refused` | `{ turn, reason }` | the turn ended badly: `reason` is a code of the closed list (`Timeout`, `ConnectionLost`, `ModelRefused`, `MaxTokens`...) |
| `permission_request` | `{ turn, request, action, detail }` | the agent asks; the answer is `permission_decision` |
| `turn_request` (task 192.11) | see [The request to the agent](#the-request-to-the-agent-task-19211) | what the hub sends to the agent for a turn; kept in memory, never in the journal |
| `permission_decision`, `cancel` | as above | the page's decision, accepted |
| `question_request` (task 192i) | `{ turn, request, tool_call, questions }` | the agent asks the owner a question with a choice; the answer is `question_answer` |
| `question_resolved` (task 192i) | `{ request }` | the question is settled; the page takes the form away |
| `tool_call`, `tool_call_update`, `usage_update` | as in the page README | work of the agent |
| `error` | `{ turn, message }` | **synthetic**: the agent could not be started or refused to start, a rejected `session_created`. Its id is `srv-<n>` and it is not kept: it is not in the journal and not in the history |

Things to know:

- **Ids.** `id` is `<session>/<engine id>` (`s-1/progress-4`): the page keeps the ids of all sessions in one set. `step` is the step of the engine and
  grows without gaps inside a session; `time` is the clock of the engine.
- **`turn`.** The code of a turn is the engine id of its `user_message` (`input-3`); every event after it carries it until the next `user_message`.
  The page names a turn by its own code, the server replaces it with its own: it is derived from the journal, so it is the same after a restart.
- **History.** When a page connects, the server sends, for every session, **one frame with an array**: the whole story of the session from the
  journal (`session_created`, the messages, the answers...). After that every new event goes to every connected page as it happens. A reloaded page, a
  second window and a restarted service all see the same sessions: the page is stateless.
- **What the page does not get:** thoughts and plans of the agent, skipped updates, notes (`acp_note`): the page has no kind for them; the journal has them.

Example (the lines of one short talk, as the page receives them):

```
{"id":"s-1/input-2","trace":"s-1","step":2,"kind":"session_created","input":{"name":"Probe","agent":"opencode","folder":"C:/work/project"},"time":1792374756651}
{"id":"s-1/input-3","trace":"s-1","step":3,"kind":"user_message","input":{"turn":"input-3","text":"hello world"},"time":1792374757346}
{"id":"s-1/progress-4","trace":"s-1","step":4,"kind":"agent_chunk","input":{"turn":"input-3","text":"Echo:"},"time":1792374757375}
{"id":"s-1/progress-5","trace":"s-1","step":5,"kind":"agent_chunk","input":{"turn":"input-3","text":" hello"},"time":1792374757398}
{"id":"s-1/answered-7","trace":"s-1","step":7,"kind":"agent_done","input":{"turn":"input-3"},"time":1792374757433}
```

### Between the front and the hub

Lines, fields separated by a tab (a JSON text has no raw line break or tab): to the hub `open <conn>`, `close <conn>`, `msg <conn> <page message>`, `quit`;
from the hub `ready`, then `<conn> <message for the page>` (`conn` 0: every page). The log of the hub is its stderr, which the front prints with the prefix `hub:`.
The page's connection number is the peer port of its socket.

## Where the files of a session lie (Где лежат файлы сессии)

Every session has a folder of its own in the data folder (task 192k, owner 2026-10-26: "каждую сессию храни в отдельной папке"). The name of the folder is the session id
(letters, digits, dot, dash, underscore; not starting or ending with a dot; at most 128 characters), the names of the files do not carry the id:

```text
<data_dir>/
  041ef79a-4010-4b90-9fa3-8f08085cd9d4/
    journal        the journal of the engine, one JSON line per entry, appended   (store: files)
    snapshot       the snapshot of the engine, replaced as a whole                  (store: files; the folder is a session if it holds this file)
    inbox          the events of the ACP client not acknowledged yet                (both stores)
    acp.jsonl      the raw exchange with the agent (acp_trace); acp.1.jsonl - the rotated one
    images/        the images of the session (the page reads them through the server, `/api/session-image/<id>/<n>`, never by a path)
  2a8be5e7-e8c8-45b9-8261-7caad7a93826/
    ...
```

All the paths are built in one place, `src/storage/paths.nv` (`session_dir`, `session_file`, `session_file_made`, `ensure_session_dir`, `remove_session_dir`); an id or a name that is not
safe has no path, so nothing leaves the folder. The folder is made at the first write. The page and the front know no paths. Deleting a session is deleting its folder (`remove_session_dir`).

**Migration.** The older versions kept the files side by side (`<id>.inbox`, `<id>.journal`, `<id>.snapshot`, `<id>.acp.jsonl`, `<id>.acp.1.jsonl`, the folder `<id>.images`).
At its start, before the sessions are listed, the hub moves them into the folders (`src/storage/migrate.nv`): the folder first, then the files, by RENAME (nothing is copied), the snapshot last.
A file that has a namesake in the folder is not overwritten: it stays and the log says so (`<file> stays in place: ...`). The log line `migrated N sessions to per-session folders`
is written only when something was moved; a second start moves nothing.

## How a session lives

1. **Create.** The hub starts an engine (`start_engine`), feeds it the signal `session_created` (name, agent, folder; the machine ignores it, the journal keeps
   it with its input), starts the agent process. The session is on disk (or in the database) before the page sees it.
2. **Talk.** `user_message` is `feed`ed: the machine opens a request, the engine sends it to the ACP client, which queues it (one turn at a time). A timer
   (every few milliseconds) pumps every session: the events of the agent are accepted (journal, snapshot, then the acknowledgement to the client) and shown.
3. **Many turns.** The machine `DialogSession` (Alula) goes back to `Idle` after an answer, a refusal, a timeout or a cancel; the request ids are `agent-1`, `agent-2`...
4. **Restart.** At the start the hub lists the sessions of the store (`list_sessions` of the folder, `canopus.list_sessions()` of the database) and resumes each one
   (`resume_engine`, the lines of the page from `Engine.history()`). An agent is started only for a session with an open request. An open request has no
   agent that knows it any more (continuing a turn is `session/load`, not here): it ends with `Timeout` when its idle term passes, and the session goes on.
5. **A dead agent.** A refusal `ConnectionLost` is shown; the next message starts a new agent process (it does not remember the talk: ACP `session/load` is not used yet).
6. **An agent that refuses to start** (`authMethods`, no login): the page gets an `error` event with the reason, once; every message gets a refusal.

**Why the journal has the input of the event.** The journal event `event_accepted` had the kind, the name and the source key of an accepted event; the page needs the text.
It now has the parameter `input` too (written only when it is not empty, so older journals read the same; the journal stays a code and parameters, with no text of its own),
and `Engine.history()` rebuilds the stamped events from the journal. The alternative, a second store for the transcript, would need a third handler beside `Journal` and `Store`; the journal is the transcript.
The events a live session shows come from the engine itself (`Engine.take_events()`), so a restart shows exactly the same lines (a test compares them).

## Files

| File | What it is |
|---|---|
| `settings.nv` | `ServerSettings`, `parse_server_settings`, `server_settings` (file + environment), `check`, `describe` |
| `alula.nv` | `hub_machine`, `hub_machine_from`: the embedded `dialog.alula.json` as `AlulaMachine` with the idle term of the settings |
| `../storage/paths.nv`, `../storage/migrate.nv` | the paths of the folder of a session (one place), the move of the flat files of the older form into the folders |
| `hub.nv` | `Hub`: `start_hub`, `attach`, `release`, `handle`, `pump`, `take_output`, `take_log`, `close`; the sessions, the store by the settings, the lines of the page |
| `stdio.nv` | `run_hub_stdio`: the hub over stdin and stdout |
| `routes.nv`, `routes_io.nv`, `routes_hub.nv` | the modes of work (task 192q): the pure logic of the modes and their files, the reading of the files from the disk, the part of the hub (tasks, subtasks, the run of the steps, the review by another family) |
| `taskwt.nv`, `taskwt_adapter.nv` | task and subtask trees (git worktrees), the merge of a subtask with a conflict left in progress, the state of a tree; the adapter that gives the hub these operations (publishing only by `route_publish`) |
| `catalog.nv`, `front/agent_catalog.nv` | the catalog of the families (task 192o): the last lists and values of every agent kept in `agents.json`, told to the page; the route `/api/agents` of the front |
| `ask_mcp.nv`, `ask_mcp_server.nv` | the MCP tool `ask_user_question` for agents with no tool of their own (task 192i) |
| `canopus_tools.nv`, `canopus_tools_hub.nv` | the tools `canopus_*` of the plugin in the product (task 250): the definitions and checks (pure), the part of the hub (letters, waits, timers, watches, spawn, doctor, notes) |
| `canopus_journal.nv`, `canopus_journal_hub.nv` | the journals of a task as tools (task 250): the lines of `progress.log`, `log.md`, `usage.log` built and checked (pure), the files of the task of the session (hub) |
| `canopus_journal_test.nv`, `canopus_tools_kit.nv`, `canopus_tools_test.nv`, `../server_canopus_live/canopus_tools_live_test.nv` | tests of the above |
| `transfer.nv` | the protocol of a conversation handed to another agent (task 192) |
| `front/projects_api.nv`, `front/images.nv` | `/api/projects`, `/api/fs/*` (task 192m) and `/api/session-image` (task 192) |
| `routes_kit.nv`, `testkit_project.nv` | settings and repositories of the tests of the modes and of the projects |
| `routes_test.nv`, `taskwt_test.nv`, `../server_route_live/routes_live_test.nv`, `ask_mcp_test.nv`, `catalog_test.nv`, `transfer_test.nv`, `signals_given_test.nv` | tests of the above |
| `front/front.nv`, `front/front_settings.nv`, `front/stt.nv`, `front/sttproc.nv`, `front/images.nv` | the front: HTTP, `/ws` (frames over two owners of the socket), the router fiber, the hub as a child process; the voice to text (`/api/stt`); the recognizer as a child of the front; the pictures of the messages (`/api/session-image`) |
| `testkit.nv` | the settings of a test hub with the fake agent, the rig that drives a hub as a page does, the scenarios (shared by the units below) |
| `alula_test.nv` | the machine of the hub: made from the embedded table, the idle term, a broken text, an engine in memory, the snapshot |
| `settings_test.nv`, `front/front_settings_test.nv`, `front/stt_test.nv`, `front/sttproc_test.nv` | tests of the unit `src/server` and `src/server/front` |
| `../server_live/hub_test.nv`, `../server_pg/hub_pg_test.nv` | the same ten scenarios over files and over PostgreSQL |
| `test/e2e.mjs`, `test/real-agent.mjs` | Node: the whole server through its door (files, `--pg` on the temporary database, `--pg-docker` on the permanent one); the real `opencode acp` (handshake only) |
| `server.example.json`, `server-pg.example.json` | the examples of the settings: the file store, and the store pg on the database of `db.ps1` (no password) |
| `run-pg.ps1` | the server on the permanent PostgreSQL in Docker with one command (task 115) |

The module of the front is declared `module server.front` (without the package prefix) and imported as `canopus.server.front`: a module two folders under the
source root cannot be declared with the full path on Oracle 0.1.0 (item 25 of `spikes/env/README.md`; this form compiles and resolves).

### Adding Kimi Code as an agent

Add a second entry to the local server settings file; do not replace the OpenCode entry. For the Windows npm shim:

```json
{"id":"kimi","label":"Kimi Code","program":"kimi.cmd","args":["acp"]}
```

On other platforms use the installed `kimi` executable for `program`. The page reads the configured `id`/`label` from `/agents`; executable paths and arguments remain server-side. The existing ACP client starts the command directly (no `auto`/`yolo` flags). Kimi Code CLI 2.1.1's initialize handshake was confirmed separately; it reported `authMethods: login`. This is not proof of an authorized conversation: login and model prompts are not started automatically, and no token is collected or stored by Canopus.

## Tests

```powershell
powershell -File src/pg/testdb.ps1                     # the temporary PostgreSQL in Docker, for src/server_pg
nova test src --jobs 4                                 # all units; --strict-effects too
nova test src/server_live                              # the scenarios over files: about 25 s
nova test src/server_pg                                # the same over PostgreSQL: about 30 s
powershell -File src/pg/testdb.ps1 -Stop
nova build src/canopus_hub.nv -o target/canopus-hub.exe; nova build src/canopus.nv -o target/canopus.exe
node src/server/test/e2e.mjs                           # the whole server, 35 checks (fake agent)
powershell -File src/pg/testdb.ps1                     # the same on PostgreSQL: the temporary container, then
node src/server/test/e2e.mjs --pg                      #   39 checks (the sessions and the journal are looked for in the database)
powershell -File src/pg/testdb.ps1 -Stop
node src/server/test/e2e.mjs --pg-docker               # the same on the permanent container, on its own database canopus_e2e (made and dropped here;
                                                       #   the database canopus is not touched), then db.ps1 down, db.ps1 up and the sessions are there: 46 checks
node src/server/test/real-agent.mjs                    # the real opencode: initialize and session/new, no model, no key
```

The scenarios (`testkit.nv`), each on a fresh store: two turns of a chat (chunks, turns, ids, steps), permission asked/allowed/denied, a cancel keeps the
session open and the late words are not shown, restart between turns (the same lines, a page that comes later is told everything), restart in the middle of a
turn (`Timeout`, the session goes on), the agent dies (`ConnectionLost`, a new agent), two pages on one session, what cannot be done is an error, several
sessions, an agent that refuses to start.

## What is not here

- `session/load` (the agent forgets the talk after a restart or a new process), the continuation of a turn after a restart, an agent per project folder.
- Closing the agents of idle sessions: every session that has talked keeps its agent process until the hub ends.
- TLS, a login, access rules: the server listens on `127.0.0.1` only and every page sees every session. Because a browser lets ANY web page open a WebSocket to `127.0.0.1`, `/ws` refuses a request whose `Origin` is not `http://127.0.0.1:<port>` or `http://localhost:<port>` (a client without `Origin`, as a test, is accepted). PostgREST, the terminal, Markdown, the board of tasks.
- The list of agents of the page is the fixed one of `src/web/mock.js` (`opencode`); the `agents` of the settings are chosen by that id.
- A pool of connections to PostgreSQL (one call, one connection, as in task 098).

## Oracle 0.1.0: what shaped the code

New in this task (reproductions in `spikes/env/`, items 29-32 of its README): the names of types and variants are one table for the whole program, dependencies
included (`Request`/`Response` of `http`, `Session` of the driver, `Message` of the driver and of Polaris), so the engine types are `PartyRequest` and `PartyResponse`,
the record of the hub is `Dialog`, and the server is two programs; `Stdin.read` waits for a full buffer and pins the worker of its fiber (`#blocking fn` and a buffer of one
byte); `import std.text` anywhere makes a pattern variable `text` mean the module; the stream handed to the upgrade hook of Polaris is shared, so it is read and written
through `share()`, not split; a nested module path; the names `a` and `b` in a test file of an imported module and the method `entries` reaching `EmbeddedDir.merge`.

Task 114 added items 48-51 (`spikes/env/README.md`): the record `Row` of the tables of states clashed with the variant `Row` of the driver (it is `TableRow`), a private generic `begin_engine` of the interpreter captured the name
of the hub's function (it is `begin_session_engine`), a helper of a test file clashed with a private function of its module in the unit of an importer, a record literal in the scrutinee of a `match` is a syntax error.
Each place that goes round a defect carries `// ORACLE-WORKAROUND(N): ...` (`git grep ORACLE-WORKAROUND`).
