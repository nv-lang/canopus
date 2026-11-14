// agent-of-hub.ts - task 304: the marker of an agent started by the hub.
//
// ЗАЧЕМ. Хаб запускает своих агентов с CANOPUS_AGENT_OF_HUB=1 (вторая линия после вырезки плагина из
// копии конфигурации, задача 192.9/D454): вырезка видит только плагины глобального конфига, а переменная
// доходит до любой копии плагина — из каталога проекта, из других источников конфигурации opencode.
// Копия плагина, увидевшая переменную, тихо деактивируется: пустая регистрация, одна заметка в журнал
// opencode, без ошибок и без побочных эффектов на диске. Добровольная линия (fail-open): вырезка
// конфигурации остаётся принудительной и авторитетной.

export const HUB_AGENT_ENV = "CANOPUS_AGENT_OF_HUB"

/// True, когда процесс запущен как агент хаба (переменная задана и непуста).
export function hubAgentActive(environment: Record<string, string | undefined> = process.env): boolean {
  const value = environment[HUB_AGENT_ENV]
  return value !== undefined && value !== ""
}

/// Заметка о деактивации в журнал opencode (stdout плагина).
export function noteHubAgentDeactivation(): void {
  console.log(`[canopus] плагин деактивирован: процесс запущен как агент хаба (${HUB_AGENT_ENV})`)
}
