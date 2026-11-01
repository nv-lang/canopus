# Runtime asset for the explicitly trusted Windows ACL boundary (269).
# No chat/ACP launch, project environment, policy repair, or root discovery.
# Dot-sourcing this fixed source defines functions for its own unit fixtures.
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
$script:CHAProtocol = 1
$script:CHAPolicy = 'windows-acl-v1'
$script:CHATrustedInstaller = 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
$script:CHAInputLimit = 32768

function Stop-CHA([string]$Code) { throw [System.InvalidOperationException]::new("CHA:$Code") }

function Read-CHARequest([string]$Text) {
    # The protocol is deliberately flat. Tokenize before decoding so duplicate
    # or case-aliased keys cannot disappear inside ConvertFrom-Json.
    $stringToken = [regex]::new('\G"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"')
    $numberToken = [regex]::new('\G-?(?:0|[1-9][0-9]*)')
    $i = 0
    $values = @{}
    $keys = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    while ($i -lt $Text.Length -and [char]::IsWhiteSpace($Text[$i])) { $i++ }
    if ($i -ge $Text.Length -or $Text[$i] -ne '{') { Stop-CHA 'invalid_json' }
    $i++
    $first = $true
    while ($true) {
        while ($i -lt $Text.Length -and [char]::IsWhiteSpace($Text[$i])) { $i++ }
        if ($i -ge $Text.Length) { Stop-CHA 'invalid_json' }
        if ($Text[$i] -eq '}') {
            if (-not $first) { Stop-CHA 'invalid_json' }
            $i++
            break
        }
        $keyToken = $stringToken.Match($Text, $i)
        if (-not $keyToken.Success) { Stop-CHA 'invalid_json' }
        $key = (ConvertFrom-Json -InputObject ('{"x":' + $keyToken.Value + '}')).x
        if (@('v', 'request_id', 'op', 'root', 'session') -cnotcontains $key) { Stop-CHA 'extra_field' }
        if (-not $keys.Add($key)) { Stop-CHA 'duplicate_field' }
        $i += $keyToken.Length
        while ($i -lt $Text.Length -and [char]::IsWhiteSpace($Text[$i])) { $i++ }
        if ($i -ge $Text.Length -or $Text[$i] -ne ':') { Stop-CHA 'invalid_json' }
        $i++
        while ($i -lt $Text.Length -and [char]::IsWhiteSpace($Text[$i])) { $i++ }
        $token = $stringToken.Match($Text, $i)
        if ($token.Success) {
            $values[$key] = (ConvertFrom-Json -InputObject ('{"x":' + $token.Value + '}')).x
        } else {
            $token = $numberToken.Match($Text, $i)
            $number = 0
            if (-not $token.Success -or -not [int]::TryParse($token.Value, [ref]$number)) { Stop-CHA 'invalid_json' }
            $values[$key] = $number
        }
        $i += $token.Length
        while ($i -lt $Text.Length -and [char]::IsWhiteSpace($Text[$i])) { $i++ }
        if ($i -ge $Text.Length) { Stop-CHA 'invalid_json' }
        if ($Text[$i] -eq '}') { $i++; break }
        if ($Text[$i] -ne ',') { Stop-CHA 'invalid_json' }
        $i++
        $first = $false
    }
    while ($i -lt $Text.Length -and [char]::IsWhiteSpace($Text[$i])) { $i++ }
    if ($i -ne $Text.Length) { Stop-CHA 'invalid_json' }
    foreach ($key in @('v', 'request_id', 'op', 'root')) {
        if (-not $values.ContainsKey($key)) { Stop-CHA 'missing_field' }
    }
    if ($values.v -isnot [int] -or $values.v -ne $script:CHAProtocol) { Stop-CHA 'version' }
    foreach ($key in @('request_id', 'op', 'root')) {
        if ($values[$key] -isnot [string]) { Stop-CHA 'field_type' }
    }
    if ($values.request_id -cnotmatch '^[A-Za-z0-9_-]{1,64}$') { Stop-CHA 'request_id' }
    if (@('inspect_root', 'inspect_session', 'create_session') -cnotcontains $values.op) { Stop-CHA 'operation' }
    if ($values.op -eq 'inspect_root') {
        if ($values.ContainsKey('session')) { Stop-CHA 'extra_field' }
    } else {
        if (-not $values.ContainsKey('session') -or $values.session -isnot [string] -or $values.session -cnotmatch '^[a-z0-9][a-z0-9_-]{0,63}$') { Stop-CHA 'session_component' }
    }
    return $values
}

function Get-CHAPath([string]$Path) {
    # No provider syntax, drive-relative paths, UNC/devices, ADS, 8.3 aliases,
    # dot traversal, trailing-dot/space ambiguity, or wildcard expansion.
    if ($Path.Length -gt 4096 -or $Path -cnotmatch '^[A-Za-z]:[\\/]') { Stop-CHA 'path_format' }
    $rest = $Path.Substring(3).Replace('/', '\')
    foreach ($part in $rest.Split('\')) {
        if ($part.Length -eq 0 -or $part -eq '.' -or $part -eq '..' -or $part.EndsWith('.') -or $part.EndsWith(' ') -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '~[0-9]') { Stop-CHA 'path_alias' }
    }
    $full = [System.IO.Path]::GetFullPath($Path)
    if ([StringComparer]::OrdinalIgnoreCase.Equals($full, [System.IO.Path]::GetPathRoot($full))) { Stop-CHA 'volume_root' }
    return $full.TrimEnd('\')
}

function Get-CHAIdentity {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    if ($null -eq $identity.User) { Stop-CHA 'identity_unknown' }
    return $identity.User.Value
}

function Test-CHADescriptor($Acl, [string]$ServiceSid, [bool]$Private, [bool]$OsVolumeRoot) {
    $trusted = @($ServiceSid, 'S-1-5-18', 'S-1-5-32-544')
    $owner = $Acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    if ($Private) {
        if ($owner -ne $ServiceSid) { Stop-CHA 'owner_private' }
        if (-not $Acl.AreAccessRulesProtected) { Stop-CHA 'acl_unprotected' }
    } elseif (($trusted -notcontains $owner) -and -not ($OsVolumeRoot -and $owner -eq $script:CHATrustedInstaller)) {
        Stop-CHA 'owner_ancestor'
    }
    if (-not $Acl.AreAccessRulesCanonical) { Stop-CHA 'acl_noncanonical' }
    $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($Acl.GetSecurityDescriptorBinaryForm(), 0)
    if ($null -eq $raw.DiscretionaryAcl) { Stop-CHA 'acl_null' }
    if ($raw.DiscretionaryAcl.Count -eq 0) { Stop-CHA 'acl_empty' }
    $serviceFull = $false
    foreach ($ace in $raw.DiscretionaryAcl) {
        if ($ace -isnot [System.Security.AccessControl.CommonAce] -or $ace.IsCallback) { Stop-CHA 'ace_unsupported' }
        $flags = [int]$ace.AceFlags
        $mask = $ace.AccessMask
        if (($flags -band (-bnot 31)) -ne 0) { Stop-CHA 'ace_unsupported' }
        if (@([System.Security.AccessControl.AceQualifier]::AccessAllowed, [System.Security.AccessControl.AceQualifier]::AccessDenied) -notcontains $ace.AceQualifier) { Stop-CHA 'ace_unsupported' }
        if (-not $Private -and ($flags -band 8) -ne 0) {
            # Windows OS ancestors contain non-applicable inheritance templates
            # with GENERIC_* masks (the high four bits, signed in .NET). These
            # are known rights, not grants on this existing directory. Reject
            # every other unknown bit; do not map/accept applicable GENERIC ACEs.
            $knownTemplate = (-268435456) -bor 2032127
            if (($mask -band (-bnot $knownTemplate)) -ne 0) { Stop-CHA 'ace_unsupported' }
            continue
        }
        if (($mask -band (-bnot 2032127)) -ne 0 -or $mask -lt 0) { Stop-CHA 'ace_unsupported' }
        if ($Private -and ($flags -band 16) -ne 0) { Stop-CHA 'ace_inherited' }
        $sid = $ace.SecurityIdentifier.Value
        if ($Private) {
            if ($ace.AceQualifier -ne [System.Security.AccessControl.AceQualifier]::AccessAllowed) { Stop-CHA 'ace_deny_private' }
            if ($trusted -notcontains $sid) { Stop-CHA 'ace_private_principal' }
            if ($sid -eq $ServiceSid -and ($flags -band 8) -eq 0 -and ($mask -band 2032127) -eq 2032127) { $serviceFull = $true }
        } else {
            # InheritOnly does not grant on this already-existing ancestor.
            if (($flags -band 8) -ne 0 -or $ace.AceQualifier -eq [System.Security.AccessControl.AceQualifier]::AccessDenied) { continue }
            if ($trusted -contains $sid) { continue }
            # TI is an OWNER exception only. No new TI DACL trust is implied.
            $mutation = 2 -bor 4 -bor 16 -bor 64 -bor 256 -bor 65536 -bor 262144 -bor 524288
            if (($mask -band $mutation) -ne 0) {
                # Exactly the observed directory CreateDirectories-only ACE on
                # the confirmed OS volume root, not a private root/leaf grant.
                if ($OsVolumeRoot -and $mask -eq 4 -and $flags -eq 0) { continue }
                Stop-CHA 'ace_ancestor_mutation'
            }
        }
    }
    if ($Private -and -not $serviceFull) { Stop-CHA 'service_grant_missing' }
}

function Test-CHANode([System.IO.DirectoryInfo]$Node, [string]$ServiceSid, [bool]$Private) {
    $Node.Refresh()
    if (-not $Node.Exists) { Stop-CHA 'directory_missing' }
    if (($Node.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-CHA 'path_reparse' }
    if (($Node.Attributes -band [System.IO.FileAttributes]::Directory) -eq 0) { Stop-CHA 'not_directory' }
    # Missing markers are established by a successful literal-name enumeration;
    # File/Directory.Exists would silently turn access errors into absence.
    if (@($Node.GetFileSystemInfos('.git')).Count -gt 0) { Stop-CHA 'git_ancestor' }
    if (@($Node.GetFileSystemInfos('HEAD')).Count -gt 0 -and @($Node.GetFileSystemInfos('config')).Count -gt 0 -and @($Node.GetFileSystemInfos('objects')).Count -gt 0) { Stop-CHA 'bare_git_ancestor' }
    $sections = [System.Security.AccessControl.AccessControlSections]::Access -bor [System.Security.AccessControl.AccessControlSections]::Owner
    $acl = $Node.GetAccessControl($sections)
    $osRoot = [System.IO.Path]::GetPathRoot([Environment]::GetFolderPath([Environment+SpecialFolder]::Windows))
    $isOsRoot = [StringComparer]::OrdinalIgnoreCase.Equals($Node.FullName, $osRoot)
    Test-CHADescriptor $acl $ServiceSid $Private $isOsRoot
}

function Test-CHAChain([string]$Path, [string]$ServiceSid, [bool]$Private) {
    $node = [System.IO.DirectoryInfo]::new($Path)
    $first = $true
    while ($null -ne $node) {
        Test-CHANode $node $ServiceSid ($first -and $Private)
        $first = $false
        $node = $node.Parent
    }
}

function New-CHAPrivateDescriptor([string]$ServiceSid) {
    $security = [System.Security.AccessControl.DirectorySecurity]::new()
    $security.SetAccessRuleProtection($true, $false)
    $security.SetOwner([System.Security.Principal.SecurityIdentifier]::new($ServiceSid))
    foreach ($sid in @($ServiceSid, 'S-1-5-18', 'S-1-5-32-544') | Select-Object -Unique) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($sid), [System.Security.AccessControl.FileSystemRights]::FullControl, ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit), [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
        $security.AddAccessRule($rule)
    }
    return $security
}

function Invoke-CHARequest($Request) {
    $root = Get-CHAPath $Request.root
    $service = Get-CHAIdentity
    Test-CHAChain $root $service $true
    $path = $root
    if ($Request.op -ne 'inspect_root') {
        $parent = [System.IO.DirectoryInfo]::new($root)
        $path = [System.IO.Path]::Combine($root, $Request.session)
        if ($Request.op -eq 'create_session') {
            if (@($parent.GetFileSystemInfos($Request.session)).Count -ne 0) { Stop-CHA 'session_exists' }
            # Only this new direct child. Never SetAccessControl on an existing
            # object, never repair an insecure root. Parent is already private.
            $created = [System.IO.Directory]::CreateDirectory($path, (New-CHAPrivateDescriptor $service))
            if (-not [StringComparer]::OrdinalIgnoreCase.Equals($created.FullName, $path)) { Stop-CHA 'created_path_mismatch' }
        }
        Test-CHAChain $path $service $true
        # Root stays private, not merely a weakly checked ancestor of the leaf.
        Test-CHAChain $root $service $true
    }
    return [ordered]@{ v = $script:CHAProtocol; policy = $script:CHAPolicy; request_id = $Request.request_id; op = $Request.op; ok = $true; code = 'ok'; path = $path }
}

function Invoke-CHAMain {
    $requestId = ''
    $operation = ''
    try {
        if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -lt 1) { Stop-CHA 'host_version' }
        $inputStream = [Console]::OpenStandardInput()
        $buffer = [System.IO.MemoryStream]::new()
        try {
            while ($true) {
                $b = $inputStream.ReadByte()
                if ($b -lt 0) { break }
                if ($buffer.Length -ge $script:CHAInputLimit) { Stop-CHA 'input_too_large' }
                $buffer.WriteByte([byte]$b)
            }
            $text = [System.Text.UTF8Encoding]::new($false, $true).GetString($buffer.ToArray())
        } finally { $buffer.Dispose() }
        $request = Read-CHARequest $text
        $requestId = $request.request_id
        $operation = $request.op
        $reply = Invoke-CHARequest $request
        $exitCode = 0
    } catch {
        $message = $_.Exception.Message
        $code = if ($message -cmatch '^CHA:([a-z0-9_]+)$') { $Matches[1] } else { 'inspection_unverifiable' }
        $reply = [ordered]@{ v = $script:CHAProtocol; policy = $script:CHAPolicy; request_id = $requestId; op = $operation; ok = $false; code = $code }
        $exitCode = 1
    }
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::Out.WriteLine(($reply | ConvertTo-Json -Depth 3 -Compress))
    exit $exitCode
}

if ($MyInvocation.InvocationName -ne '.') { Invoke-CHAMain }
