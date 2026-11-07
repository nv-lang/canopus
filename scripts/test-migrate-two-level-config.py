"""289 transition regression: all projects, absence, legacy layers, rollback and idempotence."""
import importlib.util,json,tempfile,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('migration',Path(__file__).with_name('migrate-two-level-config.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def put(file,value):file.parent.mkdir(parents=True,exist_ok=True);file.write_text(json.dumps(value),encoding='utf8')
def git(root,*args):subprocess.run(['git','-C',str(root),'-c','user.name=Fixture','-c','user.email=fixture@example.org',*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
with tempfile.TemporaryDirectory(prefix='two-level-migration-') as tmp:
 root=Path(tmp);home=root/'home';app=home/'config.json';plugin=home/'plugin/config.json';p=root/'project';q=root/'empty'
 for repo in (p,q):
  repo.mkdir();git(repo,'init','-q','-b','main');(repo/'README').write_text('fixture');git(repo,'add','--','README');git(repo,'commit','-qm','base')
 put(app,{'port':8099,'voice':{'language':'auto'},'agents':[{'id':'fixture'}]})
 put(p/'.canopus/plugin/config.json',{'inflight_limit':7,'profile_set':'shared'});git(p,'add','--','.canopus/plugin/config.json');git(p,'commit','-qm','settings')
 put(p/'.canopus/plugin/local.json',{'profile_set':'personal','spawn_limits':{'reviewer':0}})
 put(p/'.canopus/config.json',{'voice':{'model':'small'},'agents':[]});put(p/'.canopus/local.json',{'voice':{'language':'ru'}})
 put(plugin,{'project_settings':[str(p),str(q)],'local':{p.name:{'inflight_limit':9},'unused':{'inflight_limit':88}}})
 before={f:f.read_bytes() for f in [app,plugin,p/'.canopus/plugin/config.json',p/'.canopus/plugin/local.json',p/'.canopus/config.json',p/'.canopus/local.json']}
 report,changes,files,_=m.prepare(app,plugin)
 assert report['projects']==2 and report['equivalent'] and report['inactiveLocal']==['unused']
 assert all(f.read_bytes()==b for f,b in before.items())

 lock=Path(str(plugin)+'.lock');lock.write_text('another writer')
 blocked,_,_,_=m.prepare(app,plugin)
 assert blocked['blockers'] and not blocked['equivalent']
 try:
  try:m.migrate(app,plugin,root/'locked.json',True);assert False,'active writer must block application'
  except ValueError:pass
 finally:lock.unlink()
 assert all(f.read_bytes()==b for f,b in before.items()),'lock refusal must preserve sources'
 result=m.migrate(app,plugin,root/'result.json',True)
 assert result['applied'] and Path(result['backup']).is_dir()
 assert 'local' not in m.read(plugin)[1]
 current=m.read(p/'.canopus/plugin/config.json')[1]
 assert current['inflight_limit']==9 and current['profile_set']=='personal' and current['spawn_limits']['reviewer']==0
 assert not (p/'.canopus/plugin/local.json').exists() and not (p/'.canopus/local.json').exists()
 assert m.read(p/'.canopus/config.json')[1]['voice']=={'model':'small','language':'ru'}
 assert m.read(p/'.canopus/config.json')[1]['agents']==[], 'arrays replace rather than merge'
 assert not (q/'.canopus/plugin/config.json').exists(), 'absence must remain absence'
 repeat=m.migrate(app,plugin,root/'repeat.json',True)
 assert repeat['alreadyApplied'] and not repeat['files']
 assert len(list((home/'backups').iterdir()))==1
 # Common values factor out only when every project already has them.
 put(plugin,{'project_settings':[str(p),str(q)]})
 put(p/'.canopus/plugin/config.json',{'inflight_limit':4,'profile_set':False,'spawn_limits':{'worker':5,'reviewer':0}})
 put(q/'.canopus/plugin/config.json',{'inflight_limit':4,'profile_set':False,'spawn_limits':{'worker':5,'reviewer':1}})
 r=m.migrate(app,plugin,root/'common.json',True)
 defaults=m.read(plugin)[1]['defaults'];assert defaults['inflight_limit']==4 and defaults['spawn_limits']=={'worker':5} and defaults['profile_set'] is False
 assert m.read(p/'.canopus/plugin/config.json')[1]=={'spawn_limits':{'reviewer':0}}
 # An external edit during application is preserved; preceding writes are rolled back.
 put(plugin,{'project_settings':[str(p),str(q)],'local':{p.name:{'inflight_limit':6}}})
 put(p/'.canopus/plugin/config.json',{})
 git(p,'add','--','.canopus/plugin/config.json');git(p,'commit','-qm','new baseline')
 git(q,'add','--','.canopus/plugin/config.json');git(q,'commit','-qm','second baseline')
 old=plugin.read_bytes();atomic=m.atomic
 def racing(file,raw):
  atomic(file,raw)
  if file.resolve()==plugin.resolve():put(p/'.canopus/plugin/config.json',{'inflight_limit':123})
 m.atomic=racing
 try:
  try:m.migrate(app,plugin,root/'race.json',True);assert False,'expected source race refusal'
  except ValueError:pass
 finally:m.atomic=atomic
 assert plugin.read_bytes()==old and m.read(p/'.canopus/plugin/config.json')[1]['inflight_limit']==123
print('Two-level migration: exact values, absence, common keys, originals, safe repeat and concurrent rollback: green')
