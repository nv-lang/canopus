# Фактические документальные пробы С1п-2

Expected до actual: `expected.json`, затем подробный `probe-plan.md`.
Проведены 3 разные группы, 20 именованных случаев; P5 завершён финальной
whole-tree сверкой в единице 6. Это авторские текстовые
пробы/сверка bytes и identity, не product tests и не доказанная реализация GREEN.

## 1. Исполнимость контракта и обязательный положительный исход

| Случай | Фактический oracle в исправленном spec | Оценка текста |
|---|---|---|
| G1 L, C<D | REQ-03, AC-02: success, no user spawn, B allow | Однозначен |
| G2 L, D<C | Terminal scope перед success, конечный T; effect до C учтён | Однозначен |
| G3 L, spawn без PID | AC-04/11: восстановление O/scope или proven fail-stop | STOP не PASS |
| G4 L, claim/PID failure/два consumers | AC-04/05/11/16: intent цел, один effect/O, success в T | Always STOP отвергнут |
| G5 legacy/external | REQ-06, вне L: exact unresolved/HOLD, В-01/02 | Не ложный GREEN |

Положительный контроль найден: текст требует success и B, не только отказ A.
Отрицательная подстановка: «всегда вернуть STOP» удовлетворяла бы части прежнего
AC-04, но нарушает текущие REQ-16/AC-11/16. Это различающий текстовый oracle,
не прогон мутированной реализации. Ограничение T и L — авторские предложения
для независимой С2; платформенная реализуемость ещё не испытана.

## 2. Ownership/deferred effects — отдельные фиксированные schedules

| Случай | Фактически найдено | Оценка текста |
|---|---|---|
| O1 A-source persisted | Обе стороны проверяются заново, REQ-12/AC-12 | Отказ старой O |
| O2 A-recipient persisted | Таблица запрещает доставку A и retarget B | Отказ, не B |
| O3 B-only | REQ-08, AC-03/08: allow и положительная запись B | Не blanket-block |
| O4 req/claim до C, D после | Claim не D, no user spawn, AC-12 | Отказ |
| O5 D до C, effect ещё нет | Таблица: отозвать, не начинать, terminal proof | Не свободный start |
| O6 consumer received | D effect после C запрещена; D раньше C учитывается | Receipt не admission |
| O7 связанный role A | REQ-13/AC-13 не разрешают resolve в B | Не retarget |
| O8 открытая заявка живого S | AC-13 разрешает выбрать B и зафиксировать R | Положительный B |
| O9 A-source/legacy role | A deny; неизвестное поколение quarantine/unresolved | Не угадывание |
| O10 внешний consumer | AC-14: external ID/terminal либо unresolved | Inbox=0 не success |

Отрицательные подстановки: silent retarget противоречит REQ-13; запрет всех B
противоречит REQ-08/AC-08/13; замена causation на service sender не разрешает O.
Административный audit не доставляется в A даже как wake:false/synthetic.
Все 7 direct deliver, crew_inbox/takeReply и watch consumer находятся под этим
контрактом; проверка одного главного pass недостаточна. Это source/text audit.

## 3. Raw/производная/digest/privacy/сохранность

| Случай | Фактическое свидетельство | Результат |
|---|---|---|
| P1 raw/derivative | rawSHA сверён, files/phase/excluded_exact равны | Подмена entry отвергнута |
| P2 dossier | 15150 bytes/expected64 совпал, старый expected длиной 63 | Историческая ошибка сохранена |
| P3 B partition | 6 первичных B-records + 1 old run2; documentary-actual | B как old отвергнута |
| P4 public paths | 23 файла, 0 machine-prefix hits; контроль шаблона найден | Узкий scan, не guards PASS |
| P5 preservation | 734 existing: 0 missing/unexpected; root3/derivative/append только | Prefixes/root copies целы |

Raw before 130581 bytes/SHA
`676911c617282bb80dc3c4bd0f6c7b575ccd319a3794dc1046634fb9f9eaa147` →
derivative 131165 bytes/SHA
`aeebd8404ff0b276d9ee17076aad9c9fe24fccccc896cb39bf38b2273230c97c`.
Точный raw byte diff сохранён вне repo; публичный structural diff скрывает старый
machine root и прямо это сообщает. Ни новое SHA, ни scan не исправляют вердикт С2-3.

Машинный read-only документальный вывод — `documentary-actual.json`:
18 REQ, 18 AC, 6 DNC, 178 последовательных атомов; соответствие первых двух
строк spec; неверный entry отвергается; historical expected63 не равен actual64;
подмена 6 B owners отвергается. Ни private-name list, ни secrets не читались.
Полный privacy CI не запускался, а lifecycle GREEN не заявлен.
