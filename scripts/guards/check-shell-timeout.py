# -*- coding: utf-8 -*-
"""Страж сроков у дочерних процессов хаба (задача 317).

Зачем: Command.output() уже останавливал живой хаб; supervised(timeout:) не убивает
    ребёнка на используемом toolchain. Текст рядом с запуском не доказывает надзор.
Проверяет: в src/**/*.nv каждый вызов .output() запрещён без исключений; .start()
    требует .tree(Tree.Group) у запускаемой команды и wait_timeout + kill у полученного
    ребёнка в той же функции либо проверенную передачу keep_link -> watch_child /
    stt_start -> stt_keep. Тела делегатов проверяются в том же источнике git.
    Комментарии, строки и маркеры не дают разрешений; скобки разбираются лексически.
Не проверяет: *_test.nv (дети тестов — ответственность тестового контура), другие языки,
    динамический поток управления и типы Nova. Это консервативная синтаксическая проверка:
    неподдержанный способ получить Child, вложенные fn у запуска и сломанная лексика
    отклоняются, а не получают разрешение по соседним токенам. Исключений по пути нет.
Правило: doc/canon/no-silent-waits.md, правила 1 и 4; задача 317.
"""
import sys

sys.dont_write_bytecode = True

import collections
import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

IDENT = re.compile(r"[A-Za-z_]\w*\Z")
TOKEN = re.compile(r"\w+|=>|->|==|!=|[^\s]")
Function = collections.namedtuple("Function", "name params body end")
# Not exemptions: the exact callee, consumed parameter and body must still verify.
DELEGATES = {
    ("src/acp/link.nv", "keep_link"): ("watch_child", 0),
    ("src/server/front/sttproc.nv", "stt_start"): ("stt_keep", 1),
}


class LexError(ValueError):
    def __init__(self, pos, message):
        super().__init__(message)
        self.pos = pos


def code_only(text):
    """Mask non-code without changing offsets/newlines, including nested interpolation quotes."""
    def comment(i):
        if text.startswith("//", i):
            end = text.find("\n", i)
            return len(text) if end < 0 else end
        start, depth = i, 1
        i += 2
        while i < len(text):
            if text.startswith("/*", i):
                depth += 1
                i += 2
            elif text.startswith("*/", i):
                depth -= 1
                i += 2
                if not depth:
                    return i
            else:
                i += 1
        raise LexError(start, "незакрытый комментарий")

    def quoted(i):
        start = i
        quote = text[i]
        delimiter = quote * (3 if text.startswith(quote * 3, i) else 1)
        i += len(delimiter)
        while i < len(text):
            if text[i] == "\\":
                i += 2
            elif text.startswith(delimiter, i):
                return i + len(delimiter)
            elif quote == '"' and text.startswith("${", i):
                i = interpolation(i + 2)
            else:
                i += 1
        raise LexError(start, "незакрытая строка")

    def interpolation(i):
        start, depth = i, 1
        while i < len(text):
            if text.startswith(("//", "/*"), i):
                i = comment(i)
            elif text[i] in "\"'":
                i = quoted(i)
            elif text[i] == "{":
                depth += 1
                i += 1
            elif text[i] == "}":
                depth -= 1
                i += 1
                if not depth:
                    return i
            else:
                i += 1
        raise LexError(start, "незакрытая интерполяция")

    out = list(text)
    i = 0
    while i < len(text):
        literal = text[i] in "\"'"
        if literal or text.startswith(("//", "/*"), i):
            end = quoted(i) if literal else comment(i)
            for j in range(i, end):
                if text[j] not in "\r\n":
                    out[j] = " "
            if literal:
                out[i] = "\x01"  # a literal is an argument, never an identifier or a code token
            i = end
        elif text[i] == "`":
            raise LexError(i, "неподдержанная кавычка в коде")
        else:
            i += 1
    return "".join(out)


class Code:
    def __init__(self, text):
        self.text = code_only(text)
        matches = list(TOKEN.finditer(self.text))
        self.tokens = [m.group() for m in matches]
        self.positions = [m.start() for m in matches]
        self.pairs = {}
        self.scopes = []
        stack, braces = [], []
        for i, token in enumerate(self.tokens):
            self.scopes.append(tuple(braces))
            if token in ("(", "[", "{"):
                stack.append(i)
                if token == "{":
                    braces.append(i)
            elif token in (")", "]", "}"):
                if not stack or self.tokens[stack[-1]] != {")": "(", "]": "[", "}": "{"}[token]:
                    raise LexError(self.positions[i], "несогласованные скобки")
                opening = stack.pop()
                self.pairs[opening] = i
                if token == "}":
                    braces.pop()
        if stack:
            raise LexError(self.positions[stack[-1]], "незакрытая скобка")
        self.functions = []
        self.signatures = set()
        t = self.tokens
        for i, token in enumerate(t):
            if token != "fn":
                continue
            p = i + 1
            while p < len(t) and t[p] not in ("(", "{", "}", "fn", "=>"):
                p += 1
            if p >= len(t) or t[p] != "(":
                continue
            j = self.pairs[p] + 1
            while j < len(t) and t[j] not in ("{", "}", "fn", "=>"):
                j = self.pairs[j] + 1 if j in self.pairs else j + 1
            self.signatures.update(range(i, j))
            if j < len(t) and t[j] == "{":
                name = t[i + 1] if p == i + 2 else ""  # delegates must be plain named functions
                self.functions.append(Function(name, p, j, self.pairs[j]))

    def enclosing(self, i):
        found = [fn for fn in self.functions if fn.body < i < fn.end]
        return min(found, key=lambda fn: fn.end - fn.body) if found else None

    def simple(self, i):
        return (0 <= i < len(self.tokens) and IDENT.fullmatch(self.tokens[i]) is not None
                and (i == 0 or self.tokens[i - 1] not in (".", "@")))

    def args(self, opening):
        """Top-level argument/parameter token lists; nested commas stay inside their argument."""
        end = self.pairs[opening]
        if opening + 1 == end:
            return []
        result, start, i = [], opening + 1, opening + 1
        while i < end:
            if self.tokens[i] == ",":
                result.append(self.tokens[start:i])
                start = i + 1
            i = self.pairs[i] + 1 if i in self.pairs else i + 1
        if start < end:
            result.append(self.tokens[start:end])
        return result

    def calls(self, lo, hi, receiver, method):
        t = self.tokens
        return [i for i in range(lo, hi - 3)
                if self.simple(i) and t[i:i + 4] == [receiver, ".", method, "("]
                and self.pairs[i + 3] < hi]

    def nested(self, fn):
        return "fn" in self.tokens[fn.body + 1:fn.end]


def grouped(code, fn, receiver, launch):
    """A group setter of THIS command before THIS launch, in an enclosing scope."""
    t = code.tokens
    setters = code.calls(fn.body + 1, launch, receiver, "tree")
    if not setters:
        return False
    last = setters[-1]
    if code.args(last + 3) != [["Tree", ".", "Group"]]:
        return False
    scope = code.scopes[last]
    if code.scopes[launch][:len(scope)] != scope:
        return False
    # Rebinding the command invalidates an earlier setter (also catches shadow declarations).
    return not any(t[i:i + 2] == [receiver, "="] for i in range(last + 4, launch))


def child_region(code, fn, dot):
    """Recognize the consumed Child from a match arm, a match result or start()?; else fail closed."""
    t = code.tokens
    receiver = dot - 1
    end = code.pairs[dot + 2]
    if end != dot + 3 or not code.simple(receiver):
        return None
    if t[receiver - 1:receiver] != ["match"]:
        if (receiver >= 3 and t[receiver - 3] == "consume" and t[receiver - 1] == "="
                and t[end + 1:end + 2] == ["?"]):
            return t[receiver - 2], end + 2, code.pairs[code.scopes[receiver][-1]]
        return None
    opening = end + 1
    if t[opening:opening + 1] != ["{"]:
        return None
    closing = code.pairs[opening]
    arms = []
    i = opening + 1
    while i < closing:
        if t[i:i + 3] == ["Ok", "(", "consume"]:
            arms.append(i)
        i = code.pairs[i] + 1 if i in code.pairs else i + 1
    if len(arms) != 1:
        return None
    arm = arms[0]
    if t[arm + 4:arm + 6] != [")", "=>"] or not code.simple(arm + 3):
        return None
    child, value = t[arm + 3], arm + 6
    # consume child = match command.start() { Ok(consume c) => c, Err(e) => return ... }
    assigned = (receiver >= 4 and t[receiver - 4] == "consume" and t[receiver - 2] == "=")
    if assigned:
        if t[value] != child or t[value + 1] not in (",", "Err", "}"):
            return None
        return t[receiver - 3], closing + 1, code.pairs[code.scopes[receiver][-1]]
    # match command.start() { Ok(consume child) => { ... } }
    if t[value] == "{":
        return child, value + 1, code.pairs[value]
    return None


def binding_uses(code, child, lo, hi):
    """Stop at rebinding/shadowing; follow only an exact, scoped consumed rename."""
    t = code.tokens
    i = lo
    while i < hi:
        if t[i:i + 2] == [child, "="] or (t[i] in ("consume", "ro", "mut") and t[i + 1:i + 2] == [child]):
            return
        if (t[i] == "consume" and i + 3 < hi and t[i + 2:i + 4] == ["=", child]
                and code.simple(i + 1)):
            after = i + 4
            gap = code.text[code.positions[after - 1]:code.positions[after]] if after < hi else "\n"
            exact = (after == hi or (t[after] not in (".", "(", "[", "?", "+", "-", "*", "/")
                                     and ("\n" in gap or t[after] in (";", "}"))))
            if exact:
                child = t[i + 1]
                hi = min(hi, code.pairs[code.scopes[i][-1]])
                i = after
                continue
            # consume pipe = child.take_stdout() extracts a pipe; it does not rename Child.
        yield i, child
        i += 1


def lifecycle(code, child, lo, hi, allow_stop=False):
    """Evidence must refer to the live consumed binding, never an earlier/later namesake."""
    t = code.tokens
    waited = killed = False
    for i, child in binding_uses(code, child, lo, hi):
        if not code.simple(i) or t[i:i + 2] != [child, "."] or i + 3 >= hi or t[i + 3] != "(":
            continue
        args = code.args(i + 3)
        waited |= t[i + 2] == "wait_timeout" and bool(args)
        killed |= (t[i + 2] == "kill" and bool(args)) or (allow_stop and t[i + 2] == "stop" and not args)
    return waited and killed


def delegated(code, path, fn, child, lo, hi):
    mapping = DELEGATES.get((path, fn.name))
    if mapping is None:
        return False
    name, argument = mapping
    targets = [target for target in code.functions if target.name == name]
    if len(targets) != 1 or code.nested(targets[0]):
        return False
    target = targets[0]
    params = code.args(target.params)
    if len(params) <= argument:
        return False
    param = params[argument]
    if len(param) != 3 or param[0] != "consume" or param[2] != "Child":
        return False
    if not lifecycle(code, param[1], target.body + 1, target.end, allow_stop=True):
        return False
    t = code.tokens
    for i, child in binding_uses(code, child, lo, hi):
        if code.simple(i) and t[i:i + 2] == [name, "("]:
            args = code.args(i + 1)
            if len(args) == len(params) and args[argument] == [child]:
                return True
    return False


def watched(code, path, dot):
    fn = code.enclosing(dot)
    if fn is None or code.nested(fn) or not code.simple(dot - 1):
        return False
    if not grouped(code, fn, code.tokens[dot - 1], dot - 1):
        return False
    region = child_region(code, fn, dot)
    if region is None:
        return False
    child, lo, hi = region
    return lifecycle(code, child, lo, hi) or delegated(code, path, fn, child, lo, hi)


def judge(source, args, rep):
    count = 0
    for entry in source.changed():
        path = entry.path
        if (not path.startswith("src/") or not path.endswith(".nv")
                or path.endswith("_test.nv") or entry.mode == "160000"):
            continue
        data = source.read(entry)
        if data is None:
            continue
        count += 1
        text = data.decode("utf-8", "replace").lstrip("\ufeff")
        try:
            code = Code(text)
        except LexError as exc:
            rep.add(path, text.count("\n", 0, exc.pos) + 1, "lexical", str(exc))
            continue
        t = code.tokens
        for i in range(len(t) - 2):
            if i in code.signatures or t[i] != "." or t[i + 2] != "(":
                continue
            line = text.count("\n", 0, code.positions[i]) + 1
            if t[i + 1] == "output":
                rep.add(path, line, "no-deadline", "output() запрещён: используйте общий command_run_timed")
            elif t[i + 1] == "start" and not watched(code, path, i):
                rep.add(path, line, "no-watch", "start() требует Tree.Group у команды и wait_timeout + kill у её ребёнка или проверенного делегата")
    # a tree without src is not the target of this guard: nothing to judge, not a failure
    if count == 0:
        return guardlib.Outcome(nothing="нет ни одного .nv в src")
    return guardlib.Outcome(count=count)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-shell-timeout", "файлов .nv в src", judge))
