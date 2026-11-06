"""Explicit, conservative task 286 migration. Reports keys, never values."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from datetime import datetime, timezone
from lib.canopus_database_url import dsn_from_fields, fields_from_dsn


def equal(a, b):
    return type(a) is type(b) and a == b


def target_policy(repo):
    text = (repo / 'src/config/config_cmd.nv').read_text(encoding='utf-8-sig')
    block = text.split('export fn policy_keys()', 1)[1].split('\n]', 1)[0]
    pattern = r'ks\("([^"\\]+)", "[a-z]", ("(?:[^"\\]|\\.)*")\)'
    app = {key: json.loads(json.loads(value)) for key, value in re.findall(pattern, block)}
    source = (repo / 'opencode-plugin/resolved-policy.ts').read_text(encoding='utf-8-sig')
    public = json.loads('[' + source.split('Object.freeze([', 1)[1].split('] as const)', 1)[0] + ']')
    internal = json.JSONDecoder().raw_decode(source.split('export const INTERNAL_POLICY = freeze(', 1)[1].lstrip())[0]
    if len(app) < 40 or len(public) != 10 or not internal:
        raise ValueError('target policy registry is incomplete')
    return app, set(public), internal


def flatten(value, prefix=''):
    for key, item in value.items():
        name = prefix + key
        if isinstance(item, dict) and item:
            yield from flatten(item, name + '.')
        else:
            yield name, item


def put(obj, key, value):
    parts = key.split('.')
    for part in parts[:-1]:
        obj = obj.setdefault(part, {})
    obj[parts[-1]] = copy.deepcopy(value)


def project_config(value, public, internal, blockers, prefix):
    if not isinstance(value, dict):
        blockers.append(prefix + ': expected object')
        return {}
    result = {}
    for key, item in value.items():
        if key in public:
            result[key] = copy.deepcopy(item)
        elif key in internal and equal(item, internal[key]):
            pass
        elif key == 'tier_max' and item == 'heavy':
            pass
        elif key == 'tier_min' and item == 'light':
            pass
        else:
            blockers.append(prefix + '.' + key + ': unsupported nondefault or unknown setting')
    return result


def convert(app, secrets, plugin, repo, home, policy):
    defaults, public, internal = policy
    blockers = []
    result = {}
    derived = {'web_dir': repo / 'src/web', 'hub.program': repo / 'target/canopus-hub.exe',
               'data_dir': home / 'data', 'tools_dir': home / 'tools', 'voice.dir': home / 'tools/whisper'}
    pg = {}
    for key, value in flatten(app):
        if key in ('port', 'store', 'agents', 'voice.language', 'voice.model') or key == 'voice' and value is False:
            put(result, key, value)
        elif key.startswith('pg.'):
            pg[key[3:]] = value
        elif key in defaults and equal(value, defaults[key]):
            pass
        elif key in derived and isinstance(value, str) and os.path.normcase(os.path.abspath(value)) == os.path.normcase(str(derived[key].resolve())):
            pass
        else:
            blockers.append('app.' + key + ': unsupported nondefault or unknown setting')
    secret_result = copy.deepcopy(secrets)
    secret_pg = secret_result.pop('pg', {})
    if not isinstance(secret_pg, dict):
        blockers.append('secrets.pg: expected object')
    else:
        pg.update(secret_pg)
    if pg:
        try:
            uri = dsn_from_fields(pg)
            if 'database_url' in secret_result and fields_from_dsn(secret_result['database_url']) != fields_from_dsn(uri):
                blockers.append('secrets.database_url: conflicting connection definitions')
            else:
                secret_result['database_url'] = uri
        except ValueError:
            blockers.append('secrets.pg: invalid connection definition')
    if 'database_url' in secret_result:
        try:
            fields_from_dsn(secret_result['database_url'])
        except ValueError:
            blockers.append('secrets.database_url: unsupported URI')
    for key in secret_result:
        if key not in ('database_url', 'postgres', 'db_viewer'):
            blockers.append('secrets.' + key + ': unknown secret section')
    plugin = copy.deepcopy(plugin)
    for old, new in [('projects', 'project_settings'), ('keep_days', 'retention_days')]:
        if old in plugin:
            if new in plugin and not equal(plugin[old], plugin[new]):
                blockers.append('plugin.' + old + ': conflicting aliases')
            else:
                plugin[new] = plugin[old]
            del plugin[old]
    out = {}
    for key, value in plugin.items():
        if key == 'project_settings':
            if not isinstance(value, list):
                blockers.append('plugin.project_settings: expected an array; legacy project maps require explicit conversion')
            else:
                for entry in value:
                    valid = isinstance(entry, str) and bool(entry)
                    if isinstance(entry, dict):
                        valid = set(entry) == {'project', 'root'} and isinstance(entry['project'], str) and bool(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,40}', entry['project'])) and isinstance(entry['root'], str) and os.path.isabs(entry['root'])
                    if not valid:
                        blockers.append('plugin.project_settings: invalid project registration')
                out[key] = value
        elif key == 'retention_days':
            if type(value) is not int or value < 0:
                blockers.append('plugin.retention_days: expected a non-negative integer')
            else:
                out[key] = value
        elif key == 'defaults':
            out[key] = project_config(value, public, internal, blockers, 'plugin.defaults')
        elif key == 'local' and isinstance(value, dict):
            out[key] = {name: project_config(item, public, internal, blockers, 'plugin.local.' + name) for name, item in value.items()}
        else:
            blockers.append('plugin.' + key + ': unknown global setting')
    return [result, secret_result, out], blockers


def read_document(path):
    raw = path.read_bytes() if path.exists() else None
    value = json.loads(raw.decode('utf-8-sig')) if raw is not None else {}
    if not isinstance(value, dict):
        raise ValueError('configuration root must be an object')
    return raw, value


def atomic(path, raw):
    descriptor, name = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def instance_blockers(app_root, plugin_root):
    blockers = []
    for root, kind in ((app_root, 'app'), (plugin_root, 'plugin')):
        marker = root / 'state/instance.kind'
        if marker.exists():
            if marker.read_bytes() != ('canopus-instance:' + kind + '\n').encode('utf-8'):
                blockers.append(kind + ': wrong or unknown instance marker')
        elif kind == 'app' and any((root / 'data' / name).exists() for name in ('cards', 'tasks', 'inbox')):
            blockers.append('app: plugin coordination data in application root')
        elif kind == 'plugin' and (root / 'data/sessions').exists():
            blockers.append('plugin: application sessions in plugin root')
    return blockers


def apply_documents(paths, originals, converted):
    # Optimistic concurrency check before any write; backup all sources first.
    for path, raw in zip(paths, originals):
        current = path.read_bytes() if path.exists() else None
        if current != raw:
            raise ValueError('configuration changed after inspection')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    for path, raw in zip(paths, originals):
        if raw is not None:
            backup_dir = path.parent / 'backups'
            backup_dir.mkdir(exist_ok=True)
            backup = backup_dir / (path.name + '.before-286-' + stamp)
            with backup.open('xb') as stream:
                stream.write(raw)
            if hashlib.sha256(backup.read_bytes()).digest() != hashlib.sha256(raw).digest():
                raise ValueError('backup verification failed')
    written = []
    try:
        for path, raw, value in zip(paths, originals, converted):
            payload = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            atomic(path, payload)
            written.append((path, raw))
    except Exception:
        for path, raw in reversed(written):
            if raw is None:
                path.unlink(missing_ok=True)
            else:
                atomic(path, raw)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--plugin-config', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--policy-root', type=Path, help='target source registry; defaults to --repo')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        paths = [args.config.resolve(), args.config.resolve().parent / 'secrets.json', args.plugin_config.resolve()]
        if len(set(paths)) != 3 or paths[0].parent == paths[2].parent:
            raise ValueError('application and plugin instances must have distinct roots')
        docs = [read_document(path) for path in paths]
        converted, blockers = convert(*(item[1] for item in docs), args.repo.resolve(), paths[0].parent, target_policy(args.policy_root or args.repo))
        blockers.extend(instance_blockers(paths[0].parent, paths[2].parent))
        # Never follow project_settings paths or touch foreign project files.
        print(json.dumps({'mode': 'apply' if args.apply else 'dry-run', 'blockers': blockers,
                          'sections': [sorted(value) for value in converted]}, ensure_ascii=False))
        if blockers:
            return 2
        if args.apply:
            apply_documents(paths, [item[0] for item in docs], converted)
        return 0
    except Exception:
        # Input exceptions can contain passwords or full JSON; do not print them.
        print('migration failed; no configuration values are reported')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())



