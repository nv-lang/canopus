# run-pg.ps1 - the session server on the permanent PostgreSQL in Docker, with one command (task 115).
#
#   powershell -File src/server/run-pg.ps1                  database up (src/pg/db.ps1 up), settings of the server, then `canopus serve`
#   powershell -File src/server/run-pg.ps1 -ServerPort 8100 another port of the page (default: the file, 8099)
#   powershell -File src/server/run-pg.ps1 -Agent "node src/acp/testdata/fake_agent.mjs --live"   another agent (CANOPUS_SERVER_AGENT)
#
# Run it from a normal console window, not hidden and not through a launcher without a console (the programs start child
# processes; see src/server/README.md). Ctrl+C stops the server; the database stays up (`db.ps1 down` stops it).
#
# What it does: (1) `db.ps1 up` (the container canopus-pg and the volume canopus-pg-data; Docker not running: a message and
# exit 1); (2) checks that target/canopus-hub.exe and target/canopus.exe are built and says the two `nova build` commands if not;
# (3) makes the settings file of the server (`db.ps1 serve-config`, kept if it exists); (4) puts the password of the login
# canopus_service from the settings file of the database (outside the repository) into the environment of THIS process only
# (CANOPUS_PG_PASSWORD) and starts the server. The password is not printed, not written to a log and not on a command line.
param(
    [int]$ServerPort = 0,
    [string]$Agent = '',
    [string]$Config = '',
    [string]$ServerConfig = '',
    [int]$Port = 0,
    [string]$Database = 'canopus'
)

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$db = Join-Path $root 'src/pg/db.ps1'
Set-Location $root

$dbArgs = @()
if ($Config -ne '') { $dbArgs += @('-Config', $Config) }
if ($Port -gt 0) { $dbArgs += @('-Port', $Port) }
if ($Database -ne 'canopus') { $dbArgs += @('-Database', $Database) }

& powershell -NoProfile -File $db up @dbArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

$front = Join-Path $root 'target/canopus.exe'
$hub = Join-Path $root 'target/canopus-hub.exe'
if (-not ((Test-Path $front) -and (Test-Path $hub))) {
    [Console]::Error.WriteLine('The programs are not built. From a Nova environment (setup-env.ps1) run, in the root of the repository:')
    [Console]::Error.WriteLine('  nova build src/canopus_hub.nv -o target/canopus-hub.exe')
    [Console]::Error.WriteLine('  nova build src/canopus.nv -o target/canopus.exe')
    exit 1
}

if ($Config -eq '') { $Config = Join-Path $HOME '.config/canopus/pg.json' }
if ($ServerConfig -eq '') { $ServerConfig = Join-Path $HOME '.config/canopus/server-pg.json' }
& powershell -NoProfile -File $db serve-config -Out $ServerConfig @dbArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

$settings = Get-Content -Raw -Path $Config | ConvertFrom-Json
$env:CANOPUS_PG_PASSWORD = $settings.service_password
$env:CANOPUS_PG_PORT = [string]$settings.port
$env:CANOPUS_PG_DATABASE = $Database
$env:CANOPUS_SERVER_STORE = 'pg'
if ($ServerPort -gt 0) { $env:CANOPUS_SERVER_PORT = [string]$ServerPort }
if ($Agent -ne '') { $env:CANOPUS_SERVER_AGENT = $Agent }
$settings = $null
try {
    Write-Output "starting the server on the store pg (database $Database); Ctrl+C stops it"
    & $front serve $ServerConfig
    exit $LASTEXITCODE
} finally {
    foreach ($name in 'CANOPUS_PG_PASSWORD', 'CANOPUS_PG_PORT', 'CANOPUS_PG_DATABASE', 'CANOPUS_SERVER_STORE', 'CANOPUS_SERVER_PORT', 'CANOPUS_SERVER_AGENT') {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
}
