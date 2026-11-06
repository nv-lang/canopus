// 287: cancellation preserves reachable work; reopening never silently replaces it with the default branch.
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import type { Task } from "./tasks.ts"
export type TaskContext = { repo: string; branch?: string; worktree?: string; head: string; ref: string; dirty: boolean; at: number }
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim()
export function preserveTaskContext(t: Task): TaskContext | undefined {
  if (!t.branch && !t.worktree) return
  const root = t.worktree && existsSync(t.worktree) ? t.worktree : t.directory
  let repo: string, head: string
  try { repo = git(root, "rev-parse", "--show-toplevel") }
  catch { t.context_missing = "Репозиторий контекста недоступен; рабочие файлы и дерево не удалялись"; return }
  try { head = git(root, "rev-parse", t.branch ? `refs/heads/${t.branch}` : "HEAD") }
  catch { t.context_missing = "Прежняя ветка не найдена; она не подменялась default branch, файлы не удалялись"; return }
  if (!/^[a-f0-9]{40,64}$/.test(head) || !/^[a-z0-9][a-z0-9-]*$/.test(t.project)) throw Error("Контекст отмены не проверен")
  const ref = `refs/canopus/task-context/${t.project}/${t.n}/${head}`
  git(root, "update-ref", ref, head)
  if (git(root, "rev-parse", ref) !== head) throw Error("Контекст отмены не сохранён reachable ref")
  return { repo, ...(t.branch ? { branch: t.branch } : {}), ...(t.worktree ? { worktree: t.worktree } : {}), head, ref, dirty: !!git(root, "status", "--porcelain"), at: Date.now() }
}
export function missingTaskContext(t: Task): string | undefined {
  const saved = t.context_backups?.at(-1)
  if ((!saved && !t.context_missing) || !t.branch) return
  try { git(t.directory, "rev-parse", "--verify", `refs/heads/${t.branch}`) }
  catch { return `Прежняя ветка ${t.branch} отсутствует. Номер ${t.n} и работа сохранены: ${saved ? `${saved.ref} (${saved.head})` : t.context_missing}. Сначала согласуйте безопасное восстановление существующей ветки/дерева из этого ref; новая задача или старт от default branch не создаются.` }
}
