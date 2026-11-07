// 288: shared task placement, independent of plugin hosts, native APIs and transport.
import fs from "node:fs"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {taskRoot,withTaskLock,slugify} from "./shared-task-store.ts"
function json(file:string):any {return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,"")): {}}
function git(root:string,args:string[]):string|undefined {try{return execFileSync("git",["-C",root,...args],{encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","ignore"]}).trim()}catch{return undefined}}
function mainOf(dir:string):string {
 dir=fs.existsSync(dir)?fs.realpathSync.native(dir):path.resolve(dir)
 const common=git(dir,["rev-parse","--git-common-dir"])
 return common&&path.basename(path.resolve(dir,common)).toLowerCase()===".git"?path.dirname(path.resolve(dir,common)):path.resolve(dir)
}
export function sharedTaskContext(config:string,directory="",givenProject?:string) {
 const home=path.dirname(path.dirname(config)),global=json(config),catalogFile=path.join(home,"state","task-projects.json"),catalog=json(catalogFile)
 if(!catalog||typeof catalog!=="object"||Array.isArray(catalog)||Object.values(catalog).some(v=>typeof v!=="string"||!path.isAbsolute(v)))throw Error("Invalid task project index")
 const definitions=(global.project_settings??[]).map((p:any)=>typeof p==="string"?{project:slugify(path.basename(mainOf(p))),root:mainOf(p)}:{...p,root:mainOf(p.root)})
 const selectedRoot=directory||definitions.find((p:any)=>p.project===givenProject)?.root||catalog[givenProject??""]
 const main=selectedRoot?mainOf(selectedRoot):undefined
 const definition=main?definitions.find((p:any)=>p.root&&path.resolve(p.root).toLowerCase()===path.resolve(main).toLowerCase()):undefined
 const project=givenProject??definition?.project??(main?slugify(path.basename(main)):"")
 if(Object.prototype.hasOwnProperty.call(global,"local"))throw Error("Canopus global local was removed; run the explicit two-level configuration transition")
 const personal=main?path.join(main,".canopus/plugin/local.json"):undefined
 if(personal&&fs.existsSync(personal))throw Error("Canopus local.json was removed; run the explicit two-level configuration transition")
 const projectConfig=main?json(path.join(main,".canopus/plugin/config.json")):{}
 const tasksDir=projectConfig.tasks_dir??global.defaults?.tasks_dir??"doc/tasks"
 if(typeof tasksDir!=="string")throw Error("tasks_dir must be a string")
 const root=taskRoot(home,project,main?{root:main,tasksDir:tasksDir||"doc/tasks"}:undefined)
 return {home,project,main,root,catalogFile,catalog}
}
export function taskGitExclude(root:string):string|undefined {
 const entry=path.join(root,".git")
 if(!fs.existsSync(entry))return undefined
 if(fs.statSync(entry).isDirectory())return path.join(entry,"info","exclude")
 const match=/^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(entry,"utf8"))
 if(!match)throw Error("Unknown Git metadata location")
 return path.join(path.resolve(root,match[1].trim()),"info","exclude")
}
export function bindSharedTaskContext(c:ReturnType<typeof sharedTaskContext>) {
 if(!c.main||!c.project)return
 if(fs.existsSync(path.join(c.main,".git"))){
  const file=taskGitExclude(c.main)! ,before=fs.existsSync(file)?fs.readFileSync(file,"utf8"):""
  const rel=path.relative(c.main,c.root).replace(/\\/g,"/")
  const patterns=["**/task/state.json", "**/task/watch.json", "**/task/snapshot.json", "**/task/tests-run.json","**/.task-store.lock/", "**/.task-store.claim-*","**/imported-sources/",`/${rel}/legacy/`]
  const missing=patterns.filter(p=>!before.split(/\r?\n/).includes(p))
  if(missing.length){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,before+(before.endsWith("\n")?"":"\n")+missing.join("\n")+"\n")}
 }
 withTaskLock(path.join(c.home,"state","task-catalog"),()=>{
  const current=json(c.catalogFile)
  if(current[c.project]&&mainOf(current[c.project]).toLowerCase()!==mainOf(c.main!).toLowerCase())throw Error("Task project root collision")
  if(current[c.project])return
  const tmp=c.catalogFile+`.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify({...current,[c.project]:c.main},null,2));fs.renameSync(tmp,c.catalogFile)
 })
}
export function executionHoldBlocked(hold:any):boolean {
 if(!hold)return false
 if(!["execution","external","gate"].includes(hold.scope)||(hold.gate!==undefined&&typeof hold.gate!=="boolean"))return true
 if(hold.scope==="external"&&(!hold.wait?.id||!Number.isFinite(hold.wait?.deadline)))return true
 return hold.scope==="execution"
}
