# -*- coding: utf-8 -*-
"""Самотест стража прежнего имени продукта check-no-legacy-name.py.

Зачем: страж, который пропускает старое имя в активном коде или краснит историю/отрицательную
    проверку, либо бесполезен, либо заставляет переписывать историю; обе дыры видны только пробами.
Проверяет: красные — бренд (crew-harness/crew_harness/CrewHarness в любом регистре), env CREW_* и
    OPENCODE_CREW_*, идентификаторы crew_*/crew-*/crewXxx/CrewXxx, титул Crew, имя файла с брендом,
    пометка без причины; зелёные — новые имена canopus, история doc/tasks, пометка
    guard-allow(legacy-name) с причиной, сам страж и этот самотест (образцы — предмет проверки).
Не проверяет: работу других стражей и содержимое бинарных файлов.
Правило: задача 284; исключения — только история, карта переименования и отрицательные проверки.
"""
import sys

sys.dont_write_bytecode = True

import stlib

OLD_SNAKE = "crew" + "_harness"
OLD_ENV = "CREW" + "_HOME"
OLD_TOOL = "crew" + "_send"
OLD_CAMEL = "crew" + "Send"
OLD_TYPE = "Crew" + "Config"
OLD_TITLE = "Crew"
OLD_KEBAB = "crew" + "-harness"


def main():
    pr = stlib.Probes("check-no-legacy-name")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-no-legacy-name.py", repo, env, *args)

    def red(files, needle):
        def fn():
            proc = check(fresh(files))
            stlib.expect(proc, 1, "FAIL: check-no-legacy-name:")
            assert stlib.has_line(proc, needle), proc.out
        return fn

    def green(files):
        def fn():
            stlib.expect(check(fresh(files)), 0, "ок: осмотрено")
        return fn

    clean = {"src/main.nv": "module canopus.main\n", "opencode-plugin/core.ts": "const x = 1\n"}

    pr.probe("законное", "новые имена canopus в активном коде", green(clean))
    pr.probe("законное", "история doc/tasks со старым именем не судится",
             green(dict(clean, **{"doc/tasks/099-x/log.md": "было %s\n" % OLD_KEBAB})))
    pr.probe("законное", "исследование spikes со старым именем не судится",
             green(dict(clean, **{"spikes/env/x.nv": "// %s\n" % OLD_SNAKE})))
    pr.probe("законное", "отрицательная проверка с пометкой и причиной",
             green(dict(clean, **{"opencode-plugin/test/x.test.mjs":
                                  "const old = '%s' // guard-allow(legacy-name): негативная проба старого env\n" % OLD_ENV})))
    pr.probe("законное", "сам страж со своими образцами зелёный",
             green({"scripts/guards/check-no-legacy-name.py": "# %s %s %s\n" % (OLD_KEBAB, OLD_ENV, OLD_TOOL),
                    "x.txt": "ok\n"}))
    pr.probe("красная", "бренд snake в активном коде",
             red({"src/x.nv": "module %s.x\n" % OLD_SNAKE}, "бренд-имя"))
    pr.probe("красная", "env CREW_* в коде",
             red({"s/x.ts": "const h = env('%s')\n" % OLD_ENV}, "env-имя"))
    pr.probe("красная", "env OPENCODE_CREW_* в коде",
             red({"s/x.ts": "env('OPENCODE_%s')\n" % OLD_ENV.replace("HOME", "SESSION")}, "OPENCODE_"))
    pr.probe("красная", "инструмент crew_* в схеме",
             red({"s/core.ts": "name: '%s'\n" % OLD_TOOL}, "snake-имя"))
    pr.probe("красная", "camelCase идентификатор",
             red({"s/x.ts": "function %s() {}\n" % OLD_CAMEL}, OLD_CAMEL))
    pr.probe("красная", "тип CrewXxx",
             red({"s/x.ts": "type X = %s\n" % OLD_TYPE}, OLD_TYPE))
    pr.probe("красная", "титул Crew в строке интерфейса",
             red({"s/ui.ts": "title: '%s'\n" % OLD_TITLE}, "титул-имя"))
    pr.probe("красная", "бренд в пути файла",
             red({"scripts/%s-answer.mjs" % OLD_KEBAB.split("-")[0]: "// x\n"}, "в пути файла"))
    pr.probe("красная", "пометка без причины — красный",
             red({"s/x.ts": "const h = '%s' // guard-allow(legacy-name):\n" % OLD_ENV},
                 "пометка без причины"))
    pr.probe("иной-синтаксис", "бренд в верхнем регистре тоже распознаётся",
             red({"s/x.ts": "const brand = '%s'\n" % OLD_KEBAB.upper()}, "бренд-имя"))
    pr.probe("мишень", "пустой репозиторий — мишень потеряна",
             lambda: stlib.expect(check(fresh({})), 1, "FAIL: мишень потеряна"))
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
