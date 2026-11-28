# Package and documentation audit (read-only)

**Expected/input:** per `package-doc-probe-plan.md`, inspect package script and current docs/help without running code or tests.

**Actual:** `opencode-plugin/package.json` defines `npm test` as a chained sequence of 121 `node test/*.mjs` commands (first `cleanup-tmp.mjs`; 120 named project tests after it). Existing nearby regression coverage includes `crew-watch.test.mjs`, `crew-flowwatch.test.mjs`, `crew-restart.test.mjs`, and the catalog `opencode-plugin/test/README.md:73–75` identifies watch/deny tests. No test command was executed.

Current CI workflow `.github/workflows/guards.yml:41–75` runs `sh scripts/guards/run-all.sh --ci`, `python scripts/guards/guard-secrets.py --tree`, `python scripts/guards/check-wiring.py`, `sh scripts/guards/selftest/run-selftests.sh`, `sh scripts/guards/prove-red.sh`, and `sh scripts/guards/probe-empty-root.sh`; workflow comments at lines 8–9 explicitly say it does **not** run plugin tests. AGENTS requires the full affected `opencode-plugin` test set before push; heavy runs use the machine queue. No targeted guard specifically for closed-session watch fencing was found under `scripts/guards` in the name/source search; this does not prove no new guard is needed.

Human-facing current behavior needing a later synchronized update if the final behavior changes: `opencode-plugin/README.md:143–166` and generated help text in `opencode-plugin/core.ts:1400–1418`; test catalog `opencode-plugin/test/README.md:73–75`. These are target locations, not a proposed edit or an assertion that docs already state the needed fence.

**Commands not run:** `npm test`; any guard, selftest, build, targeted test, CI workflow, or live command. Exact file list and observed source locations are read-only inventory, not verification results.
