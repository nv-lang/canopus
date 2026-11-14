# Архив зачистки воркараудов и веток, 2026-11-14

Зачистка невлитых веток и Temp-воркараудов canopus (247 → 210 веток, 245 → 196 воркараудов).
Ничего не потеряно: удалённое было в main, или запушено в origin, или заархивировано здесь.

## logs/ — журналы задач, снятые вместе с воркараудами

- `logs/274-new-chat-projects/` — незакоммиченные `log.md`, `progress.log`, `task/message.md`
  из воркарауда `crew-harness-274-new-chat-projects` (ветка task/274-new-chat-projects —
  содержимое влито в main патчами).
- `logs/277-chat-epic-acceptance/` — `log.md` и untracked-улика `acl-adapter-readonly-b765a701.md`
  из воркаруда `crew-harness-277-chat-epic-acceptance` (содержимое влито в main патчами).

## temp_wts/ — незакоммиченные находки в Temp-воркараудах (detached HEAD)

- `wait-only-15c02839.patch` — эксперимент «wait only», 10 файлов src (+24/−14),
  воркарауд `AppData/Local/Temp/canopus-wait-only-15c02839`.
- `picker-isbusy-dirty.patch` — **реальная работа по линии 289**, 15 файлов src
  (transfer, hub, delivery, view, transport и др.), воркарауд `D:/Sources/worktrees/canopus-picker-isbusy`.
- `server_context_handoff_live/context_handoff_test.nv` — untracked-тест из того же
  воркарауда `canopus-picker-isbusy`.
- `pult-131-132-a34528b.patch` — правки веб-пульта (−73/+70), воркарауд `D:/Temp/opencode/pult-131-132-a34528b`.
- `pult-tests/` — 12 новых браузерных тестов (untracked) из того же воркарауда.
- `observe-fiber-probe/` — untracked-спайк (nova.toml + observe-fiber-probe.nv) из
  воркаруда `crew-harness-277-common-candidate`.

Применить сохранённые правки: `git apply <файл>.patch` в соответствующей ветке.
