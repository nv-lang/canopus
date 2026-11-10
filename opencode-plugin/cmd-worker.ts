// Рабочий поток команд окна (см. cmd-ops.ts): получает {id, op}, отвечает {id, out} или {id, error}.
// Пока команды в ходу (последние 2 минуты), раз в 4 с освежает кэш настроек проектов (кэш — 5 с, обновление — вызовы git на
// 1–4 с): следующий показ берёт тёплый кэш и открывается сразу.
import { parentPort, workerData } from "node:worker_threads"
import { initializePluginConfig } from "./config-context.ts"
if (!workerData || typeof workerData.config !== "string" || !workerData.config.trim()) throw new Error("Canopus command worker needs its parent selected config context")
initializePluginConfig({ config: workerData.config })
const { loadProjects } = await import("./core.ts")
const { execOp } = await import("./cmd-ops.ts")

let lastUse = 0
const keep = setInterval(() => {
  if (Date.now() - lastUse > 120_000) return
  try {
    loadProjects()
  } catch {}
}, 4_000)
keep.unref?.()

parentPort?.on("message", async (m: { id: number; op: any }) => {
  if (m.op.kind !== "autoclose") lastUse = Date.now()
  try {
    parentPort!.postMessage({ id: m.id, out: await execOp(m.op) })
  } catch (e) {
    parentPort!.postMessage({ id: m.id, error: String((e as any)?.message ?? e) })
  }
})
