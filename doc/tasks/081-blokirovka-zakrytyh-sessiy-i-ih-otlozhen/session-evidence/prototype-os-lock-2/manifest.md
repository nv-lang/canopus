# Raw manifest: prototype-os-lock-2

Raw fixture/output сохранены вне репозитория в разрешённом временном каталоге; ниже перечислены digest-ы без локатора. Не удалять raw: они содержат намеренный crash-state и lock/recovery evidence.

Успешная проба: `node test/prototype081/os-lock-2/probe.mjs`, вызвана через `crew_watch machine=true`, exit 0. Watch output SHA-256 `FB8F05ED39CE6F5ACC546BDB9527E7DCBE3A089F4198695B41AB93DFDB5FF523`. Отдельный первый запуск после driver failure: та же команда, exit 1 на BOM-парсере; watcher output SHA-256 `60DE4FCACDAD832F4C08289469D74D46D14D2AA7DD69716BECC1ADA3820BEAD8`.

| Raw artifact | Bytes | SHA-256 |
|---|---:|---|
| `intent.json` (durable D от crash owner) | 90 | `0DA5CF892355BF7E4C2D3CF82DD642B7D6424212B49D0707FC9B1A8F1BD3A501` |
| `barrier/recovery.json` | 134 | `2A5211A3C4915DCE88BB94B12BA0384EB51902BEB242C0A2DB6EBAC7353F987A` |
| `raw/events.jsonl` | 1893 | `010138BB6E311E4BCCEB53DFBFDB55AAB54BCE8B3019378515358020EB1B9277` |
| `raw/process-registry.json` | 490 | `1047AF6484600D9489AEC66CEF103AE06028A1CB46B06B3C4E2840F6AB086D2C` |
| `barrier/contention-owner.owned` | 5 | `E7E9E2C247BC872BACCE77661C78F001A17D70EE3130A9016A5818DA9DA00CDB` |
| `barrier/contention-contender.contended` | 5 | `E7E9E2C247BC872BACCE77661C78F001A17D70EE3130A9016A5818DA9DA00CDB` |
| `barrier/contention-owner.effect` | 9 | `D69E75B10B1DC93F81D1B8F61135C8720252392777AF5981B3425BC157732EBB` |
| `barrier/crash.contender-opened` | 5 | `5C272042CEDE2596555E6B6F2C36857B015CCAB9F34AFFBC63D6B000CCD08391` |
| `barrier/crash.owned` | 5 | `A7BFF94C7CDEF50B67A3BAB142EBCEC4D360491E339581C41F433FEC6D002F48` |
| `barrier/B.effect` | 9 | `D69E75B10B1DC93F81D1B8F61135C8720252392777AF5981B3425BC157732EBB` |

Полный процессный реестр успешного запуска: `contention-owner` PID 52776 exit 0/close; `contention-contender` PID 77268 exit 4/close; `crash-owner` PID 54308 exit 4294967295/close; `recover-contender` PID 83168 exit 0/close; `B` PID 54776 exit 0/close. Опрос этих пяти PID после run не вернул процесс; это только реестр собственных детей, не глобальная инвентаризация PowerShell. Случайные прочие PowerShell процессы не атрибутировались и не трогались.

Источники для сверки: `prototype-os-lock-correction-result.md`; новые fixture исходники рядом с `opencode-plugin/test/prototype081/os-lock-2/`. Старые `os-lock-1` и предыдущие raw неизменны.
