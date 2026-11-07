// Explicit expected text changes for working project configuration; actual output is untouched.
export function expectedConfig289(key, text) {
  if (key === "config: guide") return text.replace("потом закоммить файл (действует с коммита).", "настройки действуют сразу, изменения видны в Git diff.")
  if (key === "config: show") return text.replace("глобальное определение; настройки из выбранного глобального, принятого проектного и личного файлов.", "настройки из глобального и проектного config.json.")
  if (key === "canopus: formatStatuses") return text.replace("proj · worker idle", "proj · worker idle · ⚠ no models · /canopus-doctor")
  if (key === "canopus: sidebarLines") {
    const value = JSON.parse(text)
    value.rows.push({mark: " ", who: "", what: "⚠ проект proj не настроен: модели", tone: "accent"})
    return JSON.stringify(value)
  }
  if (key === "canopus: sidebarLines, texts") return text + "\n⚠ проект proj не настроен: модел"
  return text
}
