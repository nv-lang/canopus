# Документальные регрессии С1п-1

Плановые пробы текстовой спецификации, не исполнение продукта. Не создавались fixtures, API calls, процессы, queue records, команды или тесты. Вход — сохранённые draft и квалификации; ожидаемое сформулировано до сверки; actual — ручной проход обновлённого контракта.

| Группа / case | Вход и ожидаемое | Фактический oracle после правки | Итог |
|---|---|---|---|
| Close race A | Порядок: close committed до admission. Ожидание: отказ, no spawn, no file/letter side effect | REQ-03/AC-02 закрепляет единственный outcome и проверяет side-effect absence | PASS как текстовая проверка; не product test |
| Close race B | Admission committed до close. Ожидание: exact operation найдена; close не возвращает success до terminal proof | REQ-03/AC-02; неизвестная identity/exit => unresolved STOP | PASS как текстовая проверка |
| Crash before identity | Порядок: OS spawn succeeded, PID/identity persistence failed/crash; также claim удалён, intent потерян | REQ-04/AC-04 требует recovery exact operation либо STOP; успешный close запрещён | PASS как oracle в тексте; реализация неизвестна |
| Owner partition | Вход: шесть run1 IDs replacement и восемь old inventory IDs | Сравнить каждый ID с session owner; replacement false target, old inventory отдельно | PASS по qualification mapping; фактическая запись «ID» не является самостоятельной raw forensic перепроверкой С1п |
| Digest source | Ожидание до проверки: 15150 bytes + правильные 64 hex из первичного intake | SHA string length 64; old 63-char expected не равен; actual новой проверки не заявлен | PASS для записи expected, actual not run; не PASS старой verification |
| Unknown kill/PID reuse | Вход: kill error, reused PID, absent PID snapshot, `done`, exit code 0 | Ни один фактор не даёт successful close; неизвестное => STOP | PASS как текстовый отрицательный oracle |
| External client | Прямая V2 prompt/command/inbox запись от независимого клиента | Если нет поддерживаемой external fence — HOLD и вопрос владельцу; interrupt не заменяет цель | PASS как boundary; API mutation не выполнялась |
| Replacement scratch | Old operation writes new worker scratch; параллельный отдельный new worker action | Old write должен быть denied/нет изменения; replacement write должен пройти | Требуемая будущая парная проверка AC-08; здесь только контракт, no fixture |
| Public/test gates | Проверить, не смешаны `npm test` и CI guards | Spec называет exact sets отдельно и через очередь для тяжёлого; их не выдаёт за выполненные | PASS как документационная проверка |

## Ручной audit и ограничения

- Проверены определения admission/close и оба interleaving; один schedule не принимает два outcome.
- Проверен crash после spawn до PID persistence и потеря intent: результат explicit unresolved/STOP, не successful close.
- Проверена подстановка wrong identity, digest length 63, replacement ID в old inventory, отсутствующего PID и kill-success status. Все отрицательные случаи не могут стать GO.
- Проверена положительная независимая операция replacement worker в own scratch, отдельно от старого deny.
- Нет runnable oracle для реализации, потому что продукт не менялся; следующая С2 оценивает полноту и feasibility.
