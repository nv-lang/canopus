# Собственные документальные пробы — expected до actual

Дополняет ранний `expected.json`. Не product tests, не реальный RED/GREEN,
не executable lifecycle model. Метод: фиксированные мысленные расписания против
текущего текста плюс read-only bytes/identity assertions. Ни один запрос/процесс
исторической сессии не исполняется.

## Группа 1: поддерживаемость и обязательный GREEN

G1: вход L, C до D — успешный close, zero user spawn/effect, B успешна.
G2: вход L, D до C, scoped процесс начат — scope terminal proof, close success в T.
G3: вход L, spawn→crash→нет PID record→recovery — тот же O/scope найден либо
доказанный fail-stop terminal; close success в T. Не принять STOP как PASS.
G4: L, потерян claim/сбой PID-write/два consumers — intent не забывается,
один effect/O, bounded success; always STOP отвергается.
G5: legacy PID без exact generation либо внешний delegated writer — unresolved
с точным остатком/HOLD; не назначать его L после удобного результата.

Положительный контроль: G1/G2 требуют именно success; отрицательный:
подставить always STOP для G3/G4, он должен нарушить AC-04/11/16.

## Группа 2: source/recipient/role/claim/consumer

O1: persisted A→открытый R, затем C(A), D позже — отказ старой O.
O2: persisted живой S→A, затем C(A), D позже — отказ, не retarget в B.
O3: новая B→B/иной открытый R — allow/один effect.
O4: .req/.claim до C, D после — отказ, zero user spawn.
O5: D до C, effect ещё не начат — отзыв, не начинать effect, terminal proof.
O6: received consumer до C, D effect после — deny; D раньше C — учёт terminal.
O7: связанный role item A, resolve после C(A) — не B; новый O только явно.
O8: независимая открытая role заявка живого S — B выбирается и проходит.
O9: role source A / legacy generation отсутствует — deny / quarantine unresolved.
O10: external consumer уже принял input — external ID/terminal либо unresolved,
не success по локальному inbox=0 и не wake A административным письмом.

Положительный контроль O3/O8; отрицательные — silent retarget O2/O7 и blanket-block
O3/O8 должны противоречить spec. Один лишь ID/timestamp не oracle ownership.

## Группа 3: raw/derivative/digest/privacy и сохранность B

P1: raw external freeze bytes/SHA совпадают с ранним derivative-expected;
в публичной производной только root/provenance изменены, files entries равны.
P2: актуальный dossier actual равен early expected64; 63-char historical expected
и mixed old/B list отвергаются, исходные ошибки не изменяются.
P3: шесть заданных run1 IDs первично owner=B, old run2 owner=A; отрицательная
подстановка B в old targets должна не пройти exact partition check.
P4: human-authored новые outputs/root3 без машинного root; точный небезопасный
byte diff только внешне, публично структурный redacted diff с явной маркировкой.
Не читать secret values/private-name list и не выдавать это за полный guards PASS.
P5: after проверяет все protected before entries, root3 copies, raw и prefixes;
никаких исключений для старых mutable root3 как будто они новые.

Положительный контроль — наличие известного raw SHA/provenance и B-identity;
отрицательный — изменённый files entry/неверный expected/подмена owner отвергаются.
