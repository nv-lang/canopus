# -*- coding: utf-8 -*-
"""Самотест стража сроков check-shell-timeout.py.

Зачем: маркер, строка или чужой дедлайн не должны разрешать вечное ожидание хаба.
Проверяет: запрет каждого output(), привязку Tree.Group и жизненного цикла к конкретному
    start(), проверенные делегаты, лексические границы функций, отказ на сломанной лексике;
    рабочую копию, индекс и коммит с отличающимся содержимым. Красные пробы ловят заглушку.
Не проверяет: исполнение процессов Nova и сроки раннера (здесь только лёгкие фикстуры);
    *_test.nv явно исключены стражем, их процессы проверяет тестовый контур.
Правило: doc/canon/no-silent-waits.md, правила 1 и 4; задача 317.
"""
import sys

sys.dont_write_bytecode = True

import stlib

RUNNER = '''module canopus.process
export fn command_run_timed(mut command Command, timeout_ms int) Proc Time -> int {
    command.tree(Tree.Group)
    consume child = match command.start() {
        Ok(consume c) => c
        Err(e) => { return -1 }
    }
    consume so = child.take_stdout().unwrap()
    consume se = child.take_stderr().unwrap()
    supervised {
        match child.wait_timeout(timeout_ms.to_millis()) {
            Ok(None) => { ro killed = child.kill(Signal.Kill) }
            Ok(Some(s)) => ()
            Err(e) => ()
        }
    }
    0
}
'''

START = '''module canopus.demo
fn launch(mut command Command) Proc Time -> () {
    command.tree(Tree.Group)
    match command.start() {
        Err(e) => ()
        Ok(consume spawned) => {
            consume child = spawned
            ro waited = child.wait_timeout(5000.to_millis())
            ro killed = child.kill(Signal.Kill)
        }
    }
}
'''

WATCH = '''fn watch_child(consume child Child, kill ChanRx[int], inb ChanTx[Inbound], out ChanTx[str], marks ChanRx[int], stop CancelToken) Proc Time -> () {
    ro killed = child.kill(Signal.Kill)
    match child.wait_timeout(25.to_millis()) {
        Ok(Some(status)) => { out.close() }
        Ok(None) => ()
        Err(e) => ()
    }
    child.release()
}
'''
LINK = START.replace("fn launch(", "fn keep_link(").replace(
    "            ro waited = child.wait_timeout(5000.to_millis())\n            ro killed = child.kill(Signal.Kill)",
    "            supervised { watch_child(child, killing, inbound, outbound_end, marks.rx, stop) }") + WATCH

KEEP = '''fn stt_keep(cfg SttConfig, consume child Child, asks ChanRx[SttMgrAsk]) Proc Time -> () {
    while watching {
        if expired { ro killed = child.kill(Signal.Kill) }
        ro waited = child.wait_timeout(50.to_millis())
    }
    child.release()
}
'''
STT = START.replace("fn launch(", "fn stt_start(").replace(
    "            ro waited = child.wait_timeout(5000.to_millis())\n            ro killed = child.kill(Signal.Kill)",
    "            stt_keep(cfg, child, asks)") + KEEP

LINK_PATH = "src/acp/link.nv"
STT_PATH = "src/server/front/sttproc.nv"
RUN_PATH = "src/process/run.nv"
DEMO_PATH = "src/demo/run.nv"


def body(text):
    return "module canopus.demo\nfn ask(mut command Command) Proc Time -> () {\n" + text + "\n}\n"


def main():
    pr = stlib.Probes("check-shell-timeout")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files, commit=False):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0], commit=commit)

    def check(repo, *args):
        return stlib.guard("check-shell-timeout.py", repo, env, *args)

    def legal():
        repo = fresh({
            RUN_PATH: RUNNER,
            DEMO_PATH: START,
            LINK_PATH: LINK,
            STT_PATH: STT,
            "src/demo/ask.nv": body("    ro r = command_run_timed(command, 5000)"),
            "src/demo/run_test.nv": body("command.output()\ncommand.start()"),
            "elsewhere/run.nv": body("command.output()\ncommand.start()"),
        }, commit=True)
        for args in ((), ("--index",), ("--commit", "HEAD")):
            stlib.expect(check(repo, *args), 0, "ок:")

    def green(text, path=DEMO_PATH):
        stlib.expect(check(fresh({path: text})), 0, "ок:")

    def red(text, rule, path=DEMO_PATH, count=1):
        result = check(fresh({path: text}))
        stlib.expect(result, 1, "FAIL:")
        findings = [line for line in result.out.splitlines() if line.startswith("FAIL " + path + ":")]
        assert len(findings) == count, result.out
        assert all(": " + rule + ":" in line for line in findings), result.out

    pr.probe("законное", "раннер, оба делегата, тестовые исключения; tree/index/commit", legal)
    pr.probe("законное", "раннер разрешён по телу вне специального пути", lambda: green(RUNNER))
    pr.probe("законное", "Child из start()?", lambda: green(body(
        "command.tree(Tree.Group)\nconsume child = command.start()?\n"
        "child.wait_timeout(10.to_millis())\nchild.kill(Signal.Kill)")))
    pr.probe("законное", "проверенный stop в делегате", lambda: green(
        STT.replace("child.kill(Signal.Kill)", "child.stop()"), STT_PATH))
    pr.probe("иной-синтаксис", "пробелы, комментарии между токенами и CRLF", lambda: green(
        START.replace("command.tree(Tree.Group)", "command /* } */ . tree ( Tree . Group )")
        .replace("command.start()", "command\n . /* comment */ start ( )").replace("\n", "\r\n")))
    pr.probe("законное", "вызовы и скобки в строках и комментариях не код", lambda: green(body(r'''
// fn fake() { command.output(); command.start(); }
/* { command.output() /* nested } */ command.start() } */
ro a = "} command.output() fn counterfeit() {"
ro b = 'command.start() }'
ro c = "escaped \" } command.output()"
ro d = "${format("} .start() {")}"
ro e = """multiline {
command.output() command.start()
}"""
''')))

    outputs = {
        "голый output": "command.output()",
        "supervised не убивает output": "supervised(timeout: 50.to_millis()) { command.output() }",
        "дедлайн другого ребёнка": "other.wait_timeout(50.to_millis())\ncommand.output()",
        "вызов раннера рядом": "command_run_timed(other, 50)\ncommand.output()",
        "маркер не исключение": "// guard-shell-timeout: reviewed reason\ncommand.output()",
        "слова разрешения в строке": 'ro note = "Tree.Group wait_timeout supervised(timeout:)"\ncommand.output()',
        "слова разрешения в комментарии": "/* command_output_timed wait_timeout */\ncommand.output()",
        "supervised в другом блоке": "supervised(timeout: 50.to_millis()) { () }\ncommand.output()",
        "разорванный строками вызов": "command\n. /* comment */ output\n(\n)",
    }
    for name, text in outputs.items():
        pr.probe("красная", name, lambda text=text: red(body(text), "no-deadline"))
    pr.probe("красная", "поздний output в законном раннере", lambda: red(
        RUNNER.replace("    0\n}", "    command.output()\n    0\n}"), "no-deadline", RUN_PATH))
    pr.probe("красная", "routes_io не исключён целиком", lambda: red(
        RUNNER + body("command.output()"), "no-deadline", "src/server/routes_io.nv"))
    pr.probe("красная", "новый путь раннера не исключение", lambda: red(body("command.output()"), "no-deadline", RUN_PATH))

    starts = {
        "голый start": body("command.start()"),
        "голый start с маркером": body("// guard-shell-timeout: accepted reason\ncommand.start()"),
        "нет группы": START.replace("command.tree(Tree.Group)", "()"),
        "группа другой команды": START.replace("command.tree(Tree.Group)", "other.tree(Tree.Group)"),
        "группа в строке": START.replace("command.tree(Tree.Group)", 'ro note = "command.tree(Tree.Group)"'),
        "группа в комментарии": START.replace("command.tree(Tree.Group)", "/* command.tree(Tree.Group) */"),
        "Tree.Group как строковый аргумент": START.replace("Tree.Group", '"Tree.Group"'),
        "группа только в соседнем блоке": START.replace("command.tree(Tree.Group)", "if flag { command.tree(Tree.Group) }"),
        "команда подменена после группы": START.replace("command.tree(Tree.Group)", 'command.tree(Tree.Group)\ncommand = Command.new("other")'),
        "группа отменена": START.replace("command.tree(Tree.Group)", "command.tree(Tree.Group)\ncommand.tree(Tree.Inherit)"),
        "нет kill": START.replace("child.kill(Signal.Kill)", "child.release()"),
        "нет wait_timeout": START.replace("child.wait_timeout(5000.to_millis())", "child.wait()"),
        "имя wait_timeout не вызов": START.replace("child.wait_timeout(5000.to_millis())", "child.wait_timeout"),
        "wait другого ребёнка": START.replace("child.wait_timeout", "other.wait_timeout"),
        "kill другого ребёнка": START.replace("child.kill", "other.kill"),
        "wait у поля другого объекта": START.replace("child.wait_timeout", "other.child.wait_timeout"),
        "wait в строке": START.replace("child.wait_timeout(5000.to_millis())", '"child.wait_timeout(5000.to_millis())"'),
        "kill в комментарии": START.replace("child.kill(Signal.Kill)", "() /* child.kill(Signal.Kill) */"),
        "ребёнок подменён перед ожиданием": START.replace("ro waited", "consume child = another\n            ro waited"),
        "вызов метода не переименование Child": START.replace("consume child = spawned", "consume child = spawned\n                .other_child()"),
        "группа после запуска": START.replace("command.tree(Tree.Group)", "()").replace("consume child = spawned", "command.tree(Tree.Group)\nconsume child = spawned"),
        "supervised и release недостаточно": body("command.tree(Tree.Group)\nsupervised(timeout: 5.to_millis()) { command.start() }\nother.release()"),
        "дедлайн в другой функции": body("command.tree(Tree.Group)\ncommand.start()") + RUNNER,
        "вложенная функция не надзор": START.replace("ro waited =", "fn decoy() { ro waited =").replace("child.kill(Signal.Kill)", "child.kill(Signal.Kill) }"),
        "выражение start без контролируемого тела": "fn launch(command Command) Proc => command.start()\n" + RUNNER,
    }
    for name, text in starts.items():
        pr.probe("красная", name, lambda text=text: red(text, "no-watch"))
    pr.probe("красная", "второй start той же команды не наследует надзор", lambda: red(
        START.rsplit("}", 1)[0] + "match command.start() { Ok(consume child) => { child.release() } Err(e) => () }\n}\n", "no-watch"))
    pr.probe("красная", "надзор позднего одноимённого Child не спасает ранний", lambda: red(body(
        "command.tree(Tree.Group)\nconsume child = command.start()?\n"
        "{ consume child = command.start()?\nchild.wait_timeout(5.to_millis())\nchild.kill(Signal.Kill) }"), "no-watch"))
    pr.probe("красная", "два output на одной строке оба запрещены", lambda: red(
        body("command.output(); command.output()"), "no-deadline", count=2))
    pr.probe("красная", "однострочные функции разделены по скобкам", lambda: red(
        RUNNER.replace("\n", " ") + " fn bare(command Command) Proc { command.start() }", "no-watch"))

    delegation_cases = [
        ("нет тела watch_child", LINK.replace(WATCH, ""), LINK_PATH),
        ("нет тела stt_keep", STT.replace(KEEP, ""), STT_PATH),
        ("не тот путь", LINK, DEMO_PATH),
        ("не та функция запуска", LINK.replace("fn keep_link(", "fn unrelated("), LINK_PATH),
        ("передан другой ребёнок", LINK.replace("watch_child(child,", "watch_child(other,"), LINK_PATH),
        ("метод с тем же именем", LINK.replace("{ watch_child(child,", "{ other.watch_child(child,"), LINK_PATH),
        ("имя-суффикс не делегат", LINK.replace("{ watch_child(child,", "{ fake_watch_child(child,"), LINK_PATH),
        ("делегирование только в строке", STT.replace("stt_keep(cfg, child, asks)", '"stt_keep(cfg, child, asks)"'), STT_PATH),
        ("делегирование только в комментарии", STT.replace("stt_keep(cfg, child, asks)", "/* stt_keep(cfg, child, asks) */"), STT_PATH),
        ("не та позиция ребёнка", STT.replace("stt_keep(cfg, child, asks)", "stt_keep(child, cfg, asks)"), STT_PATH),
        ("вместо ребёнка строка", STT.replace("stt_keep(cfg, child, asks)", 'stt_keep(cfg, "child", asks)'), STT_PATH),
        ("делегату не передано владение", STT.replace("consume child Child", "child Child"), STT_PATH),
        ("делегат без группы при запуске", STT.replace("command.tree(Tree.Group)", "()"), STT_PATH),
        ("у делегата wait только в строке", STT.replace("child.wait_timeout(50.to_millis())", '"child.wait_timeout(50.to_millis())"'), STT_PATH),
        ("у делегата kill только в комментарии", LINK.replace("child.kill(Signal.Kill)", "() /* child.kill(Signal.Kill) */"), LINK_PATH),
        ("у делегата чужой wait", STT.replace("child.wait_timeout", "other.wait_timeout"), STT_PATH),
        ("у делегата чужой kill", LINK.replace("child.kill", "other.kill"), LINK_PATH),
        ("подмена тела делегата соседним", STT.replace(KEEP, "fn stt_keep(cfg SttConfig, consume child Child, asks ChanRx[SttMgrAsk]) { () }\n" + KEEP.replace("fn stt_keep(", "fn unrelated(")), STT_PATH),
    ]
    for name, text, path in delegation_cases:
        pr.probe("красная", name, lambda text=text, path=path: red(text, "no-watch", path))

    for text in (START[:-2], "}\n" + START, START + "/* unclosed", START + '"unclosed',
                 START.replace("match command.start() {", "match command.start() { )")):
        pr.probe("красная", "сломанная лексика не даёт разрешения", lambda text=text: red(text, "lexical"))

    def lines_preserved():
        text = body('/* comment {\n } */\nro note = "text\n }"\ncommand.output()')
        result = check(fresh({DEMO_PATH: text}))
        stlib.expect(result, 1, "FAIL:")
        expected = text[:text.index("command.output()")].count("\n") + 1
        assert stlib.has_line(result, "%s:%d: no-deadline:" % (DEMO_PATH, expected)), result.out

    pr.probe("иной-синтаксис", "номера строк после маскирования", lines_preserved)

    def snapshots():
        repo = fresh({STT_PATH: STT}, commit=True)
        safe_commit = stlib.head(repo, env)
        bad = STT.replace("child.kill(Signal.Kill)", "child.release()")
        stlib.write_files(repo, {STT_PATH: bad})
        stlib.expect(check(repo), 1, "FAIL:")
        stlib.expect(check(repo, "--index"), 0, "ок:")
        stlib.expect(check(repo, "--commit", safe_commit), 0, "ок:")
        bad_commit = stlib.commit_file(repo, env, STT_PATH, bad)
        stlib.write_files(repo, {STT_PATH: STT})
        stlib.expect(check(repo), 0, "ок:")
        stlib.expect(check(repo, "--index"), 1, "FAIL:")
        stlib.expect(check(repo, "--commit", bad_commit), 1, "FAIL:")
        stlib.expect(check(repo, "--commit", safe_commit), 0, "ок:")
        stlib.git(repo, env, "add", "--", STT_PATH)
        stlib.expect(check(repo, "--index"), 0, "ок:")
        stlib.expect(check(repo, "--commit", bad_commit), 1, "FAIL:")

    pr.probe("красная", "index/commit проверяют своё тело делегата, не рабочую копию", snapshots)

    def empty_src():
        repo = fresh({"README.md": ""})
        stlib.expect(check(repo), 0, "судить нечего:")

    pr.probe("мишень", "репозиторий без src — судить нечего", empty_src)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
