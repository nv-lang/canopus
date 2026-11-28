# Автономный режим bb: из чего собран и что перенести в Канопус (исследование 2026-11-28)

Раздел «что перенести» отобран по критериям [doc/research/README.md](README.md).

Повод: владелец (2026-11-28) попросил разобрать «автономный режим» bb после фразы агента в треде:
«Автономный режим активирован. Полный план до закрытия всех задач (исполняется по событиям, без вашего
участия)». Источник — `get-bb/bb`, клон только для чтения вне репозитория, тег `desktop-v0.50.1`, ревизия
**`a08e116566d1785bc04578a866df8a0359157dd4`** (тот же пин, что в [2026-11-26-bb-architecture.md](2026-11-26-bb-architecture.md)).
Пути — от корня клона.

Обозначения: **[V]** — проверено по коду; **[I]** — вывод.

## Главное

- **«Автономный режим» — не сущность bb, а слова агента.** Grep по `autonomous mode|autopilot` в
  apps/packages/plugins пуст; фраза — вывод Codex под своим Goal-режимом. Автономность в bb — **композиция
  четырёх механизмов**: Codex Goal (цикл внутри провайдера), automations (cron-пробуждения), provider-retry
  (владелец упавших ходов), workflows (фан-аут). **[V]**
- **bb не продолжает goal сам**: серию ходов запускает codex app-server; bb даёт канал дельт, кнопки
  (pause/resume/clear/interrupt) и карточку состояния. **[V]**

## 1. Цикл автопродолжения Codex Goal

- Продолжение живёт **внутри codex app-server**: после `/goal resume` мост **не шлёт** `turn/start` — тест
  дословно: «resumes a paused goal for /goal resume and binds the turn Codex starts to that message», проверка
  `recordedRequests().some((r) => r.method === "turn/start")).toBe(false)`
  (`plugins/provider-codex/src/bridge/bridge.goal-controls.test.ts:179-199`). Ход, открытый Codex сам,
  приходит нотификацией и привязывается к сообщению resume. **[V]**
- Команды `/goal resume|pause|clear` перехватываются (`parseCodexGoalCommand`, `bridge.ts:2356-2372`) и уходят
  в app-server (`thread/goal/set {origin: "user", status}` / `thread/goal/clear`, `bridge.ts:2306-2326`); сам
  «ход» сеттлится как zero-work synthetic turn: `GOAL_RESUME_TURN_GRACE_MS = 5_000` (`bridge.ts:1857`) — мост
  ждёт, стартует ли Codex goal-ход; нет — эмитится синтетический `turn.open`/`turn.boundary completed` с id
  `zero-work-N` (`bridge.ts:1860-1913`; тест `goal-controls.test.ts:201-218`). Для pause/clear grace — 250 мс
  (`ZERO_WORK_SETTLEMENT_GRACE_MS`, `bridge.ts:1856`). **[V]**
- **`thread/goal/updated` — только отображение**: delta-translation → `extension.state {extensionKind:
  "codex/goal", payload: {objective, status, tokenBudget, tokensUsed, timeUsedSeconds}}`
  (`delta-translation.ts:1123-1138`), `thread/goal/cleared` → payload null (`:1140-1147`). Реакций ни в мосте,
  ни на сервере нет. **[V]**
- `waitForGoalClear` (`packages/agent-runtime/src/runtime-thread-goal-state.ts:39-85`) — подтверждение очистки
  для RPC, не автопродолжение. **[V]**
- **Interrupt гасит goal до прерывания**: при `goalStatus === "active"` мост шлёт
  `thread/goal/set {status: "paused", origin: "user"}` (`bridge.ts:2260-2263,2328-2348`); назначение из теста:
  «pauses an active goal before interrupting the turn **so a later resume cannot continue it**»
  (`goal-controls.test.ts:153`). **[V]**
- Goal-контракт покрыт unit-тестами моста (`bridge.goal-controls.test.ts`, `bridge.goal-clear-contract.test.ts`);
  recordings-ячейки для goal нет. **[V]**

## 2. Дедуп автопродолжений: RPC `decision.get` (provider-retry)

- Provider-retry «owns a failed turn, including turns Automations and Workflows sent… publishes its decision
  through the discoverable `decision.get` RPC» (`plugins/provider-retry/skills/provider-retry/SKILL.md:29-35`;
  регистрация `plugins/provider-retry/server.ts:56-61`). **[V]**
- Потребитель (automations, `plugins/automations/src/retry-handoff.ts`): решение `stand-down | wait | re-run` —
  в очереди есть retry-строка → stand-down (`:81-87`); ретрай уже отработал → stand-down (`:95-105`); решения
  нет и с падения < `RETRY_DECISION_WAIT_MS = 60_000` → wait (`:5`); иначе → re-run (`:106-115`). RPC через
  `experimental_discoverRpc` + `callRpc`, таймаут 5 с (`:50-65`). Workflows ждёт того же решения, не заменяя
  worker'а (SKILL.md:35). **[V]**
- Лимиты: «A turn gets at most four automatic retries», `maximumWait` 6 ч, кредитные лимиты не ретраятся;
  pending-ретрай — дурабельная queued-строка, переживает рестарт (SKILL.md:20-43). **[V]**

## 3. Automations: путь тика cron

- Sweep по `nextRunAt` (`plugins/automations/src/sweep.ts:22,128`) → `executeAgentRun` (`src/run.ts:119-161`):
  без target-треда — `threads.spawn(...)` (новый тред, `:131-149`); с `targetThreadId` —
  `threads.send({mode: "steer-if-active"})` (`:221-223`). Непригодный тред закрывает run с причиной
  (`:96-111,203-219`). **[V]**
- **Тихий тик**: пустой вывод скрипта или последняя строка `{"wakeAgent": false}` → `status: "skipped"`, агент
  не будится (`src/script-runner.ts:75-91,204-217`). **[V]**
- **Защита от рекурсии в коде**: `assertNotRecursiveCreation` (`src/service.ts:145-160`) — «Threads executing
  an automation run cannot create automations», «Automation-spawned threads cannot create automations». **[V]**
- Удалённый проект выключает автоматизацию (`settleDispatchFailure`, `run.ts:163-190`). **[V]**

## 4. Где автопилот обязан остановиться

- **Pending interaction** — жёсткое общее правило: сообщение в тред с turn-bound интеракцией встаёт в очередь
  `waitingOn: interaction` (`apps/server/src/services/threads/dispatch-attempt.ts:633-639`), отправка
  отвергается 409 `awaiting_user_interaction` (`thread-send.ts:180-195`). Goal внутри Codex ждёт ответа сам;
  очередь, автоматизации и ретраи — не продолжают. **[V]**
- **Лимиты**: `tokenBudget/tokensUsed` в goal; статусы «Goal blocked» / «Goal usage limited»
  (`plugins/provider-codex/src/goal-card.tsx:14-19`) — останов решает Codex, bb отражает. **[V]**
- **Ошибка хода** — принадлежит provider-retry (≤4 попыток); ретрай никогда не steer'ит
  (`apps/server/src/services/threads/turn-retry.ts:320-323`). **[V]**
- **Ручной стоп** — главный аварийный тормоз: pause goal + interrupt (раздел 1). **[V]**

## 5. Что видит пользователь

- Goal-баннер в композере (`plugins/provider-codex/app.tsx:515-517`): статус словами, objective,
  `used / budget tokens`, время (`goal-card.tsx:35-82`); запуск — composer-action
  (`plugins/provider-codex/server.ts:83`). **[V]**
- **Автономные ходы в таймлайне не помечены**: обычные provider-инициированные turn'ы; отличие — goal-баннер и
  отсутствие пользовательского сообщения перед ходом. **[V]**

## Карта на Канопус: что есть и чего не хватает до «автономного режима задачи»

Что уже есть (по задачам и канону):

| Кусок автономности | У Канопуса | Статус |
|---|---|---|
| Цикл «ответ за задачу до закрытия» | философия + `canopus_task` (submit/продолжение), напоминание `@task_continue` с журнальной защитой от повтора (`canopus_task_hub.nv:505-519`) | есть, ручное продолжение |
| Повтор/ретрай хода | 310 (повтор) | есть |
| Дедлайны и типизированные остановки | 317 (`no_answer_in_time`, FailCode) | есть |
| Видимые причины ожидания | 322 (waitingOn) | исполняется |
| Срочная поправка в автономию | 324 (cancel+resume, по спайку [2026-11-27-steer-acp-spike.md](2026-11-27-steer-acp-spike.md)) | заведена |
| Автовосстановление после сбоя | 332 | есть/в работе |
| Демон/живучесть хаба | 329 | есть/в работе |
| Без лишних LLM-вызовов | ADR-0018 | принят |
| Остановка на воротах | машина-состояний: вопрос владельцу = ОЖИДАНИЕ, автопродолжение не шлётся при неотвеченном qid (`canopus_task_hub.nv:505-513`) — прямой аналог `waitingOn: interaction` | есть |

**Недостающий кусок — задачный автопилот** [I]: событийный цикл «ход завершился → проверь критерий закрытия
задачи → продолжи служебным ходом или остановись с видимой причиной». У bb этот цикл отдан провайдеру (Codex
Goal); у нас провайдер его не даст переносимо (спайк 324 показал несовместимость поведения агентов) — значит,
цикл должен жить в хабе, рядом с `@task_continue`, и быть **механическим** (по ADR-0018): критерий закрытия —
данные карточки задачи (как `acceptance` в [2026-11-22-goals-synthesis.md](2026-11-22-goals-synthesis.md)),
проверка — существующими стражами/командами, не LLM-судьёй. Обязательные остановки — по образцу bb: вопрос
владельцу (есть), бюджеты (дедлайн 317 есть, turns/tokens — по слову владельца), три подряд неуспеха →
остановка с кодом, ручной стоп гасит автопилот (аналог pause-goal-on-interrupt). Плюс две детали bb,
которых у нас нет: дедуп «кто продолжает упавшее» (аналог `decision.get` — у нас автовосстановление 332 и
ретрай 310 должны договариваться через журнал, а не гоняться) и «тихий тик» для фоновых проверок
(продолжать, только если проверка критерия дала новое).

## Что перенести (отбор по критериям README)

1. **Zero-work settlement с grace-окном** (5 с): команда управления автопилотом («продолжай») не должна
   висеть ходом, если продолжение не стартовало — синтетическое закрытие с честной пометкой. **[I]**
2. **Пауза автопилота при ручном стопе как инвариант** («so a later resume cannot continue it») — у нас
   частично есть; зафиксировать как правило задачного автопилота. **[I]**
3. **Единый владелец упавшего хода с публикуемым решением** (`decision.get`): 310/332/автопилот не должны
   продолжать одно и то же падение трижды; решение — запись в журнале, остальные читают. **[I]**
4. **Тихий тик** (`{"wakeAgent": false}`): фоновая проверка критерия, не давшая нового, не будит агента. **[I]**
5. **Защита от рекурсии автономности в коде**: задача, порождённая автопилотом, не включает автопилот сама. **[I]**
6. **Автономные ходы видимы, но не помечены отдельным типом** — у нас служебный ход уже виден строкой
   `[canopus] …` в ленте; достаточно, отдельную «автономную» раскраску не заводить. **[I]**

## Формулировка кандидатной задачи (для владельца)

«Автопилот задачи (событийный): после каждого завершённого хода задачи хаб механически проверяет критерий
закрытия из карточки (команда/страж, не LLM — ADR-0018) и либо продолжает служебным ходом с причиной из
предыдущей проверки, либо останавливается с видимой причиной (критерий выполнен / вопрос владельцу / бюджет /
3 неуспеха подряд / ручной стоп — стоп гасит автопилот). Дедуп с 310/332 через журнал (один владелец
продолжения). Красные тесты: автопилот не продолжает при неотвеченном вопросе; ручной стоп отключает;
критерий выполнен → закрытие без лишнего хода; два механизма не продолжают одно падение. Основание:
[2026-11-28-bb-autonomous-mode.md] + [2026-11-22-goals-synthesis.md]». **[I]**
