import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {snapshotTaskDocuments} from "../shared-task-snapshot.ts"
// Task 290: the task documents live in the managing repository, the frozen result candidate — in the bound target
// repository with an INDEPENDENT object base. The stage check must verify each snapshot in its own repository:
// the documents against the PINNED frozen commit recorded at the precheck begin (never the movable branch tip —
// a joint shift of the branch and the live documents after the freeze must not pass), the candidate by its own
// SHA in the bound target repository. Before the fix the foreign candidate was looked up in the managing
// repository, was not found there and the merge was refused with a false "changed after the candidate was frozen"
// (reproduction: a cross-repository task, four live documents unchanged, the result commit absent from the managing
// object base). Cells: the foreign stage passes with unchanged documents and the marker links both snapshots; a true
// change of an included document after the freeze still blocks, with or without a commit of the same change onto the
// task branch; an absent source pin or candidate does not pass silently; neither SHA can stand for the other; the
// single-repository scenario keeps its semantics (the candidate must carry the documents itself).
//   node test/shared-task-snapshot-foreign.test.mjs
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"shared-snapshot-foreign-"))
try{
 const git=(dir,...args)=>execFileSync("git",["-C",dir,...args],{encoding:"utf8",windowsHide:true}).trim()
 // the managing repository: main, the task branch in a worktree, the live shared documents
 const repo=path.join(tmp,"repo"),tree=path.join(tmp,"tree");fs.mkdirSync(repo)
 git(repo,"init","-q","-b","main");git(repo,"config","user.name","Fixture");git(repo,"config","user.email","fixture@example.com")
 fs.writeFileSync(path.join(repo,"owner.txt"),"base");git(repo,"add","--","owner.txt");git(repo,"commit","-qm","base")
 git(repo,"worktree","add","-qb","task/001-foreign",tree,"main")
 fs.appendFileSync(path.join(repo,".git/info/exclude"),"\n**/task/state.json\n**/task/watch.json\n**/task/snapshot.json\n")
 const dir=path.join(repo,"doc/tasks/001-foreign"),file=path.join(dir,"task/state.json");fs.mkdirSync(path.dirname(file),{recursive:true})
 fs.writeFileSync(file,JSON.stringify({project:"p",n:1,status:"reviewing"}))
 fs.writeFileSync(path.join(dir,"task/message.md"),"assignment\n");fs.writeFileSync(path.join(dir,"log.md"),"live journal\n")
 // the bound target repository: an independent history, the result candidate commit
 const pkg=path.join(tmp,"pkg");fs.mkdirSync(pkg)
 git(pkg,"init","-q","-b","main");git(pkg,"config","user.name","Fixture");git(pkg,"config","user.email","fixture@example.com")
 fs.writeFileSync(path.join(pkg,"result.txt"),"result v1\n");git(pkg,"add","--","result.txt");git(pkg,"commit","-qm","result v1")
 const candidate=git(pkg,"rev-parse","HEAD")
 const t={n:1,directory:repo,branch:"task/001-foreign",worktree:tree,folder:"doc/tasks/001-foreign",landing:{dir:pkg}}
 // the freeze of the precheck begin: the documents are committed to the task branch of the managing repository,
 // the returned frozen SHA is the pinned source snapshot that the precheck record keeps
 const r0=snapshotTaskDocuments(file,t,{target:"main"})
 const source=git(tree,"rev-parse","HEAD")
 assert.equal(r0.frozen,source)
 assert.equal(git(repo,"show",`${t.branch}:doc/tasks/001-foreign/task/message.md`),"assignment")
 let sourceInPkg=true;try{git(pkg,"cat-file","-e",source)}catch{sourceInPkg=false}
 assert.ok(!sourceInPkg,"the source freeze commit must not exist in the target repository")
 let candidateInRepo=true;try{git(repo,"cat-file","-e",candidate)}catch{candidateInRepo=false}
 assert.ok(!candidateInRepo,"the result candidate must not exist in the managing repository")
 // GREEN: the documents are unchanged, the candidate is foreign — the stage passes and the marker links both snapshots
 const r=snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate,source,target:"main"})
 assert.equal(r.files,2)
 const marker=JSON.parse(fs.readFileSync(path.join(dir,"task/snapshot.json"),"utf8"))
 assert.equal(marker.branch,t.branch);assert.equal(marker.source,source);assert.equal(marker.candidate,candidate)
 assert.equal(git(repo,"show",":doc/tasks/001-foreign/log.md"),"live journal")
 // a true change of an included live document after the freeze still blocks the merge
 fs.appendFileSync(path.join(dir,"log.md"),"changed after freeze\n")
 assert.throws(()=>snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate,source,target:"main"}),/changed after the candidate was frozen/)
 fs.writeFileSync(path.join(dir,"log.md"),"live journal\n")
 // an absent source pin or candidate does not pass silently; the source commit cannot be passed as the target candidate
 assert.throws(()=>snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate,target:"main"}),/not recorded/)
 assert.throws(()=>snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate:source,source,target:"main"}),/not in the bound result repository/)
 assert.throws(()=>snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate:"0".repeat(40),source,target:"main"}),/not in the bound result repository/)
 // and the target candidate cannot stand as the source pin (it is absent from the managing repository)
 assert.throws(()=>snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate,source:candidate,target:"main"}),/changed after the candidate was frozen/)
 // a JOINT shift of the task branch and the live documents after the freeze still blocks (the pinned source is checked,
 // not the movable branch tip); a new freeze pins the new commit and the stage passes again
 fs.writeFileSync(path.join(dir,"log.md"),"live journal\nchanged after freeze\n")
 fs.writeFileSync(path.join(tree,"doc/tasks/001-foreign/log.md"),"live journal\nchanged after freeze\n")
 git(tree,"add","--","doc/tasks/001-foreign/log.md");git(tree,"commit","-qm","shift documents after the freeze")
 const shifted=git(tree,"rev-parse","HEAD")
 assert.notEqual(shifted,source)
 assert.throws(()=>snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate,source,target:"main"}),/changed after the candidate was frozen/)
 const r2=snapshotTaskDocuments(file,t,{target:"main"})
 assert.equal(r2.frozen,shifted)
 snapshotTaskDocuments(file,t,{freeze:false,stage:true,candidate,source:shifted,target:"main"})
 // without a candidate the check falls back to the task branch, as before
 snapshotTaskDocuments(file,t,{freeze:false,stage:true,target:"main"})
 // the single-repository scenario keeps its semantics: the candidate itself must carry the frozen documents
 const t1={n:1,directory:repo,branch:"task/001-foreign",worktree:tree,folder:"doc/tasks/001-foreign"}
 snapshotTaskDocuments(file,t1,{freeze:false,stage:true,candidate:shifted,target:"main"})
 const mainTip=git(repo,"rev-parse","main")
 assert.throws(()=>snapshotTaskDocuments(file,t1,{freeze:false,stage:true,candidate:mainTip,target:"main"}),/changed after the candidate was frozen/)
 console.log("Foreign snapshot: documents checked against the pinned frozen commit in the managing repository, the candidate by its SHA in the bound target repository, both snapshots linked, joint shift blocked, no substitution, single-repository semantics preserved: green")
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
