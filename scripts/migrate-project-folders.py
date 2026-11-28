#!/usr/bin/env python3
"""331: explicit project folder migration. Report first; --apply requires a verified backup.

Input is a private JSON list: [{"root": "C:/work/project", "tasks_dir": "doc/tasks"}].
--state-file may name additional JSON session journals/configuration to update.
Stop writers before applying. Run from outside directories being renamed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.parse


def digest(data):
    return hashlib.sha256(data).hexdigest()


def relative_tasks(value):
    value = value.replace('\\', '/')
    if value.startswith('/') or ':' in value or any(p in ('', '.', '..') for p in value.split('/')):
        raise ValueError('tasks_dir must stay inside the project')
    return value


def task_dirs(root):
    return sorted(p for p in root.iterdir() if p.is_dir() and (re.fullmatch(r'\d{3,}-.+', p.name) or (p/'task/message.md').exists() or (p/'input/message.md').exists())) if root.exists() else []


def rewrite_path(value, mappings, relative=True, ignore_case=False):
    backslashes = "\\" in value and "/" not in value
    result = value.replace("\\", "/")
    for old, new in sorted(set(mappings), key=lambda pair: -len(pair[0])):
        if not relative and not Path(old).is_absolute(): continue
        result = re.sub(r'(?<![\w./-])' + re.escape(old.replace("\\", "/")) + r'(?=$|[/\s"\x27#)])', lambda _: new.replace("\\", "/"), result, flags=re.I if ignore_case else 0)
    return result.replace("/", "\\") if backslashes else result


def plan(projects, state_files=()):
    moves, rewrites, mappings, configs, stores, sparse = [], [], [], [], [], []
    runtime_files = set()
    roots = [Path(p['root']).resolve(strict=True) for p in projects]
    if len(set(roots)) != len(roots) or any(a != b and a in b.parents for a in roots for b in roots):
        raise ValueError('Project roots overlap')
    for project, root in zip(projects, roots):
        if not root.is_dir() or root.is_symlink():
            raise ValueError('Project root must be an existing real directory')
        old, new = root / 'doc', root / 'docs'
        for directory in [old,new]:
            if directory.is_symlink() or getattr(directory,'is_junction',lambda:False)():
                raise ValueError('Symlinks require explicit resolution')
        if old.exists() and new.exists():
            tracked = subprocess.check_output(['git','-C',str(root),'ls-files','--','doc'])
            if not project.get('tracked_moved') or tracked.strip():
                raise ValueError('Conflicting doc and docs directories')
            sparse.append((old,new))
        elif old.exists():
            moves.append((old, new))
        mappings.append((str(old), str(new)))
        config = root / '.canopus/plugin/config.json'
        cfg = json.loads(config.read_text(encoding='utf-8-sig')) if config.exists() else {}
        configured = project.get('tasks_dir', cfg.get('tasks_dir'))
        # The manifest may describe a global inherited setting; refuse disagreement with a local setting.
        if project.get('tasks_dir') and cfg.get('tasks_dir') and project['tasks_dir'] != cfg['tasks_dir']:
            raise ValueError('Manifest tasks_dir differs from project configuration')
        rel = relative_tasks(configured or ('doc/tasks' if old.exists() else 'docs/tasks'))
        base = root / rel
        try: base.resolve().relative_to(root)
        except ValueError: raise ValueError('tasks_dir leaves the project through a link')
        for component in [base,*base.parents]:
            if component == root: break
            if component.is_symlink() or getattr(component,'is_junction',lambda:False)():
                raise ValueError('Symlinks require explicit resolution')
        for folder in task_dirs(base):
            runtime_files.update(folder/name for name in ['state.json','watch.json','snapshot.json','tests-run.json'])
            if (folder/'task/state.json').exists() or (folder/'.canopus/state.json').exists():
                raise ValueError('Legacy task state requires the 288 migration first')
            if folder.is_symlink() or getattr(folder,'is_junction',lambda:False)():
                raise ValueError('Symlinks require explicit resolution')
            legacy, modern = folder / 'task', folder / 'input'
            if any(d.is_symlink() or getattr(d,'is_junction',lambda:False)() for d in [legacy,modern]):
                raise ValueError('Symlinks require explicit resolution')
            if legacy.exists() and modern.exists():
                raise ValueError('Conflicting task and input directories')
            if legacy.exists():
                if any(outer in legacy.parents for outer,_ in sparse): sparse.append((legacy,modern))
                else: moves.append((legacy, modern))
            mappings.append((str(legacy), str(modern)))
        # Already migrated inputs also define how stale runtime paths are rewritten on a repeated run.
        if rel.startswith('docs/'):
            for folder in task_dirs(base):
                mappings.append((str(root / 'doc' / Path(rel).relative_to('docs') / folder.name / 'task'), str(folder / 'input')))
        if rel.startswith('doc/'):
            configs.append((config, cfg, rel.replace('doc/', 'docs/', 1)))
        mappings.append(('doc', 'docs'))
        for old_input, new_input in list(mappings):
            if old_input.startswith(str(root) + os.sep):
                mappings.append((str(Path(old_input).relative_to(root)), str(Path(new_input).relative_to(root))))
    def replace(value, relative=True):
        return rewrite_path(value, mappings, relative, os.name == "nt")
    relocation_rules = [(old,new,os.path.normcase(str(old))) for old,new in sorted(moves+sparse,key=lambda pair:-len(str(pair[0])))]
    def target(p):
        value = Path(p)
        normalized = os.path.normcase(str(value))
        # Reject unrelated prefixes without constructing thousands of Path exceptions.
        for old, new, prefix in relocation_rules:
            if normalized == prefix or normalized.startswith(prefix + os.sep):
                value = new / value.relative_to(old)
                normalized = os.path.normcase(str(value))
        return value
    files = set(Path(p).absolute() for p in state_files)
    for root in roots:
        git = subprocess.run(['git', '-C', str(root), 'ls-files', '-z'], capture_output=True, check=False)
        if git.returncode:
            raise ValueError('Project root must be a Git checkout')
        for p in git.stdout.decode().split('\0'):
            if p:
                source = root / p
                if not source.exists(): source = Path(replace(str(source)))
                files.add(source)
        for source in [root / 'doc', root / 'docs']:
            if source.exists():
                if any(p.is_symlink() for p in source.rglob('*')): raise ValueError('Symlinks require explicit resolution')
                files.update(p for p in source.rglob('*') if not p.is_dir())
        # Custom task locations can include private/untracked runtime files.
        project = projects[roots.index(root)]
        cfg_file = root / '.canopus/plugin/config.json'
        cfg = json.loads(cfg_file.read_text(encoding='utf-8-sig')) if cfg_file.exists() else {}
        rel = relative_tasks(project.get('tasks_dir') or cfg.get('tasks_dir') or ('doc/tasks' if (root/'doc').exists() else 'docs/tasks'))
        base = root / rel
        if base.exists():
            stores.append(str(base))
            if (base / '.task-store.lock').exists() or list(base.glob('.task-store.claim-*')):
                raise ValueError('Task store has active writers or a maintenance lock')
            if any(p.is_symlink() or getattr(p,'is_junction',lambda:False)() for p in base.rglob('*')):
                raise ValueError('Symlinks require explicit resolution')
            files.update(p for p in base.rglob('*') if not p.is_dir())
        if project.get('tracked_moved'):
            for extra in [root/'doc/tasks',root/'docs/tasks']:
                if extra.exists() and str(extra) not in stores:
                    if (extra/'.task-store.lock').exists() or list(extra.glob('.task-store.claim-*')):
                        raise ValueError('Task store has active writers or a maintenance lock')
                    stores.append(str(extra))
        if cfg_file.exists():
            files.add(cfg_file)
    for source in sorted(files):
        if source.is_symlink():
            raise ValueError('Symlinks require explicit resolution')
        if not source.is_file():
            raise ValueError('Tracked source is missing')
        data = source.read_bytes()
        changed = data
        if source.suffix == '.json' and (source in {Path(p).absolute() for p in state_files} or source in runtime_files or source in {root/'.canopus/plugin/config.json' for root in roots}):
            try:
                value = json.loads(data.decode('utf-8-sig'))
            except (ValueError, UnicodeError):
                value = None
            local = any(root == source or root in source.parents for root in roots)
            path_fields = {"tasks_dir", "folder", "dir", "directory", "task_dir", "task_shown", "shared_dir", "file", "files", "path", "paths", "source", "target", "root", "worktree", "worktrees", "cwd", "workdir", "repo_dir"}
            def walk(v, relative=local, path_value=False):
                if isinstance(v, str):
                    # Journal event payloads can be JSON encoded inside JSON.
                    if v.startswith(('{', '[')):
                        try:
                            decoded = json.loads(v)
                            updated = walk(decoded, relative)
                            return json.dumps(updated, ensure_ascii=False, separators=(',', ':')) if updated != decoded else v
                        except ValueError:
                            pass
                    return replace(v, relative) if path_value and not any(c in v for c in ("\n", "\r")) else v
                if isinstance(v, list): return [walk(x, relative, path_value) for x in v]
                if isinstance(v, dict):
                    # Approval proofs, accepted events and HOLD are immutable evidence.
                    if "digest" in v or "signature" in v: return v
                    immutable = {"history", "application", "creation_approval", "approval", "hold", "fields"}
                    return {replace(k, relative) if "/" in k or "\\" in k else k: x if k in immutable else walk(x, relative, k in path_fields) for k, x in v.items()}
                return v
            if value is not None:
                updated = walk(value)
                for cfg_file, cfg, rel in configs:
                    if source == cfg_file and 'tasks_dir' in updated:
                        updated['tasks_dir'] = rel
                if updated != value:
                    changed = (json.dumps(updated, ensure_ascii=False, indent=2) + '\n').encode()
        elif source.suffix == '.md':
            try:
                text = data.decode('utf-8')
                # Rewrite repository-local doc references, leaving URLs and human quotations intact.
                lines = []
                for line in text.splitlines(keepends=True):
                    def relocate_link(m):
                        dest=m[1]
                        if re.match(r'[a-zA-Z][\w+.-]*:',dest) or dest.startswith('//'): return m[0]
                        file, sep, anchor=dest.partition('#')
                        if file:
                            resolved=Path(os.path.normpath(str(source.parent/urllib.parse.unquote(file))))
                            updated_path=os.path.relpath(target(resolved), target(source).parent).replace('\\','/')
                            file=urllib.parse.quote(updated_path,safe='/@:$,;=-._~') if '%' in file else updated_path
                        return ']('+file+sep+anchor+')'
                    line = re.sub(r'\]\(([^)\n]+)\)', relocate_link, line)
                    lines.append(line)
                updated = ''.join(lines)
                if updated != text: changed = updated.encode()
            except UnicodeError:
                pass
        destination = target(source)
        if destination != source and destination.exists() and destination.read_bytes() != changed:
            raise ValueError('Conflicting destination file')
        if changed != data or destination != source:
            rewrites.append({'source': str(source), 'target': str(target(source)), 'sha256': digest(data), 'new_sha256': digest(changed), 'data': changed, 'mode': source.stat().st_mode & 0o777, 'sparse': any(a in source.parents for a,b in sparse)})
    return {'moves': [(str(a), str(b)) for a,b in sorted(moves, key=lambda pair: -len(str(pair[0])))], 'files': rewrites, 'stores': stores, 'store_targets': [str(target(Path(p))) for p in stores], 'sparse': [(str(a),str(b)) for a,b in sparse], 'roots': [str(root) for root in roots]}


def public_plan(result):
    return {'migration': 331, 'roots': result['roots'], 'moves': result['moves'], 'stores': result['stores'], 'files': [{k:v for k,v in f.items() if k != 'data'} for f in result['files']]}


def _apply_locked(result, backup):
    backup = Path(backup).resolve()
    if backup.exists():
        raise ValueError('Backup directory must be new')
    if any(Path(root) == backup or Path(root) in backup.parents for root in result['roots']):
        raise ValueError('Backup must be outside project repositories')
    if any(backup == Path(a) or Path(a) in backup.parents or backup in Path(a).parents for a,b in result['moves']):
        raise ValueError('Backup must be outside migrated directories')
    # Verify every source before any mutation, then back up every affected byte.
    for f in result['files']:
        if digest(Path(f['source']).read_bytes()) != f['sha256']:
            raise ValueError('Source changed after planning')
    for a,b in result['moves']:
        if Path(b).exists(): raise ValueError('Destination appeared after planning')
    backup.mkdir(parents=True, mode=0o700)
    os.chmod(backup,0o700)
    for i,f in enumerate(result['files']):
        saved = backup / 'files' / str(i)
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f['source'], saved)
        if digest(saved.read_bytes()) != f['sha256']: raise ValueError('Backup verification failed')
    (backup / 'manifest.json').write_text(json.dumps(public_plan(result), ensure_ascii=False, indent=2)+'\n')
    for f in result['files']:
        if digest(Path(f['source']).read_bytes()) != f['sha256']: raise ValueError('Source changed during backup')
    for a,b in result['moves']:
        os.rename(a,b)
    for i,f in enumerate(result['files']):
        dest = Path(f['target'])
        if f['sparse']:
            dest.parent.mkdir(parents=True,exist_ok=True)
            if not dest.exists():
                with dest.open('xb') as stream: stream.write(Path(f['source']).read_bytes())
                os.chmod(dest, f['mode'])
            elif digest(dest.read_bytes()) not in (f['sha256'], f['new_sha256']):
                raise ValueError('Conflicting destination file')
        if digest(dest.read_bytes()) != f['sha256'] and digest(dest.read_bytes()) != f['new_sha256']: raise ValueError('Destination changed during migration')
        if f['new_sha256'] != digest(dest.read_bytes()):
            temp = dest.with_name(dest.name+'.331.tmp')
            with temp.open('xb') as stream: stream.write(f['data'])
            os.chmod(temp, f['mode'])
            os.replace(temp,dest)
        if digest(dest.read_bytes()) != f['new_sha256']: raise ValueError('Destination verification failed')
        if f['sparse'] and Path(f['source']) != dest: Path(f['source']).unlink()
    (backup / 'verified.json').write_text(json.dumps({'verified': True, 'files': len(result['files'])})+'\n')


def apply(result, backup):
    if not result['moves'] and not result['files']:
        return
    acquired=[]
    try:
        for source, destination in zip(result['stores'], result['store_targets']):
            lock=Path(source)/'.task-store.lock'
            lock.mkdir()
            acquired.append((lock, Path(destination)/'.task-store.lock'))
            if list(Path(source).glob('.task-store.claim-*')):
                raise ValueError('Task writers must drain before migration')
        _apply_locked(result, backup)
    finally:
        for old, new in reversed(acquired):
            lock=old if old.exists() else new
            if lock.exists(): lock.rmdir()
        for source, _ in sorted(result.get('sparse', []), key=lambda pair:-len(pair[0])):
            directory=Path(source)
            if directory.is_dir():
                for child in sorted(directory.rglob('*'),key=lambda p:-len(p.parts)):
                    if child.is_dir():
                        try: child.rmdir()
                        except OSError: pass
                try: directory.rmdir()
                except OSError: pass


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--projects', type=Path, required=True)
    p.add_argument('--state-file', type=Path, action='append', default=[])
    p.add_argument('--report', type=Path, required=True)
    p.add_argument('--apply', action='store_true')
    p.add_argument('--backup', type=Path)
    a=p.parse_args()
    if a.apply and not a.backup: p.error('--apply requires --backup')
    result=plan(json.loads(a.projects.read_text(encoding='utf-8-sig')), a.state_file)
    report=a.report.resolve()
    if any(report == Path(root) or Path(root) in report.parents for root in result['roots']):
        raise ValueError('Report must be outside project repositories')
    if report == a.projects.resolve() or report in {p.resolve() for p in a.state_file}:
        raise ValueError('Report must not overwrite migration inputs')
    if report.exists():
        previous=json.loads(report.read_text(encoding='utf-8-sig'))
        if not isinstance(previous,dict) or previous.get('migration') != 331 or previous.get('roots') != result['roots']:
            raise ValueError('Report destination contains unrelated data')
    report.write_text(json.dumps(public_plan(result), ensure_ascii=False, indent=2)+'\n')
    os.chmod(report,0o600)
    if a.apply: apply(result,a.backup)
    print(json.dumps({'moves':len(result['moves']), 'files':len(result['files']), 'applied':a.apply}))

if __name__ == '__main__':
    main()
