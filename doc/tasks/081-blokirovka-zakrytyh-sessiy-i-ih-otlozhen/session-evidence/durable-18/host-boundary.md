# Фактический host и границы, запуск 18

## Доказанный runtime

GET `/api/info` вернул работающую службу **2.0.26**, PID 48828. Установленный
CLI package также 2.0.26. GET `/openapi.json` успешен; SHA-256
`6f748ff099b6c106f7dfe9fd9ca8710f6999c35a41b4d343eedc436739acc5d9`.
`info.version=0.0.1` внутри схемы — версия HttpApi, не версия OpenCode.
Точная схема/три session metadata сохранены снаружи, locator
`081-durable18-host-wVgPKE`; публичная производная — `host-schema.json`.

Доступный cached client SDK **2.0.3** не равен установленному host. Первая
`Service.discover()` вернула undefined: его GET `/api/health` получает 404.
Это НЕ отсутствие службы и НЕ архитектурный блокер. Исправленный read-only
driver сохраняет настоящий verdict discover, повторно использует только его
непрозрачный auth context для GET фактической схемы/info/session. Auth не
выводился и не сохранялся; ensure, restart, CLI api не вызывались.
Предыдущие raw locators `081-durable18-host-RHBzS6` и первый ошибочный запуск
не удалялись. Нельзя принимать этот старый SDK за доказательство hook coverage.

Затем интегратор передал exact published SDK2.0.26 без установки. Прочитаны
session/permission/tool/shell/registration/plugin declarations и service discovery
реализация; версии и tarSHA сверены заново (`sdk-surface.json`). Exact service
module вызван только для discover/headers: GET `/api/info` 200, healthy=true,
server2.0.26/PID48828. Повтор schema/трёх metadata совпал побайтно. Новое raw:
`081-durable18-host-87Xi74`, производная `host-exact26/host-schema.json`.
Таким образом cachedSDK mismatch устранён и НЕ служит основанием STOP.

## Что означает actual OpenAPI

| Операция | Доказанный контракт схемы | Чего не доказывает |
|---|---|---|
| `session.update` PATCH `/api/session/{sessionID}` | `permissions: Permission.Ruleset`, правила `{action,resource,effect}` | Отзыв уже запущенных tools/OS writers, запрет каждого turn |
| `session.prompt` | `id`, `text`, `delivery`, `resume`; возвращает inbox user item | Повторную hook-проверку старого id/terminal effect |
| `session.synthetic` | Отдельный endpoint и synthetic inbox item | Прохождение через prompt hook |
| `session.shell` | Отдельный endpoint, command, optional id | Отзыв уже запущенной shell-команды |
| `session.command`, `session.generate`, `session.background` | Отдельные входы | Общую C/D authority с CrewHarness |
| `session.inbox.cancel` DELETE exact inboxID | Адресный cancel одного item | Отзыв payload, уже принятого consumer |
| `session.interrupt` | Ответ `{interrupted:boolean}`: active execution owned by this process | Terminal всех descendants/handles, будущий deny |
| `experimental.session.wait` | POST, 204/503 | Scope proof detached watch, исторический exit proof |
| `Session.Info` | sessionID, parentID, outcome, permissions, time, location | lifecycle-generation, O/effectID, Job/restricted-token scope, terminal ledger |

Рассмотрены и другие actual launch APIs, а не только Session.Info:
`shell.create` принимает command/cwd/timeout/metadata и возвращает Shell.Info
(shellID/status/optional pid/exit). `shell.remove` — отдельный stop endpoint.
`PersistentPty.CreateInput` принимает command/args/cwd/title/env/size;
`PersistentPty.Info` содержит ptyID/pid/sessionID/status. В этих объявленных
контрактах нет pre-execution restricting token/Job assignment или terminal proof
всех writers. Это **не доказательство отсутствия любой внутренней OS реализации**;
это отсутствие необходимого поддерживаемого контракта у проверенных launch APIs.

Только GET выполнялись. Не выполнялись shell.create/remove или terminal.create,
PATCH permissions, DELETE inbox,
interrupt, wait, generate, prompt, shell, synthetic или create живых сессий.

## Coverage: факт, документ и неизвестное различаются

Текущий V2 plugins guide, прочитанный в этой сессии, прямо исключает synthetic,
shell, compaction и move из prompt hook; retry уже admitted id не вызывает его
повторно. Context hook — перед model dispatch/continuation, не перед каждым OS
write. Explicit permission deny описан как окончательный для permission action,
но не как прекращение ранее допущенного writer. Это **публичный контракт**, не
проверка hook реализации установленного бинарного host.

Exact SDK2.0.26 подтверждает объявленные поверхности:

- `SessionPrompt`: readonly sessionID/messageID, mutable prompt/metadata/delivery,
  callback Promise<void>|void; typed rejection/terminal receipt отсутствуют.
- `SessionContext`: sessionID/model/agent, system/messages/tools/options; это
  модельный контекст, не ОС capabilities. `SessionRetry.decision` может veto retry,
  но не отзывает уже запущенную работу.
- `Tool.execute.before`: sessionID/agent/messageID/CallID и input. `execute.after`
  возвращает completed/error tool result, не гарантирует отсутствие descendants.
  У tool context есть AbortSignal, но SDK не обещает транзитивного OS revoke.
- `PermissionEvaluation`: sessionID, action/resources/source, mutable effect/message;
  это решение о permission action, не полный O/process terminal ledger.
- `Shell.create.before`: command/cwd/timeout/shell/env; **sessionID/O/CallID в
  объявленном event отсутствуют**. Сам по себе этот hook не даёт ownership для C/D.
- Plugin Context не предоставляет Job/restricted-token/process-scope launch API.

Фактические fresh runtime probes этих hooks не выполнялись: опубликованный SDK
не содержит host implementation, а live plugins здесь не меняются. Поэтому native tool,
direct synthetic, retry, external client и уже принятый turn **NOT VERIFIED**.
Ни один из них не помечен покрытым одним prompt/context hook.

Production здесь не менялся. Карта прочитанных собственных границ:

- `core.ts`: postLetter persistence, claim/release/recover, takeReply,
  makeTools/watch/timer, releaseExecutor. Claim/recover не являются D; TTL возврата
  письма не даёт at-most-once фактического effect.
- `index.ts`: deliver использует prompt/synthetic и confirm после host await;
  final note также synthetic/prompt. Context/compaction/model.request hooks
  обслуживают контекст/учёт, но durable C/D не регистрируют.
- `watch.ts`: claim удаляется перед start; spawn предшествует PID persistence;
  detached wrapper, `.exit`, done и taskkill не образуют scope authority.
- Role/reconcile/retry/task/service-notice writers сходятся в эти локальные
  persistence/consumer границы, но не приобретают от этого generation или D.
  Открытая role-заявка и связанное назначение ещё не имеют требуемого нового
  машинного ownership-контракта. Здесь не доказано покрытие всех callers.

Нужна интеграция единой authority на каждой поверхности утверждённой таблицы,
а не объявление direct/MCP/tool-result автоматически безопасными. Она **не сделана**.

## Два legacy scope — только metadata

`legacy-metadata.json`: в текущем watches-каталоге не найдено записей трёх exact
sessions; это отсутствие records в момент осмотра, НЕ отсутствие writers. Старые
raw в предыдущих evidence не восстанавливались/не удалялись. Cards captured:
OLD094 closed; orphan worker running; orphan reviewer done. Host outcome всех
трёх succeeded. Ни один из этих статусов не terminal proof.

### OLD094

Identity: `ses_mvawdsam690xeqwzpp`; новое поколение неизвестно. Шесть watches
replacement worker не включались в её scope. Нет authoritative O/effectID/OS
scope исторического запуска. Итог **UNRESOLVED/HOLD**, negative-old-wake не делался.

### ORPHAN001

Worker `ses_mvdby07ezj5i87u77l`, reviewer `ses_mvdmmbf3buiy0woi5q` — два
отдельных адресата, не один PID/task scope. Generations/issued effects неизвестны.
Сохранённая ветка/пять коммитов не трогались. Cancel родительской Nova102 не
заменяет revoke этих identities. Итог **UNRESOLVED/HOLD**.

## Исполнимость будущего адресного протокола

1. **Сейчас исполним только capture:** `host-readonly.mjs` GET metadata и
   `metadata-readonly.mjs` сохраняют exact records/cards с bytes/SHA, без inbox
   bodies/transcripts/env dump. Уже выполнено раздельно по трём identities.
2. После независимой проверки и отдельного live GO: host `session.update`
   с permissions deny имеет фактический endpoint/shape. Но action/resource
   coverage и child inheritance ещё нуждаются в доказательстве на новой fixture;
   этот PATCH нельзя сейчас выдать за complete future-wake deny.
3. Нужны durable C + полный реестр issued O/external inboxID и scoped revoke.
   Поддерживаемого административного CrewHarness API для exact чужого watch
   с generation/process-scope proof сейчас нет; `cancelWatch` разрешён лишь owner.
   Не заменять его JSON/card mutation или подменой source на служебную identity.
4. Только после доказанной ownership: exact inbox cancel/interrupt и wait через
   перечисленные endpoints. Их ответы сохраняются раздельно, не как terminal.
5. Для каждого admitted/running O нужен trusted scope/handle proof. Для legacy
   он отсутствует; retroactive Job membership/PID snapshot его не создаёт.
   На этой строке оба протокола **останавливаются unresolved**, а не выполняют kill.
6. Negative-old-wake и positive B — только после доказанного полного revoke и
   отдельного разрешения. Пока технически и по полномочиям не исполнимы до конца.

Полного исполнимого capture→deny→revoke→wait→proof→old-wake протокола **нет**.
Выше перечислена исполнимая read-only часть и точная первая недоказанная граница;
не предлагаются команды мутации с угаданными scopes/полномочиями.
