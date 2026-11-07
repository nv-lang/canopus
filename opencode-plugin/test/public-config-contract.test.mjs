// Real two-level public configuration contract, without fixture adapters.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {initializePluginConfig} from "../config-context.ts"
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"canopus-public-two-level-")),config=path.join(tmp,"plugin/config.json")
const put=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value))}
const git=(dir,...args)=>execFileSync("git",["-C",dir,"-c","user.name=Fixture","-c","user.email=fixture@example.org",...args],{encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"]}).trim()
initializePluginConfig({config});put(config,{})
try{
 const core=await import("../core.ts"),settings=await import("../settings.ts"),cfg=await import("../plugin-config.ts"),layer=await import("../profile-layer.ts")
 const {SCHEMA_KEYS,invalid}=await import("../config-schema.ts")
 const previousOverride=process.env.OPENCODE_CANOPUS_PROJECTS
 try{process.env.OPENCODE_CANOPUS_PROJECTS="[]";assert.throws(()=>core.loadProjects(),/OPENCODE_CANOPUS_PROJECTS/)}finally{if(previousOverride===undefined)delete process.env.OPENCODE_CANOPUS_PROJECTS;else process.env.OPENCODE_CANOPUS_PROJECTS=previousOverride}
 put(path.join(core.BASE,"projects.json"),{projects:{stale:tmp}});assert.deepEqual(core.loadProjects(),[])
 assert.equal(SCHEMA_KEYS.length,11);assert.ok(invalid("merge_precheck","off"))
 put(config,{local:{sample:{inflight_limit:99}}});assert.throws(()=>cfg.globalConfig(),/unsupported key local/)
 put(config,{defaults:{merge_precheck:"off"}});assert.throws(()=>cfg.globalConfig(),/unsupported setting merge_precheck/)
 put(config,{defaults:{inflight_limit:2,owner_language:"global",spawn_limits:{worker:1,reviewer:2}}})
 const repo=path.join(tmp,"sample"),tree=path.join(tmp,"executor"),file=path.join(repo,".canopus/plugin/config.json")
 fs.mkdirSync(repo);git(repo,"init","-q","-b","main");put(file,{inflight_limit:7,owner_language:"project",profile_set:"shared",spawn_limits:{worker:5}})
 git(repo,"add","--",".canopus/plugin/config.json");git(repo,"commit","-qm","configuration");git(repo,"worktree","add","-qb","task/test",tree)
 const projects=settings.parseProjects({project_settings:[repo]});core.setProjects(projects,{})
 assert.equal(core.loadConfig(repo).inflightLimit,7);assert.deepEqual(core.loadConfig(repo).spawnLimits,{worker:5,reviewer:2})
 const head=git(repo,"rev-parse","HEAD")
 settings.writeSettings(repo,{inflight_limit:9,owner_language:"changed"})
 assert.equal(core.loadConfig(repo).inflightLimit,9);assert.equal(core.loadConfig(tree).ownerLanguage,"changed");assert.equal(git(repo,"rev-parse","HEAD"),head)
 put(path.join(tree,".canopus/plugin/config.json"),{inflight_limit:999});assert.equal(core.loadConfig(tree).inflightLimit,9)
 const personal=path.join(repo,".canopus/plugin/local.json");put(personal,{inflight_limit:99});assert.throws(()=>core.loadConfig(repo),/local.json was removed/);fs.rmSync(personal)
 assert.throws(()=>core.setProjects(projects,{sample:{inflight_limit:99}}),/Programmatic project overrides/)
 cfg.writeProjectSettings(repo,{profile_set:false});assert.equal(layer.profileState(tree).name,undefined)
 assert.equal(JSON.parse(fs.readFileSync(file,"utf8")).profile_set,false);assert.ok(!fs.existsSync(personal))
 const before=fs.readFileSync(file);assert.throws(()=>cfg.writeProjectSettings(repo,{inflight_limit:4},Buffer.from("stale")),/changed concurrently/);assert.deepEqual(fs.readFileSync(file),before)
 fs.writeFileSync(file,"broken JSON");assert.throws(()=>core.loadConfig(repo),/invalid JSON/);assert.throws(()=>settings.writeSettings(repo,{inflight_limit:4}),/invalid JSON/);assert.equal(fs.readFileSync(file,"utf8"),"broken JSON")
 fs.writeFileSync(file,before)
 const nativeFs=(await import("node:fs")).default,{syncBuiltinESMExports}=await import("node:module"),rename=nativeFs.renameSync
 nativeFs.renameSync=(from,to)=>{if(to===file)throw Error("fixture rename failure");return rename(from,to)};syncBuiltinESMExports()
 try{assert.throws(()=>cfg.writeProjectSettings(repo,{inflight_limit:3}));assert.deepEqual(fs.readFileSync(file),before)}finally{nativeFs.renameSync=rename;syncBuiltinESMExports()}
 assert.ok(!fs.existsSync(file+".lock"))
 const write=nativeFs.writeFileSync
 nativeFs.writeFileSync=(name,...args)=>{const result=write(name,...args);if(String(name).startsWith(file+".")&&String(name).endsWith(".tmp"))write(file,JSON.stringify({...JSON.parse(before),owner_language:"external"}));return result};syncBuiltinESMExports()
 try{assert.throws(()=>cfg.writeProjectSettings(repo,{inflight_limit:3}),/changed concurrently/);const owner=JSON.parse(fs.readFileSync(file,"utf8"));assert.equal(owner.owner_language,"external");assert.equal(owner.inflight_limit,9)}finally{nativeFs.writeFileSync=write;syncBuiltinESMExports();write(file,before)}
 const virtual=path.join(tmp,"virtual");fs.mkdirSync(virtual);put(path.join(virtual,".canopus/plugin/config.json"),{inflight_limit:4})
 put(config,{project_settings:[{project:"virtual",root:virtual}],defaults:{inflight_limit:2}});core.setProjects(core.loadProjects(),{})
 assert.equal(core.loadConfig(virtual).inflightLimit,4);settings.writeSettings(virtual,{inflight_limit:6});assert.equal(core.loadConfig(virtual).inflightLimit,6);assert.ok(!("local" in cfg.globalConfig()))
 const trunk=path.join(tmp,"trunk-project");fs.mkdirSync(trunk);git(trunk,"init","-q","-b","trunk");put(path.join(trunk,".canopus/plugin/config.json"),{tasks_dir:""});git(trunk,"add","--",".canopus/plugin/config.json");git(trunk,"commit","-qm","trunk settings");git(trunk,"update-ref","refs/remotes/origin/trunk","HEAD");git(trunk,"symbolic-ref","refs/remotes/origin/HEAD","refs/remotes/origin/trunk");git(trunk,"checkout","-qb","task/work");core.setProjects(settings.parseProjects({project_settings:[trunk]}),{});assert.equal(core.loadConfig(trunk).targetBranch,"trunk");assert.equal(core.loadConfig(trunk).tasksDir,"")
 assert.throws(()=>settings.parseProjects({projects:[repo]}),/projects was removed/)
 console.log("Public contract: two levels, immediate working copy, worktree isolation, no private layers or cache fallback, safe atomic edits: green")
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
