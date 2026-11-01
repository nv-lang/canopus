param(
    [Parameter(Mandatory = $true)][string]$NovaHome,
    [ValidateSet('targeted', 'live', 'web', 'build', 'front', 'guards', 'full')][string]$Lane = 'targeted'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location $root
Write-Output ('275 snapshot: ' + (& git rev-parse HEAD))
$dirtySource = @(& git diff --name-only HEAD -- src machines)
Write-Output ('275 source changes after snapshot: ' + ($dirtySource -join ', '))
. (Join-Path $NovaHome 'setup-env.ps1')
$nova = Join-Path $NovaHome 'nova.exe'
function Run-Nova([string[]]$Arguments) {
    & $nova @Arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if ($Lane -eq 'web') {
    & node --test --test-concurrency=3 src/web/test/*.test.mjs
    exit $LASTEXITCODE
}
if ($Lane -eq 'build') {
    Run-Nova -Arguments @('build', 'src/crew_hub.nv', '-o', 'target/crew-hub.exe')
    Run-Nova -Arguments @('build', 'src/crew_harness.nv', '-o', 'target/crew-harness.exe')
    exit 0
}
if ($Lane -eq 'front') {
    Run-Nova -Arguments @('build', 'src/crew_harness.nv', '-o', 'target/crew-harness.exe')
    exit 0
}
if ($Lane -eq 'guards') {
    & bash scripts/guards/run-all.sh
    exit $LASTEXITCODE
}
if ($Lane -eq 'full') {
    Run-Nova -Arguments @('test', 'src/server', 'src/projects', '--jobs', '1', '--timeout', '600', '-v')
    exit 0
}
if ($Lane -eq 'live') {
    Run-Nova -Arguments @('test', 'src/server_workspace_live', '--jobs', '1', '--timeout', '600', '-v')
    exit 0
}
& node --test --test-concurrency=3 src/web/test/workspace.test.mjs src/web/test/projects-ui.test.mjs src/web/test/closing.test.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Run-Nova -Arguments @('test', 'src/server/workspace_test.nv', 'src/server/work_mode_test.nv', '--jobs', '1', '--timeout', '600')
Run-Nova -Arguments @('test', 'src/server/taskwt_test.nv', '--filter', 'workspace:', '--jobs', '1', '--timeout', '600')
