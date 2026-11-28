# Трасса требований С1-2

| Источник / наблюдение | Вывод | Требование | Проверка при реализации | Состояние С1-2 |
|---|---|---|---|---|
| Владелец разрешил P1 только в пределах сохранения, адресного сдерживания и полного цикла с воротами; уточнение интегратора: отсутствие fence исследовать, не условие read-only анализа | Нельзя бросать С1 из-за отсутствия fence и нельзя заявлять его готовым | REQ-01…10, DNC | Отдельные этапы spec/plan/RED→GREEN/review; никаких admin calls сейчас | Соблюдено; #94 HOLD |
| `core.ts` `startSession`/`releaseExecutor` и reassign: прежняя card закрывается, obligation снимается; watch/ход здесь не revoke | Close — не durable fence | REQ-01 | RED: старый request после reassign; GREEN: fence до старта нового worker | FACT по исходнику; динамически не запускалось |
| `core.ts` `crew_watch`/`crew_timer`, `watch.ts` `requestWatch`: touch + request без closed-state guard | Закрытая сессия может иметь writer path | REQ-02 | Отказ без появления request для closed session | FACT по исходнику; тест не запускался |
| `watch.ts` `pollWatches`: rename request→claim, затем detached start; нет owner lifecycle check | Race close/claim/start и multi-process claim должны быть сериализованы | REQ-03 | Close/claim race RED→GREEN, несколько consumers | FACT по исходнику; гарантия FS concurrency UNKNOWN |
| `dropWatch` ловит kill error и пишет `done/code:null`; `cancelWatch` требует owner equality | API cancel не админский; status не доказывает exit | REQ-04,06 | PID reuse/unknown identity/kill error остаются STOP | FACT по исходнику; реальные mutation не выполнялись |
| V2 OpenAPI содержит `session.inbox.list`, `session.inbox.cancel`, `session.interrupt`, prompt/command; read-only GET был interrupted | Inbox/current turn требует отдельного инспектирования; interrupt не постоянный fence | REQ-05 | Pending inbox/retry/resume после close, повтор после interrupt | Маршруты FACT; состояние конкретной session UNKNOWN |
| `index.ts` `resumeInterrupted`, `resumeTasks`, `reconcile`, `finishTasks`; restart и завершение обслуживаются отдельными проходами | Закрытая сессия должна оставаться закрытой сквозь restart/reconcile и повтор | REQ-07 | Crash-point matrix, duplicate calls, restart | FACT по просмотру; exhaustive interleaving не доказан |
| Переданный intake: run1 raw архивы/logs утрачены; 87 файлов с manifest, свежая сверка 87/87; восьмёрка old watch done/code0, process snapshot 0 PID/PPID match | Историческая сохранность ограничена, а текущий ноль не fence | REQ-09,10; DNC | Hash preservation обоих доступных runs и audit безопасного отчёта | Проверено только перечисленное доступное; raw run1 восстановить нельзя |
| Новый worker имеет distinct session ID и scratch separation как обязательный AC | Fix класса не должен блокировать replacement session | REQ-08 | Новый worker action GREEN в isolated scratch при old denied | Требование формализовано; в С1 fixture не создавался |

## Результат и куда попадает

Черновая спецификация и анализ — в папке задачи для следующей сессии; действующий код/документация поведения после отдельных ворот попадают рядом с реализацией в `opencode-plugin/`. `session-evidence/s1-2/` содержит переносимые манифесты/сводки без машинных путей и секретов. Исходные raw копии остаются во внешнем intake; исходники репозитория и чужие проекты не менялись.

## Проверка перед сдачей

- Собственная контрольная точка: `before-manifest.json`; ошибочный исключатель включил root journals, включая progress/usage. Не перегенерирована; первые after-отчёты с той же ошибкой фильтра сохранены. Исправленное сравнение после сессии — `after-qualification-corrected.json`: 0 изменений/пропусков baseline вне исключений, 3 ожидаемых новых документа, `.git` hash прежний.
- Forensic verification: `evidence-verification.json`; raw manifest и 87 copies сверены, dossier digest повторно совпал.
- Fresh old-session inventory: `watch-inventory.json`; 8 записей, 0 requested/claim, 0 найденных PID/PPID process matches в момент снимка. Это не постоянная гарантия.
- Чтение кода: `core.ts`, `watch.ts`, `index.ts`; V2 `/openapi.json` получен read-only, конкретные session/inbox GET ответа не дали из-за прерывания вызова при перезапуске.
- Не запускались тесты/сборки/Phase1 и mutation/admin actions; нет реализации и false PASS.
