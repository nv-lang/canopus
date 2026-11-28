# Самостоятельная проверка источников — С2-5

## Накопленные предметные наблюдения (ещё не итог)

- Spec 45–50, 164–165, 229–231 требуют отдельных admissions на переходах одной O; AC-05 307–310 требует ровно один admission/effect на O. Проверяется сценарий mailbox→host→подконтрольный effect: необходимо согласовать единицу дедупликации, не выбрать архитектуру.
- L 73–100 не ограничивает число затронутых операций/процессов и задержки справедливого исполнения, но требует полного terminal registry за ≤120 секунд активной работы. Проверяется измеримость и граница T; сам primitive не выбирается, невозможность текущей реализации не утверждается.

## Предметная карта исходного message (самостоятельный проход)

| Источник | Проверенное условие → текущее место | Вывод |
|---|---|---|
| M9,14,18 | P1, исправление класса, evidence, адресный revoke, RED→GREEN, independent/CI, публикация отдельно → цель, REQ-01/07/09/18, AC-02/07/09/16/18 | Сохранено; выполнение продукта не заявлено |
| M15 | worktree/launch/start/step/ограниченный этап → ограничения назначения и own manifests | Сессионное, не функция; текущий before содержит 769 файлов |
| M19 | сохранность обоих runs, #94 HOLD, нет broad kill/destructive/source/assets/tags/release → REQ-08/09, DNC-02/03/04, В-01 | Сохранено |
| M20 | exact owner/schema/capture до mutations; unknown→STOP → REQ-07/09/12, AC-07/09/12, В-02 | Сохранено, безопасное умолчание не разрешение |
| M22–26 | четыре гипотезы release/poll/cancel/done и interrupt≠fence → исходники watch/core/index, REQ-06/07 | Гипотезы не сняли obligations |
| M29 | whole-before/root/.git/hidden/untracked/HEAD/fullsuite → собственный before, REQ-18/AC-18 | Это процедура, не прежний before инцидента |
| M30 | raw/provenance до admin; public/raw separation; missing не реконструировать → REQ-09/11, AC-09/10/15 | Сохранено; hashes не bytes утраченного |
| M31 | exact old owner/process identity, V2 не V1, без bodies/old wake → REQ-06/07/12/14, DNC-05/06 | Сохранено; новый live GET не нужен |
| M32 | lifecycle/queue/claim/admission/poll/recovery/concurrency/exit/new turns → REQ-01…07/10/12…16 и surfaces | Контракт развернут; единицу O проверяю отдельно |
| M33 | атомарность текста, FACT/I/U, REQ/AC/DNC, output/current, вопросы, closed watch/race/restart/kill/B, full checks → все 18 AC, DNC и вопросы | Конкретные proof kinds отделены; продуктовые AC не исполнены |
| M34,36 | after, чего не остановили, exact outputs/accounting/submit, неизменность слов владельца → назначение С2-5 и scope-audit | Admin не выполнялись, запрет действий вне своего E |
| M40,42–52 | полная цель/результат/plugin/README/help, связи и границы → REQ-17/18, В-01/02, DNC | Сохранено; машинной parent-связи не приписано |
| M56 | административный выбор и точный остаток → В-01/02 | Ответа владельца ещё нет |

Уточнение A (sol-correction-setup/assignment) прочитано целиком: A13–22 полномочия; A26–42 входы/нормы; A48–61 поддерживаемая модель и обязательный успех; A65–77 обе identity/role/persisted/claimed/received; A81–92 атомизация/история/полные consumers/proofs/вопросы; A96–106 partition/digest; A110–130 сохранность/единственная derivative; A134–162 exact scope/журналы/запреты. Каждое условие сопоставляется с N-картой, не принимается по числу строк. Окончательная построчная N-сверка и нормы — consumer-audit/read-map и отчёт.
