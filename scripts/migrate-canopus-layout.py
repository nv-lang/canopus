#!/usr/bin/env python3
"""Explicit offline Canopus layout migration. Dry-run by default; never overwrite a home.

Copies and verifies data before publishing the destination. Original sources are
retained until separately reviewed cleanup. No service is stopped by this command.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig")) if path.is_file() else {}


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def copy_verified(source, target, manifest):
    if not source.exists():
        return
    if source.is_symlink():
        raise ValueError("Migration source must not be a link: " + str(source))
    if source.is_dir():
        for child in source.iterdir():
            copy_verified(child, target / child.name, manifest)
        if not target.exists():
            target.mkdir(parents=True)
    else:
        if target.exists():
            if digest(source) != digest(target):
                raise ValueError("Conflicting migration target: " + str(target))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        expected = digest(source)
        if digest(target) != expected:
            raise ValueError("Copy verification failed: " + str(source))
        manifest.append({"source": str(source), "sha256": expected})


def merge(base, over):
    result = dict(base)
    for key, value in over.items():
        result[key] = merge(result.get(key, {}), value) if isinstance(value, dict) and isinstance(result.get(key, {}), dict) else value
    return result


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def remap_project(data, backup, old, new):
    """Change structured project identities, never message text or receipt IDs."""
    fields = {"project", "author_role", "to", "from", "role_key", "address", "repo"}
    def update(value, field=""):
        if isinstance(value, list):
            return [update(v, field) for v in value]
        if isinstance(value, dict):
            result = {}
            for key, item in value.items():
                fresh = new if key == old else key
                if fresh in result:
                    raise ValueError("Project key collision during migration")
                result[fresh] = update(item, key)
            return result
        if isinstance(value, str) and field in fields:
            if value == old: return new
            if value.startswith(old + "."): return new + value[len(old):]
        return value
    opaque = []
    for path in data.rglob("*.json"):
        try:
            before = read_json(path)
        except (ValueError, UnicodeError):
            # Preserve unreadable historical records byte-for-byte and report them.
            opaque.append(str(path.relative_to(data)))
            continue
        after = update(before)
        if after != before:
            copy_verified(path, backup / "project-records" / path.relative_to(data), [])
            write_json(path, after)
    for path in sorted(data.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        name = path.name
        fresh = new if name == old else new + name[len(old):] if name.startswith(old + "_") else name
        if fresh == name: continue
        destination = path.with_name(fresh)
        if destination.exists():
            if path.is_dir() and destination.is_dir():
                for child in path.iterdir():
                    target = destination / child.name
                    if target.exists(): raise ValueError("Project records collide: " + str(target))
                    child.rename(target)
                path.rmdir()
            else:
                raise ValueError("Project records collide: " + str(destination))
        else:
            path.rename(destination)
    return opaque


def remap_paths(root, backup, mappings):
    fields = {"directory", "cwd", "workdir", "web_dir", "data_dir", "root", "rootPath", "dir", "program", "settings_folder", "project_root", "repo", "tools_dir", "path", "folder", "worktrees_dir"}
    def update(value, field=""):
        if isinstance(value, list): return [update(v, field) for v in value]
        if isinstance(value, dict): return {key: update(item, key) for key, item in value.items()}
        if isinstance(value, str) and field in fields:
            normalized = value.replace("\\", "/")
            for old, new in mappings:
                old = old.replace("\\", "/").rstrip("/")
                if normalized.lower() == old.lower() or normalized.lower().startswith(old.lower() + "/"):
                    return new.replace("\\", "/").rstrip("/") + normalized[len(old):]
        return value
    for path in list(root.rglob("*.json")):
        if backup in path.parents: continue
        try: before = read_json(path)
        except (ValueError, UnicodeError): continue
        after = update(before)
        if after != before:
            copy_verified(path, backup / "path-records" / path.relative_to(root), [])
            write_json(path, after)
    last_dir = root / "state/last_dir.txt"
    if last_dir.is_file():
        text = last_dir.read_text(encoding="utf-8-sig").strip()
        fresh = update(text, "directory")
        if fresh != text:
            copy_verified(last_dir, backup / "path-records/state/last_dir.txt", [])
            last_dir.write_text(fresh + "\n", encoding="utf-8")


def migrate(args):
    home = args.home.resolve()
    sources = [p.resolve() for p in [args.from_home, args.from_plugin, args.from_config_dir, args.from_tools, args.from_panel] if p]
    for source in sources:
        if source == home or source in home.parents or home in source.parents:
            raise ValueError("Source and destination must be separate directories")
    if home.exists():
        raise ValueError("Destination already exists; refusing to merge or overwrite: " + str(home))
    if not args.apply:
        return {"state": "dry-run", "destination": str(home), "sources": [str(p) for p in sources], "note": "Stop affected applications before --apply; source directories are retained."}
    home.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".canopus-migrate-", dir=home.parent))
    manifest = []
    try:
        backup = stage / "backups" / ("layout-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
        if args.from_home:
            source = args.from_home
            for name in ["data", "state", "cache", "tools"]:
                copy_verified(source / name, stage / name, manifest)
            copy_verified(source / "config", backup / "old-home-config", manifest)
            for path in (source / "config").glob("*"):
                if path.name not in ["config.json", "secrets.json"]:
                    copy_verified(path, stage / path.name, manifest)
        config = read_json(args.from_home / "config/config.json") if args.from_home else {}
        secrets = read_json(args.from_home / "config/secrets.json") if args.from_home else {}
        if args.from_config_dir:
            source = args.from_config_dir
            copy_verified(source, backup / "old-config-directory", manifest)
            # Preserve the selected backend; old stand/server configurations are backed up, not activated.
            server = read_json(source / "server-pg.json")
            if not config:
                config = server
            pg = read_json(source / "pg.json")
            if pg:
                secrets["postgres"] = pg
                secrets["pg"] = merge(secrets.get("pg", {}), {"password": pg["service_password"]})
            copy_verified(source / "private-names.txt", stage / "guards/private-names.txt", manifest)
            # No active db-viewer consumer is configured; retain its original config in the backup only.
        if args.repo:
            config.pop("workdir", None)
            config.pop("data_dir", None)
            config["web_dir"] = str(args.repo.resolve() / "src/web")
            if isinstance(config.get("voice"), dict) and config["voice"].get("dir"):
                config["voice"]["dir"] = str(home / "tools/whisper")
            if isinstance(config.get("stt"), dict) and config["stt"].get("dir"):
                config["stt"]["dir"] = str(home / "tools/whisper")
            if isinstance(config.get("hub"), dict):
                config["hub"]["program"] = str(args.repo.resolve() / "target/canopus-hub.exe")
        if isinstance(config.get("pg"), dict) and "password" in config["pg"]:
            secrets["pg"] = merge(secrets.get("pg", {}), {"password": config["pg"].pop("password")})
        if isinstance(config.get("stt"), dict):
            config["voice"] = merge(config.pop("stt"), config.get("voice", {}))
        write_json(stage / "config.json", config)
        write_json(stage / "secrets.json", secrets)
        if args.from_plugin:
            for source in args.from_plugin.iterdir():
                if source.name == "doctor.json": target = stage / "plugin/state/doctor.json"
                elif source.name == "branch-journal.jsonl": target = stage / "plugin/state/branch-journal.jsonl"
                elif source.name == "model-catalog.json": target = stage / "plugin/cache/model-catalog.json"
                else: target = stage / "plugin/data" / source.name
                copy_verified(source, target, manifest)
        if args.plugin_config:
            write_json(stage / "plugin/config.json", read_json(args.plugin_config))
        opaque_project_records = []
        for mapping in getattr(args, "rename_project", []):
            old, new = mapping.split("=", 1)
            import re
            if not all(re.fullmatch(r"[a-z0-9][a-z0-9-]*", name) for name in [old, new]):
                raise ValueError("Invalid project rename")
            opaque_project_records.extend(remap_project(stage / "plugin/data", backup, old, new))
        if args.from_tools:
            # Only the actual installation belongs to tools; download residues stay backed up.
            copy_verified(args.from_tools / "whisper", stage / "tools/whisper", manifest)
            copy_verified(args.from_tools / "_dl", backup / "tool-downloads", manifest)
        if args.from_panel:
            copy_verified(args.from_panel, backup / "deployed-panel", manifest)
        mappings = [mapping.split("=", 1) for mapping in getattr(args, "path_map", [])]
        if mappings:
            remap_paths(stage, backup, mappings)
        target_manifest = [{"path": str(path.relative_to(stage)), "sha256": digest(path)} for path in stage.rglob("*") if path.is_file()]
        write_json(backup / "manifest.json", {"sources": [str(p) for p in sources], "files": manifest, "targets": target_manifest, "opaque_project_records": opaque_project_records})
        # Restrict all staged files, including raw backup configurations, before publication.
        if os.name == "nt":
            import subprocess
            account = subprocess.check_output(["whoami", "/user", "/fo", "csv", "/nh"]).decode("ascii", errors="ignore").strip().split(",")[-1].strip('"')
            subprocess.run(["icacls", str(stage), "/inheritance:r", "/grant:r", "*" + account + ":(OI)(CI)F", "/Q"], check=True, stdout=subprocess.DEVNULL)
        else:
            for path in stage.rglob("*"):
                path.chmod(0o700 if path.is_dir() else 0o600)
            stage.chmod(0o700)
        stage.rename(home)
        return {"state": "complete", "destination": str(home), "verified_files": len(manifest), "sources_retained": True}
    except Exception:
        # Keep the incomplete stage for inspection; never delete a source or partial backup.
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path.home() / ".canopus")
    for name in ["from-home", "from-plugin", "from-config-dir", "from-tools", "from-panel", "plugin-config", "repo"]:
        parser.add_argument("--" + name, type=Path)
    parser.add_argument("--path-map", action="append", default=[], help="Explicit old=new mapping for structured path fields only")
    parser.add_argument("--rename-project", action="append", default=[], help="Explicit old=new structured identity migration")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(migrate(args), ensure_ascii=True))


if __name__ == "__main__":
    main()
