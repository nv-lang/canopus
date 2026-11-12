#!/usr/bin/env node
// 288: application adapter to the same record API used by the plugin. No agent transport.
import fs from "node:fs"
import {createHash} from "node:crypto"
import path from "node:path"
import os from "node:os"
import {sharedTaskContext,bindSharedTaskContext,executionHoldBlocked} from "../opencode-plugin/shared-task-config.ts"
import {taskEntries,recordFile,readTaskFile,writeTaskFile,withTaskLock,slugify} from "../opencode-plugin/shared-task-store.ts"
const args=process.argv.slice(2),action=args.shift()
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
const config=option("--config")??path.join(os.homedir(),".canopus/plugin/config.json")
const context=sharedTaskContext(config,option("--root")??"",option("--project"))
const {project,main,root}=context
if(fs.existsSync(path.join(context.home,"state","task-storage-migration.lock")))throw Error("Shared task migration is in progress")
const old=path.join(path.dirname(config),"data","tasks")
if(fs.existsSync(old)&&fs.readdirSync(old,{withFileTypes:true}).some(p=>p.isDirectory()&&fs.readdirSync(path.join(old,p.name)).some(f=>/^\d+\.json$/.test(f))))throw Error("Explicit shared task migration required")
const tasks={
 slugify,
 taskStorageRoot:()=>root,
 taskFile:(_p,n)=>recordFile(root,n),
 loadTask:(_p,n)=>readTaskFile(recordFile(root,n)),
 listTasks:()=>taskEntries(root).flatMap(e=>{const t=readTaskFile(e.file);return t?[t]:[]})
}
const pluginRoot=()=>path.dirname(config)
const taskHold=(_p,n)=>{const state=tasks.loadTask(project,n);const file=path.join(path.dirname(tasks.taskFile(project,n)),"watch.json");if(!fs.existsSync(file))return;const r=JSON.parse(fs.readFileSync(file,"utf8"));if(r.n!==n||r.project!==state.project)throw Error("Shared task guard identity mismatch");return r.hold}
const pendingEvent=t=>{
 if(!t?.application?.session)return false
 const file=path.join(context.home,"state/task-events",t.application.session+".json")
 if(!fs.existsSync(file))return false
 const evidence=JSON.parse(fs.readFileSync(file,"utf8")),events=t.application.events??[]
 const digest=createHash("sha256").update(JSON.stringify(evidence)).digest("hex")
 return evidence.step>Math.max(0,...events.map(e=>e.step??0))&&!events.some(e=>e.digest===digest)
}
const executionHeld=executionHoldBlocked
if(action==="reserve"||action==="record-event")bindSharedTaskContext(context)
const input = option("--json") ? JSON.parse(option("--json")) : option("--input") ? JSON.parse(fs.readFileSync(option("--input"), "utf8")) : undefined
if (action === "list") console.log(JSON.stringify(tasks.listTasks(project)))
else if (action === "read") console.log(JSON.stringify((()=>{const n=Number(option("--n")??input?.n);const t=tasks.loadTask(project,n);return t?{...t,execution_block:executionHeld(taskHold(t.project,t.n))?"execution HOLD/STOP":pendingEvent(t)?"Shared task persistence is pending; execution blocked":"",shared_dir:path.dirname(tasks.taskFile(project,n))}:null})()))
else if(action === "snapshot"){
 const t=tasks.loadTask(project,Number(input.n))
 if(!t||t.application?.session!==input.session)throw Error("Application task ownership mismatch")
 if(pendingEvent(t))throw Error("Shared task persistence is pending; publication blocked")
 if(["paused","backlog","cancelled","done","accepted"].includes(t.status))throw Error("Task status blocks publication: "+t.status)
 const hold=taskHold(t.project,t.n)
 if(hold&&(executionHeld(hold)||hold.gate===true||hold.scope==="gate"))throw Error("HOLD blocks task publication")
 const {snapshotTaskDocuments}=await import("../opencode-plugin/shared-task-snapshot.ts")
 console.log(JSON.stringify(snapshotTaskDocuments(tasks.taskFile(project,t.n),t,{stage:input.stage!==false,withdraw:typeof input.withdraw==="string"?input.withdraw:undefined})))
}
else if (action === "reserve") {
  // Reserves only an empty numbered directory; it is NOT a task and grants no execution authority.
  
  const {usedNumbers}=await import("../opencode-plugin/task-numbers.ts")
  const root=tasks.taskStorageRoot(project)
  const result=withTaskLock(root,()=>{
    const used=main ? usedNumbers(main,path.relative(main,root).replace(/\\/g,"/")) : []
    const n=Math.max(0,...used,...taskEntries(root).map(r=>r.n))+1
    const slug=tasks.slugify(input.title)
    const file=recordFile(root,n,slug)
    fs.mkdirSync(path.dirname(file),{recursive:true})
    return {n,id:path.basename(path.dirname(path.dirname(file))),dir:path.dirname(file),file}
  })
  console.log(JSON.stringify(result))
} else if (action === "record-event") {
  // Only persist an ALREADY accepted application journal event. Never infer owner approval from an argument.
  
  if(!/^[a-zA-Z0-9_-]+$/.test(input.session??""))throw Error("Invalid application session")
  const official=path.join(path.dirname(pluginRoot()),"state","task-events",input.session+".json")
  if(path.resolve(input.evidence)!==path.resolve(official))throw Error("Evidence must be the application journal export")
  const evidence=JSON.parse(fs.readFileSync(official,"utf8"))
  if(evidence.session!==input.session || !Number.isInteger(evidence.step) || evidence.step<1 || !evidence.name || typeof evidence.text!=="string") throw Error("Application journal evidence mismatch")
  const root=tasks.taskStorageRoot(project), n=Number(input.n)
  withTaskLock(root,()=>{
    const file=recordFile(root,n)
    let t=readTaskFile(file)
    if(!t){
      const e=JSON.parse(evidence.text)
      if(evidence.name!=="route_task" || e.op!=="open" || Number(e.number)!==n || path.resolve(e.dir)!==path.resolve(path.dirname(file))) throw Error("No persisted task open event for reserved directory")
      t={project,n,slug:path.basename(path.dirname(path.dirname(file))).replace(/^\d+-/,""),title:e.title,goal:e.title,author:input.session,author_role:"application",executor:input.session,priority:"P2",tier:"light",role:"worker",qid:"",status:"running",kind:"application",directory:main,executors:[],attempt:1,history:[{at:Date.now(),by:input.session,status:"running",note:"Application journal: task opened"}],created:Date.now(),application:{session:input.session,events:[]}}
    }
    if(t.application?.session!==input.session) throw Error("Task belongs to another client; it was not overwritten")
    const digest=createHash("sha256").update(JSON.stringify(evidence)).digest("hex")
    const events=t.application.events??=[]
    if(events.some(e=>e.digest===digest)) return
    events.push({...evidence,digest})
    if(evidence.name === "route_task") {
      const change=JSON.parse(evidence.text)
      if(change.op==="open"&&Number(change.number)!==n)throw Error("Application event task number mismatch")
      if(change.op === "open" || change.op === "attach_tree") {t.worktree=change.worktree;t.branch=change.branch}
      if(change.op === "reopen_route" && t.status === "done"){
        t.status="running"
        ;(t.history??=[]).push({at:Date.now(),by:input.session,status:"running",note:"Application journal: route reset"})
      }
      if(change.op === "state" && ["running","submitted","rework"].includes(t.status)){
        const previous=t.status
        if(change.state === "ready")t.status="submitted"
        if(change.state === "active")t.status="running"
        if(t.status!==previous)(t.history??=[]).push({at:Date.now(),by:input.session,status:t.status,note:"Application journal: "+change.state})
      }
      if(["close","new","child_merged"].includes(change.op) || (change.op === "state" && change.state === "done")){
        if(t.status!=="done"){t.status="done";(t.history??=[]).push({at:Date.now(),by:input.session,status:"done",note:"Application journal: task completed"})}
      }
    }
    t.storage_revision=(t.storage_revision??0)+1
    t.updated=Date.now();writeTaskFile(file,t)
  })
  console.log(JSON.stringify({ok:true}))
} else throw Error("Expected list, read, reserve or record-event")
