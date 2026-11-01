param(
    [ValidateSet('focused', 'unit', 'server-live', 'acp-fixtures', 'web', 'guards', 'package')]
    [string]$Stage = 'focused',
    [string]$NovaHome = 'C:/work/nova/nova-oracle-0.1.0-windows-x86_64'
)
$ErrorActionPreference = 'Stop'
if ($Stage -eq 'web') {
    $files = @(Get-ChildItem 'src/web/test/*.test.mjs' | ForEach-Object { $_.FullName })
    & node --test --test-concurrency=4 @files
    exit $LASTEXITCODE
}
if ($Stage -eq 'guards') {
    & bash scripts/guards/run-all.sh
    exit $LASTEXITCODE
}
if ($Stage -eq 'package') {
    & python scripts/guards/selftest/test-check-release-kit.py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & python scripts/guards/selftest/test-package-release.py
    exit $LASTEXITCODE
}
. (Join-Path $NovaHome 'setup-env.ps1')
$env:TEMP = Join-Path $env:SystemDrive 'work/crew-harness-temp-272'
$null = New-Item -ItemType Directory -Force -Path $env:TEMP
$env:TMP = $env:TEMP
$env:NOVA_DEBUG_RUN_DUMP = '1'
$env:CREW_REAL_ACP = ''
$paths = switch ($Stage) {
    'focused' { @('src/family_approval_tests/approval_test.nv') }
    # One entry per module: Nova includes all peer tests, directory walks repeat those suites.
    'unit' { @('src/acp/project_test.nv', 'src/server/family_approval_test.nv', 'src/product_machines/disk_test.nv') }
    'server-live' { @('src/server_live/family_approval_test.nv') }
    # Nova includes peer tests from the whole module. One entry avoids repeating the same suite.
    # CREW_REAL_ACP is cleared above so the real-agent test takes its explicit skip branch.
    'acp-fixtures' { @('src/acp_live/client_test.nv') }
}
$arguments = @('test') + $paths + @('--jobs', '1', '--timeout', '600', '--verbose')
& (Join-Path $NovaHome 'nova.exe') @arguments
exit $LASTEXITCODE
