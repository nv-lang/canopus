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
// Global discovery is file-owned. Registration accepts only the selected path.
try {
 const a=path.join(tmp,"alpha"),b=path.join(tmp,"beta"),virtual=path.join(tmp,"virtual")
 repo(a,{inflight_limit:2});repo(b,{inflight_limit:3});mkdirSync(virtual)
 global({project_settings:[a,{project:"virtual",root:virtual}],defaults:{owner_language:"ru"},local:{virtual:{inflight_limit:7}}})
 const config=await import("../plugin-config.ts"),ctx=await import("../config-context.ts")
 assert.deepEqual(config.pluginOptions({config:selected.file}).project_settings,[a,{project:"virtual",root:virtual}])
 for(const options of [{projects:[a]},{project_settings:[a]},{local:{}},{config:selected.file,projects:[a]}]) assert.throws(()=>config.pluginOptions(options),/registration.*unsupported/)
 for(const options of [{projects:[a]},{projects:{alpha:a}},{project_settings:[a],projects:[b]}]) assert.throws(()=>settings.parseProjects(options),/projects.*removed/)
 assert.throws(()=>settings.parseProjects({project_settings:{alpha:a}}),/expected an array/)
 assert.throws(()=>settings.parseProjects({project_settings:[{project:"virtual",root:"relative"}]}),/absolute path/)
 const projects=settings.parseProjects(config.globalConfig());core.setProjects(projects,{})
 assert.deepEqual(projects.map(p=>p.name).sort(),["alpha","virtual"])
 assert.equal(core.projectOf(path.join(virtual,"nested"),projects),"virtual")
 assert.equal(settings.rawSettingsFor(virtual,projects).inflight_limit,7)
 assert.equal(settings.rawSettingsFor(a,projects).owner_language,"ru")
 core.saveProjects(config.globalConfig());const loaded=core.loadProjects()
 assert.deepEqual(loaded.map(p=>p.name).sort(),["alpha","virtual"],"MCP mailbox reads the same config-owned discovery")
 assert.equal(ctx.pluginConfigContext().file,selected.file)
 global({project_settings:[a],local:{alpha:{spawn_models:{light:"fixture/model"}}}})
 assert.throws(()=>config.globalConfig(),/spawn_models/)
 global({projects:[a]});assert.throws(()=>config.globalConfig(),/unsupported key projects/)
 console.log("project_settings contract: config path only, real global discovery/virtual mapping, MCP parity and rejected aliases/internal settings OK")
} finally {rmSync(tmp,{recursive:true,force:true})}
