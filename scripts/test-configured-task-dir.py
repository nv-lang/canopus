import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

path = Path(__file__).parent / "guards/check-task-docs.py"
spec = importlib.util.spec_from_file_location("task_guard", path)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class TasksDirectoryTests(unittest.TestCase):
    def test_source_config_controls_guard_in_tree_and_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            config = root / ".canopus/plugin/config.json"
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps({"tasks_dir": "docs/tasks"}))
            subprocess.run(["git", "-C", tmp, "add", "--", ".canopus/plugin/config.json"], check=True)
            for mode in ["tree", "index"]:
                source = guard.guardlib.Source(tmp, mode)
                try:
                    guard.configure_tasks_dir(source)
                finally:
                    source.close()
                self.assertIsNotNone(guard.TASK_FILE.match("docs/tasks/001-test/plan.md"))
                self.assertIsNone(guard.TASK_FILE.match("doc/tasks/001-test/plan.md"))
                self.assertIsNotNone(guard.MESSAGE_FILE.match("docs/tasks/001-test/task/message.md"))
            config.write_text(json.dumps({"tasks_dir": "../outside"}))
            with self.assertRaises(ValueError):
                guard.configure_tasks_dir(guard.guardlib.Source(tmp))


if __name__ == "__main__":
    unittest.main()
