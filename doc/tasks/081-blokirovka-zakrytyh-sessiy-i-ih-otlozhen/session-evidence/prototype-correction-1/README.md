# Evidence: prototype correction 1

Partial evidence only; see `../../prototype-correction-result.md`.

| Probe | Command | Watch | Exit | Result |
|---|---|---|---:|---|
| Standalone gate (corrected replay) | `node opencode-plugin/test/prototype081/correction-1/gate-probe.mjs` | `1792342053821-au440w` | 0 | local adapter cases pass |
| Baseline lifecycle oracle | `node opencode-plugin/test/prototype081/correction-1/lifecycle-oracle.mjs <baseline> <temp>` | `1792342128199-1u4ari` | 1 | actual A running→closed observed; queued side effect absent; B positive; cleanup EPERM; not a valid RED |

Raw watch outputs remain in the server watch store, identified by the watch IDs.
This folder contains no private path, credentials, or raw transcript.
