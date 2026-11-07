#!/usr/bin/env python3
"""288: explicit, checksum-verified task migration. Dry run unless --apply.
Never executes task actions, replays answers, changes statuses, or overwrites conflicts.
"""
import argparse, datetime, hashlib, json, os, pathlib, shutil, subprocess, re
P=pathlib.Path
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):return json.loads(P(p).read_text(encoding="utf-8-sig"))
def dump(p,v):
 p=P(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding="utf-8")
def inside(root,p):
 root=P(root).resolve();p=P(p).resolve()
 if not p.is_relative_to(root):raise RuntimeError("Path leaves intended root: "+str(p))
 return p

def migrate(source,locations,home,report,apply=False):
 source=P(source).resolve();home=P(home).resolve();moves=[];conflicts=[];records=[];catalog={};watch_records=[]
 if not source.exists():
  previous=read(report)
  if not previous.get("verified") or not P(previous.get("retired","")).is_dir():raise RuntimeError("No verified migration receipt")
  for r in previous["records"]:
   t=read(r["target"])
   if t["project"]!=r["project"] or t["n"]!=r["n"]:raise RuntimeError("Migrated identity no longer matches")
  return {**previous,"alreadyMigrated":True}
 def stage(src,dest,kind):
  src=P(src).resolve();dest=P(dest).resolve();b=src.read_bytes();h=sha(b)
  if src==dest:return
  if dest.exists() and dest.read_bytes()!=b:
   # Keep the canonical document and preserve every divergent local version as an explicit source artifact.
   if kind=="state":raise RuntimeError("Conflicting task state: "+str(dest))
   dest=dest.parent/"imported-sources"/(sha(str(src).encode())[:12]+"-"+src.name)
   conflicts.append({"source":str(src),"preserved":str(dest),"reason":"canonical document differs; both versions retained"})
   if dest.exists() and dest.read_bytes()!=b:raise RuntimeError("Import collision: "+str(dest))
  moves.append({"source":str(src),"target":str(dest),"sha256":h,"kind":kind,"exists":dest.exists()})
 for project_dir in sorted(source.iterdir()):
  if not project_dir.is_dir():continue
  project=project_dir.name;loc=locations.get(project)
  if loc:
   root=P(loc["root"]).resolve();rel=loc.get("tasks_dir") or "doc/tasks";target=inside(root,root/rel);catalog[project]=str(root)
  else:target=home/"tasks"/project
  for f in sorted(project_dir.glob("*.json")):
   if not f.stem.isdigit():continue
   t=read(f);n=t["n"]
   declared=re.match(r"^(\d+)-",P(t.get("folder") or "").name)
   if declared and int(declared[1])!=n:raise RuntimeError("Recorded folder identity mismatch")
   if n!=int(f.stem) or t["project"]!=project:raise RuntimeError("Source identity mismatch: "+str(f))
   matches=[d for d in target.glob(str(n).zfill(3)+"-*") if d.is_dir()]
   if len(matches)>1:
    declared=P(t.get("folder") or "").name
    explicit=[d for d in matches if d.name==declared]
    if len(explicit)!=1:raise RuntimeError("Multiple canonical task folders without exact recorded folder for "+project+"/"+str(n))
    matches=explicit
   slug=t.get("slug") or "task"
   if "/" in slug or "\\" in slug or slug in [".",".."]:raise RuntimeError("Unsafe slug")
   folder=matches[0] if matches else target/(str(n).zfill(3)+"-"+slug)
   folder=inside(target,folder)
   stage(f,inside(folder,folder/"task"/"state.json"),"state")
   watch=source.parent/"idle-watch"/project/(str(n)+".json")
   if watch.exists():
    data=read(watch)
    if data.get("project")!=project or data.get("n")!=n:raise RuntimeError("Watch identity mismatch")
    dest=inside(folder,folder/"task/watch.json");stage(watch,dest,"state")
    watch_records.append({"source":str(watch),"target":str(dest),"sha256":sha(watch.read_bytes()),"hasHold":bool(data.get("hold"))})
   # Main documentation is authoritative. Preserve local versions from every still-existing task/session tree.
   roots=[loc["root"]] if loc else []
   roots += [t.get("worktree"), *[s.get("worktree") for s in t.get("sessions",[])], *[s.get("worktree") for s in t.get("side",[])]]
   for tree in dict.fromkeys(str(r) for r in roots if r):
    rel=t.get("folder") or str(P(loc.get("tasks_dir") or "doc/tasks")/folder.name) if loc else t.get("folder")
    if not rel:continue
    src=inside(tree,P(tree)/rel)
    if not src.exists():continue
    for doc in sorted(src.rglob("*")):
     if doc.is_symlink():raise RuntimeError("Symlink in task documents: "+str(doc))
     if doc.is_file() and doc.name!="state.json" and "imported-sources" not in doc.parts:stage(doc,inside(folder,folder/doc.relative_to(src)),"document")
   records.append({"project":project,"n":n,"status":t["status"],"source":str(f),"target":str(folder/"task"/"state.json"),"sha256":sha(f.read_bytes())})
  legacy=project_dir/"legacy"
  if legacy.exists():
   for f in legacy.rglob("*"):
    if f.is_file():stage(f,inside(target,target/"legacy"/f.relative_to(legacy)),"legacy")
 # Coalesce identical writes and refuse incompatible write plans.
 unique={}
 for m in moves:
  if m["target"] in unique and unique[m["target"]]["sha256"]!=m["sha256"]:raise RuntimeError("Planned target collision: "+m["target"])
  unique[m["target"]]=m
 moves=list(unique.values())
 result={"at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"apply":apply,"records":records,"moves":moves,"conflicts":conflicts,"catalog":catalog,"watchRecords":watch_records}
 dump(report,result)
 if not apply:return result
 stamp=datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f");backup=home/"backups"/("task-storage-"+stamp);backup.mkdir(parents=True,exist_ok=False)
 locks=[]
 barrier=home/"state"/"task-storage-migration.lock";barrier.parent.mkdir(parents=True,exist_ok=True)
 with barrier.open("x",encoding="utf8") as f:json.dump({"pid":os.getpid(),"operation":"288 task storage migration"},f)
 try:
  for root in sorted({str(P(r["target"]).parent.parent.parent) for r in records}):
   lock=P(root)/".task-store.lock";lock.parent.mkdir(parents=True,exist_ok=True);lock.mkdir();locks.append(lock)
   if list(P(root).glob(".task-store.claim-*.json")):raise RuntimeError("Task writers must drain before migration")
  # Preserve the whole original store, including legacy files and metadata, before any target writes.
  shutil.copytree(source,backup/"original-tasks")
  old_watch=source.parent/"idle-watch"
  if old_watch.exists():shutil.copytree(old_watch,backup/"original-watch")
  dump(backup/"manifest.json",result)
  (backup/"sources").mkdir()
  # Local state and source variants must survive Git branch changes and must not be published.
  for project,loc in locations.items():
   root=P(loc["root"]).resolve()
   if not (root/".git").exists():continue
   relative=subprocess.check_output(["git","-C",str(root),"rev-parse","--git-path","info/exclude"],text=True).strip()
   exclude=(root/relative).resolve()
   original=exclude.read_bytes() if exclude.exists() else b""
   saved=backup/("git-exclude-"+sha(str(exclude).encode())+".original");saved.write_bytes(original)
   rel=(loc.get("tasks_dir") or "doc/tasks").replace("\\","/").strip("/")
   patterns=["/"+rel+"/**/task/state.json", "/"+rel+"/**/task/watch.json", "/"+rel+"/**/task/snapshot.json", "/"+rel+"/**/task/tests-run.json","/"+rel+"/.task-store.lock/", "/"+rel+"/.task-store.claim-*","/"+rel+"/**/imported-sources/","/"+rel+"/legacy/"]
   text=original.decode("utf8");missing=[p for p in patterns if p not in text.splitlines()]
   if missing:exclude.parent.mkdir(parents=True,exist_ok=True);exclude.write_text(text+("" if text.endswith("\n") else "\n")+"\n".join(missing)+"\n",encoding="utf8")
  for m in moves:
   src=P(m["source"]);dest=P(m["target"])
   if sha(src.read_bytes())!=m["sha256"]:raise RuntimeError("Source changed during migration: "+str(src))
   b=src.read_bytes();saved=backup/"sources"/sha(str(src).encode());saved.write_bytes(b)
   if sha(saved.read_bytes())!=m["sha256"]:raise RuntimeError("Backup verification failed")
   if dest.exists():
    if dest.read_bytes()!=b:raise RuntimeError("Target changed: "+str(dest))
   else:
    dest.parent.mkdir(parents=True,exist_ok=True);tmp=dest.with_name(dest.name+".migration.tmp")
    with tmp.open("xb") as stream:stream.write(b)
    os.replace(tmp,dest)
   if sha(dest.read_bytes())!=m["sha256"]:raise RuntimeError("Target verification failed")
  cat=home/"state"/"task-projects.json";old=read(cat) if cat.exists() else {}
  for k,v in catalog.items():
   if k in old and P(old[k]).resolve()!=P(v).resolve():raise RuntimeError("Catalog conflict")
  if cat.exists():shutil.copy2(cat,backup/"task-projects-before.json")
  tmp=cat.with_suffix(".migration.tmp");dump(tmp,{**old,**catalog});os.replace(tmp,cat)
  # Only the old runtime store is retired; versioned documentation in branches remains a historical snapshot.
  for r in records:
   if sha(P(r["source"]).read_bytes())!=r["sha256"] or sha(P(r["target"]).read_bytes())!=r["sha256"]:raise RuntimeError("Final verification failed")
  for item in moves:
   if sha(P(item["source"]).read_bytes())!=item["sha256"] or sha(P(item["target"]).read_bytes())!=item["sha256"]:raise RuntimeError("Final source verification failed")
  for item in watch_records:
   old=P(item["source"]);dest=backup/"retired-watch"/old.parent.name/old.name;dest.parent.mkdir(parents=True,exist_ok=True);os.replace(old,dest)
  archived=backup/"retired-tasks";os.replace(source,archived)
  result.update({"backup":str(backup),"retired":str(archived),"verified":len(records)})
  dump(report,result);dump(backup/"result.json",result)
 finally:
  for lock in reversed(locks):lock.rmdir()
  barrier.unlink()
 return result
if __name__=="__main__":
 a=argparse.ArgumentParser();a.add_argument("--source",required=True);a.add_argument("--locations",required=True);a.add_argument("--home",required=True);a.add_argument("--report",required=True);a.add_argument("--apply",action="store_true");v=a.parse_args()
 r=migrate(v.source,read(v.locations),v.home,v.report,v.apply);print(json.dumps({"records":len(r["records"]),"files":len(r["moves"]),"preservedVariants":len(r["conflicts"]),"apply":v.apply,"report":v.report}))
