param([Parameter(Mandatory=$true)][string]$FixtureName)
# Targeted stage regression, sequential within the machine queue. Not Hub/front
# build, F-09 integration, production bootstrap, or explicit caller cancellation.
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
if ($FixtureName -cnotmatch '^CrewHarnessAclFixtures-[0-9a-f]{32}$') { throw 'fixture component' }
$powershell = Join-Path $PSHOME 'powershell.exe'
& $powershell -NoLogo -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'test-windows-acl-policy.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
foreach ($script in @('test-windows-acl-runtime.ps1','test-windows-acl-hostile.ps1')) {
    & $powershell -NoLogo -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot $script) -FixtureName $FixtureName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$env:TEMP = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) $FixtureName
$env:TMP = $env:TEMP
foreach ($script in @('test-check-release-kit.py','test-package-release.py')) {
    & python (Join-Path $PSScriptRoot ('guards/selftest/' + $script))
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output 'PASS: targeted ACL stage regression; exclusions remain explicit in task result'
