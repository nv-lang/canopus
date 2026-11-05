# -*- coding: utf-8 -*-
"""Страж прежнего имени продукта: старые имена CrewHarness не встречаются в активных файлах.

Зачем: продукт переименован в Canopus одномоментно, без переходного периода (задача 284); старое имя,
    оставшееся в активном коде или документе, — это скрытый переходный период, который видно только
    машинной проверкой, а не вниманием.
Проверяет: все отслеживаемые текстовые файлы, кроме истории (doc/tasks, doc/archive, doc/research) и
    исследовательских репродукций (spikes), на образцы прежнего бренда: crew-harness, crew_harness,
    crewharness в любом регистре, CREW_*/OPENCODE_CREW_* переменные, идентификаторы crew_*/Crew*/crewXxx,
    имена файлов и папок с прежним брендом в активных областях. Сам себя и свой самотест не судит
    (образцы в них — предмет проверки), отрицательные проверки старых имён снимаются пометкой
    guard-allow(legacy-name) с причиной.
Не проверяет: исторические папки (имена там сохраняются по заданию), отдельное слово crew/Crew как
    термин методики в прозе (это не бренд продукта), содержимое бинарных файлов.
Правило: задача 284 «Canopus: переименование продукта, интерфейсов и текущих папок»; «старые команды и
    переменные больше не поддерживаются», исключения — только история, карта переименования и
    отрицательные тесты.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

# История, исследования и зафиксированные решения: имена там сохраняются заданием, страж их не судит.
EXEMPT_DIRS = ("doc/tasks/", "doc/archive/", "doc/research/", "spikes/", "doc/canon/decisions/")
# Сам страж и его самотест держат образцы как предмет проверки.
EXEMPT_PATHS = ("scripts/guards/check-no-legacy-name.py",
                "scripts/guards/selftest/test-check-no-legacy-name.py")

BRAND = re.compile(r"crew[-_]?harness", re.I)
ENV = re.compile(r"(?<![A-Z0-9_])CREW_[A-Z0-9_]+|(?<![A-Z0-9_])OPENCODE_CREW_[A-Z0-9_]+")
SNAKE = re.compile(r"(?<![a-z0-9_])crew_[a-z0-9_]+")
KEBAB = re.compile(r"(?<![a-z0-9-])crew-[a-z0-9-]+")
CAMEL = re.compile(r"crew[A-Z][A-Za-z0-9]*|Crew[A-Z][A-Za-z0-9]*")
TITLE = re.compile(r"(?<![A-Za-z])Crew(?![a-z])")

RULE = "legacy-name"


def exempt(path):
    return path.startswith(EXEMPT_DIRS) or path in EXEMPT_PATHS


def scan(text):
    """Список (образец, совпадение) одной строки."""
    found = []
    for label, pattern in (("бренд", BRAND), ("env", ENV), ("snake", SNAKE),
                           ("kebab", KEBAB), ("camel", CAMEL), ("титул", TITLE)):
        for m in pattern.finditer(text):
            found.append((label, m.group(0)))
    return found


def judge(source, args, rep):
    views, count = guardlib.judged_files(source)
    seen = 0
    for view in views:
        if exempt(view.path):
            continue
        seen += 1
        for lineno, line in enumerate(view.lines, 1):
            for label, match in scan(line):
                view.report(rep, RULE, lineno, "%s-имя «%s» прежнего продукта" % (label, match))
    for entry in source.changed():
        if exempt(entry.path):
            continue
        for label, match in scan(entry.path):
            rep.add(entry.path, None, RULE, "%s-имя «%s» в пути файла" % (label, match))
    return guardlib.Outcome(count=max(count, seen))


if __name__ == "__main__":
    sys.exit(guardlib.run("check-no-legacy-name", "файлов", judge,
                          lost="нет активных файлов для проверки"))
