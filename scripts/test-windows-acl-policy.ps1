# In-memory policy/JSON checks and one read-only normal ancestry check. No ACL
# persistence, fixture creation, external helper launch, or chat process.
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-acl-adapter.ps1')
$script:Checks = 0
function Check-CHAFact([string]$Name, [bool]$Fact) {
    if (-not $Fact) { throw "FAIL: $Name" }
    $script:Checks++
    Write-Output "PASS: $Name"
}
function Check-CHAReject([string]$Name, [scriptblock]$Action) {
    $rejected = $false
    try { $null = & $Action } catch {
        if ($_.Exception.Message -notmatch '^CHA:') { throw }
        $rejected = $true
    }
    Check-CHAFact $Name $rejected
}
$sid = Get-CHAIdentity
$normal = '{"v":1,"request_id":"t1","op":"inspect_root","root":"C:\\work\\literal;$(data)"}'
$request = Read-CHARequest $normal
Check-CHAFact 'flat JSON exact fields and literal data' ($request.root -ceq 'C:\work\literal;$(data)')
foreach ($bad in @(
    '{}', '[]', ($normal + '{}'), $normal.Replace('"v":1', '"v":"1"'),
    $normal.Replace('"v":1', '"v":2'), $normal.Replace('"v":1', '"v":1,"v":1'),
    $normal.Replace('"v":1', '"v":1,"V":1'), $normal.Replace('"v":1', '"v":1,"extra":1'),
    $normal.Replace('"v":1', '"v":1.0'), $normal.Replace('"v":1', '"v":true'),
    $normal.Replace('"v":1', '"v":[]'), $normal.Replace('"v":1', '"v":{}'),
    $normal.Replace('"v":1', '"v":01'), $normal.Replace('"v":1', '"v":999999999999'),
    $normal.Replace('inspect_root', 'create_root'), $normal.Replace('"request_id":"t1"', '"request_id":""'),
    $normal.Replace('"v":1', '"v":1,"session":"x"'),
    ($normal.Substring(0, $normal.Length - 1) + ',}'), $normal.Substring(0, $normal.Length - 1)
)) { Check-CHAReject ('invalid/duplicate/extra/typed JSON refuses: ' + $bad) { Read-CHARequest $bad } }
foreach ($bad in @('C:relative', '\\server\share\x', '\\?\C:\work\x', 'C:\work\..\b', 'C:\work\b.', 'C:\work\b ', 'C:\work\a:b', 'C:\work\a?b', 'C:\work\SHORT~1\x', 'C:\work\a\\b')) {
    Check-CHAReject 'ambiguous path refuses' { Get-CHAPath $bad }
}
Check-CHAFact 'literal injection-looking path stays data' ((Get-CHAPath 'C:\work\literal;$(data)') -ceq 'C:\work\literal;$(data)')

$private = New-CHAPrivateDescriptor $sid
Test-CHADescriptor $private $sid $true $false
Check-CHAFact 'protected private descriptor service/SYSTEM/Administrators' $true
$wrongOwner = New-CHAPrivateDescriptor $sid
$wrongOwner.SetOwner([System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
Check-CHAReject 'private owner must be service SID' { Test-CHADescriptor $wrongOwner $sid $true $false }
$unprotected = New-CHAPrivateDescriptor $sid
$unprotected.SetAccessRuleProtection($false, $true)
Check-CHAReject 'unprotected private ACL refuses' { Test-CHADescriptor $unprotected $sid $true $false }
$broad = New-CHAPrivateDescriptor $sid
$broad.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'), [System.Security.AccessControl.FileSystemRights]::ReadAndExecute, [System.Security.AccessControl.AccessControlType]::Allow))
Check-CHAReject 'Everyone read is not private' { Test-CHADescriptor $broad $sid $true $false }
$denied = New-CHAPrivateDescriptor $sid
$denied.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($sid), [System.Security.AccessControl.FileSystemRights]::Delete, [System.Security.AccessControl.AccessControlType]::Deny))
Check-CHAReject 'private Deny complexity refuses' { Test-CHADescriptor $denied $sid $true $false }
$noService = [System.Security.AccessControl.DirectorySecurity]::new()
$noService.SetOwner([System.Security.Principal.SecurityIdentifier]::new($sid))
$noService.SetAccessRuleProtection($true, $false)
$noService.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow))
Check-CHAReject 'missing service grant refuses' { Test-CHADescriptor $noService $sid $true $false }

$tiOwner = New-CHAPrivateDescriptor $sid
$tiOwner.SetOwner([System.Security.Principal.SecurityIdentifier]::new($script:CHATrustedInstaller))
Test-CHADescriptor $tiOwner $sid $false $true
Check-CHAFact 'exact TI owner only on confirmed OS ancestor' $true
Check-CHAReject 'TI owner not on arbitrary ancestor' { Test-CHADescriptor $tiOwner $sid $false $false }
Check-CHAReject 'TI owner never private leaf' { Test-CHADescriptor $tiOwner $sid $true $true }
$tiAllow = New-CHAPrivateDescriptor $sid
$tiAllow.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($script:CHATrustedInstaller), [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow))
Check-CHAReject 'TI mutation Allow is not approved' { Test-CHADescriptor $tiAllow $sid $false $true }
Check-CHAReject 'TI Allow never private' { Test-CHADescriptor $tiAllow $sid $true $false }
$tiRead = New-CHAPrivateDescriptor $sid
$tiRead.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($script:CHATrustedInstaller), [System.Security.AccessControl.FileSystemRights]::ReadAndExecute, [System.Security.AccessControl.AccessControlType]::Allow))
Check-CHAReject 'TI read Allow is not an owner-only exception' { Test-CHADescriptor $tiRead $sid $false $true }
$tiTemplate = New-CHAPrivateDescriptor $sid
$tiTemplate.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($script:CHATrustedInstaller), [System.Security.AccessControl.FileSystemRights]::ReadAndExecute, [System.Security.AccessControl.InheritanceFlags]::ContainerInherit, [System.Security.AccessControl.PropagationFlags]::InheritOnly, [System.Security.AccessControl.AccessControlType]::Allow))
Check-CHAReject 'TI InheritOnly Allow remains unapproved' { Test-CHADescriptor $tiTemplate $sid $false $true }

$creation = New-CHAPrivateDescriptor $sid
# FileSystemAccessRule adds Synchronize to an Allow. The approved observed
# OS-volume ACE is the exact native mask 4, so construct that raw ACE explicitly.
$rawCreation = [System.Security.AccessControl.RawSecurityDescriptor]::new($creation.GetSecurityDescriptorBinaryForm(), 0)
$rawCreation.DiscretionaryAcl.InsertAce($rawCreation.DiscretionaryAcl.Count, [System.Security.AccessControl.CommonAce]::new([System.Security.AccessControl.AceFlags]::None, [System.Security.AccessControl.AceQualifier]::AccessAllowed, 4, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-11'), $false, [byte[]]@()))
$creationBytes = [byte[]]::new($rawCreation.BinaryLength)
$rawCreation.GetBinaryForm($creationBytes, 0)
$creation.SetSecurityDescriptorBinaryForm($creationBytes)
Check-CHAFact 'creation-only fixture has actual native mask 4' ($rawCreation.DiscretionaryAcl[$rawCreation.DiscretionaryAcl.Count - 1].AccessMask -eq 4)
Test-CHADescriptor $creation $sid $false $true
Check-CHAFact 'exact directory creation-only OS ancestor grant' $true
Check-CHAReject 'creation grant not a blanket ancestor allow' { Test-CHADescriptor $creation $sid $false $false }
Check-CHAReject 'creation grant not private' { Test-CHADescriptor $creation $sid $true $false }
$combinedCreation = New-CHAPrivateDescriptor $sid
$combinedCreation.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-5-11'), [System.Security.AccessControl.FileSystemRights]::CreateDirectories, [System.Security.AccessControl.AccessControlType]::Allow))
Check-CHAReject 'unapproved combined create mask is not the exact OS exception' { Test-CHADescriptor $combinedCreation $sid $false $true }
foreach ($right in @('Write', 'Delete', 'DeleteSubdirectoriesAndFiles', 'ChangePermissions', 'TakeOwnership', 'WriteAttributes', 'WriteExtendedAttributes', 'CreateFiles')) {
    $danger = New-CHAPrivateDescriptor $sid
    $danger.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-5-11'), [System.Security.AccessControl.FileSystemRights]$right, [System.Security.AccessControl.AccessControlType]::Allow))
    Check-CHAReject 'dangerous ancestor mutation refuses' { Test-CHADescriptor $danger $sid $false $true }
}
$inheritOnly = New-CHAPrivateDescriptor $sid
$inheritOnly.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'), [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.InheritanceFlags]::ContainerInherit, [System.Security.AccessControl.PropagationFlags]::InheritOnly, [System.Security.AccessControl.AccessControlType]::Allow))
Test-CHADescriptor $inheritOnly $sid $false $false
Check-CHAFact 'InheritOnly does not grant on existing ancestor' $true
Check-CHAReject 'InheritOnly stranger not private root' { Test-CHADescriptor $inheritOnly $sid $true $false }

foreach ($templateMask in @(-1610612736, -536805376)) {
    $template = New-CHAPrivateDescriptor $sid
    $rawTemplate = [System.Security.AccessControl.RawSecurityDescriptor]::new($template.GetSecurityDescriptorBinaryForm(), 0)
    $rawTemplate.DiscretionaryAcl.InsertAce($rawTemplate.DiscretionaryAcl.Count, [System.Security.AccessControl.CommonAce]::new([System.Security.AccessControl.AceFlags]11, [System.Security.AccessControl.AceQualifier]::AccessAllowed, $templateMask, [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'), $false, [byte[]]@()))
    $templateBytes = [byte[]]::new($rawTemplate.BinaryLength)
    $rawTemplate.GetBinaryForm($templateBytes, 0)
    $template.SetSecurityDescriptorBinaryForm($templateBytes)
    Test-CHADescriptor $template $sid $false $false
    Check-CHAFact 'known GENERIC inheritance template is not an existing ancestor grant' $true
    Check-CHAReject 'GENERIC inheritance template does not make a private root safe' { Test-CHADescriptor $template $sid $true $false }
    $rawTemplate.DiscretionaryAcl[$rawTemplate.DiscretionaryAcl.Count - 1].AceFlags = [System.Security.AccessControl.AceFlags]::None
    $rawTemplate.GetBinaryForm($templateBytes, 0)
    $template.SetSecurityDescriptorBinaryForm($templateBytes)
    Check-CHAReject 'applicable GENERIC permissions remain unsupported' { Test-CHADescriptor $template $sid $false $false }
}

# Raw descriptor facade preserves adversarial layouts that DirectorySecurity
# may normalize in memory. No descriptor is persisted to a filesystem object.
function New-CHARawPolicyFixture($Raw, [string]$OwnerSid) {
    $fixture = [PSCustomObject]@{
        Raw = $Raw; OwnerSid = $OwnerSid
        AreAccessRulesProtected = $true; AreAccessRulesCanonical = $true
    }
    $fixture | Add-Member ScriptMethod GetOwner {
        param($TargetType)
        return [System.Security.Principal.SecurityIdentifier]::new($this.OwnerSid)
    }
    $fixture | Add-Member ScriptMethod GetSecurityDescriptorBinaryForm {
        $bytes = [byte[]]::new($this.Raw.BinaryLength)
        $this.Raw.GetBinaryForm($bytes, 0)
        return ,$bytes
    }
    return $fixture
}
foreach ($layout in @('null', 'empty')) {
    $rawBad = [System.Security.AccessControl.RawSecurityDescriptor]::new((New-CHAPrivateDescriptor $sid).GetSecurityDescriptorBinaryForm(), 0)
    if ($layout -eq 'null') { $rawBad.DiscretionaryAcl = $null }
    else { $rawBad.DiscretionaryAcl = [System.Security.AccessControl.RawAcl]::new(2, 0) }
    $fixture = New-CHARawPolicyFixture $rawBad $sid
    Check-CHAReject ($layout + ' raw DACL refuses private') { Test-CHADescriptor $fixture $sid $true $false }
    Check-CHAReject ($layout + ' raw DACL refuses ancestor') { Test-CHADescriptor $fixture $sid $false $false }
}
foreach ($kind in @('callback', 'object', 'unknown', 'unknown_bits', 'unknown_bits_inherit_only', 'inherited_private')) {
    $rawBad = [System.Security.AccessControl.RawSecurityDescriptor]::new((New-CHAPrivateDescriptor $sid).GetSecurityDescriptorBinaryForm(), 0)
    $principal = [System.Security.Principal.SecurityIdentifier]::new($sid)
    $ace = switch ($kind) {
        'callback' { [System.Security.AccessControl.CommonAce]::new([System.Security.AccessControl.AceFlags]::None, [System.Security.AccessControl.AceQualifier]::AccessAllowed, 1, $principal, $true, [byte[]]@()) }
        'object' { [System.Security.AccessControl.ObjectAce]::new([System.Security.AccessControl.AceFlags]::None, [System.Security.AccessControl.AceQualifier]::AccessAllowed, 1, $principal, [System.Security.AccessControl.ObjectAceFlags]::None, [Guid]::Empty, [Guid]::Empty, $false, [byte[]]@()) }
        'unknown' { [System.Security.AccessControl.CustomAce]::new([System.Enum]::ToObject([System.Security.AccessControl.AceType], [byte]127), [System.Security.AccessControl.AceFlags]::None, [byte[]]@()) }
        'unknown_bits' { [System.Security.AccessControl.CommonAce]::new([System.Security.AccessControl.AceFlags]::None, [System.Security.AccessControl.AceQualifier]::AccessAllowed, 512, $principal, $false, [byte[]]@()) }
        'unknown_bits_inherit_only' { [System.Security.AccessControl.CommonAce]::new([System.Security.AccessControl.AceFlags]11, [System.Security.AccessControl.AceQualifier]::AccessAllowed, 512, $principal, $false, [byte[]]@()) }
        'inherited_private' { [System.Security.AccessControl.CommonAce]::new([System.Security.AccessControl.AceFlags]::Inherited, [System.Security.AccessControl.AceQualifier]::AccessAllowed, 1, $principal, $false, [byte[]]@()) }
    }
    $rawBad.DiscretionaryAcl.InsertAce($rawBad.DiscretionaryAcl.Count, $ace)
    $fixture = New-CHARawPolicyFixture $rawBad $sid
    Check-CHAReject ($kind + ' refuses protected private descriptor') { Test-CHADescriptor $fixture $sid $true $false }
    if ($kind -ne 'inherited_private') {
        Check-CHAReject ($kind + ' refuses ancestor descriptor') { Test-CHADescriptor $fixture $sid $false $false }
    }
}

Test-CHAChain $env:LOCALAPPDATA $sid $false
Check-CHAFact 'actual normal Local ancestry without Temp passes read-only' $true
Write-Output "Policy checks passed: $script:Checks"
