import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {snapshotTaskDocuments} from "../shared-task-snapshot.ts"
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"shared-snapshot-"))
try{
 const repo=path.join(tmp,"repo"),tree=path.join(tmp,"tree");fs.mkdirSync(repo)
 const git=(dir,...args)=>execFileSync("git",["-C",dir,...args],{encoding:"utf8",windowsHide:true}).trim()
 git(repo,"init","-q","-b","main");git(repo,"config","user.name","Fixture");git(repo,"config","user.email","fixture@example.com")
 fs.writeFileSync(path.join(repo,"owner.txt"),"base");git(repo,"add","--","owner.txt");git(repo,"commit","-qm","base")
 git(repo,"worktree","add","-qb","task/001-shared",tree,"main")
 fs.appendFileSync(path.join(repo,".git/info/exclude"),"\n**/state.json\n**/watch.json\n**/snapshot.json\n**/imported-sources/\n")
 const dir=path.join(repo,"doc/tasks/001-shared"),file=path.join(dir,"state.json");fs.mkdirSync(path.dirname(file),{recursive:true})
 fs.writeFileSync(file,JSON.stringify({project:"p",n:1,status:"paused"}));fs.writeFileSync(path.join(dir,"watch.json"),JSON.stringify({hold:{scope:"execution"}}))
 fs.writeFileSync(path.join(dir,"tests-run.json"),"private test result")
 fs.mkdirSync(path.join(dir,"task"));fs.writeFileSync(path.join(dir,"task/message.md"),"assignment\n");fs.writeFileSync(path.join(dir,"log.md"),"live journal\n")
 fs.writeFileSync(path.join(repo,"owner.txt"),"owner staged change");git(repo,"add","--","owner.txt")
 const state=fs.readFileSync(file),t={n:1,directory:repo,branch:"task/001-shared",worktree:tree,folder:"doc/tasks/001-shared"}
 snapshotTaskDocuments(file,t,{stage:true,target:"main"})
 assert.equal(git(repo,"show",":owner.txt"),"owner staged change")
 const tracked=git(repo,"ls-tree","-r","--name-only",t.branch)
 assert.ok(tracked.includes("task/message.md"));assert.ok(!tracked.includes("state.json"));assert.ok(!tracked.includes("watch.json"));assert.ok(!tracked.includes("snapshot.json"));assert.ok(!tracked.includes("tests-run.json"))
 git(repo,"merge","--ff-only",t.branch)
 assert.deepEqual(fs.readFileSync(file),state)
 assert.equal(git(repo,"show",":owner.txt"),"owner staged change")
 fs.appendFileSync(path.join(dir,"log.md"),"new journal line\n")
 snapshotTaskDocuments(file,t,{stage:true,target:"main"});git(repo,"merge","--ff-only",t.branch)
 assert.ok(fs.readFileSync(path.join(dir,"log.md"),"utf8").includes("new journal line"))
 const beforeWithdraw=git(tree,"rev-parse","HEAD")
 snapshotTaskDocuments(file,t,{withdraw:"not committed addition"})
 assert.equal(git(tree,"rev-parse","HEAD"),beforeWithdraw)
 fs.appendFileSync(path.join(dir,"task/message.md"),"committed addition\n")
 snapshotTaskDocuments(file,t)
 fs.writeFileSync(path.join(dir,"task/message.md"),"assignment\n")
 snapshotTaskDocuments(file,t,{withdraw:"committed addition"})
 assert.match(git(tree,"log","-1","--format=%s"),/Take back the addition/)
 assert.equal(git(tree,"show","HEAD:doc/tasks/001-shared/task/message.md"),"assignment")
 assert.equal(git(repo,"show",":owner.txt"),"owner staged change")
 assert.deepEqual(fs.readFileSync(file),state)
 fs.writeFileSync(path.join(dir,"log.md"),"owner staged document");git(repo,"add","--","doc/tasks/001-shared/log.md")
 fs.writeFileSync(path.join(dir,"log.md"),"different live version")
 assert.throws(()=>snapshotTaskDocuments(file,t,{stage:true,target:"main"}),/unrelated staged change/)
 assert.equal(git(repo,"show",":doc/tasks/001-shared/log.md"),"owner staged document")
 console.log("Snapshot: ff-only works, one live directory, private state excluded, owner index and divergent documents preserved: green")
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
