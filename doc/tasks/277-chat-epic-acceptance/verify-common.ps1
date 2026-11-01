param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$NovaHome,
    [Parameter(Mandatory = $true)][string]$Artifacts,
    [ValidateSet('build', 'web', 'union', 'unit', 'server-live', 'live', 'oracles', 'acp', 'harness', 'migration', 'package', 'guards')][string]$Lane = 'unit'
)
# Run only through crew_watch(machine:true). Never reuse the old audit runner's
# fixed 73c97b5f result for this new assembly. No service or real agent is started.
$ErrorActionPreference = 'Stop'
# setup-env.ps1 assigns $root in the caller's scope. Keep the checkout binding
# under a distinct name: the old archive copied from NovaHome after that import.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location $repoRoot
function Assert-Candidate {
    $headNow = ((& git -C $repoRoot rev-parse HEAD) -join '').Trim()
    if ($LASTEXITCODE -ne 0 -or $headNow -cne $Candidate) { throw 'The exact candidate HEAD is required.' }
    $dirtyNow = @(& git -C $repoRoot status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $dirtyNow.Count -ne 0) { throw 'Candidate inputs are not clean.' }
}
function Complete-Lane([int]$Code) {
    Assert-Candidate
    exit $Code
}
Assert-Candidate
$head = $Candidate
if ($Candidate -eq '782c6eba7419c2a88863bf6caa6aa5cfbf2d8f3a' -or $Candidate -eq '73c97b5f3cda582831575a5133bc3375cba3e932') {
    throw 'This runner is for the new assembled candidate, not a repeated old audit.'
}
$null = New-Item -ItemType Directory -Force -Path $Artifacts
$artifactRoot = (Resolve-Path $Artifacts).Path
Write-Output ('277 common exact HEAD: ' + $head)
Write-Output ('277 common lane: ' + $Lane)
Write-Output ('277 common product tree: ' + ((& git rev-parse HEAD:src) -join ''))
$env:CREW_REAL_ACP = ''
$env:NOVA_DEBUG_RUN_DUMP = '1'

if ($Lane -eq 'web') {
    $files = @(Get-ChildItem -LiteralPath 'src' -Filter '*.test.mjs' -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName })
    if ($files.Count -eq 0) { throw 'No full web test files found.' }
    & node --test --test-concurrency=1 @files
    Complete-Lane $LASTEXITCODE
}
if ($Lane -eq 'guards') {
    & bash scripts/guards/run-all.sh
    Complete-Lane $LASTEXITCODE
}
if ($Lane -eq 'harness') {
    & node --test --test-concurrency=1 doc/tasks/277-chat-epic-acceptance/common-process.test.mjs
    Complete-Lane $LASTEXITCODE
}
if ($Lane -eq 'migration') {
    & python scripts/test-convert-model-presets.py
    Complete-Lane $LASTEXITCODE
}
if ($Lane -eq 'package') {
    $builtFor = Get-Content -LiteralPath (Join-Path $artifactRoot 'build-attestation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($builtFor.candidate -cne $Candidate -or $builtFor.source_tree -cne ((& git rev-parse HEAD:src) -join '').Trim()) { throw 'Packaging requires this exact build attestation.' }
    foreach ($binding in @(@('target/crew-hub.exe', 'hub_sha256'), @('target/crew-harness.exe', 'front_sha256'), @('src/server/preparation-agent.mjs', 'preparation_sha256'))) {
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repoRoot $binding[0])).Hash.ToLowerInvariant() -cne $builtFor.($binding[1])) { throw 'Packaging input differs from the attested build.' }
    }
    & python scripts/guards/selftest/test-check-release-kit.py
    $first = $LASTEXITCODE
    & python scripts/guards/selftest/test-package-release.py
    $second = $LASTEXITCODE
    if ($first -ne 0) { Complete-Lane $first }
    if ($second -ne 0) { Complete-Lane $second }
    & bash scripts/package-release.sh (Join-Path $artifactRoot 'kit')
    Complete-Lane $LASTEXITCODE
}

. (Join-Path $NovaHome 'setup-env.ps1')
Set-Location $repoRoot
$nova = Join-Path $NovaHome 'nova.exe'
# The compiler needs an ASCII temp; fixture repositories must not inherit this
# checkout's project settings. This is a test-only directory, not CREW_HOME.
$env:TEMP = Join-Path $env:SystemDrive ('work/crew-harness-temp-277-common/final-' + $Lane)
$null = New-Item -ItemType Directory -Force -Path $env:TEMP
$env:TMP = $env:TEMP
if ($Lane -ne 'build') {
    # The helper side-effect oracle must use only a synthetic OpenCode config.
    # Absence during Preparation plus presence after ordinary ACP is the paired
    # control; KEEP_PLUGIN must not make both branches silently skip the helper.
    $env:CREW_OPENCODE_KEEP_PLUGIN = ''
    $env:XDG_CONFIG_HOME = Join-Path $artifactRoot ('fixture-xdg-' + $Lane)
    $fixtureConfig = Join-Path $env:XDG_CONFIG_HOME 'opencode'
    $null = New-Item -ItemType Directory -Force -Path $fixtureConfig
    [System.IO.File]::WriteAllText((Join-Path $fixtureConfig 'opencode.json'), '{"model":"fixture/isolated-env"}')
}
if ($Lane -eq 'build') {
    if (Test-Path -LiteralPath (Join-Path $artifactRoot 'build-attestation.json')) { throw 'Use new build artifacts; prior attestation must stay immutable.' }
    $null = New-Item -ItemType Directory -Force -Path 'target'
    & $nova build src/crew_hub.nv -o target/crew-hub.exe
    $hub = $LASTEXITCODE
    & $nova build src/crew_harness.nv -o target/crew-harness.exe
    $front = $LASTEXITCODE
    if ($hub -ne 0) { Complete-Lane $hub }
    if ($front -ne 0) { Complete-Lane $front }
    Assert-Candidate
    $attestation = [ordered]@{
        candidate = $Candidate
        source_tree = ((& git rev-parse HEAD:src) -join '').Trim()
        hub_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath 'target/crew-hub.exe').Hash.ToLowerInvariant()
        front_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath 'target/crew-harness.exe').Hash.ToLowerInvariant()
        preparation_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath 'src/server/preparation-agent.mjs').Hash.ToLowerInvariant()
        machines_tree = ((& git rev-parse HEAD:machines) -join '').Trim()
        lock_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath 'nova.lock.toml').Hash.ToLowerInvariant()
        nova_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $nova).Hash.ToLowerInvariant()
        verifier_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $PSScriptRoot 'verify-common.ps1')).Hash.ToLowerInvariant()
    }
    $built = Join-Path $artifactRoot 'built'
    $null = New-Item -ItemType Directory -Path $built -ErrorAction Stop
    foreach ($program in @('crew-hub.exe', 'crew-harness.exe')) {
        [System.IO.File]::Copy((Join-Path $repoRoot ('target/' + $program)), (Join-Path $built $program), $false)
    }
    [System.IO.File]::Copy((Join-Path $repoRoot 'src/server/preparation-agent.mjs'), (Join-Path $built 'preparation-agent.mjs'), $false)
    foreach ($binding in @(@('crew-hub.exe', 'hub_sha256'), @('crew-harness.exe', 'front_sha256'), @('preparation-agent.mjs', 'preparation_sha256'))) {
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $built $binding[0])).Hash.ToLowerInvariant() -cne $attestation[$binding[1]]) { throw 'Archived build hash differs from its origin.' }
    }
    $attestation | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactRoot 'build-attestation.json') -Encoding UTF8
    Complete-Lane 0
}
[string[]]$paths = switch ($Lane) {
    'union' { @('src/server', 'src/server_preparation_backend_live') }
    'unit' { @('src/config', 'src/acp', 'src/server', 'src/server/front', 'src/projects', 'src/storage', 'src/agent_pool_tests', 'src/family_approval_tests', 'src/model_metadata_tests', 'src/product_machines') }
    'server-live' { @('src/server_live') }
    'live' { @('src/agent_pool_live_tests', 'src/server_preparation_live', 'src/server_preparation_backend_live', 'src/server_projectless_live', 'src/server_workspace_live', 'src/server_delivery_live', 'src/server_hidden_wait', 'src/server_crew_live', 'src/server_ext_live', 'src/server_loading_live', 'src/server_result_repo_live', 'src/server_route_live', 'src/server_wip_live', 'src/server_wip_slow_live') }
    'oracles' { @('src/request_oracle_tests', 'src/chat_delivery_fixture_tests') }
    'acp' { @('src/acp_live') }
}
if ($paths.Count -eq 0) { throw 'No paths for the selected full lane.' }
Write-Output ('277 common full modules: ' + ($paths -join ', '))
& $nova test @paths --jobs 1 --timeout 600 --verbose --keep-artifacts --results-file (Join-Path $artifactRoot ($Lane + '-results.json'))
Complete-Lane $LASTEXITCODE
