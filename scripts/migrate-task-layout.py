#!/usr/bin/env python3
"""Move execution files out of task/ without rewriting their contents."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

SERVICE = {"state.json", "watch.json", "snapshot.json", "tests-run.json"}
ARTIFACTS = {
    "acceptance-review.md", "agents-capabilities.md", "analysis.md", "children.md",
    "creation.json", "draft-plan-previous.md", "guards-survey.md", "inventory.md",
    "log.md", "nova-facts.md", "plan.md", "probe.md", "progress.log", "progress.md",
    "research-many-agents.md", "research.md", "spec.md", "usage.log",
}


def destination(task, name):
    if name in SERVICE:
        return task / name
    if name in ARTIFACTS or re.fullmatch(r"progress\.\d+\.md", name):
        return task / name
    return None


def safe_directory(path):
    return path.is_dir() and not path.is_symlink() and not path.is_junction()


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def plan(roots):
    moves, conflicts = [], []
    for root in sorted(set(path.resolve(strict=True) for path in roots)):
        for task in sorted(root.iterdir()):
            if not re.fullmatch(r"\d{3,}-.+", task.name):
                continue
            if not safe_directory(task):
                conflicts.append(str(task))
                continue
            pending = {}
            for name in ("task", ".canopus"):
                source_dir = task / name
                if not source_dir.exists():
                    continue
                if not safe_directory(source_dir):
                    conflicts.append(str(source_dir))
                    continue
                for source in sorted(source_dir.iterdir()):
                    if name == ".canopus" and source.name not in SERVICE:
                        continue
                    target = destination(task, source.name)
                    if target is None:
                        continue
                    if not source.is_file() or source.is_symlink():
                        conflicts.append(str(source))
                        continue
                    value = digest(source)
                    if target.is_symlink() or (target.exists() and (not target.is_file() or digest(target) != value)):
                        conflicts.append(str(target))
                        continue
                    if target in pending and pending[target] != value:
                        conflicts.append(str(target))
                        continue
                    pending[target] = value
                    moves.append((root, source, target, value))
    return moves, conflicts


def apply(moves, backup):
    backup.mkdir(parents=True, exist_ok=False)
    manifest = []
    roots = list(dict.fromkeys(root for root, *_ in moves))
    for root, source, target, value in moves:
        saved = backup / str(roots.index(root)) / source.relative_to(root)
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, saved)
        if digest(saved) != value:
            raise RuntimeError(f"Source changed during backup: {source}")
        manifest.append({"source": str(source), "target": str(target), "backup": str(saved), "sha256": value, "target_existed": target.exists()})
    (backup / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for _, source, target, value in moves:
        if digest(source) != value:
            raise RuntimeError(f"Source changed after backup: {source}")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            with source.open("rb") as src, target.open("xb") as dst:
                shutil.copyfileobj(src, dst)
        if digest(target) != value:
            raise RuntimeError(f"Destination mismatch: {target}")
        source.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", type=Path, nargs="+")
    parser.add_argument("--backup", type=Path, help="Apply with this new backup directory. Omit for a dry run.")
    args = parser.parse_args()
    moves, conflicts = plan(args.roots)
    print(json.dumps({"files": len(moves), "tasks": len({src.parent.parent for _, src, _, _ in moves}), "conflicts": conflicts}, ensure_ascii=False))
    if conflicts:
        return 1
    if args.backup and moves:
        apply(moves, args.backup.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
