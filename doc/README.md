# doc: документы репозитория

Правила разработки — в [Каноне](canon/README.md). Задачи — в `tasks/NNN-<слаг>/`. Режимы работы пульта (тексты для хаба) — в [routes/](routes/README.md).

## Где что лежит (настройки и данные пульта управления)

Решение — [ADR-0016](canon/decisions/ADR-0016-config-layout.md) (владелец, 2026-10-29); подробности и команды — раздел «Where things lie» в [src/server/README.md](../src/server/README.md).

Корень экземпляра `CANOPUS_HOME`: аргумент `--home <папка>` → переменная `CANOPUS_HOME` → `<домашняя папка>/.canopus`. Портативного режима нет.

| Где | Папка | Что лежит | Можно удалить |
|---|---|---|---|
| корень | корень | настройки пользователя: `config.json`, `roles.json`, `presets/`, `modes/`, `prompts/`, `secrets.json` | нет |
| корень | `data/` | `projects.json`, `sessions/<id>/` (журнал, снимок, `acp.jsonl`, `inbox`, `images`) | нет |
| корень | `state/` | `serve.*.log`, `stt.pid`, `last_dir.txt`, резервные копии и отчёты `migrate` | да |
| корень | `cache/` | `agents.json` (каталог семей), `agent-config/` (копия настроек OpenCode без плагина) | да |
| корень | `tools/` | тяжёлые установки: `whisper/`; `CANOPUS_TOOLS_DIR` или `voice.dir` переопределяют | да |
| репозиторий | `.canopus/config.json` | общие настройки проекта (в git) | нет |
| репозиторий | `.canopus/local.json` | личные настройки (абсолютные пути); в `.gitignore` | нет |
| репозиторий | `.canopus/modes/`, `presets/`, `prompts/`, `roles.json` | то же по именам, что в `config/` | нет |
| репозиторий | `doc/tasks/` | задачи (остаются здесь) | нет |

Слои настроек (нижние перекрываются верхними): значения в коде → `config.json` → файл сервера (`serve <файл>`, `CANOPUS_SERVER_CONFIG`) → `.canopus/config.json` → `.canopus/local.json` →
`secrets.json` → переменные `CANOPUS_*` → аргументы (`--set ключ=значение`). Режимы работы: `.canopus/modes` → `modes` → `doc/routes`; роли, наборы и подсказки — те же слои по именам.

Старый `data_dir` остаётся рабочим (плоская раскладка в этой папке); `canopus migrate` переносит её в новую. Команды: `canopus config list --show-origin`, `config get`, `config set`, `doctor`, `migrate`.

Действующая схема конфигурации — [Канон: configuration.md](canon/configuration.md).
