param(
    [Parameter(Mandatory = $true)][string]$NovaHome,
    [Parameter(Mandatory = $true)][string]$Artifacts,
    [ValidateSet('build', 'unit', 'focused-live', 'server-live', 'package', 'app-boundary', 'config-only', 'acp-fixtures', 'gaps', 'kit', 'guards')][string]$Stage = 'unit'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location $root
New-Item -ItemType Directory -Force $Artifacts | Out-Null
Write-Output ('277 candidate: ' + (& git rev-parse HEAD))
Write-Output ('277 source diff: ' + ((& git diff --name-only HEAD -- src machines) -join ', '))
$candidateDrift = @(& git diff --name-only 73c97b5f3cda582831575a5133bc3375cba3e932 -- src machines)
if ($candidateDrift.Count -gt 0) { throw 'Fixed candidate product snapshot drifted; do not reuse 277 results for a later candidate.' }
if ($Stage -eq 'app-boundary') {
    & node --test --test-concurrency=1 doc/tasks/277-chat-epic-acceptance/app-boundary.test.mjs doc/tasks/277-chat-epic-acceptance/agent-contract.test.mjs
    exit $LASTEXITCODE
}
if ($Stage -eq 'gaps') {
    & node --test --test-concurrency=1 doc/tasks/277-chat-epic-acceptance/requirements-gaps.test.mjs
    exit $LASTEXITCODE
}
if ($Stage -eq 'kit') {
    & bash scripts/package-release.sh (Join-Path $Artifacts 'kit')
    exit $LASTEXITCODE
}
if ($Stage -eq 'guards') {
    & bash scripts/guards/run-all.sh
    exit $LASTEXITCODE
}
if ($Stage -eq 'package') {
    & python scripts/guards/selftest/test-check-release-kit.py
    $first = $LASTEXITCODE
    & python scripts/guards/selftest/test-package-release.py
    if ($first -ne 0) { exit $first }
    exit $LASTEXITCODE
}
. (Join-Path $NovaHome 'setup-env.ps1')
$nova = Join-Path $NovaHome 'nova.exe'
# Oracle/Clang needs an ASCII temporary path; keep test repositories outside this tree.
$env:TEMP = Join-Path $env:SystemDrive 'work/crew-harness-temp-277'
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
$env:TMP = $env:TEMP
# Each invocation is submitted through crew_watch(machine:true), never directly.
$env:CREW_REAL_ACP = ''
$env:NOVA_DEBUG_RUN_DUMP = '1'
if ($Stage -eq 'build') {
    & $nova build src/crew_hub.nv -o target/crew-hub.exe
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $nova build src/crew_harness.nv -o target/crew-harness.exe
    exit $LASTEXITCODE
}
[string[]]$paths = switch ($Stage) {
    'unit' { @('src/server/settings_test.nv', 'src/server/front/front_settings_test.nv', 'src/config/presets_test.nv', 'src/projects/store_test.nv', 'src/agent_pool_tests/source_test.nv', 'src/family_approval_tests/approval_test.nv', 'src/product_machines/disk_test.nv', 'src/acp/project_test.nv') }
    'focused-live' { @('src/agent_pool_live_tests', 'src/server_preparation_live', 'src/server_projectless_live', 'src/server_workspace_live', 'src/server_delivery_live', 'src/server_hidden_wait') }
    'server-live' { @('src/server_live/family_approval_test.nv') }
    'config-only' { @('src/config/presets_test.nv') }
    'acp-fixtures' { @('src/acp_live/client_test.nv') }
}
& $nova test @paths --jobs 1 --timeout 600 --verbose --results-file (Join-Path $Artifacts ($Stage + '-results.json'))
exit $LASTEXITCODE
