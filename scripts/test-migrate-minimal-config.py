"""Safety checks for the explicit minimal configuration migration."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys
from unittest.mock import patch
from contextlib import redirect_stdout
from io import StringIO
sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('migrate-minimal-config.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
POLICY = ({'idle_term_seconds': 900}, {'model_profiles', 'profile_set', 'machine_slots'}, {'tier_max': '(нет)', 'ask': True})

class MigrationTests(unittest.TestCase):
    def convert(self, app=None, secrets=None, plugin=None):
        return m.convert(app or {}, secrets or {}, plugin or {}, Path('/repo'), Path('/home'), POLICY)

    def test_preserves_choices_and_secret_connection(self):
        app = {'port': 8103, 'agents': [{'id': 'worker'}], 'store': 'files', 'idle_term_seconds': 900, 'pg': {'port': 15432}}
        secrets = {'pg': {'password': ''}, 'postgres': {'port': 15432}}
        plugin = {'local': {'fixture': {'tier_max': 'heavy', 'profile_set': 'chosen', 'machine_slots': 2, 'model_profiles': {'fast': ['provider/model']}}}, 'project_settings': ['../foreign']}
        out, blockers = self.convert(app, secrets, plugin)
        self.assertEqual(blockers, [])
        self.assertEqual(out[0]['store'], 'files')
        self.assertEqual(out[0]['agents'], app['agents'])
        self.assertNotIn('pg', out[1])
        self.assertEqual(m.fields_from_dsn(out[1]['database_url'])['port'], 15432)
        self.assertEqual(out[2]['local']['fixture']['profile_set'], 'chosen')
        self.assertNotIn('tier_max', out[2]['local']['fixture'])
        self.assertIn('tier_max', plugin['local']['fixture'])

    def test_nondefault_unknown_and_alias_conflicts_block_without_values(self):
        _, blockers = self.convert({'idle_term_seconds': 17, 'hidden': 'PRIVATE_VALUE'}, plugin={'projects': ['a'], 'project_settings': ['b'], 'defaults': {'ask': False}})
        self.assertEqual(len(blockers), 4)
        self.assertNotIn('PRIVATE_VALUE', str(blockers))

    def test_legacy_project_map_and_invalid_global_shapes_block(self):
        _, blockers = self.convert(plugin={'projects': {'fixture': '/fixture'}, 'retention_days': True})
        self.assertEqual(len(blockers), 2)
        self.assertTrue(any('expected an array' in item for item in blockers))
        _, blockers = self.convert(plugin={'project_settings': [{'project': 'fixture', 'root': 'relative'}]})
        self.assertEqual(len(blockers), 1)

    def test_instance_marker_and_data_ownership_preflight(self):
        with tempfile.TemporaryDirectory() as folder:
            app = Path(folder) / 'app'
            plugin = Path(folder) / 'plugin'
            (app / 'state').mkdir(parents=True)
            (plugin / 'state').mkdir(parents=True)
            marker = app / 'state/instance.kind'
            marker.write_bytes(b'canopus-instance:plugin\n')
            self.assertTrue(m.instance_blockers(app, plugin))
            marker.write_bytes(b'unknown\n')
            self.assertTrue(m.instance_blockers(app, plugin))
            marker.write_bytes(b'canopus-instance:app\n')
            self.assertEqual(m.instance_blockers(app, plugin), [])
            (plugin / 'data/sessions').mkdir(parents=True)
            self.assertTrue(m.instance_blockers(app, plugin))

    def test_conflicting_connection_definitions_block(self):
        _, blockers = self.convert({'pg': {'port': 15432}}, {'database_url': m.dsn_from_fields({'port': 5432})})
        self.assertIn('conflicting', blockers[0])

    def test_cli_dry_run_and_blocked_apply_do_not_write(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'plugin').mkdir()
            app = root / 'config.json'
            plugin = root / 'plugin/config.json'
            app.write_text('{"port":8103}', encoding='utf-8')
            plugin.write_text('{}', encoding='utf-8')
            command = ['migration', '--config', str(app), '--plugin-config', str(plugin), '--repo', str(root)]
            initial = {p: p.read_bytes() for p in (app, plugin)}
            with patch.object(sys, 'argv', command), patch.object(m, 'target_policy', return_value=POLICY), redirect_stdout(StringIO()):
                self.assertEqual(m.main(), 0)
            self.assertEqual({p: p.read_bytes() for p in (app, plugin)}, initial)
            self.assertFalse((root / 'secrets.json').exists())
            app.write_text('{"unknown":"PRIVATE_VALUE"}', encoding='utf-8')
            output = StringIO()
            with patch.object(sys, 'argv', command + ['--apply']), patch.object(m, 'target_policy', return_value=POLICY), redirect_stdout(output):
                self.assertEqual(m.main(), 2)
            self.assertNotIn('PRIVATE_VALUE', output.getvalue())
            self.assertEqual(list(root.rglob('*.before-*')), [])
            self.assertEqual(plugin.read_bytes(), initial[plugin])

    def test_failed_second_write_restores_first(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = [Path(folder) / name for name in ('a.json', 'b.json', 'c.json')]
            originals = [b'{"old":1}'] * 3
            for path, raw in zip(paths, originals):
                path.write_bytes(raw)
            original_atomic = m.atomic
            calls = 0
            def failing_atomic(path, raw):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError('simulated write failure')
                return original_atomic(path, raw)
            with patch.object(m, 'atomic', side_effect=failing_atomic):
                with self.assertRaises(OSError):
                    m.apply_documents(paths, originals, [{'changed': True}] * 3)
            self.assertEqual([p.read_bytes() for p in paths], originals)
            self.assertEqual(len(list(Path(folder).glob('*.before-*'))), 3)

    def test_backup_write_and_optimistic_concurrency(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = [Path(folder) / name for name in ('config.json', 'secrets.json', 'plugin.json')]
            raw = [b'{"old":1}\n'] * 3
            for path, content in zip(paths, raw):
                path.write_bytes(content)
            paths[1].write_bytes(b'{}')
            with self.assertRaises(ValueError):
                m.apply_documents(paths, raw, [{}, {}, {}])
            self.assertEqual(paths[0].read_bytes(), raw[0])
            self.assertEqual(list(Path(folder).glob('*.before-*')), [])
            paths[1].write_bytes(raw[1])
            m.apply_documents(paths, raw, [{'new': 2}, {}, {}])
            self.assertEqual(json.loads(paths[0].read_text()), {'new': 2})
            self.assertEqual(len(list(Path(folder).glob('*.before-*'))), 3)
            self.assertTrue(all(p.read_bytes() == raw[0] for p in Path(folder).glob('*.before-*')))

if __name__ == '__main__':
    unittest.main()

