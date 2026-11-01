# Машина: Политика режима работы

- machine: WorkModePolicy
- revision: 3
- alula_version: 0.28

Сервер спрашивает таблицу перед побочным действием маршрута. `planning` — сохранённое протокольное имя Подготовки задачи. Это политика жизненного цикла хаба, а не изоляция native-инструментов внешнего агента.

`workspace` сохраняет только предпочтение, без Git-мутаций. Хост передаёт наблюдённые факты `workspace_locked` (исполнение началось или копия уже создаётся/создана) и `workspace_unavailable` (нет проекта с Git). Таблица запрещает менять предпочтение в этих состояниях; готовая Подготовка может сохранить его, но не получает `tree`/`execute`.

Для явного выбора копии `workspace_pending` запрещает `dispatch` до `workspace_ready`. `workspace_failed` оставляет отправку запрещённой, в том числе после позднего `workspace_ready`; новое явное сохранение выбора создаёт новую попытку. Хост хранит флаг отказа в журнале и проверяет поколение фоновой операции, не удаляя Git-данные.

## Стороны

| имя | идентификатор | вид | настройка | разбор | профиль | сигналы | части | счётчик |
|---|---|---|---|---|---|---|---|---|
| хаб | hub | свободный_ввод | — | — | — | interactive, fast, full, draft, recognize, execute, tree, repository, workspace, workspace_locked, workspace_unavailable, dispatch, workspace_pending, workspace_ready, workspace_failed, close | — | — |

## Состояния

- Начальное состояние: Preparation

### Preparation — обращение
- Сторона: хаб

| Событие | Условие | Действия | Куда |
|---|---|---|---|
| сигнал(interactive) | | | Interactive |
| сигнал(fast) | | | Interactive |
| сигнал(full) | | | Interactive |
| сигнал(draft) | | | то_же |
| сигнал(recognize) | | | то_же |
| сигнал(workspace) | | | то_же |
| сигнал(workspace_locked) | | | WorkspaceLocked |
| сигнал(workspace_unavailable) | | | WorkspaceUnavailable |
| сигнал(close) | | | Closed |

### Interactive — обращение
- Сторона: хаб

| Событие | Условие | Действия | Куда |
|---|---|---|---|
| сигнал(draft) | | | то_же |
| сигнал(recognize) | | | то_же |
| сигнал(execute) | | | то_же |
| сигнал(tree) | | | то_же |
| сигнал(repository) | | | то_же |
| сигнал(dispatch) | | | то_же |
| сигнал(workspace_pending) | | | WorkspacePending |
| сигнал(workspace) | | | то_же |
| сигнал(workspace_locked) | | | WorkspaceLocked |
| сигнал(workspace_unavailable) | | | WorkspaceUnavailable |
| сигнал(close) | | | Closed |

### WorkspacePending — обращение
- Сторона: хаб

| Событие | Условие | Действия | Куда |
|---|---|---|---|
| сигнал(workspace_failed) | | | WorkspaceFailed |
| сигнал(workspace_ready) | | | WorkspaceReady |
| сигнал(close) | | | Closed |

### WorkspaceReady — обращение
- Сторона: хаб

| Событие | Условие | Действия | Куда |
|---|---|---|---|
| сигнал(dispatch) | | | то_же |
| сигнал(workspace_failed) | | | WorkspaceFailed |
| сигнал(close) | | | Closed |

### WorkspaceFailed — обращение
- Сторона: хаб

| Событие | Условие | Действия | Куда |
|---|---|---|---|
| сигнал(close) | | | Closed |

### WorkspaceLocked — обращение
- Сторона: хаб

| Событие | Условие | Действия | Куда |
|---|---|---|---|
| сигнал(workspace_unavailable) | | | WorkspaceUnavailable |
| сигнал(close) | | | Closed |

### WorkspaceUnavailable — обращение
- Сторона: хаб

| Событие | Условие | Действия | Куда |
|---|---|---|---|
| сигнал(workspace_locked) | | | то_же |
| сигнал(close) | | | Closed |

### Closed — конец

## Выход

- Результат: строка

| конец | когда | ответ |
|---|---|---|
| Closed | истина | Ответ("closed") |
