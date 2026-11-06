import { runtimeValue } from "./runtime-policy.ts"
// Project settings are accepted from the canonical primary Git worktree's default branch.
// Global project_settings accepts repository folders or explicit virtual {project, root} definitions.
// Shared config contains ten public settings only; private local layers have higher precedence.
// Registration selects a file; retired aliases and shared identity overrides are rejected.

import { execFileSync } from "node:child_process"
import { background, gitAsync } from "./async-git.ts"
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { validateProjectSettings, resolveProjectPolicy } from "./resolved-policy.ts"
import { settingsLayers, settingsWithOrigins, validateTasksDir } from "./plugin-config.ts"
import { log, safeKey } from "./core.ts"
import { answerNotes } from "./answer-parse.ts"
import { BASE } from "./base.ts"
import { configDivergence, divergenceProblem } from "./config-diverge.ts"

export const SETTINGS_FILE = path.join(".canopus", "plugin", "config.json")
/** прежнее имя файла настроек (до плана 005, 2026-10-06) */
export const LEGACY_SETTINGS_NAME = ".opencode/opencode-peers.json"
export const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
// Канонический путь: короткие имена Windows (8.3, `ABCD~1`) раскрываются, чтобы корень проекта и каталог вкладки
// совпадали, в каком бы виде путь ни пришёл; у несуществующего пути — его ближайший существующий предок.
export const canon = (p: string): string => {
  const abs = path.resolve(p)
  try {
    return realpathSync.native(abs)
  } catch {
    const up = path.dirname(abs)
    return up === abs ? abs : path.join(canon(up), path.basename(abs))
  }
}
export const normPath = (p: string) => canon(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()

/** Проект: имя, корень (нормализованный), откуда настройки. */
export type Project = {
  name: string
  /** корень, нормализованный для сравнения (канонический, нижний регистр) */
  root: string
  /** корень как путь (канонический, регистр сохранён) */
  rootPath?: string
  /** папка настроек (новая форма опций); нет — прежняя форма */
  dir?: string
  /** вершина репозитория настроек и путь файла в нём */
  repo?: string
  file?: string
  branch?: string
  /** что не так с этим проектом (для canopus_doctor) */
  problems?: string[]
  /** настройки прочитаны из файла с прежним именем — переименовать */
  legacy?: string
}
export type Projects = Project[]

const git = (cwd: string, args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 })

// Чтение настроек — генератор: каждый вызов git он отдаёт наружу (yield [папка, аргументы]) и получает текст или исключение.
// Синхронный водитель гоняет execFileSync (старт, инструменты), асинхронный — gitAsync (обновление в фоне, цикл службы стоять не должен).
type GitCall = [string, string[]]
type GitGen<R> = Generator<GitCall, R, string>

function* defaultBranch(repo: string): GitGen<string> {
  try {
    const head = (yield [repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]]).trim() // origin/main
    if (head) return head.replace(/^[^/]+\//, "")
  } catch {}
  for (const b of ["main", "master"])
    try {
      yield [repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`]]
      return b
    } catch {}
  return "main"
}

const defaultBranches = new Map<string, { at: number; branch: string }>()

/** The accepted branch, independent of the branch of a task's linked worktree. */
export function repositoryDefaultBranch(directory: string): string {
  const identity = mainTreeOf(directory) ?? directory
  const cached = defaultBranches.get(identity)
  const now = Date.now()
  if (cached && now - cached.at < runtimeValue("DEFAULT_BRANCH_CACHE_MS")) return cached.branch
  const steps = defaultBranch(identity)
  let row = steps.next()
  while (!row.done) {
    try { row = steps.next(git(row.value[0], row.value[1])) }
    catch (error) { row = steps.throw(error) }
  }
  defaultBranches.set(identity, { at: now, branch: row.value })
  return row.value
}

/** Закоммиченный файл настроек: текст из ветки или undefined. */
function* showCommitted(repo: string, branch: string, file: string): GitGen<string | undefined> {
  try {
    return yield [repo, ["show", `${branch}:${file}`]]
  } catch {
    return undefined
  }
}

const parseJson = (text: string | undefined): any => {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""))
  } catch {
    return null // файл есть, но не JSON
  }
}

// Прочитанные файлы настроек — на несколько секунд (инструменты зовут настройки на каждое письмо, git — процесс).
const CACHE_MS = runtimeValue("SETTINGS_TTL_MS")
const cache = new Map<string, { at: number; value: any }>()
const good = new Map<string, any>() // последние настройки без проблем, по папке

/** Папка настроек → проект (имя, корень, сырые настройки). */
type Folder = { project: Project; raw: any }
function* settingsBody(dir: string): GitGen<Folder> {
  const problems: string[] = []
  let repo: string | undefined
  let file: string | undefined
  let branch: string | undefined
  let legacy: string | undefined
  let raw: any = {}
  try {
    repo = (yield [dir, ["rev-parse", "--show-toplevel"]]).trim()
  } catch {
    problems.push(`папка настроек ${dir} не внутри git-репозитория`)
  }
  if (repo) {
    const prefix = (yield [dir, ["rev-parse", "--show-prefix"]]).trim()
    file = prefix + ".canopus/plugin/config.json" // путь в репозитории
    branch = yield* defaultBranch(repo)
    let j = parseJson(yield* showCommitted(repo, branch, file))
    // Retired filenames are diagnosed below, never read as a fallback.
    if (j === undefined) {
      // файл в рабочей копии есть, а в ветке нет — его просто не закоммитили (claude-limits, 2026-10-07: приёмка
      // проекта сутки не действовала, а самопроверка говорила только «нет файла»)
      const local = [prefix + ".canopus/plugin/config.json", prefix + LEGACY_SETTINGS_NAME].find((f) => existsSync(path.join(repo!, f)))
      problems.push(
        local
          ? `${local} лежит в рабочей копии ${repo}, но не закоммичен в ${branch} — плагин его не читает, настройки по умолчанию; закоммить его в ${branch}${local.endsWith(LEGACY_SETTINGS_NAME) ? ` под именем .canopus/plugin/config.json` : ""}`
          : `в ветке ${branch} репозитория ${repo} нет ${file} — настройки по умолчанию`,
      )
    }
    else if (j === null) problems.push(`${file} в ветке ${branch} — не JSON; настройки по умолчанию`)
    else { validateProjectSettings(j, "committed project file"); raw = j }
  }
  const main = mainTreeOf(dir)
  const name = path.basename(main ?? repo ?? dir).toLowerCase()
  if (!PROJECT_RE.test(name)) problems.push(`имя проекта «${name}» не годится: строчные латинские буквы, цифры, дефис`)
  const rootAbs = main ?? repo ?? dir
  if (!existsSync(rootAbs)) problems.push(`корень проекта ${name} (${rootAbs}) не существует`)
  let value = { project: { name, root: normPath(rootAbs), rootPath: canon(rootAbs), dir, repo, file, branch, problems, ...(legacy ? { legacy } : {}) }, raw }
  // ПОСЛЕДНИЕ ХОРОШИЕ НАСТРОЙКИ (2026-10-05): под нагрузкой git не ответил — и плагин молча взял умолчания: задача #6
  // nova пошла без worktree и ветки по настройкам, а приёмка решила «очистка не нужна» — ветки и worktree остались.
  // Чтение с проблемой при прежнем чтении без проблем — сбой, а не правка: берём последние хорошие (память, затем
  // диск — для MCP-процессов, они живут один ход) и пишем о сбое в журнал. Чтение без проблем их обновляет.
  const goodFile = path.join(BASE, "settings-good", `${safeKey(dir)}.json`)
  if (!problems.length) {
    good.set(dir, value)
    try {
      mkdirSync(path.dirname(goodFile), { recursive: true })
      writeFileSync(`${goodFile}.tmp`, JSON.stringify(value))
      renameSync(`${goodFile}.tmp`, goodFile)
    } catch {}
  } else {
    let last = good.get(dir)
    if (!last)
      try {
        last = JSON.parse(readFileSync(goodFile, "utf8"))
      } catch {}
    if (last && !last.project?.problems?.length) {
      validateProjectSettings(last.raw ?? {}, "last good project cache")
      log(`settings of ${dir}: ${problems.join("; ")} -- using the last good ones`)
      value = last
    }
  }
  return value
}

const sync = <R>(g: GitGen<R>): R => {
  let r = g.next()
  while (!r.done) {
    let out: string | undefined
    let err: unknown
    try {
      out = git(r.value[0], r.value[1])
    } catch (e) {
      err = e ?? new Error("git failed")
    }
    r = err !== undefined ? g.throw(err) : g.next(out!)
  }
  return r.value
}
const async_ = async <R>(g: GitGen<R>): Promise<R> => {
  let r = g.next()
  while (!r.done) {
    let out: string | undefined
    let err: unknown
    try {
      out = await gitAsync(r.value[0], r.value[1], 20_000)
    } catch (e) {
      err = e ?? new Error("git failed")
    }
    r = err !== undefined ? g.throw(err) : g.next(out!)
  }
  return r.value
}

// ФОНОВОЕ ОБНОВЛЕНИЕ (задача 034): чтение настроек — пять-шесть вызовов git подряд, на нагруженной машине секунды, и все они стояли
// поперёк цикла службы (loadConfig зовут шаги прохода). Служба включает режим: устаревшее значение отдаётся сразу, а перечитывается
// оно асинхронно (gitAsync). Первое чтение папки (старт) и инструменты без режима — по-прежнему синхронные.
const refreshing = new Set<string>()

/** Папка настроек → проект (имя, корень, сырые настройки). */
export function readSettingsFolder(folder: string, now = Date.now()): Folder {
  const dir = path.resolve(folder)
  const hit = cache.get(dir)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  if (hit && background.on) {
    if (!refreshing.has(dir)) {
      refreshing.add(dir)
      void async_(settingsBody(dir))
        .then((value) => cache.set(dir, { at: Date.now(), value }))
        .catch(() => {})
        .finally(() => refreshing.delete(dir))
    }
    return hit.value
  }
  const value = sync(settingsBody(dir))
  cache.set(dir, { at: now, value })
  return value
}


/** Основной ключ опций со списком папок настроек (задача 089); `projects` — прежнее имя, синоним. */
export const PROJECT_SETTINGS_KEY = "project_settings"
export const PROJECTS_KEY_OLD = "projects"
const given = (v: unknown) => v !== undefined && v !== null

/** Значение ключа папок настроек: project_settings, а если он не задан — projects. */
export function projectsOption(opt: any): any {
  if (given(opt?.[PROJECTS_KEY_OLD])) throw new Error("Canopus projects was removed; use project_settings in the config file")
  return opt?.[PROJECT_SETTINGS_KEY] ?? []
}

/** Записи значения ключа для сравнения: список — папки, прежняя форма — «имя: корень». */
const entriesOf = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).map((x) => normPath(x)) : v && typeof v === "object" ? Object.entries(v).map(([n, r]) => `${String(n).toLowerCase()}: ${typeof r === "string" ? normPath(r) : String(r)}`) : []

/** Что сказать врачу о ключах опций: problems — мешают зелёному вердикту, notes — справка низкой важности. */
export function optionKeyLines(opt: any): { problems: string[]; notes: string[] } {
  const problems: string[] = []
  const notes: string[] = []
  const main = opt?.[PROJECT_SETTINGS_KEY]
  const old = opt?.[PROJECTS_KEY_OLD]
  if (given(main) && given(old)) {
    const a = entriesOf(main)
    const b = entriesOf(old)
    const onlyMain = a.filter((x) => !b.includes(x))
    const onlyOld = b.filter((x) => !a.includes(x))
    if (onlyMain.length || onlyOld.length)
      problems.push(
        `в опциях плагина заданы оба ключа, project_settings и projects: действует project_settings, projects игнорируется; расходятся записи${onlyOld.length ? ` — только в projects: ${onlyOld.join(", ")}` : ""}${onlyMain.length ? ` — только в project_settings: ${onlyMain.join(", ")}` : ""}; убери projects из opencode.jsonc`,
      )
    else notes.push(`в опциях плагина заданы оба ключа, project_settings и projects, с одинаковыми записями: действует project_settings, projects игнорируется; убери projects из opencode.jsonc`)
  } else if (given(old) && Array.isArray(old)) notes.push(`ключ projects переименован в project_settings; прежнее имя работает`)
  if (given(main) && !Array.isArray(main)) problems.push(`ключ project_settings — список папок настроек ["<папка с .canopus/plugin/config.json>"]; прежняя форма «имя → корень» работает только под прежним именем projects`)
  return { problems, notes }
}
// Строки врача по последним разобранным опциям (их ставит parseProjects: плагин и MCP-сервер разбирают опции один раз при загрузке).
let optionLines: { problems: string[]; notes: string[] } = { problems: [], notes: [] }
/** Справочные строки врача (низкая важность, не проблема): например, про прежнее имя ключа. */
export const settingsNotes = (): string[] => optionLines.notes

/** Опции плагина → проекты. Новая форма — массив папок настроек; прежняя — объект имя → корень. */
export function parseProjects(opt: any, log: (s: string) => void = () => {}): Projects {
  const out: Projects = []
  optionLines = optionKeyLines(opt)
  const list = projectsOption(opt)
  if (Array.isArray(list)) {
    for (const folder of list) {
      if (typeof folder === "string" && folder) out.push(readSettingsFolder(folder).project)
      else if (folder && typeof folder === "object" && PROJECT_RE.test(folder.project) && typeof folder.root === "string" && path.isAbsolute(folder.root)) {
        if (Object.keys(folder).some(key => key !== "project" && key !== "root")) throw new Error("project_settings: virtual definitions accept only project and root")
        // A project can be configured globally without editing a foreign repository.
        out.push({ name: folder.project, root: normPath(folder.root), rootPath: canon(folder.root) })
      } else throw new Error("project_settings: expected a settings directory or {project, root: absolute path}")
    }
  } else throw new Error("project_settings: expected an array")
  // проверки, которые видны только по всему списку
  const byName = new Map<string, Project[]>()
  for (const p of out) byName.set(p.name, [...(byName.get(p.name) ?? []), p])
  for (const [n, ps] of byName) if (ps.length > 1) for (const p of ps) (p.problems ??= []).push(`два проекта с именем «${n}»: ${ps.map((x) => x.dir ?? x.root).join(", ")}`)
  return out.sort((a, b) => b.root.length - a.root.length)
}

// ПРОЕКТ ВКЛАДКИ (задача 067, 2026-10-17). Папка вкладки — не проект: интегратор переезжает в рабочие деревья задач (session_move), а
// дерево лежит вне корня проекта, и по префиксу корня проект не находился (`/canopus-sets use` отвечал «задан прежней формой опций»).
// Проект ищется так: 1) по имени — карточка вкладки хранит поле project (плагин пишет его сам; у вкладки задачи или приёмки это
// проект задачи, где бы ни лежало дерево); 2) по корню — самый длинный подходящий корень, как раньше; 3) по основной папке
// репозитория: рабочее дерево знает, чьё оно — `git rev-parse --git-common-dir` указывает на `.git` основного репозитория
// (ссылку делает сам git, имя папки дерева не угадывается), и проектом дерева будет проект, в корне которого лежит эта основная папка.
// `git worktree list` даёт то же, но спрашивает репозиторий проекта, а дереву нужен ответ из его собственной папки.
const mainTrees = new Map<string, { at: number; main: string | undefined }>()
const TREE_MISS_MS = 30_000 // «не в репозитории» перепроверяется (папка могла стать репозиторием); найденное не меняется
/** Основная рабочая папка репозитория, к которому подключена папка dir (для основной папки — она сама); нет репозитория — undefined. */
export function mainTreeOf(dir: string, now = Date.now()): string | undefined {
  if (!dir) return undefined
  const key = path.resolve(dir)
  const hit = mainTrees.get(key)
  if (hit && (hit.main || now - hit.at < TREE_MISS_MS)) return hit.main
  let main: string | undefined
  try {
    const common = path.resolve(key, git(key, ["rev-parse", "--git-common-dir"]).trim())
    // основная рабочая папка — над `.git`; у голого репозитория и подмодуля такой папки нет — проекта у них не бывает
    if (path.basename(common).toLowerCase() === ".git") main = canon(path.dirname(common))
  } catch {}
  mainTrees.set(key, { at: now, main })
  return main
}

const rootMatch = (d: string, projects: Projects) => projects.find((p) => d === p.root || d.startsWith(p.root + "/"))

/** Проект вкладки: имя из карточки (name), иначе самый длинный подходящий корень каталога, иначе корень основной папки репозитория каталога. */
export function projectFor(dir: string, projects: Projects, name?: string): Project | undefined {
  const n = typeof name === "string" ? name.trim().toLowerCase() : ""
  if (n) {
    const byName = projects.find((p) => p.name === n)
    if (byName) return byName
  }
  if (!dir) return undefined
  const hit = rootMatch(normPath(dir), projects)
  if (hit) return hit
  const main = mainTreeOf(dir)
  if (!main) return undefined
  const registered = rootMatch(normPath(main), projects)
  if (registered) return registered
  const inferred = readSettingsFolder(main).project
  return { ...inferred, name: inferred.name.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "local" }
}

/** Каталог dir лежит под корнем проекта p (а не найден по имени или как рабочее дерево вне корня). */
export const inRoot = (dir: string, p: Project): boolean => {
  const d = normPath(dir)
  return d === p.root || d.startsWith(p.root + "/")
}
/** Откуда читать и искать файл настроек прежней формы: сам каталог под корнем, иначе корень проекта (дерево ветки не подменяет основную папку). */
export const legacyBase = (dir: string, p: Project | undefined): string => (p && !inRoot(dir, p) ? (p.rootPath ?? p.root) : dir)

/** Папка вкладки не относится ни к одному проекту плагина: фраза отказа, с маленькой буквы. */
export const outsideProject = (dir: string): string =>
  `папка вкладки ${dir.replace(/\\/g, "/")} не относится к проекту: она вне корней проектов плагина (opencode.jsonc) и не рабочее дерево репозитория проекта — открой вкладку в папке проекта или в рабочем дереве его задачи`

/** Сырые настройки проекта: файл из репозитория настроек (+ локальная поправка) или прежний поиск вверх от каталога. */
export function settingsForWithOrigins(dir: string, projects: Projects, local: Record<string, any> = {}, name?: string): { values: any; origins: Record<string, string> } {
  const p = projectFor(dir, projects, name)
  const main = mainTreeOf(dir)
  const raw = p?.dir ? readSettingsFolder(p.dir).raw : main ? readSettingsFolder(main).raw : {}
  const result = settingsWithOrigins(raw, p?.dir ?? p?.rootPath ?? main ?? dir, p ? local[p.name] : {}, p?.name)
  if (typeof result.values.tasks_dir === "string") result.values.tasks_dir = validateTasksDir(result.values.tasks_dir)
  return result
}
export function rawSettingsFor(dir: string, projects: Projects, local: Record<string, any> = {}, name?: string): any {
  return settingsForWithOrigins(dir, projects, local, name).values
}

// Прежняя форма: `.canopus/plugin/config.json` вверх от каталога вкладки, рабочая копия.
// Битый файл (не JSON) молча давал пустые настройки, и защитные ключи (merge_precheck: required и др.) выключались без
// сообщения (задача 006): теперь берутся последние хорошие настройки этого файла, а о файле пишется в журнал и в canopus_doctor.
const legacyGood = new Map<string, any>()
const legacyBroken = new Map<string, string>() // файл → когда замечен битым
function legacyFile(dir: string): string | undefined {
  let d = dir ? path.resolve(dir) : ""
  for (let i = 0; d && i < 32; i++) {
    const f = path.join(d, SETTINGS_FILE)
    if (existsSync(f)) return f
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  return undefined
}
function legacyWalk(dir: string): any {
  const f = legacyFile(dir)
  if (!f) return {}
  try {
    const raw = JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""))
    legacyGood.set(f, raw)
    legacyBroken.delete(f)
    return raw
  } catch {
    const last = legacyGood.get(f)
    if (!legacyBroken.has(f)) log(`settings file ${f} is not valid JSON -- ${last ? "using the last good settings" : "defaults"}`)
    legacyBroken.set(f, new Date().toISOString())
    return last ?? {}
  }
}
/** Битые файлы настроек прежней формы (проекты без репозитория настроек): проверка на месте, для canopus_doctor. */
function legacyProblems(projects: Projects): string[] {
  const out: string[] = []
  for (const p of projects) {
    if (p.dir) continue
    const f = legacyFile(p.rootPath ?? p.root)
    if (!f) continue
    try {
      JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""))
    } catch {
      out.push(`проект ${p.name}: ${f} — не JSON; ${legacyGood.has(f) ? "действуют последние хорошие настройки" : "публичные настройки по умолчанию; встроенные защитные политики остаются включены"}; исправь файл`)
    }
  }
  return out
}

/** Файл настроек в рабочей копии папки настроек (то, что правит canopus_config set; действует после коммита). */
export function workingSettings(folder: string): { file: string; raw: any } {
  const file = path.join(path.resolve(folder), SETTINGS_FILE)
  let raw: any = {}
  try {
    raw = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""))
  } catch {}
  return { file, raw: raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {} }
}

/** Записать ключи в рабочую копию (null — удалить ключ); остальное в файле не трогается. Без BOM, атомарно. */
export function writeSettings(folder: string, values: Record<string, any>): string {
  const { file, raw } = workingSettings(folder)
  for (const [k, v] of Object.entries(values)) {
    if (v === null) delete raw[k]
    else raw[k] = v
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n")
  renameSync(tmp, file)
  cache.delete(path.resolve(folder))
  return file
}

/** Проблемы настроек всех проектов (canopus_doctor). Вложенные корни — не проблема: вложенный проект побеждает. */
/** Текст шага приёмки пересказывает порядок приёмки: «под замком» рядом с CI/land/посадка/гейт или «замок вливания» рядом с CI. */
const describesAcceptanceOrder = (text: unknown) => {
  const t = typeof text === "string" ? text : ""
  return /под замком[^.]{0,80}(ci|land|посадк|гейт)|(ci|land|посадк|гейт)[^.]{0,80}под замком|замок вливания[^.]{0,80}ci|ci[^.]{0,80}замок вливания/i.test(t)
}

/** Определены ли модели воркеров проекта (задача 033): включён набор профилей, либо заданы spawn_models, либо явно разрешены значения по умолчанию. */
export function modelsDefined(raw: any): boolean {
  if (raw?.allow_default_models === true) return true
  if (typeof raw?.profile_set === "string" && raw.profile_set.trim()) return true
  const sm = raw?.spawn_models
  return !!sm && typeof sm === "object" && Object.values(sm).some((v) => typeof v === "string" && v)
}
export function unconfiguredLine(name: string): string {
  return `проект ${name} не настроен: модели`
}

export function settingsProblems(projects: Projects, local: Record<string, any> = {}): string[] {
  const out = [...optionLines.problems, ...projects.flatMap((p) => p.problems ?? [])]
  for (const p of projects) if (p.legacy) out.push(`проект ${p.name}: настройки в файле с прежним именем ${p.legacy} — переименуй в .canopus/plugin/config.json (git mv) и закоммить`)
  // настройка, которая не может сработать: ключ gate в answer_mode, режим agent, неверный answer_max (задача 007)
  for (const p of projects) {
    if (p.problems?.length) continue
    const raw = rawSettingsFor(p.rootPath ?? p.root, projects, local)
    // Public values and retained code policy have distinct origins; diagnostics need both.
    const policy = resolveProjectPolicy(raw, p.dir ?? p.rootPath ?? p.root)
    for (const n of answerNotes(raw?.answer_mode, policy.answer_max, policy.answer_delay_sec)) out.push(`проект ${p.name}: ${n}`)
    // шаги приёмки — один источник (задача 027): и файл Канона, и тексты в настройках — ошибка; плагин берёт файл
    if (typeof raw?.acceptance_file === "string" && raw.acceptance_file.trim() && Array.isArray(policy.acceptance) && policy.acceptance.length)
      out.push(`проект ${p.name}: шаги приёмки заданы и файлом Канона, и текстами в настройках: оставь один источник — acceptance_file`)
    // порядок приёмки задаёт плагин (merge_precheck); текст шага, пересказывающий старый порядок, устареет — только предупреждение
    if (policy.merge_precheck !== "off" && Array.isArray(policy.acceptance))
      for (const a of policy.acceptance) if (a && typeof a.id === "string" && describesAcceptanceOrder(a.text)) out.push(`проект ${p.name}: шаг ${a.id} описывает порядок приёмки, он задаётся плагином (canopus_help, ПРИЁМКА): оставь в шаге только проектные команды и критерии`)
  }
  // расхождение файла рабочей копии с целевой веткой (задача 029): предупреждение, действуют настройки ветки
  for (const p of projects) {
    if (!p.dir) continue
    const w = divergenceProblem(p.name, configDivergence(p.repo, p.file, p.branch))
    if (w) out.push(w)
  }
  // проект без определённых моделей: canopus_spawn откажет (задача 033)
  for (const p of projects) {
    if (p.problems?.length) continue // нет читаемых настроек — об этом уже сказано выше
    const raw = rawSettingsFor(p.rootPath ?? p.root, projects, local)
    const configured = { ...raw, allow_default_models: resolveProjectPolicy(raw, p.dir ?? p.rootPath ?? p.root).allow_default_models }
    if (!modelsDefined(configured)) out.push(`${unconfiguredLine(p.name)} (нет включённого profile_set: canopus_spawn требует явную модель; canopus_config {action: "apply_template"} или canopus_config guide)`)
  }
  return [...new Set(out)]
}
