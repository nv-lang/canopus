> Утверждено владельцем 2026-11-06: 5/10 и dirname-instance. Обязательное уточнение: снятые настройки сохраняются именованными константами кода для возможного повторного открытия; реализация функций сохраняется.

# 286 — Более сильное сокращение, предложение 2

Статус: утверждено владельцем; реализуется. Предыдущее сокращение 12/52 владельцем не принято: «Сначала предложить ещё более сильное сокращение полей». Выбор экземпляра уже принят: папка выбранного config — root; два файла одной папки разделяют данные/секреты. Удаление публичных входов реализуется по этому согласованному перечню; их политики сохраняются в коде.

## Конечная публичная схема

Приложение: пять привычных решений (47 прежних leaf-полей → 5): `port`, `store`, `agents`, `voice.language`, `voice.model`. Голос дополнительно можно целиком выключить значением `voice: false`; это одно действие, а не набор managed/url/dir переключателей. Установка инструмента, внутренний адрес и запуск определяются программой. Пример:

```json
{"port":8103,"voice":{"language":"ru","model":"small"}}
```

Файловое хранилище — default. Для PostgreSQL в обычном config достаточно `store: "pg"`; вместо пяти раздельных pg-полей в `secrets.json` хранится один `database_url` (стандартная PostgreSQL connection string). Это один ввод подключения, а не группа новых тайных override. Пароль и строка соединения не печатаются; инфраструктурные admin-секреты создания контейнера остаются только у admin-скрипта, не в runtime-схеме приложения. Смена backend не выполняется автоматически.

Плагин: десять проектных ключей (73 → 10), все необязательны:

| Ключ | Единственное пользовательское решение |
|---|---|
| `tasks_dir` | Где документы задач; обещанная поддержка doc/tasks и docs/tasks. |
| `model_profiles` | Справочник фактических моделей/вариантов и их окон; без него потеряется выбранная маршрутизация моделей. |
| `profile_sets` | Наборы распределения моделей по этапам; три прежних дублирующих входа spawn_models/tiers/bounds прекращаются. |
| `profile_set` | Выбранный владельцем набор; личный local.json сохраняется. |
| `spawn_limits` | Одновременная работа по роли. |
| `inflight_limit` | Общий предел незавершённых задач; это не число процессов и не дубль предыдущего. |
| `machine_slots` | Бюджет тяжёлой нагрузки машины; не сводится без потерь к числу задач. |
| `owner_language` | Язык владельца. |
| `answer_mode` | Политика ответов на обычные рабочие вопросы. Создание/отмена задач и ворота владельца этим не обходятся. |
| `acceptance_file` | Единственный источник дополнительных проектных критериев — документ Канона; дубль списков в JSON убрать. |

Мы намеренно не превращаем эти десять ключей в один `settings` с прежними 73 полями. Модельные каталоги содержат записи моделей, а не технические таймеры. Три разных бюджета оставлены отдельно, поскольку их слияние реально изменило бы параллельность работы и нагрузку владельца.

Глобальный файл плагина оставляет четыре ключа: `project_settings`, `defaults`, `local`, `retention_days`. В defaults/local допустимы только перечисленные десять проектных ключей. Идентичность виртуального проекта `{project, root}` задаётся только в project_settings; обычный репозиторий определяется автоматически по пути. `retention_days` — срок хранения доставленной истории, default 7, 0 отключает очистку; это самостоятельное решение о данных. Прежние aliases `projects` и `keep_days` прекращаются после явного перехода. Файлы чужих проектов не менять; их разрешённые поправки и глобальные определения сохранить у нас.

Минимальный файл обеих частей — `{}`. У плагина для обычного репозитория необязательно создавать отдельную project entry. Общий config и local продолжают работать в принятом порядке, выбора переменных окружения больше нет.

## Что прекращает быть настраиваемым — цена решения

| Группа | Что произойдёт | Что пользователь теряет |
|---|---|---|
| Параллельные способы выбора модели | spawn_models/tiers/tier_min/tier_max/allow_default_models преобразуются в эквивалентные наборы моделей перед удалением. | Отдельные произвольные распознаватели названий модели по подстроке и runtime clamp поверх выбранного набора. Ограничения передаются в содержимое разрешённого набора, а не тихо сбрасываются. |
| JSON-списки приёмки | acceptance, plan_acceptance, plan_merge_acceptance — стандартные обязательные шаги + acceptance_file для добавлений. | Несколько конфликтующих источников одних критериев. Нестандартные существующие шаги сначала переносятся в согласованный документ; без точного эквивалента переход блокируется. |
| Управление безопасностью | merge_precheck всегда required; принятие планов/новых задач/отмены — за владельцем; без config-bypass. | Возможность отключить предпроверку и передать последнее подтверждение агенту. |
| Роли и доступ | integrator остаётся единственной встроенной эксклюзивной ролью, межпроектные обращения — только через интегратора; reviewer и поля обязательного задания стандартизируются. | Произвольные exclusive roles, открытый межпроектный доступ, нестандартные пользовательские поля и переназначения ролей. Это реальное сужение продукта, требующее этого согласования. |
| Формы/шаблоны старых plan-файлов | Единая форма и обязательные вопросы — часть продукта/Канона, не runtime JSON. | Произвольные plan_sections/header/prefix/labels/marks, отдельный шаблон плана и отдельный plans_dir. Документы задач — в tasks_dir; чужие старые документы не переносятся автоматически. |
| Ветки и worktree | target_branch и source branch — default branch соответствующего репозитория; worktree рядом с репозиторием в worktrees, имя {repo}-{n}-{slug}, ветка task/{n}-{slug}. | Произвольные шаблоны имён и отдельные пути; существующие деревья/ветки не переименовываются. Текущее расположение и шаблоны этого проекта совпадают с предложенными. |
| Контроль выполнения | Таймеры, напоминания, rework/round ceilings — фиксированное безопасное поведение и явные решения владельца на воротах. | Настройку десятков порогов через JSON, включая отдельные step таймеры. Числа не исчезают в новом advanced. |
| Уборка и слоты | accepted_slot=free, cleanup_limit=10, cleanup local+remote после явного действия и разрешений. | Пользовательские варианты удержания слота и режима уборки. Нестандартная сохранённая политика не сбрасывается автоматически. |
| Уведомления/тексты | Системные уведомления о вопросах включены; их доставка управляется ОС. Дополнительные правила — обычный AGENTS.md/Канон проекта; стандартная сводка сжатия включена. | Per-project toggle owner_system_notify, отдельный project_rules prompt и выключение стандартной сводки через Canopus JSON. |
| Голос приложения | Встроенный локальный Whisper, свой порт/каталог/запуск автоматические, voice=false выключает. | Подключение произвольного внешнего STT URL и отдельное управление процессом. |
| Прочие настройки приложения | Внутренние route/таймеры/trace/ask/image-limit knobs фиксируются безопасными defaults. Hub остаётся текущим внутренним компонентом, публичных настроек у него нет. | Подстройку внутренней реализации. Сам хаб эта задача не удаляет и новую архитектуру не подменяет. |

## Полный exact mapping прежних ключей

App публичные: `port`, `store`, `agents`, `voice.language`, `voice.model`.

App соединение → secret database_url: `pg.host`, `pg.port`, `pg.database`, `pg.user`, `pg.password`.

App вычисляемые: `data_dir`, `workdir`, `web_dir`, `machines_dir`, `hub.program`, `hub.args`, `routes_dir`, `voice.dir`, `tools_dir`.

App внутренние/фиксируемые: `idle_term_seconds`, `acp_trace`, `ask_form`, `ask_timeout_seconds`, `max_image_bytes`, `route_reviewer_order`, `route_task_limit`, `route_task_messages`, `route_fix_attempts`, `route_worktree_ask`, `route_overlap_seconds`, `route_keep_days`, `context_drop_percent`, `route_confirm_word`, `route_over_limit_word`, `route_max_active`, `route_tool`, `route_auto_propose`, `route_children`, `route_wip`, `wip_timeout_seconds`, `agent_start_timeout_seconds`, `agent_silent_minutes`, `auto_extend_confidence`, `task_scope`, `voice.url`, `voice.managed`, `preset`.

Plugin публичные: `tasks_dir`, `model_profiles`, `profile_sets`, `profile_set`, `spawn_limits`, `inflight_limit`, `machine_slots`, `owner_language`, `answer_mode`, `acceptance_file`.

Plugin идентичность только в global project_settings: `project`, `root`.

Plugin вычисляемые: `branch`, `target_branch`, `plans_dir`, `plan_name`, `worktrees`, `worktree_name`, `branch_name`.

Plugin внутренние/фиксируемые либо снимаемые возможности из таблицы: `exclusive_roles`, `inbound`, `task_fields`, `spawn_models`, `tiers`, `tier_max`, `allow_default_models`, `tier_min`, `allow_self_assign`, `default_priority`, `accepted_slot`, `cleanup_limit`, `task_extra_fields`, `route_defaults`, `push_empty_turns`, `stall_minutes`, `idle_tab_minutes`, `step_term_minutes`, `step_term_by_step`, `step_extend_minutes`, `step_answer_minutes`, `step_questions_max`, `step_letters_per_pass`, `step_old_minutes`, `long_turn_minutes`, `accepted_reminder_min`, `owner_reminder_min`, `owner_system_notify`, `push_max`, `reviewer`, `plan_rounds_max`, `plan_clean_rounds`, `plan_sections`, `plan_header`, `plan_prefix`, `plan_labels`, `plan_marks`, `plan_mode_question`, `plan_acceptance`, `plan_merge_acceptance`, `plan_grades`, `plan_approver`, `plan_steps`, `plan_template`, `heavy_commands`, `acceptance`, `rework_max`, `cleanup`, `merge_precheck`, `merge_lock_per_task`, `answer_delay_sec`, `answer_max`, `compaction_summary`, `project_rules`.

Точный реестр JSON и удаляемых 34 runtime env — inventory.json. Необязательные секреты провайдеров и протокольные session/task/watch переменные не являются пользовательской схемой Canopus и не удаляются.

## Сохранение действующего выбора

У этого проекта не-default параллельность spawn_limits={worker:5,reviewer:4}, inflight_limit=100 остаётся как есть; machine_slots из global.local сохраняются. model_profiles/profile_sets и личный profile_set сохраняются без смены моделей. answer_mode каждого зарегистрированного проекта сохраняется. Текущие accepted_slot=free, cleanup_limit=10 и merge_precheck=required уже совпадают с фиксируемыми значениями; branch/worktree templates и directory также совпадают. owner_system_notify=true сохраняется включённым поведением. Разрешённые глобальные определения чужих проектов не пропадают.

Перед переходом сформировать полный diff настроек всех зарегистрированных проектов без значений секретов. Любой non-default в удаляемом поле не игнорировать: либо доказанный эквивалентный перенос (модели/приёмка), либо адресное решение владельца. Живые конфиги, данные и main не менять до зелёных проверок и разрешённого обновления root.
