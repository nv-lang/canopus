// ЯЩИК ПЛАГИНА КАК КОНСТАНТА. Отдельно от paths.ts: вычисление BASE при импорте бросает понятный отказ, если
// рядом лежит прежний ящик (задача 284 — блокер существующей установки до однократного переноса по switch-
// манифесту). Модуль переноса (migrate-mailbox.mjs) импортирует только чистый paths.ts и потому работает в
// состоянии «прежний ящик есть, нового нет».
import { canopusBase } from "./paths.ts"

import { freezePluginConfigContext } from "./config-context.ts"
import { freezePolicySource } from "./resolved-policy.ts"
import { freezeRuntimeSource } from "./runtime-policy.ts"
freezeRuntimeSource()
freezePolicySource()
freezePluginConfigContext()
export const BASE = canopusBase()
