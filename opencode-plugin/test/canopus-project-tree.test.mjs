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
// Linked trees retain ordinary repository identity and the main settings folder.
try {
 const root=path.join(tmp,"alpha"),tree=path.join(tmp,"tree"),foreign=path.join(tmp,"foreign"),virtual=path.join(tmp,"virtual")
 const prof=model=>({model,context:220000,output:64000})
 const profiles={claude:{heavy:prof("claude-code/opus"),medium:prof("claude-code/sonnet"),light:prof("claude-code/haiku")}}
 const sets={default:{develop:{family:"claude",tier:"task"},accept:{family:"claude",tier:"task"}}}
 repo(root,{model_profiles:profiles,profile_sets:sets,inflight_limit:2});repo(foreign,{})
 git(root,"remote","add","origin","https://example.invalid/retired-name.git")
 git(root,"worktree","add","-qb","task/fixture",tree)
 json(path.join(tree,SF),{model_profiles:profiles,profile_sets:sets,inflight_limit:9});git(tree,"commit","-qm","branch copy","--",SF)
 mkdirSync(virtual);global({project_settings:[root,{project:"virtual",root:virtual}],local:{virtual:{inflight_limit:7}}})
 const projects=settings.parseProjects({project_settings:[root,{project:"virtual",root:virtual}]});core.setProjects(projects,{})
 const L=await import("../profile-layer.ts"),Cmd=await import("../profile-cmd.ts")
 assert.equal(core.projectOf(tree,projects),"alpha");assert.equal(settings.normPath(settings.mainTreeOf(tree)),settings.normPath(root))
 const st=L.profileState(tree);assert.equal(st.project,"alpha");assert.equal(settings.normPath(st.folder),settings.normPath(root))
 assert.equal(st.raw.inflight_limit,2,"linked tree reads accepted main settings")
 assert.equal(L.profileState(path.join(tmp,"elsewhere"),"alpha").project,"alpha","card identity resolves outside project root")
 const before=readFileSync(path.join(tree,SF),"utf8"),mainBefore=readFileSync(path.join(root,SF),"utf8")
 const response=await Cmd.runSetsCommand(tree,"use default",{version:"2.2.5",catalog:async()=>Object.values(profiles.claude).map(p=>({providerID:p.model.split("/")[0],modelID:p.model.split("/")[1]}))})
 assert.match(response,/Набор «default» включён/)
 assert.equal(JSON.parse(readFileSync(path.join(root,".canopus/plugin/local.json"),"utf8")).profile_set,"default","personal selection writes main folder local layer")
 assert.equal(readFileSync(path.join(root,SF),"utf8"),mainBefore,"personal selection leaves committed shared catalog unchanged")
 assert.equal(readFileSync(path.join(tree,SF),"utf8"),before,"branch copy is never a settings write target")
 assert.equal(L.profileState(tree).name,"default")
 const other=L.profileState(path.join(tmp,"outside-no-repository"));assert.equal(L.writeDraft(other,L.draftOf(other)).ok,false,"a path outside every repository and configured project is not writable")
 assert.equal(core.projectOf(path.join(virtual,"nested"),projects),"virtual")
 assert.equal(settings.rawSettingsFor(virtual,projects).inflight_limit,7,"global virtual mapping uses explicit public local override")
 console.log("project tree contract: canonical main identity, accepted file, card lookup, personal profile selection, branch isolation and global virtual layers OK")
} finally {rmSync(tmp,{recursive:true,force:true})}
