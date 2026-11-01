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

Новые проверки используют настоящий `createView`, reducer и компактный source picker с заменённым DOM:

- переход actual picker model/effort → pool/level → выбор native id конкретной семьи не стирает approvals других семей;
- кнопка непосредственно перед микрофоном, input/microphone не пересоздаются, черновик сохраняется;
- явный широкий native id в Подготовке вызывает только `onApproval`, не меняет route/source и не фабрикует server confirmation.

Продуктовых FAIL на этом разрешённом стыке не найдено; product fix и RED→GREEN не выдумываются. Это DOM/fixture evidence, **не реальный браузер, API или модельный вызов**. Safety нового restricted backend, исходный полный server_live RED и реальные провайдеры этими двумя тестами не переоцениваются.

## Передача

277 переданы готовые SHA, зависимости, прежние counts и пределы REQ-11/12; 271 передан wire и требование не считать native approvals server allowlist. Текущий proof/test delta не содержит продуктовых изменений. Для подтверждения участка на новом frozen product SHA нужен разрешённый узкий повтор после его включения; aa1b271a не объявлен проверенным.
