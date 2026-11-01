# Отдельные повторы первого полного прогона

Первый диагностический полный прогон: `node opencode-plugin/test/stable.mjs --all --runs 1 --jobs 3`:
35 RED / 157 файлов, exit 1, 2068 с. Это не проверенный кандидат. Снимок содержит незавершённую миграцию fixtures.

Срез 2026-11-01 15:10. Первый отдельный runner `--jobs 1 --runs 1`, exit 1, 1136 с:
27 GREEN / 37 вызовов (25 исходных файлов и 2 новых), 5 настоящих RED и 5 NOT RUN из-за моей ошибки invocation:
аргумент `crew-flow.test` без расширения превратился в `crew-flow.test.test.mjs` (аналогично ещё четырём).
Это не подтверждение тестов. Корректный отдельный повтор всех 10: 6 GREEN / 10, 4 RED, exit 1, 269 с.
После разбора последних четырёх: `crew-push crew-review crew-stuck-clear crew-answer-golden` — **4/4 GREEN**, exit 0,
83 с, jobs 1. Дополнительный `crew-tier` — GREEN, exit 0, 6 с. Теперь каждый из исходных 35 действительно повторён
отдельно и имеет GREEN; это всё ещё не окончательный полный набор.

| Файл `test/*.test.mjs` | Сигнал первого RED / установленный общий корень | Отдельный повтор |
|---|---|---|
| crew-track-extra | landing-harness без native DI, isolation sentinel | GREEN |
| crew-tool-texts | landing-harness без native DI, isolation sentinel | GREEN |
| crew-flow | nudge/delivery/закрытие | GREEN после исправления invocation |
| crew-tasks | push после подтверждённого старта | GREEN после исправления invocation |
| crew-push | до-model admission не означает assistant turn; bounded timeout/escalation вместо phantom nudges | GREEN после RED; без ложного wokeAt, одна эскалация |
| crew-review | готовность worktree записывается раньше async native admission; ожидать letter как условие | GREEN после RED; oracle текста/числа писем сохранён |
| crew-status | background watch ошибочно отображался foreground working | GREEN после исправления invocation |
| crew-watch-tree | прежний oracle требовал убить живых потомков по исчезновению wrapper; теперь explicit cancel | GREEN |
| crew-stuck-clear | H.open удерживает native до idle; сохранена прежняя строка log «a working turn» при строгом новом timestamp guard | GREEN после RED 1a/4 |
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
| crew-answer-golden | намеренно изменён help-контракт HOLD/wake; лишний пробел в expected delta устранён | GREEN, включая spoiled negative control |
| crew-answer-view | answer-harness без native DI, unknown status | GREEN |
| crew-stale-candidate | landing-harness без native DI | GREEN |
| crew-landing-race | общий native-state `.tmp` между процессами + отсутствующий DI | GREEN исходного межпроцессного теста |
| crew-idle-tab | background=working; fixtures busy без native execution | GREEN |
| crew-view-gone | landing-harness без native DI | GREEN |
| crew-nudge-matrix | T11 ждёт ≥5 POST при новом пределе 3; T3 повтор nudge | GREEN после первоначального RED 2/52 |
| crew-sidebar-groups | oracle старой строки HOLD без обязательной legacy-классификации | GREEN |
| crew-panel-busy | synthetic fixture terminal перекрывает исторический assistant; нет explicit active для свежего хода | GREEN |
| crew-compaction-summary | landing-harness без native DI | GREEN |
| crew-no-queue-behind-question | H/K не завершали native execution при удалении UI-формы | GREEN после отрицательной active и положительной idle проверок |
| crew-answer-loop | legacyAnswerPass использовал исходный ctx мимо terminal fixture | GREEN после explicit settlement |
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

## Следующий полный прогон и lifetime

На frozen `3287ed54` полный набор дал 159 GREEN / 160, exit 1, 816 с. Новый RED `crew-stuck` exit 13 подтверждён
отдельно (5 с): внешнее pending create удерживает `await stop()`. Это не отменяет реальные GREEN предыдущих файлов,
но новый общий GREEN не заявляется. Дополнительный late-create regression до исправления дал exit 1 по bounded dispose.
После scoped abort/epoch: целевые stuck/dispose/late/bracket/handover 5/5 GREEN; затем усиленный pretest 12 файлов /
127 проверок и stuck/handover 2/2 GREEN, вся команда exit 0, 22 с. Требуется следующий полный набор 161 файла.

На `cc9a11f9` полный набор: 160 GREEN / 161, exit 1, 991 с. Единственный RED `crew-project-settings-key` отдельно
GREEN (18 с), причина — собственные set/use изменения fixture, предупреждение о которых попадало в rename-case
в зависимости от TTL. Runtime frozen без изменений; узкая стабилизация fixture сохраняет точный oracle и добавляет
положительную проверку divergence до коммита своего временного файла. Окончательные три повтора **3/3 GREEN**, 65 с,
exit 0. Впереди полный набор на новом frozen test SHA, production байты относительно cc9a11f9 не менялись.
