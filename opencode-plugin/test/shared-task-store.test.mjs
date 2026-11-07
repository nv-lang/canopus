import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {taskRoot,recordFile,taskEntries,readTaskFile,withTaskLock,writeTaskFile} from "../shared-task-store.ts"
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"shared-tasks-"))
try {
 const root=taskRoot(tmp,"p",{root:path.join(tmp,"repo"),tasksDir:"docs/tasks"})
 assert.equal(root,path.join(tmp,"repo","docs","tasks"))
 assert.equal(taskRoot(tmp,""),path.join(tmp,"tasks"))
 assert.throws(()=>taskRoot(tmp,"p",{root:tmp,tasksDir:"../escape"}))
 assert.throws(()=>taskRoot(tmp,"p",{root:tmp,tasksDir:""}))
 const file=recordFile(root,1,"first")
 const t={project:"p",n:1,slug:"first",status:"paused",history:[{note:"owner"}],application:{session:"s"}}
 withTaskLock(root,()=>writeTaskFile(file,t,true))
 assert.deepEqual(readTaskFile(recordFile(root,1)),t)
 assert.throws(()=>withTaskLock(root,()=>withTaskLock(root,()=>{})))
 assert.throws(()=>writeTaskFile(file,t,true))
 assert.equal(taskEntries(root).length,1)
 fs.mkdirSync(path.join(root,"001-conflict","task"),{recursive:true})
 fs.writeFileSync(path.join(root,"001-conflict","task","state.json"),JSON.stringify(t))
 assert.throws(()=>taskEntries(root),/collision/)
 fs.writeFileSync(file,"")
 assert.throws(()=>readTaskFile(file),/unreadable/)
 assert.equal(fs.readFileSync(file,"utf8"),"","A corrupt record is never replaced by an empty task")
 console.log("Shared store: paths, one identity, preserved state, exclusive creation, locking, collisions: green")
} finally {fs.rmSync(tmp,{recursive:true,force:true})}
