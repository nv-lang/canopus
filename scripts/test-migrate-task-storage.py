import importlib.util,json,pathlib,tempfile,hashlib
spec=importlib.util.spec_from_file_location("migration",pathlib.Path(__file__).with_name("migrate-task-storage.py"));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp);source=p/"old";repo=p/"repo";home=p/"home";report=p/"report.json"
 old=source/"p"/"1.json";old.parent.mkdir(parents=True)
 record={"project":"p","n":1,"slug":"work","status":"paused","history":[{"note":"owner HOLD"}],"folder":"docs/tasks/001-work","worktree":str(p/"tree")}
 old.write_text(json.dumps(record),encoding="utf8");before=old.read_bytes()
 watch=source.parent/"idle-watch/p/1.json";watch.parent.mkdir(parents=True);watch.write_text(json.dumps({"project":"p","n":1,"hold":{"scope":"execution","reason":"owner STOP"}}));watch_before=watch.read_bytes()
 target=repo/"docs/tasks/001-work";target.mkdir(parents=True);(target/"log.md").write_text("canonical",encoding="utf8")
 local=p/"tree/docs/tasks/001-work";local.mkdir(parents=True);(local/"log.md").write_text("local owner changes",encoding="utf8")
 locations={"p":{"root":str(repo),"tasks_dir":"docs/tasks"}}
 dry=m.migrate(source,locations,home,report)
 assert old.read_bytes()==before and not (target/"state.json").exists()
 assert len(dry["conflicts"])==1
 done=m.migrate(source,locations,home,report,True)
 assert (target/"watch.json").read_bytes()==watch_before and not watch.exists()
 assert len(done["watchRecords"])==1 and done["watchRecords"][0]["hasHold"]
 assert not source.exists() and (target/"state.json").read_bytes()==before
 assert (target/"log.md").read_text()=="canonical"
 assert pathlib.Path(done["conflicts"][0]["preserved"]).read_text()=="local owner changes"
 assert (pathlib.Path(done["backup"])/"retired-tasks/p/1.json").read_bytes()==before
 assert m.migrate(source,locations,home,report,True)["alreadyMigrated"]
 # Never overwrite a conflicting live record.
 source.mkdir();old.parent.mkdir();old.write_bytes(before)
 (target/"state.json").write_text(json.dumps({**record,"status":"running"}))
 try:m.migrate(source,locations,home,report)
 except RuntimeError as e:assert "Conflicting task state" in str(e)
 else:raise AssertionError("state collision was overwritten")
 assert old.read_bytes()==before
print("Migration: dry run, exact state, local variants, verified originals, rerun, collision refusal: green")
