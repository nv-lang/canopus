param([string]$Config = (Join-Path $env:USERPROFILE '.canopus/config.json'))
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$program = Join-Path $PSScriptRoot 'canopus.exe'
$worker = Join-Path $PSScriptRoot 'scripts/native-acp-catalog.mjs'
$gcLog = Join-Path $PSScriptRoot 'canopus.gc.log'
$gcBefore = Get-Item -LiteralPath $gcLog -ErrorAction SilentlyContinue
$gcBeforeModified = if ($gcBefore) { $gcBefore.LastWriteTimeUtc } else { $null }
$gcBeforeLength = if ($gcBefore) { $gcBefore.Length } else { $null }
$started = [DateTime]::UtcNow
$app = Start-Process -FilePath $program -ArgumentList @('serve','--config',('"'+$Config+'"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
$catalog = $null
try {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $catalog = Start-Process -FilePath $node -ArgumentList @(('"'+$worker+'"'),'--config',('"'+$Config+'"'),'--owner-pid',$app.Id) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
  $app.WaitForExit()
  $exitCode = $app.ExitCode
  $gcAfter = Get-Item -LiteralPath $gcLog -ErrorAction SilentlyContinue
  $gcTail = @()
  $gcChanged = $gcAfter -and $gcAfter.LastWriteTimeUtc -ge $started -and (
    $gcAfter.LastWriteTimeUtc -ne $gcBeforeModified -or $gcAfter.Length -ne $gcBeforeLength
  )
  if ($exitCode -ne 0 -and $gcChanged -and !$env:GC_LOG_FILE) {
    $gcTail = @(Get-Content -LiteralPath $gcLog -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { '{0}' -f $_ })
  }
  $entry = [ordered]@{
    time = [DateTime]::UtcNow.ToString('o')
    pid = $app.Id
    started = $started.ToString('o')
    exitCode = $exitCode
    gcLog = $gcLog
    gcLogModified = if ($gcAfter) { $gcAfter.LastWriteTimeUtc.ToString('o') } else { $null }
    gcTail = $gcTail
  }
  $exitLog = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($Config))) 'canopus-exit.jsonl'
  try {
    $entry | ConvertTo-Json -Compress | Add-Content -LiteralPath $exitLog -Encoding UTF8
  } catch {
    Write-Warning "Could not write the Canopus exit log: $_"
  }
} finally {
  if($catalog -and (Get-Process -Id $catalog.Id -ErrorAction SilentlyContinue)) { & taskkill.exe /PID $catalog.Id /T /F | Out-Null }
}
exit $exitCode
