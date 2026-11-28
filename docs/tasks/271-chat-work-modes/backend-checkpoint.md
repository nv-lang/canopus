# Контрольная точка возобновлённой 271

## Финальный исходный снимок

Ветка `task/271-chat-work-modes`, база delta — signed `81daedf5314af12e7f96fe5d591d5970c4cda82c`.
Код заморожен после ранней exact-session fixture ветки; production выбор не меняется.

- Watch `1793551812977-72rcs7`: host 208/208, local-fixture backend 1/1, exit 0.
- Затем убрано чтение env/load_presets перед fixture fallback. Это дефект предпосылки изоляции, не наблюдённое обращение к owner credentials/provider.
- Watch `1793552449930-w29wvb`: после правки host 208/208 и backend 1/1, exit 0.
- Ранее Node 10/10 и legacy recovery 1/1; packaging 18/18 + 5/5, guards 10/10. Их снимки и границы раскрыты в [backend-result.md](backend-result.md).
- Единственный разрешённый реальный stateless probe: HTTP 200, reply ok, без statement. Повтор не разрешён; не product/provider E2E.

## Передача сборщику

Runtime asset `preparation-agent.mjs` обязателен. Backend test self-contained: `nova test src/server_preparation_backend_live --jobs 1 --timeout 300 -v`; только локальный fake HTTP через настоящий ACP, без owner registry.
Union с 276 `6f4795d9ca540e15efa26ac7a9d6650118a720fd` сохраняет actual `config.cwd`→`rt.cwd_now`, restricted cwd `<data_dir>/<id>` и root `<data_dir>/<id>/tasks/draft`, ordinary `@agent_cwd` из 276.
Main, служба, pin, личные настройки и работающие стенды не менялись. Общий provider E2E не запускался.

Финальные проверки: watch `1793553299896-qi7e3g`, exit 0 — guards 10/10, privacy 2818 файлов, изменённый отрицательный URL control 1/1. Перед этим штатно пересоздан generated workaround index; privacy RED на синтетический credentialed URL устранён представлением через URL.username/password без ослабления проверки отказа. Production код после targeted GREEN не менялся.

Осталось: signed clean delta и exact SHA сборщику 277 и интегратору; штатная сдача без обхода возможного отказа уже сданной задачи.

После index privacy RED на синтетические fixture passwords использован штатный placeholder `example`, без ослабления стража. Watch `1793553581389-ehxf4g`: затронутые Node controls/auth/standalone, backend live 1/1, guards 10/10 и tree privacy GREEN, exit 0. Production код не менялся; index privacy остаётся обязательной проверкой commit hook.
