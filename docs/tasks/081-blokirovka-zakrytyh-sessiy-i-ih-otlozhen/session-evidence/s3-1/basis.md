# С3-1: read-only основание плана

Дата: 2026-10-18. Новое свидетельство планирования, не ранний forensic before.

- Spec прочитана целиком (507 строк), exact SHA256 сверена Get-FileHash:
  `38aa3a2c36ece056435ca348b6b3b72bef5adf82a730d6d6c0035245f180f12e`.
- Прочитаны полные назначения fast-path-setup, task/message, owner-input и
  approval-check, analysis/spec-trace/spec-review-5/log. Старые запреты этапов
  не выданы за отмену нового разрешения владельца 14:11.
- HEAD задачи `26429fa11424f4a5bb0b6a595dc0a95cea6e1601`;
  локальный main и origin/main `90253e6c16e1ab620bfed70b20bcac2f12bab03b`.
  Это read-only локальные refs, не новый fetch и не обещание свежести remote.
- `git diff --name-only/--stat/--numstat HEAD main -- opencode-plugin scripts .github`
  и предметный diff core/index/watch/mcp/package. Watch неизменён;
  core +31/-28, index +12/-11, mcp +1/-1, tasks +12/-6,
  precheck +18/-10, settings +49/-6, package +3/-1.
  В main также новые stable runner, acceptance/settings/формы/UI/tests;
  unrelated изменения не переносились и не редактировались.
- Отдельно `git show main:opencode-plugin/index.ts`: актуальные deliver,
  process-local Set, prompt/synthetic/final-note/pollWatches cut сохраняются.
  Свежий main `test/stable.mjs` прочитан целиком; --jobs default8, нужен explicit4.
  Декодирование main package regex `node test/[^ ]+\.mjs` дало128 команд,
  включая cleanup. Будущий полный прогон не ограничен старым списком spec.
- Собственное дерево: watch.ts целиком; core postLetter/claims, takeReply/host,
  send/wait/startSession, inbox/watch/timer, release/expected/parent диапазоны;
  index touch/deliver и finishTasks; mcp целиком; поиск остальных direct callers.
  Диапазоны/cut указаны в plan-trace. Не заявляется новый полный forensic audit.
- На входе много существующих untracked документов задачи и изменённый log:
  это прежняя работа, не очищалась. В main имеется посторонний untracked каталог
  под plugin; он не читался и не менялся, не включается в будущий пакет.

## Нормы и платформенные основания

Прочитаны вход Канона и применимые process нормы/AGENTS из среды; pin методики
не менялся. Получены task-sessions.md (раздел С3), task-algorithm.md (§§8–11)
по `0442a4d3a380f01f437640b5dd9174e384e50d67`, без нового аудита методики.
OpenCode skill и V2 plugins guide прочитаны; API service не вызывался.

Read-only Microsoft документация:

1. https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
   — membership, no-breakaway, last-handle lifetime, IOCP не гарантирует все сообщения.
2. https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
   — JOB_LIST Windows10+, HANDLE_LIST и STARTUPINFOEX.
3. https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken
   — WRITE_RESTRICTED и restricting SID checks, privilege removal.
4. https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw
   — restricted caller token exception для assign-primary-token;
   остальные права/совместимость требуют реальной проверки.

Факт: эти API документированы. Вывод: предложен механизм для L.
UNKNOWN: доступность toolchain, Git Bash restricted launch, полная handle/ACL
изоляция, recovery named Job lifetime и positive close<=120 на реальной Windows.
Ни один из этих UNKNOWN не объявлен proof либо исключением L.

## Авторская проверка выходов

Секции plan-trace раздельно содержат 18 REQ rows и 18 AC rows; DNC rows — 6.
Первый вспомогательный regex считал обе числовые таблицы вместе (36) и искал
буквальный AC-префикс в числовых строках (0); это ошибка способа подсчёта, не
свидетельство покрытия. Повторный подсчёт по секциям дал18/18. Spec SHA осталась
exact утверждённой. `git status --short` по plugin/scripts/.github/.opencode
не показал изменений; новые предметные выходы только в разрешённой папке.
Это статическая авторская сверка, не guards/full suite/независимая приёмка.

Тесты/build/platform процессы/guards не запускались; credentials/full env,
transcripts/inbox bodies не читались; API mutations/admin/live/refs/commits/push,
новых агентов и правок plugin/config/scripts/spec не было. Ни один legacy scope
не остановлен; Nova094 и orphan001 HOLD. Выходы — plan, plan-trace, эта запись
и append журналов. Полный product PASS не заявляется.
