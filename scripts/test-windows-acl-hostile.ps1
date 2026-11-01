param([Parameter(Mandatory=$true)][string]$FixtureName)
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-acl-adapter.ps1')
if ($FixtureName -cnotmatch '^CrewHarnessAclFixtures-[0-9a-f]{32}$') { throw 'fixture component' }
$outer = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) $FixtureName
$sid = Get-CHAIdentity
Test-CHAChain $outer $sid $true
$proof = [System.IO.File]::ReadAllText((Join-Path $outer 'setup-evidence.json')) | ConvertFrom-Json
if ($proof.outer -cne $outer) { throw 'fixture binding' }
$name = 'hostile-' + [Guid]::NewGuid().ToString('N')
if (@(([System.IO.DirectoryInfo]::new($outer)).GetFileSystemInfos($name)).Count -ne 0) { throw 'hostile child collision' }
$root = Join-Path $outer $name
$null = [System.IO.Directory]::CreateDirectory($root, (New-CHAPrivateDescriptor $sid))
Test-CHAChain $root $sid $true
$source = Join-Path $PSScriptRoot 'tests/windows-acl-hostile.ps1'
$helper = Join-Path $root 'hostile.ps1'
[System.IO.File]::Copy($source, $helper, $false)
$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hash) { throw 'helper read-back' }
$exe = Join-Path $proof.windows_root 'System32/WindowsPowerShell/v1.0/powershell.exe'
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $proof.powershell_sha256) { throw 'test exe pin' }
$nonce = [Guid]::NewGuid().ToString('N')
$evidence = Join-Path $root 'process'
$env:CREW_ACL_TEST_HELPER = $helper
$env:CREW_ACL_TEST_HELPER_HASH = $hash
$env:CREW_ACL_TEST_EXE = $exe
$env:CREW_ACL_TEST_EXE_HASH = $proof.powershell_sha256
$env:CREW_ACL_TEST_WINDOWS = $proof.windows_root
$env:CREW_ACL_TEST_HELPER_ROOT = $root
$env:CREW_ACL_TEST_TREE_EVIDENCE = $evidence
$env:CREW_ACL_TEST_NONCE = $nonce
. 'C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1'
& 'C:/work/nova/nova-oracle-0.1.0-windows-x86_64/nova.exe' test src/windows_acl/transport_hostile_test.nv --jobs 1 --timeout 120
$testExit = $LASTEXITCODE
if ($testExit -ne 0) { exit $testExit }
foreach ($mode in @('stdout_overflow','stderr_overflow','invalid_utf8','malformed','wrong_id','wrong_protocol','nonzero','partial_sleep','parent','child')) {
    $record = [System.IO.File]::ReadAllText($evidence + '.' + $mode + '.json') | ConvertFrom-Json
    if ($record.nonce -cne $nonce -or [int]$record.pid -le 0 -or [long]$record.start_ticks -le 0) { throw 'process identity unverifiable' }
    if ($mode -eq 'parent') { if ($record.mode -cne 'tree') { throw 'parent identity mode' } }
    elseif ($record.mode -cne $mode) { throw 'process identity mode' }
    $alive = $null
    try { $alive = [System.Diagnostics.Process]::GetProcessById([int]$record.pid) }
    catch [System.ArgumentException] { }
    if ($null -ne $alive) {
        try {
            if ($alive.StartTime.ToUniversalTime().Ticks -eq [long]$record.start_ticks -and -not $alive.HasExited) { throw ('own helper still alive: ' + $mode) }
            if ($alive.StartTime.ToUniversalTime().Ticks -ne [long]$record.start_ticks) { throw 'PID reused: no kill, identity check inconclusive' }
        } finally { $alive.Dispose() }
    }
}
Write-Output 'PASS: actual helper output/UTF8/binding/nonzero/timeout negatives and recorded own parent+child identities terminated'
