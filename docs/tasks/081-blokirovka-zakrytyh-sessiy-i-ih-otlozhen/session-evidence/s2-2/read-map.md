# Read map С2-2

## Task packet / prior evidence

| Source | Read range / status | Use |
|---|---|---|
| `task/message.md` | 1–56, full | Owner authorization, goal, boundaries, six S1 units, acceptance and output locations. |
| `analysis.md` | 1–59 in combined full read | FACT/INFERENCE/UNKNOWN and prior API/process limitations; not treated as own findings. |
| `spec.md` | 1–86, full | 10 REQ / 7 AC / 5 DNC, assumptions and undecided promises. |
| `spec-trace.md` | 1–25, full | Author's trace and limitations. |
| `spec-review-1.md` | 1–56, full | S1–S3/M1 restated independently and qualified. |
| `session-evidence/s2-1/read-map-and-probes.md` | 1–25, full | Only as previous partial report; its unchecked probes not credited. |
| `session-evidence/integrator-intake.md` | 1–14, full | Intake provenance, original losses, limits. |
| `session-evidence/integrator-s1-2-qualification.md` | 1–38, full | S1 conditions, M1 severity, GET requirement. |
| `session-evidence/integrator-s2-1-qualification.md` | 1–39, full | Previous session incomplete; no fence/API prerequisite. |
| `session-evidence/s1-2/**` | All 7 files; all content read. The 4,091-line `before-manifest.json` was read in consecutive ranges; it is a hash inventory, not source payload. | Prior raw evidence limits, records, manifests and prior error qualifications; no prior result accepted without independent recalculation. |
| Root `progress.log`, `usage.log`, `log.md` | Root logs read for existing prefixes/history; new lines only appended through allowed methods. | Confirm launch №4 and preserve old history. |

## Project/canon sources

- `AGENTS.md`: supplied at session start and used; `doc/canon/README.md` and `doc/canon/process.md` read.
- Relevant ADRs: `doc/canon/decisions/ADR-0001-work-by-methodology.md`, `ADR-0002-repository-layout.md`, `ADR-0006-public-repository.md`, `ADR-0007-plan-in-task-epics.md`, `ADR-0008-model-profiles-layer-and-window-files.md`; not read all unrelated ADRs.
- `opencode-plugin/core.ts`: `releaseExecutor` 3325–3333; `startSession` 2092–2115; `crew_send` 1913–2021; watch/timer tools 3164–3208; `postLetter` 1111–1117; `mayWakeCard` 1062; current help 1400–1418.
- `opencode-plugin/watch.ts`: full file 1–265, including request, detached spawn, poll, exit, cancellation and listing.
- `opencode-plugin/index.ts`: relevant paths 288–383 (delivery), 568–641 (resume/retry), 646–712 (end-task/watch move/close), 805–815 (reconcile), 1880–1928 (resume tasks/queue), 2033–2042 (watch poll and closed-card delivery filter), 2154 (direct `posted` pass callback). Call-sites were searched for all `requestWatch`, `dropWatch`, `pollWatches`, `deliver`, `postLetter`, and closed-card predicates; unrelated letters were not individually classified as lifecycle writers.
- `opencode-plugin/package.json` and `test/README.md`; `.github/workflows/guards.yml`; `opencode-plugin/README.md:143–166`; `.opencode/crew-harness.json` read-only.

## Methodology pinned source

Read with `git -C <закреплённый локальный immutable clone> show 0442a4d3a380f01f437640b5dd9174e384e50d67:<file>`; no fetch/ref mutation:

- `task-algorithm.md` 1–370, full.
- `task-sessions.md` 1–428, full; especially preparation, rules, S1/S2 prompts and gates.
- `task-runner.md` 1–378, full; especially machine formats, progress/profile, family independence, gates and project checks.
- `methodology.md` relevant sections 9 (520–654; a few very long lines were clipped by the viewer), 10 (655–877), 12 (878–968), 13 (969–1058), 18 (1375–1613). The session-acceptance, evidence, source-boundary, same-family and profile rules were used. This is not a claim that every unrelated methodology section was needed/read.

## External source

- OpenCode skill loaded before API review; V2 docs only: `https://opencode.ai/v2/docs/api`.
- Runtime `/openapi.json` read using official `opencode api get`; endpoint shapes were queried only for addressed session metadata and inbox count. No transcripts/messages/environment content read; no mutation operations invoked.

No primary review input was knowingly left unread. `before-manifest.json` and the methodology section 9 include long lines whose viewer output may clip individual line previews; full files were read in consecutive chunks or by the pinned blob source, and content/bytes were checked where specified. The early snapshot defect is recorded separately, not hidden by this read map.
