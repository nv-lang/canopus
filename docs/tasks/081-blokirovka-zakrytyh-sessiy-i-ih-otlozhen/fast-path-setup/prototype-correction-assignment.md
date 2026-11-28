# 081 С5д: одна ограниченная доработка проб

Владелец, 2026-10-18, question «081: исправить пробы», доставка crew 19:41:
«Одна доработка (Recommended)». Одна новая сессия обычного профиля, затем сдача
и STOP. Не новая задача и не цикл требований/плана. Sol не разрешён этой сессии.

Прочитать исходное `prototype-assignment.md`, неизменную spec, `prototype-result.md`
и `session-evidence/prototype-1/integrator-qualification.md`. Прежние scope/запреты
сохраняются. Baseline тот же exact export7e23895b, не подменять исходник.

## Пять единиц

1. Входы и сохранность: exact spec SHA38aa3a2c…; before SHA трёх старых скриптов,
   отчёта и manifest; старые файлы/выводы НЕ менять. Новые driver/gate/отчёт делать
   с суффиксом либо в `opencode-plugin/test/prototype081/correction-1/` и
   `session-evidence/prototype-correction-1/`; итог `prototype-correction-result.md`.
2. Настоящий baseline lifecycle: создать реальную открытую fixture card/attempt A,
   показать состояние до/после actual release/reassign/close; не использовать
   отсутствие card как close. Отдельно создать независимую B. Два разных расписания:
   **requested/persisted → close → poll/admission** и **running → C → terminal**.
   Не трактовать запись C как успешный terminal close, не требовать от разрешённого
   до C эффекта невозможного отсутствия предшествующего исполнения.
3. Один неизменный safety oracle должен давать RED на базе по целевому unsafe effect
   и GREEN на прототипе, B положительна в обоих случаях. Ожидание `unsafe===true`
   с exit0 — только diagnostic, не этот oracle. Сохранить точные driver SHA,
   revision/mode/command/exit/raw before **до исправляющего кода**. Приёмочный assert
   между RED и GREEN не переписывать; менять только тестируемую реализацию/адаптер.
   Baseline/control source копировать в отдельную fixture, оригинальный export
   и production source не менять. Честно раскрыть все добавленные test seams.
4. Простой общий filesystem gate без SQLite/native broker: два **реальных**
   независимых Node consumers, синхронизация детерминированными barriers, порядок
   C/D/event log, стабильный `(O,effectID)` и отсутствие повторного допуска. Пара
   C<D/отказ и D<C/учёт завершения; queued old-wake отказ, B успех. Restart проверять
   новым процессом, не только экземпляром класса. Проверить минимальную failure
   границу выбранного lock: stale-owner/crash не объявлять исправленными, если нет
   proof. Не освобождать чужой lock по одному timeout/PID. Если простой подход
   не справляется — минимальный контрпример и точный остаток, не новая архитектура.
5. Итог разделяет: baseline defect, устранённая check/use гонка, неподдержанные
   crash/OS/scope/T/legacy условия. Нужность тяжёлых компонентов не выводить лишь
   из неудачи одного `if closed`. Ни один частный GREEN не full L/OS/global PASS.
   Сдать новые outputs/команды/SHA и список своих процессов/watches/остатков;
   остановиться, не начинать ещё доработку автоматически.

С5д N5, launch пишет плагин; progress start/step/stop по факту. При раннем STOP
не создавать фиктивные завершённые пункты. Все пробы/targeted через machine queue,
до4 процессов тестов, падавший перепроверяется отдельно. Свои fixture процессы
ограничены и завершаются; не удалять evidence и старые raw. Публично только
переносимые производные. Старые неудачные attempts — история, не переписывать.

Запрещены SQLite/native broker/dependencies, system install/elevation, изменения
production/config/package/scripts/README/spec, commits/push/merge/rebase/reset,
admin/live/API mutations, запуск старых сессий, правка Nova и новые агенты.
Nova094 и orphan001 остаются HOLD. После этой одной доработки отдельные ворота.
