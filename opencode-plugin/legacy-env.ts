// ОТКАЗ СТАРЫХ ИМЁН ПЕРЕМЕННЫХ ОКРУЖЕНИЯ (задача 284). Переименование CrewHarness → Canopus одномоментное, <!-- guard-allow(legacy-name): карта переименования — назначение файла -->
// без переходного периода: заданная старая переменная CREW_*/OPENCODE_CREW_* — понятный отказ с новым
// именем, без исполнения старого вызова, без fallback и без молчаливого выбора пустого нового каталога.

/// Новое имя для старого: OPENCODE_CREW_X → OPENCODE_CANOPUS_X, CREW_HARNESS_X → CANOPUS_X, CREW_X → CANOPUS_X. // guard-allow(legacy-name): карта переименования — назначение файла
/// Не старое имя ("" — переменная не наша): undefined.
export function newNameFor(key: string): string | undefined {
  if (key.startsWith("OPENCODE_CREW_")) return "OPENCODE_CANOPUS_" + key.slice("OPENCODE_CREW_".length) // guard-allow(legacy-name): разбор старого имени — назначение файла
  if (key.startsWith("CREW_HARNESS_")) return "CANOPUS_" + key.slice("CREW_HARNESS_".length) // guard-allow(legacy-name): разбор старого имени — назначение файла
  if (key === "CREW_HARNESS") return "CANOPUS" // guard-allow(legacy-name): разбор старого имени — назначение файла
  if (key.startsWith("CREW_")) return "CANOPUS_" + key.slice("CREW_".length) // guard-allow(legacy-name): разбор старого имени — назначение файла
  return undefined
}

/// Список «старое → новое» для заданных старых переменных среды (по алфавиту).
export function legacyEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  for (const key of Object.keys(env)) {
    const fresh = newNameFor(key)
    if (fresh) out.push(`${key} → задай ${fresh}`)
  }
  return out.sort()
}

/// Бросает понятную ошибку, если в среде заданы старые имена. Вызывается на входах (плагин, MCP-сервер).
export function refuseLegacyEnv(where: string, env: NodeJS.ProcessEnv = process.env): void {
  const problems = legacyEnvProblems(env)
  if (problems.length) {
    throw new Error(`${where}: старые имена переменных окружения больше не поддерживаются (переименование CrewHarness → Canopus):\n` + problems.map((p) => `- ${p}`).join("\n")) // guard-allow(legacy-name): текст отказа называет переименование
  }
}

/// Подсказка для вызова инструмента со старым именем crew_*: новое имя, без исполнения.
export function renamedToolHint(name: string): string {
  return name.startsWith("crew_") ? ` — инструмент переименован: canopus_${name.slice("crew_".length)}` : ""
}
