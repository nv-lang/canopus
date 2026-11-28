#!/usr/bin/env python3
"""331: migration behavior on isolated Git projects, never on live state."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import shutil
import unittest
import urllib.parse

spec=importlib.util.spec_from_file_location('migration', Path(__file__).with_name('migrate-project-folders.py'))
migration=importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base=Path(self.temp.name).resolve()
        self.root=self.base/'project'
        subprocess.run(['git','init','-q',str(self.root)],check=True)
        self.task=self.root/'doc/tasks/001-sample'
        (self.task/'task/images').mkdir(parents=True)
        self.image=bytes(range(256))
        (self.task/'task/images/sample.png').write_bytes(self.image)
        (self.task/'task/message.md').write_text('# Input\n[image](images/sample.png)\n')
        (self.root/'README.md').write_text('[task](doc/tasks/001-sample/task/message.md)\n')
        (self.task/'state.json').write_text(json.dumps({'n':1,'status':'paused','folder':'doc/tasks/001-sample','hold':{'scope':'execution'},'directory':str(self.task/'task'),'branch':'task/001-sample','title':'doc/tasks/owner-words'}))
        subprocess.run(['git','-C',str(self.root),'add','--','README.md','doc/tasks/001-sample/task'],check=True)
        self.projects=[{'root':str(self.root)}]

    def test_dry_run_then_apply_preserves_binary_hold_and_branch(self):
        before=(self.task/'state.json').read_bytes()
        plan=migration.plan(self.projects)
        self.assertEqual((self.task/'state.json').read_bytes(),before)
        self.assertFalse((self.root/'docs').exists())
        backup=self.base/'backup'
        migration.apply(plan,backup)
        new=self.root/'docs/tasks/001-sample'
        self.assertEqual((new/'input/images/sample.png').read_bytes(),self.image)
        state=json.loads((new/'state.json').read_text())
        self.assertEqual(state['hold'],{'scope':'execution'})
        self.assertEqual(state['status'],'paused')
        self.assertEqual(state['branch'],'task/001-sample')
        self.assertEqual(state['title'],'doc/tasks/owner-words')
        self.assertEqual(state['directory'],str(new/'input'))
        self.assertEqual(state['folder'],'docs/tasks/001-sample')
        self.assertIn('docs/tasks/001-sample/input/message.md',(self.root/'README.md').read_text())
        self.assertTrue(json.loads((backup/'verified.json').read_text())['verified'])
        self.assertIn(before,[p.read_bytes() for p in (backup/'files').iterdir()])
        # Git still tracks old paths until the integrator stages the reviewed rename.
        again=migration.plan(self.projects)
        self.assertEqual(again['moves'],[])
        self.assertEqual(again['files'],[])

    def test_conflicts_refuse_before_modification(self):
        (self.root/'docs').mkdir()
        with self.assertRaisesRegex(ValueError,'Conflicting'):
            migration.plan(self.projects)
        self.assertTrue((self.task/'task/images/sample.png').exists())

    def test_changed_source_refuses_before_rename(self):
        plan=migration.plan(self.projects)
        (self.task/'state.json').write_text('changed')
        with self.assertRaisesRegex(ValueError,'changed'):
            migration.apply(plan,self.base/'backup')
        self.assertTrue((self.root/'doc').exists())
        self.assertFalse((self.root/'docs').exists())

    def test_existing_docs_still_migrates_inputs_and_local_setting(self):
        (self.root/'doc').rename(self.root/'docs')
        config=self.root/'.canopus/plugin/config.json'
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({'tasks_dir':'docs/tasks','profile_set':'keep'}))
        subprocess.run(['git','-C',str(self.root),'add','--','doc','docs'],check=True)
        migration.apply(migration.plan(self.projects),self.base/'backup')
        self.assertTrue((self.root/'docs/tasks/001-sample/input/message.md').exists())
        self.assertEqual(json.loads(config.read_text())['profile_set'],'keep')

    def test_input_collision_and_active_writer_refused(self):
        (self.task/'input').mkdir()
        with self.assertRaisesRegex(ValueError,'Conflicting'):
            migration.plan(self.projects)
        (self.task/'input').rmdir()
        (self.task.parent/'.task-store.lock').mkdir()
        with self.assertRaisesRegex(ValueError,'active writers'):
            migration.plan(self.projects)

    def test_custom_tasks_dir_and_encoded_journal_payload(self):
        (self.root/'doc').rename(self.root/'records')
        config=self.root/'.canopus/plugin/config.json'
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({'tasks_dir':'records/tasks','profile_set':'keep'}))
        subprocess.run(['git','-C',str(self.root),'add','--','doc','records'],check=True)
        journal=self.base/'session.json'
        journal.write_text(json.dumps({'text':json.dumps({'dir':str(self.root/'records/tasks/001-sample/task')})}))
        migration.apply(migration.plan(self.projects,[journal]),self.base/'backup')
        self.assertTrue((self.root/'records/tasks/001-sample/input/message.md').exists())
        self.assertEqual(json.loads(json.loads(journal.read_text())['text'])['dir'],str(self.root/'records/tasks/001-sample/input'))
        self.assertEqual(json.loads(config.read_text())['tasks_dir'],'records/tasks')

    def test_external_journal_does_not_rewrite_other_projects_or_global_defaults(self):
        journal=self.base/'global.json'
        original={'defaults':{'tasks_dir':'doc/tasks'},'foreign':str(self.base/'other/doc/tasks/001-x/task'),'text':'owner line\nkeep doc/tasks unchanged'}
        journal.write_text(json.dumps(original))
        migration.apply(migration.plan(self.projects,[journal]),self.base/'backup')
        self.assertEqual(json.loads(journal.read_text()),original)

    def test_private_remainders_after_git_renamed_tracked_documents(self):
        # A ff-only update moves tracked files but leaves ignored runtime in doc/.
        subprocess.run(['git','-C',str(self.root),'mv','doc','docs'],check=True)
        modern=self.root/'docs/tasks/001-sample'
        legacy=self.root/'doc/tasks/001-sample'
        legacy.mkdir(parents=True)
        (modern/'state.json').rename(legacy/'state.json')
        (modern/'task').rename(modern/'input')
        subprocess.run(['git','-C',str(self.root),'add','--','docs'],check=True)
        self.projects[0]['tracked_moved']=True
        migration.apply(migration.plan(self.projects),self.base/'backup')
        state=json.loads((modern/'state.json').read_text())
        self.assertEqual(state['directory'],str(modern/'input'))
        self.assertFalse((legacy/'state.json').exists())
        self.assertFalse((self.root/'doc').exists())
        self.assertEqual(migration.plan(self.projects)['files'],[])
        self.assertEqual((modern/'input/images/sample.png').read_bytes(),self.image)

    def test_prefixed_task_numbers_are_migrated_in_other_projects(self):
        folder=self.root/'doc/tasks/AL-042-sample/task'
        folder.mkdir(parents=True)
        (folder/'message.md').write_text('owner input')
        migration.apply(migration.plan(self.projects),self.base/'backup')
        self.assertEqual((self.root/'docs/tasks/AL-042-sample/input/message.md').read_text(),'owner input')

    def test_immutable_approval_and_accepted_events_keep_original_bytes_semantics(self):
        file=self.task/'state.json'
        state=json.loads(file.read_text())
        state['application']={'events':[{'text':json.dumps({'dir':str(self.task/'task')}),'digest':'unchanged'}]}
        state['history']=[{'directory':str(self.task/'task')}]
        state['creation_approval']={'digest':'original','directory':str(self.task/'task')}
        before={k:state[k] for k in ['application','history','creation_approval','hold']}
        file.write_text(json.dumps(state))
        archive=self.task/'evidence/state.json'
        archive.parent.mkdir()
        archive_bytes=b'{"directory":"doc/tasks/001-sample/task"}\n'
        archive.write_bytes(archive_bytes)
        archived_config=self.task/'evidence/.canopus/plugin/config.json'
        archived_config.parent.mkdir(parents=True)
        config_bytes=b'{"tasks_dir":"doc/tasks"}\n'
        archived_config.write_bytes(config_bytes)
        migration.apply(migration.plan(self.projects),self.base/'backup')
        current=json.loads((self.root/'docs/tasks/001-sample/state.json').read_text())
        for key,value in before.items(): self.assertEqual(current[key],value)
        self.assertEqual((self.root/'docs/tasks/001-sample/evidence/state.json').read_bytes(),archive_bytes)
        self.assertEqual((self.root/'docs/tasks/001-sample/evidence/.canopus/plugin/config.json').read_bytes(),config_bytes)
        self.assertEqual(current['directory'],str(self.root/'docs/tasks/001-sample/input'))

    def test_documentation_symlink_is_refused_before_traversal(self):
        outside=self.base/'outside'
        (self.root/'doc').rename(outside)
        try: (self.root/'doc').symlink_to(outside,target_is_directory=True)
        except OSError: self.skipTest('Directory links are unavailable')
        with self.assertRaisesRegex(ValueError,'Symlinks'):
            migration.plan(self.projects)
        self.assertTrue((outside/'tasks/001-sample/task/message.md').exists())

    def test_custom_task_directory_cannot_redirect_a_task_outside_project(self):
        custom=self.root/'records'
        custom.mkdir()
        outside=self.base/'foreign-task'
        outside.mkdir()
        (outside/'task').mkdir()
        (outside/'task/message.md').write_text('foreign input')
        try: (custom/'001-link').symlink_to(outside,target_is_directory=True)
        except OSError: self.skipTest('Directory links are unavailable')
        self.projects[0]['tasks_dir']='records'
        with self.assertRaisesRegex(ValueError,'Symlinks'):
            migration.plan(self.projects)
        self.assertTrue((outside/'task/message.md').exists())

    def test_windows_separators_do_not_corrupt_docs_or_document_names(self):
        file=self.task/'state.json'
        state=json.loads(file.read_text())
        state['directory']=str(self.task/'task').replace('/',chr(92))
        state['path']='C:'+chr(92)+'work'+chr(92)+'other'+chr(92)+'docs'+chr(92)+'document.txt'
        unchanged=state['path']
        file.write_text(json.dumps(state))
        migration.apply(migration.plan(self.projects),self.base/'backup')
        current=json.loads((self.root/'docs/tasks/001-sample/state.json').read_text())
        self.assertEqual(current['directory'],str(self.root/'docs/tasks/001-sample/input').replace('/',chr(92)))
        self.assertEqual(current['path'],unchanged)

    def test_private_backup_cannot_be_written_inside_project(self):
        with self.assertRaisesRegex(ValueError,'outside project'):
            migration.apply(migration.plan(self.projects),self.root/'backup')
        self.assertTrue((self.root/'doc').exists())

    def test_windows_case_normalization_matches_the_same_project_only(self):
        mappings=[('C:/Work/Project/doc','C:/Work/Project/docs'),('doc','docs')]
        value='c:/work/project/DOC/tasks/001-x'
        self.assertEqual(migration.rewrite_path(value,mappings,ignore_case=True),'C:/Work/Project/docs/tasks/001-x')
        other='C:/Work/Other/docs/document.txt'
        self.assertEqual(migration.rewrite_path(other,mappings,ignore_case=True),other)

    def test_cli_report_cannot_overwrite_project_source(self):
        manifest=self.base/'projects.json'
        manifest.write_text(json.dumps(self.projects))
        readme=self.root/'README.md'
        before=readme.read_bytes()
        command=[sys.executable,str(Path(migration.__file__)), '--projects',str(manifest),'--report',str(readme)]
        result=subprocess.run(command,capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Report must be outside',result.stderr)
        self.assertEqual(readme.read_bytes(),before)

    def test_percent_encoded_task_links_follow_renamed_input(self):
        folder=self.root/'doc/tasks/002-пример/task'
        folder.mkdir(parents=True)
        (folder/'message.md').write_text('source')
        before=urllib.parse.quote('doc/tasks/002-пример/task/message.md',safe='/')
        after=urllib.parse.quote('docs/tasks/002-пример/input/message.md',safe='/')
        (self.root/'README.md').write_text('[source]('+before+')\n')
        migration.apply(migration.plan(self.projects),self.base/'backup')
        self.assertIn(after,(self.root/'README.md').read_text())

    def test_application_adapter_reads_migrated_input_and_preserves_execution_hold(self):
        node=shutil.which('node')
        if not node: self.skipTest('Node 24 is required by the application adapter')
        state_file=self.task/'state.json'
        state=json.loads(state_file.read_text())
        state['project']='sample'
        state_file.write_text(json.dumps(state))
        (self.task/'watch.json').write_text(json.dumps({'project':'sample','n':1,'hold':{'scope':'execution'}}))
        config=self.base/'home/plugin/config.json'
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({'project_settings':[{'project':'sample','root':str(self.root)}]}))
        adapter=Path(migration.__file__).with_name('task-store.mjs')
        command=[node,str(adapter),'read','--config',str(config),'--root',str(self.root),'--json','{"n":1}']
        before=subprocess.run(command,capture_output=True,text=True)
        self.assertEqual(before.returncode,0,before.stderr)
        self.assertIn('HOLD',json.loads(before.stdout)['execution_block'])
        migration.apply(migration.plan(self.projects),self.base/'backup')
        after=subprocess.run(command,capture_output=True,text=True)
        self.assertEqual(after.returncode,0,after.stderr)
        result=json.loads(after.stdout)
        self.assertEqual(result['n'],1)
        self.assertEqual(result['status'],'paused')
        self.assertIn('HOLD',result['execution_block'])
        self.assertEqual(Path(result['shared_dir']),self.root/'docs/tasks/001-sample/input')

    def test_explicit_old_setting_moves_without_losing_owner_profile(self):
        config=self.root/'.canopus/plugin/config.json'
        config.parent.mkdir(parents=True)
        settings={'tasks_dir':'doc/tasks','profile_set':'owner-choice','model_profiles':{'sample':{'path':'keep-as-data'}}}
        config.write_text(json.dumps(settings))
        migration.apply(migration.plan(self.projects),self.base/'backup')
        after=json.loads(config.read_text())
        self.assertEqual(after['tasks_dir'],'docs/tasks')
        self.assertEqual(after['profile_set'],'owner-choice')
        self.assertEqual(after['model_profiles'],settings['model_profiles'])

if __name__=='__main__': unittest.main()
