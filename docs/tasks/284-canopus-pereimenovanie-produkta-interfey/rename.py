# -*- coding: utf-8 -*-
# Однократная механическая замена CrewHarness -> Canopus (задача 284), запущена один раз на базе
# 211161e2. Лежит в истории задачи как документированная карта переименования; повторно не запускать.
# Правила упорядочены: длинные образцы первыми. Область — активные файлы; история doc/tasks,
# doc/archive, doc/research, spikes и решения doc/canon/decisions не трогаются.
import os
import re
import subprocess
import sys

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                      text=True).stdout.strip()
os.chdir(ROOT)

RULES = [
    (re.compile(r"OPENCODE_CREW_"), "OPENCODE_CANOPUS_"),
    (re.compile(r"CREW_HARNESS"), "CANOPUS"),
    (re.compile(r"(?<![A-Z0-9_])CREW_"), "CANOPUS_"),
    (re.compile(r"crew_harness"), "canopus"),
    (re.compile(r"crew-harness"), "canopus"),
    (re.compile(r"CrewHarness"), "Canopus"),
    (re.compile(r"crewharness"), "canopus"),
    (re.compile(r"server_crew_live"), "server_canopus_live"),
    (re.compile(r"crew_hub"), "canopus_hub"),
    (re.compile(r"crew-hub"), "canopus-hub"),
    (re.compile(r"(?<![a-z0-9_])crew_(?=[a-z0-9_])"), "canopus_"),
    (re.compile(r"(?<![a-z0-9-])crew-(?=[a-z0-9-])"), "canopus-"),
    (re.compile(r"crew(?=[A-Z])"), "canopus"),
    (re.compile(r"Crew(?=[A-Z])"), "Canopus"),
    (re.compile(r"(?<![A-Za-z])Crew(?![a-z])"), "Canopus"),
    (re.compile(r"(?<=/)crew(?![a-zA-Z0-9_-])"), "canopus"),
    (re.compile(r"(?<![a-z0-9_])crew\."), "canopus."),
]

SCOPE_DIRS = ("opencode-plugin/", "scripts/", "src/", "tools/", "doc/canon/", "doc/routes/",
              "machines/", ".github/")
SCOPE_FILES = ("README.md", "AGENTS.md", "nova.toml", ".opencode/crew-harness.json",
               "doc/README.md", "doc/issues.md", "doc/open-questions.md", ".gitignore", "LICENSE")
SKIP_DIRS = ("doc/canon/decisions/",)
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".pdf", ".zip",
              ".gz", ".tgz", ".7z", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3",
              ".mp4", ".mov", ".webm", ".wasm"}


def in_scope(path):
    if path.startswith(SKIP_DIRS):
        return False
    return path in SCOPE_FILES or path.startswith(SCOPE_DIRS)


def rewrite(text):
    for pattern, repl in RULES:
        text = pattern.sub(repl, text)
    return text


def main():
    files = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split()
    changed, renamed = 0, 0
    renames = []
    for path in files:
        if not in_scope(path):
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext in BINARY_EXT:
            continue
        with open(path, "rb") as handle:
            data = handle.read()
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        new = rewrite(text)
        if new != text:
            with open(path, "wb") as handle:
                handle.write(new.encode("utf-8"))
            changed += 1
        newpath = rewrite(path.replace("\\", "/"))
        if newpath != path:
            renames.append((path, newpath))
    for old, new in renames:
        os.makedirs(os.path.dirname(new), exist_ok=True)
        subprocess.run(["git", "mv", "-k", old, new], check=True)
        renamed += 1
    print("изменено файлов: %d, переименовано путей: %d" % (changed, renamed))


if __name__ == "__main__":
    sys.exit(main())
