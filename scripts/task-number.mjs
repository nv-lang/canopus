#!/usr/bin/env node
// Номер задачи для агента вне OpenCode (задача 058, REQ-21; вопрос В-05).
//
// Зачем: быстрые задачи заводит и агент вне OpenCode (оркестратор), а canopus_spawn плагина — окна OpenCode; без общего счёта оба
// берут один номер наперегонки. Скрипт берёт номер тем же кодом плагина (opencode-plugin/task-numbers.ts: 1 + наибольший номер
// записей проекта и папок задач во всех рабочих деревьях, локальных ветках и ветках origin), занимает его записью в хранилище
// плагина (атомарное создание файла, как canopus_spawn) и заводит папку NNN-<slug>/ (task/message.md и log.md с первой строкой) в
// указанном дереве. Коммитит агент сам, на своей ветке; основную копию целевой ветки скрипт не трогает (откажет, если дерево — она).
//
// Запуск (node >= 24, из любого каталога):
//   node scripts/task-number.mjs --dir <дерево задачи> --title "<название>" [--slug <латиница>] [--message-file <файл>]
//        [--project <имя проекта плагина>] [--tasks-dir doc/tasks] [--allow-main]
//        --session <native session> --creation-reason <why> --checked-tasks <1,2 or none> --why-new <why existing tasks do not cover it>
//        [--approval <proposal id>] [--resubmit <declined proposal id>]
// Первый вызов создаёт только native owner-вопрос; запись/папка — после ответа и повторного вызова с approval.
// Ответ — одна строка JSON: {"n": 59, "number": "059", "folder": "doc/tasks/059-<slug>", "path": "<папка на диске>"}.
// Ошибка — текст в stderr и код выхода 1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = path.resolve(here, "..", "opencode-plugin")
const load = (f) => import(pathToFileURL(path.join(plugin, f)).href)

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    if (key === "allow-main") out[key] = true
    else out[key] = argv[++i]
  }
  return out
}
const fail = (text) => {
  process.stderr.write(`task-number: ${text}\n`)
  process.exit(1)
}

const a = args(process.argv.slice(2))
if (!a.dir || !a.title) fail("нужны --dir <дерево задачи> и --title <название>")
const tn = await load("task-numbers.ts")
const tasks = await load("tasks.ts")
const folders = await load("task-folders.ts")
const dir = path.resolve(a.dir)
const top = tn.repoTop(dir)
if (!top) fail(`${dir} — не репозиторий git`)
const git = (...x) => execFileSync("git", ["-C", top, ...x], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim()
// основная копия — живая (AGENTS.md, пп. 3 и 11): папку пишем только в связанное дерево
const common = path.resolve(top, git("rev-parse", "--git-common-dir"))
const mainRoot = path.dirname(common)
if (!a["allow-main"] && path.resolve(mainRoot).toLowerCase() === path.resolve(top).toLowerCase()) fail("дерево — основная копия; папка задачи заводится в рабочем дереве на ветке задачи")
const settings = await load("settings.ts")
const cfg = settings.rawSettingsFor(top, [{ name: String(a.project ?? path.basename(mainRoot)), root: settings.normPath(mainRoot), rootPath: mainRoot, dir: mainRoot }])
const { validateTasksDir } = await load("plugin-config.ts")
const rel = validateTasksDir(String(a["tasks-dir"] ?? cfg.tasks_dir ?? tn.DEFAULT_TASKS_DIR))
if (!rel) fail("пустой --tasks-dir: у проекта без папок задач номер выдаёт только canopus_spawn")
const project = String(a.project ?? path.basename(mainRoot)).trim()
const title = String(a.title).trim()
const slug = a.slug ? tasks.slugify(String(a.slug)) : tasks.slugify(title)
const message = a["message-file"] ? readFileSync(path.resolve(a["message-file"]), "utf8") : ""
const { APPROVALS, canonical, confirmTaskOperation, applyApprovedCreation, createReasonRefusal, creationDescription, similarTasks, readProposal } = await load("task-confirmation.ts")
const { taskConfirmationIO } = await load("task-confirmation-native.ts")
const session = String(a.session ?? "").trim()
if (!session) fail("нужна --session: native сессия, в которой владелец подтвердит создание")
const input = { title, goal: title, creation_reason: String(a["creation-reason"] ?? "").trim(), checked_tasks: a["checked-tasks"] === "none" ? [] : String(a["checked-tasks"] ?? "").split(",").filter(Boolean).map(Number), why_new: String(a["why-new"] ?? "").trim() }
if (a["checked-tasks"] === undefined) fail("нужна --checked-tasks: проверенные номера через запятую либо none")
const refusal = createReasonRefusal(input)
if (refusal) fail(refusal)
const records = tasks.listTasks(project)
if (input.checked_tasks.some(n => !records.some(t => t.n === n))) fail("--checked-tasks ссылается на отсутствующий номер")
const candidates = () => similarTasks(input, title, tasks.listTasks(project))
const scope = { entry: "cli", input, directory: top, tasks_dir: rel, slug, message, candidates: candidates() }
for (const previousTask of records) if (previousTask.creation_approval) {
 const previous = readProposal(previousTask.creation_approval.id)
 if (previous?.initiator.session === session && previous.scope.entry === "cli" && previous.scope.directory === top && previous.scope.message === message && previous.scope.tasks_dir === rel && previous.scope.slug === slug && canonical(previous.scope.input) === canonical(input)) {
  process.stdout.write(JSON.stringify({ n: previousTask.n, number: tn.pad3(previousTask.n), folder: previousTask.folder, path: path.join(top, ...previousTask.folder.split("/")), approval: previous.id, existing: true }) + "\n"); process.exit(0)
 }
}
const gate = await confirmTaskOperation({ action: "create", project, initiator: { session, role: `${project}.external-cli` }, scope, title: `Создать задачу «${title}»?`, description: creationDescription(input, title, candidates().map(t => ({ ...t, status: records.find(x => x.n === t.n).status }))), approval: a.approval, resubmit: a.resubmit }, taskConfirmationIO())
if (!gate.ok) { process.stdout.write(JSON.stringify({ state: gate.proposal?.state ?? "refused", approval: gate.proposal?.id, message: gate.content }) + "\n"); process.exit(2) }
const made = await applyApprovedCreation(gate.proposal, () => tasks.listTasks(project).find(t => t.creation_approval?.id === gate.proposal.id), async source => {
const used = tn.usedNumbers(top, rel)
const t = tasks.createTask(
  { project, title, slug, goal: title, priority: "P2", tier: "light", role: "worker", author: session, author_role: `${project}.external-cli`, qid: "", status: "backlog", backlog: { status: "idle", at: Date.now(), by: session }, kind: "external", directory: top, creation_approval: source, creation_reason: input.creation_reason, checked_tasks: input.checked_tasks, why_new: input.why_new },
  undefined,
  { used, fill: (n, s) => ({ folder: `${rel}/${tn.folderName(n, s)}` }) },
)

const folder = path.join(top, ...t.folder.split("/"))
if (existsSync(folder)) fail(`папка ${t.folder} уже есть (номер ${tn.pad3(t.n)} занят записью, папку не перезаписываю)`)
mkdirSync(path.join(folder, "task"), { recursive: true })
writeFileSync(path.join(folder, "task", "creation.json"), JSON.stringify({ reason: input.creation_reason, checked_tasks: input.checked_tasks, why_new: input.why_new, approval: source }, null, 2) + "\n")
writeFileSync(path.join(folder, "task", "message.md"), message.trim() ? message : folders.templateMessage({ title, goal: title, author_role: `${project}.external` }))
let sha = ""
try {
  sha = git("rev-parse", "--short", "HEAD")
} catch {}
writeFileSync(path.join(folder, "log.md"), folders.firstLogLine({ title }, message.trim() ? "текст агента (--message-file)" : "шаблон (заполнить)", `${git("rev-parse", "--abbrev-ref", "HEAD")} ${sha}`.trim()))
tasks.taskEvent(t, "external", undefined, `номер выдан агенту вне OpenCode: папка ${t.folder}/ в дереве ветки ${git("rev-parse", "--abbrev-ref", "HEAD")}`)
return t
}, APPROVALS, () => canonical(candidates()) === canonical(scope.candidates))
if (!made.task) fail(made.busy ?? "создание не завершено")
const result = made.task
process.stdout.write(JSON.stringify({ n: result.n, number: tn.pad3(result.n), folder: result.folder, path: path.join(top, ...result.folder.split("/")), approval: gate.proposal.id, existing: !made.result }) + "\n")
process.exit(0)
