"""289: explicit two-level transition, with exact effective-value checks and reversible writes."""
import argparse,copy,datetime,hashlib,json,os,subprocess,tempfile
from pathlib import Path

MISSING=object()
def equal(a,b):return json.dumps(a,sort_keys=True,ensure_ascii=False)==json.dumps(b,sort_keys=True,ensure_ascii=False)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def encode(obj):return (json.dumps(obj,ensure_ascii=False,indent=2)+"\n").encode("utf8")
def read(file):
 raw=file.read_bytes() if file.exists() else None
 if raw is None:return None,{}
 value=json.loads(raw.decode("utf-8-sig"))
 if not isinstance(value,dict):raise ValueError("Configuration must be an object: "+str(file))
 return raw,value

def merge(base,over):
 if not isinstance(base,dict) or not isinstance(over,dict):return copy.deepcopy(over)
 out=copy.deepcopy(base)
 for k,v in over.items():
  if k in ("__proto__","prototype","constructor"):raise ValueError("Unsafe configuration key")
  out[k]=merge(out.get(k,{}),v)
 return out

def common(values):
 if not values:return {}
 out={}
 for k in set.intersection(*(set(v) for v in values)):
  items=[v[k] for v in values]
  if all(equal(items[0],x) for x in items):out[k]=copy.deepcopy(items[0])
  elif all(isinstance(x,dict) for x in items):
   nested=common(items)
   if nested:out[k]=nested
 return dict(sorted(out.items()))

def difference(value,base):
 out={}
 for k,v in value.items():
  if k in base and equal(v,base[k]):continue
  if isinstance(v,dict) and isinstance(base.get(k),dict):
   nested=difference(v,base[k])
   if nested or not v:out[k]=nested
  else:out[k]=copy.deepcopy(v)
 if not equal(merge(base,out),value):raise ValueError("Cannot preserve an absent setting through global inheritance")
 return out

def git(root,*args):
 try:return subprocess.check_output(['git','-C',str(root),*args],stderr=subprocess.DEVNULL).decode('utf8').strip()
 except subprocess.CalledProcessError:return None

def main_root(root):
 root=Path(root).resolve();meta=git(root,'rev-parse','--git-common-dir')
 if meta and Path(meta).name.lower()=='.git':return (root/meta).resolve().parent
 return root

def accepted(root):
 branch=git(root,'symbolic-ref','--short','refs/remotes/origin/HEAD')
 branch=branch.removeprefix('origin/') if branch else ('main' if git(root,'show-ref','--verify','refs/heads/main') else 'master')
 text=git(root,'show',branch+':.canopus/plugin/config.json')
 return json.loads(text) if text is not None else {}

def atomic(file,raw):
 file.parent.mkdir(parents=True,exist_ok=True)
 fd,name=tempfile.mkstemp(prefix=file.name+'.',suffix='.tmp',dir=file.parent)
 try:
  with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
  os.replace(name,file)
 finally:
  if os.path.exists(name):os.unlink(name)

def prepare(config,plugin_config,catalog=None,extra_roots=()):
 config=Path(config).resolve();plugin_config=Path(plugin_config).resolve();home=config.parent
 files={};blockers=[]
 def source(file):
  file=Path(file);raw,value=read(file);files[str(file)]={'file':file,'before':raw,'value':value};return value
 app=source(config);global_=source(plugin_config)
 roots={}
 for entry in global_.get('project_settings',[]):
  root=main_root(entry if isinstance(entry,str) else entry['root']);roots[str(root).lower()]={'root':root,'project':root.name.lower() if isinstance(entry,str) else entry['project'],'ordinary':isinstance(entry,str)}
 catalog=Path(catalog) if catalog else home/'state/task-projects.json'
 mapping=read(catalog)[1] if catalog.exists() else {}
 for root in [*mapping.values(),*extra_roots]:
  root=main_root(root);roots.setdefault(str(root).lower(),{'root':root,'project':root.name.lower(),'ordinary':False})
 if not roots:raise ValueError('No project roots found; provide the project catalog or --root')
 for item in roots.values():
  root=item['root'];item['working']=source(root/'.canopus/plugin/config.json');item['personal']=source(root/'.canopus/plugin/local.json');item['app']=source(root/'.canopus/config.json');item['app_personal']=source(root/'.canopus/local.json')
 old_layers='local' in global_ or any(f['before'] is not None and f['file'].name=='local.json' for f in files.values())
 for item in roots.values():
  root=item['root'];working=item['working'];base=(accepted(root) if (root/'.git').exists() else {}) if old_layers else working
  # Existing profile commands already read these three keys from the primary working copy.
  if item['ordinary'] and files[str(root/'.canopus/plugin/config.json')]['before'] is not None:
   for key in ('model_profiles','profile_sets','profile_set'):
    if key in working:base[key]=copy.deepcopy(working[key])
    else:base.pop(key,None)
  local=global_.get('local',{}).get(item['project'],{})
  item['before']=merge(merge(merge(global_.get('defaults',{}),base),local),item['personal'])
  from_working=merge(merge(merge(global_.get('defaults',{}),working),local),item['personal'])
  if old_layers and files[str(root/'.canopus/plugin/config.json')]['before'] is not None and not equal(item['before'],from_working):blockers.append(str(root)+': inactive working changes conflict with effective settings; originals preserved')
  item['app_before']=merge(merge(app,item['app']),item['app_personal'])
 new_global=copy.deepcopy(global_);new_global.pop('local',None)
 shared=common([x['before'] for x in roots.values()]);new_defaults=merge(global_.get('defaults',{}),shared)
 if new_defaults or 'defaults' in global_:new_global['defaults']=new_defaults
 changes=[]
 def destination(file,value):
  entry=files[str(file)];raw=None if value is MISSING else encode(value)
  # Preserve byte formatting when no semantic edit is needed.
  if raw is not None and entry['before'] is not None and equal(entry['value'],value):raw=entry['before']
  if entry['before'] is None and value is not MISSING and not value:return
  if entry['before']!=raw:changes.append({**entry,'after':raw})
 destination(plugin_config,new_global)
 for item in roots.values():
  root=item['root'];project=difference(item['before'],new_defaults);app_project=difference(item['app_before'],app)
  if not equal(merge(new_defaults,project),item['before']) or not equal(merge(app,app_project),item['app_before']):raise ValueError('Effective configuration changed')
  destination(root/'.canopus/plugin/config.json',project);destination(root/'.canopus/config.json',app_project)
  destination(root/'.canopus/plugin/local.json',MISSING);destination(root/'.canopus/local.json',MISSING)
 active_names={x['project'] for x in roots.values()}
 for c in changes:
  if Path(str(c['file'])+'.lock').exists():blockers.append(str(c['file'])+': another configuration writer is active')
 report={'projects':len(roots),'files':[{'file':str(c['file']),'operation':'remove' if c['after'] is None else 'write','before':digest(c['before']) if c['before'] is not None else None,'after':digest(c['after']) if c['after'] is not None else None} for c in changes],'inactiveLocal':sorted(set(global_.get('local',{}))-active_names),'blockers':blockers,'equivalent':not blockers,'effective':[{'root':str(x['root']),'project':x['project'],'plugin':digest(encode(x['before'])),'application':digest(encode(x['app_before']))} for x in roots.values()]}
 return report,changes,files,home

def migrate(config,plugin_config,report_file,apply=False,catalog=None,extra_roots=()):
 report,changes,files,home=prepare(config,plugin_config,catalog,extra_roots)
 if apply and report['blockers']:raise ValueError('Configuration transition blocked; resolve the preview conflicts')
 if apply and not changes:
  report['alreadyApplied']=True
  atomic(Path(report_file),encode(report));return report
 if apply:
  backup=home/'backups'/('two-level-config-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'));backup.mkdir(parents=True,exist_ok=False)
  for i,entry in enumerate(files.values()):
   if entry['before'] is not None:
    target=backup/(str(i)+'.original');target.write_bytes(entry['before']);assert target.read_bytes()==entry['before']
  manifest=[{'file':str(v['file']),'backup':str(i)+'.original' if v['before'] is not None else None,'sha256':digest(v['before']) if v['before'] is not None else None} for i,v in enumerate(files.values())]
  atomic(backup/'manifest.json',encode(manifest));written=[]
  try:
   for entry in files.values():
    now=entry['file'].read_bytes() if entry['file'].exists() else None
    if now!=entry['before']:raise ValueError('Source changed during transition: '+str(entry['file']))
   for change in changes:
    file=change['file'];now=file.read_bytes() if file.exists() else None
    if now!=change['before']:raise ValueError('Concurrent configuration edit detected')
    if change['after'] is None:file.unlink()
    else:atomic(file,change['after'])
    written.append(change)
   for change in written:
    now=change['file'].read_bytes() if change['file'].exists() else None
    if now!=change['after']:raise ValueError('Post-write verification failed')
  except Exception:
   conflicts=[]
   for change in reversed(written):
    file=change['file'];now=file.read_bytes() if file.exists() else None
    if now!=change['after']:conflicts.append(str(file));continue
    if change['before'] is None:file.unlink()
    else:atomic(file,change['before'])
   atomic(backup/'rollback.json',encode({'conflicts':conflicts}));raise
  report['backup']=str(backup);report['applied']=True
  atomic(backup/'result.json',encode(report))
 atomic(Path(report_file),encode(report));return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--plugin-config',required=True);parser.add_argument('--report',required=True);parser.add_argument('--catalog');parser.add_argument('--root',action='append',default=[]);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 try:
  result=migrate(args.config,args.plugin_config,args.report,args.apply,args.catalog,args.root)
  print(json.dumps({'projects':result['projects'],'changes':len(result['files']),'blockers':len(result['blockers']),'apply':args.apply,'report':args.report}))
 except (ValueError,OSError,AssertionError):
  raise SystemExit('Configuration transition failed; source/backup retained. Inspect the preview and resolve conflicts before retrying.')
