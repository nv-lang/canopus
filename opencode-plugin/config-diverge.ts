import { globalConfig } from "./plugin-config.ts"
import { resolveProjectPolicy } from "./resolved-policy.ts"
import { runtimeValue } from "./runtime-policy.ts"
// Git comparisons are informational; primary working configuration is immediately effective.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { modelsDefined, unconfiguredLine, knownSettingsProjects, parseProjects, rawSettingsFor } from "./settings.ts"

export type Divergence = { kind: "same" } | { kind: "differ"; keys: string[]; ref: string } | { kind: "note"; text: string }

const git = (cwd: string, args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] })
const parse = (t: string): any => {
  try {
    const j = JSON.parse(t.replace(/^\uFEFF/, ""))
    return j && typeof j === "object" && !Array.isArray(j) ? j : null
  } catch {
    return null
  }
}

/** Различающиеся верхнеуровневые ключи двух настроек (по глубокому равенству значений), по алфавиту. */
export function differingKeys(a: Record<string, any>, b: Record<string, any>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort()
}

const cache = new Map<string, { at: number; value: Divergence }>()
const ttl = () => runtimeValue("DIVERGE_TTL_MS")

/** Сравнить файл рабочей копии (repo/file) с файлом целевой ветки (origin/<ветка>, затем локальная). Не падает. */
export function configDivergence(repo: string | undefined, file: string | undefined, branch: string | undefined): Divergence {
  if (!repo || !file || !branch) return { kind: "note", text: "рабочая копия не в git-репозитории: расхождение с веткой не проверено" }
  const key = `${repo}\0${file}\0${branch}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl()) return hit.value
  const value = compute(repo, file, branch)
  cache.set(key, { at: Date.now(), value })
  return value
}

function compute(repo: string, file: string, branch: string): Divergence {
  const abs = path.join(repo, file)
  if (!existsSync(abs)) return { kind: "note", text: `файла ${file} нет в рабочей копии: сравнивать не с чем` }
  const work = parse(readFileSync(abs, "utf8"))
  if (!work) return { kind: "note", text: `${file} в рабочей копии не JSON: расхождение с веткой не проверено` }
  for (const ref of [`origin/${branch}`, branch]) {
    let text: string
    try {
      text = git(repo, ["show", `${ref}:${file}`])
    } catch {
      continue
    }
    const there = parse(text)
    if (!there) return { kind: "note", text: `${file} на ${ref} не JSON: расхождение не проверено` }
    const keys = differingKeys(work, there)
    return keys.length ? { kind: "differ", keys, ref } : { kind: "same" }
  }
  return { kind: "note", text: `файла ${file} нет на ветке ${branch} (или ветки нет): рабочие настройки действуют; расхождение не проверено` }
}

/** Предупреждение canopus_doctor по проекту; нет расхождения — undefined. */
export function divergenceProblem(_name: string, _d: Divergence): string | undefined { return undefined }

/** Git differences are expected: the primary working copy is authoritative. */
export function divergenceLine(_d: Divergence): string | undefined { return undefined }
export function divergenceLineFor(_project: string): string | undefined { return undefined }

/** Строка «проект X не настроен: модели» для /canopus и боковой панели (задача 033); модели определены или настроек не читали — undefined. */
export function unconfiguredLineFor(project: string): string | undefined {
  try {
    let projects=knownSettingsProjects()
    if(!projects.some(p=>p.name===project))projects=parseProjects(globalConfig())
    const p=projects.find(p=>p.name===project)
    if(!p)return undefined
    const folder=p.dir??p.rootPath??p.root
    const raw=rawSettingsFor(folder,projects,{},project)
    const configured={...raw,allow_default_models:resolveProjectPolicy(raw,folder).allow_default_models}
    return modelsDefined(configured)?undefined:`⚠ ${unconfiguredLine(project)}`
  } catch { return undefined }
}
