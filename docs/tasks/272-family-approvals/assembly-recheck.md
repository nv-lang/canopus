# 272: узкий повтор DOM-стыка REQ-11/12

Возобновлена та же сессия после снятия HOLD и управляемого перехода. Новая сессия/агенты, native resume, backend sandbox и повтор старого широкого аудита не создавались.

## Точный снимок и предел

- Signed исходный результат 272: `5c1ca94eae14ff0a53fdf16d09bc3eed824c0a9e`, сохранён отдельным checkpoint ref.
- По разрешению интегратора 16:21 и GO 17:32 (2026-11-01) в свою `task/272-family-approvals` перенесена assembly `61c3dd3193dcb805baeb106e15316b98c7e3972c`, названная 277 в письме 18:05.
- Восстановление только собственного итогового документа — signed `9485ed850e5fe76acec33b942b15380efd7103fe`. Продуктовый source этого снимка равен `782c6eba`; общий helper не изменялся.
- Native approval module, ACP client и policy побайтно совпали с прежним signed результатом 272; изменён стык composer/picker из общего кандидата. Это основание для узких DOM-проб, не перенос старого GREEN на новую цель.
- После постановки этих проб 277 сообщила другой frozen product candidate: `aa1b271a82d60efae4bda334ba9dd73edefe3ffa` (письмо 21:15). Результаты ниже **не относятся к aa1b271a**. Перенос актуальной базы согласуется с интегратором через рабочий вопрос `23a44ff66e7549fdf4cb5aae0b9fc8ba70be4a63e9fd089dedfe0bd06470a137`.

## Полученные доказательства

Все прогоны выполнены через machine queue, Node test concurrency 1. В raw напечатан HEAD `9485ed85`.

1. `node --test --test-concurrency=1 src/web/test/family-approvals.test.mjs src/web/test/agent-choice.test.mjs` — **13/13 PASS**, watch `1793556965931-bl7i3i`.
2. `node --test --test-concurrency=1 doc/tasks/272-family-approvals/assembly-approvals.test.mjs` — **2/2 PASS**, watch `1793557139415-16rn4a`.
3. `verify.ps1 -Stage guards` — **10/10 PASS**, skipped 0, watch `1793557399009-yjc8rm`; pre-commit также PASS.

Новые проверки используют настоящий `createView`, reducer и компактный source picker с заменённым DOM:

- переход actual picker model/effort → pool/level → выбор native id конкретной семьи не стирает approvals других семей;
- кнопка непосредственно перед микрофоном, input/microphone не пересоздаются, черновик сохраняется;
- явный широкий native id в Подготовке вызывает только `onApproval`, не меняет route/source и не фабрикует server confirmation.

Продуктовых FAIL на этом разрешённом стыке не найдено; product fix и RED→GREEN не выдумываются. Это DOM/fixture evidence, **не реальный браузер, API или модельный вызов**. Safety нового restricted backend, исходный полный server_live RED и реальные провайдеры этими двумя тестами не переоцениваются.

## Передача

277 переданы готовые SHA, зависимости, прежние counts и пределы REQ-11/12; 271 передан wire и требование не считать native approvals server allowlist. Signed proof/test delta `125e8642` не содержит продуктовых изменений и принят 277 именно как evidence старой assembly, не product fix.

**Исторический блокер на момент 6cf53b17:** 277 в 21:15 разрешила только read-only сверку helper и потребовала согласовать актуальную targeted базу с интегратором. Рабочий вопрос `23a44ff66e75` тогда имел status `routing`, epoch 1. Результаты 61c3 не выдавались за проверку aa1b271a. Новый backend/full не запускался; remaining unit 277 не дублировался.

## Минимальный test-only delta для aa1b271a

Ответ команды через интегратора от 21:31 по `23a44ff66e75` штатно подтверждён `ack`: не переносить source/helper/main/settings и не переключать ветку ради повтора; при конкретной несовместимости новых тестов разрешён только адресный targeted на изолированном archive актуального SHA.

- Извлечён только `src/web` из exact `aa1b271a82d60efae4bda334ba9dd73edefe3ffa` в отдельный временный archive. Общий helper и продуктовый source своей ветки не менялись.
- Проверен Git blob `src/web/view.js`: `6bb61630c8d3a2407d642f89e25f990e7e0a3f16`, совпадает у aa1 и извлечённого файла.
- На исходной fixture получен **RED 1/2**, watch `1793558610744-2ap5f9`: assertion `current compact source picker exposes model Two`. В aa1 direct models берутся из текущего `session_model`/подтверждённого modelMetadata, а исходная fixture подавала models только через межсессионный `agent_catalog`. Это несовместимость тестовых данных, не доказанный дефект продукта.
- Единственное исправление — добавить `models` и `efforts` в fixture `session_model`. Нативные идентификаторы, assertions, ограничения Подготовки и продуктовый код не менялись. Signed test-only commit: `9078d6477ec6fe4fcc8994278581504ea98c0219`.
- Тот же адресный запуск **GREEN 2/2**, watch `1793558722739-2iyamb`, Node concurrency 1 через machine queue. SHA256 теста: `30dfe565132f9a8869ac937ca929c5262453c237a0da5c2a254736397e507de7`.

Для 277 минимальная передача — ровно файл `doc/tasks/272-family-approvals/assembly-approvals.test.mjs` из signed `9078d647`. Если его ещё нет в helper, передать как добавление полного файла, а не вслепую cherry-pick трёхстрочного изменения без родительского `125e8642`. Исходные 61c3 counts остаются только на своём SHA.

На aa1 подтверждены только два DOM/fixture controls REQ-11/12: compact picker/pool/native family state/composer preservation и отсутствие локального изменения route/source от wide native choice в Подготовке. Это **не полный web, не backend security аудит, не реальные API/браузер/провайдеры и не GREEN всего кандидата**. Общая DOM/source приёмка и включение файла остаются у 277. Новые full/backend/model/provider probes и native resume не выполнялись.
