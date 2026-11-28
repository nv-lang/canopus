Статус: черновик

Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть

# Результат 279

Кандидат готов к независимой проверке, **не внесён в main и не применён к живой системе**.
Tested signed SHA: `d01263fa064471bec3831ee2ac64c4c4242c0b0e`.

## Исправлено

- Busy согласуется с актуальным native execution, ownership и freshness. Старые busy/PID/outcome/tool сами по себе
  не разрешают delivery; unknown не free. Foreground idle допускает рабочий вопрос/ответ при сохранённом background
  watch, но не освобождает его место для нового назначения. MCP без доверенного native reader делегирует выбор очереди.
- Постановка письма, native admission и связанный новый assistant — отдельные факты. Same-ID retry ограничен;
  per-attempt receipt сохраняет ID/at/payload при crash/latest. Push не объявляет wake и не снимает stuck до proof.
- Execution/external/gate HOLD различены; legacy не мигрирован и не разрешает execution. Health не скрывается HOLD,
  очередью или обычным сроком шага; diagnosis привязан к A/B/эпизоду, blocker имеет ответственного и next-check.
- Unload отменяет локальные SDK waits, действительно abort-ит native HTTP/queue и ограждает late results epoch.
  Собственные continuations drain сохранены. Отмена уже принятого remote create **не утверждается**.
- Tools/help/схемы/README и стандартный npm lifecycle согласованы; legacy fixtures изолированы от реального сервиса.

## Проверено

- Полный `stable.mjs --all --runs 1 --jobs 3`: **161/161 GREEN**, exit 0, 943 с; 12 pretest + 149 test без дубликатов,
  отдельный node каждому файлу, через machine queue.
- Целевой pretest: **12 файлов / 127 проверок GREEN**; RED→GREEN и все отдельные повторы — [evidence.md](evidence.md),
  [repeats.md](repeats.md). Включены stale busy/native active/unknown, correlated wake, crash/late receipt, три HOLD,
  A/B health, missing-wrapper/live descendants, MCP, never-settling create, late I/O/create/prompt/rejection и abort.
- Все 10 стражей GREEN на tested SHA; privacy полного runtime-дерева — 2798 файлов GREEN. Окончательные документы
  проходят стражи до подписанного evidence-only коммита; runtime/test diff к tested SHA должен оставаться пустым.

## Границы и остаток

- Не выполнены live prompt/interrupt/form/model/move, CLI recovery, restart, push или merge. Main, настройки владельца,
  модели/усилие сессий, текущие HOLD, контрольные случаи и чужие задачи не менялись. Агенты не создавались.
- Proof ограничен последними 100 projected messages; отсутствие доказательства требует диагностики. Неизвестная
  схема/provenance закрывает execution. Legacy recovered claim без receipt сохранён, не объявлен delivered.
- Receipt archive пока не очищается автоматически. Late remote create может завершиться на стороне сервиса:
  плагин не объявляет его отменённым и сохраняет исходный task ID для штатного восстановления.
- Независимая проверка и решение об обновлении остаются за интегратором/владельцем. Живой стенд этой задачей
  не обновлялся. Отдельный результат 280 не копировался и не является условием сдачи 279.
