# Canopus

[![CI](https://github.com/nv-lang/canopus/actions/workflows/guards.yml/badge.svg)](https://github.com/nv-lang/canopus/actions/workflows/guards.yml)

**Your AI development team, coordinated.**

Canopus coordinates coding agents, project tasks, owner decisions, reviews and delivery.
It provides a local application with a browser interface and an OpenCode plugin.
Agents can work in separate Git worktrees, exchange messages and queue heavy commands;
creating and cancelling tasks requires the owner's confirmation.

Canopus belongs to the [Nova ecosystem](https://github.com/nv-lang), is built with
[Nova](https://github.com/nv-lang/nova) and [Alula](https://github.com/nv-lang/nova-alula),
and can coordinate development projects written in other languages.

## Components

| Location | Purpose |
| --- | --- |
| [`src/`](src/) | Application, ACP integration, session server, configuration, file storage and PostgreSQL support |
| [`src/web/`](src/web/) | Browser interface: projects, sessions, messages, task cards and owner questions |
| [`opencode-plugin/`](opencode-plugin/README.md) | OpenCode integration: agent roles, task lifecycle, messages, reviews, diagnostics and machine queue |
| [`machines/`](machines/README.md) | Product state machines executed by Alula |
| [`scripts/`](scripts/) | Packaging, setup, Git hooks, guards and their self-tests |
| [`.github/workflows/`](.github/workflows/) | Repository CI: guards, guard self-tests and browser-interface tests |
| [`doc/`](doc/README.md) | Documentation, development rules, decisions and task records |

## Get the source

```sh
git clone https://github.com/nv-lang/canopus.git
cd canopus
```

See the [plugin guide](opencode-plugin/README.md) for OpenCode setup and operation.
The application uses Nova; its dependencies are declared in [`nova.toml`](nova.toml).
The [release packaging script](scripts/package-release.sh) assembles and checks an application kit.

## Configuration and data

With the application executable on `PATH`, run `canopus` or `canopus serve`.
Use `canopus serve --config <path>/config.json` to select another instance.
The selected configuration file's parent directory defines that instance's data root.

| Component | Global configuration | Project configuration |
| --- | --- | --- |
| Application | `~/.canopus/config.json` | `<project>/.canopus/config.json` |
| Plugin | `~/.canopus/plugin/config.json` | `<project>/.canopus/plugin/config.json` |

Precedence is **built-in defaults → global configuration → project configuration**.
Project values override global values; there is no `local.json` layer.
Secrets are stored separately from ordinary configuration.

The application and plugin share project task storage at `<project>/<tasks_dir>/`
(default: `doc/tasks/`), or `~/.canopus/tasks/` without a project.
Private runtime state stays outside the versioned task documents.
OpenCode's own configuration, data and authentication remain separate.

The [configuration contract](doc/canon/configuration.md) defines the accepted fields,
instance layout, project overrides and migration rules.

## Working with tasks

Create tasks through owner-confirmed proposals. Use pause and resume for temporary stops;
resume retains the task number and history. Cancellation records its initiator, reason and
replacement and closes outstanding questions. See the [task lifecycle rules](doc/canon/task-lifecycle.md).

Delivery uses a checked candidate and a fast-forward merge. Follow the
[plugin's review and merge instructions](opencode-plugin/README.md#review-and-merge).
Heavy builds and test runs use the machine queue.

## Development and checks

Read [AGENTS.md](AGENTS.md) and the [Canon](doc/canon/README.md) before changing this repository.
The development process follows [unitcraft/ai-dev-methodology](https://github.com/unitcraft/ai-dev-methodology).
The plugin's test commands are documented in its [README](opencode-plugin/README.md).

For builds with Oracle v0.1.3, use the `std/src/fs/fs.nv` from Nova commit
[`dd0e65f59`](https://github.com/nv-lang/nova/commit/dd0e65f59c43dbbe013f23ca6ce5306b59fde724).
Canopus uses the `buffer_size` argument introduced there. Copy the release's `std` directory,
replace `src/fs/fs.nv` in that copy with the file from the pinned commit, and point
`NOVA_STD_PATH` at the copy after running the Oracle environment setup.

Repository guards:

```sh
sh scripts/guards/run-all.sh
python scripts/guards/guard-secrets.py --tree
python scripts/guards/check-wiring.py
```

A private-name list is required locally and through the `CANOPUS_PRIVATE_NAMES` Actions
secret in CI. See [AGENTS.md](AGENTS.md) for setup, required checks and execution policy.

## License

MIT or Apache-2.0, at your choice. See [LICENSE](LICENSE).
