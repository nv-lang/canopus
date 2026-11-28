# Разбор

Методика: unitcraft/ai-dev-methodology @ 744e0af34dc9c7f9d4db2a91e312ee170c6642fd

## Факты и решение

- `settings.ts` выбирает ветку по `origin/HEAD` (если недоступна — локальные `main`, `master`, затем `main`), затем читает закоммиченное через `git show <branch>:<file>`. Поле `branch` из уже прочитанного файла может выбрать другую ветку. Незакоммиченный файл не применяется.
- `config-diverge.ts` сравнивал рабочий файл сначала с `origin/<branch>:<file>`, затем с `<branch>:<file>`, но возвращал только ref сравнения. Сообщение выдавало его за источник, который читает загрузчик.
- Загрузчик требует наличия `branch:file`: при отсутствии `settings.ts` сообщает defaults/problem, не fallback на `origin/<branch>`. Для сравнения выбирается доступный `origin/<branch>`; если его нет — configured `branch`. Если `branch` уже `origin/main`, его нельзя префиксовать второй раз.
- Результат раздельно несёт `activeRef` (настроенный ref), `compareRef` (фактически найденный ref сравнения) и `keys` (diff рабочего файла с содержимым именно `compareRef`). При отсутствии active ref выдаётся note без ложного active remote.
- `README.md` не содержит утверждения «действуют настройки origin/main». Загрузчик `settings.ts` и его комментарии оставлены без изменений по границам задачи.
- Read-only объяснение первого full FAIL: legacy test меняет cfgA незакоммиченными `inflight_limit` и `profile_set`, а широкий фильтр `mine(head2)` включает слово «настройки»; cache divergence имеет TTL 5000 ms, не заданный в том тесте. Точный момент истечения TTL не записан; baseline тоже могла показать warning при cache refresh, поэтому FAIL не приписан однозначно новой формулировке. Узкий fix: TTL=0 только в изолированном тесте, note assertion отдельно, точное assertion изменённых ключей и refs отдельно.

## Проверки

- В `crew-config-diverge.test.mjs` есть реальные git fixtures для отсутствующего remote, local-vs-origin, настроенного `origin/main`, отсутствующего configured ref, equality, точных refs/текста/keys и panel silence.
- До реализации вторая причинная проба дала 5 FAIL; после реализации адресные `crew-config-diverge.test.mjs` и `crew-project-settings-key.test.mjs` прошли.
- Первый полный `npm test` остановлен с exit 1; см. `log.md`. По разрешению владельца допускается один новый полный прогон после узких исправлений.
