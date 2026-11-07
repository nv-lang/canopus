// 288: versioned task documents are snapshots of the shared live directory.
// Called only inside the existing authorized contour/precheck/publication operations.
import fs from "node:fs"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {commitFiles} from "./task-numbers.ts"
type SnapshotTask={n:number;directory:string;branch?:string;worktree?:string;folder?:string;kind?:string}
const git=(dir:string,args:string[],input?:string|Buffer)=>execFileSync("git",["-C",dir,...args],{encoding:"utf8",input,windowsHide:true,stdio:["pipe","pipe","pipe"]}).trim()
const canonical=(p:string)=>fs.existsSync(p)?fs.realpathSync.native(p):path.resolve(p)
const maybe=(dir:string,args:string[])=>{try{return git(dir,args)}catch{return undefined}}
export function snapshotTaskDocuments(file:string,t:SnapshotTask,options:{stage?:boolean;freeze?:boolean;candidate?:string;target?:string}={}) {
 if(!t.branch||(!t.folder&&t.kind!=="application"))return {files:0}
 const common=maybe(t.directory,["rev-parse","--git-common-dir"])
 if(!common)return {files:0}
 const gitDir=canonical(path.resolve(t.directory,common)),main=path.dirname(gitDir)
 if(path.basename(gitDir).toLowerCase()!==".git")return {files:0}
 if(t.worktree&&fs.existsSync(t.worktree)){
  const other=maybe(t.worktree,["rev-parse","--git-common-dir"])
  if(!other||canonical(path.resolve(t.worktree,other)).toLowerCase()!==gitDir.toLowerCase())return {files:0} // foreign result repository: documents stay with their owner
 }
 if(!maybe(main,["rev-parse","--verify",t.branch]))return {files:0}
 const target=options.target??(maybe(main,["symbolic-ref","--short","refs/remotes/origin/HEAD"])?.replace(/^origin\//,"")??(maybe(main,["show-ref","--verify","--quiet","refs/heads/main"])!==undefined?"main":"master"))
 if(git(main,["branch","--show-current"])!==target)throw Error("The primary copy must stay on its accepted branch before preparing task documents")
 const folder=path.dirname(path.dirname(file)),prefix=t.folder??path.relative(main,folder).replace(/\\/g,"/")
 if(!prefix||path.isAbsolute(prefix)||prefix.split("/").includes(".."))return {files:0}
 const bodies:Record<string,Buffer>={}
 const walk=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.name.startsWith(".")||e.name==="imported-sources"||e.name==="legacy"||e.name.endsWith(".tmp"))continue
  const full=path.join(dir,e.name),rel=path.relative(folder,full).replace(/\\/g,"/")
  if(["task/state.json","task/watch.json","task/snapshot.json","task/tests-run.json"].includes(rel))continue
  if(e.isSymbolicLink())throw Error("Task documents contain a symbolic link")
  if(e.isDirectory())walk(full);else bodies[prefix+"/"+rel]=fs.readFileSync(full)
 }}
 walk(folder)
 const names=Object.keys(bodies)
 if(!names.length)return {files:0}
 const hashes=Object.fromEntries(names.map(n=>[n,git(main,["hash-object","--path",n,"--stdin"],bodies[n])]))
 const marker=path.join(folder,"task/snapshot.json"),previous=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,"utf8")):{}
 if(options.stage){
  for(const n of names){
   const staged=maybe(main,["rev-parse",":"+n]),head=maybe(main,["rev-parse","HEAD:"+n])
   if(staged!==head&&staged!==hashes[n]&&staged!==previous.staged?.[n])throw Error("Task document has an unrelated staged change; index was preserved")
  }
 }
 let commit:string|undefined
 if(options.freeze!==false&&names.some(n=>maybe(main,["rev-parse",t.branch+":"+n])!==hashes[n])){
  if(t.worktree&&fs.existsSync(t.worktree)){
   if(git(t.worktree,["branch","--show-current"])!==t.branch)throw Error("Task worktree is on another branch")
   for(const n of names){
    const f=path.join(t.worktree,n)
    if(fs.existsSync(f)){
     const actual=git(t.worktree,["hash-object","--path",n,"--stdin"],fs.readFileSync(f)),head=maybe(t.worktree,["rev-parse","HEAD:"+n])
     if(actual!==head&&actual!==hashes[n])throw Error("Task worktree has a different local document; both versions were preserved")
    }
   }
  }
  if(t.worktree&&fs.existsSync(t.worktree)){
   for(const n of names){
    const staged=maybe(t.worktree,["rev-parse",":"+n]),head=maybe(t.worktree,["rev-parse","HEAD:"+n])
    if(staged!==head&&staged!==hashes[n])throw Error("Task worktree has an unrelated staged document")
   }
   for(const n of names){const dest=path.join(t.worktree,n);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bodies[n])}
   git(t.worktree,["add","--",...names])
   git(t.worktree,["commit","-s","--only","-m",`${String(t.n).padStart(3,"0")} Snapshot shared task documents`,"--",...names])
   commit=git(t.worktree,["rev-parse","HEAD"])
  }else{
   const result=commitFiles(main,t.branch,t.branch,bodies,`${String(t.n).padStart(3,"0")} Snapshot shared task documents`)
   if(!result.ok)throw Error(result.error)
   commit=result.commit
  }
 }
 if(options.stage){
  for(const n of names){const rel=n.slice(prefix.length+1),current=fs.readFileSync(path.join(folder,rel));if(git(main,["hash-object","--path",n,"--stdin"],current)!==hashes[n])throw Error("Shared documents changed during snapshot; retry without discarding them")}
  const candidate=options.candidate??t.branch
  for(const n of names)if(maybe(main,["rev-parse",candidate+":"+n])!==hashes[n])throw Error("Shared documents changed after the candidate was frozen; repeat verification")
  // Staging exactly matching documents lets ff-only retain untracked live files. Other index entries stay unchanged.
  const physicallyHere=canonical(folder).toLowerCase()===canonical(path.resolve(main,prefix)).toLowerCase()
  if(physicallyHere)git(main,["add","--",...names])
  fs.mkdirSync(path.dirname(marker),{recursive:true});fs.writeFileSync(marker,JSON.stringify({branch:t.branch,staged:physicallyHere?hashes:{},commit},null,2))
 }
 return {files:names.length,commit}
}
