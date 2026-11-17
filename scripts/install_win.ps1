$ErrorActionPreference = "Stop"

$RepoDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ExtName = "com.kinetix.premiere"
$CepDir = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$TargetDir = Join-Path $CepDir $ExtName

# CEP imzasiz yerel eklentiler icin PlayerDebugMode aktif edilir
foreach ($ver in @("CSXS.11", "CSXS.12")) {
    $regPath = "HKCU:\Software\Adobe\$ver"
    if (!(Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "PlayerDebugMode" -Value "1" -Type String
}

if (!(Test-Path $CepDir)) {
    New-Item -ItemType Directory -Path $CepDir -Force | Out-Null
}
if (Test-Path $TargetDir) {
    Remove-Item -Path $TargetDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

Copy-Item -Path (Join-Path $RepoDir "CSXS") -Destination (Join-Path $TargetDir "CSXS") -Recurse -Force
Copy-Item -Path (Join-Path $RepoDir "client") -Destination (Join-Path $TargetDir "client") -Recurse -Force
Copy-Item -Path (Join-Path $RepoDir "host") -Destination (Join-Path $TargetDir "host") -Recurse -Force
Copy-Item -Path (Join-Path $RepoDir ".debug") -Destination (Join-Path $TargetDir ".debug") -Force

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Kinetix Premiere Pro eklentisi kuruldu!" -ForegroundColor Green
Write-Host " Konum: $TargetDir"
Write-Host "============================================" -ForegroundColor Green
Write-Host " Premiere Pro'yu yeniden baslatin ve"
Write-Host " Window > Extensions > Kinetix menusunu acin."
Write-Host ""
