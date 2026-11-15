# Ответ С1п-1 на findings и дополнительные ошибки

| Finding | Решение автора | Где исправлено / evidence | Остаток для следующей независимой проверки |
|---|---|---|---|
| S1 spawn до устойчивой PID identity / потеря intent | Исправлено требование outcome, а не архитектурный primitive | `spec.md` REQ-03/04, AC-04 | Recovery и process identity не доказаны реализацией; STOP пока неизвестность |
| S2 локальные writers смешаны с external clients | Исправлена trust boundary без снижения цели | REQ-05/06, AC-03/06; writer matrix | Проверить полноту всех internal callsites и фактическую внешнюю гарантию; owner decision до утверждения |
| S3 exit/isolation overclaim | Исправлены доказательные условия и threat model | REQ-07/08, AC-07/08 | Нет выбранной/проверенной primitive, никакого GO; replacement action остаётся обязательным |
| S4 недетерминированный close/start oracle | Исправлено разделением двух event order | REQ-03, AC-02 | Dynamic concurrency/crash suite только после плана |
| S5 / M1 неполная source map | Заменено атомарной трассой | `spec-trace.md` T01–T30 | Сверить с полным заданием и закреплённой методикой; здесь часть старых evidence не прочитана целиком |
| M2 команды guards/CI | Добавлены exact commands и разделение workflow от plugin tests | `spec.md` AC-10 | Прогоны не запускались; выполнить после code gates и через queue |
| Owner identity error | Исправлено: шесть replacement IDs отдельно, восемь old IDs отдельно | `writer-consumer-matrix.md`, reconciliation | Не причина исчезновения records; no containment action |
| Expected SHA длина | Новый expected закреплён из первичного dossier, старый JSON immutable | `analysis.md`, matrix | Actual digest нового независимого перепроверочного прогона отсутствует; PASS не заявлен |
| Early before incomplete | В С1п создан whole-tree before и три root copies до правок | `before-tree.json`, `root-before/` | After cross-check нужен повтор после append journals и проверить generated volatile files |

Правка только draft `analysis.md`, `spec.md`, `spec-trace.md` и новые файлы `session-evidence/s1p-1/`. Ни одно отрицательное замечание не объявлено «проверкой PASS»; неполнота С1п раскрыта в read-map.
