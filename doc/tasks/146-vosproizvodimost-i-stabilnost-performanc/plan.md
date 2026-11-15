# Продолжение диагностики 146

Основание: владелец, 2026-10-29, прямой чат: «продолжай»; исходный scope и критерии `task/message.md` сохранены. Это диагностический план, не разрешение ослаблять gate и не готовое исправление.

## Проверяемое различие

В r2 C/T все 12 выбранных T p90 пересекаются с GC. У трёх красных attempts одного процесса overlap длиннее, но наблюдение не отделяет scheduling и concurrent GC. Проверить, меняется ли хвост при вмешательстве в частоту minor GC, не меняя scanner/fixture/formula. Вмешательство относится только к временному child Node: увеличенный semi-space. Настройки ОС, сервиса и глобальная среда не меняются. Такой эксперимент проверяет GC sensitivity, а не доказывает автоматически историческую причину.

## До запуска — обязательная сверка

### Уточнения после review интегратора 2026-10-29

Подготовка runner разрешена, heavy block требует отдельного checkpoint. Cheap capability checks (без benchmark workload) подтвердили Node `v24.15.0`, V8 `13.6.233.17-node.48`. Предлагаемые H/D flags: `--min-semi-space-size=64 --max-semi-space-size=64`. При запуске пустого child `v8.getHeapSpaceStatistics()` показал `new_space.space_size=67108864`, против `1048576` у default child. Это непосредственно наблюдаемый размер new_space, а не общий heap limit; не отождествлять его с размером всех трёх semi-spaces или объёмом занятой памяти. Flags фиксируют min/max, чтобы вмешательство было наблюдаемым уже до workload. Проверить эти runtime flags и фактические new_space snapshots в каждом measured child до AC-11 и после каждой попытки, вне timed sections. Default heap может расти: сохранять реальные значения, не объявлять его равным стартовому 1 MiB в ходе теста. Если H/D в реальном тесте не отличаются по наблюдаемой конфигурации, intervention не подтверждён; никакого обходного workload или подбора flag на ходу.

Предварительно заданные описательные C/H сравнения: first-attempt failure counts /10; медианы и полный диапазон 10 cold.med/read.med и cold.p90/read.med ratios; для каждого attempt число minor GC entries (kind 1), сумма их duration и пересечения timed cold/read intervals; new_space snapshots. Признак изменения pattern — различающиеся counts/durations и их распределение по arms, сообщённые целиком, без бинарного порога значимости и без выбора лучших попыток. Если GC pattern не различается, не утверждать GC intervention. Если различается, это всё равно sensitivity к heap configuration: флаги могут менять продвижение объектов, memory footprint и прочие свойства V8, не только частоту GC. GC duration не считать stop-the-world duration и не вычитать из gate.

D проверяет negative-control sensitivity при H. Дизайн не содержит slow8/default arm и потому не оценивает эффект heap flags на slow8 относительно default. Прежний matched B остаётся отдельным историческим блоком, а не четвёртым arm этого эксперимента.

1. Получить checkpoint интегратора по текущим пересечениям и очереди. Зафиксировать поддерживаемые child flags и фактические new_space snapshots; общий heap limit недостаточен. Если среда не позволяет подтвердить вмешательство, STOP, без альтернатив на ходу.
2. Две независимые immutable isolated source copies: clean и slow8; scanner/fixture/import manifests сверить с прежним валидным clean baseline. Старые roots и evidence не менять. Полный test entry сохраняет исходные функциональные assertions и формулу. Child `CREW_*` очищены.
3. Observation overhead одинаков во всех arms: сохранять исходные timed wall vectors и GC events после завершения попытки; не читать per-sample CPU/global counters между timed callbacks. Точные boundaries и observer flush проверить отдельно дешёвым self-test. Не использовать GC duration для коррекции wall или gate.
4. Зафиксировать runtime/test/runner/source hashes, точный flag, schedule, критерии результата и оценку времени до machine watch. Исходный `measured`/TRIES не менять в диагностической копии; first attempt primary, все retries сохранять.

## Предлагаемый единичный блок — пока не запускался

Три arms: C — clean/default heap; H — clean/увеличенный semi-space; D — slow8 с тем же heap flag, что H (сохранение чувствительности к настоящей дополнительной parse-работе). Размер heap не является предлагаемой production/test настройкой: это только intervention для диагноза.

Фиксированное N=30 processes, по 10 на arm, последовательно в одном `machine:true` watch. Предлагаемый порядок triplets: `CHD HDC DCH DHC HCD CDH CHD HDC DCH DHC`. Никакого досрочного завершения по PASS или продления выборки по результату. Оценка 6–10 минут плюс очередь, уточнить до заморозки runner. Это предложение протокола для review, не уже принятый frozen checkpoint.

Проверять все attempts/exit codes/functional labels и исходные median/p90 bounds. Первичные сравнения C/H: распределение cold/read ratios, first-attempt failure rate, количество и длительности GC events в cold/read, подтверждение изменения minor-GC pattern. Не трактовать 0/10 FAIL как доказательство устойчивости: это диагностическая выборка. Отрицательный контроль D должен дать 10/10 perf-only process FAIL, без exceptions/functional failures. Если нет — чувствительность не доказана, не увеличивать slowdown/N и не повторять до PASS.

STOP при manifest/import/fixture drift, ошибке runner/функциональной assertion или неподтверждённом heap intervention; все завершённые данные сохранять. Если C не показывает хвост или H не меняет GC pattern, эксперимент не различил причины. Если H меняет хвост вместе с GC, вывод ограничен причинной чувствительностью к child heap intervention; это не разрешение принять heap flag как fix или вычеркнуть GC из времени.

## После диагностики

### Checkpoint подготовки (2026-10-29, до разрешения запуска)

Подготовлены `heap-observation.mjs`, `heap-runner.mjs`, `prepare-heap-probe.mjs`, `heap-observation.selftest.mjs` в этой папке. Три isolated roots C/H/D созданы в разрешённом temp; manifests/полные пути остаются локально. Измерительные children не запускались. Первая подготовка остановилась на имени `sidebar.ts` вместо `.tsx`; partial root сохранён и не используется, исправленная подготовка создала другой root.

SHA256:
- manifest: `530e5c31c2ecce4bace13f458bcce908b780057af5945975f8186a54d767d493`;
- одинаковый entry C/H/D: `159834a6b1b2e0595e062817282be852e84e5c4fe7661e6a837b38ec3229d605`;
- observation helper: `de71f191a18440d98db85b085f8a84f957f0482c661ce1abb5f61afb50e19f82`;
- runner: `2313c9eb4d48f621053e57625ee6587c90d10ce92868fe28012e62b3bfdd58d2`.

Точная форма команды: `node <task>/heap-runner.mjs --run <temp-root>/frozen-manifest.json <temp-root>/review-receipt.json`. Receipt отсутствует; runner его не создаёт. Runtime fixture/import validation ещё не выполнена: она обязательна при запуске, как и manifest checks перед/после каждого child. Детерминированные self-tests валидатора (fake green/red/retry, неверные vectors/stats/flags/env/identity) и `node --check` entries/helper/runner прошли без benchmark workload. Проверка H/D требует `new_space >= 64 MiB`, а не ровно 64 MiB: после GC new_space может включать дополнительную semi-space; все фактические snapshots сохраняются. Не подменять эту проверку общим heap limit.

Решение об исправлении — только по результатам. Пороги 4x/6x и wall contract сохраняются; переход к другому критерию требует отдельного решения владельца при ослаблении. Далее нужны причинные RED→GREEN, сохраняемый negative control, заранее фиксированный post-fix x10, полный suite и guards задачи через очередь, signed exact SHA и независимая приёмка. До этого задача не GREEN, submit как готовой реализации недопустим.
