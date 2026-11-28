# 269. F-07: metadata-only native catalog hook

Основание: интегратор, 2026-11-01, письма 18:45 и 19:10. Это отдельная узкая дельта после signed F-02 `257a9836dde112a7cf3eb1dda9ba4d0374e3df0f`, уже перенесённого 277 в `49cf058ba854b1b414bce953797373eb17b6dec1`. Общий кандидат сюда не вливается, ACL не меняется, платные/provider/native program/session starts не выполняются.

## Точный источник и недостающий факт

Проверены официальные [V2 API docs](https://opencode.ai/v2/docs/api) и публичный tag **v2.2.5**:

- [ACP catalog](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/cli/src/acp/catalog.ts) читает native model list для `location.directory=cwd`, фильтрует `enabled`. Snapshot GET `/api/model` может предшествовать plugin settlement; список не считается доказанно полным.
- [ACP config-option](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/cli/src/acp/config-option.ts): advertised model — **providerID + "/" + id**, не `modelID`; native effort — `variants[].id`. Когда variants непусты, ACP действительно добавляет native sentinel `default`; при пустых variants effort selector отсутствует. Это точное существующее преобразование, не family/weight/effort угадывание.
- [ACP handler](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/cli/src/commands/handlers/acp.ts) вызывает [Standalone.start](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/cli/src/services/standalone.ts): отдельный native server с собственными lease/auth, cwd/env/config. Дополнительно продукт меняет XDG через `agent_config.nv`. Поэтому personal existing `/api/model` не доказан источником того же configured ACP-контекста.
- `Model.Info.family` — не configured family продукта. Его перенос как product family запрещён. Одного совпадения provider/model имени или timestamp недостаточно для контекстной эквивалентности.

Интегратор 19:10 прямо подтвердил: известного same-context endpoint/cache сейчас нет. Этот отсутствующий **факт эквивалентного native launch/config/location контекста** сохраняется открытым; не назван общим «provider не approved». Реальное cold-ready **NOT VERIFIED**, REQ-05 целиком **не закрыт**. F-02 и прочие независимые части не блокируются.

## Hook и wire

- HTTP **GET `/api/model-metadata`**, тот же origin guard, что у existing catalog. `/api/agent-catalog` не меняется, legacy cache не превращается в source proof.
- Stock `run_front`/`run_front_with` передают **None**: ответ `status=unavailable`, `reason=same_context_binding_unverified`, пустые models. Никакого JSON поля `verified=true`, автоматического provider discovery, service/CLI starts или defaults нет.
- Optional trusted-host entry `run_front_with_metadata(..., Option[MetadataHook])` — in-process configuration hook. `MetadataHook`/`NativeMetadataBinding` **не имеют JSON decoder**. Доверенный native observer/installer обязан установить actual evidence того же configured family/launch/config/location **до** конструкции hook. Поля структуры или hash **сами по себе не доказывают происхождение**; способ получения такого native evidence здесь не реализован. Нельзя конструировать hook из client/source JSON и объявлять это проверкой.
- Expected/observed binding содержит configured family, SHA256 launch/config, location, exact contract `opencode-acp-2.2.5`, source `opencode.api.model`, version `2.2.5`. Сопоставление exact, без aliases/fallback. Hash конкретного snapshot привязывает прочитанные bytes к evidence; hash доказывает identity, не эквивалентность native контекста.
- Snapshot envelope: `{v:1, observed_at:<ms>, expires_at:<ms>, response:<exact GET /api/model response>}`. `response.location.directory` обязана совпасть с observed location. Файл только явно заданный hook, не личные settings/config, не auto-search. Файловый размер проверяется до read, общий byte cap 1 MiB проверяется повторно перед parse. Никакие headers/body/credentials из `Model.Info` наружу не копируются.
- Freshness: `observed_at>0`, `observed_at<=now<expires_at`, срок не более **300000 ms**. Future/missing/expired/слишком длинный TTL отказывается. Unknown source version/binding, duplicate/malformed IDs/variants, missing source, изменённый hash — unavailable, не default model.
- GET выполняет только bounded file-read и pure normalization. Никаких HTTP proxy calls, `session/new`, prompt, model/provider/agent/service starts или записи settings. Старт front/hub остаётся прежней отдельной операцией; route не добавляет к нему native agent startup.

Ответ:

```json
{
  "v": 1,
  "status": "unavailable",
  "reason": "same_context_binding_unverified",
  "family": "",
  "source": "",
  "source_version": "",
  "observed_at": 0,
  "expires_at": 0,
  "complete": false,
  "permissions_status": "blocked",
  "models": []
}
```

При действительно bound fresh source — `status=ready`, `reason=bound_native_snapshot`, configured family/source/timestamps и `models:[{id,name,efforts:[{id,name}]}]`. `complete=false` всегда: snapshot не доказывает завершённость provider discovery. Permissions/modes из `/api/model` не выводятся, `permissions_status=blocked` для всех. Иные native families/versions не «поддерживаются по похожему имени», остаются unavailable.

## Проверки и передача

Pure source mapping/freshness `1793549385078-18jklb`: exit 0, PASS 1 / FAIL 0. Все positive данные — явно **synthetic pure fixtures**, не действующий provider catalog и не native attestation. Добавлены negative hook tests: отсутствие authority, source verified flag без authority, mismatch family/config/location, changed snapshot digest, missing/legacy source, expired/future timestamps. Positive hook fixture проверяет только условный pure mapping/validation при trusted-host предпосылке; **не реальное cold-ready**.

Hook+affected front unit `1793549893261-s3i81e`: pure **hook_test PASS, source_test PASS**, но **affected front CC-FAIL** — вложенная untyped None/Some expression emitted как Option[int] при фактическом Some[str]. Read-only C lines 98708–98737 подтвердили mismatch; raw SHA256 `209a947d3bb6e93f67f9fb2795d503302363db407ac06d8860287c17a5c76ec2`, C SHA256 `3ba2c8e6cb3958007c864df599b2d77afa55436e7e35905d965f590a9bec91d0`. Никаких C/flags/toolchain изменений. Обычный source reader вынесен в `read_metadata_snapshot(path) Fs -> Option[str]`, route binding также явно Option[str]; bounded read и refusal правила не ослаблены.

Необходимый targeted повтор `1793550463482-25235i`: **exit 0, PASS 3 / FAIL 0**, 42 секунды исполнения после четырёх минут machine queue. `hook_test`, `source_test` и affected `server/front/agent_catalog` unit все прошли. Это compile/unit evidence optional hook и негативных контрактов, **не** реальный HTTP/native same-context catalog smoke. Ни сборка нового общего product SHA, ни live GET нового endpoint здесь не выполнялись; 277 проверяет assembly отдельно. 270/277 получают exact signed partial delta отдельно от утверждения готовности каталога; consumer не должен трактовать fail-closed endpoint как закрытие REQ-05.
