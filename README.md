# Canopus

[![CI](https://github.com/nv-lang/canopus/actions/workflows/guards.yml/badge.svg)](https://github.com/nv-lang/canopus/actions/workflows/guards.yml)

**Hand it to Canopus. Canopus sees it through.**

Canopus keeps the task moving when agents change and brings you in only when it needs your decision to finish.

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
| [`docs/`](docs/README.md) | Documentation, development rules, decisions and task records |

## Get the source

```sh
git clone https://github.com/nv-lang/canopus.git
cd canopus
```

See the [plugin guide](opencode-plugin/README.md) for OpenCode setup and operation.
The application uses Nova; its dependencies are declared in [`nova.toml`](nova.toml).
The [release packaging script](scripts/package-release.sh) assembles and checks an application kit.

### Windows x64 release with Oracle 0.1.4

For a long-running server, build with a static Boehm GC that enables
`LARGE_CONFIG`. The stock Windows x64 Oracle 0.1.4 library has a 1,024-section
heap table. Boehm 8.2.12 with `LARGE_CONFIG` raises this limit to 81,920.

In an x64 Developer Command Prompt with CMake and Ninja on PATH, build Boehm
8.2.12 with the libatomic_ops headers from Oracle. Adjust the example paths
to match the extracted source and toolchain.

```bat
set "INCLUDE=C:\work\oracle-0.1.4\gc\include;%INCLUDE%"
cmake -S C:/work/bdwgc-8.2.12 -B C:/work/bdwgc-large -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded -DBUILD_SHARED_LIBS=OFF -Denable_large_config=ON -Dbuild_cord=OFF -Denable_docs=OFF
cmake --build C:/work/bdwgc-large --target gc
```

From the Canopus checkout, use the resulting `gc.lib` and Oracle's
`atomic_ops.lib` in a separate library directory. Set the override after
loading Oracle's environment.

```powershell
. 'C:/work/oracle-0.1.4/setup-env.ps1'
Copy-Item "$env:NOVA_GC_LIB_DIR/atomic_ops.lib" 'C:/work/bdwgc-large'
$env:NOVA_GC_LIB_DIR = 'C:/work/bdwgc-large'
New-Item -ItemType Directory -Force target | Out-Null
nova build --mode release src/canopus.nv -o target/canopus.exe --timeout 900
```

Verify the limit in the resulting executable before packaging, for example
by checking that the Windows abort path for `Too many heap sections` compares
the section count to `0x14000` (81,920). Package that binary with the release
packaging script. Keep the collector version, build flags and executable hash
with the release verification.

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
(default: `docs/tasks/`), or `~/.canopus/tasks/` without a project.
Private runtime state stays outside the versioned task documents.
OpenCode's own configuration, data and authentication remain separate.

The [configuration contract](docs/canon/configuration.md) defines the accepted fields,
instance layout, project overrides and migration rules.

## Working with tasks

Create tasks through owner-confirmed proposals. Use pause and resume for temporary stops;
resume retains the task number and history. Cancellation records its initiator, reason and
replacement and closes outstanding questions. See the [task lifecycle rules](docs/canon/task-lifecycle.md).

Delivery uses a checked candidate and a fast-forward merge. Follow the
[plugin's review and merge instructions](opencode-plugin/README.md#review-and-merge).
Heavy builds and test runs use the machine queue.

## Development and checks

Read [AGENTS.md](AGENTS.md) and the [Canon](docs/canon/README.md) before changing this repository.
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
