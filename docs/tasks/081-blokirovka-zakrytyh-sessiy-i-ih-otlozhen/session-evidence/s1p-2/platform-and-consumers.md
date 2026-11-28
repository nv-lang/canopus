# Основания модели и граница consumers

## Что подтверждено чтением

`watch.ts:103–116,178–186`: detached spawn, затем отдельная запись PID;
claim удалён раньше spawn. Поэтому нынешний rename не обеспечивает новый
контракт L. `217–240`: подавление ошибки kill и запись done не доказывают exit.
Node child_process, разделы `options.detached`, `subprocess.kill`,
`subprocess.killed`: detached переживает parent, reused PID может адресовать
другой процесс, killed означает отправку сигнала, не прекращение процесса.
Источник: https://nodejs.org/api/child_process.html . Это не испытание Node на машине.

Windows имеет документированные средства группового lifetime, не только PID:
https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects .
Job может быть именованным; дочерние CreateProcess по умолчанию наследуют job;
неустановка breakaway flags удерживает дерево, но Win32_Process.Create — исключение.
Last handle при KILL_ON_JOB_CLOSE завершает связанные процессы. Уведомления
completion port не все гарантированы; security limits не превращают job в ACL.

https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
описывает JOB_LIST при создании процесса на Windows 10+, HANDLE_LIST и
SECURITY_CAPABILITIES. Это основание исследовать launch-time membership и права,
а не обещание, что текущий JS spawn уже даёт их или что job один защищает файлы B.

## Обязательство плана, не план реализации

Для зафиксированных входов L плану нужны проверяемые ответы:

1. Как до первого user-code effect переживает crash identity O и scope процесса,
   даже если PID-write не состоялся? Не принять «rename + spawn атомарны».
2. Как доказывается terminal состояние всех writers после crash управляющего
   процесса и reparenting? Не выводить exit из отсутствия PID/notification.
3. Чем до исполнения исключены write capabilities/передача handles A в B?
   Job lifetime без security/handle proof недостаточен.
4. Чем сериализуются C и D у двух процессов; где authoritative intent,
   почему потеря промежуточного claim его не уничтожает?
5. Как после конечного injected fault достигается success в T и работает B?
   Если не достигается — FAIL/возврат владельцу, не новый unsupported label.

Primitive не выбран; реальных проб OS не было. Источники показывают кандидаты
и ограничения, а не feasibility всей комбинации. Требование L остаётся
обязательным до и после выбора primitive. Legacy инцидент в L не переклассифицирован.

## Полный предметный consumer cut

Ниже перечислены найденные реальные входы к исполнению, а не лишь writers.

| Узел | Точные первичные места | Вывод для контракта |
|---|---|---|
| Файловая доставка | core 1111–1215 | post/claim/release/recover не проверяют поколения |
| Общий host consumer | index 295–383 | prompt/synthetic и confirm разделены |
| nudge | index 425–568 | прямой deliver, не только основной pass |
| reviewerAssigned | index 788–797 | прямой deliver после письма/obligation |
| selfResume | index 1011–1040 | interrupt→письмо→deliver, не permanent close |
| owner-answer | index 1364–1379 | письмо/clearStuck→deliver, тоже gate |
| startTask | index 1766–1877 | create/card/obligation/post/deliver раздельны |
| основной pass | index 1988–2047 | closed filter лишь у deliver loop |
| roleTaken | index 2159–2162 | прямой deliver после смены роли |
| crew_inbox | core 3097–3124 | выдача payload в текущий ход минуя deliver |
| crew_wait/takeReply | core 1688–1704,2039–2058 | ещё один consumer минуя deliver |
| watch consumer | watch 166–211 | claim/start/poll, lifetime процесса отдельно |
| MCP | mcp 23–59,85–96 | те же makeTools, card может быть создана заново |

Итого 7 прямых вызовов общего deliver плюс 2 отдельных файловых consumers
и watch consumer. Это не число всех writers: общий postLetter имеет много callers.
Системные notices, review/round/push/cancel, expectedLetters/parent, form/idle/flow,
retry/resume и role queues обязаны проходить один и тот же ownership контракт.
Не добавлять исключение по `from_session=crew-harness` или wake:false.

## API — действительно прочитанная граница

`api-schema-selected.json` получен из фактического GET `/openapi.json` после skill.
Схема 3.1.0: session GET возвращает обязательный `data: Session.Info`;
inbox GET — обязательный массив data. Null/неразобранный wrapper не пустой inbox.
Inbox list описывает ещё не доставленные элементы; это не полная опись уже
исполняющихся effects. Prompt durably admits input; command исполняет callback
немедленно. Interrupt останавливает execution этого процесса OpenCode; при resume
true может продолжить steering/control items. Cancel относится к одному inbox ID.

Онлайн plugins guide показывает иной пример interrupt (`continue:false`) и
иной пример command. Это дрейф примеров относительно фактической схемы, не
основание мутации по памяти. Для будущих admin нужны именно actual schema,
точная identity и отдельное полномочие. Ни один маршрут не обещает здесь
монотонный запрет произвольным независимым clients. Metadata/inbox повторно
не запрашивались; body/transcript/env не читались. #94 HOLD.
