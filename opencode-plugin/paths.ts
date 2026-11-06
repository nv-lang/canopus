// ПАПКА ПЛАГИНА. Ящик — <данные OpenCode>/canopus: письма, карточки, задачи, наблюдения, состояние. Прежние
// имена: crew-harness (до задачи 284, 2026-11-02), opencode-peers (до плана 005, 2026-10-06), nova-peers (до // guard-allow(legacy-name): карта переименования — прежние имена ящика, предмет переноса
// 2026-10-05). Алиасов и ссылок-junction больше нет: существующий прежний ящик переносится однократно и явно
// (migrateBase, из switch-манифеста задачи 284, при остановленной службе); до переноса существующая установка
// получает понятный отказ, а новый пустой ящик рядом не создаётся. Модуль без зависимостей и без записи на
// диск при импорте (отказ по старым env в точке входа идёт раньше любой мутации): его импортируют core,
// tasks, watch, status, settings.

import { existsSync, lstatSync, realpathSync, renameSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pluginRoot } from "./plugin-config.ts"

export function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  return xdg ? path.join(xdg, "opencode") : path.join(os.homedir(), ".local", "share", "opencode")
}

export const CANOPUS_DIR = "canopus"
/** прежние имена ящика, от новых к старым: crew-harness (до 2026-11-02, задача 284), opencode-peers (до 2026-10-06, план 005), nova-peers (до 2026-10-05) */ // guard-allow(legacy-name): карта переименования — прежние имена ящика
export const LEGACY_DIRS = ["crew-harness", "opencode-peers", "nova-peers"] // guard-allow(legacy-name): карта переименования — прежние имена ящика, предмет переноса

/** Прежний ящик рядом с новым именем, если он есть. Только чтение: ничего не создаёт и не двигает. */
export function legacyBase(root = dataDir()): string | undefined {
  for (const name of LEGACY_DIRS) {
    const old = path.join(root, name)
    if (existsSync(old)) return old
  }
  return undefined
}

/** Runtime mailbox belongs to Canopus, independent of OpenCode XDG paths. */
export function canopusBase(root?: string): string {
  // An explicit root is only for the old mailbox migration API. Runtime ignores XDG.
  if (root !== undefined) {
    const old = legacyBase(root)
    if (old) throw new Error(`Canopus task 284: ${old}; use migrateBase() after stopping the service`)
    return path.join(root, CANOPUS_DIR)
  }
  const target = path.join(pluginRoot(), "data")
  const old = path.join(dataDir(), CANOPUS_DIR)
  if (!process.env.CANOPUS_HOME && !existsSync(target) && existsSync(old)) throw new Error(`Canopus data migration required: ${old} -> ${target}; stop the service and run the explicit migration`)
  return target
}

/**
 * Однократный перенос прежнего ящика в новое имя (switch-манифест задачи 284; служба остановлена, папку никто не
 * держит). Живое состояние: настоящие данные в самом старом имени, новые — ссылки-junction на него. Перенос:
 * ссылки просто снимаются, настоящая папка переименовывается. Возвращает квитанцию {from, to} со всеми
 * снятыми именами; переносить нечего — undefined. После переноса прежних имён нет: ни алиасов, ни ссылок.
 * Два настоящих прежних ящика сразу или ссылка наружу — отказ, разбор вручную. Откат — rollbackBase.
 */
export function migrateBase(root = dataDir()): { from: string[]; to: string } | undefined {
  const neu = path.join(root, CANOPUS_DIR)
  const found = LEGACY_DIRS.map((name) => path.join(root, name)).filter((p) => existsSync(p))
  if (existsSync(neu)) {
    if (found.length) throw new Error(`canopus: перенос невозможен: новый ящик ${neu} уже есть, а прежний ${found[0]} остался — разберите вручную по switch-манифесту задачи 284`)
    return undefined
  }
  if (!found.length) return undefined
  const links = found.filter((p) => lstatSync(p).isSymbolicLink())
  const reals = found.filter((p) => !lstatSync(p).isSymbolicLink())
  if (reals.length > 1) throw new Error(`canopus: перенос невозможен: несколько настоящих прежних ящиков (${reals.join(", ")}) — разберите вручную, какой из них живой`)
  for (const link of links) {
    const target = realpathSync(link)
    if (path.dirname(target) !== root) throw new Error(`canopus: прежний ящик ${link} — ссылка наружу (${target}); разберите вручную`)
  }
  if (!reals.length) throw new Error(`canopus: перенос невозможен: прежние имена (${found.join(", ")}) — только ссылки без настоящей папки рядом; разберите вручную`)
  for (const link of links) rmSync(link)
  renameSync(reals[0], neu)
  return { from: found, to: neu }
}

/** Откат переноса по его квитанции: новый ящик возвращается на прежнее имя. Нечего откатывать — undefined. */
export function rollbackBase(root = dataDir(), toLegacy: string = LEGACY_DIRS[0]): { from: string; to: string } | undefined {
  const neu = path.join(root, CANOPUS_DIR)
  const old = path.join(root, toLegacy)
  if (!existsSync(neu) || existsSync(old)) return undefined
  renameSync(neu, old)
  return { from: neu, to: old }
}

/** Раздел README о профилях моделей на GitHub: ответы команд и подсказки отсылают к нему прямой ссылкой (отдельным токеном: терминал делает её кликабельной). */
export const PROFILES_README_URL = "https://github.com/unitcraft/canopus/blob/main/opencode-plugin/README.md#model-profiles-sets-of-models-and-windows-by-stage"
