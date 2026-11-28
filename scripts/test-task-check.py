#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import tomllib
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location("task_check", Path(__file__).with_name("task-check.py"))
check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check)


def block(expected=0, ident="text-hygiene", suffix=""):
    return f"```check\ncheck: {ident}\nexpect: exit {expected}\n{suffix}```\n"


def verdict(exit_code=0):
    return {"exit": exit_code, "contains": True, "tail": "fixture", "truncated": False, "error": ""}


class CriterionTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.base = Path(folder.name)
        self.tree = self.base / "tree"
        self.tree.mkdir()
        self.card = self.base / "card.md"
        self.card.write_text(block(), encoding="utf-8")
        self.file = self.tree / "data.txt"
        self.file.write_text("tracked\n", encoding="utf-8")
        self.git("init", "-q")
        self.git("add", "--", "data.txt")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "init")

    def git(self, *args):
        return subprocess.check_output(("/usr/bin/git", *args), cwd=self.tree, env=check.ENV)

    def evaluate(self, sandbox, **kwargs):
        return check.evaluate(self.card, str(self.tree), sandbox, image_of=lambda: "approved-image", **kwargs)

    def test_all_blocks_must_pass(self):
        self.card.write_text(block() + block(expected=1), encoding="utf-8")
        sandbox = Mock(return_value=verdict())
        result = self.evaluate(sandbox)
        self.assertEqual(result["status"], "failed")
        self.assertEqual([item["passed"] for item in result["checks"]], [True, False])
        self.assertEqual(sandbox.call_count, 2)
        self.assertTrue(result["tree"] and result["criterion"])

    def test_bad_schema_is_visible_and_never_runs(self):
        for card in (block(ident="missing"), block(suffix="run: echo nope\n"), block(suffix="expect: exit 1\n"),
                     block(suffix="contains: no quotes\n"), block().replace("expect: exit 0\n", ""), block()[:-4]):
            with self.subTest(card=card):
                self.card.write_text(card, encoding="utf-8")
                sandbox = Mock()
                report = self.evaluate(sandbox)
                self.assertEqual(report["status"], "error")
                self.assertIn("Строка", report["reason"])
                sandbox.assert_not_called()

    def test_ignores_examples_in_markdown_and_supports_expect_exit(self):
        registry = tomllib.loads(check.REGISTRY.read_text())
        self.assertEqual(check.parse("````markdown\n" + block() + "````\n", registry), [])
        nested = '~~~check\ncheck: text-hygiene\nexpect:\n  exit: 0\n  contains: "line"\n~~~'
        self.assertEqual(check.parse(nested, registry), [("text-hygiene", 0, b"line")])

    def test_missing_tree_reports_an_error_without_launch(self):
        sandbox = Mock()
        report = check.evaluate(self.card, str(self.tree / "missing"), sandbox)
        self.assertEqual(report["status"], "error")
        self.assertIn("Рабочее дерево", report["reason"])
        sandbox.assert_not_called()

    def test_isolation_unavailable_never_launches_check(self):
        sandbox = Mock()
        image = Mock(side_effect=FileNotFoundError)
        report = check.evaluate(self.card, str(self.tree), sandbox, image_of=image)
        self.assertEqual(report["status"], "error")
        self.assertIn("Изоляция недоступна", report["reason"])
        sandbox.assert_not_called()

    def test_tree_and_card_changes_invalidate_result(self):
        def change_tree(snapshot, policy, image, argv, needle, deadline):
            self.file.write_text("edited concurrently\n", encoding="utf-8")
            self.assertEqual((snapshot / "data.txt").read_text(), "tracked\n")
            return verdict()

        def change_card(*args):
            self.card.write_text(block(expected=7), encoding="utf-8")
            return verdict()

        for change in (change_tree, change_card):
            with self.subTest(change=change.__name__):
                self.assertEqual(self.evaluate(change)["status"], "stale")

    def test_registry_edit_invalidates_a_running_result(self):
        registry = self.base / "checks.toml"
        original = check.REGISTRY.read_text(encoding="utf-8")
        registry.write_text(original, encoding="utf-8")

        def edit_registry(*args):
            registry.write_text(original.replace("version = 1", "version = 2", 1), encoding="utf-8")
            return verdict()

        with patch.object(check, "REGISTRY", registry):
            self.assertEqual(self.evaluate(edit_registry)["status"], "stale")

    def test_version_change_unblocks_three_failure_pause(self):
        report = self.evaluate(Mock(return_value=verdict(1)))
        sandbox = Mock(return_value=verdict(1))
        self.assertEqual(self.evaluate(sandbox, stopped_version=report["criterion"])["status"], "paused")
        sandbox.assert_not_called()
        self.card.write_text(block(expected=1), encoding="utf-8")
        revised = self.evaluate(sandbox, stopped_version=report["criterion"])
        self.assertEqual(revised["status"], "passed")
        self.assertNotEqual(revised["criterion"], report["criterion"])

    def test_worktree_symlink_does_not_copy_host_file(self):
        secret = self.base / "outside"
        secret.write_text("outside\n", encoding="utf-8")
        self.file.unlink()
        self.file.symlink_to(secret)

        def inspect(snapshot, policy, image, argv, needle, deadline):
            self.assertTrue((snapshot / "data.txt").is_symlink())
            self.assertEqual(os.readlink(snapshot / "data.txt"), str(secret))
            self.assertEqual(sorted(p.name for p in snapshot.iterdir()), ["data.txt"])
            return verdict()

        self.assertEqual(self.evaluate(inspect)["status"], "passed")

    def test_approved_guard_cannot_be_replaced_in_worktree(self):
        fake = self.tree / "scripts/guards/check-text-hygiene.py"
        fake.parent.mkdir(parents=True)
        fake.write_text('print("replacement guard")\n', encoding="utf-8")
        self.file.write_bytes(b"x\x00\n")
        self.git("add", "--", "scripts")
        result = check.evaluate(self.card, str(self.tree))
        self.assertEqual(result["status"], "failed", result)
        self.assertIn("data.txt", result["checks"][0]["tail"])
        self.assertNotIn("replacement guard", result["checks"][0]["tail"])


class IsolationTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.snapshot = Path(folder.name, "snapshot")
        self.snapshot.mkdir()
        self.policy = Path(folder.name, "policy")
        self.policy.mkdir()
        self.image = check.local_image()

    def sandbox(self, argv, needle=b"", seconds=10, **kwargs):
        return check.isolated(self.snapshot, self.policy, self.image, argv, needle, time.monotonic() + seconds, **kwargs)

    def test_no_host_environment_socket_or_network(self):
        os.environ["CHECK_FIXTURE_HOST_ONLY"] = "sentinel"
        self.addCleanup(os.environ.pop, "CHECK_FIXTURE_HOST_ONLY")
        script = ('test -z "$CHECK_FIXTURE_HOST_ONLY" && test ! -e /var/run/docker.sock'
                  ' && test "$(ls /sys/class/net)" = lo && printf clean')
        result = self.sandbox(("/bin/sh", "-c", script), b"clean")
        self.assertEqual((result["exit"], result["contains"], result["error"]), (0, True, ""), result)

    def test_refused_isolation_does_not_run_payload(self):
        result = self.sandbox(("/bin/echo", "fixture-ran"), docker=("/bin/false",))
        self.assertIn("Изоляция недоступна", result["error"])
        self.assertNotIn("fixture-ran", result["tail"])

    def test_searches_stdout_before_truncation_and_caps_flood(self):
        result = self.sandbox(("python3", "-c", "print('first'); print('x' * 20000)"), b"first")
        self.assertTrue(result["contains"], result)
        self.assertTrue(result["truncated"])
        self.assertNotIn("first", result["tail"])
        self.assertIn("вывод обрезан", result["tail"])
        flood = self.sandbox(("python3", "-c", "while True: print('x' * 65536)"))
        self.assertIn("лимит вывода", flood["error"])
        self.assertLess(len(flood["tail"].encode()), check.TAIL + 100)

    def test_timeout_kills_even_a_detached_descendant(self):
        marker = f"canopus-timeout-fixture-{os.getpid()}"
        # The inner process creates its own session. Docker must kill the PID namespace,
        # not just the parent process group on the host.
        program = ('import os,sys,time; child=os.fork(); '
                   'os.setsid() if child==0 else None; time.sleep(60)')
        with ThreadPoolExecutor(max_workers=1) as pool:
            job = pool.submit(self.sandbox, ("python3", "-c", program, marker), seconds=3)
            pids = set()
            deadline = time.monotonic() + 2.5
            while len(pids) < 2 and time.monotonic() < deadline:
                matches = check.call((*check.DOCKER, "ps", "--filter", "name=canopus-check-",
                                      "--format", "{{.Names}}")).decode().splitlines()
                for name in matches:
                    try:
                        processes = check.call((*check.DOCKER, "top", name, "-eo", "pid,args")).decode()
                    except subprocess.SubprocessError:
                        continue
                    for line in processes.splitlines():
                        # Skip the trusted timeout supervisor.
                        match = re.match(r"\s*(\d+)\s+python3 -c ", line)
                        if match and marker in line:
                            pids.add(int(match[1]))
                time.sleep(0.03)
            result = job.result()
        self.assertEqual(len(pids), 2, pids)
        self.assertIn("Таймаут", result["error"], result)
        for pid in pids:
            proc = Path(f"/proc/{pid}/stat")
            if proc.exists():
                self.assertEqual(proc.read_text().split(") ", 1)[1][0], "Z", pid)


if __name__ == "__main__":
    unittest.main()
