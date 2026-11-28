# Последняя независимая проверка требований С2-4

## Полномочия и обязательная остановка

Владелец, 2026-10-18, question «081: последний заход», доставка 02:25:
«Sol + Kimi (Recommended)». Разрешены ровно одна авторская правка Sol (С1п-2,
запуск 7, уже завершена) и одна полная завершающая С2-4 Kimi. Сейчас только С2-4.
После любого результата интегратор обязан вернуться к владельцу; нет С2-5,
новой авторской правки, сброса потолка, автоматического approval, плана или кода.
Три прошлые С2 не дали полной чистой проверки; чистая серия 0. Не выдавать один
чистый заход за необходимые две проверки или за утверждение требований.

Модель `kimi-code-plan-global/k3-256k`, независимая от автора OpenAI Sol.
Общие настройки/лимиты/профили не менять. Новых агентов и задач не создавать.
Весь human-readable результат по-русски; команды/идентификаторы без перевода.

## Входы и полный предмет

Рабочее место — существующее дерево задачи 081, не основная копия и не дерево 061.
Сначала git top-level/HEAD/branch сверить read-only, Канон от README, AGENTS именно
своего дерева, process и применимые ADR. В этом дереве база
`26429fa11424f4a5bb0b6a595dc0a95cea6e1601`; ветка
`task/081-blokirovka-zakrytyh-sessiy-i-ih-otlozhen`.

Полностью прочитать task/message.md, root analysis/spec/spec-trace, все относящиеся
слова владельца/уточнения и квалификации интегратора, собственное назначение,
`integrator-s1p-2-qualification.md`, авторские С1п-2 evidence. Самостоятельно
сверить каждое исходное условие с атомарной картой; не принять 178 за доказанную
полноту только по числу. Исторические ID 10→11→18 и T→N не должны терять условия.
Прежние С2 и finding-response читать как историю замечаний, не как готовый вердикт.
Проверяется весь контракт, а не только два заголовка С2-3.

Версия входов:
- spec: 43139 bytes, SHA `22e641def114d3207f3ec303e6e5f5eebaaac82973cb2d2bc0ccbd46350aa43e`;
- analysis: 10024 bytes, SHA `1750a21b58cf27840dc22113d4ffec5bca6c97c6d28108f405da9cc0bbea6ab6`;
- trace: 40896 bytes, SHA `cacad23b828a51c8a1e6d6c30ed1bca0a2b998bbf6e7b384635a24f71211752c`.

Методика081 закреплена на `0442a4d3a380f01f437640b5dd9174e384e50d67`.
Читать immutable Git blobs `task-algorithm.md`, `task-sessions.md`, `task-runner.md`
и применимые первичные разделы methodology/completeness. Внешний клон только читать
через `git -C`, cwd всегда своё дерево; не fetch/checkout/изменение внешнего дерева.
Выводы не заменять авторской картой. Большие выводы дочитывать адресно; длинные строки
раскрывать без правки исходника. Не объявлять доступный непрочитанный источник missing.
Read-map обязан отделять полное чтение, диапазоны, недочитанное и его влияние.

## Две независимые линзы

1. Согласованность/исполнимость: каждый REQ/AC/DNC, модель L до результата,
   C/D/terminal, достижимый положительный outcome, конечный T и исход каждого
   crash/concurrency schedule. L/T — предложение автора, не слово владельца.
   Не требовать уже выполненных продуктовых AC от запрещённой спецификационной
   сессии; но противоречие/недостижимое обещание/непроверяемый oracle квалифицировать.
   Конкретный primitive остаётся плану, отсутствие реализации не равно доказательству
   невозможности. Вечный STOP не удовлетворяет положительной цели L.
2. Обход/злоупотребление: A-source, A-recipient, B-only, causation service writer,
   bound role item и independent open role item; persisted req/claim/полученный input,
   admission до close и close до admission, effect после consumer boundary, recovery,
   stale actor, два consumers, crash после spawn до PID, потеря claim/intent,
   PID reuse/reparenting/handles и сохранность положительной B. Не пропустить
   takeReply/crew_inbox, прямые deliver и служебные synthetic/final notes.

Самостоятельно пройти актуальный writer→queue→consumer граф исходников: watch/timer,
request/claim/start/poll/cancel/done/recovery; postLetter/send/role/QUEUE/claims;
deliver и все прямые callsites; inbox/takeReply; retry/resume/start/reassign/release/
finish/reconcile/end-task. Поиск по всему opencode-plugin, затем чтение тел каждого
существенного consumer, не только строки вызова. Авторская read-map — указатель,
не доказательство полноты. Внешние independent API/legacy effects не объявлять
контролируемыми из-за локального fence. Scope исходной цели P1 не ослаблять.

Отдельно перепроверить package.json (полностью декодировать длинный scripts.test),
test/README, guards workflow, README/help/tool descriptions: каждый AC имеет
отдельный proof, future exact targeted/full/CI команды и docs/current места.
Privacy PASS не lifecycle PASS; fake host не OS/platform proof. Команды сейчас
не запускать; тяжёлые в будущем только через очередь машины.

Дать отдельное независимое небиндинговое мнение о В-01/02 и достаточности границы,
основанное на первичном тексте. Это мнение этой С2, не ретроактивное согласование
прошлой сессии и не ответ владельца. Не запускать peer/нового агента. Полномочия,
spec approval, сужение цели, admin/live и потолок решает только владелец.

## Форензика и неизменяемость истории

Raw копии находятся вне repo. Физические адреса доступны в tool history/локаторах
назначений предыдущих сессий; при необходимости спросить интегратора crew_send,
не угадывать root и не искать credentials. Все 87 существующих копий сверить по
первичному raw-manifest; missing run1 архивы/logs не восстановлены этим совпадением.
Правильный dossier 15150 bytes, SHA
`7a1f831a85caa227d9d3c36c45f6bf34bab144ea29e1080b58607ed8825d9969`.
Старый expected63 остаётся ошибкой. Исторические snapshot8→6→5 не exit proof.
Old A=`ses_mvawdsam690xeqwzpp`, B=`ses_mvcoxay3pjag7acd92`.
Шесть run1 records принадлежат B, old run2=`1792264172390-3ns1ev`.
Не включать чужие run1 ID в множество целей остановки A.

С2-3 before теперь явно обозначенная публичная производная. Проверить rawSHA
`676911c617282bb80dc3c4bd0f6c7b575ccd319a3794dc1046634fb9f9eaa147` → derivativeSHA
`aeebd8404ff0b276d9ee17076aad9c9fe24fccccc896cb39bf38b2273230c97c` и неизменность
files/phase/excluded_exact. Полный raw byte diff остаётся внешне; публичный diff
структурный с обозначенным скрытым root. Не переписывать производную или raw,
не исправлять старый verdict задним числом. Новых утечек не чистить самовольно.

## Свои выходы и шесть единиц

Разрешены только новые `spec-review-4.md`, `session-evidence/s2-4/**` и append трёх
точных root progress/profile/usage. При коллизии STOP, ничего не перезаписывать.
Root3, все прежние evidence/reviews/назначения/log/current/code/config immutable.
Строка сдачи/launch в log — действие плагина, не разрешение агенту править историю.
Generated `.opencode/opencode.json` включить в before и квалифицировать динамику.
До каждой записи absolute resolved path должен попасть в exact allowed scope.
Новые файлы exclusive create, Python только -B/no bytecode, не исполнять старые helpers.

Первая собственная строка progress start codeС2/round4, N=6; launch пишет плагин.
По одной step немедленно после каждой единицы, не заполнять журнал задним числом.

1. Identity/Канон/свой whole-tree before всех existing tracked/hidden/untracked,
   `.git`-файл bytes/hash без payload, root3 hashes, точные prefixes, expected до проб.
2. Полное чтение первичных заданий/норм и самостоятельная source→REQ/AC/DNC карта,
   история ID/снятые условия; read-map с дочтением, не формальная проверка числа178.
3. Полный существенный code consumer cut и контракт L/C/D/terminal/S/R/O;
   две линзы, feasibility граница, exact package/CI/docs, мнение В-01/02.
4. Собственные минимум три различные группы документальных позитивов/негативов:
   always-STOP vs positive L/fault; ownership/role/claim/consumer schedules с B;
   raw/derivative/identity/privacy без мутаций originals. Expected/input/route до
   invocation, actual/raw/exit либо честный manual N/A. Не выдавать их за тест продукта.
5. Сверка raw87/partition/derivative и own whole-after/полный nameset/bytes/hashes,
   protected/prefixes и manifest точных outputs; ошибки измерений сохранять отдельно.
6. Полный независимый `spec-review-4.md`: первая строка «Заход 4: существенных K,
   поверхностных M, проб P», вторая «Версия: <три SHA>». Для каждой находки источник,
   фиксированный сценарий, недостающий/противоречивый outcome, критичность, уровень
   решения и исправление. Отдельно verdict каждой линзы, полнота чтения/проверок,
   недоказанное и вопросы. Даже при 0/0 не approval: затем честный done/stop,
   profile/usage и submit81 интегратору. После результата остановиться.

## Безопасность

Нет code/plan/product tests/guards/build/fixtures/admin/API mutations/live/restart,
git writes/refs/commit/push/удалений, новых sessions/agents/tasks. Старую Nova A
не открывать и не будить; нет interrupt/cancel/inbox delete/taskkill/queue writes,
Phase1/rerun. Не читать full env/v9/credentials/parent env, transcripts/inbox bodies.
Новые live metadata/inbox GET для проверки текста не нужны; actual schema и первичные
источники доступны. Если разбор OpenCode API всё же нужен, сначала skill opencode,
фактическая V2 схема; только read-only schema, не действия по старой V1 памяти.
Никаких правок в 061/031/045/013 или внешних репозиториях. Nova 094 HOLD.
