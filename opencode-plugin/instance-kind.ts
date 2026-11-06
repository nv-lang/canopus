import { existsSync, mkdirSync, openSync, readFileSync, closeSync, writeFileSync, fsyncSync } from "node:fs"
import path from "node:path"

const PLUGIN_KIND = "canopus-instance:plugin\n"
/** Same-folder configs of one part share data; application and plugin never do. */
export function claimPluginInstance(root: string): void {
  const marker = path.join(root, "state", "instance.kind")
  if (!existsSync(marker) && existsSync(path.join(root, "data", "sessions"))) throw new Error("Canopus plugin instance contains application session data; select a separate config folder")
  mkdirSync(path.dirname(marker), { recursive: true })
  let fd: number
  try { fd = openSync(marker, "wx", 0o600) }
  catch (error: any) {
    if (error?.code !== "EEXIST") throw new Error("Canopus instance marker cannot be created")
    let kind: string
    try { kind = readFileSync(marker, "utf8") } catch { throw new Error("Canopus instance marker cannot be read") }
    if (kind !== PLUGIN_KIND) throw new Error("Canopus config folder belongs to another component; application and plugin need separate instance folders")
    return
  }
  try { writeFileSync(fd, PLUGIN_KIND); fsyncSync(fd) } finally { closeSync(fd) }
}
