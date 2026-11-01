param(
    [Parameter(Mandatory = $true)][string]$Snapshot,
    [Parameter(Mandatory = $true)][string]$NovaHome
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$exact = (& git -C $root rev-parse --verify "$Snapshot^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $exact -notmatch '^[0-9a-f]{40}$') { throw 'Expected an exact existing commit' }
$sandbox = Join-Path (Join-Path $env:LOCALAPPDATA 'Temp/opencode') ('crew-275-common-' + $exact.Substring(0, 12) + '-' + $PID)
if (Test-Path $sandbox) { throw 'Refusing to replace an existing sandbox' }
New-Item -ItemType Directory -Path $sandbox | Out-Null
$archive = Join-Path $sandbox 'source.tar'
& git -C $root archive --format=tar --output=$archive $exact
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$tar = Join-Path $env:SystemRoot 'System32/tar.exe'
if (-not (Test-Path $tar)) { throw 'Native Windows tar.exe is required for drive-letter paths' }
& $tar -xf $archive -C $sandbox
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output ('275 exact common snapshot: ' + $exact)
Write-Output 'Scope: only server_workspace_live; immutable git archive, not main/live or a new working tree'
Set-Location $sandbox
. (Join-Path $NovaHome 'setup-env.ps1')
& (Join-Path $NovaHome 'nova.exe') test src/server_workspace_live --jobs 1 --timeout 600 -v
$result = $LASTEXITCODE
Set-Location $root
exit $result
