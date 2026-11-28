# 081 С5д-1: ограниченная доработка проб — результат

## Вердикт

Доработка не закрыта; результат только исследовательский, HOLD. Исправленный
filesystem gate probe прошёл в двух независимых Node-процессах, но он проверяет
самостоятельный adapter, а не lifecycle/watch реализацию. Он не заменяет
обязательный неизменный RED→GREEN oracle.

## Сделано и проверено

- Сохранены без правок утверждённая `spec.md`, прежний `prototype-result.md`,
  qualification и три прежних скрипта. Новые файлы находятся в
  `opencode-plugin/test/prototype081/correction-1/`.
- Добавлены `filesystem-gate.mjs`, `gate-probe.mjs` и `lifecycle-oracle.mjs`.
- `gate-probe.mjs`, команда `node opencode-plugin/test/prototype081/correction-1/gate-probe.mjs`,
  watch `1792342053821-au440w`, exit 0. Вывод: old-wake deny, C<D deny,
  D<C recorded, B success, two consumers one admission, restart deny.
  Это доказывает только локальное поведение экспериментального mkdir gate.
  Driver SHA256 `519873f3e5c102409cdb893a88b91972a1db21783745b96d4dc75b52217b125e`;
  raw SHA256 `e9e0f8338a4dd96b7a0562e31221a73e49d2aeec09db2eb7ae5f3bb61651da00`.
- Baseline lifecycle запуск: `node opencode-plugin/test/prototype081/correction-1/lifecycle-oracle.mjs '<immutable source>' '<temp root>'`,
  watch `1792342128199-1u4ari`, exit 1. Фактический JSON подтвердил A card
  `running`→`closed` через `releaseExecutor`, queued effect отсутствовал, B effect
  присутствовал. Процесс затем упал при cleanup (`EPERM`); это не положительный
  RED по целевому old side effect. Не считать эту пробу RED или safety PASS.
  Driver SHA256 `a2b9ea0520652a35f5e99442cf7cf16538042efe7947bd0f6fded66505a88990`;
  raw SHA256 `353c590ad8ad982b50f92b27c17ccab22d13e504b6bc349cf480655aafafd67f`.
- Предыдущие пробы gate с ошибками (JSON пустой; Windows URL path) сохранены как
  история watch, не переобъявлены успешными. Исправленный gate replay — единственный
  принятый результат этой части.

## Блокер и границы

Не получено корректного воспроизведения actual running→close→terminal с side effect
после закрытия; safety oracle не показал требуемый RED. Не выполнено GREEN на
исправленной lifecycle реализации. Нет отдельного requested→close→poll oracle,
старого side effect с настоящей карточкой, стабильного effect identity в baseline,
close-terminal proof, crash/recovery, stale-owner lock, OS/NTFS, L/T и полного
ownership coverage. Прототип gate не интегрирован с production и не является
доказательством общей реализации. Следовательно, никакие выводы о необходимости
SQLite/broker не делаются; оба legacy scope остаются HOLD.

Не запускались полный npm suite, guards, build, production или API. Коммитов,
изменений spec/config/package/scripts и действий с живыми/старыми сессиями нет.
Рабочие fixture/watch процессы не подтверждены полностью завершёнными из-за ошибки
cleanup; остаток требует проверки/уборки в отдельном разрешённом ходе. SHA raw
watch outputs указан выше, но raw не перенесён в evidence-папку.
Исходная revision `7e23895b8cb2c3ea9e4ac506455fedd440e6afd0`; рабочая HEAD
до отчёта `26429fa11424f4a5bb0b6a595dc0a95cea6e1601`.

## Следующий необходимый шаг

Нужна отдельная доработка с корректным lifecycle driver: создать открытую карточку
A, наблюдать actual running до `releaseExecutor`, дать команде выполнить эффект
после C, разделить этот случай с requested→close→poll; один неизменный oracle
должен краснеть на baseline и зеленеть только после изменения тестируемого adapter.
До этого результаты gate остаются частными наблюдениями, не закрытием требований.
