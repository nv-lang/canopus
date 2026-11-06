# Explicit PostgreSQL setup and application launch. No environment configuration layer.
# -Config chooses the application file; secrets.json is adjacent. This command explicitly starts Docker PostgreSQL.
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if ([string]::IsNullOrWhiteSpace($Config)) { $Config = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.canopus/config.json' }
$Config = [IO.Path]::GetFullPath($Config)
$secretFile = Join-Path (Split-Path -Parent $Config) 'secrets.json'
if (Test-Path -LiteralPath $Config) {
    $settings = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($settings.store -ne 'pg') { throw 'The selected config does not choose store pg. Change it explicitly before running PostgreSQL setup.' }
}
$front = Join-Path $root 'target/canopus.exe'
$hub = Join-Path $root 'target/canopus-hub.exe'
foreach ($binary in @($front, $hub)) { if (-not (Test-Path -LiteralPath $binary)) { throw 'Build canopus.exe and canopus-hub.exe before launching.' } }
$db = Join-Path $root 'src/pg/db.ps1'
& powershell -NoProfile -File $db up -Config $secretFile
if ($LASTEXITCODE -ne 0) { exit 1 }
& powershell -NoProfile -File $db serve-config -Config $secretFile -Out $Config
if ($LASTEXITCODE -ne 0) { exit 1 }
& $front --config $Config
exit $LASTEXITCODE
