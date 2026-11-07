param([string]$Config = (Join-Path $env:USERPROFILE '.canopus/config.json'))
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$program = Join-Path $PSScriptRoot 'canopus.exe'
$worker = Join-Path $PSScriptRoot 'scripts/native-acp-catalog.mjs'
$app = Start-Process -FilePath $program -ArgumentList @('serve','--config',('"'+$Config+'"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
$catalog = $null
try {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $catalog = Start-Process -FilePath $node -ArgumentList @(('"'+$worker+'"'),'--config',('"'+$Config+'"'),'--owner-pid',$app.Id) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
  Wait-Process -Id $app.Id
} finally {
  if($catalog -and (Get-Process -Id $catalog.Id -ErrorAction SilentlyContinue)) { & taskkill.exe /PID $catalog.Id /T /F | Out-Null }
}
