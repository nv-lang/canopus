# 081: один Sol — минимальная durable admission/terminal реализация

Владелец, 2026-10-18, текущий чат интегратора: «слово владельца, выпустить 0.2.1
и все задачи, которые ее держат по быстрому пути». Оркестратор22:25 явно разрешил
следующий шаг081 одному Sol, затем короткую независимую проверку, без routine форм.
Это НОВОЕ разрешение модели и кодового этапа, не перенос прежнего Sol prototype GO.
Основной приоритет — fence Nova100/094. После результата немедленная передача,
не новый цикл требований/плана. SQLite/native broker остаются запрещены без
доказанной необходимости и отдельного слова владельца.

## Входы и шесть единиц

1. Прочитать Канон/правила, утверждённую spec SHA38aa3a2c… целиком, два независимых
   review прототипов и `next-terminal-step-readonly.md`. Сохранить existing bytes/
   SHA и raw; старые ошибки/fixtures/refs не трогать. Работать только в дереве081.
   Сверить свежий origin/main и cuts; при необходимости самостоятельно безопасно
   синхронизировать свою task-ветку merge, сохраняя dirty task docs и чужие изменения,
   без reset/stash/force/подмены metadata. Merge/commit hooks — через очередь.
2. Проверить фактический поддерживаемый host contract и coverage: OpenCode V2
   session permissions, tool/context/prompt hooks и direct synthetic/retry пути.
   Публичная документация не замена установленной версии. Read-only discovery
   без ensure/restart, без credentials/full env/transcripts/inbox bodies. Не
   поднимать/перенастраивать службу. Недоказанную границу назвать точно; mock не
   выдавать за настоящий host proof. Уже принятый input не отзывается текстом hook.
3. Реализовать минимальный общий durable C/D/effect protocol в production плагина,
   используя проверенный штатный Mutex и persistent monotonic session-generation
   tombstone/intent/event proof. Все source/recipient/causation и стабильный
   `(O,effectID)`; queue/claim не admission. Все собственные writers/consumers
   watch/timer/mailbox/inbox/wait/role/retry/reconcile/reassign и host boundaries
   должны использовать одну authority, без служебного обхода. Direct вызов тоже
   gated. Не выдавать постоянно работающий новый broker за «маленький helper».
4. Terminal/recovery: enumerate queued/claimed/admitted/running O; до effect —
   durable intent/scope, после crash — не duplicate, unknown не success. Адресный
   revoke/wait только по доказанному собственному scope в новых bounded fixtures;
   no PID/TTL stealing, no broad kill, no metadata-as-proof. Positive L/T/B остаются
   обязательными. Если требование не реализуемо без запрещённого OS компонента —
   минимальный воспроизводимый технический пробел и STOP, не ослабление spec и
   не «всегда STOP» как готовая реализация. Runtime ошибки/driver assertions сначала
   диагностировать, не превращать в очередную фазу ложной архитектурной невозможности.
5. Сначала исходный RED существующим неизменным oracle, затем GREEN/removed-fix RED,
   actual concurrency, crash/retry, old-wake deny и B. Реальные пробы только queue,
   тяжёлое последовательно; полный npm состав взять из фактической версии, до4
   файлов одновременно, падение отдельно. Полные guards/selftests после последнего
   изменения. README/help/формат/current согласовать с реально доказанным кодом,
   не обещать универсального OS/global fence.
6. Короткий результат: код/diff/команды/exits/SHA/proofs, отдельное соответствие18AC,
   остатки и source/recipient/operation ownership. Legacy094 и orphan001 раздельно.
   Подготовить исполнимый адресный capture→deny→revoke→wait→proof→old-wake протокол,
   только если его реальные APIs/ownership доказаны. Самим старым сессиям пока
   только read-only metadata/capture: не prompt/wake/cancel/deny/live mutation.
   Последующие реальные admin/live действия — после короткой независимой проверки
   и согласованного безопасного GO/обновления живой системы, не из этой сессии.
   Сдать и остановиться, не запускать проверяющего самому.

## Границы

Это уже не только исследовательский test adapter: production правки CrewHarness
в своей ветке разрешены. Но история/spec/старые raw не переписываются, общие
config/profile/role/task JSON не меняются, Nova/source/assets/releases не правятся.
Не создавать новых задач/агентов. Никаких SQLite, нового native broker/addon/
Add-Type compilation/dependencies/install/elevation без нового отдельного слова.
Нет main/live/restart/push/cleanup старых evidence. Коммиты при необходимости
signed-off и только перечисленные свои файлы; финальный пакет собирается отдельно
от свежего origin/main, не публиковать merge-историю/чужие неопубликованные commits.

Сессия С5д N6, launch пишет плагин, start/step по факту; реальный early STOP
так и записывается, не фиктивное6/6. Свои дочерние процессы ограничены и явно
дожданы, raw сохранены снаружи, публично безопасные производные. Missing не
восстанавливать по hash. Нет full env/credentials/transcripts/inbox bodies.

Один выделенный нам исполнительский слот вместо законченной техприёмки061;
локальные гейты061 идут в очереди без нового AI worker. Orphan001 консервативно
занимает другой слот; временный третий — Nova v11. Четвёртого не создавать.
Пять исторических DCO commits orphan001/ветка сохраняются; его перенос нельзя
объявить исполненным через cancel Nova102 или JSON. Условный Phase1 GO уже дан,
но его fence/v11 условия не выполнены, поэтому Phase1 этой сессии запрещена.
