# Evidence manifest: prototype-1

| Доказательство | Результат | SHA256 raw stdout |
|---|---|---|
| Точная baseline RED: `releaseExecutor` A и положительная B | exit 0; A side effect=true после close, B=true | `a22d38aec9ef63abb557ec393ce10cbbc9f34f8015d0b034b80b3c6651944c3d` |
| Tombstone queued/restart/B/race oracle | exit 0; queued/restart A=false, B=true, race A effect=true после C | `6b22669fdcf76de6625509989f392f83afc9fa59ef34ad1487543ce432d8e711` |

Точные команды, версия, baseline/spec digest, первоначальные неудачные попытки и
ограничения приведены в `prototype-result.md`. Полные machine-watch raw outputs
сохранены вне репозитория; здесь только безопасные производные и digests. Этот
manifest не является доказательством полного REQ/AC, L или независимой проверки.
