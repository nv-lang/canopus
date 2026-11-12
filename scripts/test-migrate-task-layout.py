#!/usr/bin/env python3
"""Task layout migration preserves input, state and all execution documents."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def run(root, *options, status=0):
    command = Path(__file__).with_name("migrate-task-layout.py")
    result = subprocess.run([sys.executable, "-X", "utf8", str(command), str(root), *options],
                            capture_output=True, text=True, encoding="utf-8", check=False)
    assert result.returncode == status, result.stderr
    return json.loads(result.stdout)


with tempfile.TemporaryDirectory() as temp:
    base = Path(temp)
    root = base / "tasks"
    task = root / "035-layout"
    inputs = task / "task"
    inputs.mkdir(parents=True)
    files = {"message.md": b"Owner input", "attachment.png": b"Attachment", "plan.md": b"Plan",
             "progress.md": b"8 of 8", "log.md": b"Log", "state.json": b'{"n":35,"status":"done"}',
             "watch.json": b'{"n":35,"hold":true}'}
    for name, value in files.items():
        (inputs / name).write_bytes(value)
    (task / ".canopus").mkdir()
    (inputs / "watch.json").rename(task / ".canopus/watch.json")
    (task / "plan.md").write_bytes(b"Conflicting plan")
    assert run(root, "--backup", str(base / "unused"), status=1)["conflicts"]
    assert not (base / "unused").exists()
    assert (inputs / "plan.md").read_bytes() == files["plan.md"]
    (task / "plan.md").write_bytes(files["plan.md"])

    assert run(root)["files"] == 5
    assert len(list(inputs.iterdir())) == len(files) - 1
    backup = base / "backup"
    assert run(root, "--backup", str(backup))["files"] == 5
    assert {p.name for p in inputs.iterdir()} == {"message.md", "attachment.png"}
    for name in ("message.md", "attachment.png"):
        assert (inputs / name).read_bytes() == files[name]
    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
    for row in manifest:
        destination = Path(row["target"])
        value = files[destination.name]
        assert destination.read_bytes() == Path(row["backup"]).read_bytes() == value
        assert row["sha256"] == hashlib.sha256(value).hexdigest()
    assert (task / "state.json").read_bytes() == files["state.json"]
    assert (task / "watch.json").read_bytes() == files["watch.json"]
    assert (task / "progress.md").read_bytes() == files["progress.md"]
    assert run(root)["files"] == 0
print("Task layout: owner input untouched, backup verified, conflicts refused, rerun inert")
