param(
    [Parameter(Mandatory=$true)][ValidateSet('stdout_overflow','stderr_overflow','invalid_utf8','malformed','wrong_id','wrong_protocol','nonzero','partial_sleep','tree','child')][string]$Mode,
    [string]$Evidence = '', [string]$Nonce = '', [string]$ExeHash = ''
)
# Fixed test-only helper. Never packaged, no production endpoint/test pin seam.
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
function Save-CHAProcessIdentity([string]$Suffix) {
    if ($Nonce -cnotmatch '^[a-z0-9_-]{1,64}$' -or -not [System.IO.Path]::IsPathRooted($Evidence)) { throw 'identity arguments' }
    $me = [System.Diagnostics.Process]::GetCurrentProcess()
    $text = @{pid=$me.Id;start_ticks=$me.StartTime.ToUniversalTime().Ticks.ToString();nonce=$Nonce;mode=$Mode} | ConvertTo-Json -Compress
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($text)
    $stream = [System.IO.File]::Open($Evidence + $Suffix, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}
if ($Mode -ne 'tree' -and $Mode -ne 'child') { Save-CHAProcessIdentity ('.' + $Mode + '.json') }
switch ($Mode) {
    'stdout_overflow' {
        $bytes = [byte[]]::new(32769)
        $stream = [Console]::OpenStandardOutput()
        $stream.Write($bytes, 0, $bytes.Length); $stream.Flush()
        Start-Sleep -Seconds 30
    }
    'stderr_overflow' {
        $bytes = [byte[]]::new(32769)
        $stream = [Console]::OpenStandardError()
        $stream.Write($bytes, 0, $bytes.Length); $stream.Flush()
        Start-Sleep -Seconds 30
    }
    'invalid_utf8' { $stream = [Console]::OpenStandardOutput(); $stream.WriteByte(255); $stream.Flush() }
    'malformed' { [Console]::Out.Write('not-json') }
    'wrong_id' { [Console]::Out.Write('{"v":1,"policy":"windows-acl-v1","request_id":"wrong","op":"inspect_root","ok":true,"code":"ok","path":"C:/work/private"}') }
    'wrong_protocol' { [Console]::Out.Write('{"v":2,"policy":"windows-acl-v1","request_id":"expected","op":"inspect_root","ok":true,"code":"ok","path":"C:/work/private"}') }
    'nonzero' { exit 7 }
    'partial_sleep' { [Console]::Out.Write('{'); [Console]::Out.Flush(); Start-Sleep -Seconds 30 }
    'child' { Save-CHAProcessIdentity '.child.json'; Start-Sleep -Seconds 30 }
    'tree' {
        Save-CHAProcessIdentity '.parent.json'
        $exe = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)) 'System32/WindowsPowerShell/v1.0/powershell.exe'
        if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExeHash) { throw 'test executable pin' }
        $start = [System.Diagnostics.ProcessStartInfo]::new()
        $start.FileName = $exe
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.Arguments = '-NoLogo -NoProfile -NonInteractive -File "' + $PSCommandPath + '" -Mode child -Evidence "' + $Evidence + '" -Nonce ' + $Nonce
        $null = [System.Diagnostics.Process]::Start($start)
        Start-Sleep -Seconds 30
    }
}
