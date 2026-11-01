# Проверки и границы 279

## Исходное состояние и RED

Исходный код: `a234806c873b0dd9b8926427f36a46f3433dc7b1`.

`node test/crew-native-recovery.test.mjs` до реализации: **4 нарушения, exit 1**:
stale spawned busy не согласуется с native failed/idle без idle message; push ложно сообщает «разбужен»;
push снимает stuck до начала хода; legacy HOLD не показывает неуточнённый смысл.
Проект fixture исправлен **до** записи RED; отдельная проверка подтверждает, что push дошёл до своей задачи.
Положительные ожидания ограничены условием, не фиксированной задержкой.

Дополнительный независимо найденный RED оптимизации, повторённый исполнителем:

```text
node test/crew-native-bracket.test.mjs
{"actualActive":true,"observedState":"idle","activeApiCalls":2}
AssertionError: old in-flight snapshot must not produce false idle
exit 1
```

После запрета coalescing active GET тот же oracle:

```text
{"actualActive":true,"observedState":"active","activeApiCalls":3}
crew-native-bracket: 2 checks
exit 0
```

## Целевая проверка

Первый целевой `npm run pretest`: **8 файлов, 87 проверок, exit 0** (до crash/background/lifecycle дополнений).
Последний `npm --prefix opencode-plugin run pretest`: **11 файлов, 116 проверок, exit 0**, 14 с.
Это целевой checkpoint, не полный набор. Стандартный `npm test` запускает lifecycle автоматически;
`stable.mjs --all` явно собирает `pretest` и `test`, без дубликатов.

| Файл | Проверок | Что доказывает |
|---|---:|---|
| `crew-native-state.test.mjs` | 18 | active/idle/unknown, ownership, новое поколение после старого idle, недоступность, лимиты GET/backoff, три состояния legacy fixture |
| `crew-native-bracket.test.mjs` | 2 | старый in-flight snapshot не заменяет новый post-info active read |
| `crew-wake-receipt.test.mjs` | 17 | admission не start; promoted+active не proof; ID/assistant correlation; три same-ID retry; timeout/error/late proof; quiet admission не wake |
| `crew-native-recovery.test.mjs` | 18 | stale orphaned tool без idle row; queued/accepted/started push; stuck только после связанного assistant; active/unknown не прерываются; рабочий qid/ответ при background reservation, сохранный watch/HOLD |
| `crew-hold-semantics.test.mjs` | 17 | три смысла, legacy, внешний terminal/deadline и gate; независимый health, сохранность HOLD, восстановление по проверенному источнику |
| `crew-recovery-watch.test.mjs` | 3 | отсутствующий старый PID при живых потомках; unknown scan fail-closed; execution pause не запускает очередь |
| `crew-health-correlation.test.mjs` | 12 | общий автор A/B, generic AGENTS/status и чужой fingerprint не подтверждают A; реакция не устранение причины; bounded blocker/escalation |
| `crew-native-isolation.test.mjs` | 3 | unexpected registry/network/missing DI остаются RED даже при caught error и `process.exit(0)` |
| `crew-wake-recovery.test.mjs` | 15 | restart/latest не меняют ID/at/payload; accepted-before-confirm и previously started не POSTятся заново; exact-ID lookup не передаёт provenance чужой сессии |
| `crew-native-dispose.test.mjs` | 3 | disposer ждёт удержанный GET; после release нет POST; после await stop нет поздней записи в удалённый fixture |
| `crew-native-mcp.test.mjs` | 8 | настоящий MCP tools entry ставит tier-письмо в очередь, plugin пропускает native-active/stale-free, выбирает native-idle/stale-busy; unknown не выбирается, без subprocess/watch |

## Полный набор

Первый диагностический `node opencode-plugin/test/stable.mjs --all --runs 1 --jobs 3`: **35 RED / 157 уникальных файлов**,
exit 1, 2068 с. Каждый отдельным `node`, не больше трёх test files одновременно. Это не кандидат и не load-only RED.
Матрица всех 35, корни и отдельные повторы — [repeats.md](repeats.md). После общих исправлений поставлен последовательный
повтор всех 35 и новых crash/background tests; под окончательные байты нужен повтор всего набора и стражей.

Дополнительный crash RED: `crew-wake-recovery.test.mjs`, exit 1, `posts=1` вместо 0 после замены latest receipt.
После per-attempt archive исходная проверка GREEN в отдельном jobs 1 прогоне. Дополнительные отрицательные проверки
ID/at/payload, accepted-before-confirm, MCP и lifecycle drain GREEN в последнем pretest.

Последующие изменения после этого целевого прогона — только legacy fixtures/await cleanup и ожидаемый help-контракт;
все они требуют своих отдельных повторов и окончательного полного прогона. Пять ошибочных сокращённых аргументов runner
создали `*.test.test.mjs`: это NOT RUN, не продуктовый RED и не GREEN. Точный остаток поставлен правильными именами.

Изменения ожидаемых контрактов, не скрытые обходы oracle:

- T11 требует ровно 3 same-ID attempts вместо прежнего ожидания ≥5; ONE escalation/history сохраняется.
- Missing watch wrapper не позволяет убить живых потомков: тест теперь требует их сохранения до explicit cancel,
  проверки полноты cancel/timeout/drop и невредимости соседа сохранены.
- H/K queue-gate проверяют доставку после настоящего native idle; удаление UI-формы само по себе execution не завершает.
  Дополнительно human mail при native-active остаётся в Crew-mailbox без POST.
- Expected help task 279 заменяет ровно одну прежнюю строку HOLD явным новым контрактом. Actual help не нормализуется;
  весь остальной snapshot и spoiled negative control продолжают сравниваться побайтно (`answer-help-279.mjs`).
- Failed-before-model fixture явно моделирует admission без assistant. Это не начавшийся ход: нет ложного wokeAt,
  обычных progress nudges или подсчёта «трёх assistant turns». Проверяется одна bounded timeout-эскалация с сохранённым
  receipt; фиктивный срок в тесте истекает детерминированно, настоящий предел 120 с отдельно проверен в receipt unit.

Последние отдельные повторы: 6/10 GREEN и 4 RED (269 с), затем все четыре исправленных GREEN (83 с, jobs 1).
Tier с явной native ownership fixture GREEN (6 с). Все 35 исходных RED повторены по одному и закрыты GREEN;
окончательный полный набор — следующий шаг на зафиксированном коде, а не подмена отдельными повторами.

## Семантика и источник

Проверены официальные V2 docs/API и source **v2.0.26**:

- <https://opencode.ai/v2/docs/api> и <https://opencode.ai/v2/docs/build/plugins>;
- `anomalyco/opencode`, `packages/core/src/session/execution.ts`: active — process-local ownership, включая cleanup;
- `packages/core/src/session/session.ts`: `prompt` сначала admission, затем `execution.wake`, не подтверждение модели;
- `packages/core/src/session/inbox.ts`: same-ID reconciliation сохраняется после promotion;
- `packages/plugin/src/promise/session.ts`: SDK не экспортирует `active`/`inbox`, отдельного resume API нет;
- текущая read-only схема сервиса 2.0.26: `/api/info`, `/openapi.json`, PRAGMA только имён/типов столбцов.

Никаких live prompt/interrupt/form/model/move, запусков OpenCode, production-контуров или оживлений контрольных сессий.
Факты runtime/requisites не публикуются; интеграция использует synthetic IDs и временные каталоги.

## Совместимость и ограничения

- Unknown не становится free. Native active, отдельный watch/process и новое поколение после старого idle сохраняются.
  Background reservation не блокирует рабочий qid при доказанном foreground idle и не делает слот свободным для назначения.
  Старые transcript/PID/outcome сами по себе не разрешают delivery или interrupt. Idle-снимок ограничен 10 секундами.
- GET: два одновременно, 40 стартов/с, очередь 64, backoff до 30 секунд. Active GET не объединяются.
  Регистрация/auth ленивые и не журналируются; незнакомая схема/ownership закрывают delivery.
- Начало wake доказывает exact input + новый assistant до другого user/idle, не HTTP 200/promoted/active/metadata.
  Просматриваются последние 100 projected messages; отсутствие доказательства требует диагностики, не догадки.
  При timeout нет нового prompt ID/бесконечного resume; позднее связанное proof может завершить попытку без POST.
  Per-attempt archive переживает замену latest; legacy recovered без provenance не объявляется delivered.
  Автоматической очистки receipt archive пока нет (явное ограничение); потеря proof не разрешает повтор новым ID.
- Legacy HOLD не мигрируется, неизвестный scope тоже fail-closed. Старые настройки/HOLD владельца не менялись.
  External wait и gate совмещаются; terminal не снимает gate и не разрешает rerun/смену timeout/merge.
- Диагностика требует fingerprint/эпизод, receipt конкретного уведомления, completed tool по собственному артефакту задачи
  до следующего входа. Без проверяемой схемы/привязки нет автоматического acknowledgement. Общий read автора не лечение.
  Реакция и устранение причины — разные поля; blocker видим, ответственен и ограничен next-check.
- Строгая изоляция тестов: отдельный STATE_HOME; production native transport заменяется явным DI. Неожиданные registry/fetch
  запрещены до чтения credentials/сети, даже если код проглотил исключение. Разрешён только явно зарегистрированный
  loopback fixture формы; main/служба/настройки владельца не меняются.
- Кандидат не обновляет живой plugin. Small submit не назначает автоматического приёмщика; короткая проверка exact SHA
  остаётся за интегратором. Задача 280 и её маршрутизация не копировались в эту ветку.
