# Задача 259, контрольная точка 1: сборка программы alula ровно на закреплённом коммите пакета
# (nova.lock.toml: alula 0.28.0, c040a9b53a329c349f0d121c8a5c41f5067f82dd) из кеша nova
# (исходник только читается, сборка — во временной копии) и базовый прогон набора методики
# (ai-dev-methodology @ 0e692ba88e03f9522e5360f6be6c9e48dcddda95, только чтение).
# Печатает: версию программы, SHA источников, итог прогона. Код выхода — код прогона тестов.
param(
    [Parameter(Mandatory=$true)][string]$PackageSource,
    [Parameter(Mandatory=$true)][string]$MethodologyDir,
    [Parameter(Mandatory=$true)][string]$SetupEnv,
    [Parameter(Mandatory=$true)][string]$WorkDir
)
$ErrorActionPreference = "Stop"
$src = $PackageSource
$meth = $MethodologyDir
$work = Join-Path $WorkDir ([guid]::NewGuid().ToString())
$bin = "$work\pkg\target\alula.exe"

Write-Host "== источник пакета (pin c040a9b): $src"
if ((git -C $meth rev-parse HEAD) -ne '0e692ba88e03f9522e5360f6be6c9e48dcddda95') { throw 'Unexpected methodology revision' }
New-Item -ItemType Directory -Path $work | Out-Null
Copy-Item -Recurse $src "$work\pkg"

Write-Host "== сборка: nova build src/alula.nv (pinned c040a9b)"
. $SetupEnv
Push-Location "$work\pkg"
nova build src/alula.nv -o target/alula.exe
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 2 }
Pop-Location

Write-Host "== версия: $(& $bin version)"
Write-Host "== SHA методики: $(git -C $meth rev-parse HEAD)"
Write-Host "== прогон набора методики (alula-machines, ожидается 587 из 587)"
Push-Location $meth
& $bin test alula-machines --registry alula-machines/registry.md --journal alula-machines/journal.md --lib alula-machines/libs
$code = $LASTEXITCODE
Pop-Location
exit $code
