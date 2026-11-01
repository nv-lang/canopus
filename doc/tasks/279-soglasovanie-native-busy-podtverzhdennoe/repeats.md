# Отдельные повторы первого полного прогона

Первый диагностический полный прогон: `node opencode-plugin/test/stable.mjs --all --runs 1 --jobs 3`:
35 RED / 157 файлов, exit 1, 2068 с. Это не проверенный кандидат. Снимок содержит незавершённую миграцию fixtures.

Срез 2026-11-01 14:46. Первый отдельный runner `--jobs 1 --runs 1`, exit 1, 1136 с:
27 GREEN / 37 вызовов (25 исходных файлов и 2 новых), 5 настоящих RED и 5 NOT RUN из-за моей ошибки invocation:
аргумент `crew-flow.test` без расширения превратился в `crew-flow.test.test.mjs` (аналогично ещё четырём).
Это не подтверждение тестов. Все 10 оставшихся поставлены правильными именами на отдельный jobs 1 повтор.

| Файл `test/*.test.mjs` | Сигнал первого RED / установленный общий корень | Отдельный повтор |
|---|---|---|
| crew-track-extra | landing-harness без native DI, isolation sentinel | GREEN |
| crew-tool-texts | landing-harness без native DI, isolation sentinel | GREEN |
| crew-flow | nudge/delivery/закрытие; причина ещё не подтверждена | NOT RUN: invocation; корректный повтор в очереди |
| crew-tasks | push проверяется до подтверждённого старта | NOT RUN: invocation; корректный повтор в очереди |
| crew-push | изменившиеся счётчики failed turn; причина ещё не подтверждена | NOT RUN: invocation; корректный повтор в очереди |
| crew-review | native delivery; причина ещё не подтверждена | NOT RUN: invocation; корректный повтор в очереди |
| crew-status | background watch ошибочно отображается foreground working | NOT RUN: invocation; корректный повтор в очереди |
| crew-watch-tree | прежний oracle требовал убить живых потомков по исчезновению wrapper; теперь explicit cancel | RED; обновлённый explicit cancel повтор в очереди |
| crew-stuck-clear | answer-harness без native DI; затем H.open не удерживал native до idle | RED 1a/4; explicit fixture ownership повтор в очереди |
| crew-acceptor | background reservation закрывала доставку результата команды | GREEN |
| crew-landing-precheck | landing-harness без native DI | GREEN |
| crew-landing-hints | landing-harness без native DI | GREEN |
| crew-landing-release | landing-harness без native DI | GREEN |
| crew-landing-gate | landing-harness без native DI | GREEN |
| crew-landing-keep | landing-harness без native DI | GREEN |
| crew-landing-letters | landing-harness без native DI | GREEN |
| crew-lock-task | landing-harness без native DI | GREEN |
| crew-lock-wait | landing-harness без native DI | GREEN |
| crew-landing-candidate | landing-harness без native DI | GREEN |
| crew-answer-golden | намеренно изменён только help-контракт HOLD/wake | RED help; explicit expected delta повтор в очереди |
| crew-answer-view | answer-harness без native DI, unknown status | GREEN |
| crew-stale-candidate | landing-harness без native DI | GREEN |
| crew-landing-race | общий native-state `.tmp` между процессами + отсутствующий DI | GREEN исходного межпроцессного теста |
| crew-idle-tab | background=working; fixtures busy без native execution | GREEN |
| crew-view-gone | landing-harness без native DI | GREEN |
| crew-nudge-matrix | T11 ждёт ≥5 POST при новом пределе 3; T3 повтор nudge | GREEN после первоначального RED 2/52 |
| crew-sidebar-groups | oracle старой строки HOLD без обязательной legacy-классификации | GREEN |
| crew-panel-busy | synthetic fixture terminal перекрывает исторический assistant; нет explicit active для свежего хода | GREEN |
| crew-compaction-summary | landing-harness без native DI | GREEN |
| crew-no-queue-behind-question | H/K не завершали native execution при удалении UI-формы | RED; добавлена отрицательная active и положительная idle проверки, повтор в очереди |
| crew-answer-loop | legacyAnswerPass использовал исходный ctx мимо terminal fixture | RED C; explicit settlement повтор в очереди |
| crew-idle-watch-burst-flow | busy fixture без native execution | GREEN |
| crew-idle-watch-flow | busy fixture без native execution | GREEN |
| crew-landing-crossrepo | landing-harness без native DI | GREEN |
| crew-answer-flow | answer-harness без native DI; исторический at не согласован с hook | GREEN повторно |

Предыдущий отдельный runner, jobs 1: 4 GREEN (`crew-wake-recovery`, `crew-delivery`,
`crew-native-recovery`, `crew-answer-flow`), 1 RED (`crew-nudge-matrix`), 305 с, exit 1.
После него добавлены immutable receipt assertions, background question, MCP/drain и уникальные atomic tmp;
последний targeted pretest — 11 файлов / 116 проверок GREEN (полный набор этим не заменяется).
Oracle T11 явно изменён под требование bounded retry (ровно 3 вместо
ожидания бесконечных повторов ≥5); требование одного письма/истории не изменено.

Изменения общих корней: loaders получают явный native DI; fixture не выдаёт synthetic completion за
terminal исторического assistant; native foreground idle отделён от background reservation;
native-state/receipt/idle-health пишутся через уникальный pid+UUID tmp. Исходный межпроцессный
`crew-landing-race` включён в отдельный повтор, не подменён unit-тестом.
