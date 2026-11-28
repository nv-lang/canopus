// 331: explicit expected delta for task directory selection; actual output is untouched.
const before = "- tasks_dir: В каком каталоге репозитория лежат папки задач NNN-<slug>/ (пусто — папок задач в проекте нет)? Сейчас: docs/tasks (по умолчанию). Рекомендация: docs/tasks, если проект ведёт задачи папками; иначе пусто. Зачем: папки включены, когда каталог есть в целевой ветке: номер задачи — номер её папки, canopus_spawn заводит папку (input/message.md, log.md) на ветке задачи, сессии методики — части задачи без своих номеров (задача 058); без папок номер задачи — номер записи плагина (#N)."
const after = "- tasks_dir: В каком каталоге репозитория лежат папки задач NNN-<slug>/ (пусто — автоматический выбор)? Сейчас: docs/tasks (по умолчанию). Рекомендация: docs/tasks; пусто — автоматический выбор существующего каталога. Зачем: Если tasks_dir задан, Canopus использует этот каталог. Без явного каталога Canopus выбирает существующий docs/tasks или прежний doc/tasks до миграции. При двух каталогах Canopus требует явный tasks_dir. Для нового проекта Canopus использует docs/tasks."
export function expectedConfig331(key, text) {
  if (key !== "config: guide" || text.includes(after)) return text
  if (text.split(before).length !== 2) throw Error("331 expected task directory guide delta no longer matches its historical snapshot")
  return text.replace(before, after)
}
