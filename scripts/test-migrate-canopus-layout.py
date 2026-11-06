"""Behavior tests for the offline Canopus migration; no real user data is read."""
import importlib.util
import argparse
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("migration", Path(__file__).with_name("migrate-canopus-layout.py"))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def test_copy_preserves_sources_and_separates_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "old"
            (old / "data/sessions/s1").mkdir(parents=True)
            (old / "data/sessions/s1/journal").write_bytes(b"persistent session")
            (old / "config").mkdir()
            (old / "config/config.json").write_text('{"port":8100,"store":"files"}')
            plugin = root / "mailbox"
            plugin.mkdir()
            (plugin / "doctor.json").write_text('{"problems":[]}')
            (plugin / "model-catalog.json").write_text('{"models":[]}')
            (plugin / "projects.json").write_text('{"project_settings":[]}')
            infra = root / "infra"
            infra.mkdir()
            (infra / "server-pg.json").write_text('{"store":"pg"}')
            (infra / "db-viewer.json").write_text('{"password":"placeholder"}')
            home = root / "destination"
            args = argparse.Namespace(home=home, from_home=old, from_plugin=plugin, from_config_dir=infra, from_tools=None, from_panel=None, plugin_config=None, repo=None, apply=False)
            self.assertEqual(migration.migrate(args)["state"], "dry-run")
            self.assertFalse(home.exists())
            args.apply = True
            result = migration.migrate(args)
            self.assertEqual(result["state"], "complete")
            self.assertEqual((home / "data/sessions/s1/journal").read_bytes(), b"persistent session")
            self.assertTrue((old / "data/sessions/s1/journal").exists())
            self.assertTrue((home / "plugin/state/doctor.json").exists())
            self.assertTrue((home / "plugin/cache/model-catalog.json").exists())
            self.assertTrue((home / "plugin/data/projects.json").exists())
            migrated = json.loads((home / "config.json").read_text())
            self.assertEqual(migrated["port"], 8100)
            self.assertEqual(migrated["store"], "files", "an unused PG config must not change the active backend")
            self.assertFalse((home / "db-viewer").exists())
            self.assertTrue(list((home / "backups").rglob("db-viewer.json")))
            with self.assertRaisesRegex(ValueError, "already exists"):
                migration.migrate(args)

    def test_project_rename_preserves_messages_and_receipt_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "data/tasks/old-project"
            source.mkdir(parents=True)
            record = {"project": "old-project", "author_role": "old-project.integrator", "text": "old-project remains quoted", "id": "msg_old-project_receipt"}
            migration.write_json(source / "1.json", record)
            (source / "empty.json").write_bytes(b"")
            (source / "damaged.json").write_bytes(b"not json\xff")
            opaque = migration.remap_project(root / "data", root / "backup", "old-project", "new-project")
            self.assertEqual(len(opaque), 2)
            self.assertEqual((root / "data/tasks/new-project/empty.json").read_bytes(), b"")
            self.assertEqual((root / "data/tasks/new-project/damaged.json").read_bytes(), b"not json\xff")
            result = migration.read_json(root / "data/tasks/new-project/1.json")
            self.assertEqual(result["project"], "new-project")
            self.assertEqual(result["author_role"], "new-project.integrator")
            self.assertEqual(result["text"], record["text"])
            self.assertEqual(result["id"], record["id"])
            self.assertTrue((root / "backup/project-records/tasks/old-project/1.json").exists())

    def test_path_mapping_does_not_rewrite_user_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            migration.write_json(root / "data.json", {"directory": "C:/work/old/sub", "folders": [{"path": "C:/work/old/repo"}], "text": "C:/work/old/sub", "other": "C:/work/old-copy"})
            migration.remap_paths(root, root / "backup", [("C:/work/old", "C:/work/new")])
            result = migration.read_json(root / "data.json")
            self.assertEqual(result["directory"], "C:/work/new/sub")
            self.assertEqual(result["folders"][0]["path"], "C:/work/new/repo")
            self.assertEqual(result["text"], "C:/work/old/sub")
            self.assertEqual(result["other"], "C:/work/old-copy")

    def test_nested_destination_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            args = argparse.Namespace(home=root / "inside", from_home=root, from_plugin=None, from_config_dir=None, from_tools=None, from_panel=None, plugin_config=None, repo=None, apply=True)
            with self.assertRaisesRegex(ValueError, "separate"):
                migration.migrate(args)


if __name__ == "__main__":
    unittest.main()
