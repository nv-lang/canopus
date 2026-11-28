# -*- coding: utf-8 -*-
"""Самотест стража технического письма.

Зачем: проверить пороги, исключения и выбор документов в разных режимах git.
Проверяет: красную норму, исправление, разметку Markdown, строки и код возврата.
Не проверяет: смысл исходного текста.
Правило: конвенция технического письма, редакция 1.2, §2; задача 330.
"""
import sys

sys.dont_write_bytecode = True
import stlib

BAD = "Должно быть можно повторить выгрузку.\n"
GOOD = "Оператор может повторить выгрузку.\n"


def sentence(words):
    return "Сервис " + "слово " * (words - 2) + "проверяет."


def main():
    probes = stlib.Probes("check-tech-writing")
    base = probes.mkdtemp()
    env = stlib.isolated_env(base)

    def check(repo, *args):
        return stlib.guard("check-tech-writing.py", repo, env, *args)

    def corrected():
        repo = stlib.make_repo(base, env, {}, name="corrected")
        stlib.write_files(repo, {"README.md": GOOD + "Клиент должен сохранить ответ.\n"})
        proc = check(repo)
        stlib.expect(proc, 0, "ок: осмотрено 1 документов")
        assert "подсказка " not in proc.out, proc.out
        stlib.git(repo, env, "add", "--", "README.md")
        stlib.expect(check(repo), 0, "ок: осмотрено 1 документов")

    def red():
        repo = stlib.make_repo(base, env, {}, name="red")
        stlib.write_files(repo, {"новый файл.MD": "# Описание\n\nСначала выгрузите отчёт.\nДолжно быть\nможно повторить выгрузку.\n"})
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL: check-tech-writing: 1 нарушений")
        assert stlib.has_line(proc, "FAIL новый файл.MD:4: implicit-actor:"), proc.out

    def exclusions():
        repo = stlib.make_repo(base, env, {}, name="markup")
        text = (
            "> Пользователь спросил.\n" + BAD + "\n"
            "`" + BAD.rstrip() + "`\n\n"
            "«" + BAD + sentence(35) + "»\n\n"
            '"Должно быть возможно повторить выгрузку."\n\n'
            "````shell\n```\n" + BAD + "````\n\n"
            "    " + BAD + "\n"
            "- ~~~text\n  " + BAD + "  ~~~\n\n"
            '$ printf "' + BAD.rstrip() + '"\n\n'
            "<!--\n" + BAD + "-->\n\n"
            "| " + BAD.rstrip() + " |\n\n"
            + GOOD
        )
        stlib.write_files(repo, {"docs/markup.md": text})
        proc = check(repo)
        stlib.expect(proc, 0, "ок: осмотрено 1 документов")
        assert "подсказка " not in proc.out, proc.out

    def limits():
        repo = stlib.make_repo(base, env, {}, name="limits")
        text = (
            "# Описание\n\n" + sentence(25) + "\n" + sentence(26) +
            "\n\n## Инструкция\n\n" + sentence(20) + "\n" + sentence(21) +
            "\n\n## Описание\n\n10. " + sentence(21).replace("слово ", "слово\n    ", 1) + "\n"
        )
        stlib.write_files(repo, {"docs/limits.md": text})
        proc = check(repo)
        stlib.expect(proc, 0, "ок: осмотрено 1 документов")
        hints = [line for line in proc.out.splitlines() if line.startswith("подсказка ")]
        assert len(hints) == 3, proc.out
        assert "limits.md:4: sentence-length: §2: 26 слов, ориентир 25" in hints[0], proc.out
        assert "limits.md:9: sentence-length: §2: 21 слов, ориентир 20" in hints[1], proc.out
        assert "limits.md:13: sentence-length: §2: 21 слов, ориентир 20" in hints[2], proc.out

    def changes():
        repo = stlib.make_repo(base, env, {"docs/old.md": BAD, "docs/edited.md": GOOD}, name="changes")
        stlib.expect(check(repo), 0, "судить нечего:")
        stlib.expect(check(repo, "--all-docs"), 1, "FAIL: check-tech-writing: 1 нарушений")
        stlib.write_files(repo, {"docs/edited.md": BAD, "ignored.txt": BAD})
        stlib.expect(check(repo, "--index"), 0, "судить нечего:")
        stlib.expect(check(repo), 1, "FAIL: check-tech-writing: 1 нарушений")
        stlib.git(repo, env, "add", "--", "docs/edited.md")
        stlib.write_files(repo, {"docs/edited.md": GOOD})
        proc = check(repo, "--index")
        stlib.expect(proc, 1, "FAIL: check-tech-writing: 1 нарушений")
        assert stlib.has_line(proc, "FAIL docs/edited.md:1: implicit-actor:"), proc.out
        sha = stlib.commit_file(repo, env, "docs/edited.md", BAD)
        stlib.expect(check(repo, "--ci", "--base", "HEAD~1"), 1, "FAIL: check-tech-writing: 1 нарушений")
        stlib.expect(check(repo, "--commit", sha), 1, "FAIL: check-tech-writing: 1 нарушений")
        stlib.expect(check(repo), 0, "судить нечего:")
        stlib.git(repo, env, "rm", "--", "docs/old.md")
        stlib.expect(check(repo, "--index"), 0, "судить нечего:")

    probes.probe("законное", "явный исполнитель и точная степень обязательности", corrected)
    probes.probe("красная", "двусмысленная норма с продолжением на следующей строке", red)
    probes.probe("иной-синтаксис", "цитаты, команды, примеры кода, комментарии и таблицы", exclusions)
    probes.probe("законное", "20 и 25 слов, подсказки на 21 и 26, номера строк", limits)
    probes.probe("мишень", "новый и изменённый текст, индекс, коммит, база CI и аудит корпуса", changes)
    return probes.done()


if __name__ == "__main__":
    sys.exit(main())
