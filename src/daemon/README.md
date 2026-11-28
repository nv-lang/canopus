# Canopus daemon

Хаб читает список демонов из `state/daemon.json` в каталоге своего экземпляра.

```json
{
  "daemons": [
    {"id": "local", "host": "127.0.0.1", "port": 39329},
    {"id": "server-a", "host": "10.77.0.1", "port": 39329, "cwd": "/srv/canopus/work"}
  ]
}
```

Для каждой записи нужен свой ключ в `state/daemon-keys/<id>.key` с правами `600` и тот же ключ в файле демона. ID уникальны в пределах списка и состоят из строчных латинских букв, цифр, дефисов или подчёркиваний. В новой сессии выберите машину в поле «Машина». Если клиент не передал выбор, хаб берёт первый ID списка. Сессия сохраняет ID при создании и восстанавливает агента на том же демоне. При удалении выбранного ID из конфига восстановление завершится явной ошибкой.

Конфиг этапа 1 `{"port": 39329}` сохраняет ID `local`, адрес `127.0.0.1` и ключ `state/daemon.key`. При переходе на список сохраните этот ID для старых сессий и перенесите ключ в `state/daemon-keys/local.key`.

Демон запускается командой `canopus daemon --id <id> --port <порт> --key-file <файл>`. По умолчанию он использует ID `local` и слушает `127.0.0.1`. Для удалённого запуска передайте `--bind <IPv4>` с конкретным адресом WireGuard. `--port 0` подходит для проб. Демон печатает фактический адрес и порт при запуске.

Команда, аргументы и переменные агента из настроек хаба применяются на машине демона. Если пути машин различаются, поле `cwd` в `state/daemon.json` задаёт один существующий абсолютный путь на Linux для всех запусков через этот endpoint. Хаб передаёт его процессу агента и в ACP `session/new`. Для этого режима подготовьте рабочую папку заранее. Файлы хаба, проекты и рабочие деревья автоматически между машинами не переносятся. HTTP MCP на loopback хаба с машины демона недоступен.

Хаб хранит ID демона, привязку к экземпляру агента, состояние разбора ACP и события кадров в inbox сессии. Записи `Link.ack` отмечают события, зафиксированные движком. После перезапуска курсор этого агента на выбранном демоне ставится перед первым кадром с неподтверждёнными событиями. Повтор уже записанного кадра использует сохранённые события с прежними идентификаторами.

При сетевой ошибке удалённый транспорт повторяет чтение с последнего принятого `seq` до 60 секунд с первого запроса чтения. Демон продолжает читать агента в это время. Команды с неопределённым исходом, включая отправленный при обрыве prompt, автоматически не повторяются. Восстановление зависит от живого демона и его окна выдачи. Предел ACP-строки составляет 8 МиБ. Отдельный HTTP MCP-запрос к прежнему процессу хаба может завершиться по разрыву соединения. Нативные формы и разрешения ACP остаются в сохранённом состоянии клиента.

## Запуск через WireGuard

На сервере поднимите отдельный интерфейс WireGuard через `wg-quick@`, укажите разрешённый IP клиента в секции `Peer` и разрешите вход на UDP-порт WireGuard. Разрешите TCP-порт демона на интерфейсе WireGuard от адреса клиента. Ключи WireGuard и статический ключ демона должны храниться в закрытых файлах. Статический ключ даёт право запускать процессы под пользователем демона.

Для нескольких серверов в `10.77.0.0/24` каждому серверу назначьте отдельный адрес. На ноутбуке оставьте один интерфейс с адресом клиента и добавьте отдельный `[Peer]` на каждый сервер. Замените маршрут `10.77.0.0/24` первого пира на его `/32` и укажите остальные адреса серверов отдельными маршрутами `/32`.

Пример `~/.config/systemd/user/canopus-daemon.service` для установленного бинарника и готового интерфейса WireGuard.

```ini
[Unit]
Description=Canopus agent daemon on WireGuard
StartLimitIntervalSec=0

[Service]
ExecStart=%h/.local/libexec/canopus-daemon/canopus daemon --id server-a --bind 10.77.0.1 --port 39329 --key-file %h/.config/canopus-daemon/daemon.key
Restart=on-failure
RestartSec=3s

[Install]
WantedBy=default.target
```

Включите linger для пользователя демона, затем выполните `systemctl --user daemon-reload` и `systemctl --user enable --now canopus-daemon.service`. При старте раньше WireGuard unit будет повторять попытку привязки к адресу. Состояние и причину ошибок показывают `systemctl --user status canopus-daemon.service` и `journalctl --user -u canopus-daemon.service`. Команда `ss -ltn 'sport = :39329'` должна показывать единственный адрес WireGuard.

## Приёмка

Проверки рассчитаны на Linux и используют собранные бинарники.

```sh
python3 src/daemon/local_test.py <canopus>
python3 src/daemon/hub_test.py <canopus> <canopus-hub>
python3 src/daemon/hub_test.py <canopus> <canopus-hub> --restart
python3 src/daemon/hub_test.py <canopus> <canopus-hub> --late-ack
python3 src/daemon/hub_test.py <canopus> <canopus-hub> --graceful
python3 src/daemon/hub_test.py <canopus> <canopus-hub> --interrupt accepted
python3 src/daemon/hub_test.py <canopus> <canopus-hub> --interrupt refused
```

Удалённые режимы запускаются на машине работающего демона. Тестовый хаб подключается к его адресу WireGuard. Режиму `--remote-break` нужен доступ к `sudo -n iptables`. Он выбирает второй ID списка, на 30 секунд блокирует локальный TCP от своего пользователя к выбранному демону и проверяет непрерывный догон и завершение исходного хода. Запускайте его, когда этот локальный адрес свободен от других хабов того же пользователя. Режим `--restart` выбирает дефолтный демон и перед восстановлением переставляет недоступную запись на первое место.

```sh
python3 src/daemon/hub_test.py target/canopus target/canopus-hub \
  --remote-daemon-id server-a --remote-host 10.77.0.1 --remote-port 39329 \
  --remote-key-file ~/.config/canopus-daemon/daemon.key --remote-break
python3 src/daemon/hub_test.py target/canopus target/canopus-hub \
  --remote-daemon-id server-a --remote-host 10.77.0.1 --remote-port 39329 \
  --remote-key-file ~/.config/canopus-daemon/daemon.key --restart
```
