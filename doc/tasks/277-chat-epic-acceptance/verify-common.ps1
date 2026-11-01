param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$NovaHome,
    [Parameter(Mandatory = $true)][string]$Artifacts,
    [ValidateSet('build', 'web', 'unit', 'live', 'acp', 'migration', 'package', 'guards')][string]$Lane = 'unit'
)
# Run only through crew_watch(machine:true). Never reuse the old audit runner's
# fixed 73c97b5f result for this new assembly. No service or real agent is started.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location $root
$head = ((& git rev-parse HEAD) -join '').Trim()
if ($LASTEXITCODE -ne 0 -or $head -cne $Candidate) { throw 'The exact candidate HEAD is required.' }
$dirty = @(& git status --porcelain --untracked-files=all -- src machines scripts nova.toml nova.lock.toml doc/tasks/277-chat-epic-acceptance/verify-common.ps1)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) { throw 'Candidate product/build inputs are not clean.' }
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
    exit $LASTEXITCODE
}
if ($Lane -eq 'guards') {
    & bash scripts/guards/run-all.sh
    exit $LASTEXITCODE
}
if ($Lane -eq 'migration') {
    & python scripts/test-convert-model-presets.py
    exit $LASTEXITCODE
}
if ($Lane -eq 'package') {
    & python scripts/guards/selftest/test-check-release-kit.py
    $first = $LASTEXITCODE
    & python scripts/guards/selftest/test-package-release.py
    $second = $LASTEXITCODE
    if ($first -ne 0) { exit $first }
    if ($second -ne 0) { exit $second }
    & bash scripts/package-release.sh (Join-Path $artifactRoot 'kit')
    exit $LASTEXITCODE
}

. (Join-Path $NovaHome 'setup-env.ps1')
$nova = Join-Path $NovaHome 'nova.exe'
# The compiler needs an ASCII temp; fixture repositories must not inherit this
# checkout's project settings. This is a test-only directory, not CREW_HOME.
$env:TEMP = Join-Path $env:SystemDrive 'work/crew-harness-temp-277-common'
$null = New-Item -ItemType Directory -Force -Path $env:TEMP
$env:TMP = $env:TEMP
if ($Lane -eq 'build') {
    $null = New-Item -ItemType Directory -Force -Path 'target'
    & $nova build src/crew_hub.nv -o target/crew-hub.exe
    $hub = $LASTEXITCODE
    & $nova build src/crew_harness.nv -o target/crew-harness.exe
    $front = $LASTEXITCODE
    if ($hub -ne 0) { exit $hub }
    if ($front -ne 0) { exit $front }
    $attestation = [ordered]@{
        candidate = $Candidate
        source_tree = ((& git rev-parse HEAD:src) -join '').Trim()
        hub_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath 'target/crew-hub.exe').Hash.ToLowerInvariant()
        front_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath 'target/crew-harness.exe').Hash.ToLowerInvariant()
    }
    $attestation | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactRoot 'build-attestation.json') -Encoding UTF8
    exit 0
}
[string[]]$paths = switch ($Lane) {
    'unit' { @('src/config', 'src/acp', 'src/server', 'src/projects', 'src/agent_pool_tests', 'src/family_approval_tests', 'src/product_machines') }
    'live' { @('src/server_live', 'src/agent_pool_live_tests', 'src/server_preparation_live', 'src/server_projectless_live', 'src/server_workspace_live', 'src/server_delivery_live', 'src/server_hidden_wait') }
    'acp' { @('src/acp_live') }
}
if ($paths.Count -eq 0) { throw 'No paths for the selected full lane.' }
Write-Output ('277 common full modules: ' + ($paths -join ', '))
& $nova test @paths --jobs 1 --timeout 600 --verbose --results-file (Join-Path $artifactRoot ($Lane + '-results.json'))
exit $LASTEXITCODE
