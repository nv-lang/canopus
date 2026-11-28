Ожидаемое множество новых файлов захода 4 (зафиксировано до probes):
- session-evidence/s2-4/own-expected.md
- session-evidence/s2-4/before-manifest.json
- session-evidence/s2-4/read-map.md
- session-evidence/s2-4/probes.md
- session-evidence/s2-4/after-manifest.json
- spec-review-4.md

Append-only журналы (только с исходным префиксом): progress.log, profile.log, usage.log.
Корень: R дерева задачи. Все абсолютные пути разрешены внутри R до записи; новые файлы создаются эксклюзивно.

Сохранность префиксов на момент раннего снимка (до собственных append):
- `progress.log`: 6327 bytes, SHA-256 `6309e5903d4e4ef764ea9bdfbcae217735f26ba57a5033faec5aaa826996fb5e` (включая строку запуска №8 и собственный старт; далее только append штатных строк С2 захода 4).
- `profile.log`: 1229 bytes, SHA-256 `4b341991f5e644541370054bfe4c209db97e02a3517a8dac62461a1708719b88`.
- `usage.log`: 4274 bytes, SHA-256 `b0d96b3e5f4b25d73e49a0892b8abfd02a621366ca11b25a8849dc9db14c1b56`.

Проверка входов (совпали с назначением):
- spec.md: 43139 bytes, SHA-256 `22e641def114d3207f3ec303e6e5f5eebaaac82973cb2d2bc0ccbd46350aa43e`.
- analysis.md: 10024 bytes, SHA-256 `1750a21b58cf27840dc22113d4ffec5bca6c97c6d28108f405da9cc0bbea6ab6`.
- spec-trace.md: 40896 bytes, SHA-256 `cacad23b828a51c8a1e6d6c30ed1bca0a2b998bbf6e7b384635a24f71211752c`.

Generated `.opencode/opencode.json`: включён в before-манифест, если существует; динамика квалифицируется отдельно в after-сверке.
