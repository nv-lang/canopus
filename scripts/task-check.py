#!/usr/bin/env python3
"""Run the installed task-check registry against a disposable worktree snapshot."""

import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import sys
import tempfile
import time
import tomllib
import uuid

INSTALLED = Path(__file__).resolve().parent
REGISTRY = INSTALLED / "checks.toml"
IMAGE = "canopus-task-check:1"
ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": "/nonexistent",
       "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"}
DOCKER = ("/usr/bin/docker", "--host", "unix:///var/run/docker.sock")
LIMIT = 256 * 1024 * 1024
TAIL = 8192
OUTPUT_LIMIT = 8 * 1024 * 1024
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
READY = b"CANOPUS-CHECK-ISOLATED\n"

# The shell and arguments are installed policy. Candidate code starts after the
# kernel limits are verified. Docker removes the whole PID namespace on timeout.
BOOTSTRAP = r'''
set -eu
test "$(cat /sys/fs/cgroup/memory.max)" = 536870912
test "$(cat /sys/fs/cgroup/memory.swap.max)" = 0
test "$(cat /sys/fs/cgroup/pids.max)" = 64
test "$(cat /sys/fs/cgroup/cpu.max)" = "100000 100000"
test "$(id -u)" = 65534
grep -Eq '^Seccomp:[[:space:]]+2$' /proc/self/status
grep -Eq '^NoNewPrivs:[[:space:]]+1$' /proc/self/status
test "$(ls /sys/class/net)" = lo
cp -RP /snapshot/. /work/
git -c init.defaultBranch=main init -q
git -c core.hooksPath=/dev/null add -f -- .
printf 'CANOPUS-CHECK-ISOLATED\n' >&2
exec timeout -s KILL 35 "$@"
'''


class Refused(Exception):
    pass


def load_registry(data):
    registry = tomllib.loads(data.decode("utf-8"))
    if type(registry["version"]) is not int or not registry["checks"] or not registry["assets"]:
        raise Refused("Установленный реестр проверок повреждён.")
    for relative in registry["assets"]:
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts or not (INSTALLED / path).resolve().is_relative_to(INSTALLED):
            raise Refused("Файл политики проверки находится вне установленного каталога scripts.")
    for entry in registry["checks"].values():
        commands = entry["commands"]
        if type(entry["version"]) is not int or not isinstance(commands, list) or not commands:
            raise Refused("В реестре проверки нет версии или команды.")
        if any(not isinstance(argv, list) or not argv or not all(isinstance(arg, str) for arg in argv)
               for argv in commands):
            raise Refused("В реестре проверки команда должна быть списком строк.")
    return registry


def parse(card, registry):
    checks = []
    fence = None
    block = None
    for number, line in enumerate(card.splitlines(), 1):
        match = FENCE.fullmatch(line)
        if fence is not None:
            if match and match[1][0] == fence[0] and len(match[1]) >= len(fence) and not match[2].strip():
                if block is not None:
                    checks.append(parse_block(block, start, registry))
                fence, block = None, None
            elif block is not None:
                block.append(line)
        elif match:
            fence = match[1]
            info = match[2].strip().split()
            if info and info[0] == "check":
                if info != ["check"] or len(checks) >= 8:
                    raise Refused(f"Строка {number}: неверное объявление блока check или больше восьми блоков.")
                start, block = number, []
    if block is not None:
        raise Refused(f"Строка {start}: блок check не закрыт.")
    return checks


def parse_block(lines, line, registry):
    # Flow form from the card or its two-line expect.exit equivalent.
    content = "\n".join(lines).strip("\n")
    match = re.fullmatch(
        r"check: ([a-z][a-z0-9-]{0,63})\nexpect:(?: exit |\n  exit: )(0|[1-9][0-9]{0,2})"
        r"(?:\n(?:  )?contains: (\"[^\n]*\"))?", content,
    )
    if not match or int(match[2]) > 255:
        raise Refused(f"Строка {line}: требуются check и expect.exit, допускается contains (строка JSON).")
    try:
        needle = json.loads(match[3]).encode("utf-8") if match[3] is not None else b""
    except (ValueError, UnicodeError):
        raise Refused(f"Строка {line}: неверная строка contains.") from None
    if match[3] is not None and not 0 < len(needle) <= 4096:
        raise Refused(f"Строка {line}: contains должен содержать от 1 до 4096 байт.")
    if match[1] not in registry["checks"]:
        raise Refused(f"Строка {line}: идентификатор {match[1]} отсутствует в реестре.")
    return match[1], int(match[2]), needle


def card_bytes(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise Refused("Карточка задачи должна быть обычным файлом.")
        data = stream.read(1024 * 1024 + 1)
    if len(data) > 1024 * 1024:
        raise Refused("Карточка задачи превышает 1 МиБ.")
    return data


def call(args, **kwargs):
    return subprocess.run(args, env=ENV, stdin=subprocess.DEVNULL, capture_output=True,
                          timeout=5, check=True, **kwargs).stdout


def git(tree, *args):
    return call(("/usr/bin/git", "-c", "core.fsmonitor=false", "-C", str(tree), *args))


@contextlib.contextmanager
def open_entry(root, parts):
    # Never follow a parent symlink, even when the worktree changes during the copy.
    parent = os.dup(root)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = child
        yield parent, parts[-1]
    finally:
        os.close(parent)


def fingerprint(tree, copy=None):
    if not tree or Path(os.fsdecode(git(tree, "rev-parse", "--show-toplevel").rstrip(b"\n"))) != Path(tree).resolve():
        raise Refused("Рабочее дерево задачи недоступно.")
    tree = Path(tree).resolve()
    digest = hashlib.sha256()
    digest.update(git(tree, "rev-parse", "HEAD"))
    index = git(tree, "ls-files", "--stage", "-z")
    digest.update(index)
    if git(tree, "ls-files", "--others", "--exclude-standard", "-z"):
        raise Refused("В дереве есть неигнорируемые файлы вне индекса. Добавьте исходники в индекс для проверки.")
    total = 0
    deadline = time.monotonic() + 10
    root = os.open(tree, os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for entry in index.split(b"\0")[:-1]:
            if time.monotonic() >= deadline:
                raise Refused("Превышен лимит времени подготовки снимка.")
            meta, path = entry.split(b"\t", 1)
            parts = os.fsdecode(path).split("/")
            mode, _, stage = meta.split()
            if stage != b"0" or mode == b"160000" or any(p.lower() in ("", ".", "..", ".git") for p in parts):
                raise Refused("В дереве есть конфликт, подмодуль или недопустимый путь.")
            digest.update(path + b"\0")
            target = copy.joinpath(*parts) if copy else None
            with open_entry(root, parts) as (parent, name):
                try:
                    info = os.stat(name, follow_symlinks=False, dir_fd=parent)
                except FileNotFoundError:
                    digest.update(b"deleted\0")
                    continue
                if stat.S_ISLNK(info.st_mode):
                    link = os.readlink(name, dir_fd=parent)
                    digest.update(b"link\0" + os.fsencode(link) + b"\0")
                    if target:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.symlink_to(link)
                    continue
                with os.fdopen(os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                       dir_fd=parent), "rb") as src:
                    info = os.fstat(src.fileno())
                    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                        raise Refused("Рабочее дерево содержит специальный файл или жёсткую ссылку.")
                    permissions = 0o755 if info.st_mode & 0o111 else 0o644
                    file_hash = hashlib.sha256()
                    if target:
                        target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open("wb") if target else contextlib.nullcontext() as dst:
                        while chunk := src.read(128 * 1024):
                            total += len(chunk)
                            if total > LIMIT or time.monotonic() >= deadline:
                                raise Refused("Превышен лимит размера или времени подготовки снимка.")
                            file_hash.update(chunk)
                            if dst:
                                dst.write(chunk)
                    if target:
                        target.chmod(permissions)
                    digest.update(str(permissions).encode() + b"\0" + file_hash.digest())
    finally:
        os.close(root)
    return digest.hexdigest()


def isolated(snapshot, policy, image, argv, needle, deadline, docker=DOCKER):
    name = "canopus-check-" + uuid.uuid4().hex
    args = (*docker, "create", "--name", name, "--pull", "never", "--network", "none",
            "--ipc", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--user", "65534:65534", "--memory", "512m", "--memory-swap", "512m",
            "--pids-limit", "64", "--cpus", "1", "--log-driver", "none",
            "--ulimit", "nofile=128:128", "--ulimit", "core=0:0",
            "--tmpfs", "/work:rw,nosuid,nodev,size=384m,mode=0755,uid=65534,gid=65534",
            "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777",
            "--mount", f"type=bind,source={snapshot},target=/snapshot,readonly",
            "--mount", f"type=bind,source={policy},target=/policy,readonly",
            "--workdir", "/work", "--env", "HOME=/tmp", "--entrypoint", "/bin/sh",
            image, "-c", BOOTSTRAP, "task-check", *argv)
    tail = bytearray()
    stderr_prefix = bytearray()
    overlap = b""
    found = not needle
    size = 0
    reason = ""
    proc = None
    created = False
    try:
        try:
            call(args)
        except subprocess.CalledProcessError as exc:
            tail.extend(exc.stderr[-TAIL:])
            raise Refused("Docker отклонил создание контейнера.") from None
        created = True
        if time.monotonic() >= deadline:
            raise TimeoutError
        proc = subprocess.Popen((*docker, "start", "--attach", name),
                                env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        with selectors.DefaultSelector() as pipes:
            pipes.register(proc.stdout, selectors.EVENT_READ, "stdout")
            pipes.register(proc.stderr, selectors.EVENT_READ, "stderr")
            while pipes.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError
                for key, _ in pipes.select(remaining):
                    chunk = os.read(key.fd, 16384)
                    if not chunk:
                        pipes.unregister(key.fileobj)
                        continue
                    size += len(chunk)
                    if key.data == "stderr":
                        take = min(len(chunk), len(READY) - len(stderr_prefix))
                        stderr_prefix.extend(chunk[:take])
                        # Keep startup errors in the diagnostic tail.
                        if bytes(stderr_prefix) == READY[:len(stderr_prefix)]:
                            chunk = chunk[take:]
                    elif not found:
                        window = overlap + chunk
                        found = needle in window
                        overlap = window[-(len(needle) - 1):] if len(needle) > 1 else b""
                    tail.extend(chunk)
                    del tail[:-TAIL]
                    if size > OUTPUT_LIMIT:
                        raise Refused("Превышен лимит вывода проверки.")
        status = proc.wait(timeout=max(0, deadline - time.monotonic()))
        if bytes(stderr_prefix) == READY:
            state = json.loads(call((*docker, "inspect", "--format", "{{json .State}}", name)))
            if state["OOMKilled"]:
                reason = "Превышен лимит памяти проверки."
            elif state["Error"] or state["Running"] or state["ExitCode"] != status:
                reason = "Docker не подтвердил код выхода проверки."
    except (TimeoutError, subprocess.TimeoutExpired):
        status, reason = -1, "Таймаут проверки."
    except Refused as exc:
        status, reason = -1, str(exc)
    except (OSError, ValueError, subprocess.SubprocessError):
        status, reason = -1, "Не удалось запустить или наблюдать изолированную проверку."
    finally:
        if proc is not None:
            # Detach the reader first so an output flood cannot stall daemon cleanup.
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            proc.stdout.close()
            proc.stderr.close()
        if created:
            try:
                call((*docker, "rm", "-f", name))
            except (OSError, subprocess.SubprocessError):
                reason = (reason + " Docker не подтвердил удаление контейнера.").strip()
    if bytes(stderr_prefix) != READY and not reason.startswith("Таймаут"):
        reason = ("Изоляция недоступна. " + reason).strip()
    truncated = size > TAIL + len(READY)
    output = tail.decode("utf-8", "replace")
    if truncated:
        output = "[вывод обрезан]\n" + output
    return {"exit": status, "contains": found, "tail": output,
            "truncated": truncated, "error": reason}


def policy_snapshot(registry, registry_data, destination=None):
    digest = hashlib.sha256(Path(__file__).read_bytes())
    digest.update(registry_data)
    for relative in registry["assets"]:
        data = (INSTALLED / relative).read_bytes()
        digest.update(os.fsencode(relative) + b"\0" + hashlib.sha256(data).digest())
        if destination:
            target = destination / "scripts" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o644)
    return digest.hexdigest()


def check_command(commands):
    if len(commands) == 1:
        return commands[0]
    series = "import json,subprocess,sys; results = [subprocess.call(argv) for argv in json.loads(sys.argv[1])]; sys.exit(any(results))"
    return ("python3", "-I", "-c", series, json.dumps(commands))


def local_image():
    return call((*DOCKER, "image", "inspect", "--format", "{{.Id}}", IMAGE)).decode().strip()


def evaluate(card, tree, sandbox=isolated, image_of=local_image, stopped_version=""):
    result = {"status": "error", "criterion": "", "tree": "", "reason": "", "checks": []}
    try:
        original = card_bytes(card)
        registry_data = REGISTRY.read_bytes()
        registry = load_registry(registry_data)
        checks = parse(original.decode("utf-8"), registry)
        if not checks:
            return dict(result, status="absent")
        with tempfile.TemporaryDirectory(prefix="canopus-check-") as folder:
            snapshot = Path(folder, "snapshot")
            snapshot.mkdir(mode=0o755)
            policy = Path(folder, "policy")
            definition = policy_snapshot(registry, registry_data, policy)
            try:
                result["tree"] = fingerprint(tree, snapshot)
            except (OSError, subprocess.SubprocessError):
                raise Refused("Рабочее дерево задачи недоступно.") from None
            try:
                image = image_of()
            except (OSError, subprocess.SubprocessError):
                raise Refused("Изоляция недоступна: требуется локальный образ проверки Docker.") from None
            result["image"] = image
            result["registry_version"] = registry["version"]
            result["criterion"] = hashlib.sha256(repr((definition, checks, image)).encode()).hexdigest()
            if result["criterion"] == stopped_version:
                return dict(result, status="paused", reason="Пауза: три неуспеха; требуется явное возобновление.")
            deadline = time.monotonic() + 30
            for ident, expected, needle in checks:
                if time.monotonic() >= deadline:
                    result["reason"] = "Исчерпан общий лимит времени критерия."
                    break
                entry = registry["checks"][ident]
                argv = check_command(entry["commands"])
                verdict = sandbox(snapshot, policy, image, argv, needle, deadline)
                passed = not verdict["error"] and verdict["exit"] == expected and verdict["contains"]
                result["checks"].append(dict(verdict, id=ident, version=entry["version"], passed=passed))
                if verdict["error"]:
                    result["reason"] = verdict["error"].strip()
                    break
            try:
                changed = (card_bytes(card) != original or fingerprint(tree) != result["tree"]
                           or REGISTRY.read_bytes() != registry_data
                           or policy_snapshot(registry, registry_data) != definition or image_of() != image)
            except (OSError, Refused, subprocess.SubprocessError):
                changed = True
            if changed:
                return dict(result, status="stale", reason="Критерий или рабочее дерево изменились во время проверки.")
            if result["reason"]:
                return result
            if all(item["passed"] for item in result["checks"]):
                return dict(result, status="passed", reason="Машинный критерий выполнен для проверенного снимка. Ожидаются ворота процесса.")
            failed = ", ".join(item["id"] for item in result["checks"] if not item["passed"])
            return dict(result, status="failed", reason=f"Критерий не выполнен ({failed}).")
    except Refused as exc:
        result["reason"] = str(exc)
    except (KeyError, TypeError, AttributeError, tomllib.TOMLDecodeError):
        result["reason"] = "Установленный реестр проверок повреждён."
    except UnicodeError:
        result["reason"] = "Карточка и реестр должны быть в UTF-8."
    except OSError:
        result["reason"] = "Карточка или файлы установленного реестра недоступны."
    return result


if __name__ == "__main__":
    if sys.argv[1:] == ["--policy-paths"]:
        print("\n".join(load_registry(REGISTRY.read_bytes())["assets"]))
    else:
        stopped_version = sys.argv[3] if len(sys.argv) > 3 else ""
        print(json.dumps(evaluate(sys.argv[1], sys.argv[2], stopped_version=stopped_version), ensure_ascii=True))
