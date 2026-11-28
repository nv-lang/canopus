# Квалификация авторской редакции С1п-2

## Результат и статус

Root3 исправлены по всем С2-1/2/3 и дополнительным квалификациям.
18 REQ / 18 AC / 6 DNC, 178 отдельных source atoms и явная история 10→11→18.
L определена до результата; crash/PID/claim/concurrency входят в обязательный
положительный contract, always STOP не PASS. S/R/O и causation различены;
persisted/claimed/role/consumer schedules определены, положительная B сохранена.
Privacy, lifecycle, docs и full checks имеют разные доказательства.

Это готовность авторского текста к квалификации интегратора и последней С2-4,
не approval требований, не доказанная feasibility и не GREEN продукта.
С2-4 назначает интегратор; после любого результата — владелец, без С2-5.
Новые профили/общие лимиты/потолок не менялись. Код, план, тесты, fixtures,
guards, build, admin/API mutations, queue writes, kill, Nova/re-run/live не делались.

## Сохранность собственного дерева

Исходный HEAD/ветка readonly подтверждены после перерыва среды:
`26429fa11424f4a5bb0b6a595dc0a95cea6e1601`,
`task/081-blokirovka-zakrytyh-sessiy-i-ih-otlozhen`.
Before охватил 734 existing files, hidden/untracked/.git-file bytes/SHA.
Три mutable root входа скопированы до правок и не выдавались за new outputs.

`preservation-actual.json`: 0 missing, 0 unexpected existing, 0 unexpected new.
Изменены только root3, разрешённая производная и append progress на момент сверки.
Три исходных progress/profile/usage prefixes сохранены; log/assignment/reviews,
все остальные old evidence, code/config/.git unchanged. Generated config в этом
before/after не исключался, исчезновения в этом замере нет; после submit возможная
штатная динамика — отдельное наблюдение интегратора, не ретроснимок этой проверки.

Полный diff root3 — `root3.diff`, 1066 строк. Before→after получен из exact copies,
не из git diff по untracked. Три frozen-root3 копии фиксируют сдаваемую редакцию.
Последующая машина проверяет целиком исходные байты и hashes, а не обещание по diff.
Whole-after/actual-output-manifest завершаются после этого текста; self-reference
файла manifest не хешируется рекурсивно и обозначена явно.
После финала допустимы только accounting, submit и остановка; append после снимка
не выдают за несохранность старого prefix или новый byte-identical journal.

## Форензика и публичная производная

Новая сверка: 87 копий / 1804234 bytes, 0 mismatches, dossier15150/expected64
совпал. Шесть run1 records принадлежат B; old run2 — A. Старый expected63/mixed
JSON сохранён как ошибка истории. Старые 8→6→5 snapshots разных моментов —
не общий exit proof; missing run1 archives/raw logs не восстановлены.

Только `s2-3/before-manifest.json` заменён разрешённой производной:
rawSHA `676911c617282bb80dc3c4bd0f6c7b575ccd319a3794dc1046634fb9f9eaa147` →
derivativeSHA `aeebd8404ff0b276d9ee17076aad9c9fe24fccccc896cb39bf38b2273230c97c`.
Raw побайтно сверён с внешним freeze/manifest до изменения и дополнительно
сохранён во внешнем freeze С1п-2. `phase`, `excluded_exact`, `files` неизменны.
Diff только root/provenance; полный raw byte diff с машинным root только внешне,
public structural diff явно скрывает значение root. Не raw early before,
не изменение прежнего verdict и не общая чистка evidence. Публикации нет.

## Что проверено и что нет

Проверены первичные применимые нормы, code consumer cut, package/workflow/docs,
actual V2 schema и exact raw copy/identity. `read-map.md` сообщает диапазоны и
не выдаёт SDK/unrelated UI/реестр практики за полностью прочитанные.
3 группы / 20 документальных случаев, включая отрицательные подстановки и
положительные B/success controls; 0 продуктовых тестов. Scan 23 файлов имел
0 machine path hits и положительный контроль, но НЕ полный guards/privacy PASS.
Все новые outputs дополнительно проверяются final inventory, без чтения секретов.

Остатки: primitive/OS containment и реальные liveness/exit/write proofs не
испытаны; внешний/legacy fence и безопасный admin протокол не разрешены.
В-01/02 с адресатами/вариантами/сроками/default остаются владельцу через интегратора.
Отсутствие второго мнения по ним раскрыто, нового агента вне назначения не было.
Две ошибки собственной процедуры (relative raw locator и контекст patch)
сохранены, не стали PASS задним числом. Перезапуск сервера не создавал новый start.

Nova #94 HOLD; никаких старых процессов/запросов эта сессия не останавливала.
Локальная положительная L-цель остаётся обязательной, но не выдаётся за доказанное
глобальное завершение инцидента. Независимая С2-4 должна проверить весь текст,
обе линзы и все source/consumer/исторические ограничения, не только два заголовка.
