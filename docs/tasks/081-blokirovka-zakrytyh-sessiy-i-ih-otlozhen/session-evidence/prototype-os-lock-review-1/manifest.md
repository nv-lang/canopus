# Raw manifest: prototype-os-lock-review-1

Новый raw и fixture запуска сохранены в отдельном каталоге разрешённого `Temp/opencode`; не удалять. В репозитории оставлены digests и перечень, без локатора. Fixture-код использован неизменным.

- Команда: `node test/prototype081/os-lock-2/probe.mjs` из `opencode-plugin/`, `crew_watch machine=true`; exit 0.
- Watch id: `1792346591410-u2hy8l`; длительность около 5 секунд.
- Watch output SHA-256: `160CC034DF32E784AE3FC17A244D3D5FA08A6312FADDE1D473C5BDFE16C04837`.
- Driver rawRoot id: `crew081-os-lock-2-cNQl8E`; contention mutex: `Local\CrewHarness081OsLock2-57460-1792346593284`.
- Driver source SHA-256: `probe.mjs` `D4BFA7CB821BACB49DFD0AD5E9EA2B9BD2FFDA638B78F93A6C4784989AEDBD1F`; `consumer.ps1` `D6B8F9CB95FAD4E672812DAB0F38B6C3D4D2C52CCDEF7020AC9681BD24725E82`.

| Raw artifact | Bytes | SHA-256 |
|---|---:|---|
| `intent.json` | 90 | `0DA5CF892355BF7E4C2D3CF82DD642B7D6424212B49D0707FC9B1A8F1BD3A501` |
| `barrier/recovery.json` | 134 | `2A5211A3C4915DCE88BB94B12BA0384EB51902BEB242C0A2DB6EBAC7353F987A` |
| `raw/events.jsonl` | 1893 | `F52377242847BF355594F9A54A763E7AC822163E0F587FE0B164DA6D296BCD89` |
| `raw/process-registry.json` | 490 | `9A94A5943E48D65DFBC78898E8939735193571D8A958275E905E2E8C1B3F539D` |

Registry: `contention-owner` PID 99536 exit 0; `contention-contender` PID 56740 exit 4; `crash-owner` PID 26116 exit 4294967295; `recover-contender` PID 32036 exit 0; `B` PID 44772 exit 0. Каждый из пяти записан `closed: true`; точная последовательность событий в raw `events.jsonl`.

**Наблюдаемость:** raw child-start `mutex` ошибочно отражает внешнее имя даже для crash pair и B; см. `prototype-os-lock-review-1.md`. Источники остаются неизменными, а отдельные имена задаются вызовами driver-а. Эта оговорка не исправляет raw задним числом.
