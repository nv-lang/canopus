# start-stt.ps1 - starts the local speech recognizer of the control panel (task 192f): whisper.cpp `whisper-server`,
# hidden, on 127.0.0.1:8178 (the panel sends the voice to it through `POST /api/stt`, see src/server/README.md).
# Reads the same app config as the panel. Tools are derived from its parent directory.
param([switch]$Quiet, [string]$Config = '')
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Config)) { $Config = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.canopus/config.json' }
$Config = [IO.Path]::GetFullPath($Config)
$dir = Join-Path (Split-Path -Parent $Config) 'tools/whisper'
$settings = @{}
if (Test-Path -LiteralPath $Config) { $settings = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json }
if ($settings.voice -eq $false) { throw 'Voice is disabled in the selected app config.' }
$model = if ($settings.voice.model) { [string]$settings.voice.model } else { 'ggml-small.bin' }
$language = if ($settings.voice.language) { [string]$settings.voice.language } else { 'auto' }
$port = 8178
$exe = Join-Path $dir 'bin/whisper-server.exe'
$modelPath = Join-Path $dir (Join-Path 'models' $model)
foreach ($need in @($exe, $modelPath)) {
    if (-not (Test-Path -LiteralPath $need)) {
        [Console]::Error.WriteLine("Not found: $need (the selected instance must contain tools/whisper/bin and tools/whisper/models/$model).")
        exit 1
    }
}

function Test-Recognizer {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 2
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

if (Test-Recognizer) {
    if (-not $Quiet) { Write-Host "The recognizer already answers on 127.0.0.1:$port." }
    exit 0
}

$log = Join-Path $dir 'server.log'
$err = Join-Path $dir 'server.err.log'
$started = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru `
    -WorkingDirectory (Join-Path $dir 'bin') `
    -RedirectStandardOutput $log -RedirectStandardError $err `
    -ArgumentList @('-m', (Join-Path '../models' $model), '--host', '127.0.0.1', '--port', "$port", '-l', $language)

# the model loads in a few seconds (the first start on the GPU is the slowest)
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if ($started.HasExited) { break }
    if (Test-Recognizer) { $ready = $true; break }
}
if (-not $ready) {
    [Console]::Error.WriteLine("The recognizer did not come up (see $err).")
    exit 1
}
if (-not $Quiet) { Write-Host "The recognizer is up on 127.0.0.1:$port (process $($started.Id), model $model, language $language)." }
