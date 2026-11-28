#!/usr/bin/env python3
"""Страж технического письма для Markdown (задача 330).

Зачем: найти двусмысленную норму и подсказать, где разбить длинное предложение.
Проверяет: новые и изменённые .md. По запросу осматривает отслеживаемые .md в docs/.
Не проверяет: смысл, грамматику, код, команды в разметке кода и цитаты.
Правило: конвенция технического письма, редакция 1.2, §2; docs/canon/README.md.
"""
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
import guardlib


LIST = re.compile(r"^ *(?:[-+*]|\d+[.)]) +(?:\[[ xX]\] +)?")
HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.+)")
INSTRUCTION = re.compile(r"^(?:инструкци\w*|порядок действий|шаги\b|как\s+\w+)", re.I)
COMMAND = re.compile(r"^(?:\$ +|PS .+> *|>>> )")
# Оставляем видимый текст ссылки. Заменяем скрытые фрагменты пробелами с сохранением строк.
HIDDEN = re.compile(
    r"(?P<ticks>`+)(?!`).*?(?<!`)(?P=ticks)(?!`)|"
    r"<!--.*?(?:-->|\Z)|«[^»]*»|„[^“]*“|“[^”]*”|\"[^\"\n]*\"|"
    r"(?<=\])\([^\n]*?\)|"
    r"https?://[^\s<>\])]+(?<![.!?…])",
    re.S,
)
SENTENCES = re.compile(r"\S.*?(?:[.!?…]+(?=\s|$)|$)", re.S)
WORD = re.compile(r"[А-Яа-яЁёA-Za-z]+(?:-[А-Яа-яЁёA-Za-z]+)*")
RUSSIAN = re.compile(r"[А-Яа-яЁё]")
AMBIGUOUS = re.compile(r"^[*_]*должно\s+быть\s+(?:не\s+)?(?:можно|возможно)\b", re.I)


def prose_lines(text):
    """Сохраняет номера строк и границы абзацев при пропуске блоков Markdown."""
    fence = None
    quote = False
    list_indent = 0
    for line in text.split("\n"):
        line = line.rstrip("\r")
        item = LIST.match(line)
        if item:
            list_indent = item.end()
        elif line.strip() and len(line) - len(line.lstrip(" ")) < list_indent:
            list_indent = 0
        body = (line[item.end():] if item else line).lstrip()
        marker = guardlib.FENCE.match(body)
        if fence:
            if marker and not marker[3].strip() and marker[2].startswith(fence):
                fence = None
            yield ""
        elif body.startswith(">") or (quote and body and not (item or HEADING.match(body) or marker)):
            quote = True
            yield ""
        else:
            quote = False
            if marker and (marker[2][0] == "~" or "`" not in marker[3]):
                fence = marker[2]
                yield ""
            elif (not item and line[list_indent:].startswith(("    ", "\t"))) or COMMAND.match(body):
                yield ""
            else:
                yield line


def paragraphs(text):
    """Номера строк и порог для абзацев и пунктов. Заголовки задают порог раздела."""
    current = []
    levels = []
    number = 1
    limit = 25
    prose = "\n".join(prose_lines(text))
    prose = HIDDEN.sub(lambda match: re.sub(r"[^\n]", " ", match[0]), prose)
    for line_no, line in enumerate(prose.split("\n"), 1):
        heading = HEADING.match(line)
        item = LIST.match(line)
        boundary = heading or item or not line.strip() or line.lstrip().startswith("|")
        if boundary and current:
            yield number, limit, "\n".join(current)
            current = []
        if heading:
            depth = len(heading[1])
            while levels and levels[-1][0] >= depth:
                levels.pop()
            levels.append((depth, bool(INSTRUCTION.match(heading[2])) or bool(levels and levels[-1][1])))
        elif item or not boundary:
            if not current:
                number = line_no
                # Нумерованные шаги — инструкция даже вне раздела «Инструкция».
                numbered = item and item[0].lstrip()[0].isdigit()
                limit = 20 if numbered or (levels and levels[-1][1]) else 25
            current.append(line[item.end():] if item else line)
    if current:
        yield number, limit, "\n".join(current)


def changed_paths(source, base):
    args = ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=AMT"]
    if source.mode == "index":
        args.append("--cached")
    if base:
        ref = guardlib.git(source.root, "rev-parse", "--verify", "--end-of-options", base + "^{commit}")
        args.append(ref.decode("ascii").strip())
    elif source.mode == "tree":
        head = guardlib.git(source.root, "rev-parse", "--verify", "--quiet", "HEAD", check=False)
        if head:
            args.append("HEAD")
        else:
            args.append("--cached")
    raw = guardlib.git(source.root, *args, "--", ":(icase,glob)**/*.md")
    if source.mode == "tree" and not base:
        raw += guardlib.git(source.root, "ls-files", "--others", "--exclude-standard", "-z", "--",
                           ":(icase,glob)**/*.md")
    return {path.decode("utf-8", "replace") for path in raw.split(b"\0") if path}


def judge(source, args, report):
    if (args.all_docs or args.base) and source.mode != "tree":
        raise guardlib.Unavailable("--all-docs и --base работают с рабочей копией")
    if args.all_docs:
        entries = [entry for entry in source.entries() if entry.path.startswith("docs/")]
    elif source.mode == "commit":
        entries = source.changed()
    else:
        paths = changed_paths(source, args.base)
        entries = [entry for entry in source.entries() if entry.path in paths]
        if source.mode == "tree" and not args.base:
            entries.extend(guardlib.Entry(path, "100644", "") for path in
                           sorted(paths - source.paths()))

    count = 0
    for entry in entries:
        if not entry.path.lower().endswith(".md") or not entry.mode.startswith("100"):
            continue
        path = Path(source.root) / entry.path
        if source.mode == "tree" and path.is_symlink():
            continue
        data = source.read(entry)
        if data is None:
            continue
        count += 1
        view = guardlib.FileView(entry.path, data)
        for first_line, limit, paragraph in paragraphs(view.text.lstrip("\ufeff")):
            for match in SENTENCES.finditer(paragraph):
                sentence = match[0]
                line = first_line + paragraph.count("\n", 0, match.start())
                if AMBIGUOUS.match(sentence):
                    view.report(report, "implicit-actor", line,
                                "§2: назовите исполнителя и уточните, что требуется или разрешается")
                if RUSSIAN.search(sentence):
                    words = len(WORD.findall(sentence))
                    if words > limit:
                        print(f"подсказка {entry.path}:{line}: sentence-length: "
                              f"§2: {words} слов, ориентир {limit}. Проверьте, можно ли разделить предложение.")
    if not count:
        return guardlib.Outcome(nothing="нет .md для проверки")
    return guardlib.Outcome(count=count)


def main():
    def extra(parser):
        scope = parser.add_mutually_exclusive_group()
        scope.add_argument("--base", metavar="REF", help="проверить изменения рабочей копии относительно REF")
        scope.add_argument("--all-docs", action="store_true", help="осмотреть весь отслеживаемый корпус docs/")

    return guardlib.run("check-tech-writing", "документов", judge, extra=extra)


if __name__ == "__main__":
    sys.exit(main())
