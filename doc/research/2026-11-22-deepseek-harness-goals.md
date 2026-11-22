# Как DeepSeek Harness работает с целями: постановка, раунды, приёмка, автозапуск (исследование 2026-11-22)

Повод: владелец попросил разобрать цели в DeepSeek Harness (dsh) и что из этого перенести в Канопус.
Источник — открытый репозиторий `deepseek-ai/deepseek-harness` (MIT, developer preview), shallow-клон только для
чтения, ревизия **`2e39e70496aa02986ca6a820c5d497e816b69d7e`**. Ядро — пакетная группа `packages/goal/`
(`goal`, `tool-goal`, `command-goal`, `goal-round-driver`), документы `docs/subsystems/goal.md`. Всё ниже — чтение
исходников, без запуска. Пометки: **[V]** — проверено по коду (путь:строка); **[I]** — вывод.

## Главное

- Одна цель на сессию; цель **не планирует работу, а фиксирует состояние завершения**: «that goal records completion
  state rather than scheduling work; automatic continuation must therefore be enabled separately»
  (`packages/goal/README.md:12`). **[V]**
- Состояние — **event-sourced**: каждое изменение — долговечное событие `goal/change` с полным снимком после
  мутации либо tombstone при снятии; проекция `goal` строится строгим replay-fold. **[V]**
- Мутации идут по **compare-and-set ревизии** (`GoalRef {id, revision}`): каждая принятая мутация увеличивает
  ревизию; устаревшая ревизия отвергается (`GOAL_STALE_REVISION`). **[V]**
- **Фаза долговечна, активация локальна**: `phase: active|paused|blocked|complete` хранится в журнале, а
  `activation: armed|disarmed` — состояние процесса («whether this live process may automatically continue»),
  не персистится и снимается при выгрузке драйвера/резюме/форке. **[V]**
- Автопродолжение — отдельный пакет `goal-round-driver`: раунды как admitted user-сообщения с источником
  `{kind:'goal', goalId, revision, round}`; лимит `maxGoalRounds`; при исчерпании — рантайм ставит `blocked`
  с кодом `round-limit`. **[V]**

## 1. Когда ставится цель

- Модель: инструмент `create_goal` — «Use it when the direct human request is a long-running objective, even if the
  user did not say "goal"; not for single-turn work» (`tool-goal/src/index.ts:51-54`). Исполнение требует
  **прямого человеческого ввода в открытом ходе корневого агента**: `requireDirectHuman` ищет в неизменяемом срезе
  событий открытого хода `user/message` с `source.kind === 'user'`; подагенты и автоматические источники права не
  дают (`tool-goal/src/authority.ts:79-102`). **[V]**
- Человек: команда `/goal [<objective>|clear|edit <objective>|pause|resume]` — без траты модельного хода;
  управляющие слова распознаются **только если занимают весь ввод** («/goal pause after verification» создаёт
  буквальный objective) (`command-goal/README.md:45`). **[V]**
- Одна цель: создание при текущей незавершённой цели отвергается; завершённую можно заменить; снятие оставляет
  tombstone и историю (`goal/src/index.ts`, `fold.ts`). **[V]**
- Права на мутации: `edit/pause/resume` — только direct human; `complete/blocked` — direct human **или точный
  раунд цели**; `resume` приостановленной цели моделью запрещён явно («the user must resume it»,
  `GOAL_TOOL_RESUME_PAUSED`, `tool-goal/src/index.ts:269-275`). **[V]**

## 2. Шаги и «план»

- Шагов внутри цели нет: есть **раунды**. Промпт раунда (`goal-round-driver/src/prompt.ts:12-26`):
  `<goal_round>` с `Objective: <JSON-строка>`, `Round: n/max`, и правилами: «workspace, tool results, durable
  session state authoritative — inspect instead of assuming earlier narration is current; make concrete progress
  and verify the result; before claiming completion gather evidence that the whole objective is achieved, read the
  current goal, and mark it complete; if work remains, leave the goal active; follow the goal-tool policy before
  reporting a blocker». **[V]**
- План-режим — отдельная фича (`/plan`, `exit_plan_mode` с одобрением), с целью не связан: «plan mode guides rather
  than restricts» (`packages/plan/README.md`). **[V]**
- Доказательная поверхность — пакет `deliverables`: инструмент `present` объявляет финальные файлы, а рекордер
  снимает изменения workspace за ход (git-снимки, строки, whole-file captures) долговечными событиями
  (`packages/deliverables/README.md:12`). Это то, на что может ссылаться wrapup-сообщение. **[V]**

## 3. Критерии приёмки

- Отдельного судьи нет: приёмку доказывает сама модель в раунде («gather evidence that the whole objective is
  achieved»), а право закрыть дают только direct-human или точный раунд (`authority.ts:110-117`). **[V]**
- `blocked` требует непустой `blocked_reason` и минимум `blockedAfterConsecutiveRounds` (по умолчанию 3) подряд
  раундов с тем же условием; «difficulty, uncertainty, or useful remaining work is not blocked»
  (`tool-goal/src/index.ts:115-123,282-293`). **[V]**
- После терминального автономного `complete/blocked` рантайм вставляет **wrapup-инструкцию** вместо жёсткой
  остановки хода: модель обязана один раз обратиться к пользователю — исход, что сделано и **как проверено**,
  указатели на артефакты; grounding: «report only what earlier rounds and tool results actually establish; when a
  detail is not in the session, say so instead of inventing it»; больше инструментов в этом ходе не вызывать
  (`tool-goal/src/wrapup.ts:5-41`). **[V]**
- Блок-причина — структура `{code (lower-kebab), message}`: машиночитаемо для маршрутизации и человекочитаемо
  (`goal/src/types.ts:52-57`, строгий декодер в `fold.ts`). **[V]**

## 4. Как обеспечивается автозапуск (goal-round-driver)

Условия старта раунда (`goal-round-driver/src/index.ts:106-122,146-221`):
1. цель `phase==='active' && activation==='armed'`;
2. процесс живой: fiber ACTIVE, не stopping, точный живой агент, `agent.status==='idle'`, нет конкурирующего
   поставленного в очередь человеческого ввода;
3. **чекпоинт долговечности**: `sessions.flush()` перед резервированием; сбой flush → disarm;
4. дождаться завершения дерева субагентов (`waitForTreeWork`), иначе раунд лишь ждал бы их;
5. `roundsStarted < maxGoalRounds`, иначе `block(code:'round-limit')`.

Резервирование и ограды гонок (`index.ts:190-221,315-452`):
- раунд ставится в inbox как user-сообщение с источником `{kind:'goal', id, revision, round}`; резервация
  `queued → claimed → admitted`;
- вставка конкурирующего человеческого сообщения помечает резервацию `stale` — автоматическая работа уступает;
- `agent/pre-step` проверяет резервацию **до и после** downstream-хуков: точное совпадение содержимого, источника,
  текущей ревизии, фазы и `round === roundsStarted+1`; не прошла — `{kind:'reject'}` и восстановление чужих
  claimed-сообщений (`restoreOtherClaimed`);
- если downstream-хук отверг шаг — `block(code:'prompt-rejected')`;
- сбой постановки в очередь — `block(code:'queue-failed')`.

Остановки и паузы (`index.ts:274-369`):
- пауза **хостом** отменяет живой ход (`agent.cancel({kind:'user'}, {keepInbox:true})`), пауза **моделью** внутри
  своего хода доживает ход;
- `turn/end` с `max-tokens` → disarm; abort с claimed/admitted резервацией → пометить cancelled; dispose агента →
  disarm (фаза остаётся durable);
- ошибка агента → disarm; выгрузка драйвера → disarm всех: «loading a lifecycle driver never inherits hidden
  automatic authority from an earlier producer instance» (`index.ts:454-459`). **[V]**

Строгий replay (`goal/src/fold.ts`): нормализованный objective (trim, непустой), точный набор полей снимка по фазе,
kebab-case код блока, `seenGoalIds` против повторного использования id, отказ на разрывах раундов, устаревших
ревизиях, остановленных фазах и превышении лимита. **[V]**

## 5. Что стоит перенести в Канопус (идеи)

1. **Разделение durable phase и process-local activation**: «цель активна» и «этот процесс вправе продолжать» —
   разные факты; disarm при выгрузке/резюме/форке убирает унаследованную автономию без потери состояния. **[I]**
2. **CAS-ревизии на мутации цели** и строгий fold с нормализацией: защита от гонок «владелец поменял цель, пока
   агент закрывал старую». **[I]**
3. **Authority из неизменяемого среза событий открытого хода**: direct-human против exact-goal-round — точная
   формализация нашего «слово владельца» без эвристик. **[I]**
4. **Раунд-лимит с рантайм-блоком `round-limit`** и блок-коды `queue-failed`/`prompt-rejected`: остановки имеют
   машиночитаемую причину, а не тишину. **[I]**
5. **Wrapup-сообщение с grounding** после терминального автономного обновления: итог владельцу с «как проверено»
   и запретом новых инструментов в этом ходе. **[I]**
6. **Pre-step fence с восстановлением чужих claimed-сообщений**: автоматический ход не съедает человеческий ввод,
   поставленный раньше. **[I]**
7. **Deliverables как доказательная поверхность** (`present` + снимки изменений хода): wrapup и приёмка ссылаются
   на факты, а не на нарратив. **[I]**
8. **Чекпоинт долговечности перед резервированием раунда** (flush, иначе disarm) — перекликается с нашим классом
   317 «внешний эффект после durable-записи». **[I]**

## 6. Отличия от пяти разобранных продуктов

- Единственный из шести, где **нет отдельного судьи**: приёмку доказывает модель в раунде, а права закрыть даёт
   authority-проверка; у Claude/ZCode судья — отдельный запрос, у Codex/Kimi — аудит в тексте. **[I]**
- Единственный, где автопродолжение построено как **очередь с резервированием и pre-step fence** против гонок с
   человеческим вводом; остальные стартуют продолжение по простою/stop-hook. **[V]**
- Бюджеты: только **раунды** (нет токенов/времени/кредитов) — у Kimi/Qoder шире. **[V]**
- Общее: одна цель на сессию, objective как данные, блок после порога повторов, resume только человеком,
   долговечность через журнал. **[V]**

## Ограничения исследования

- developer preview: контракты могут измениться; ревизия пина — снимок. **[V]**
- Часть поведения (UI, конфигурация лимитов по умолчанию) описана в генерируемых каталогах docs; читал выборочно. **[I]**
- Живого прогона не было: выводы о производительности/надёжности раундов — по коду. **[I]**
