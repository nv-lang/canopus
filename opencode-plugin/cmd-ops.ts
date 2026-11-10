// ТЯЖЁЛАЯ ЧАСТЬ КОМАНД ОКНА (правка 003, 2026-10-08, замечание владельца: большая пауза перед диалогом). Чтение настроек проекта — это
// вызовы git (readSettingsFolder, кэш 5 с), на нагруженной машине они занимают 1–4 с и блокируют окно. Окно показывает диалог
// «Загрузка…» сразу, а эту часть выполняет в рабочем потоке (cmd-worker.ts); не вышел поток — здесь же, в процессе окна.
import { cardFile, configShowText, loadProjects, readJson, settingsContext, type Card } from "./core.ts"
import { runtimeValue } from "./runtime-policy.ts"
import { loadTask } from "./tasks.ts"
import { outsideProject, projectFor } from "./settings.ts"
import { runProfilesCommand, runSetsCommand } from "./profile-cmd.ts"

export type Op =
  | { kind: "sets" | "profiles"; dir: string; project?: string; text: string; catalog?: { providerID: string; modelID: string; limit?: any }[]; catalogNote?: string; catalogWhy?: string; version?: string }
  | { kind: "config"; dir: string; project?: string }
  | { kind: "warm" } // ничего не показывает: поднимает поток и прогревает кэш настроек проектов
  | { kind: "autoclose"; sessions: string[] }

export async function execOp(op: Op): Promise<string | string[]> {
  if (op.kind === "autoclose") {
    const cutoff = Date.now() - runtimeValue("AUTOCLOSE_MS")
    return op.sessions.filter((session) => {
      try {
        const card = readJson<Card>(cardFile(session))
        const ref = card?.spawned ? (card.task ?? card.review) : undefined
        const task = ref ? loadTask(ref.project, ref.n) : undefined
        return !!task && ["accepted", "done", "cancelled"].includes(task.status) && task.updated <= cutoff
      } catch {
        return false
      }
    })
  }
  loadProjects() // проекты — из ящика (их кладёт плагин сервиса)
  if (op.kind === "warm") return ""
  if (op.kind === "config") return configShowText(op.dir, op.project, true)
  // ПРОЕКТ ВКЛАДКИ, А НЕ ЕЁ ПАПКА (задача 067): вкладка интегратора стоит в рабочем дереве задачи вне корня проекта. Проект находится по
  // имени из карточки и по репозиторию дерева (projectFor), а команда работает с основной папкой проекта: чтение и запись — оттуда.
  const home = projectFor(op.dir, settingsContext().projects, op.project)
  if (!home) return `Не сделано: ${outsideProject(op.dir)}. Данные не тронуты.`
  const deps = { window: true, version: op.version, catalogNote: op.catalogNote, catalogWhy: op.catalogWhy, ...(op.catalog ? { catalog: async () => op.catalog } : {}) }
  return await (op.kind === "sets" ? runSetsCommand : runProfilesCommand)(home.rootPath ?? op.dir, op.text, deps)
}
