// Expected public help changes for shared storage. Actual output is compared without normalization.
const changes = [
 ["ЗАДАЧИ. Одна задача — один номер.", "ЗАДАЧИ. Одна задача — один номер и общий каталог приложения/плагина: <project>/<tasks_dir>/NNN-slug/, без проекта — ~/.canopus/tasks/NNN-slug/. Состояние — state.json."],
 ["log.md — первая строка); основную копию не трогает.", "log.md — первая строка). Живые документы и состояние общие, исходный код основной копии не меняется; документы в ветках — снимки."]
]
export function expectedHelp288(text) {
 for(const [before,after] of changes){
  if(text.includes(after))continue
  if(text.split(before).length!==2)throw Error("288 expected help change does not match its historical snapshot")
  text=text.replace(before,after)
 }
 return text
}
