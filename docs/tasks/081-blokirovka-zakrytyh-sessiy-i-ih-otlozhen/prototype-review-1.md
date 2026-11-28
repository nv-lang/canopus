# 081: независимая короткая проверка Sol-прототипа

## Вердикты

1. **Исходный defect воспроизведён.** В queued расписании фактический `releaseExecutor` закрывает A, после чего poll всё же запускает её отложенную команду: эффект A существует. B независимо исполняется. Это подтверждение исходного класса ошибки только в изолированной fixture.
2. **Частная queued/concurrency-корректность gate подтверждена в заданных пробах.** С тем же неизменённым safety oracle gate запрещает queued A при C<D, B остаётся положительной; удаление gate возвращает то же RED. В отдельной конкуренции два async-процесса синхронизированы ready/go/hold/release: второй реально видит EEXIST, один D и один эффект; повтор в свежем Node-процессе — duplicate, другой `effectID` той же O исполняется. Закрытые source и recipient получают deny без D, независимая B разрешена. Отдельный D<C показывает bounded synchronous fixture effect terminal перед C.
3. **Выбранный recovery алгоритм FAIL; OS/L/legacy NOT VERIFIED.** Контролируемый собственный crash после durable D (exit 23) оставляет mkdir-lock; новый close завершается `LOCK_UNRESOLVED` (exit 2), C отсутствует. Это недостаточность именно данного восстановления, не довод за SQLite/broker и не оправдание «всегда STOP». Никакой вывод о полном L или OS scope из wrapper close не следует. Nova094 и orphan001 остаются HOLD.

**Итог:** принимаю результат как ограниченное исследовательское доказательство defect и частных расписаний, но не как production fence, полную реализацию контракта или разрешение на live/legacy действия.

## Самостоятельный replay и воспроизводимость

- Проверенная ревизия worktree: `26429fa11424f4a5bb0b6a595dc0a95cea6e1601`; immutable baseline — `7e23895b8cb2c3ea9e4ac506455fedd440e6afd0`, exact freeze интегратора использован только для чтения.
- Самостоятельно прочитаны все 8 файлов `opencode-plugin/test/prototype081/sol-1/` и исходные сведения `prototype-sol-result.md` с приложенным evidence. Oracle SHA256 при всех наших lifecycle replay: `c274a18bcaeec4cb0b584904fabd7114e4ec7ed737c1ef65e5b96ecf85adbc98`. Frozen driver hashes перечислены в `session-evidence/prototype-review-1/final-replay/drivers.json`.
- Команды (все запущены через `crew_watch machine=true`; последовательные короткие прогоны):
  - `node opencode-plugin/test/prototype081/sol-1/run-lifecycle.mjs '<baseline>/source' '<approved-temp>' baseline <new-evidence>/baseline`
  - `node opencode-plugin/test/prototype081/sol-1/final-replay.mjs '<baseline>/source' '<approved-temp>' <new-evidence>/final-replay`
- Baseline queued: внутренний exit 1, именно `SAFETY ORACLE` assertion; stdout SHA `e9eccb2e179691e3a5f32d506eee1c610caae2248ba25c3fe61827c142f7875a`, stderr SHA `ba451cf1ef672cdaf71757e26cea28cb56edf7ee322005b4ebd84cd17f070cf2`, A=true и B=true после ожидания wrapper close. Baseline running: exit 0, отдельное расписание.
- Gate queued: exit 0, A=false/B=true, stdout SHA `233481c41432c9c2a6ba12cc594ca9e2bf5b2ebb7cbf7009eb3fab89ed87a83b`. Removed queued: exit 1 на том же safety oracle, A=true/B=true, stdout SHA `e7a3abd01e0028d4ee7c7ad7ae00e7961531df8e54a98fd0bb69a10c70f47a08`. Gate running: exit 0, A=true отдельно учитывает D<C; это не успешное закрытие scope.
- Concurrent replay: драйверный запуск завершился exit 0; raw manifest SHA256 `13bcf339d0c5a665cb299647117ee007a2c2577a37661bfc8b8e1d543e2ec7d3`. Все 12 своих дочерних процессов завершились (коды: 0×10, 23 — преднамеренный crash, 2 — ожидаемый recovery отказ). Raw/fixture и намеренно оставленный crash-lock сохранены в новом разрешённом temp; ничего не чистил. Публичное санитизированное evidence находится рядом в `session-evidence/prototype-review-1/`.

## Ограничения

Observer `ref()` обеспечивает ожидание только собственных wrapper ChildProcess; ни `.exit`, ни done, ни wrapper `close` не доказывают завершение произвольного дерева процессов, отсутствие внешних handles или OS write-scope revoke. Fixture effect синхронный и ограниченный; ACL/reparse/внешние writer и power-loss durability не квалифицированы. Проверки не покрывают все production writers, mailbox/host turns, все fault points, полный бюджет T, OS или оба legacy scope. Никакие исходные drivers/assertions, production/config/package/spec/README, старые evidence/fixtures/очереди не изменялись; npm/full guards, live/admin/Nova действия и cleanup не запускались.
