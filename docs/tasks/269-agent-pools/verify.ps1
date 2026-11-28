param(
    [string]$NovaHome = 'C:/work/nova/nova-oracle-0.1.0-windows-x86_64',
    [string]$Filter = '',
    [int]$Timeout = 600,
    [string[]]$Paths = @('src/agent_pool_tests/source_test.nv')
)
$ErrorActionPreference = 'Stop'
. (Join-Path $NovaHome 'setup-env.ps1')
# Clang needs an existing ASCII temporary directory. Fixture projects must also
# stay outside a repository's inherited project settings.
$env:TEMP = Join-Path $env:SystemDrive 'work/crew-harness-temp-269'
$null = New-Item -ItemType Directory -Force -Path $env:TEMP
$env:TMP = $env:TEMP
$env:NOVA_DEBUG_RUN_DUMP = '1'
$args_ = @('test') + $Paths + @('--jobs', '1', '--timeout', "$Timeout")
if ($Filter) { $args_ += @('--filter', $Filter) }
& (Join-Path $NovaHome 'nova.exe') @args_
exit $LASTEXITCODE
