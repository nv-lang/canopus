Статус: утверждено, 2026-10-14, владелец

# 031 — Формат JSONC-регламента раннера плагина

Сессия С1, продолжение от 2026-10-13. Это спецификация декларативного формата полного регламента и его проверки/чтения. Владелец утвердил только эту спецификацию 2026-10-14; реализация, слияние и публикация не разрешены. Источники и трассировка: [spec-trace.md](spec-trace.md). Методика: `unitcraft/ai-dev-methodology @ f333efa319e445efe029ee6963b477ca8fe3bc1c`.

## Цель и граница

Формат описывает в данных применимый к конкретному закреплённому коммиту методики граф раннера: все применимые фазы, сессии и узлы, маршруты, предикаты по фиксированным именам, ворота, параметры/счётчики, документы, декларации действий/событий и метаданные представления. Названия полей и закрытые формы приняты владельцем после самостоятельных С2 и ответов В-01…05; это контракт формата, не готовая реализация.

Вход — UTF-8 JSONC-файл статического регламента. Предлагаемая проверка состоит из синтаксического разбора, структурной schema-проверки, проверки ссылок/графа и отдельной семантической сверки полноты. Эта С1 не объявляет формат самодостаточно валидируемым: некоторые закрытые каталоги имён и их версии пока UNKNOWN-03/07; пока их не закрепить, возможна только структурная валидация и обнаружение неразрешённых catalogRef. Нормализация удаляет комментарии, не меняя значений, и выдаёт стандартный JSON. Сценарии 013 — чистый JSON с тем же смыслом данных «начальное состояние + события → состояния и действия/ошибка», но не тот же документ регламента.

Реальный алгоритм исполнителя/адаптера, выполнение `step`, файловый ввод-вывод, состояние конкретной задачи на диске, атомарная запись, поведение после перезапуска, фактическая авторизация/аудит jump и его исполнение остаются внешним контрактом. Документ задаёт лишь декларации, которые внешний потребитель обязан понимать; не обещает его наличие и не задаёт протокол полностью.

## Термины и общие правила схемы

Имена полей чувствительны к регистру. Объект не может содержать повторяющиеся ключи; массивы упорядочены там, где порядок исполнения заявлен. `null` допустим только там, где поле прямо допускает его; пропуск обязательного поля не эквивалентен `null`, нулю, пустой строке или умолчанию. Идентификаторы — ASCII `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`, уникальны внутри своего каталога. Код методики и человекочитаемый заголовок не служат ключами ссылок.

Схема не содержит выражений, скриптов, шаблонов-кода, произвольных имён функций, сетевых ссылок, файловых путей или исполняемых callback. Ветвление описывается ссылкой `predicate` на встроенный предикат и таблицей исходов. Неизвестные ключи запрещены в каждом объекте; расширение — только новым `schemaVersion` с явной политикой совместимости.

## Контракт полей: типы, nullability и разрешение ссылок

Правила таблиц нормативны для версии схемы 1.0. `required=yes` означает поле обязательно; отсутствующее не получает default. `nullable=yes` разрешает явный JSON `null`, но не пропуск. Все свойства каждого объекта закрыты: лишний ключ — `unknown-field`. Ссылки — локальные строковые ID, не JSON Pointer и не имя, разрешаемое эвристически; разрешаются точно в указанной таблице объектов. ID уникален в пределах каталога, если строка явно не задаёт глобальную область.

| Структура | Обязательные ключи и точные типы | Опциональные/nullable и ограничения |
|---|---|---|
| Корень | `schemaVersion:string`, `compatibility:object`, `manifest:object`, `registryBindings:array`, `phases:array`, `sessions:array`, `nodes:array`, `graph:object`, `routes:array`, `gates:array`, `predicates:array`, `predicateCatalog:object`, `documents:array`, `progressFormat:object`, `profiles:object`, `counters:array`, `parameters:array`, `cycles:array`, `actions:array`, `events:array`, `coverage:array`, `display:object`, `diagnosticCatalog:object`, `scenarioContract:object`, `lenses:array` | опциональны только `language`, `usage`, `deadlines` (объект subsystem, не null); пустой каталог разрешён структурно, полнота требует все применимые записи |
| `compatibility` | `minReaderVersion:string` | ровно `major.minor`; версия не ниже `schemaVersion`-совместимого reader |
| `manifest` | `id:string`, `name:string`, `regulationVersion:string`, `methodology:object` | `id` по ID-regex; name непустая ≤120 Unicode scalar; version `major.minor.patch`; закрытая methodology форма ниже |
| `methodology` | `repository:string`, `commit:string`, `files:array` | repository равен публичному URL методики; commit `[0-9a-fA-F]{40}`; files 1..128, уникальны по path |
| `registryBinding` | `id,kind,version,digest:string` | kind enum `predicate|unit|route-trigger|event|action|effect|profile-stage|profile-value|gate|outcome|document-status|grammar|scenario|role|prompt|context`; version `major.minor`; digest 64 hex; id unique; внешний registry обязателен для semantic validation |
| `sourceFile` | `path:string`, `sha256:string` | path POSIX relative, без пустых сегментов, `.`/`..`, backslash и ведущего `/`; sha256 `[0-9a-fA-F]{64}` |
| `phase` | `id,code,title:string`; `ordinal:integer`; `entryNode:string`; `terminalNodes:array<string>` | ordinal ≥0 уникален; terminalNodes непустой, distinct, каждый target существующий node |
| `session` | `id,code,kind,phaseId:string`; `repeatable:boolean`; `role,promptRef:string|null` | kind enum `agent|human|system|meeting`; agent/meeting: role и promptRef непустые; human: role непустая, promptRef=null; system: оба null. role из role registry, promptRef из prompt registry |
| `node` | `id,code,kind,phaseId,sessionId,gateId,unit,description` | все ключи обязательны; kind enum `session|gate|action|decision|terminal`; sessionId/gateId string|null взаимоисключающи по kind; unit object|null; description непустая строка ≤500 |
| `unit` | `source:string`, `numeratorRule:string` | оба non-null; source — источник из таблицы единиц, numeratorRule — ID внешнего unitRules в единственном binding kind=unit; строка registry связывает числитель и знаменатель |
| `graph` | `startNode,terminalNode:string`; `edges:array` | старт/терминал ссылаются на node; edges минимум 1 для применимой нормы |
| `edge` | `id,from,to,on,outcome:string`; `predicate,routeId:string|null`; `actions:array` | ID уникален в graph; from/to node refs; on event ref; predicate predicate ref; outcome из predicate/event registry; routeId из routes; actions — упорядоченные actionUse, без повторного actionId |
| `route` | `id,edgeId:string`, `trigger:object`, `targetNode:string`, `invalidate,enqueue:array`, `preserve:array<string>`, `counterEffects:array` | trigger `{kind:string,ref:typedRef,value:string|null}`; kind enum `event|gate-decision|predicate-outcome`; invalidate — typedRef document/gate; enqueue — typedRef node/session; preserve — counter IDs; массивы distinct |
| `gate` | `id,code,nodeId:string`; `ownerRequired:boolean`; `openPredicate:string|null`; `decisions:array`; `defaultDecision:string|null`; `effects:array` | nodeId единственный gate node; ownerRequired=true ⇒ defaultDecision=null и хотя бы 1 decision; иначе defaultDecision обязателен и ссылается на decision; решения и effects описаны ниже |
| `decision` | `id,label,routeId:string`; `counterEffects:array` | id уникален в gate; label непустая ≤160; routeId из routes; counterEffects строго []: эффекты только у связанного route |
| `gateEffect` | `id,kind:string`; `payload:object`; `requiresConfirmation:boolean`; `resultEvent:string|null` | kind из registry binding kind=`effect`; payload строго по внешней signature; boundary из той же signature; external_effect/human_decision ⇒ confirmation=true и resultEvent из events; pure_data ⇒ false/null |
| `counterEffect` | `counterId,operation,when:string`; `valueBinding:object|null`; `event:string|null` | operation enum `set|increment|decrement|reset|preserve|recompute`; when enum `route|event`; комбинации и конфликты ниже |
| `predicate` | `id,builtin:string`; `args:object`; `resultType:string`; `description:string`; `sourceRef:object` | resultType enum `boolean|enum`; builtin и args schema сверяются с predicateCatalog; sourceRef обязателен |
| `predicateCatalog` | `catalogVersion,catalogRef:string`; `builtins:array<string>` | catalogRef из registryBindings kind=predicate; catalogVersion равна его version; builtins unique, ровно использованные builtin имена; signatures только во внешнем закреплённом registry |
| `document` | `id,filename:string`; `phaseId:string|null`; `statusRules,fields,markers,requiredBy:array` | filename basename с `{N}`, `{round}`, `{lens}`, `{void}`; numberBinding обязателен только при `{N}`, иначе запрещён; non-null union ниже; requiredBy — typedRef node/session/gate; phaseId null для общих журналов |
| `statusRule` | `id,firstLine,meaning:string`; `allowedNext:array<string>` | id unique на документ; firstLine exact/pattern из ограниченной грамматики, не regex кода; allowedNext — status id refs, distinct |
| `documentField` | `id,section,grammar,valueType:string`; `required:boolean`; `multiplicity:string`; `normalization,onInvalid:string` | section nonempty; valueType enum string/integer/boolean/enum/array/object; multiplicity enum one/zero_or_one/one_or_more/zero_or_more; normalization enum exact/trim/line_endings; onInvalid enum error/diagnostic/gate; grammar из grammar registry, не regex кода |
| `documentMarker` | `id,marker:string`; `required:boolean`; `count:string` | count enum `exactly_one|at_most_one|one_or_more`; marker nonempty literal; duplicate marker ids forbidden |
| `progressFormat` | `linePatterns:array`, `launchMarkers:array<string>`, `finishMarkers:array<string>`, `stopKinds:array<string>`, `nSourceRules:array<string>` | массивы non-null; кроме nSourceRules непустые; `stopKinds` — точное множество из пяти разных строк `вопрос`, `план`, `ревизия`, `требования`, `ворота`; linePattern ровно `{id,grammar,mode,hasDate,unitRule}`, типы/ветви ниже |
| `profile` | `enabled:boolean`, `defaults:object`, `stageRules:array`, `limits:object` | profile root has exactly `enabled,defaults,stageRules,limits`; disabled ⇒ defaults `{}` and stageRules `[]`; stageRules structure below |
| `profileValue` | `tier,effort,reasoning,budget:string|null` | exact four keys; each nullability/value enum comes from matching `profile-value` registry; `tier` supports registry values including configured task-derived tier; no unknown property |
| `profileStage` | `stage:string`, `inheritsFrom:string|null`, `profile:object` | stage enum must be in `profile-stage` registry; no duplicate stage; inheritsFrom is stage ref, no cycles; profile exact subkeys `tier,effort,reasoning,budget`, each typed string or null only if registry permits |
| `profileLimits` | `tierMin:string|null`, `tierMax:string|null` | tier enum `heavy|medium|light`; min/max order must be valid in registered order; nullable means no bound |
| `counter` | `id,type:string`; `initial` JSON scalar; `incrementOn,resetOn:array<string>`; `bounds:object`; `displayRef:string|null` | type enum integer/boolean/enum; initial по type и bounds; integer bounds `{min:integer,max:integer|null}`; enum `{values:array<string>}` unique непустой; boolean `{}`; incrementOn/resetOn — индексы route IDs, не дополнительные эффекты |
| `parameter` | `id,type:string`; `required:boolean`; `default` scalar|null; `minimum,maximum:integer|null`; `values:array<string>|null`; `resetPolicy:string`; `resetEvents:array<string>`; `sourceRef:object` | type enum integer/boolean/string/enum; required=true ⇒ default=null; required=false ⇒ ненулевой type-correct default; values непустой unique только enum; bounds только integer; правила ниже |
| `cycle` | `id,stage,artifact:string`; `cleanChecksParam,minimumProbesParam,ceilingParam:string`; `countedOutcomes:array<string>`; `ceilingGate,repairRoute:string` | stage закрыт `spec|plan|review|delivery|meeting` (цикл, не profile-stage); artifact из documents; *Param из parameters; integer, заданный домен по правилам ниже; gate/route refs точны |
| `action` | `id,kind:string`; `payloadSchema:object`; `sourceRef:object`; `effectBoundary:string` | kind must be in action registry; payloadSchema is closed schema object with property definitions; boundary enum `pure_data|external_effect|human_decision`; external effect requires confirmation/result schema in registry |
| `event` | `id,kind:string`; `payloadSchema:object`; `sourceRef:object`; `effectBoundary:string` | kind must be in event registry; boundary enum `input|external_result|human_decision|internal`; payload schema closed; unknown extra payload keys rejected |
| `payloadSchema` | `type:string`, `properties:object`, `required:array<string>`, `additionalProperties:boolean` | type exactly `object`; property value is field schema; required unique and subset of property keys; additionalProperties must be false |
| `fieldSchema` | закрытый рекурсивный union по `type`, точные ветви ниже | все ключи выбранной ветви обязательны; optional ключей нет; `nullable:boolean` относится к значению, не к пропуску свойства |
| `coverageEntry` | `id,sourceFile,anchor,kind,disposition:string`; `targets:array` | disposition enum represented/external_contract/not_requirement; targets typedRef unique; represented требует непустой targets; external/not_requirement допускают [], требуют дополнительный reason непустой string (иначе ключ запрещён); kind enum rule/format/gate/parameter/example/out_of_scope; sourceFile из manifest, anchor непустой |
| `diagnosticCatalog` | `version:string`; `codes:array` | codes nonempty; each `{code,severity,condition:string}`; code unique; severity enum `error|warning|info`; все ошибки проверки REQ-33 имеют severity=error |
| `diagnostic` | `code,severity,message,category,jsonPointer:string`; `line,column:integer`; `sourceRef:object|null`; `sourceRefReason:string|null` | все ключи required; category и пара sourceRef/sourceRefReason по правилам ниже; line/column≥1; pointer RFC 6901, корень="" |
| `display` | `fields:array` | nonempty; each `displayField` below; all source refs resolve |
| `displayField` | `id,format:string`; `source:object` | source — typedRef counter/node/document/gate; format только `{value}`, `{code}`, `{unit}`, `{N}`, `{pass}`, `{limit}`, без выражений |
| `scenarioContract` | `scenarioVersion,contractRef:string`; `requiredLinks,expectedKinds:array<string>` | version major.minor; contractRef ID@version внешнего scenario registry; requiredLinks unique непустой поднабор REQ/AC/DNC/source; expectedKinds unique поднабор state/actions/error с хотя бы одним state/actions |
| `subsystem` | `enabled:boolean`; `inputSchema,outputSchema:object|null`; `storage:object|null`; `noData:object|null` | выключен ⇒ три nullable схемных поля и noData null; включён ⇒ все ненулевые; storage ровно `{scope,key}`: scope=`task_profile|task_state|task_journal`, key по ID-regex; noData ровно `{tag:"no_data",reasonRequired:true}` |
| `lens` | `id,title:string`; `sessionId:string` | id unique по ID-regex; title непустой; sessionId из sessions kind=meeting |
| `actionUse` | `actionId:string`; `bindings:object` | actionId из actions; ключи bindings ровно required плюс явно заданные optional свойства payloadSchema; значения — valueBinding; нет лишних ключей |

### Рекурсивная fieldSchema и домены

Каждая строка ниже — **полный** набор ключей ветви; другие ключи запрещены на любой глубине. Сама schema всегда object/non-null. `nullable` — обязательный boolean; только true добавляет JSON null к домену значения. Наличие свойства определяется массивом required родительского object, а не nullable дочерней schema.

| type | Ровно обязательные ключи | Домен без null |
|---|---|---|
| string | `type,nullable` | любая JSON-строка, включая пустую |
| boolean | `type,nullable` | ровно true/false, не 0/1 |
| integer | `type,nullable,minimum,maximum` | безопасные целые в включительных границах |
| enum | `type,nullable,enum` | значения непустого distinct array<string> enum |
| array | `type,nullable,items,maxItems` | массив 0..maxItems значений items |
| object | `type,nullable,properties,required,additionalProperties` | закрытая запись по properties/required |

У integer minimum/maximum — обязательные ключи с integer|null; null снимает соответствующее ограничение, но не предел безопасных целых. Все integer во всём формате, включая bounds, индексы и maxItems, — целые от −9007199254740991 до 9007199254740991 (boolean не integer); дополнительные локальные пределы сохраняются. minimum≤maximum при двух ненулевых значениях. У array items — одна рекурсивная fieldSchema/non-null; maxItems — обязательный integer 1..10000, без default/null. У object properties — object/non-null: непустые строковые имена свойств → рекурсивные fieldSchema; пустой properties законен. required — array<string>/non-null, unique, подмножество ключей properties; [] законен. additionalProperties — обязательный boolean, ровно false. Эти же правила properties/required/закрытости действуют у payloadSchema, но у него нет nullable и type ровно object. Schema-объект и описываемое им значение — разные объекты: additionalProperties запрещает лишние свойства **значения**, полный перечень ветви запрещает лишние ключи **schema**. required/enum/items/maxItems/minimum/maximum на чужой ветви запрещены.

Context output и результат grammar registry используют эту fieldSchema и отдельную availability required/optional. Совместимость valueBinding — включение всего объявленного домена источника в домен получателя, не проверка одного удачного snapshot. Integer сравнивается по границам (null означает безопасный предел), enum — по включению значений; enum подходит string, произвольный string не подходит enum. Boolean не подходит integer. Array требует совместимых items и maxItems источника≤maxItems получателя. Object: все возможные ключи источника входят в properties получателя, каждый required ключ получателя guaranteed required у источника, общие свойства совместимы рекурсивно. Null источника разрешён только nullable получателю. Потенциальное отсутствие подходит только необязательному свойству получателя: означает пропуск, не null/default; для обязательного свойства нужен required source. Context availability не отменяет nullable/domain. Literal проверяется по значению, не требует объявления schema.

Для set/recompute получатель — домен counter: integer преобразуется в fieldSchema minimum=bounds.min, maximum=bounds.max, nullable=false; boolean — boolean/false; enum — enum/false с enum=bounds.values. Источник counter/parameter имеет его полный declared domain, event-field — fieldSchema и required membership payloadSchema, document-field — fieldSchema результата grammar и обязательность documentField/multiplicity, context — fieldSchema/availability signature. Нельзя связывать многозначное поле как scalar: нужен совпадающий array-result grammar или фиксированный context output. Set/recompute всегда требуют существующее ненулевое значение совместимого домена; optional/null context запрещён, даже если однажды вернул положительное число. Increment/decrement проверяются по runtime результату в bounds, не сужают declared domain контрольно выбранным значением; переполнение запрещено.

### Адресация, внешние signatures и статические инварианты

Это конкретизация С1, обязательная вместе с таблицами и REQ-07/09/10/14/21/23–28/31/35. Никаких эвристик по префиксу ID. В простом поле известного типа строка адресуется ровно в каталог: phaseId→phases; sessionId→sessions; nodeId/from/to/entryNode/terminalNode/targetNode/terminalNodes→nodes; gateId/ceilingGate→gates; predicate/openPredicate→predicates; on/resultEvent/resetEvents→events; routeId/repairRoute/incrementOn/resetOn→routes; edgeId→graph.edges; counterId/preserve→counters; *Param→parameters; artifact→documents; displayRef→display.fields. promptRef — внешнее имя в binding kind=prompt (не локальный документ и не произвольный URL); role — имя kind=role. Промпт registry связывает имя с sourceRef, SHA-256 текста и закрытой схемой подстановок; sourceRef.commit равен manifest.methodology.commit.

Полиморфная `typedRef` ровно `{namespace:string,id:string}` для namespace `phase|session|node|edge|route|gate|predicate|document|counter|parameter|action|event|cycle|display|lens|coverage|registry|REQ|AC|DNC`. Последние три разрешаются в нормативных записях сопроводительной спецификации, не по совпадению подстроки. Локальная ссылка имеет ровно `{namespace,id,owner}`: namespace `status|field|marker` требует owner=document ID; `decision|gate-effect` требует owner=gate ID. Дополнительный owner на глобальном namespace запрещён. ID локален только в named owner; allowedNext/defaultDecision разрешаются внутри своего owner. IDs graph.edges, display.fields, registryBindings и остальных корневых каталогов уникальны внутри каталога, не глобально. coverage.targets разрешает все эти namespace; route.invalidate только document/gate, enqueue только node/session, document.requiredBy только node/session/gate, display.source только counter/node/document/gate. Порядок enqueue сохраняется; distinct сравнивается по всей typedRef. Совпадение ID в разных namespace законно и неоднозначности не даёт.

Внешний predicate registry содержит для каждого builtin закрытую args schema (payloadSchema), resultType и конечный непустой список outcome IDs. `predicateCatalog.builtins` содержит имена, а не объявления signatures; точный используемый набор равен множеству predicates[].builtin. Signature и тип каждого args/result сверяются с catalogRef version/digest. `unit` registry определяет пары source/numeratorRule; grammar registry — именованные ограниченные literal/token grammar, тип/domain/nullability/availability их результата; context registry — имена outputs, fieldSchema результата и availability (`required|optional`), без пользовательских реализаций. document-field binding использует именно эту signature, valueType обязан совпадать. Прочие bindings определяют конечные значения и signatures своего kind. Не существует kind=`effect-kind`. Есть не более одного binding каждого kind. Существование binding без предоставленного совпадающего registry не даёт semantic success.

`progressFormat.nSourceRules` — не схемы и не вычисленные числа, а unique array<string> по ID-regex. Каждая строка и ненулевая counted linePatterns[].unitRule разрешаются **в одном внешнем namespace unitRules** единственного registryBindings kind=unit (version/digest), не в nodes/counters/parameters и не по префиксу unit. Локального корневого unitRules нет. Та же ссылка node.unit.numeratorRule обозначает целую строку правила; её source обязан равняться node.unit.source. N и k — одна единица этой строки, не номер захода pass и не потолок.

Строка unit registry содержит именованный numerator и связанный с ним именованный denominator по закреплённой таблице «Единицы шага и откуда берётся N», плюс sourceRef/signatures; это встроенные правила, не выражения регламента. Denominator возвращает integer≥0 в безопасном диапазоне либо исход «нет данных» с причиной; availability неизвестного N не превращается в 0. Формат names/signatures конкретного комплекта ещё UNKNOWN-07. Множество nSourceRules ровно объединение всех node.unit.numeratorRule и **ненулевых counted** linePatterns[].unitRule: неизвестный ID, пропуск, дубль и лишнее неиспользуемое правило запрещены. Пустое множество даёт [], не фиктивное unit.none; для полного регламента с counted узлами оно непустое. Counted linePattern применяется только к session node с тем же numeratorRule; несколько грамматик времени для одного правила разрешены, произвольный выбор другого знаменателя — нет. До запуска N от denominator, после строки агента — его N по норме (с диагностикой расхождения); если данных нет — ?/?, не max/pass/summary.N. Для С2 denominator — **итого описи**, для С3/С4 — count REQ, для С8 — count AC; summary.K используется у соответствующей правки, но summary.N не знаменатель. Unit registry подтверждает именно эти пары по sourceRef, отсутствие matching registry — unsupported-catalog.

**Counted и zero-unit прогресс.** linePattern — закрытый union с одинаковыми обязательными ключами: id/grammar непустые string (ID уникален в linePatterns, grammar — kind=grammar ref), mode string enum `counted|zero-unit`, hasDate boolean, unitRule string|null. mode=counted требует ненулевой unitRule и node.unit; mode=zero-unit требует unitRule=null и session node.unit=null. Zero-unit применим только к кодам **связанной session** без единиц в закреплённой таблице — здесь КОММИТ и ПУШ, не к gate/terminal или произвольной agent сессии. У session node.code=session.code: переименование display-кода не разрешает zero-unit для С1. Пустая/неизвестная counted единица не разрешает zero-unit. Grammar signature подтверждает соответствующую ветвь и форму времени; конкретные registry имена остаются UNKNOWN-07.

Counted: первая строка агента 0/N старт, по строке на завершённую единицу, неубывающий k; финальная N/N готово (exact первое слово) совмещается с последней единицей. Если остановка/ворота, вместо неё k/N стоп: <вид> — <причина>; последняя единица без готово не завершает сессию. При обычном успешном неизменном N>0 это N+1 строк агента включая старт, не дополнительная строка поверх последней единицы; изменение N/остановка проверяются по своей форме, не по этой арифметике. Zero-unit: **ровно одна строка агента** `<код> 0/0 [время] старт`, без ПРОФИЛЬ; добавлять 0/0 готово или требовать N/N готово запрещено по специальному хвосту task-runner:46,133. Эта одна строка исчерпывает progress-протокол, но не доказывает успешный коммит/пуш: завершение запроса/артефакт/исход проверяются отдельно по норме run (:581–589), runtime здесь не исполняется. Отсутствие ПРОФИЛЬ для этих кодов — норма (:215,581), не потеря подсказки; counted её не наследует, даже если посчитанный denominator=0.

Общая строка оркестратора/раннера 0/0 запуск — отдельная отметка **до агента**, единиц пока неизвестно, не start/finish и не часть числа строк агента. В zero-unit 0/0 старт — единиц нет, не неизвестный N и не попытка считать его denominator. В counted фактический нулевой denominator не заменяет unitRule на null и не даёт однострочного исключения КОММИТ/ПУШ. launchMarkers ровно ["запуск"], finishMarkers ровно ["готово"] для counted; zero-unit не добавляет "старт" в finishMarkers. Во всех ветвях ключевые слова/подпись≤80/время/append-only — по норме; запуск не заменяет обязательный старт агента. Это декларации грамматик и проверки журнала, не механизм запуска/определения фактического runtime outcome.

**Виды остановки.** `stopKinds` — закрытое точное множество `{"вопрос","план","ревизия","требования","ворота"}`: массив содержит каждое значение ровно один раз, без иных значений, независимо от registry. В каждой counted progress-строке, завершающей сессию остановкой, подпись имеет форму `стоп: <вид> — <причина>` и `<вид>` обязан быть ровно одним из этого множества; чужой, отсутствующий, пустой или повторный вид недопустим. Успешная `готово` и zero-unit `старт` не требуют вида остановки. Источник enum и формы — закреплённый `task-runner.md`, «Строки progress.log»:92; это декларация, не будущий validator/runtime результат.

`valueBinding` — закрытый union без выражений: `{kind:"literal",value:<JSON>}`, `{kind:"counter",ref:<counter ID>}`, `{kind:"parameter",ref:<parameter ID>}`, `{kind:"event-field",eventId:<event ID>,field:<имя свойства>}`, `{kind:"document-field",documentId:<document ID>,fieldId:<локальный field ID>}`, `{kind:"context",catalogRef:<binding kind=context>,name:<registry имя>}`. Ровно перечисленные ключи каждой ветви обязательны, кроме literal.value=null все строковые поля non-null; ref/field/name непустые. Только верхнеуровневое поле; dotted path/индексы/формулы/интерполяция запрещены. eventId должен равняться edge.on. document-field.valueType совпадает с type результата grammar; полный domain/availability проверяется по правилам fieldSchema выше. Файл не выполняет fallback. object/array payload задаются одной JSON-константой либо одной совместимой типизированной ссылкой. actionUse.bindings обязан полностью связать required свойства; весь domain/nullable/availability источника совместим с получателем рекурсивно. Для action/event payloadSchema должна точно совпадать с внешней signature, а не переопределять её. Для gateEffect.payload — уже конечные значения по effect signature.

`counterEffect.when="route"` требует event=null; `when="event"` требует event=edge.on связанного route. Это фильтр внутри данного route, не глобальная подписка/второе применение. set требует ненулевой valueBinding совместимого типа; recompute требует ненулевую ссылочную valueBinding (kind≠literal), означает копирование явно связанного snapshot-значения, не свободную формулу; increment/decrement требуют integer counter и valueBinding=null (ровно +1/−1); reset требует null и означает initial; preserve требует null. Результат связан declared bounds, выход из домена недопустим; знание runtime-значения не подменяется статической догадкой. Для вычисленных значений используется именованный внешний context output с фиксированной signature, не выражение. Например pass_origin←pass выражается recompute/counter. В одном route максимум один эффект на counter, включая preserve; конфликтующие и даже одинаковые дубли запрещены. Route — единственный источник counter effects; decision.counterEffects строго [] (старую двойную запись отклонить). route.preserve точно равно множеству counter IDs его preserve effects. counter.incrementOn ровно все route IDs с increment этого counter; resetOn ровно все с reset; списки unique, это обратные индексы, не команды. Отсутствие route effect означает «не изменять», но обязательная явная политика jump требует перечислить каждый counter; restart не является неявным reset.

parameters — массив parameter. Ключи default/minimum/maximum/values всегда присутствуют. required=true запрещает ненулевой default, но не ключ; required=false требует ненулевой default. integer: minimum/maximum целые или null, минимум≤максимум, default в пределах; значения integer в диапазоне безопасных JSON integers ±9007199254740991. Для остальных типов minimum=maximum=null. enum: values непустой unique массив строк, default (если не null) в values; для иных типов values=null. string default непустой; boolean default true/false. on_named_event требует непустой unique resetEvents из events; never/on_new_task требуют []; reset параметра означает его явно заданный default либо новый обязательный внешний input, не ноль. cycle.cleanChecksParam/ceilingParam требуют integer parameter с minimum≥1; minimumProbesParam с minimum≥0. Значения только по этим ссылкам: дубли cleanChecks/minimumProbes/ceiling в cycle запрещены. Обязательный параметр без default допустим как декларация домена, но его runtime input не выдумывается. stage=`spec|plan|review|delivery|meeting` уникален в cycles и не разрешается через profile-stage.

graph.edges — авторитет для перехода, события, predicate/outcome и actionUse. Route — аннотация ровно одного ребра: route.edgeId=edge.id и edge.routeId=route.id, targetNode=edge.to. Ни orphan route, ни два route у edge, ни повторное исполнение перехода/эффектов через decision допустимы. Для trigger.kind=event ref.namespace=event, ref.id=edge.on и value=edge.outcome; predicate-outcome требует namespace=predicate, id=edge.predicate, value=edge.outcome; gate-decision требует namespace=gate, ref.id=gate узла edge.from, value=локальный decision.id, decision.routeId=route.id. Gate-decision edge.on ссылается на событие kind=owner_decision с required gateId/decisionId по event signature; signature route-trigger отображает decision value в конкретный outcome, который должен равняться edge.outcome. Именно эту матрицу должен дать matching registry; неизвестная матрица — unsupported-catalog, не право выбирать другой target. Обычное ребро без route допускает actions, но не скрытые counter effects. gate.effects — только намерения открытия/ожидания ворот по effect signature, не дополнительные переходы/counter writes.

filename — basename без `/`, `\\`, glob, `.`/`..` как полного имени. Токены только `{N}`, `{round}`, `{lens}`, `{void}`; числовые — десятичное положительное безопасное целое без ведущего нуля; `{lens}` — ровно один ID из lenses (без подстановки title). Для `proposal-review-{N}-{lens}.md` непустой lenses обязателен. Повтор токена запрещён; номер связывается **по семейству**, не общей summary. Семейство развернуть по каталогу lenses; два document patterns не должны давать одно имя для допустимых токенов. Частичные/недействительные семейства вроде `proposal-review-{N}-{lens}.void-{void}.md` не дают завершённый заход. Каталог линз декларативный, не разрешение запускать агентов этой С1.

`document.numberBinding` — closed union, все ключи каждой ветви required/non-null: `{kind:"summary",fieldId:string}` либо `{kind:"context",catalogRef:string,name:string}`. fieldId — локальный documents[].fields ID этого документа; catalogRef — registryBindings ID kind=context, name — точное имя output в этом binding. При `{N}` объект обязателен, без `{N}` запрещён; null/default/эвристика не допускаются. У review семейств только summary binding на поле id=summary; grammar registry даёт закрытый object N/K/M/P (N≥1,K/M/P≥0). У facts только context binding: required/non-null integer minimum=1,maximum=null, sourceRef на task-runner.md «check_meeting(n)»; output — именно n текущего захода meeting, не следующий pass, не count источников и не feedback round. Добавление summary в facts не заменяет этот binding и нарушает его машинную форму. Недоступный output — нет проверяемого номера, не выдуманный N.

| Семейство | Источник номера и grammar закреплённого task-runner.md |
|---|---|
| spec-review-{N}.md, plan-review-{N}.md, review-{N}.md, delivery-review-{N}.md | numberBinding summary; первая строка Заход N: … («Машинные форматы») |
| proposal-review-{N}.md, proposal-review-{N}-{lens}.md | та же summary.N; n передан check_meeting/run линзы; не номер линзы |
| facts-{N}.md | numberBinding context; n передан держателю фактов check_meeting(n), без summary |
| feedback-{round}.md | round из первой строки Раунд N: …; отдельный feedback_round |
| customer-{round}.md | round сохраняемого прежнего customer при feedback; внешний контекст feedback_round |
| *.void-{void}.md для meeting | N остаётся номером недействительного захода; void — отдельный ordinal повтора |

Для первых двух строк N имени=summary.N=переданный номер проверки. Facts grammar: только строки с наблюдалось:/не наблюдалось:/не измерено:/вывод:, у всех кроме не измерено: источник:, при необходимости выдержка:; последняя строка не читал: <перечень> — специально разрешённое завершение, не пятый ответ и не summary. Нет вопросов — facts файл не требуется. Void/partial не становятся завершёнными review/facts и не увеличивают max(N) завершённых проверок; номер void берётся из контекста недействительного прохода по sourceRef check_meeting, не summary.N. Grammar names/полные signatures этих семейств в registry ещё UNKNOWN-07; фактические формы источника от этого не меняются.

subsystem inputSchema/outputSchema — payloadSchema с additionalProperties=false; noData является отдельным исходом отсутствия данных с обязательной причиной, не нулевым значением output. storage указывает логическое место, не файл и не фактическое runtime state. Отсутствие подсистемы равнозначно enabled=false, не missing-field. В language input/output описывают переводимые данные и источник оригинала, в usage — один источник токенов/цены/времени, в deadlines — переданные отметки/лимит/исход; конкретные signatures остаются внешними UNKNOWN-07. Даже включение не обещает реализацию опытного режима.

Комментарии исходного JSONC обязательны: до корневого `{` один комментарий шапки с буквальным `Методика: <repository> @ <commit>`, совпадающим с manifest; непосредственно перед каждым объектом nodes[] и graph.edges[] — непустой комментарий `Узел <id>: <описание>` или `Переход <id>: <описание>`. Он объясняет назначение/условия/исход, не только повторяет ID; независимая сверка проверяет подробность, reader проверяет наличие/совпадение ID. Пропуск/расхождение — invalid-document-rule, не warning. Поля остаются машинной истиной. Нормализованный JSON теряет комментарии, потому проверку этой нормы проводят на исходном JSONC до нормализации; очищенную копию нельзя выдавать за полный исходный JSONC.

`sourceRef` ровно `{file:string,section:string,commit:string}`; file из manifest.methodology.files, section непустой якорь, commit равен manifest.methodology.commit. `sourceFile` — path этого списка. terminal — node без исходящих edges; gate не становится terminal из-за ожидания человека. node kind=session требует sessionId и gateId=null; gate требует gateId и sessionId=null; остальные оба null. unit ненулевой у session с единицами по registry (counted), у КОММИТ/ПУШ и не-session null; применимость zero-unit только по правилу выше. Узлы/entry/terminal фаз относятся к своей phaseId; node с sessionId имеет ту же phaseId, что session.

**Диагностика без выдуманного источника.** category — закрытый enum `syntax|structural|semantic`, определяется нарушенным правилом, не доступностью sourceRef: syntax — нет однозначного дерева (включая duplicate-key); structural — ключи/типы/диапазоны/закрытые формы/поддержка schemaVersion; semantic — ссылки, согласованность, registry и полнота нормы. Один code может описывать разные условия, но category конкретной записи обязана соответствовать условию. Невалидный manifest не превращает missing-field/type в syntax; синтаксический отказ не обещает structural/semantic проверок.

sourceRefReason — обязательный ключ, ровно null при ненулевом sourceRef. При sourceRef=null обязательна одна причина по приоритету: `syntax-unavailable` (нет однозначного дерева) → `manifest-missing` (ключ manifest отсутствует) → `manifest-invalid` (manifest или methodology/files нарушают свою закрытую форму) → `mapping-unavailable` (паспорт структурно корректен, но источник/его hash/якорь конкретного правила не подтверждён либо сопоставление неоднозначно). Первые три причины исключают mapping; четвёртая относится к данной диагностике, не разрешает обнулить успешные ссылки других записей. При первых трёх все диагностики этого входа имеют sourceRef=null; category остаётся отдельной. Корень не object — structural/type и manifest-missing, не syntax.

Успешное source mapping означает: паспорт структурно корректен, доступны именно закреплённые file/commit/sha256, и единственный якорь нарушенного правила подтверждён в этих байтах. Тогда sourceRef обязателен/non-null по общей форме, sourceRefReason=null; null «по желанию» запрещён. Отсутствующий файл, несовпавший hash/commit или неразрешённый/неоднозначный якорь дают mapping-unavailable, не фиктивный sourceRef. Комментарий шапки, имя файла, встроенная догадка о методике и значения повреждённого паспорта не восстанавливают источник. Это контракт результата проверки, не схема runtime-state; требование ненулевого sourceRef у predicate/parameter/action/event не ослаблено. Для отсутствующего свойства pointer указывает его предполагаемое место, координаты — начало содержащего объекта; при отсутствии дерева pointer="", координаты — место синтаксического дефекта.

Предложенная (не утверждённая в 013) закрытая оболочка сценария: `{scenarioVersion:string,contractRef:string,id:string,links:array,initialState:object,events:array,expected:object}`. Все ключи обязательны/non-null; links unique `{kind,ref}` (kind REQ/AC/DNC/source, ref точный ID/якорь). Нужны все requiredLinks из scenarioContract. events — непустая последовательность `{kind:string,payload:object}` из внешнего scenario registry. expected ровно `{steps:array}`; массив nonempty, каждое ожидание соответствует одному событию по обязательному eventIndex (integer от 0). Успешная запись ровно `{eventIndex,state?,actions?}`, причём ключи state:object и actions:array присутствуют ровно по expectedKinds state/actions. Ошибочная запись ровно `{eventIndex,error:object}` разрешена только с error в expectedKinds; error по внешней signature. Индексы начинаются с 0 и непрерывны, без повторов; успех требует steps.length=events.length; первая ошибка — последний step, последующие события не имеют ожиданий/не исполняются этим fixture. В режиме state-only actions запрещён, actions-only state запрещён; state/actions одновременно законны. Empty events в этой оболочке запрещены: initial-only проверка потребует отдельной версии/согласования. Порядок actions значим, expected — независимые явные данные. initialState/state/actions/error schemas, kind/payload и точное contractRef остаются UNKNOWN-08; структурная оболочка не доказывает совместимость с ядром 013.

### Законные/незаконные пары данных

Это отдельные записи/мутации, не дополнительные корни. Обёртки legal/illegal только для сравнения, не поля схемы. Предполагаются объявленные адресаты и matching signatures; без них остаётся UNKNOWN, не semantic success.

1. **Подсистемы, REQ-21/AC-17:** отсутствие language/usage/deadlines законно и выключает. У выключенного объекта все четыре nullable поля должны быть null; ненулевой storage незаконен:

```json
{"legal":{"enabled":false,"inputSchema":null,"outputSchema":null,"storage":null,"noData":null},"illegal":{"enabled":false,"inputSchema":null,"outputSchema":null,"storage":{"scope":"task_state","key":"usage"},"noData":null}}
```

Включённый usage законен по локальной форме с inputSchema/outputSchema, например закрытой схемой `{"type":"object","properties":{"tokens":{"type":"integer","nullable":false,"minimum":0,"maximum":null}},"required":["tokens"],"additionalProperties":false}`, storage=`{"scope":"task_journal","key":"usage"}`, noData=`{"tag":"no_data","reasonRequired":true}`. Замена inputSchema на null незаконна. Конкретные usage signatures — внешний вход, пример не измеряет токены.

2. **Сессии, REQ-07/AC-07:** при phase analysis/role owner human.role ненулевой законен, null незаконен. System с обоими null законен, с role=owner незаконен; agent/meeting с promptRef=null незаконны:

```json
{"legal":{"id":"session.owner","code":"OWNER","kind":"human","phaseId":"analysis","role":"owner","promptRef":null,"repeatable":true},"illegal":{"id":"session.owner","code":"OWNER","kind":"human","phaseId":"analysis","role":null,"promptRef":null,"repeatable":true}}
```

3. **Parameters, REQ-24/AC-34:** контейнер массив; enum.values определяет домен, default вне него незаконен. required=true/default=null законен, true/default=owner или отсутствие ключа default незаконны. Для enum ненулевые minimum/maximum незаконны:

```json
{"legal":{"id":"parameter.mode","type":"enum","required":false,"default":"owner","minimum":null,"maximum":null,"values":["owner","show_continue"],"resetPolicy":"never","resetEvents":[],"sourceRef":{"file":"task-runner.md","section":"Ворота","commit":"0123456789abcdef0123456789abcdef01234567"}},"illegal":{"id":"parameter.mode","type":"enum","required":false,"default":"unknown","minimum":null,"maximum":null,"values":["owner","show_continue"],"resetPolicy":"never","resetEvents":[],"sourceRef":{"file":"task-runner.md","section":"Ворота","commit":"0123456789abcdef0123456789abcdef01234567"}}}
```

4. **Catalog/signatures/typed refs, REQ-14/26/35, AC-11/31/38:** predicateCatalog из connected-fragment законен по форме, добавление `"signatures":[]` — unknown-field; builtins строковые имена, объект signature вместо строки — type. Document/gate могут оба иметь ID same: invalidate=`[{"namespace":"document","id":"same"}]` законен, `["same"]` незаконен. У status.draft двух документов owner обязателен:

```json
{"legal":{"namespace":"status","owner":"doc.spec","id":"status.draft"},"illegal":{"namespace":"status","id":"status.draft"}}
```

requiredBy=`[{"namespace":"node","id":"node.spec"}]` законен. promptRef=prompt.spec требует kind=prompt binding и соответствующую запись/hash/sourceRef; отсутствие не разрешается поиском по файлам. cycle.stage=spec из закрытого cycle enum, не profile-stage.

5. **Effect, REQ-11/28, AC-32/42:** binding test.effects.kind=effect плюс gateEffect.kind=human_decision в connected-fragment законны при совпадающей effect signature. Та же запись binding с kind=effect-kind незаконна по enum. Human decision без confirmation/resultEvent незаконен, с true/event.owner.decision законен.

6. **CounterEffect, REQ-23/30, AC-33:** при совместимых integer counters origin←pass выражается явно. Literal для recompute незаконен (для set в пределах bounds законен). increment/null/when=event/event=edge.on законен; ненулевой valueBinding, другой event или when=route/event≠null незаконны:

```json
{"legal":{"counterId":"counter.origin.spec","operation":"recompute","when":"route","event":null,"valueBinding":{"kind":"counter","ref":"counter.pass.spec"}},"illegal":{"counterId":"counter.origin.spec","operation":"recompute","when":"route","event":null,"valueBinding":{"kind":"literal","value":1}}}
```

Два одинаковых/разных effects на counter в route незаконны; decision.counterEffects=[] законен, непустой незаконен. resetOn=[route.reset] законен только при соответствующем reset effect; без него — invalid-reset. route.preserve совпадает с preserve effects, не создаёт второго применения. Тип/domain всех bindings проверяется, runtime значение не выдумывается.

7. **Cycle/parameters, REQ-25/AC-19:** при parameters с type=integer, minimum=1/0/1, default=2/3/4, route.repair к fixer, gate.ceiling и doc.spec форма ниже законна. Добавление cleanChecks=3 незаконно даже если число совпало с default; stage=develop незаконен; minimum ceiling parameter=null незаконен (домен не гарантирует >0). Repair target=существующий terminal незаконен:

```json
{"id":"cycle.spec","stage":"spec","artifact":"doc.spec","cleanChecksParam":"parameter.clean","minimumProbesParam":"parameter.min-probes","ceilingParam":"parameter.ceiling","countedOutcomes":["outcome.clean"],"ceilingGate":"gate.ceiling","repairRoute":"route.repair"}
```

8. **Payload bindings, REQ-27/28, AC-37:** open-gate требует string gateId. Missing/лишний binding, literal integer, expression — illegal. object/array задаются literal JSON или одной совместимой ссылкой, не языком выражений:

```json
{"legal":{"actionId":"action.open-gate","bindings":{"gateId":{"kind":"literal","value":"gate.spec"}}},"illegal":{"actionId":"action.open-gate","bindings":{"gateId":{"kind":"expression","value":"gate.id"}}}}
```

Для run_session(required source:string,pass:integer) законны source=`{"kind":"context","catalogRef":"registry.context","name":"source.review_plus_extra"}` и pass=`{"kind":"counter","ref":"counter.pass.spec"}` при внешней signature и availability. Склейка review+extra строкой/кодом запрещена: only fixed context output. event-field ссылается только на поле события данного edge.on; чужой eventId незаконен.

9. **Graph/routes, REQ-09/10/35, AC-41:** edge.gate.done.to=node.done и route.approve.targetNode=node.done законны; изменить только route target на существующий node.spec — invalid-route (не unresolved-reference). edge.routeId=null при том же route.edgeId тоже незаконен. Counter writes только route, actions только edge.

10. **Scenario sequence, REQ-31/32, AC-23/24/40:** при expectedKinds=[state,actions,error] и внешнем test contract события e принимают {}, state имеет n:integer; requiredLinks=[REQ,AC,source]. Полная предложенная оболочка двух событий ниже законна по локальной форме, не утверждённый fixture 013:

```json
{"scenarioVersion":"1.0","contractRef":"sample.scenario@1.0","id":"scenario.two-steps","links":[{"kind":"REQ","ref":"REQ-31"},{"kind":"AC","ref":"AC-40"},{"kind":"source","ref":"task-runner.md#Алгоритм"}],"initialState":{"n":0},"events":[{"kind":"e","payload":{}},{"kind":"e","payload":{}}],"expected":{"steps":[{"eventIndex":0,"state":{"n":1},"actions":[]},{"eventIndex":1,"state":{"n":2},"actions":[]}]}}
```

Замена второго eventIndex на 0 незаконна; expected={state:{n:2},actions:[]} вместо steps незаконен. Для state-only step=`{"eventIndex":0,"state":{"n":1}}` законен, с дополнительным actions=[] незаконен; actions-only аналогичен. Последний step=`{"eventIndex":1,"error":{"code":"rejected"}}` законен по внешней signature, error с последующим success незаконен. Первый error и один step для двух событий законны, после ошибки больше ожиданий нет.

11. **Filename/comments, REQ-05/15, AC-06/14:** при lens consistency и meeting session filename=proposal-review-{N}-{lens}.md для N=1 даёт proposal-review-1-consistency.md. proposal-review-{N}-{unknown}.md незаконен. Шапка connected-fragment совпадает с manifest; другой commit незаконен. Комментарий перед edge.gate.done имеет его ID и описание; отсутствие/ID другого edge незаконны. Подробность пояснений — независимая сверка, не JSON parse.

12. **Маркеры/вопросы, REQ-18, находки 13/14:** `REQ-01 — ...` в начале абзаца законен, `**REQ-01** — ...` незаконен. Законны `## Опись источников` и последняя строка `итого: <число>`, где число равно количеству пунктов этой описи; прежние «Опись входа»/итог прозой незаконны. Блоки В-01…В-05 ниже имеют ? в конце вопроса и отдельные поля; one-line вопрос без Тип:/отдельной Рекомендации: незаконен. Это текстовые входы, не JSON records.

13. **Рекурсивные schemas, REQ-23/27, AC-33/37:** шесть ветвей осматриваются и внутри items/properties. У object ниже x обязательно, nullable; y optional/non-null. Значения {} и {x:1,y:null} незаконны, {x:null} и {x:1,y:[]} законны. Пара меняет только unique required:

```json
{"legal":{"type":"object","nullable":false,"properties":{"x":{"type":"integer","nullable":true,"minimum":1,"maximum":null},"y":{"type":"array","nullable":false,"items":{"type":"boolean","nullable":false},"maxItems":2}},"required":["x"],"additionalProperties":false},"illegal":{"type":"object","nullable":false,"properties":{"x":{"type":"integer","nullable":true,"minimum":1,"maximum":null},"y":{"type":"array","nullable":false,"items":{"type":"boolean","nullable":false},"maxItems":2}},"required":["x","x"],"additionalProperties":false}}
```

Отдельные single mutations legal: у y удалить maxItems или поставить 2.5/null/0/10001 — незаконно; у вложенного x удалить minimum или поставить minimum=2,maximum=1 — незаконно; добавить enum к boolean — незаконно; additionalProperties=true или required=[z] — незаконно. Context schema integer/false/minimum=1/maximum=null с availability=required законна для set/recompute counter bounds min=1,max=null; изменение только minimum на 0/null, nullable на true или availability на optional несовместимо. Это проверка объявленного домена, не успешного runtime snapshot.

14. **Источник N, REQ-08/19, AC-15:** для connected-fragment и binding test.units.kind=unit, unitRules ID unit.spec пара ниже законна/незаконна по форме:

```json
{"legal":["unit.spec"],"illegal":[1]}
```

Это значения только nSourceRules, не новый корень. [{}], [unit.spec,unit.spec] незаконны; [counter.pass.spec] тоже при существующем локальном counter, но отсутствии такого unitRules ID. Counted linePattern.unitRule=unit.spec и node.unit.numeratorRule=unit.spec используют одну пару k/N; замена только counted linePattern.unitRule на другое объявленное правило без добавления его в nSourceRules нарушает полноту, добавление неиспользуемого правила тоже. Zero-unit/null не добавляется в nSourceRules. Для С2 с итого: 18 и summary.N=2 знаменатель 18, не 2; при отсутствии обоих машинных источников до строки агента — ?/?. Конкретные business names registry не объявлены утверждёнными.

15. **Номер facts, REQ-15/17, AC-14/28:** binding review=`{"kind":"summary","fieldId":"summary"}`; facts=`{"kind":"context","catalogRef":"registry.context","name":"meeting.current-pass"}` при required integer output n=2. Для facts-2.md законный текст без summary:

```text
не измерено: вопросы не содержат измерения
не читал: код исполнителя
```

Замена только binding facts на summary незаконна; вставка первой строки Заход 2: … тоже. Context n=3 при имени facts-2.md — конфликт номера. Ненулевой context не доказан без matching registry; два text lines показывают форму, не реальный ответ держателя.

16. **Диагностика, REQ-33/AC-30/39:** для первого корня без manifest законен результат ниже; незаконная пара меняет только sourceRef на выдуманный из комментария шапки. Это данные ожидаемой диагностики, не результат запуска reader:

```json
{"legal":{"code":"missing-field","severity":"error","message":"manifest отсутствует","category":"structural","jsonPointer":"/manifest","line":2,"column":1,"sourceRef":null,"sourceRefReason":"manifest-missing"},"illegal":{"code":"missing-field","severity":"error","message":"manifest отсутствует","category":"structural","jsonPointer":"/manifest","line":2,"column":1,"sourceRef":{"file":"task-runner.md","section":"Машинные форматы","commit":"0123456789abcdef0123456789abcdef01234567"},"sourceRefReason":"manifest-missing"}}
```

При manifest=null либо commit=7/files=null категория structural/type и причина manifest-invalid; при одновременно неверном commit и недоступном файле приоритет manifest-invalid. При незакрытой строке/duplicate-key — category=syntax, reason=syntax-unavailable, null ref даже при видимом тексте manifest. При законном паспорте и недоступных закреплённых байтах/hash mismatch/отсутствующем или неоднозначном якоре — mapping-unavailable: structural для ошибки формы, semantic для unresolved-reference. Сама причина не меняет category/code.

Парный успешный mapping: при независимо подтверждённых байтах sample commit/hash и якоре task-runner.md#Единицы шага и откуда берётся N (одна строка КОММИТ/ПУШ), diagnostic нарушения этой нормы имеет code=invalid-document-rule/category=semantic, sourceRef=`{"file":"task-runner.md","section":"Единицы шага и откуда берётся N","commit":"0123456789abcdef0123456789abcdef01234567"}`, sourceRefReason=null. Замена только sourceRef на null, либо только reason на mapping-unavailable, пропуск reason, чужой file/commit и пустой section незаконны. Это условный положительный контроль; вымышленные hashes connected-fragment сами подтверждения не дают. Замена category на syntax у missing manifest также незаконна.

17. **Counted/zero-unit, REQ-07/08/19/20, AC-15:** пары linePattern ниже меняют только unitRule; остальные ссылки предполагают matching grammar registry, не исполняются:

```json
{"counted":{"legal":{"id":"progress.counted","grammar":"progress.basic","mode":"counted","hasDate":false,"unitRule":"unit.spec"},"illegal":{"id":"progress.counted","grammar":"progress.basic","mode":"counted","hasDate":false,"unitRule":null}},"zeroUnit":{"legal":{"id":"progress.zero","grammar":"progress.zero-unit","mode":"zero-unit","hasDate":false,"unitRule":null},"illegal":{"id":"progress.zero","grammar":"progress.zero-unit","mode":"zero-unit","hasDate":false,"unitRule":"unit.spec"}}}
```

Counted legal применим к node.spec connected-fragment (unit.source=spec/numeratorRule=unit.spec). Законные данные журнала N=2: `["С1 0/2 старт","С1 1/2 источник проверен","С1 2/2 готово"]` плюс отдельная ПРОФИЛЬ от С1 по норме; это три строки агента, запуск не считается. Замена только последней подписи на «источник проверен»/«готово:», пропуск старта или перенос counted grammar на node.unit=null незаконны; k>N показывается как есть по источнику, не становится zero-unit.

Zero-unit legal применим к session nodes с кодом КОММИТ/ПУШ, unit=null и sessionId соответствующего кода. Например node ровно `{"id":"node.commit","code":"КОММИТ","kind":"session","phaseId":"delivery","sessionId":"session.commit","gateId":null,"unit":null,"description":"Создать коммит по решению владельца"}` при объявленных phase/session. Для него данные `["КОММИТ 0/0 старт"]`, для ПУШ `["ПУШ 0/0 старт"]`, profile lines=[] законны: по одной строке агента. Замена node.unit на объект counted unit.spec, unitRule на unit.none, mode на counted, добавление второй «0/0 готово» или ПРОФИЛЬ незаконны. Перенос zero-unit на С1 или gate также незаконен, даже при null unit. Предварительные `["КОММИТ 0/0 запуск"]`/`["ПУШ 0/0 запуск"]` — отдельные данные оркестратора: «неизвестно», не «единиц нет»; подмена ими агентского старта не завершает протокол. Пара 17 имеет hasDate=false и базовые grammar без времени; проектные grammar с hasDate=true требуют дату/время, их пропуск незаконен. Connected-fragment сохраняет проектную counted форму. Никакой выдуманной даты журнала здесь нет. Это парные данные статической проверки, не git/runtime тесты.

**18. Виды остановки, REQ-19/AC-15.** По `task-runner.md:92` разрешено ровно множество `{"вопрос","план","ревизия","требования","ворота"}`. Полный массив без повторов — положительная форма; замена любого вида чужим значением `surprise`, пропуск нормативного вида или дубль — отрицательные формы. Для строки counted остановки `С1 1/2 стоп: ворота — ожидаю решение` вид разрешён; замена `ворота` на `surprise`, отсутствие вида либо причины запрещены. Сопоставление этих данных с текстовым контрактом не является JSONC/parser/schema validator или runtime пробой.

### Закрытые и неустановленные словари

Закрыты самой схемой: JSON primitive types; schema `kind`; session `kind`; resultType; node kinds; progress mode; multiplicity; normalization; onInvalid; counter operation/type; parameter type/resetPolicy; coverage kind/disposition; diagnostic severity/category/sourceRefReason; boundary enums. Регистр значений exact. Ни один из них не наследуется из произвольной строки.

## Требования

Все REQ обязательны к предлагаемому формату. Точные ограничения и соглашения этой С1 — нормативные предложения до решения на С2/воротах владельца.

REQ-01 — Назначение и полнота. Документ с полным подтверждённым комплектом внешних registries декларирует всю применимую норму закреплённого task-runner.md, не удобный срез: фазы, редкие сессии, промежуточные ворота, ошибки, feedback, сдачу, commit/push, опытные режимы с их статусом. Без registries нельзя заявлять semantic success. Источник: владелец, 2026-10-13: «т.е. надо придумать спецификацию этого json под раннер»; task-runner.md; бриф #12.

REQ-02 — JSONC. UTF-8 без BOM; комментарии // и /*...*/ только вне JSON-строк. Стандартные двойные кавычки/escape; одинарные кавычки, незакрытые комментарии, trailing comma, NaN/Infinity, повторные ключи запрещены. // и /* внутри строки остаются текстом. Источник: владелец «JSONC»; ограничения диалекта — конкретизация С1.

REQ-03 — Чистый JSON. Нормализация удаляет только комментарии, сохраняет значения/строки и порядок массивов; порядок ключей незначим. Результат — UTF-8 JSON с эквивалентным деревом. Проверка обязательных комментариев происходит до удаления, чистая копия не заменяет исходный регламент. Источник: task/message.md:26; 013 REQ-24; конкретизация С1.

REQ-04 — Версия схемы. schemaVersion и compatibility.minReaderVersion обязательны, major.minor. Меньший reader, неизвестная major либо minor с неизвестными полями — отказ без fallback. Пример: "schemaVersion":"1.0","compatibility":{"minReaderVersion":"1.0"}. Источник: Канон; конкретизация С1.

REQ-05 — Паспорт и комментарии. manifest содержит id/name/regulationVersion (major.minor.patch), methodology.repository ровно https://github.com/unitcraft/ai-dev-methodology, commit 40 hex, files с path/sha256 для task-runner.md, task-sessions.md, task-algorithm.md и всех используемых норм. Шапка обязана дублировать repo/commit; каждый node/edge — иметь подробный комментарий по контракту полей. Комментарии не заменяют поля. Изменение источника требует нового комплекта/hash и сверки. Источник: task/message.md:22; Канон README; конкретная грамматика — С1.

REQ-06 — Фазы. phases непустой массив id/code/title/ordinal/entryNode/terminalNodes по таблице; ordinal целое ≥0, уникально. Все применимые фазы представлены; entry/terminalNodes разрешаются в nodes своей фазы. Источник: task-runner.md «Словарь», run_task; task/message.md.

REQ-07 — Сессии и роли. sessions по таблице, все применимые С1…С9, правки/продолжения, КОММИТ/ПУШ/совещание. КОММИТ/ПУШ без единиц по специальному хвосту, не скрытые counted сессии. agent/meeting требуют ненулевые role/promptRef; human требует role и promptRef=null; system требует оба null. role и promptRef разрешаются во внешних закреплённых kind=role/prompt registries; phaseId локален в phases. Источник: task-runner.md, task-sessions.md; nullability/адресация — С1.

REQ-08 — Узлы и единицы. nodes по таблице и правилам kind/nullability; counted unit.source/numeratorRule и linePattern.unitRule разрешаются в kind=unit/unitRules по таблице единиц task-runner, с общей парой k/N. Zero-unit КОММИТ/ПУШ имеют node.unit=null и linePattern.unitRule=null, не unit.none; не-session null unit не разрешает progress сессии. Неизвестная единица не ноль. session node указывает ровно сессию с тем же code, gate node ровно gate, terminal не имеет исходящих edges. Источник: task-runner.md «Словарь», «Единицы шага».

REQ-09 — Граф. graph содержит startNode/terminalNode/edges. Edge по таблице, actions — actionUse с полными bindings, routeId — null или аннотация route. Граф авторитетен для from/to/on/predicate/outcome/actions; on всегда events ID. Все исходы нормы покрыты, from/on/outcome не дублируется; terminal достижим. Циклические компоненты допустимы только с соответствующим cycles.artifact узлом/документом и предусмотренным выходом, не по догадке о названии. Источник: task-runner.md run_task/loop_review; relation — С1.

REQ-10 — Возвраты и маршруты. route содержит edgeId/trigger/targetNode/invalidate/enqueue/preserve/counterEffects. Взаимные edgeId/routeId и targetNode=edge.to обязательны; typedRef исключает поиск по имени. Триггер согласован с edge и decision по статическим правилам; routes не конкурируют с графом. Возврат требований/плана, остановки С5/С5п, feedback/resume ведут в точные узлы; enqueue упорядочен. Неизвестный маршрут не завершение. Источник: task-runner.md route_answer/to_requirements/to_plan/feedback; конкретизация С1.

REQ-11 — Ворота. gates содержит все применимые В1–В13/В10а…г по таблице. ownerRequired=true требует defaultDecision=null и непустой decisions; иначе defaultDecision ссылается на локальное решение с основанием нормы. Decision.counterEffects=[]; counter effects задаются только его route. gateEffect.kind разрешается только binding kind=effect; confirmation/resultEvent по signature. Обязательное решение человека не отключается/default не подставляется. Источник: task-runner.md «Ворота»; Канон process.md.

REQ-12 — Составные ворота сдачи. Commit, проверка сообщения, push и отправка результата сохраняют отдельные решения/узлы и последовательность нормы, не общую кнопку «сдать». Ожидание человека — gate node, не terminal. Источник: task-runner.md gates/delivery.

REQ-13 — Предикаты. predicates по таблице: builtin из фиксированного whitelist, args по внешней закрытой signature, resultType boolean/enum. Код/выражения запрещены. Все используемые условия нормы представлены: чистая серия, потолок, пробы, уровни остановки, статус/утверждение, ворота, запуск. Источник: task/message.md:23; task-runner.md.

REQ-14 — Каталог и signatures. predicateCatalog содержит catalogVersion/catalogRef/builtins (ровно имена использованных builtin). Signatures только во внешнем registry binding kind=predicate с version/digest: args schema, resultType, outcome IDs. catalogVersion равна binding.version; отсутствие/несовпадение registry — unsupported-catalog; неправильный args — invalid-payload. Никаких пользовательских функций. predicate.sourceRef обязателен. Источник: task/message.md; task-runner.md; размещение signatures — С1.

REQ-15 — Машинные документы. documents по таблице; filename только basename с typed tokens N/round/lens/void по контракту. Для `{N}` требуется numberBinding: review→summary.N, facts→context n текущего meeting из check_meeting(n), без summary; round/void имеют отдельные источники. Все виды машинной таблицы представлены, включая proposal-review-{N}-{lens}.md, facts и journals; факты сохраняют четыре начала строк/источник и финальное не читал:. requiredBy — typedRef. Текст вне объявленной области не машинное поле. Источник: task-runner.md «Машинные форматы», «Совещание агентов».

REQ-16 — Статусы. statusRules содержит id/firstLine/meaning/allowedNext; id локален документу, ссылки квалифицируются owner при выходе за него. Шаблоны взаимоисключающие; черновик/утверждено/в работе/готово только у соответствующих документов. Неизвестный статус не успех/default. Источник: task-runner.md «Машинные форматы».

REQ-17 — Сводки. Только у review семейств documentField id=summary задаёт грамматику «Заход N: существенных K, поверхностных M, проб P», N≥1, K/M/P≥0, N=токену имени по numberBinding. Отсутствие/дубль/конфликт со списком находок не дают чистый заход. У facts summary не требуется и запрещена машинной grammar; его номер по REQ-15. Источник: task-runner.md «Машинные форматы», loop_review/check_meeting.

REQ-18 — Маркеры. fields по таблице представляют База, REQ/AC/DNC в буквальном начале строки, Опись источников/последнее «итого:» с числом, равным количеству пунктов этой описи, шаги/DoD, Ветка, решено:, result steps, Трассировка/пометки владельца, Секреты в diff:, Раунд/Маршрут, поля совещания. Проза не поле. Источник: task-runner.md «Машинные форматы».

REQ-19 — Progress. progressFormat описывает counted/zero-unit формы методики/проекта, дату/время, запуск/старт/готово/стоп и виды остановок, учёт от launch offset, неизвестный N/расхождение. `stopKinds` — точное множество `вопрос|план|ревизия|требования|ворота`, каждое ровно один раз; остановочная строка counted-сессии обязана выбрать ровно один из этих видов и дать причину, чужой/отсутствующий/пустой/повторный вид запрещён. Успешная готово и zero-unit старт не являются остановкой. nSourceRules — unique array<string> refs kind=unit/unitRules, точное множество ненулевых используемых node/counted linePattern правил (zero-unit не элемент). Нельзя заменять N номером захода. Counted: первая 0/N старт, по единице строка, последняя N/N готово либо k/N стоп: с видом; готово exact без двоеточия. Zero-unit КОММИТ/ПУШ: одна 0/0 старт без ПРОФИЛЬ и без дополнительной готово; это не доказательство успешного действия. Общий 0/0 запуск до агента значит «неизвестно», не «единиц нет» и не заменяет старт. Подпись≤80, прежние записи append-only. Часы — внешний источник, не функция формата. Источник: task-runner.md:46,84–93,133,215,581–589 и «Протокол прогресса»; Канон process.md.

REQ-20 — Профили. profiles по таблице кодирует model tiers/effort/reasoning/budget, defaults, этапы/наследование/limits. Явные develop/develop_accept, plan/plan_accept; наследуемые spec/spec_accept/delivery/delivery_accept, alias accept только по registry; heavy/medium/light/task и границы. Profile-stage не namespace цикла проверки. КОММИТ/ПУШ получают профиль запуска, но не пишут подсказку ПРОФИЛЬ; это не отключение profiles и не ошибка отсутствия подсказки. Источник: task-runner.md «Профили запуска», :215,581; Канон process.md.

REQ-21 — Опциональные подсистемы. Корень разрешает language/usage/deadlines по точной subsystem форме enabled/inputSchema/outputSchema/storage/noData. Отсутствие выключает; enabled=false требует nullable поля null, enabled=true требует закрытые schemas/логическое storage/noData с причиной. Отсутствие данных не ноль. Файл не переводит, не измеряет/токенизирует, не получает время. Источник: task-runner.md «Языковые границы», «Учёт и сроки»; форма — С1.

REQ-22 — Представление. display объявляет данные нормы: фаза/сессия/единица k/N, j/потолок, файл, ворота, progress/диагностики. source — typedRef, формат без выражений; неизвестное не ноль/успех. Источник: task-runner.md «Что показывает интерфейс», «Протокол прогресса».

REQ-23 — Счётчики. counters по таблице описывает initial/type/domain/bounds; incrementOn/resetOn — точные обратные индексы route effects. Все используемые pass/pass_origin/clean_streak/unaccounted/feedback_round и показатели out_of_scope представлены как counts (сам список находок внешний). Route — единственный источник writes, максимум один effect на counter; preserve индекс согласован. Комбинации when/event/operation/valueBinding строго по контракту; recompute counter binding выражает pass_origin←pass без кода. Set/recompute требуют полного включения source domain в bounds, required/non-null snapshot; context integer domain задаётся minimum/maximum fieldSchema, не runtime догадкой. Источник: task-runner.md state/loop_review; конкретизация С1.

REQ-24 — Параметры. parameters — массив parameter со всеми обязательными ключами таблицы (sourceRef, не source). required=true/default=null либо false/ненулевой default; enum имеет values, другие values=null; integer имеет bounds, другие bounds=null. resetPolicy never/on_named_event/on_new_task и resetEvents согласованы. Pass numbering/потолок/чистая серия/пробы/В2/В3/режим ворот явны; возврат/restart не неявный reset. Источник: task-runner.md/task-sessions.md; task/message.md:25.

REQ-25 — Циклы. cycles по таблице; stage spec/plan/review/delivery/meeting, unique. cleanChecksParam/minimumProbesParam/ceilingParam — ссылки на integer параметры с minimum≥1/≥0/≥1, без дублей чисел. Граф/coverage описывают зачёт/незачёт, существенные/поверхностные/out-of-scope, чистую серию и потолок; repairRoute ведёт к fixer session, не checker/terminal. «Ещё заход» сохраняет текущие находки через action bindings. Источник: task-runner.md loop_review; task-sessions.md.

REQ-26 — Покрытие. coverage по таблице связывает каждый нормативный source anchor с typed targets. external_contract/not_requirement требуют reason, допускают пустой targets; represented требует targets. out_of_scope только с причиной/решением о внешней границе, не удобным пропуском. Полнота включает комментарии и документы линз. Источник: промпт С1; владелец «Только формат (Recommended)», не срез.

REQ-27 — Действия/события. actions/events по таблице имеют kind/payloadSchema/sourceRef/effectBoundary, согласованные с внешней signature. Payload/вложенные schemas используют ровно рекурсивные ветви fieldSchema выше: integer minimum/maximum, array items/maxItems, object properties/required/additionalProperties обязательны; nullability не optionality. Каждый вызов — actionUse {actionId,bindings}; каждое required payload свойство связано literal/типизированной ссылкой/context по закрытому valueBinding union. Missing/лишний binding, несовместимые рекурсивные domain/nullability/availability запрещены; никаких выражений/кода. Запуск/документы/state/progress/git/test/delivery — лишь намерения. Источник: task-runner.md run; task/message.md; binding форма — С1.

REQ-28 — Граф и payload. Edge.on/outcome разрешаются по events/predicate signature; actionUse упорядочен и привязан к этому edge, event-field может читать только его on. Boundary pure_data/external_effect/human_decision согласован с action registry, внешние effects требуют confirmation/result schema там; gateEffect также kind=effect с соответствующей signature. JSON не выполняет действие и неизвестное подтверждение не успех. Источник: бриф 031; task-runner.md.

REQ-29 — Resume. События старта/обрыва/подтверждения/resume, следующий node, idempotency key и маршруты восстановления декларируются, если предусмотрены нормой. Runtime state/атомарная запись/restart не результат формата. Источник: task/message.md:24; task-runner.md load_or_init; граница #12.

REQ-30 — Jump. Декларация события owner jump включает запись слова/даты, target node, skipped gates и ровно одну явную counter policy на каждый counter (reset/preserve/recompute по binding) с прежним/новым значением в event payload. Без полного описания jump не заявляется. Реальная авторизация/audit/переход — отдельный runtime контракт. Источник: task/message.md:25; владелец «только формат».

REQ-31 — JSON-сценарии. Предложенная оболочка содержит id/links/initialState/events/expected.steps по контракту: один индексированный step на событие до первой ошибки, непрерывные eventIndex от 0. state/actions ключи ровно по expectedKinds, error только если разрешён и завершает steps. Ожидания независимые данные, не вычисляются испытуемым кодом; JSON без комментариев/директив. Источник: 013 task/message.md:40–42 и spec REQ-24; 031 task/message.md:26; форма — предложение С1.

REQ-32 — Версия сценариев. scenarioVersion/contractRef обязательны и совпадают с закреплённым внешним scenario registry. SchemaVersion 031 не доказывает совместимость. До отдельного согласования в 013 оболочка/поля/fixtures остаются предложением, не принятым стандартом. Источник: 013 task/message.md:46–49,67 и spec REQ-24/28…30; UNKNOWN-06/08.

REQ-33 — Диагностика. Будущий reader возвращает упорядоченные diagnostic по таблице с координатами исходного JSONC; category отличает syntax/structural/semantic. sourceRef и sourceRefReason обязательны и взаимно исключают ненулевые значения: ref только при успешном mapping, иначе null с причиной/приоритетом из контракта, включая отсутствие/повреждение manifest. Источник не выдумывается, успешный mapping не обнуляется. Обязательные error codes: syntax, duplicate-key, unknown-field, missing-field, type, range, unknown-version, unsupported-catalog, unresolved-reference, duplicate-id, unreachable-node, uncovered-source, invalid-gate, invalid-reset, invalid-profile, invalid-payload, invalid-document-rule, non-json-scenario, invalid-route, invalid-scenario. diagnosticCatalog описывает условия; ошибка не default/пустой граф. Источник: task-runner.md/Канон; конкретизация С1.

REQ-34 — Отчёт. Успешный отчёт содержит manifest.id, версии/commit/hashes источников, digest нормализованного JSON, counts nodes/edges/gates/predicates/counters/documents, coverage/warnings и отдельные результаты синтаксиса, структуры, registry, полноты. Commit без сверки не доказательство; изменённый hash снимает актуальность отчёта. Источник: task/message.md:22; Канон; С1.

REQ-35 — Статические инварианты. Проверяются scopes ID/typedRef/local owner, фазы/session/gate, start/terminal, обязательная достижимость/выходы, отсутствие необъявленных безусловных циклов, исчерпывающие outcome branches. Два существующих, но разных route.targetNode/edge.to — invalid-route; отсутствующий target — unresolved-reference; обязательный недостижимый node — unreachable-node. Все отношения effects/bindings/params/route↔edge из контракта обязательны, не восполняются будущим registry. Источник: task-runner.md; конкретизация С1.

REQ-36 — Соответствие полной норме. Hash подтверждает идентичность, не полноту; независимая сверка сопоставляет каждый source fragment с coverage. Неподтверждённый fragment нельзя считать covered по одному commit. Различия с 013/Каноном — UNKNOWN/вопрос/внешний контракт, не молчаливая адаптация. Источник: task-sessions.md С1; task-runner.md; черновик 013.

## Схема корня и пример данных

Первый фрагмент намеренно неполный: синтаксический пример, не структурно валидный регламент. Второй показывает закрытые формы и локальную связность, а не доказанный validation pass. Проверка внешних signatures/покрытия без registry невозможна. Ни один пример не production-регламент; SHA/commit/test names ниже вымышлены. Комментарии после нормализации удаляются.

```jsonc
// Методика: https://github.com/unitcraft/ai-dev-methodology @ 0123456789abcdef0123456789abcdef01234567
{"schemaVersion":"1.0","compatibility":{"minReaderVersion":"1.0"}}
```

Первый пример обязан дать structural/missing-field для manifest и остальных обязательных корневых разделов, sourceRef=null/sourceRefReason=manifest-missing для каждой записи; комментарий не паспорт. Координаты отсутствующих полей — line=2,column=1, pointer=/manifest и аналогично для других ключей. Его известный комментарий можно снять только для синтаксической пробы, это не JSONC-валидатор.

### Непустой связный пример для структурной проверки

Пример connected-fragment использует фиктивные bindings; их hashes не подтверждают существующий registry. Три nodes, два edges, два routes, одни gate/session/counter/document, cycles/lenses пустые. Это заведомо неполная норма, но формы ссылок/эффектов/вызовов можно осмотреть без реализации reader. Нет обещания будущего полного semantic success только от предоставления registry.

```jsonc
// Методика: https://github.com/unitcraft/ai-dev-methodology @ 0123456789abcdef0123456789abcdef01234567
{
  "schemaVersion": "1.0",
  "compatibility": { "minReaderVersion": "1.0" },
  "manifest": {
    "id": "sample.runner", "name": "Sample runner", "regulationVersion": "1.0.0",
    "methodology": {
      "repository": "https://github.com/unitcraft/ai-dev-methodology",
      "commit": "0123456789abcdef0123456789abcdef01234567",
      "files": [{ "path": "task-runner.md", "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { "path": "task-sessions.md", "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        { "path": "task-algorithm.md", "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" }]
    }
  },
  "registryBindings": [
    { "id": "test.predicates", "kind": "predicate", "version": "1.0", "digest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    { "id": "test.units", "kind": "unit", "version": "1.0", "digest": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" },
    { "id": "test.events", "kind": "event", "version": "1.0", "digest": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" },
    { "id": "test.actions", "kind": "action", "version": "1.0", "digest": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
    { "id": "test.effects", "kind": "effect", "version": "1.0", "digest": "6666666666666666666666666666666666666666666666666666666666666666" },
    { "id": "test.routes", "kind": "route-trigger", "version": "1.0", "digest": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" },
    { "id": "test.gates", "kind": "gate", "version": "1.0", "digest": "1111111111111111111111111111111111111111111111111111111111111111" },
    { "id": "test.outcomes", "kind": "outcome", "version": "1.0", "digest": "2222222222222222222222222222222222222222222222222222222222222222" },
    { "id": "test.status", "kind": "document-status", "version": "1.0", "digest": "3333333333333333333333333333333333333333333333333333333333333333" },
    { "id": "test.grammar", "kind": "grammar", "version": "1.0", "digest": "4444444444444444444444444444444444444444444444444444444444444444" },
    { "id": "test.profiles", "kind": "profile-stage", "version": "1.0", "digest": "5555555555555555555555555555555555555555555555555555555555555555" },
    { "id": "test.profile-values", "kind": "profile-value", "version": "1.0", "digest": "7777777777777777777777777777777777777777777777777777777777777777" },
    { "id": "test.roles", "kind": "role", "version": "1.0", "digest": "8888888888888888888888888888888888888888888888888888888888888888" },
    { "id": "test.prompts", "kind": "prompt", "version": "1.0", "digest": "9999999999999999999999999999999999999999999999999999999999999999" },
    { "id": "test.scenario", "kind": "scenario", "version": "1.0", "digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  ],
  "phases": [{ "id": "analysis", "code": "РАЗБОР", "title": "Разбор", "ordinal": 0,
    "entryNode": "node.spec", "terminalNodes": ["node.done"] }],
  "sessions": [{ "id": "session.spec", "code": "С1", "kind": "agent", "phaseId": "analysis",
    "role": "worker", "promptRef": "prompt.spec", "repeatable": true }],
  "nodes": [
    // Узел node.spec: автор создаёт черновик, завершение ожидается отдельным входным событием.
    { "id": "node.spec", "code": "С1", "kind": "session", "phaseId": "analysis", "sessionId": "session.spec",
      "gateId": null, "unit": { "source": "spec", "numeratorRule": "unit.spec" }, "description": "Создать черновик" },
    // Узел node.approved: ждёт отдельного решения владельца; ожидание не завершает задачу.
    { "id": "node.approved", "code": "В5", "kind": "gate", "phaseId": "analysis", "sessionId": null,
      "gateId": "gate.spec", "unit": null, "description": "Утверждение спецификации" },
    // Узел node.done: конечный узел данного фрагмента, не полного нормативного алгоритма.
    { "id": "node.done", "code": "DONE", "kind": "terminal", "phaseId": "analysis", "sessionId": null,
      "gateId": null, "unit": null, "description": "Завершено" }
  ],
  "graph": { "startNode": "node.spec", "terminalNode": "node.done", "edges": [
    // Переход edge.spec.done: наличие spec после завершения сессии ведёт к ожиданию ворот.
    { "id": "edge.spec.done", "from": "node.spec", "to": "node.approved", "on": "event.session.completed",
      "predicate": "pred.spec.exists", "outcome": "outcome.yes", "routeId": "route.spec.done",
      "actions": [{ "actionId": "action.open-gate", "bindings": { "gateId": { "kind": "literal", "value": "gate.spec" } } }] },
    // Переход edge.gate.done: только approve от ожидаемых ворот разрешает конец фрагмента.
    { "id": "edge.gate.done", "from": "node.approved", "to": "node.done", "on": "event.owner.decision",
      "predicate": null, "outcome": "outcome.yes", "routeId": "route.approve", "actions": [] }
  ] },
  "routes": [{ "id": "route.spec.done", "edgeId": "edge.spec.done",
    "trigger": { "kind": "predicate-outcome", "ref": { "namespace": "predicate", "id": "pred.spec.exists" }, "value": "outcome.yes" },
    "targetNode": "node.approved", "invalidate": [], "enqueue": [], "preserve": [],
    "counterEffects": [{ "counterId": "counter.pass.spec", "operation": "increment", "when": "event", "valueBinding": null, "event": "event.session.completed" }] },
    { "id": "route.approve", "edgeId": "edge.gate.done",
    "trigger": { "kind": "gate-decision", "ref": { "namespace": "gate", "id": "gate.spec" }, "value": "approve" },
    "targetNode": "node.done", "invalidate": [], "enqueue": [], "preserve": ["counter.pass.spec"],
    "counterEffects": [{ "counterId": "counter.pass.spec", "operation": "preserve", "when": "route", "valueBinding": null, "event": null }] }],
  "gates": [{ "id": "gate.spec", "code": "В5", "nodeId": "node.approved", "ownerRequired": true,
    "openPredicate": "pred.spec.exists", "decisions": [{ "id": "approve", "label": "Утвердить", "routeId": "route.approve",
       "counterEffects": [] }],
    "defaultDecision": null, "effects": [{ "id": "effect.wait-owner", "kind": "human_decision",
      "payload": { "gateId": "gate.spec" }, "requiresConfirmation": true, "resultEvent": "event.owner.decision" }] }],
  "predicates": [{ "id": "pred.spec.exists", "builtin": "document_exists", "args": { "documentId": "doc.spec" },
    "resultType": "boolean", "description": "Спецификация присутствует", "sourceRef": { "file": "task-runner.md", "section": "Машинные форматы", "commit": "0123456789abcdef0123456789abcdef01234567" } }],
  "predicateCatalog": { "catalogVersion": "1.0", "catalogRef": "test.predicates", "builtins": ["document_exists"] },
  "documents": [{ "id": "doc.spec", "filename": "spec.md", "phaseId": "analysis",
    "statusRules": [{ "id": "status.draft", "firstLine": "Статус: черновик", "meaning": "draft", "allowedNext": ["status.approved"] },
      { "id": "status.approved", "firstLine": "Статус: утверждено", "meaning": "approved", "allowedNext": [] }],
    "fields": [{ "id": "field.requirements", "section": "Требования", "grammar": "section", "valueType": "string",
      "required": true, "multiplicity": "one", "normalization": "exact", "onInvalid": "error" }],
    "markers": [{ "id": "marker.status", "marker": "Статус:", "required": true, "count": "exactly_one" }],
     "requiredBy": [{ "namespace": "node", "id": "node.spec" }] }],
  "progressFormat": { "linePatterns": [{ "id": "progress.project", "grammar": "progress.project",
      "mode": "counted", "hasDate": true, "unitRule": "unit.spec" }], "launchMarkers": ["запуск"], "finishMarkers": ["готово"],
    "stopKinds": ["вопрос", "план", "ревизия", "требования", "ворота"], "nSourceRules": ["unit.spec"] },
  "profiles": { "enabled": true, "defaults": { "tier": "medium", "effort": "normal", "reasoning": "default", "budget": "default" },
    "stageRules": [{ "stage": "develop", "inheritsFrom": null,
      "profile": { "tier": "task", "effort": "normal", "reasoning": "default", "budget": "default" } }],
    "limits": { "tierMin": "light", "tierMax": "heavy" } },
   "counters": [{ "id": "counter.pass.spec", "type": "integer", "initial": 1, "incrementOn": ["route.spec.done"],
    "resetOn": [], "bounds": { "min": 1, "max": null }, "displayRef": "display.pass" }],
   "parameters": [{ "id": "parameter.clean-checks", "type": "integer", "required": false, "default": 2,
     "minimum": 1, "maximum": 10, "values": null, "resetPolicy": "never", "resetEvents": [],
    "sourceRef": { "file": "task-runner.md", "section": "Алгоритм", "commit": "0123456789abcdef0123456789abcdef01234567" } }],
   "cycles": [], "lenses": [],
   "language": { "enabled": false, "inputSchema": null, "outputSchema": null, "storage": null, "noData": null },
  "actions": [{ "id": "action.open-gate", "kind": "open_gate", "payloadSchema": { "type": "object",
    "properties": { "gateId": { "type": "string", "nullable": false } }, "required": ["gateId"], "additionalProperties": false },
    "sourceRef": { "file": "task-runner.md", "section": "Ворота", "commit": "0123456789abcdef0123456789abcdef01234567" },
    "effectBoundary": "human_decision" }],
  "events": [{ "id": "event.session.completed", "kind": "session_completed", "payloadSchema": { "type": "object",
    "properties": { "sessionId": { "type": "string", "nullable": false } }, "required": ["sessionId"], "additionalProperties": false },
    "sourceRef": { "file": "task-runner.md", "section": "Алгоритм", "commit": "0123456789abcdef0123456789abcdef01234567" },
    "effectBoundary": "external_result" },
    { "id": "event.owner.decision", "kind": "owner_decision", "payloadSchema": { "type": "object",
      "properties": { "gateId": { "type": "string", "nullable": false }, "decisionId": { "type": "string", "nullable": false } },
      "required": ["gateId", "decisionId"], "additionalProperties": false },
      "sourceRef": { "file": "task-runner.md", "section": "Ворота", "commit": "0123456789abcdef0123456789abcdef01234567" },
      "effectBoundary": "human_decision" }],
  "coverage": [{ "id": "coverage.spec-status", "sourceFile": "task-runner.md", "anchor": "Машинные форматы#Статус",
     "kind": "format", "targets": [{ "namespace": "REQ", "id": "REQ-16" }, { "namespace": "document", "id": "doc.spec" },
       { "namespace": "status", "owner": "doc.spec", "id": "status.draft" }, { "namespace": "node", "id": "node.spec" }], "disposition": "represented" }],
   "display": { "fields": [{ "id": "display.pass", "source": { "namespace": "counter", "id": "counter.pass.spec" }, "format": "{value}" }] },
  "diagnosticCatalog": { "version": "1.0", "codes": [{ "code": "invalid-reset", "severity": "error", "condition": "reset event not declared" }] },
  "scenarioContract": { "scenarioVersion": "1.0", "contractRef": "crew-harness.runner-scenario@1.0",
    "requiredLinks": ["REQ", "AC", "source"], "expectedKinds": ["state", "actions", "error"] }
}
```

Внешние обязательства примера: prompt.spec с sourceRef/hash, worker role, document_exists(args.documentId:string, boolean, outcome.yes/no), unit.spec (source=spec, пара k/N источников С1), grammar progress.project для `<code> <k>/<N> [date-time] <text>`, event/action/effect schemas и матрица gate-decision approve→outcome.yes должны существовать в matching registries. Их данных здесь нет. Локальная форма не подтверждает signatures; диагностики к тому же представлены лишь одним кодом вместо полного REQ-33. По REQ-01/25/26/33 пример не полный; полную валидацию он пройти не должен. После предоставления registry ещё требуются полнота исходов/циклов/нормы и диагностик, не автоматический success.

## Факты, выводы и неизвестное

FACT-01 — Владелец, 2026-10-13, в сообщении CrewHarness: «т.е. надо придумать спецификацию этого json под раннер». Доказательство — входное сообщение, дословная запись в log.md.

FACT-02 — Владелец выбрал «JSONC» и «Только формат (Recommended)» (2026-10-13, бриф/записи log.md). Это разрешение спецификации статического формата/проверки, не утверждение и не отказ от полноты/комментариев/сценарного контракта.

FACT-03 — Черновик 013 REQ-24 требует последовательность ожидаемых состояний/действий либо ошибку; REQ-28…30 предусматривают будущий отдельно утверждаемый контракт. Исходное task/message.md 013:40–49 отдельно подтверждает JSON-сценарии и «Контракт внутри 013». Оба файла прочитаны целиком, отдельные SHA в описи; это не утверждение/возобновление 013.

FACT-04 — Входной trace содержит раннюю оценку 44, сумма его корзин 44. Текущий счёт 36 REQ/42 AC/5 DNC, L/высокий риск; 42 не ранняя оценка REQ. Доказательство — входной SHA trace и пересчёт literal IDs текущего документа.

INFERENCE-01 — Удаление комментариев вне строк при unique ключах/без trailing comma сохраняет семантическое дерево, но не пояснения. Это обоснование диалекта/проверки комментариев до нормализации, не факт готового parser (REQ-02/03/05).

INFERENCE-02 — Общность 013/031 — strict JSON сценариев и наблюдаемых переходов, не равенство физических регламентов/версий схем. Источник вывода: 013 REQ-24, task/message.md:26; решение В-03 открыто.

UNKNOWN-01 — Существующий JSONC parser/validator плагина не исследован; код не читался. Источник: границы брифа. Реализация не заявлена.

UNKNOWN-02 — Место хранения/публикации/доставки регламента не решено. Источник: граница «только формат»; Канон местом публикации не выбран, будущая работа потребует решения владельца.

UNKNOWN-03 — Все business имена/типы/signatures будущего исполнителя ещё не согласованы. Источник: отсутствие registry во входе, task/message.md:23; В-04.

UNKNOWN-04 — Автоматическое извлечение всех source anchors не установлено. Источник: текст закреплённой методики, отсутствие extractor проверки; REQ-26 требует матрицу, не обещает извлечение; В-02.

UNKNOWN-05 — Закрыто ответом ОТВ-01: владелец принял предложенную schemaVersion 1.0, отдельную regulationVersion и закрытые формы. Сам ОТВ-01 не подменял отдельное общее утверждение, позднее записанное в разделе «Ответы», и не подтверждает реализацию reader.

UNKNOWN-06 — Общий JSON сценарный формат 013 не утверждён. Источник: полный черновик 013 REQ-24/28…30; scenarioVersion/contractRef и поля требуют согласования, без правки/возобновления 013; В-03.

UNKNOWN-07 — Не получен/не утверждён полный нормализованный registry комплект predicate/unit/route-trigger/event/action/effect/profile/gate/outcome/status/grammar/role/prompt/context/scenario и signatures: availability outputs, gate-decision outcome матрицы, hashes prompts. Источник: закреплённые task-runner.md/task-sessions.md и spec-review-1.md. Структурные enums/relations определены здесь, будущий registry не может отменить их/исправить противоречия формы. Без version/digest — unsupported-catalog, не semantic success; совпадение не доказывает полноту source coverage. Методика содержит предметные правила, полный crosswalk ещё не установлен; В-04.

UNKNOWN-08 — Авторитетный общий scenario контракт 013 не утверждён (REQ-24/28…30, SHA в описи). steps/eventIndex/expectedKinds здесь согласованное внутри 031 предложение, не принятый стандарт 013. Точные versions/refs/kinds/payload/state/actions/error schemas и совместимость требуют решения там; В-03. 013 не менять/не возобновлять.

## Сценарии и критерии приёмки

Все AC ниже — будущие тестируемые критерии, не выполненные проверки. Доказательство должно включать входной fixture, фактический результат валидатора/нормализатора и именованный ожидаемый результат. Отрицательные пары меняют только проверяемое условие.

AC-01 — Когда JSONC содержит // и /*...*/ вне строк до/между/после полей, тогда дерево совпадает с чистым JSON. Доказательство: fixtures всех допустимых мест; проверка обязательных комментариев отдельно.

AC-02 — Когда строка содержит экранированную кавычку, // или /*, тогда нормализация сохраняет её значение. Доказательство: escape fixture и сравнение деревьев.

AC-03 — Когда поданы незакрытая строка/комментарий, одинарные кавычки, trailing comma, duplicate key, BOM или недопустимый UTF-8, тогда syntax/duplicate-key с координатами, без успешного дерева. Доказательство: по fixture на каждый дефект.

AC-04 — Когда валидный JSONC нормализован, тогда строгий JSON разбирает эквивалентное дерево, комментариев нет, нормализация идемпотентна. Доказательство: golden input/output; это не проверка полноты нормы.

AC-05 — Когда schemaVersion отсутствует/неизвестен/несовместим или ключ неизвестен, тогда точная диагностика без default. Доказательство: version/key matrix.

AC-06 — Когда паспорт неверен по repo/commit/files/hash, тогда ошибка с pointer; изменённый hash снимает актуальность отчёта. Когда шапка или node/edge комментарий отсутствует/ID либо repo/commit не совпадает, тогда invalid-document-rule. Доказательство: парные passport/comment fixtures и независимая проверка подробности описаний.

AC-07 — Когда каталог имеет duplicate ID/неверный kind/неизвестную ссылку, тогда duplicate-id/type/unresolved-reference. Human role=owner,promptRef=null и system оба null законны при role registry; human role=null и system role=owner незаконны. Agent/meeting promptRef=null незаконен, известный prompt законен. Доказательство: graph/session fixtures, по одной мутации каждого kind и отсутствующий prompt registry.

AC-08 — Когда start/terminal неизвестен, обязательный node/terminal недостижим, outcome отсутствует/дублирован либо цикл не объявлен, тогда графовый отказ. Доказательство: review-cycle и отдельная негативная мутация каждого инварианта.

AC-09 — Когда gate node не связан, обязательный owner отключён или owner-gate имеет defaultDecision, тогда invalid-gate; null default законен. Доказательство: В1/В5 fixtures.

AC-10 — Когда decision.routeId неизвестен либо сдача слита в push без отдельных узлов, тогда unresolved-reference/uncovered-source. Доказательство: отдельные delivery gate fixtures и их слияние/удаление.

AC-11 — Когда builtin/registry неизвестен либо имя содержит код, тогда unsupported-catalog без исполнения; неверные args — invalid-payload. Когда catalogRef/version/digest совпадают, builtins ровно используемые имена, signatures внешние, тогда контракт предиката разрешим. Доказательство: whitelist fixtures, лишний builtin, args mutation и попытка добавить signatures в predicateCatalog (unknown-field).

AC-12 — Когда статус неизвестен, grammar конфликтует либо обязательный document отсутствует, тогда форматный отказ, не успех. Доказательство: spec/result status fixtures и неизвестный/пустой вариант.

AC-13 — Когда summary N=0, K/M/P отрицательные/нечисловые, N≠имени, summary дублирован/отсутствует, тогда чистый результат невозможен. Доказательство: корректная summary и парные мутации.

AC-14 — Когда обязательный marker/field только в прозе или отсутствует, тогда invalid-document-rule/uncovered-source. Proposal-review-{N}-{lens}.md с известной lens и summary binding разрешимо; facts-2.md без summary, с context current meeting n=2 и фактовой grammar законен. Review summary.N≠имени, facts с summary binding/строкой Заход 2:, context n=3 для facts-2, missing/null numberBinding, неизвестная lens, glob/повтор/неизвестный токен/N=0/коллизия незаконны. Доказательство: inventory-to-field matrix и пары всех семейств, без подмены facts новым review.

AC-15 — Когда progress содержит counted/zero-unit форму по mode, тогда ветви применимы только к соответствующим session nodes и matching grammar. Counted с unitRule=unit.spec/node.unit.numeratorRule=unit.spec, 0/N старт и финальной N/N готово либо k/N стоп: законен; при неизменном N=2 успешных строк агента три. Множество progressFormat.stopKinds ровно ["вопрос","план","ревизия","требования","ворота"] без дублей; каждая counted остановка содержит ровно один такой вид и причину. Полный набор законен; чужое значение, пропущенный нормативный вид или дубль незаконны; пустой/отсутствующий вид в stop-строке незаконен. Успешная готово и zero-unit старт не требуют stop-вида. Zero-unit КОММИТ/ПУШ с обоими unit/unitRule=null, одной агентской 0/0 старт и без ПРОФИЛЬ законен; второй готово, профильная подсказка, фиктивный unit.none, counted/null либо zero-unit/string/С1/gate незаконны. 0/0 запуск означает неизвестно до агента, не zero-unit старт/завершение. nSourceRules=[unit.spec] законен для connected-fragment; [1]/[{}], дубль, local counter ID, пропуск/лишнее правило — отказ; null zero-unit не входит в множество. Для С2 N берётся из `итого:` текущей описи, равен её числу пунктов и не подменяется summary.N. Нет данных→?/?, N агента приоритетен с диагностикой. Подпись≤80/append-only/exact готово для counted; готово:/нет старта/81 символ незаконны. Доказательство: LF/CRLF и пары 14/17/18, marker/branch/stop-kind mutations; исключение В-06 норму не меняет, outcome git не проверяется прогрессом.

AC-16 — Когда profile stage/default/limits/alias согласованы с registry, тогда однозначны; неизвестный этап/класс не default. Доказательство: profile matrix; stage=develop допустим в profiles, недопустим в cycles.

AC-17 — Когда language/usage/deadlines отсутствуют или выключены с null schemas/storage/noData, тогда не включаются. При enabled=true нужны ненулевые закрытые schemas, storage и noData; null либо unknown-field незаконны. Доказательство: absence/disabled/enabled pairs всех трёх подсистем; отсутствие output не ноль.

AC-18 — Когда counter не имеет обязательных incrementOn/resetOn, initial неверен, bounds нарушены, индекс route effects расходится либо counter применяется в expression, тогда отказ. Пустой индекс законен только при отсутствии соответствующих effects. Доказательство: counter/index fixtures.

AC-19 — Когда цикл ссылается на неверный параметр/домен, дублирует числа или repairRoute ведёт к checker/terminal, тогда type/range/unknown-field/invalid-route; недостающие правила зачёта/origin — uncovered-source. Доказательство: clean/finding/unaccounted/ceiling fixtures с 2/3/4 только в parameter defaults и repair route к fixer.

AC-20 — Когда coverage опускает source, скрывает нормальный путь out_of_scope либо target неизвестен, тогда uncovered-source/unresolved-reference. Доказательство: полная matrix и удаление одной строки/target.

AC-21 — Когда action/event kind неизвестен/payload не по signature, тогда отказ; external_effect требует registry confirmation/result schema, не выполненный effect. Доказательство: action/event fixtures и несовпадающая signature.

AC-22 — Когда resume только комментарий либо jump лишён owner/audit/target/skipped gates/counter policy, тогда uncovered-source/invalid-payload. Доказательство: полная декларация и удаление каждого поля; никакой реальный jump форматом не выполняется.

AC-23 — Когда proposed scenario содержит все ключи оболочки, links и явные expected.steps с eventIndex, тогда его оболочка структурно разрешима; JSONC/trailing comma — отказ. Доказательство: strict JSON scenario и negative JSONC; совместимость 013 отдельно UNKNOWN-08.

AC-24 — Когда expected.steps[1].actions содержит неверное действие, тогда будущий adapter даёт FAIL на событии 1, а не пересчитывает expected. Доказательство: подмена второго ожидаемого действия в двухшаговом scenario.

AC-25 — Когда contractRef/scenarioVersion несовместимы, тогда unsupported-catalog/unknown-version; равенство schemaVersion не совместимость. Доказательство: supported/unsupported contract pairs.

AC-26 — Когда ошибка после многострочных комментариев/строки с escape \n, тогда pointer/line/column исходного файла точны и code опубликован. Доказательство: coordinate fixtures; буквальный newline внутри JSON string незаконен.

AC-27 — Когда отчёт сформирован, тогда содержит версии/commit/hashes/digest/counts/coverage и отдельные этапы; правка входа снимает актуальность. Доказательство: golden report и байтовая мутация.

AC-28 — Когда полный граф покрывает все применимые фазы/циклы/сессии/ворота/documents/predicates/outcomes/комментарии, тогда независимая source сверка подтверждается. Урезанный каталог отклонён при правильном синтаксисе. Доказательство: полный fixture и удалённый обязательный node/семейство линз; отдельные facts/summary review/feedback/customer/void формы и источники номеров сверены с методикой.

AC-29 — Когда schemaVersion/catalog version совместимы, тогда соответствующий этап может пройти; major/signature mismatch — устойчивый отказ без подмены версии. Доказательство: version/signature matrix.

AC-30 — Когда читается первый пример «Схема корня», тогда синтаксическое дерево возможно, но structural/missing-field для manifest и прочих обязательных разделов неизбежен; все имеют sourceRef=null, reason=manifest-missing по ключу sourceRefReason, pointer отсутствующего поля и 2:1 содержащего объекта. Шапка не источник паспорта. Доказательство: parse-success/structural-failure и пара 16; это не semantic validation.

AC-31 — Когда target/counter неизвестны либо typedRef namespace неподходящ/owner отсутствует, тогда unresolved-reference/type. Совпадающие ID в document/gate законны при явном namespace; status.draft у doc.spec/doc.plan требует owner. Доказательство: collision pairs, четыре мутации route ссылок и prompt binding.

AC-32 — Когда owner gate получает default/пустой decisions, route неизвестен или effect без confirmation/resultEvent, тогда invalid-gate/unresolved-reference. kind=effect binding законен, effect-kind незаконен; decision.counterEffects непустой — invalid-reset. Доказательство: connected-fragment mutations и соответствующая effect signature.

AC-33 — Когда initial/type/bounds неверны, enum bounds дублируются, resetOn не равен индексу reset routes, when/event не согласован, recompute literal либо valueBinding несовместим, тогда invalid-reset/range/type. recompute(counter.pass) для origin законен при включении доменов; context integer minimum=1,maximum=null,required/non-null подходит bounds 1..safe-max; minimum=null/0, nullable=true или availability=optional не подходит. Duplicate counter writes и preserve/index mismatch незаконны. Доказательство: по одной мутации каждой комбинации и legal/illegal пары.

AC-34 — Когда required=true имеет ненулевой default, default ключ пропущен, enum default вне values/values отсутствует, integer bounds/default неверны, on_named_event без resetEvents или never с событиями, тогда range/type/missing-field/invalid-reset. True с явным default=null законен. Доказательство: parameter pairs, проверка контейнера-массива и домена cycle параметров.

AC-35 — Когда field missing/duplicate, allowedNext вне своего document или marker count неизвестен, тогда missing-field/duplicate-id/invalid-document-rule. Доказательство: document field/status mutations и законная локальная status transition.

AC-36 — Когда disabled profiles имеет непустые defaults/stageRules, stage duplicate, inheritsFrom cycle либо tierMin>tierMax, тогда invalid-profile/unresolved-reference. Доказательство: disabled/enabled pairs и четыре мутации с matching registry.

AC-37 — Когда required вне properties/с дублем/не array<string>, nullable не boolean, additionalProperties=true/пропущен, integer minimum/maximum пропущен/дробный/перевёрнут, array maxItems пропущен/null/дробный/вне 1..10000, items не fieldSchema либо ключ от чужой ветви, тогда schema отказ. Норма рекурсивна: проверить вложенные object/array и required optional/null пары; [] required/пустой object/пустое array-value законны. Schema mismatch, binding missing/extra/wrong domain/nullability/availability, чужой edge.on или expression — invalid-payload. Доказательство: fixtures всех шести ветвей и парные глубокие мутации, domain inclusion отдельно от strict JSON parse.

AC-38 — Когда coverage typed target не разрешён/local owner пропущен, reason отсутствует для external/not_requirement, sourceFile неизвестен или anchor пуст, тогда uncovered-source/unresolved-reference. Доказательство: typed target collision pairs и четыре мутации; schema не доказывает полноту.

AC-39 — Когда diagnostic code duplicate/severity/category/reason неизвестен/координаты<1/pointer неверен, тогда type/range. sourceRef=null требует точный sourceRefReason: syntax-unavailable прежде manifest-missing прежде manifest-invalid прежде mapping-unavailable; category по нарушенному правилу, не по причине отсутствия ref. Успешный mapping требует ненулевой ref и reason=null; оба null/оба non-null/пропущенный ключ, неверные file/commit/section незаконны. Доказательство: пары syntax, missing/null/повреждённого manifest, valid manifest с недоступным source/hash/якорем, успешного mapping и single mutations пары 16; не смешивать structural missing-field с syntax.

AC-40 — Когда expected.steps теряет/дублирует/переставляет индекс, count не равен events без ошибки, error не последний либо expectedKinds error-only, тогда invalid-scenario. State-only требует только state, actions-only только actions; лишний ключ незаконен. Missing version/ref/requiredLinks — schema отказ; unknown scenario registry — unsupported-catalog. Доказательство: двухсобытийные пары и первые/средние errors.

AC-41 — Когда осмотрен connected-fragment, тогда node.done равен terminal и phase terminal, node.approved имеет исходящее edge, node.done не имеет. Мутация route.approve.targetNode=node.spec (существующий) при edge.to=node.done даёт invalid-route; missing node — unresolved-reference. Orphan/mismatched edgeId/routeId, gate decision→другой route, sourceRef другого commit незаконны. Доказательство: отдельные fixtures; пример всё равно неполон по норме/diagnosticCatalog/outcomes, никакого обещанного full pass.

AC-42 — Когда matching registries отсутствуют/version/digest расходятся, тогда unsupported-catalog, не semantic success (UNKNOWN-07); без согласованного 013 reference не объявлять совместимость (UNKNOWN-08). Доказательство: absence/digest mismatch и unknown scenario ref; синтаксис/структура/registry/полнота — отдельные этапы.

## Что не делаем и не обещаем

DNC-01 — Не реализуем валидатор, parser, раннер, плагин, алгоритм исполнителя, сценарии 013 или production-файл регламента в этой С1. Источник: бриф #12 и методика; проверка — перечень изменённых путей.

DNC-02 — Не проектируем и не реализуем runtime state, файловую структуру хранения, атомарную запись, восстановление сессии и фактическое выполнение jump. Они лишь внешние контракты, описанные REQ-27…30. Источник: границы брифа; проверка — отсутствие таких артефактов/кода.

DNC-03 — Не меняем Канон, task/message.md, методику, 013, spec-review-1.md/spec-review-2.md/spec-review-3.md, служебную metadata или индекс; не пишем plan.md, не коммитим/пушим/сливаем, не запускаем/перезапускаем сервис. Проверка — diff/status, отпечатки и перечень команд.

DNC-04 — Не объявляем совместимость с существующим исполнителем/схемой/кодом плагина без независимой проверки и решения владельца; контракт 013 ещё не утверждён. Источник: неизвестное о коде и контракте 013.

DNC-05 — Не включаем в публичные документы локальные пути машины, секреты или частные имена; методический репозиторий только читается, копия методики не создаётся. Проверка — guards privacy и текстовый diff; отсутствие прогона стражей не выдаётся за PASS.

## Тип, слои, уровни проверок

Тип полной задачи по шагу 5 методики — новая разработка (декларативный регламент и читатель/валидатор в плагине); слои будущей реализации: backend/plugin, форматы данных, тесты и при необходимости CI. Текущая С1 — документальная спецификация, без исполняемого изменения. Слои этой работы: JSONC/JSON, schema и graph, трассировка нормы и сценарный межконтрактный формат. Для будущего кода обязательны A, B, E, G; для backend/parser — также C (проверка в целевой среде) и F (ошибочные входы). D не требуется: UI в спецификации не меняется. Для настоящей С1 кодовые проверки неприменимы; валидатора сейчас не создаём. Команд сборки/тестов/запуска новой части нет и не проверяли; `npm test` из `opencode-plugin/` относится к существующей части, не нужен этой документальной С1 и не запускался. Тяжёлые команды не запускались.

Будущие обязательные уровни при реализации — A (статические проверки/схемы), B (unit/JSON fixtures), C (реальное чтение JSONC и сценарии в среде проекта), E (трассировка каждого REQ/AC/DNC), F (негативные поля, версии, ссылки, графы, ворота, сбросы), G (эквивалентность JSONC→JSON и совместимость сценариев). D — N/A для формата без UI. Приёмка текущего текста требует отдельной С2; собственная самопроверка ниже её не заменяет.

## Вопросы владельцу

Ответы записываются дословно с датой и источником. Владелец ответил на В-01…05 в вопроснике интегратора 2026-10-14; ОТВ-01…05 ниже подтверждают предложенные формы без изменения REQ/AC. Defaults в исходных вопросах — прежние предложения, не автоответы и не отмена данных решений. Эти частные ответы получены до общего утверждения: их фразы о неутверждённом spec относятся к соответствующим этапам, не к нынешнему статусу. ОТВ-06 относится только к своему историческому процессному исключению; более поздние процессные оговорки записаны отдельно в log.md. Общее утверждение получено отдельным вопросником и записано ниже. UNKNOWN-01/02/04 — внешние сведения, не основания выполнять код, выбрать место публикации либо обещать extractor.

В-01 — Принимать ли schemaVersion 1.0 отдельно от regulationVersion и конкретные закрытые формы этого черновика?
Тип: gate
Адресат: владелец CrewHarness.
Срок: до утверждения spec.md, после независимой С2.
Влияние: версия, nullability, namespaces/bindings и инварианты определяют допустимые документы (UNKNOWN-05).
Варианты: принять после С2; изменить формы; отложить согласование с будущим исполнителем.
Default: сохранить предложение черновым; утверждение/реализация ждут ответа, срок не закрывает ворота.
Автоответ: запрещён
Рекомендация: принять только после независимой С2 — отдельно версионируются синтаксис и редакция регламента, а статические контракты теперь явны.

В-02 — Требовать ли coverage каждого нормативного anchor и независимую ручную семантическую сверку без готового extractor?
Тип: gate
Адресат: владелец CrewHarness.
Срок: до утверждения spec.md, после независимой С2.
Влияние: доказательство полноты не сводится к hash; возможность автоматического извлечения UNKNOWN-04.
Варианты: coverage и независимая сверка; только машинное извлечение; отдельное решение о срезе (не разрешён текущей границей).
Default: полный coverage остаётся требованием черновика, не утверждённым доказательством.
Автоответ: запрещён
Рекомендация: coverage и независимая сверка — это не позволяет опускать неудобные ветви при правильном JSON.

В-03 — Согласовать ли общий strict JSON-сценарный контракт отдельно от физического JSONC регламента, оставив предложенную steps-оболочку на сверку с 013?
Тип: gate
Адресат: владелец CrewHarness; сведения о будущем контракте передаёт интегратор 013 через интегратора CrewHarness.
Срок: до утверждения spec.md, после независимой С2; точные signatures — до зависимой реализации.
Влияние: UNKNOWN-06/08, последовательность state/actions/error и названия полей нельзя объявить существующим стандартом.
Варианты: отдельная совместимость сценариев; единый физический формат (изменение решения JSONC); отложить зависимую часть.
Default: оставить связь внешним контрактом и steps предложением; 013 не менять/не возобновлять, совместимость не заявлять.
Автоответ: запрещён
Рекомендация: отдельная совместимость сценариев — сохраняет исходный strict JSON и последовательности ожиданий без подмены неутверждённого контракта 013.

В-04 — Закрепить ли полный внешний registry комплект с signatures, prompt/context именами и gate-decision→outcome матрицей до зависимой реализации?
Тип: requirements
Адресат: владелец CrewHarness; комплект готовит интегратор будущего исполнителя по отдельному разрешению.
Срок: до утверждения зависимого контракта и начала реализации.
Влияние: UNKNOWN-03/07; имена в bindings не доказывают наличие signatures или semantic success.
Варианты: отдельный version/digest whitelist; имена только в коде без отдельной версии; расширения регламента (противоречат закрытому формату).
Default: сохранить внешнюю модель signatures и запрет semantic success; комплект неизвестен, новая работа не запускается.
Автоответ: запрещён
Рекомендация: отдельный закреплённый комплект — несовместимость обнаруживается до исполнения, а формат не становится языком пользовательского кода.

В-05 — Принимать ли запрет trailing comma и duplicate key при разрешении двух видов комментариев и обязательных описаний шапки/узлов/переходов?
Тип: gate
Адресат: владелец CrewHarness.
Срок: до утверждения spec.md, после независимой С2.
Влияние: диалект определяет нормализацию, комментарии сохраняют исходное требование task/message.md:22, отказа от него не было.
Варианты: принять ограничения; отдельным решением изменить диалект; использовать сторонний JSONC-диалект с явной нормой совместимости.
Default: строгое подмножество и обязательные комментарии остаются черновой нормой, никакого молчаливого отказа от требования.
Автоответ: запрещён
Рекомендация: принять ограничения — дерево однозначно нормализуется в JSON, а исходные пояснения не теряются до проверки.

## Ответы

ОТВ-01 — Владелец, 2026-10-14, вопросник интегратора «JSONC: решение 1 из 5»: «Раздельные версии (Recommended)». Приняты schemaVersion 1.0, отдельная regulationVersion и закрытые формы текущего черновика; структура данных и содержание регламента версионируются раздельно. В-01 отвечен, UNKNOWN-05 закрыт; spec/plan в целом не утверждены, реализация и публикация не разрешены.

ОТВ-02 — Владелец, 2026-10-14, вопросник интегратора «JSONC: решение 2 из 5»: «Покрытие и сверка (Recommended)». Для каждой нормативной ссылки требуются покрытие данными регламента и отдельная независимая ручная семантическая сверка полноты, без зависимости от готовности автоматического extractor. Это требования будущего полного регламента, не утверждение, что production-crosswalk или extractor уже готовы; UNKNOWN-04 остаётся неизвестным. В-02 отвечен, spec/plan в целом не утверждены.

ОТВ-03 — Владелец, 2026-10-14, вопросник интегратора «JSONC: решение 3 из 5»: «Раздельные форматы (Recommended)». Регламент остаётся JSONC, тестовые сценарии — strict JSON; общий сценарный контракт и совместимость с 013 согласуются отдельно. Предложенная expected.steps-оболочка не объявляется существующим принятым стандартом; UNKNOWN-06/08 остаются неизвестными. В-03 отвечен, реализация 013 не возобновляется, новый контракт/задача автоматически не запускаются; spec/plan в целом не утверждены.

ОТВ-04 — Владелец, 2026-10-14, вопросник интегратора «JSONC: решение 4 из 5»: «Закреплённый реестр (Recommended)». До зависимой реализации обязателен отдельный version/digest whitelist-комплект с полными signatures, prompt/context именами и gate-decision→outcome матрицей. Подтверждена внешняя закрытая модель контрактов, не произвольные расширения регламента. В-04 отвечен; комплект не подготовлен, UNKNOWN-03/07 остаются неизвестными, semantic success не заявлен. Новая задача/реализация этим ответом не запускается, spec/plan в целом не утверждены.

ОТВ-05 — Владелец, 2026-10-14, вопросник интегратора «JSONC: решение 5 из 5»: «Строгий диалект (Recommended)». Подтверждены два вида комментариев // и /* */, запрет trailing comma и duplicate key, обязательные описания шапки/узлов/переходов до удаления комментариев. Это принятые требования будущего читателя, не утверждение, что JSONC parser/нормализатор уже реализован. В-05 отвечен; формы/REQ/AC остаются прежними, spec/plan в целом не утверждены.

ОТВ-06 — Владелец, 2026-10-13, вопросник интегратора: «Сохранить след (Recommended)» (log.md, запись 11:53). Разово принят след прошлой С1п: подписи 92/83, нет exact старта/завершения, готово: вместо готово. История/время сохранены, не признаны корректными; причина — не выдумывать прошлые метки. В-06 отвечен только в этой границе; будущая норма/потолок прежние, spec/plan не утверждены.

В-01…В-05 отвечены владельцем. UNKNOWN-05 закрыт ОТВ-01, остальные UNKNOWN остаются неизвестными; registry и совместимость 013 не доказаны.

Общее утверждение — владелец, 2026-10-14, вопросник интегратора «Утверждение спецификации»: «Утвердить (Recommended)». Принята спецификация формата JSONC 1.0 с пятью записанными решениями, раскрытыми зависимостями и предупреждением размера; предметная серия завершена с явными процессными оговорками 8/9, не двумя безусловно чистыми историческими отчётами. Реализация, слияние и публикация этим не разрешены. Полный исполняемый регламент, authoritative registry, parser и совместимость с 013 ещё не готовы; её реализация остаётся на паузе.

## Границы доказательств и собственный контроль качества

Собственные лёгкие пробы записаны в spec-trace.md, отдельно от будущих AC: literal IDs/вопросы/опись, strict JSON parse 14 блоков после точного снятия семи известных comment lines, осмотр локальных refs/effect indices/bindings, двухшаговой оболочки, diagnostic mapping и counted/zero-unit пар. Это НЕ полный JSONC parse/структурный валидатор/семантический успех и НЕ независимая С2. UTF-8/BOM/duplicate-key/диалект/координаты/registry/полнота будущего reader не проверялись; runnable parser/validator/runner не создавался. Критерии AC остаются будущими, не PASS текущей С1.

Страж приватности попытались поставить через crew_watch(machine=true), инструмент отказал: «Наблюдение ставит только вкладка, не субагент.» Прямой запуск/обход очереди не выполнялся, guards NOT VERIFIED; их может поставить интегратор в разрешённой очереди. Git diff --check и сохранность входа/индекса проверяются лёгкими read-only командами, их вывод отдельно в trace. npm test/сборки/полные прогоны не запускались.

## Изменения захода 1

Источник — полный spec-review-1.md (14 существенных, 0 поверхностных, 5 проб; SHA исходной spec в описи). Все 14 приняты к правке, отклонённых нет. Ни одна не считается закрытой самой С1: проверяет следующая свежая независимая С2. Статус — черновик, ворот/метаприёмки/новых разрешений нет.

1. **Исправлено — optional subsystems.** Корень разрешает language/usage/deadlines, добавлена закрытая subsystem форма enabled/inputSchema/outputSchema/storage/noData, nullable правила. REQ-21/AC-17 и absence/disabled/enabled пары согласованы; storage только логический адрес, не runtime layout.
2. **Исправлено — session nullability.** Agent/meeting требуют role/prompt; human требует role, prompt=null; system оба null. Таблица/REQ-07/AC-07 и legal/illegal human/system пары едины, не перекладывают nullability на role registry.
3. **Исправлено — parameters.** Единственный контейнер массив, все поля required, sourceRef/values добавлены в норму; default ключ отличён от ненулевого значения, enum domain/границы/resetEvents заданы. REQ-24/AC-34, пример и pairs обновлены; пример ID исправлен по ASCII regex.
4. **Исправлено — predicateCatalog.** Выбраны внешние закреплённые signatures; в файле ровно used builtin names/catalogRef/version, не пользовательские определения. Таблица/REQ-14/AC-11/42 и пример согласованы; unknown registry не устранён вымышленным будущим предоставлением.
5. **Исправлено — namespaces/local IDs/prompts.** Полиморфные typedRef, owner для status/field/marker/decision/gate-effect, точные namespace простых refs/requiredBy/display/coverage. Binding kind=prompt с sourceRef/hash/substitution schema; cycle.stage отдельно от profile-stage. REQ-07/10/16/20/26/35, AC-07/16/31/38; коллизии данных квалифицированы.
6. **Исправлено — gateEffect binding.** Единственный kind каталога effect, никакого effect-kind. Boundary/signature/confirmation/resultEvent едины в таблице/REQ-11/28/AC-32/42 и примере.
7. **Исправлено — counterEffect/конфликты/cycles.** Когда route/event задаётся when; event согласован с edge.on. valueBinding и комбинации операций определены, recompute — явный ссылочный snapshot; route единственный источник writes, decision effects пусты, индексы counter/route.preserve точны, дубль запрещён. Cycle только *Param refs с гарантированными domains; REQ-23…25/30, AC-18/19/33/34; пары origin/pass, duplicate writes, param relations.
8. **Исправлено — action payload uses.** actions у edge теперь actionUse с closed bindings для required payload. literal/counter/parameter/event-field/document-field/context, type/domain/nullability/availability, никаких expressions. REQ-27/28/AC-21/37 и пример open-gate с actual gateId согласованы; review+extra — только фиксированный typed context output, его signature пока UNKNOWN.
9. **Исправлено — graph/routes.** Graph авторитетен; route аннотирует одно edge с взаимными IDs/target equality и точным trigger relationship. Decision не второй transition/effect; REQ-09/10/35, AC-41; existing node.spec vs node.done negative pair не masquerades unresolved-ref.
10. **Исправлено — scenario expectations.** expected.steps с непрерывными eventIndex, success cardinality и terminal error; expectedKinds требует state/actions, state-only/actions-only формы согласованы. REQ-31/32/AC-23/24/40, strict JSON двух событий и mutations; UNKNOWN-08 сохранён, 013 не возобновляется.
11. **Исправлено — filename lenses.** Closed tokens N/round/lens/void и каталог lenses/session refs, expansion/collision/summary invariants. REQ-15/26, AC-14/28 и filename pairs представляют proposal-review линзы без glob/path/подмены номера линзой.
12. **Исправлено — обязательные комментарии.** REQ-05 и контракт требуют шапку repo/commit и подробные node/edge comments до нормализации; AC-06/28/trace C04 и оба JSONC examples обновлены. Исходное требование не отменено выбором «только формат».
13. **Исправлено — маркеры и версии источников.** REQ/AC/DNC и FACT/INFERENCE/UNKNOWN literal в начале абзаца; точное «Опись источников»/последнее «итого: 18»; marker Методика: дописан с датой/видом без переписывания истории. Изменяемые входы SHA/blob, неправдоподобные counts не доказательство чтения; journal time из progress_line, не часов/памяти.
14. **Исправлено — вопросы.** В-01…В-05 заканчиваются ?, отдельные Тип:/Рекомендация:/адресат/срок/варианты/default/влияние. Автоответ запрещён, тип gate у решений формата/границ, requirements у получения registry; defaults не утверждают/не закрывают ворота.

Нормативный счёт: 36 REQ, 42 AC, 5 DNC; L, риск высокий. >50 не достигнуто; новые исходы/структуры конкретизируют существующие требования, scope остаётся статическим форматом и его проверкой. Раннер/план/production-регламент не написаны, утверждения/коммитов/пуша нет. Следующий шаг — новая независимая С2, после передачи эта С1 останавливается.

## Изменения захода 2

Источник — spec-review-2.md: 5 существенных/0 поверхностных/4 пробы. Все приняты, отклонений 0; проверяет новая С2, не автор. Счёт 2/4, чистая серия 0, потолок не сброшен. Статус черновик.

1. **Исправлено — fieldSchema.** Полные шесть рекурсивных ветвей, required/optional/nullability, integer domain, array maxItems, object required subset/unique/additionalProperties; bindings/context→counter bounds. Таблицы, REQ-23/27, AC-33/37, usage и пара 13 согласованы; пробы в trace не validator.
2. **Исправлено — nSourceRules.** Array<string>, namespace unitRules kind=unit/version/digest; точное множество node/linePattern refs и связанная пара k/N. REQ-08/19, AC-15, connected grammar ref/внешние обязательства и пара 14; registry остаётся UNKNOWN.
3. **Исправлено — номер facts.** numberBinding summary только review, context n текущего meeting для facts без summary. Таблица семейств/источников/grammar, REQ-15/17, AC-14/28 и пара 15; void/round/номер линзы не подменяют N.
4. **Исправлено — источник 013.** Отдельно прочитан полный исходный message (74 строки, SHA 88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9), учтён один раз с покрытием в trace; spec 013 — другой вход. FACT-03 уточнён; 013 на паузе.
5. **Исправлено раскрытие, след сохранён — progress.** В-06 отвечен ОТВ-06 по слову владельца, не отмена нормы. Полный состав старых отклонений дописан в trace, строки/время не переписаны. С1п2 использует 0/4 старт, подписи≤80 и последний exact готово. REQ-19/AC-15 не ослаблены.

Собственный проход всех таблиц, соседних ветвей и примеров — в trace. 36 REQ/42 AC/5 DNC; L/высокий риск. Реализации/semantic pass/утверждения нет; остановка для свежей С2 захода 3, без метаприёмки.

## Изменения захода 3

Источник — spec-review-3.md: 2 существенных/0 поверхностных/4 пробы. Обе приняты к исправлению, отклонений 0. По слову владельца, 2026-10-13, «До 5 заходов (Recommended)» (log 13:45) счёт 3/5, чистая серия 0, потолок увеличен без сброса. Исторические исходы заходов 1/2 сохранены, их 14+5 находок закрыты независимой С2; новая правка не объявляет свою приёмку.

1. **Исправлено — diagnostic source mapping.** Обязательны category и sourceRefReason; null ref только с установленной причиной/приоритетом syntax-unavailable/manifest-missing/manifest-invalid/mapping-unavailable, после успешного mapping ref обязателен/non-null. Таблица, правила sourceRef, REQ-33, AC-30/39, первый корень и пара 16 согласованы. Обоснование: корректное JSON-дерево без manifest требует structural missing-field, но не даёт подтверждённого источника; шапка не заменяет паспорт. Nullable расширена только у результата diagnostic, не у исходных деклараций.
2. **Исправлено — zero-unit progress.** Закрытый mode=counted/zero-unit, string/null unitRule и применимость по node.unit; nSourceRules содержит только ненулевые counted refs. Таблица/инварианты, REQ-07/08/19/20, AC-15, connected counted пример и пары 14/17 едины. Обоснование: task-runner:46/93/133 требует одну 0/0 старт без ПРОФИЛЬ для КОММИТ/ПУШ, а 0/0 запуск обозначает неизвестное. Никакого unit.none/нового процессного исключения; запрос/артефакт/outcome остаются вне progress и не runtime-результат этой С1.

Собственные пробы/мутации и размер/SHA — в trace. Требования ради предела L не сокращены; возможное превышение — предупреждение, не разрешение делить/утверждать. 36 REQ/42 AC/5 DNC, статус черновик; В-01…05/UNKNOWN открыты, В-06 только сохранённый след ошибки. План/код/013 не менялись. Остановка для свежей независимой С2 захода 4, которую запускает родитель.
