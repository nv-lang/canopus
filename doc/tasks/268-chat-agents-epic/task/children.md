# Дочерние задачи эпика 268

| Номер | Тип | Название | Папка | Ветка | Сессия | Состояние | Затрагивает |
|---|---|---|---|---|---|---|---|
| 269 | дочерняя | Пресеты и пулы моделей: настройки и выбор исполнителя | doc/tasks/269-agent-pools | task/269-agent-pools | прежний исполнитель | идёт | src/config/presets.nv; src/config; src/server |
| 270 | дочерняя | Компактный выбор агента, поиск и шкала усилия | doc/tasks/270-agent-picker | task/270-agent-picker | прежний исполнитель | идёт | src/web/view.js; src/web/app.css; src/web/test/agent-choice.test.mjs |
| 271 | дочерняя | Подготовка задачи и интерактивная работа без смешения маршрутов | doc/tasks/271-chat-work-modes | task/271-chat-work-modes | прежний исполнитель | идёт | src/web/routes.js; src/web/crew-task-ui.js; src/server; doc/routes |
| 272 | дочерняя | Подтверждения действий по семьям агентов | doc/tasks/272-family-approvals | task/272-family-approvals | прежний исполнитель | идёт | src/server/acp; src/server/turn; src/web/view.js; src/config |
| 273 | дочерняя | Голосовой ввод в компактном поле сообщения | doc/tasks/273-voice-composer | task/273-voice-composer | прежний исполнитель | идёт | src/web/voice.js; src/web/stt.js; src/web/recorder.js; src/web/view.js |
| 274 | дочерняя | Новый чат по центру и выбор папки проекта | doc/tasks/274-new-chat-projects | task/274-new-chat-projects | прежний исполнитель | идёт | src/web/projects-ui.js; src/web/projects-api.js; src/web/view.js; src/server/front/projects_api.nv |
| 275 | дочерняя | Выбор исходной ветки и рабочей папки чата | doc/tasks/275-git-workspaces | task/275-git-workspaces | прежний исполнитель | готово | src/server; src/web/projects-ui.js; src/web/view.js; doc/canon/decisions/ADR-0014-child-tasks.md |
| 276 | дочерняя | Чаты по проектам, закреплённые и сессии без проекта | doc/tasks/276-sessions-sidebar | task/276-sessions-sidebar | прежний исполнитель | идёт | src/web/view.js; src/web/projects-ui.js; src/web/session-row.js; src/web/projects.js; src/server |
| 277 | дочерняя | Совместная приёмка нового интерфейса чатов и переноса настроек | doc/tasks/277-chat-epic-acceptance | task/277-common-candidate | прежний исполнитель | идёт | src/web/test; src/server tests; doc/README.md; doc/canon |

Ручная карта на возобновление 2026-11-01 по письму действующего интегратора 15:44 и recovery-входу дежурного. Это не перенос статусов системы задач и не объявление принятия. Точные SHA, история соответствия и непроверенные границы — в [manifest](../../277-chat-epic-acceptance/common-candidate-manifest.md). Приватные идентификаторы сессий в публичную карту не переносятся.
