# 269. Ограниченный этап Windows ACL adapter

Статус: первый незавершённый инженерный checkpoint; не готовность adapter и не F-09 integration.

## Полномочие и время

- Дежурный Codex по поручению владельца, 2026-11-01, question «Объём после ACL-оценки»: «Сначала adapter (Recommended)», передано интегратором 08:30. Не новая цитата владельца.
- Начало отдельного этапа — запись `log.md` 08:33, исходная база `923a8aef`, штатная ветка; только собственный WIP. T 3–5 часов инженерной работы, очередь отдельно. Policy-ожидания не обнуляют начало и срок первого checkpoint; готовность через 45 минут не обещана.
- Разрешены fixed script, минимальный отдельный Nova transport/policy wrapper, runtime asset в release kit и его проверки, целевые новые Windows fixtures. `hub.nv` cwd/env/ensure_client/dispatch, прочая интеграция F-09, F-02/F-07/UI/quota/миграция/278 не меняются. Статус submitted/small и прежние HOLD сохраняются; повторного submit нет.
- Старый triage завершён неполным отдельно: три UNKNOWN, compiler/capture STOP не снят. Этот этап не использует его разрешение на исполнение aggregate.

## Policy-gates до реализации

1. На первоначальном пути под Temp read-only проверка нашла owner TrustedInstaller на корне тома. Решение 08:44 и уточнение 08:45 разрешили **точный SID только как owner подтверждённого OS-предка**. Нового TI Allow-принципала нет; на наблюдаемом OS-корне TI ACE отсутствуют. Root/leaf TI owner/Allow запрещены.
2. Повторный preflight выявил чужие применимые Modify/Delete в Temp и Temp/opencode. Эти права не добавлены в trust, существующие ACL не ремонтировались.
3. Решение 09:00, question «Безопасный fixture-root»: один новый уникальный `%LOCALAPPDATA%/CrewHarnessAclFixtures-<random>` непосредственно под Local, не Temp; только после полного повторного preflight, без adoption существующей коллизии и без fallback/поиска дисков.
4. Для directory OS-предка разрешена узкая creation-only классификация actual mask 4 (`FILE_ADD_SUBDIRECTORY`), отдельно от `FILE_DELETE_CHILD` 64. Не blanket Allow и не добавление SID в trust. Private root/leaf исключение не получают; dangerous/unknown rights отказываются.
5. Повторный read-only preflight Local прошёл на всех пяти существующих компонентах: owners по уточнённой policy, canonical DACL/CommonAce, no reparse, no `.git`/bare-like signature; единственная creation-only ACE — OS volume root с actual mask 4 и flags None. Первый диагностический snippet имел PowerShell byte-enum cast issue; после явного int cast повтор прошёл. Это не продуктовый unit/fixture PASS.

## Первый кодовый инкремент

Добавлены `scripts/windows-acl-adapter.ps1` и `scripts/test-windows-acl-policy.ps1`.

- Fixed bounded flat-JSON протокол v1: `inspect_root`, `inspect_session`, `create_session`; никаких create_root/repair/launch операций. До ConvertFrom-Json собственный tokenizer проверяет schema, duplicate/case aliases, типы и хвост; строки не становятся кодом.
- До проверки пути отказ для UNC/device/drive-relative/ADS/dot traversal/trailing-dot-space/wildcard/short-name aliases. Все существующие компоненты проверяются на reparse, Git markers, descriptor/owner; отсутствие маркеров устанавливается успешной literal enumeration, а не `Exists=false` при access error.
- Private root/leaf: service owner, protected non-null/non-empty canonical DACL, явный service FullControl; Allow только service/SYSTEM/Administrators. Чужие, inherited, сложные/unknown ACE и неподдержанные Deny — отказ.
- Ancestors — отдельный predicate; InheritOnly не считается правом на существующий ancestor. Owner TI — только точный SID на подтверждённом OS volume root, но TI mutation Allow не становится trusted. Неразрешённые mutation rights отказываются; узкое actual mask 4/flags None действует только на OS volume ancestor.
- `create_session` ограничен новым непосредственным child уже проверенного private root, без SetAccessControl существующему объекту; descriptor читается обратно, root повторно остаётся private. Same-identity/admin конкурентная подмена не считается закрытой этим path-based API.
- Script не получает project environment и не создаёт чат. Доверенный executable/asset root и env-clear/bounded process transport должны обеспечиваться wrapper; пока этот слой **не реализован**, поэтому скрипт не объявляется полным самостоятельно развёртываемым security boundary.

## Проверки и незакрытое

- PowerShell AST parse нового adapter: PASS, без выполнения ACL операций.
- Первый in-memory JSON/policy прогон через machine queue: RED в третьем negative JSON case, до файловых ACL операций. Исправлена группировка concatenation в списке входов самой фикстуры, не schema predicate.
- Следующий RED выявил, что `FileSystemAccessRule` добавляет Synchronize к Allow: положительная фикстура не имела фактическую принятую mask 4. Она заменена на RawSecurityDescriptor/CommonAce с проверенной actual mask 4; комбинация `4|Synchronize` отдельно остаётся negative, predicate не расширен.
- Ещё один RED normal ancestry локализован в стандартных GENERIC InheritOnly templates OS-предков. Теперь только для не-Private ancestor сначала валидируются CommonAce/qualifier/flags и известные specific/GENERIC bits, затем не применимый к текущему объекту InheritOnly template не считается effective grant. Неизвестные bits/ACE, applicable GENERIC и private root/leaf generic template по-прежнему отказываются; добавлены оба положительных OS-template и отрицательные контроли. Это не добавление principal в trust.
- Финальный на этом срезе `powershell -NoLogo -NoProfile -NonInteractive -File scripts/test-windows-acl-policy.ps1`, watch `1793514414457-2ejqgh`, 09:26: **код 0, 64 проверки PASS**, включая actual Local ancestry read-only. Это только in-memory/JSON/path policy и metadata, не real private create/transport/kit. Исходные RED сохранены в watch `1793513572109-uy5ljo`, `1793513729503-sjydjk`, `1793513965110-df3h5g`.
- В policy tests используются in-memory DirectorySecurity и read-only Local ancestry, **не SetAccessControl реальных каталогов**. Разрешённый уникальный outer fixture ещё не создан; private create/read-back, wrong owner/DACL layouts, junction/bare, транспортные negative controls и release-kit execution ещё не проверены.
- Остаются минимальный Nova wrapper, physical canonical comparison через предоставленный `std.fs.canonicalize`, trusted asset/executable hash/version, stdout bounds/timeout/nonzero handling, packaging/kit guard/selftests и реальные целевые Windows fixtures. Текущий script lexical/reparse слой не заменяет native physical canonical gate wrapper, в частности для DOS volume aliases.
- Trusted paths не берутся из project cwd/PATH/PSModulePath или относительного argv[0]. В wrapper планируется явный typed trusted caller context с абсолютным asset root/точными hashes; любой неаутентифицированный/недоказанный trust context должен отказать. Автоматическая production bootstrap-интеграция в этот этап не входит.
- Выявлен отдельный trusted-path design gate: нельзя исполнять ещё не доверенный script для проверки ACL его собственного install-root. Интегратору направлен `qmvxgck9zrkus`: минимальный wrapper с явным trusted installer/launcher context и fixture-setup ACL read-back, без маскировки self-bootstrapping как `trust=true`. До подтверждения границы transport/kit не реализуются. Произвольный недоказанный asset root не считается безопасным от одного hash; unprivileged replacement race в writable install-root не исключён исходной оговоркой об admin/same-identity TOCTOU.
- Интегратор 09:32 подтвердил эту границу только текущего adapter-этапа: trusted setup непосредственно проверяет actual owner/DACL/canonical ancestry private asset child до запуска, затем copy/read-back/hash и точный OS executable. Hash доказывает идентичность, не происхождение или private ACL. Production bootstrap NOT VERIFIED; отсутствие caller proof, подмена paths/pins/version и injection требуют отдельных negative controls. Новый `src/windows_acl/adapter.nv` пока непроверенный отдельный WIP, в первый script/policy checkpoint не включён.
- Повтор policy после generic synthetic paths: watch `1793515359124-y7ml43` 09:42, код 0, 64 PASS. Попытка signed checkpoint 09:34 была отклонена privacy guard на synthetic path в тесте; обхода не было, примеры исправлены на generic `C:/work/...`.
- Физическая canonicalization и trusted-path/подпись относятся к обязательным последующим gates, а не к уже доказанным возможностям этого checkpoint. Новая нехватка API/policy — немедленный STOP/переоценка, не расширение без решения.

Это сохранение промежуточного WIP, не разрешение запуска adapter в production и не снятие STOP общей F-09 integration. Тесты, зависящие от установки ПО, PS7, admin/elevation или ExecutionPolicy bypass, не допускаются.
