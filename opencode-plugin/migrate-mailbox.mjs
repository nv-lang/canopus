// Однократный перенос ящика прежнего имени (эпохи прежнего продукта, а также opencode-peers / nova-peers) в
// canopus — switch-манифест задачи 284. Запуск ПРИ ОСТАНОВЛЕННОЙ службе OpenCode, из каталога opencode-plugin:
//   node migrate-mailbox.mjs            — перенос, печатает квитанцию
//   node migrate-mailbox.mjs --rollback — откат по квитанции (canopus возвращается в crew-harness) // guard-allow(legacy-name): назначение rollback — прежнее имя ящика
// Переносить нечего (новой установки или перенос уже сделан) — печатает «nothing to migrate».
import { migrateBase, rollbackBase } from "./paths.ts"

if (process.argv.includes("--rollback")) {
  const back = rollbackBase()
  console.log(back ? `rolled back: ${back.from} -> ${back.to}` : "nothing to roll back")
} else {
  const receipt = migrateBase()
  console.log(receipt ? `migrated: ${receipt.from.join(", ")} -> ${receipt.to}` : "nothing to migrate")
}
