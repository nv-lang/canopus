# 081: следующий простой recovery-примитив, без тяжёлых компонентов

Основание — быстрый путь владельца20:11: routine engineering решения принимаются
по рекомендации, без новых форм. Предыдущий исследовательский результат независимо
принят (`prototype-review-1.md`), но mkdir-lock остаётся после crash/D и не проходит
REQ-04/16. Это не доказательство необходимости SQLite/native broker.

Один исполнитель обычного профиля, четыре единицы, С5д N4. Только новый прототип
и раздельное доказательство; затем сдача. Никакой production интеграции.

1. Прочитать утверждённую spec, Sol-прототип и независимый review. Выбрать самый
   простой штатный Windows lifetime-lock, который ОС освобождает при завершении
   владельца: например, существующий .NET NamedMutex или FileStream/FileShare.None
   через уже установленный Windows PowerShell. Проверить документацию/доступность.
   Это короткая изолированная проба штатного инструмента, НЕ новый постоянный
   broker/service, НЕ C++/Node addon/Add-Type/native compilation/dependency install.
   Если без нового компонента не получается — точный STOP, не маскировать broker
   переименованием в helper.
2. Минимальная новая fixture: два реальных процесса действительно конкурируют,
   owner crash только собственного child, явное ожидание child.close, новый owner
   после crash получает lock без удаления/stale-PID/TTL кражи. Доказать событием
   и результатом, не `sleep`/одним PID snapshot. Все свои процессы конечны, raw
   и lock/intent сохранить. Не касаться прежних fixtures.
3. Проверить не только освобождение lock: оставить durable intent/D в выбранных
   crash points, новый close/recovery с тем же O/effectID. Если состояние effect
   неоднозначно — unresolved, не duplicate и не terminal success по самому факту
   abandoned lock. Положительный bounded fixture case и независимая B обязательны.
   Повторить queued deny / C<D и D<C accounting с тем же safety oracle/адаптером,
   насколько этот новый механизм действительно подключён; отдельный lock PASS
   не называть production lifecycle PASS.
4. Короткий отчёт: устранён ли именно stale-lock failure; какие intent/replay/
   OS-scope/write-handle/все writers/legacy требования остаются. Отдельно показать,
   что освобождение lock не отзывает уже выданные полномочия процесса. Если нужно
   различающее наблюдение — только bounded новые fixture A/B и без риска старым
   данным; нельзя выдавать вход вне L за опровержение L. Не делать вывод SQLite/
   broker необходимы из провала одного алгоритма. Следующий минимальный технический
   шаг рекомендовать предметно, не начинать широкую архитектуру.

Выходы: новые `opencode-plugin/test/prototype081/os-lock-1/`, новый
`prototype-os-lock-result.md`, `session-evidence/prototype-os-lock-1/`, append logs.
Старые код/отчёты/evidence/spec/source export не менять. Если нужен immutable
baseline: locator081-prototype-base-o00ntsja от7e23895b, путь в goal.

Все пробы через `crew_watch machine=true`, максимум4 процессов тестов вместе
с контроллером и PowerShell; падавший replay отдельно. Metadata только allowlist,
без full env/credentials/transcripts/inbox. Public производные, raw отдельно.

Нет SQLite/new broker/native compilation/dependencies/install/elevation, production/
config/package/README/scripts/ref changes, commits/push/merge, API/admin/live,
Nova/старых сессий/очередей/Phase1 и новых агентов. Никакого kill чужого процесса
или cleanup старого evidence. Legacy094/orphan001 HOLD; независимую проверку
следующего результата назначает интегратор. Не объявлять всю081/100 завершённой.
