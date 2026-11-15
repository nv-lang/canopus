# Два разных адресных scope: вход Nova, 2026-10-18

Источник — письма интегратора Nova 14:35. Это контекст разрешённого планирования,
не новая редакция утверждённых требований081 и не разрешение live mutation.

## Исходный дефект081 и Nova094/100

Exact old session: `ses_mvawdsam690xeqwzpp`. Шесть watches нового worker не её scope.

Nova передал выбор владельца 14:34: «Отделить при fence (Recommended)».
094 не обязана ждать всего общего исправления081, но до Phase1 обязательны:
долговечный адресный fence old session, независимый GREEN before/after,
безопасный immutable v11 allowlist/redaction и отдельный GO на новую Phase1.
Решение только о порядке; это не admin/build/release GO. 094/100 остаются HOLD.

## Отдельная orphan product001

Существующая запись: project `nova-duckdb`, n=1, REWORK, parent Nova102.

- worker: `ses_mvdby07ezj5i87u77l`;
- reviewer: `ses_mvdmmbf3buiy0woi5q`;
- прежний coordinator: `ses_eb323c848ffeuyFakP4Ip41fAT`, remapped Nova;
- сохранённая ветка: `t1-linux-prefix-guard-examples-i-quote-work`;
- по read-only сообщению Nova дерево чистое, HEAD
  `6989d1fe743c2f2ed491205d5be17838867cef8c`, пять DCO-коммитов сохранены.

Владелец выбрал «Спланировать безопасный fence» в форме Nova 14:11.
Это не разрешение implementation/admin для orphan. Целевой будущий протокол:
учесть queued/claimed/running действия worker/reviewer, запретить будущий wake,
доказать exit, сохранить ветку/дерево/evidence, затем штатно закрыть stale
task/order без JSON/card/force-role. Отмена102 сейчас не отменяет child001.
Восстановление отдельного проекта владельцем запрещено.

Предлагаемый отрицательный oracle после разрешённого fence: письмо/таймер старого
worker не запускает product write; before/after watches/processes/turn inventory
и raw evidence сохранены. Саму живую пробу сейчас не выполнять.

Только после доказанного fence возможна новая Nova-задача на новом изолированном
worktree с переносом сохранённых коммитов; старый CI не независимая приёмка.
Это полномочия и маршрут Nova, не поручение исполнителю081 менять чужой проект.

## Для С3081

Показать применимость/границы общего механизма к каждому scope раздельно;
не превращать metadata status в exit proof и не смешивать identity двух историй.
Недостающий cross-project administrative API назвать точным остатком, а не
скрыто добавить в spec или реализовать в плановой сессии. Не повторять forensic
intake и не запускать старые сессии. После плана — отдельные ворота.
