param([Parameter(Mandatory=$true)][string]$FixtureName)
# Reuses ONLY the exact fixture we created, never discovers/adopts another.
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-acl-adapter.ps1')
if ($FixtureName -cnotmatch '^CrewHarnessAclFixtures-[0-9a-f]{32}$') { throw 'fixture component' }
$outer = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) $FixtureName
$sid = Get-CHAIdentity
Test-CHAChain $outer $sid $true
$proofPath = Join-Path $outer 'setup-evidence.json'
$proof = [System.IO.File]::ReadAllText($proofPath) | ConvertFrom-Json
if ($proof.outer -cne $outer) { throw 'setup fixture binding' }
Test-CHAChain $proof.asset_root $sid $true
Test-CHAChain $proof.neutral_root $sid $true
$oldAsset = Join-Path $proof.asset_root 'tools/windows/projectless-acl.ps1'
$oldManifest = [System.IO.File]::ReadAllText((Join-Path $proof.asset_root 'tools/windows/projectless-acl.json')) | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $oldAsset -Algorithm SHA256).Hash.ToLowerInvariant() -cne $oldManifest.sha256) { throw 'original setup asset changed' }
$exe = Join-Path $proof.windows_root 'System32/WindowsPowerShell/v1.0/powershell.exe'
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $proof.powershell_sha256) { throw 'setup executable changed' }
$env:CREW_ACL_TEST_SESSION = 'native-' + [Guid]::NewGuid().ToString('N')
function New-CHAInstallTestDirectory([string]$Parent, [string]$Component) {
    if (@(([System.IO.DirectoryInfo]::new($Parent)).GetFileSystemInfos($Component)).Count -ne 0) { throw 'new install test collision' }
    $path = Join-Path $Parent $Component
    $null = [System.IO.Directory]::CreateDirectory($path, (New-CHAPrivateDescriptor $sid))
    Test-CHAChain $path $sid $true
    return $path
}
# Each tested source snapshot gets a NEW private installation; never overwrite
# the original checked asset/evidence or adopt an existing object as a fixture.
$current = New-CHAInstallTestDirectory $outer ('install-current-' + [Guid]::NewGuid().ToString('N'))
$currentTools = New-CHAInstallTestDirectory $current 'tools'
$currentWindows = New-CHAInstallTestDirectory $currentTools 'windows'
$asset = Join-Path $currentWindows 'projectless-acl.ps1'
[System.IO.File]::Copy((Join-Path $PSScriptRoot 'windows-acl-adapter.ps1'), $asset, $false)
[System.IO.File]::Copy((Join-Path $PSScriptRoot 'windows-acl-adapter.json'), (Join-Path $currentWindows 'projectless-acl.json'), $false)
$expected = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'windows-acl-adapter.ps1') -Algorithm SHA256).Hash
if ((Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash -cne $expected) { throw 'new installation read-back' }
foreach ($file in @($asset, (Join-Path $currentWindows 'projectless-acl.json'))) {
    $acl = (Get-Item -LiteralPath $file).GetAccessControl()
    if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid -or -not $acl.AreAccessRulesCanonical) { throw 'new asset owner/DACL' }
    $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
    if ($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -eq 0) { throw 'new asset null/empty DACL' }
    foreach ($ace in $raw.DiscretionaryAcl) {
        if ($ace -isnot [System.Security.AccessControl.CommonAce] -or $ace.IsCallback -or $ace.AceQualifier -ne [System.Security.AccessControl.AceQualifier]::AccessAllowed -or @($sid,'S-1-5-18','S-1-5-32-544') -notcontains $ace.SecurityIdentifier.Value) { throw 'new asset ACE' }
    }
}
$proof.asset_root = $current
$proof.physical_asset_root = $current
$proof.installation_id = [Guid]::NewGuid().ToString('N')
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $proof.private_acl_sha256 = ([BitConverter]::ToString($sha.ComputeHash(([System.IO.DirectoryInfo]::new($current)).GetAccessControl().GetSecurityDescriptorBinaryForm()))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
$currentProof = Join-Path $current 'setup-evidence.json'
[System.IO.File]::WriteAllText($currentProof, ($proof | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
$env:CREW_ACL_TEST_SETUP = $currentProof
$installCases = New-CHAInstallTestDirectory $outer ('install-negative-' + [Guid]::NewGuid().ToString('N'))
foreach ($kind in @('script', 'version')) {
    $caseRoot = New-CHAInstallTestDirectory $installCases $kind
    $tools = New-CHAInstallTestDirectory $caseRoot 'tools'
    $win = New-CHAInstallTestDirectory $tools 'windows'
    if ($kind -eq 'script') {
        [System.IO.File]::WriteAllText((Join-Path $win 'projectless-acl.ps1'), '# deliberately wrong fixture bytes')
    } else { [System.IO.File]::Copy($asset, (Join-Path $win 'projectless-acl.ps1'), $false) }
    $manifest = @{v=1;policy='windows-acl-v1';sha256=$expected.ToLowerInvariant()}
    if ($kind -eq 'version') { $manifest.v = 2 }
    [System.IO.File]::WriteAllText((Join-Path $win 'projectless-acl.json'), ($manifest | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
    [Environment]::SetEnvironmentVariable(('CREW_ACL_TEST_BAD_' + $kind.ToUpperInvariant()), $caseRoot, 'Process')
}
$fakeWindows = New-CHAInstallTestDirectory $installCases 'fake-windows'
$system = New-CHAInstallTestDirectory $fakeWindows 'System32'
$powershell = New-CHAInstallTestDirectory $system 'WindowsPowerShell'
$versionDir = New-CHAInstallTestDirectory $powershell 'v1.0'
[System.IO.File]::WriteAllText((Join-Path $versionDir 'powershell.exe'), 'MZ synthetic non-executable pin-negative fixture')
$env:CREW_ACL_TEST_BAD_EXE = $fakeWindows
. 'C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1'
& 'C:/work/nova/nova-oracle-0.1.0-windows-x86_64/nova.exe' test src/windows_acl_runtime_tests/transport_test.nv --jobs 1 --timeout 120
exit $LASTEXITCODE
