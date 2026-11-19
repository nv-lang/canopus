# Runs a Nova toolchain (Oracle 0.1.6 or newer) with the environment of its own kit.
# Changes nothing outside the process: PATH and the Nova variables live for this run only.
#   powershell -File scripts/toolchain-016.ps1 -NovaHome C:/work/nova-oracle-0.1.6-windows-x86_64 -Rest "check src/server/hub.nv --color never"
param(
    [Parameter(Mandatory = $true)][string]$NovaHome,
    [string]$Rest = "check src/server/hub.nv --color never"
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding
$compiler = Join-Path $NovaHome 'nova.exe'
$versionText = & $compiler --version
if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^nova (\d+\.\d+\.\d+)') { throw 'Cannot identify the Nova toolchain' }
if ([version]$Matches[1] -lt [version]'0.1.6') { throw 'Nova Oracle 0.1.6 or newer is required' }
. (Join-Path $NovaHome 'setup-env.ps1') 6>$null
$ErrorActionPreference = 'Continue'
& $compiler $Rest.Split(' ', [StringSplitOptions]::RemoveEmptyEntries) 2>&1 | ForEach-Object { $_.ToString() }
exit $LASTEXITCODE
