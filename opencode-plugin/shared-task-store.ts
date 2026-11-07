// 288: one task directory for every client. No transport, lifecycle transitions or answer replay.
import { existsSync, mkdirSync, lstatSync, readdirSync, readFileSync, renameSync, writeFileSync, rmdirSync, unlinkSync } from "node:fs"
import path from "node:path"
import {randomUUID} from "node:crypto"
export type TaskLocation = { root: string; tasksDir: string }
export type StoredTask = { project: string; n: number; slug?: string; [key: string]: any }
const key = (s: string) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) throw Error("Invalid task project")
  return s
}
export function taskRoot(home: string, project: string, location?: TaskLocation): string {
  if (!location) return project ? path.join(home, "tasks", key(project)) : path.join(home, "tasks")
  const rel = location.tasksDir.replace(/\\/g, "/")
  if (!rel || path.isAbsolute(rel) || rel.split("/").includes("..")) throw Error("Project tasks_dir must stay inside the project and must not be empty")
  const root = path.resolve(location.root), target = path.resolve(root, rel)
  if (!path.relative(root, target) || path.relative(root, target).startsWith("..")) throw Error("Unsafe task directory")
  return target
}
export function taskEntries(root: string): { n: number; folder: string; file: string }[] {
  if (!existsSync(root)) return []
  const out: { n: number; folder: string; file: string }[] = []
  for (const d of readdirSync(root, { withFileTypes: true })) {
    const m = /^(\d{3,})-(.+)$/.exec(d.name)
    if (d.isSymbolicLink() && m) throw Error("Task directory must not be a symbolic link")
    if (d.isDirectory() && m && existsSync(path.join(root,d.name,"task")) && lstatSync(path.join(root,d.name,"task")).isSymbolicLink()) throw Error("Task payload directory must not be a symbolic link")
    if (d.isDirectory() && m) out.push({ n: Number(m[1]), folder: d.name, file: path.join(root, d.name, "task", "state.json") })
  }
  const seen = new Set<number>()
  for (const r of out.filter(r => existsSync(r.file))) { if (seen.has(r.n)) throw Error(`Task number collision: ${r.n}`); seen.add(r.n) }
  return out
}
export function recordFile(root: string, n: number, slug = "task"): string {
  if (!Number.isSafeInteger(n) || n < 1) throw Error("Invalid task number")
  if (!/^[^/\\]+$/.test(slug) || [".", ".."].includes(slug)) throw Error("Invalid task slug")
  const matches = taskEntries(root).filter(r => r.n === n)
  const active = matches.filter(r => existsSync(r.file))
  if (active.length === 1) return active[0].file
  const exact = matches.find(r => r.folder === `${String(n).padStart(3, "0")}-${slug}`)
  if (exact) return exact.file
  if (matches.length > 1) throw Error("Ambiguous task folder; explicit migration required")
  return matches[0]?.file ?? path.join(root, `${String(n).padStart(3, "0")}-${slug}`, "task", "state.json")
}
export function readTaskFile(file: string): StoredTask | undefined {
  if (!existsSync(file)) return undefined
  if (lstatSync(file).isSymbolicLink()) throw Error("Task state must not be a symbolic link")
  let t:any
  try {t=JSON.parse(readFileSync(file,"utf8"))}catch{throw Error("Shared task state is unreadable; explicit recovery required")}
  if (!t || !Number.isSafeInteger(t.n) || t.n < 1 || typeof t.project !== "string" || (t.project!==""&&!/^[a-z0-9][a-z0-9-]*$/.test(t.project))) throw Error(`Invalid shared task: ${file}`)
  const folder=/^(\d{3,})-/.exec(path.basename(path.dirname(path.dirname(file))))
  if(!folder||Number(folder[1])!==t.n)throw Error("Shared task filename identity mismatch")
  return t
}
export function listTaskFiles(root: string): StoredTask[] {
  return taskEntries(root).flatMap(r => { const t = readTaskFile(r.file); if (!t) return []; if (t.n !== r.n) throw Error("Task identity mismatch"); return [t] })
}
// A common lock serializes number allocation across plugin, MCP and application processes.
export function withTaskLock<T>(root: string, operation: () => T): T {
  mkdirSync(root, { recursive: true })
  const maintenance = path.join(root,".task-store.lock")
  if (existsSync(maintenance)) throw Error("Task store is locked for migration")
  const id=randomUUID(), own=path.join(root,`.task-store.claim-${id}.json`)
  const publish=(value:any)=>{
    const tmp=own+".tmp";writeFileSync(tmp,JSON.stringify(value),{flag:"wx"})
    for(let i=0;;i++)try{renameSync(tmp,own);break}catch(e:any){if(!["EPERM","EACCES","EBUSY"].includes(e.code)||i>=40)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25)}
  }
  const others=()=>readdirSync(root).filter(n=>n.startsWith(".task-store.claim-")&&n.endsWith(".json")&&path.join(root,n)!==own).flatMap(n=>{
    let c:any
    try {c=JSON.parse(readFileSync(path.join(root,n),"utf8"))} catch(e:any){if(e.code==="ENOENT")return [];throw Error("Task claim unreadable")}
    if(!Number.isSafeInteger(c.pid)||c.pid<=0||typeof c.id!=="string"||typeof c.choosing!=="boolean"||(!c.choosing&&(!Number.isSafeInteger(c.ticket)||c.ticket<1)))throw Error("Task claim ownership unknown")
    try{process.kill(c.pid,0)}catch(e:any){if(e.code==="ESRCH")return [];throw Error("Task claim ownership unknown")}
    return [c]
  })
  publish({pid:process.pid,id,choosing:true})
  try {
    const current=others()
    if(current.some(c=>c.pid===process.pid))throw Error("Task store is already locked by this process")
    const ticket=Math.max(0,...current.map(c=>c.ticket??0))+1
    publish({pid:process.pid,id,choosing:false,ticket})
    for(let attempt=0;attempt<1200;attempt++){
      if(existsSync(maintenance))throw Error("Task store is locked for migration")
      if(!others().some(c=>c.choosing||c.ticket<ticket||(c.ticket===ticket&&c.id<id)))return operation()
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25)
    }
    throw Error("Task store is locked; no write was performed")
  } finally {unlinkSync(own)}
}
export function writeTaskFile(file: string, t: StoredTask, exclusive = false): void {
  mkdirSync(path.dirname(file), { recursive: true })
  if (exclusive) { writeFileSync(file, JSON.stringify(t, null, 1), { flag: "wx" }); return }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(t, null, 1), { flag: "wx" })
  for(let i=0;;i++)try{renameSync(tmp,file);break}catch(e:any){
    if(!["EPERM","EACCES","EBUSY"].includes(e.code)||i>=20)throw e
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25)
  }
}

const TR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" }
export function slugify(title: string): string {
  const s = [...title.toLowerCase()].map((c) => TR[c] ?? c).join("")
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "task"
}

