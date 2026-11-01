# Creates exactly ONE authorised unique outer fixture directly under Local.
# Never adopts a collision, repairs existing ACLs, discovers fallback roots,
# changes a live directory or starts a chat. Leaves its private evidence intact.
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-acl-adapter.ps1')
$sid = Get-CHAIdentity
$local = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
Test-CHAChain $local $sid $false
$name = 'CrewHarnessAclFixtures-' + [Guid]::NewGuid().ToString('N')
$parent = [System.IO.DirectoryInfo]::new($local)
if (@($parent.GetFileSystemInfos($name)).Count -ne 0) { throw 'fixture collision: STOP' }
$outer = [System.IO.Path]::Combine($local, $name)
$null = [System.IO.Directory]::CreateDirectory($outer, (New-CHAPrivateDescriptor $sid))
Write-Output ('PRIVATE_FIXTURE=' + $outer)
Test-CHAChain $outer $sid $true

function New-CHAOwnedFixtureChild([string]$ParentPath, [string]$Name) {
    $parentNode = [System.IO.DirectoryInfo]::new($ParentPath)
    if (@($parentNode.GetFileSystemInfos($Name)).Count -ne 0) { throw 'fixture child collision: STOP' }
    $path = [System.IO.Path]::Combine($ParentPath, $Name)
    $null = [System.IO.Directory]::CreateDirectory($path, (New-CHAPrivateDescriptor $sid))
    Test-CHAChain $path $sid $true
    return $path
}
$root = New-CHAOwnedFixtureChild $outer 'neutral'
$assetRoot = New-CHAOwnedFixtureChild $outer 'asset'
$tools = New-CHAOwnedFixtureChild $assetRoot 'tools'
$windowsTools = New-CHAOwnedFixtureChild $tools 'windows'
$asset = Join-Path $windowsTools 'projectless-acl.ps1'
[System.IO.File]::Copy((Join-Path $PSScriptRoot 'windows-acl-adapter.ps1'), $asset, $false)
$scriptHash = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedHash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'windows-acl-adapter.ps1') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($scriptHash -cne $expectedHash) { throw 'asset read-back hash mismatch' }
$manifest = @{ v = 1; policy = 'windows-acl-v1'; sha256 = $scriptHash } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $windowsTools 'projectless-acl.json'), $manifest, [System.Text.UTF8Encoding]::new($false))
# Actual native setup proof: inspect ACLs of installed files, not only hashes.
foreach ($file in @($asset, (Join-Path $windowsTools 'projectless-acl.json'))) {
    $info = [System.IO.FileInfo]::new($file)
    if (($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'asset file reparse' }
    $acl = $info.GetAccessControl()
    if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid) { throw 'asset file owner' }
    $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
    if ($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -eq 0 -or -not $acl.AreAccessRulesCanonical) { throw 'asset file DACL' }
    foreach ($ace in $raw.DiscretionaryAcl) {
        if ($ace -isnot [System.Security.AccessControl.CommonAce] -or $ace.IsCallback -or $ace.AceQualifier -ne [System.Security.AccessControl.AceQualifier]::AccessAllowed -or @($sid, 'S-1-5-18', 'S-1-5-32-544') -notcontains $ace.SecurityIdentifier.Value) { throw 'asset file unexpected ACE' }
    }
}
Test-CHAChain $assetRoot $sid $true
$windowsRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
$exe = Join-Path $windowsRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$exeInfo = [System.IO.FileInfo]::new($exe)
if (-not $exeInfo.Exists -or ($exeInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'OS executable metadata' }
$node = $exeInfo.Directory
while ($null -ne $node) {
    if (($node.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'OS executable ancestor reparse' }
    $node = $node.Parent
}
$signature = Get-AuthenticodeSignature -LiteralPath $exe
if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) { throw 'OS executable signature unverified' }
$exeHash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()

$reply = Invoke-CHARequest (Read-CHARequest (@{v=1;request_id='real1';op='inspect_root';root=$root} | ConvertTo-Json -Compress))
if (-not $reply.ok) { throw 'real inspect root failed' }
$reply = Invoke-CHARequest (Read-CHARequest (@{v=1;request_id='real2';op='create_session';root=$root;session='new-session'} | ConvertTo-Json -Compress))
if (-not $reply.ok) { throw 'real create failed' }
Test-CHAChain (Join-Path $root 'new-session') $sid $true
$before = (Get-Acl -LiteralPath (Join-Path $root 'new-session')).Sddl
$refused = $false
try { $null = Invoke-CHARequest (Read-CHARequest (@{v=1;request_id='real3';op='create_session';root=$root;session='new-session'} | ConvertTo-Json -Compress)) }
catch { if ($_.Exception.Message -cne 'CHA:session_exists') { throw }; $refused = $true }
if (-not $refused -or (Get-Acl -LiteralPath (Join-Path $root 'new-session')).Sddl -cne $before) { throw 'existing child not refused unchanged' }

$aclBytes = ([System.IO.DirectoryInfo]::new($assetRoot)).GetAccessControl().GetSecurityDescriptorBinaryForm()
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $aclHash = ([BitConverter]::ToString($sha.ComputeHash($aclBytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
$proof = [ordered]@{
    installation_id = [Guid]::NewGuid().ToString('N'); asset_root = $assetRoot
    physical_asset_root = $assetRoot; private_acl_sha256 = $aclHash
    windows_root = $windowsRoot; powershell_sha256 = $exeHash
    neutral_root = $root; outer = $outer
}
[System.IO.File]::WriteAllText((Join-Path $outer 'setup-evidence.json'), ($proof | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
Write-Output 'PASS: native setup owner/DACL/ancestry + exact asset hash + signed OS executable'
Write-Output 'PASS: real inspect/create/read-back and existing child refused unchanged'
Write-Output ('PRIVATE_FIXTURE=' + $outer)
