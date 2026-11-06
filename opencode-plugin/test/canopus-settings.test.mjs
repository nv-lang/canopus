import assert from "node:assert/strict"
import {execFileSync} from "node:child_process"
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync,existsSync} from "node:fs"
import os from "node:os"
import path from "node:path"
const tmp=mkdtempSync(path.join(os.tmpdir(),"canopus-contract-"))
process.env.XDG_DATA_HOME=path.join(tmp,"host")
const selected=await (await import("./test-home.mjs")).configureTestHome(path.join(tmp,"instance"))
const {setFixtureRuntime}=await import("./fixture-settings.mjs")
await setFixtureRuntime("SETTINGS_TTL_MS","1")
const git=(cwd,...args)=>execFileSync("git",["-C",cwd,"-c","user.name=Fixture","-c","user.email=fixture@example.com",...args],{encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"]}).trim()
const json=(file,value)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value,null,2))}
const SF=".canopus/plugin/config.json"
const repo=(folder,values)=>{mkdirSync(folder,{recursive:true});git(folder,"init","-qb","main");json(path.join(folder,SF),values);git(folder,"add","--",SF);git(folder,"commit","-qm","fixture")}
const global=(value)=>json(selected.file,value)
const settings=await import("../settings.ts"),core=await import("../core.ts")
// Real committed public settings, layers, accepted branch and failure recovery.
try {
 const root=path.join(tmp,"nova"),tree=path.join(tmp,"nova-task")
 repo(root,{spawn_limits:{worker:2},inflight_limit:3,tasks_dir:"docs/tasks"})
 git(root,"remote","add","origin","https://example.invalid/old-project-name.git")
 global({project_settings:[root],defaults:{machine_slots:4},local:{nova:{owner_language:"en"}}})
 const projects=core.parseProjects({project_settings:[root]});core.setProjects(projects,{})
 assert.equal(projects[0].name,"nova");assert.equal(projects[0].root,settings.normPath(root))
 json(path.join(root,SF),{inflight_limit:9})
 assert.equal(settings.rawSettingsFor(root,projects).inflight_limit,3,"uncommitted project edit never applies")
 assert.equal(core.loadConfig(root).spawnLimits.worker,2)
 assert.equal(settings.rawSettingsFor(root,projects).machine_slots,4)
 assert.equal(settings.rawSettingsFor(root,projects).owner_language,"en")
 git(root,"worktree","add","-qb","task/fixture",tree)
 json(path.join(tree,SF),{inflight_limit:8});git(tree,"commit","-qm","task branch settings","--",SF)
 assert.equal(settings.rawSettingsFor(tree,projects).inflight_limit,3,"task branch does not replace accepted settings")
 json(path.join(root,".canopus/plugin/local.json"),{inflight_limit:5})
 assert.equal(settings.rawSettingsFor(tree,projects).inflight_limit,5,"personal main folder layer wins")
 rmSync(path.join(root,".canopus/plugin/local.json"))
 git(root,"commit","-qm","accepted update","--",SF)
 settings.readSettingsFolder(root,Date.now()+60000)
 assert.equal(settings.rawSettingsFor(root,projects).inflight_limit,9)
 const good=settings.readSettingsFolder(root,Date.now()+120000)
 renameSync(path.join(root,".git"),path.join(root,".git-off"))
 const failed=settings.readSettingsFolder(root,Date.now()+180000)
 renameSync(path.join(root,".git-off"),path.join(root,".git"))
 assert.deepEqual(failed.raw,good.raw,"temporary Git failure preserves last accepted settings")
 assert.throws(()=>core.parseProjects({projects:[root]}),/projects.*removed/)
 assert.throws(()=>core.parseProjects({projects:{nova:root}}),/projects.*removed/)
 for(const key of ["project","root","branch","project_rules","spawn_models"]){
  const bad=path.join(tmp,"bad-"+key);repo(bad,{[key]:key==="spawn_models"?{light:"fixture/model"}:"removed"})
  assert.throws(()=>settings.readSettingsFolder(bad),new RegExp(key),"removed key fails at real committed reader")
 }
 const retired=path.join(tmp,"retired");mkdirSync(retired);git(retired,"init","-qb","main");json(path.join(retired,".opencode/opencode-peers.json"),{inflight_limit:777});git(retired,"add","--",".opencode/opencode-peers.json");git(retired,"commit","-qm","retired fixture")
 const old=settings.readSettingsFolder(retired);assert.deepEqual(old.raw,{});assert.ok(old.project.problems.length)
 console.log("settings contract: real public files, accepted branch, layer precedence, canonical identity, fail-closed removed inputs and Git recovery OK")
} finally {rmSync(tmp,{recursive:true,force:true})}
