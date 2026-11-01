# 269. Follow-up F-09 и ограниченный triage

## Полномочие и база

- Решение дежурного Codex по поручению владельца, 2026-11-01, question «Первый этап исправлений»: «F-09 и triage (Recommended)», передано интегратором письмом 07:47. Это источник решения дежурного, **не новая цитата владельца**.
- Только F-09 projectless cwd/env и triage; F-02/F-07/UI/quota/миграция/278 не реализуются. 276 не заменяется; прежние HOLD сохраняются. Модель/усилие, статус и маршрут задачи не меняются. Повторный submit не требуется.
- Перед переносом дерево было чистым, HEAD `0240df73d1e800f31be09746cc9f1b91c2c1c02d`. Относительно общей базы были эксклюзивны `466d37fd`, `7a9cdc83`, `984e1b83`, `0240df73`; последние изменения уже интегрированы как `d97f02d9`, `d2019375`, `af9790ff`. Range-diff показал отличия контекста сохранённых policy-проверок; replay поверх общей базы не выполнялся.
- Перенос разрешён интегратором 2026-11-01, письмо 08:00, ответ на `qmvxcpbidc5q2`; до операции записан `crew_branch_note`. После повторной проверки создан неперезаписываемый `checkpoint/269-before-f09-0240df73`, затем нулевой replay на `782c6eba7419c2a88863bf6caa6aa5cfbf2d8f3a`. Ветка остаётся `task/269-agent-pools`; stash/reset не использовались. Helper, 277 и main не изменялись.
- Backend общей базы совпадает с проверенным продуктом `73c97b5f3cda582831575a5133bc3375cba3e932`; аудит — signed checkpoint 277 `92dec486`. Дельта UI не считается принятой этим аудитом.

## F-09: preflight и STOP

Разрешённый контракт — отдельный cwd сессии в явном private neutral_root вне всех Git-предков. Нельзя использовать hub workdir, прежний проект, data/inbox/executable или искать запасной root по дискам/TEMP/CREW_HOME. Сохраняются журнал и данные; при неоднозначной continuity — отказ без потери истории. Нейтральный cwd не является sandbox. Все cold/ready/restart/switch/dispatch пути сохраняют WorkModePolicy/WorkspacePolicy и fail-closed.

До реализации прочитаны API именно поставленного дистрибутива:

- `std/src/fs/fs.nv:628–636`: `canonicalize`, через `Fs.realpath`; `nova_rt/fs.c:368–382` использует `uv_fs_realpath`. Windows-реализация libuv использует `GetFinalPathNameByHandleW`. Это даёт основание проверять фактический resolved путь, не только lexical normalize.
- Есть `symlink_metadata`; свойства reparse/junction и все предки всё равно требуют отдельных проверок, не считаются доказанными одним API-именем.
- `std/src/os/os.nv:298–307`: `Command.env_clear()` и явный env block доступны. Текущий `src/acp/link.nv` всё равно сам добавляет environment службы через `merged_env`, поэтому нейтральная политика потребовала бы отдельного явного пути env без такого merge, а не изменения process-wide environment.
- **Блокер:** `std/src/fs/fs.nv:644–648` явно документирует, что Windows `set_permissions` учитывает только readonly bit. Экспортированного чтения/проверки owner/DACL/private ACL в `std/src` не найдено. Portable chmod не доказывает private root на Windows.

По условию запуска «при нехватке FS/env API — сразу стоп/переоценка» F-09 остановлен **до продуктовых правок**. Интегратор уведомлён 07:51 и подтвердил сохранение STOP письмом 08:00. Нельзя подменить owner-only ACL флагом readonly или молча довериться каталогу внутри Git.

Для продолжения требуется отдельное решение: разрешённый ограниченный Windows ACL adapter внутри этого репозитория либо предоставленный runtime API с доказуемой проверкой private ownership/access. Никакой adapter не реализован и не запущен. Чужой runtime только читался. Оценка пересматривается после выбора; прежние 4–6 ч/2T 8–12 ч не являются разрешением обходить блокер. Admin TOCTOU без OS isolation не обещается.

## Triage: сохранённые артефакты

Ограниченный бюджет 45–90 минут не обнуляется при ожидании ответов. Начат с existing-artifact/source анализа после запуска follow-up; сборок и исполнений aggregate пока **ноль**. Старые counts не используются как доказательство baseline.

- Raw аудита `1793502701717-p6rnmr.out`: 9586 bytes, SHA256 `716bde338308745734fb3fdb536edd2ec62eb1e8afc65317c0313c0f8337a567` — совпадает с `evidence.json` 277.
- Metadata watch подтверждает исходный SHA `73c97b5f`, `src/server_live/family_approval_test.nv`, Nova Dev/Clang/jobs 1, исходный stage server-live. Watch завершился с кодом 1.
- Сохранился generated C `src_server_live_family_approval_test.c` из каталога `nova_tests-27616`: 23646984 bytes, SHA256 `3eab8a65dab101ff9d5879e17aa48d809e8b4f0671429d20bdec424761898c17`. Он не редактировался. В этом каталоге нет executable/obj.
- Mtime C, `1793502945165` ms epoch, попадает внутрь записанного интервала исходного watch `1793502702966..1793503103239`; имя модуля и 38 wrapper-имён согласуются с тем запуском. Это дополнительная provenance артефакта, не утраченный hash исходного executable.
- C-runner содержит ровно 38 имён. Raw содержит только 25 наблюдаемых исходов: 11 FAIL и 14 PASS. Для 13 оставшихся имён исход не виден; **среди них находятся три неизвестных FAIL**, но нельзя объявлять все 13 упавшими или выводить три имени из counts.
- Сохранённые `last-test-results.json` и `acp-fixtures-results.json` описывают другие прогоны/модули; они не восстанавливают 14 имён данного aggregate.

Имена без наблюдаемого исхода:

1. `269: exact source, confirmation before prompt, history, restart and no fallback`
2. `272: per-family approvals survive source changes and restart; unknown and broad preparation fail closed`
3. `files: two turns of a chat`
4. `files: burst chunks flush before the end event`
5. `files: permission asked, allowed, denied`
6. `files: a question with a choice is asked, answered, skipped, withdrawn`
7. `files: the tool ask_user_question of the hub: asked, answered, skipped, withdrawn`
8. `files: the tool ask_user_question of the hub: nobody answers in time, the late answer still arrives`
9. `files: the tool ask_user_question of the hub: the term passed and the hub restarted before the answer`
10. `files: with ask_form off the agent is not told about forms`
11. `files: a cancel keeps the session open`
12. `files: a session is renamed in the header`
13. `files: the texts of the hub come from the files of the layers`

Одиннадцать наблюдаемых FAIL перечислены в `result.md`; список наблюдаемых имён совпадает с raw 277. Это не новое доказательство отсутствия регрессий.

## Доказанные локальные причины и пределы

Без новых исполнений установлены следующие конкретные несоответствия источников/сохранённого C и наблюдаемого raw:

1. **Фикстура пресета перезаписывает layout.** `src/server/testkit.nv:1014` задаёт `layout`, затем `...settings`. В сохранённом C, строки 255913–255915, сначала присваивается нужный `layout_with_data_dir`, а следующей строкой весь объект перезаписывается `*settings`. Поэтому файл, записанный в `inst/config/presets/mix.json`, не читается из заданного layout. Наблюдаемые три assertions пресета соответствуют этому дефекту фикстуры. Это не доказательство дефекта production loader. Предлагаемое последующее исправление — явное присваивание layout после конструктора и отрицательные проверки неизвестного пресета, без ослабления assertions. Здесь оно не выполнялось.
2. **Фиктивный ACP разбирает аргументы env не из той строки.** `fake_agent.mjs:109–112` вычисляет command word по `plain` после удаления распознанных host paragraphs, но `case env` на строках 348–351 разбирает `text`. Raw содержит имена слов напоминания как будто это переменные среды, при этом реально запрошенные `FOO`/`CREW_192M_*` видны со значениями. Это конкретное несоответствие test-double protocol; raw не доказывает потерю этих env переменных. Точный echo `Echo: after restart` также несовместим с наблюдаемым ответом, содержащим намеренное host reminder. Коррекцию framing нужно отдельно проверить negative controls: неправильный env/потеря текста обязаны оставаться FAIL; слепое удаление текста или разрешающее contains не являются приёмкой.
3. **Request-view фикстура читает числовой turn как строку.** `request_view.nv:174` пишет `JsonValue.int(turn)`, а `request_kit.nv:21,32` сравнивает результат строкового `line_input` с `"1"`. `line_input` в `testkit.nv` использует только `v.str()`, поэтому для числового turn возвращает пустую строку. Это объясняет оба наблюдаемых request-view assertions. Последующая проверка должна читать настоящий числовой turn и сохранить строгую связь request/end, а не отказаться от проверки turn. Здесь код не менялся.

Эти локальные причины не распределяют все 14 FAIL и не означают, что остальные симптомы являются дефектами фикстур. Runtime negative controls и полный захват ещё не выполнены.

## Разрешённый следующий diagnostic и второй STOP

Интегратор, 2026-11-01, письмо 08:00, ответ на `qmvxcymzszirx`, разрешил только bounded compile неизменённого сохранённого C и **одно** direct executable исполнение с полными раздельными stdout/stderr, exit/timeout/partial, точной командой и C/runtime/toolchain/exe hashes, через machine queue. Это был бы **реконструированный** executable программы `73c97b5f`, не оригинальный binary 277 и не проверка helper `782c6eba`. Cwd/fixtures — отдельная изолированная копия точного снимка. Никаких изменений helper/277/main или preparation Nova aggregate run.

Условие разрешения: сначала доказать supported compile/link command по имеющимся артефактам/исходнику поставленного дистрибутива; флаги не угадывать. README дистрибутива и CLI help build/test-build этого пути не дают. Сохранённого полного clang/link argv в просмотренных watch/artifacts нет; libuv response files описывают только libuv, не сборку всего test executable.

**До получения доказанной команды compile/capture остановлены.** Ни перебора флагов, ни пробной компиляции, ни нового broad repeat не было. Интегратору 08:02 запрошен read-only источник/команда именно поставленного compiler. Если подтверждение не поступит в оставшийся бюджет triage, остаток — три неизвестных имени и невыполненный direct capture; RED остаётся RED. Короткий capture sanity без aggregate должен предшествовать единственному разрешённому run, если блокер будет снят. Нового baseline нет.
