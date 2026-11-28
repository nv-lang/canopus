Статус: утверждено владельцем, 2026-10-18, question «081: итог требований»; «Исправить и утвердить (Recommended)», доставка crew 12:20.
Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть

# Требования: долговременный fence закрытых сессий

Редакция С1п-2 по всем С2-1/2/3 и квалификациям с адресной правкой AC-05 после С2-5.
Все REQ и AC ниже обязательны и утверждены владельцем по решению, указанному в статусе.
Не разрешает план, код, тесты, административные действия, публикацию или rerun.

Источник утверждения и точный объём правки — `spec-approval-2026-10-18/owner-input.md`.
Описания прежних авторских стадий/проверок ниже — история их назначения, не отмена
этого утверждения и не разрешение новой С2-6. В-01/02 остаются без предметного ответа.

## Результат и границы

Результат после отдельных ворот — код и selftests в `opencode-plugin/`:
`watch.ts`, `core.ts`, `index.ts` и необходимые смежные места по будущему плану.
Действующее описание lifecycle и ограничений — раздел `crew_watch` и связанные
presence/turn economy разделы `opencode-plugin/README.md` (существуют).
Справка `HELP` в `core.ts` и описания инструментов должны согласованно объяснить
новое поведение; машинный формат хранится рядом с читающим его кодом.
Первый будущий шаг переноса результата создаёт `current.md`, остальные дополняют
точные ссылки; это указатель, не копия нормы. Документы задачи после сдачи — история.

Цель — долговременный запрет старых подконтрольных действий после закрытия/передачи
с сохранением работы нового исполнителя и evidence обоих запусков. Не одноразовый
interrupt и не реализация «всегда STOP». Исправляется класс, а не один carrier.
Nova #94 остаётся HOLD и никогда не становится тестовой фикстурой.
Локальный GREEN ниже необходим, но недостаточен для GO по исторической сессии:
legacy-процессы и независимые API-клиенты требуют отдельного доказательства.

Вне объёма: общий процесс-менеджер, Nova tooling/source/assets/tags/release,
отмена #94 целиком, произвольный внешний OpenCode и изменение чужих репозиториев.
Новая локальная модель не объявляется уже действующей гарантией для старого запуска.

## Термины и наблюдаемый контракт

**Identity.** Источник S=(project, sessionID, lifecycle-generation), адресат
R=(project, sessionID, lifecycle-generation), operation O=(operationID,
operation-generation). Это три разных неизменяемых сущности. Роль — маршрут, не
identity; task number, PID, cwd, время и текст письма не заменяют ни S, ни R, ни O.
Служебный writer имеет собственную identity, но обязан сохранять causation S/R/O
старого задания: подмена source на `crew-harness` не очищает отозванное полномочие.

**Close barrier C.** Монотонная фиксация отзыва exact session-generation, общая
для всех экземпляров и stale actors. C не равна ответу успешного close.
Повторное чтение устаревшей card не может снять C. Новая B не наследует identity A.

**Admission D.** Линеаризуемое разрешение одного effect O для конкретных S и R,
с recoverable intent и областью effects до начала исполнения. Queue persistence
и claim — не D. Для role item D возможна только после фиксации точного R.
Post в локальный mailbox не разрешает будущий turn; переход в чужой consumer
учитывается отдельной записью effect той же O. План выбирает сериализацию,
не обещает транзакцию filesystem+OS+OpenCode.

**Terminal.** O получает один устойчивый исход: запрещено до D, завершено до C,
отозвано после D с доказанным прекращением scoped effects, либо unresolved с
перечнем недоказанного. Удалённый `.claim` или timeout не terminal proof.
Запрет до D означает отсутствие пользовательского процесса и рабочего side effect;
служебные записи отказа/audit разрешены и не исполняются старой сессией.

**Успешный close.** C плюс полный реестр затронутых O и terminal proof каждой
допущенной O, отсутствие будущего контролируемого разрешения для A и остаточных
scoped writers. После ответа success старое исполнение не пишет ни в B, ни в
сохранённые архивы/логи. Failure/timeout возвращает unresolved, не success.
В поддерживаемой модели обязательна конечная успешная ветка, описанная ниже.

**Exit/write proof.** Exact process scope, устойчивый к PID reuse и reparenting,
подтверждённое прекращение всех его writers и отсутствие вынесенных write handles
в B. Не отдельный `.exit`, `done`, code 0, kill success или пустой PID snapshot.

## Поддерживаемая локальная модель L — до результата

L — предлагаемый обязательный профиль для новых контролируемых операций, не
классификация по принципу «получилось — поддерживается». Входные признаки:

1. Windows 10/11, Node >=24, Git Bash, локальный обычный NTFS, доступный после
   восстановления сервис и исправное durable storage. Версии/права/том фиксируются
   preflight до D; другой OS/сетевой том не считается L молча.
2. Новая команда watch/timer, локальная запись/доставка через собственный consumer
   CrewHarness; нет уже выданных legacy полномочий. Источник и адресат зарегистрированы
   до постановки, O имеет новое поколение. Анонимный/legacy item — отдельный остаток.
3. Конечное локальное дерево процессов без административных прав, внешних сервисов,
   удалённого исполнения, WMI/service/task-scheduler delegation, намеренного обхода
   границы или передачи handles третьей стороне. Обычные локальные дочерние процессы,
   включая отделённые/reparented, в scope, а не исключаются задним числом.
4. A и B получают разные scratch без общих write handles/alias/reparse путей к
   защищённому результату. До пользовательского исполнения проверяется исходное
   отсутствие у A выданных capabilities на B; дальнейшее ограничение — обязанность
   механизма, не условие «поддерживается, если уже остановлено».
5. Межпроцессное исполнение справедливое; конечная последовательность инжектируемых
   сбоев, затем восстановлены storage/служба. В обязательный набор входят crash
   после spawn до PID persistence, потеря `.claim`, PID-write failure и два consumers.
   Эти события НЕ переводят вход L в неподдерживаемый.

Механизм должен обеспечить до user-code side effect: recoverable O/intent и
принадлежность процесса ограниченному scope даже при потере PID-записи. Это
требование к поставке, не доказанный текущий факт и не выбранная архитектура.
Потеря промежуточного claim не теряет authoritative intent; потеря единственного
authoritative intent внутри L — дефект, а не законное основание вечного STOP.

Положительный oracle L: после последнего инжектированного сбоя и восстановления
healthy consumer close возвращает success с terminal proof в заранее объявленный
конечный бюджет T, не больше 120 секунд активной работы управляющего механизма.
Downtime до восстановления не выдаётся за активное время; ожидание machine slot
не задерживает отзыв. План фиксирует часы и T до проб. Вечный retry/STOP, ошибка
сериализации/идентификации или timeout в обязательной L-пробе — FAIL реализации.
В эксплуатации при сбое всё равно безопасный unresolved/HOLD, но это НЕ PASS AC.

Для D<C разрешён ранее допущенный effect только в scope A до отзыва; close обязан
учесть и прекратить его. Тест не требует невозможного «не было spawn до close».
Для C<D единственный исход — отказ D, нет user spawn/turn/side effect.
B выполняет собственную допустимую операцию успешно; защита A не блокирует её.

Legacy с неизвестной identity, недоступная OS authority, разрушение durable storage,
внешняя делегация и независимый API — точный unresolved/HOLD с причиной/вопросом.
Нельзя объявлять отсутствующую в реализации поддержку L новым «неподдерживаемым OS».
Если план не докажет реализуемость L, возврат владельцу, не изменение oracle.

## Ownership и судьба уже отложенного effect

Каждый writer проверяет source и известный recipient ДО persistence. Consumer
повторно проверяет оба конца при позднем разрешении роли, claim, D и перед effect;
recovery повторяет тот же протокол, не доверяет cached card/role/status.
Проверка перед effect согласована с C/D: простой отдельный `if open` недостаточен.

| Состояние / порядок | Обязательный исход |
|---|---|
| A закрыта как source, R открыт | Старая рабочая O запрещена, в том числе уже persisted |
| S открыт, A закрыта как recipient | Не доставлять A; не перенаправлять O в B |
| S=B, R=B/иная открытая identity | Новая независимая O допустима |
| `.req` persisted, затем C, до D | Отказ/terminal отмена без user spawn |
| `.claim` взят, затем C, до D | Тот же отказ; claim не полномочие |
| Локальное письмо принято consumer, C до D effect | Не начинать effect; сохранить audit |
| D committed, затем C, effect ещё не начат | Отозвать и terminal proof; не начинать новый effect |
| D committed и effect начат до C | Учесть exact O, прекратить scope, затем success |
| Чужой consumer уже принял input | Учёт O и external ID; без terminal proof unresolved |

Role item имеет до persistence явно различимый контракт адресации:
**связанное задание** фиксирует intended session-generation или назначение попытки;
после close A никогда не разрешается в B. Перенос по тексту/той же роли запрещён.
**Открытая заявка роли** изначально не связана с A и содержит живой source;
после C(A) может выбрать B, зафиксировать R=B до D и успешно исполниться.
Если source=A, оба типа после C запрещены. Уже выбранный R=A не меняется на B:
нужно новое явно авторизованное задание с новой O и provenance. Legacy item без
доказуемой семантики/поколения не угадывается и не теряется: quarantine/audit,
unresolved до адресного решения. Не все письма считаются привязанными к A.

Административное сообщение для evidence — пассивный audit у интегратора/хранилища,
а не `synthetic`, prompt, wake:false письмо или tool-result в A. Никаких исключений
на старый рабочий turn по признаку «служебное». Уже прочитанный старым consumer текст
нельзя «отозвать из памяти»: нужно запретить его подконтрольные effect admissions;
внешнее выполнение без такого контроля остаётся unresolved, не успешный close.

## Атомарные требования

REQ-01 — close/handoff фиксирует монотонный C exact session-generation до
выдачи новой попытке старого общего ресурса. Независимая B в отдельном scope
не обязана ждать недоказуемого legacy exit, но #94/старый общий scratch остаются HOLD.

Источник: message 14,19,32; С2-1 S1; С2-2 S1/S4. Доказательство: AC-01/02.

REQ-02 — вызов watch/timer/retry от закрытого источника отказывается до persistence
рабочего request; чтение старого результата допустимо только как audit без исполнения.

Источник: message 24,33; С2-3 finding 2. Доказательство: AC-03.

REQ-03 — C и D сериализованы между всеми consumers; outcomes C<D и D<C ровно
такие, как в определениях и таблице выше, для каждого effect, а не одного tool entry.

Источник: message 32–33; С2-2 S1/S4. Доказательство: AC-02/12.

REQ-04 — intent/O/process scope восстанавливаются при каждом crash point L,
включая spawn без PID record и потерю claim; close достигает terminal success,
не вечного STOP. Вне L unknown остаётся unresolved, никогда ложный success.

Источник: С2-2 S1; С2-3 finding 1; assignment 46–61. Доказательство: AC-04/11.

REQ-05 — общий fence обязателен для всех локальных writers и consumers,
перечисленных ниже; direct call не обходит его. `crew_inbox` и `crew_wait`/takeReply
тоже не выдают старый рабочий payload после C как обход доставки.

Источник: message 32; С2-1/2 S2; assignment 63–85. Доказательство: AC-03/05/13.

REQ-06 — на внешней границе учитываются уже отправленные effects и external IDs.
Независимый prompt/command, auto-resume сервера и уже принятый turn не считаются
отозванными локальным C, interrupt или cancel. Без внешнего terminal/fence proof
конечный verdict unresolved/HOLD, даже если локальные AC зелёные.

Источник: message 26,31–32; С2-2 S2. Доказательство: AC-06/14.

REQ-07 — адресная остановка использует exact operation/process scope и проверяет
всех его writers. Ошибку kill/permission/identity сообщать отдельно от `done`.
Повторное использование PID никогда не даёт права остановить другой процесс.

Источник: message 20,25,33; С2-2 S3. Доказательство: AC-07/11.

REQ-08 — B с новой identity/generation успешно действует в собственном scope;
старые O не меняют её scratch/archive/log, ни во время отзыва, ни после close.
Совпадение роли/task number не блокирует B и не переносит ей полномочия A.

Источник: message 14,19,33; С2-3 finding 2. Доказательство: AC-08/12.

REQ-09 — до любой будущей mutation capture raw/provenance/bytes/SHA и exact owner.
Ошибка или missing не стирает исходник. Run1 missing не восстанавливается из hashes.
Санитизированная производная маркируется и связана с сохранённым внешним raw.

Источник: message 30,36; assignment 94–127. Доказательство: AC-09/15.

REQ-10 — повтор close/revoke/retry, restart и два consumers сохраняют C/O identity
и не повторяют effect. Recovery сохраняет изначальную causation и адресата.
At-least-once transport не оправдывает повторное разрешение рабочего effect.

Источник: message 32–33; С2-2 S1/S4; assignment 55–59. Доказательство: AC-04/05.

REQ-11 — безопасный audit различает отказ admission, отмену request, interrupt,
отмену конкретного inbox item, process exit, terminal close и unresolved.
Минимум: S/R/O generations, порядок C/D, переход, результат, locator proof;
публично без env/credentials/private paths/names, raw отдельно.

Источник: message 30–34; ADR-0006; С2-2 M2. Доказательство: AC-10/15.

REQ-12 — обе immutable стороны и O проверяются на всех стадиях ownership-контракта;
уже persisted/claimed item не получает исключения по старому времени создания.

Источник: С2-3 finding 2; assignment 63–77. Доказательство: AC-12.

REQ-13 — связанное role-задание не retarget-ится в B; открытая заявка живого S
может выбрать B. Неизвестная legacy semantics даёт quarantine/unresolved, не угадывание.

Источник: assignment 68–77; С2-3 finding 2. Доказательство: AC-13.

REQ-14 — если consumer уже получил payload, закрытие учитывает все выданные effects;
перед каждым подконтрольным side effect нужна D. Внешне принятый input без
подтверждённой возможности terminal revoke не позволяет successful global close.

Источник: assignment 71–77; С2-1/2 S2. Доказательство: AC-14.

REQ-15 — L определяется входами до исполнения. План обязан доказать primitive
для её Windows-профиля и fault set, запрет утечки writers/handles и позитивный close.
Невыполненная поддержка L — FAIL/возврат, не изменение определения L после результата.

Источник: С2-3 finding 1; assignment 46–61. Доказательство: AC-11/16.

REQ-16 — в L после конечного сбоя/восстановления достигается успешный terminal close
в T; положительный B сохраняется. Эксплуатационный unresolved не засчитывается GREEN.

Источник: assignment 48–61; методика, отрицательный и положительный контроль.
Доказательство: AC-11/16; срок T — выведенный технический критерий исполнителя.

REQ-17 — пользовательские README/help/tool descriptions и машинный формат
обновляются согласованно с реализацией, без утверждения универсальной гарантии.
Действующие места не ссылаются на папку задачи как на источник нормы.

Источник: message 42–44; process «Результат и куда он попадает».
Доказательство: AC-17.

REQ-18 — каждому AC отдельное доказательство после последней правки кода,
изолированный RED→GREEN по исходному дефекту, targeted и полный plugin suite,
отдельный полный guards CI и независимая приёмка. Тяжёлое — через очередь машины.

Источник: message 33,40; AGENTS 7–10; С2-2 S5/M2. Доказательство: AC-18.

## Обязательные локальные поверхности

Для каждой строки действует весь ownership-контракт, а не только writer gate.
Точная карта актуального кода в trace, не делегирование семантики старому evidence.

| Writer / переход | Очередь | Consumer / effect |
|---|---|---|
| watch / timer | `.req` | claim → admission → scoped spawn |
| watch move при finishTasks | новый request | тот же gate, без очистки causation |
| watch done / cancel | result/audit | уведомление, без wake A |
| crew_send explicit/all | mailbox | deliver, inbox, takeReply |
| crew_send role/tier | role mailbox/QUEUE | поздний выбор R, затем общий consumer |
| postLetter всех callers | mailbox/claims | общий consumer, без служебного bypass |
| request/reply obligations | mailbox | nudge, wait, retry |
| resumeInterrupted/retryFailed/selfResume | mailbox | deliver / OpenCode input |
| reassign/startSession/releaseExecutor | task/card | C, новая попытка с другой identity |
| startTask/startReviewer/resumeTasks | task journal | create/post/deliver/recovery |
| reconcile/postExpected/parent | task/mailbox | восстановленная доставка |
| review/round/push/cancel | mailbox | quiet/loud — одинаковый lifecycle fence |
| form/owner-answer/idle/gate/flow notices | mailbox | deliver / passive audit |
| roleTaken и 7 прямых deliver calls | claims | общий D до host effect |
| claim/release/recover | delivering/inbox | прежние S/R/O, не новая операция |
| finish/end-task final note | synthetic/prompt | audit не запускает и не кормит A |
| MCP makeTools | те же файлы | те же gates, без refresh/reopen tombstone |

## Критерии приёмки (будущая реализация)

AC-01 — когда stale actor/card пытается снять C после close/restart, тогда C
сохраняется и старое поколение не получает разрешения. Доказательство: state log,
persisted generations и новая попытка writer в isolated lifecycle fixture.

AC-02 — когда заданы по отдельности C<D и D<C, тогда в первом случае ноль user
spawn/effects, во втором exact O учтена и close success только после terminal proof.
В L оба расписания заканчиваются successful close, B выполняет свою O.
Доказательство: event log с порядком, scope-exit proof и счётчик effects после close.

AC-03 — когда закрытая A вызывает каждый writer из таблицы, тогда рабочая запись
не появляется; при той же поверхности открытая B проходит. Доказательство:
пара deny/allow, перечень файлов/host calls, не один общий отрицательный счётчик.

AC-04 — когда по одному инжектированы crash до intent, после intent/до D,
после D/до spawn, после spawn/до PID, после PID/до claim cleanup,
во время C и recovery, потеря `.claim`, PID-write failure, тогда в L нет забытой O
и close достигает success в T. Crash до durable принятия возвращает «не принято»
без effect; существующая durable O восстанавливается с прежним ID, без дубликата.
Доказательство: durable intent, scope identity, fault/recovery log и terminal record.

AC-05 — при конкуренции двух consumers, close/cancel/retry и restart каждый effect имеет стабильную identity `(O, effectID)`.
Если C предшествует его D — ноль admissions и исполнений; для разрешённого effect — не более одного D и фактического исполнения, без воскрешений, с общим terminal результатом.
Разные effects одной O различимы, имеют собственный D и сохраняют causation; retries сохраняют effectID. Положительный исход L по AC-02/04/11 остаётся обязательным, «всегда STOP» не проходит.
Доказательство: два реальных независимых процесса в isolated mailbox, fault log и отдельные deny/allow/race/recovery проверки per-effect; один JS Set/один экземпляр не является межпроцессным доказательством.

AC-06 — когда независимый клиент/auto-resume способен создать external turn,
тогда local PASS не становится global GO. Доказательство: фактическая V2 схема,
изолированная host-boundary проба после разрешения, external item/turn accounting
либо точный unresolved. GET, interrupt и cancel рассматриваются раздельно.

AC-07 — когда подставлены чужой/reused PID, неизвестная identity, permission/kill
failure, timeout, старый `.exit` и `done`, тогда нет чужого kill и ложного success.
Доказательство: отрицательные assertions по конкретной причине, B остаётся жива;
парная корректная exact identity достигает terminal в L.

AC-08 — когда старый scope пытается писать в scratch/archive/log B до и после C,
тогда write denied/bytes неизменны, B сама успешно пишет свою канарейку.
Доказательство: OS-boundary fixture, scope/handle proof, before/after hashes,
положительная B. Путь cwd и случайное имя каталога сами по себе не изоляция.

AC-09 — когда выполняется capture и будущая разрешённая mutation либо её отказ,
тогда все доступные исходные bytes/SHA сохранены, provenance воспроизводимо;
missing run1 назван отдельно. Доказательство: raw manifest verification и copies.

AC-10 — когда строится публичный пакет, тогда privacy guards зелёные, raw locators
не раскрываются. Доказательство: отдельные выводы secrets/private-name/CI checks;
это НЕ доказательство lifecycle, process exit или достижимости GREEN.

AC-11 — когда L-кейс с spawned-before-PID, reparented descendant или ошибкой записи
PID восстановлен, тогда exact scope восстановлен либо уже fail-stop завершён с
доказательством; close success в T, B положительна. Вечный STOP — FAIL.
Доказательство: реальная платформенная проба будущего primitive и независимый replay.

AC-12 — когда письмо/request уже persisted или claim-нуто до C(A), а D позже,
тогда отдельные варианты A-source, A-recipient и B-only дают точно исходы таблицы.
Доказательство: по строке на schedule, неизменные S/R/O, ноль old effects и один B.

AC-13 — когда связанный role item ожидает A, после C он не уходит B; когда живая
открытая заявка не связана с A, тогда она выбирает B и проходит. A-source и legacy
неизвестная generation не проходят. Доказательство: identity выбранного R,
audit старого item, новая независимая O B; silent retarget краснит проверку.

AC-14 — когда consumer получил письмо до C, но D effect ещё нет, тогда effect
запрещён; если D уже committed, close ждёт terminal exact O. Для принятого внешним
host input без terminal proof — unresolved, не success. Доказательство:
consumer receipt, D/C order, external ID либо его отсутствие как точный остаток.

AC-15 — когда raw before заменяется разрешённой публичной производной, тогда raw
побайтно существует снаружи и сверён с первичным manifest, entries неизменны,
меняются только root/provenance. Доказательство: rawSHA→derivativeSHA, точный diff;
старый вердикт/ошибка не исправлены. Подмена raw или owner partition — FAIL.

AC-16 — когда подставлена реализация «всегда STOP» на тех же заранее признанных
входах L, тогда положительные AC-02/04/08/11 отвергают её. Доказательство:
fault schedule/бюджет T зафиксированы до запуска; реальный исправленный механизм
даёт успешный close и B, снятая правка краснеет по исходному классу.

AC-17 — когда результат размещён, тогда README lifecycle/ограничения, HELP,
tool descriptions и машинная схема совпадают с кодом; current даёт точные ссылки.
Доказательство: docs diff, help snapshot, поиск единственного действующего текста,
проверка ссылок и самостоятельное чтение С6; ничего этого сейчас не выполнено.

AC-18 — когда реализация готова, тогда каждое AC имеет собственный именованный
вывод, исходный defect RED на базе и GREEN на правке, targeted/full npm,
полный guards CI, независимая С6. Доказательство: ревизия, команда, exit/output
после последней правки. Selftest не заменяет полный suite/платформенную пробу.

## DNC — запреты

DNC-01. Не выдавать статус/interrupt/inbox cancel/done/code/kill/timeout/нет PID
за достаточный durable fence или exit proof.

DNC-02. Не менять/удалять старые evidence, scratch, archive, worktree, refs и logs;
не реконструировать missing по digest. Единственная текущая санкционированная
производная before оговорена assignment; это не общее разрешение чистки истории.

DNC-03. Не делать broad kill, reset/stash/force, session delete, Phase1/rerun,
API mutations без отдельного полномочия и безопасного протокола.

DNC-04. Не blanket-block B и не расширять работу на Nova tooling/общий менеджер.

DNC-05. Не читать/собирать credentials, secrets, полный env, env родителя,
transcripts или inbox bodies для адресной metadata диагностики.

DNC-06. Не утверждать universal OS/API guarantee до доказательства; не ослаблять
цель, не переименовывать дефект L в неподдерживаемость и не ставить GO по local PASS.

## Открытые вопросы и safe defaults

В-01. Если поддерживаемой внешней блокировки независимых OpenCode clients/уже
принятых legacy effects нет, сохраняем ли полный HOLD, не снижая цель P1?

Адресат: владелец через интегратора, закрытый выбор границы гарантии.
Варианты: сохранить HOLD; явно изменить цель отдельным решением и новой spec.
Рекомендация С1п: HOLD, поскольку фактическая V2 схема не обещает durable close.
Срок: 2026-10-18, обязательные ворота после С2-4, до утверждения spec.
Без ответа: HOLD; срок не разрешает изменение цели или публикацию.
Область блокировки: global GO/#94, не независимая проверка текста.

В-02. Разрешать ли будущий адресный capture→identity→revoke→exit-proof протокол
только после утверждённого плана и независимого подтверждения безопасного scope?

Адресат: владелец через интегратора, полномочие живого действия.
Варианты: отложить до плана/proof; оставить весь admin этап приостановленным.
Рекомендация С1п: первый вариант, поскольку cancel сейчас только свой, а старые
снимки PID/ownership не дают безопасного stop. Срок: до первой mutation, не позже
будущих plan gates; контроль вопроса 2026-10-18 на воротах после С2-4.
Без ответа: никаких mutations; область блокировки — только admin/live этап.

И-01. Выбор lock/storage/OS primitive и доказательство L — инженерная работа
будущего плана, не вопрос владельцу о знании API. План не вправе ослаблять L/T;
при невозможности — обоснованный возврат на ворота. Здесь feasibility не объявлена.

Ответов на В-01/02 нет. Разрешение «Sol + Kimi (Recommended)» от владельца
2026-10-18, question «081: последний заход», разрешает две сессии и безопасную
производную с raw сохранностью, но не отвечает на эти предметные вопросы.
Второе мнение по ним в этой сессии не запрашивалось: новых агентов запрещено;
это раскрытый остаток для интегратора, не отмена нормы и не согласие Kimi.

## Проверки и порядок ворот

Сейчас только авторская правка. Далее интегратор квалифицирует пакет и назначает
последнюю независимую С2-4 Kimi. После неё обязательные ворота владельца при любом
результате; нет С2-5, сброса потолка или автоматического утверждения.
Только после явных ворот spec — план с feasibility/primitive proof, отдельные
plan gates, реализация/изолированный RED→GREEN, независимая приёмка, публикация
и live по отдельным разрешениям. #94 HOLD до полного адресного доказательства
и Nova verdict. Авторская сдача не завершает весь заказ.

Тип: исправление backend/plugin/lifecycle/process/API. Будущие уровни проверки:
A (доступные static guards; отдельного TS typecheck/build script в package нет),
B (новые и полный suite), C (изолированный реальный platform/host contour),
E (каждый REQ/AC/DNC), F (ошибки/границы), G (регрессии). D неприменим:
визуальный интерфейс не меняется. Node strip-types не доказывает типовую корректность.

После разрешения, из `opencode-plugin/`, exact существующие targeted команды:

```sh
node test/crew-watch.test.mjs
node test/crew-flowwatch.test.mjs
node test/crew-restart.test.mjs
node test/crew-delivery.test.mjs
node test/crew-tasks.test.mjs
node test/crew-mcp.test.mjs
node test/crew-hung-resume.test.mjs
node test/crew-help.test.mjs
npm test
```

Новые lifecycle/fault/ownership клетки план размещает в именованных targeted
suites либо называет новые файлы и подключение package ДО реализации. Эти старые
команды сами по себе ещё не покрывают новые AC. `npm test` — точная текущая цепочка
121 команд: cleanup и 120 test scripts, последовательно, остановка на первом FAIL.
Источники: package scripts.test, test/README. Реальный OpenCode в selftests fake;
платформенное доказательство не заменяется fake host.

Отдельно из корня — полный `.github/workflows/guards.yml`, не npm suite:

```sh
for f in $(git ls-files 'scripts/*.sh' 'scripts/guards/*.sh' 'scripts/guards/lib/*.sh' 'scripts/githooks/*'); do
  dash -n "$f" || exit 1
done
sh scripts/guards/run-all.sh --ci
python scripts/guards/guard-secrets.py --tree
python scripts/guards/check-wiring.py
sh scripts/guards/selftest/run-selftests.sh
sh scripts/guards/prove-red.sh
sh scripts/guards/probe-empty-root.sh
```

Workflow дополнительно маскирует `CREW_PRIVATE_NAMES` через
`sh scripts/guards/ci-mask.sh CREW_PRIVATE_NAMES`; значения не извлекаются агентом.
Для каждого commit фактического push/PR range:

```sh
commits=$(sh scripts/guards/commit-range.sh --old "$old" --new "$new" --remote origin --main refs/remotes/origin/main) || exit 1
rc=0
for c in $commits; do
  python scripts/guards/guard-commit-message.py --commit "$c" --ci || rc=1
done
exit $rc
```

В CI old/new — PR_BASE/PR_HEAD для PR, иначе BEFORE/AFTER; не выдуманный текущий
range. Все тяжёлые команды — только через очередь машины, лимит AGENTS 9:
до 4 файлов суммарно при нескольких прогонах, до 8 только при одиночном прогоне
и свободной машине; упавший параллельно перепроверяется отдельно. Никакие команды
из этого раздела в С1п-2 не запускались. Privacy PASS не lifecycle PASS.

## Изменения захода 3

С2-1 S1–S3 и С2-2 S1–S5/M1/M2 правлю; замечания С2-3 1–4 тоже правлю,
без объявления их закрытыми независимой проверкой. Добавлены L и обязательный
положительный terminal outcome, S/R/O и persisted/claimed/role/consumer oracle,
раздельные AC на privacy/поведение/docs/full checks, история ID и атомарная трасса.
Старые обзоры и ошибки не исправляются задним числом. Подробный ответ — новый
`session-evidence/s1p-2/finding-response.md`. Feasibility/реальный GREEN не доказаны.
