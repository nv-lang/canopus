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
 // Worktree paths use the same public layers as other project settings.
 const pathsRepo=settings.canon(path.join(tmp,"paths-project"))
 repo(pathsRepo,{worktrees:"../project-trees"})
 global({project_settings:[pathsRepo],defaults:{worktrees:"../global-trees"}})
 const pathProjects=core.parseProjects({project_settings:[pathsRepo]});core.setProjects(pathProjects,{})
 assert.equal(core.loadConfig(pathsRepo).worktrees,path.resolve(pathsRepo,"../project-trees"))
 const absolute=path.join(tmp,"absolute-trees")
 settings.writeSettings(pathsRepo,{worktrees:absolute})
 const selected=core.loadConfig(pathsRepo)
 assert.equal(selected.worktrees,absolute,"personal absolute path overrides accepted relative path")
 assert.equal(path.dirname(core.taskPlace(pathsRepo,selected,7,"fixture","paths-project").worktree),absolute,"task placement uses the configured directory")
 settings.writeSettings(pathsRepo,{worktrees:""})
 assert.equal(core.loadConfig(pathsRepo).worktrees,undefined,"explicit empty path retains existing no-directory behavior")
 settings.writeSettings(pathsRepo,{worktrees:"../project-trees"})
 for(const value of [false,42,null,{},"bad\0path"])assert.throws(()=>settings.writeSettings(pathsRepo,{worktrees:value}),/worktrees/)
 const second=settings.canon(path.join(tmp,"second-project"));repo(second,{worktrees:"../second-trees"})
 const both=core.parseProjects({project_settings:[pathsRepo,second]});core.setProjects(both,{})
 assert.equal(core.loadConfig(second).worktrees,path.resolve(second,"../second-trees"))
 assert.equal(core.loadConfig(pathsRepo).worktrees,path.resolve(pathsRepo,"../project-trees"),"another project does not change this path")
 const root=path.join(tmp,"nova"),tree=path.join(tmp,"nova-task")
 repo(root,{spawn_limits:{worker:2},inflight_limit:3,tasks_dir:"docs/tasks"})
 git(root,"remote","add","origin","https://example.invalid/old-project-name.git")
 global({project_settings:[root],defaults:{machine_slots:4,owner_language:"en"}})
 const projects=core.parseProjects({project_settings:[root]});core.setProjects(projects,{})
 assert.equal(projects[0].name,"nova");assert.equal(projects[0].root,settings.normPath(root))
 settings.writeSettings(root,{inflight_limit:9})
 assert.equal(settings.rawSettingsFor(root,projects).inflight_limit,9,"uncommitted project edit applies immediately")
 assert.equal(core.loadConfig(root).spawnLimits.worker,2)
 assert.equal(settings.rawSettingsFor(root,projects).machine_slots,4)
 assert.equal(settings.rawSettingsFor(root,projects).owner_language,"en")
 git(root,"worktree","add","-qb","task/fixture",tree)
 json(path.join(tree,SF),{inflight_limit:8});git(tree,"commit","-qm","task branch settings","--",SF)
 assert.equal(settings.rawSettingsFor(tree,projects).inflight_limit,9,"task branch does not replace primary working settings")
 settings.writeSettings(root,{inflight_limit:5})
 assert.equal(settings.rawSettingsFor(tree,projects).inflight_limit,5,"personal main folder layer wins")
 settings.writeSettings(root,{inflight_limit:9})
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
 const old=settings.readSettingsFolder(retired);assert.deepEqual(old.raw,{});assert.ok(!old.project.problems.some(p=>p.includes("не закоммичен")))
 // An old persisted fallback must not abort diagnostics or become accepted settings.
 const stale=settings.canon(path.join(tmp,"stale-cache"));mkdirSync(stale);git(stale,"init","-qb","main")
 writeFileSync(path.join(stale,"README.md"),"fixture");git(stale,"add","--","README.md");git(stale,"commit","-qm","fixture")
 const staleFile=path.join(core.BASE,"settings-good",`${core.safeKey(stale)}.json`)
 const staleValue={project:{name:"stale-cache",root:stale,problems:[]},raw:{worktrees:false,inflight_limit:77}}
 json(staleFile,staleValue)
 const before=readFileSync(staleFile,"utf8")
 const diagnosed=settings.readSettingsFolder(stale,Date.now()+240000)
 assert.deepEqual(diagnosed.raw,{},"retired cache never supplies public or removed values")
 assert.ok(!diagnosed.project.problems.some(p=>p.includes("кеш")),"retired cache is not a configuration source")
 assert.equal(readFileSync(staleFile,"utf8"),before,"owner fallback evidence remains byte-for-byte intact")
 const virtual=[{name:"stale-cache",root:settings.normPath(stale),rootPath:stale}]
 assert.ok(!settings.settingsProblems(virtual).some(p=>p.includes("кеш")),"doctor does not depend on retired cached configuration")

 json(path.join(stale,SF),{inflight_limit:6});git(stale,"add","--",SF);git(stale,"commit","-qm","explicit transition")
 const recovered=settings.readSettingsFolder(stale,Date.now()+300000)
 assert.equal(recovered.raw.inflight_limit,6);assert.deepEqual(recovered.project.problems,[])
 console.log("settings contract: real public files, accepted branch, layer precedence, canonical identity, fail-closed removed inputs and Git recovery OK")
} finally {rmSync(tmp,{recursive:true,force:true})}
