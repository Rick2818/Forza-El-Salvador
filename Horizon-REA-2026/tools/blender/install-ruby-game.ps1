param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceRef,
    [string]$ProjectRoot = "C:\Users\Ricardo\Documents\Boltech Group\Plan Comercial tipo Relevance AI\Horizon-REA-2026"
)
$ErrorActionPreference = "Stop"
function Invoke-LoggedNative {
    param([string]$Executable, [string[]]$Arguments, [string]$LogPath)
    $PreviousPreference = $ErrorActionPreference
    try {
        # In Windows PowerShell 5.1, warnings on stderr are ErrorRecords.
        # Judge native commands by exit status instead of treating warnings as failure.
        $ErrorActionPreference = "Continue"
        & $Executable @Arguments 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $LogPath
        $script:LastNativeExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
}
$BlenderExe = "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe"
if (!(Test-Path -LiteralPath $BlenderExe)) { throw "No se encontro Blender 5.3." }
if (!(Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) { throw "No se encontro Horizon." }
$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$NpmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
$Outputs = Join-Path $ProjectRoot "tools\blender\outputs"
$Scene = Get-ChildItem -LiteralPath $Outputs -Directory -Filter "california-ruby-*" |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Join-Path $_.FullName "california-ruby.blend" } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1
if (!$Scene) { throw "Falta el archivo california-ruby.blend aprobado. Genera primero la version rubi." }
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectRoot ("tools\blender\integration-backups\" + $Stamp)
$Stage = Join-Path $env:TEMP ("Horizon-Ruby-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$BaseUrl = "https://raw.githubusercontent.com/Rick2818/Forza-El-Salvador/$SourceRef/Horizon-REA-2026"
$DownloadFiles = @(
    "tools/blender/export-ruby-game.py",
    "tools/blender/prepare-ruby-integration.mjs",
    "src/vehicle/convertibleAsset.ts"
)
foreach ($Relative in $DownloadFiles) {
    $Target = Join-Path $Stage $Relative
    New-Item -ItemType Directory -Path (Split-Path $Target) -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$Relative" -OutFile $Target
}
Write-Host "Preparando el carro aprobado..." -ForegroundColor Cyan
$AssetRelative = "public/models/california-ruby-game.glb"
$StagedAsset = Join-Path $Stage $AssetRelative
New-Item -ItemType Directory -Path (Split-Path $StagedAsset) -Force | Out-Null
Invoke-LoggedNative -Executable $BlenderExe -Arguments @("--background", "--python-exit-code", "1", "--python", (Join-Path $Stage "tools/blender/export-ruby-game.py"), "--", "--source", $Scene, "--output", $StagedAsset) -LogPath (Join-Path $BackupRoot "export.log")
if ($script:LastNativeExit -ne 0 -or !(Test-Path -LiteralPath $StagedAsset)) {
    throw "Fallo la exportacion. El juego no se modifico. Log: $BackupRoot\export.log"
}
& $NodeExe (Join-Path $Stage "tools/blender/prepare-ruby-integration.mjs") $ProjectRoot $Stage
if ($LASTEXITCODE -ne 0) { throw "No se pudo preparar la integracion. El juego no se modifico." }
$Changes = @(
    "src/main.ts",
    "src/vehicle/carModel.ts",
    "src/race/race.ts",
    "src/vehicle/convertibleAsset.ts",
    $AssetRelative,
    "$AssetRelative.json"
)
$Manifest = @()
foreach ($Relative in $Changes) {
    $Original = Join-Path $ProjectRoot $Relative
    $Saved = Join-Path $BackupRoot $Relative
    $Exists = Test-Path -LiteralPath $Original
    if ($Exists) {
        New-Item -ItemType Directory -Path (Split-Path $Saved) -Force | Out-Null
        Copy-Item -LiteralPath $Original -Destination $Saved
    }
    $Manifest += [pscustomobject]@{path=$Relative; existed=$Exists}
}
$Manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $BackupRoot "files.json") -Encoding UTF8
try {
    foreach ($Relative in $Changes) {
        $Destination = Join-Path $ProjectRoot $Relative
        New-Item -ItemType Directory -Path (Split-Path $Destination) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $Stage $Relative) -Destination $Destination -Force
    }
    Push-Location -LiteralPath $ProjectRoot
    try {
        Write-Host "Comprobando compilacion..." -ForegroundColor Cyan
        Invoke-LoggedNative -Executable $NpmExe -Arguments @("run", "build") -LogPath (Join-Path $BackupRoot "build.log")
        if ($script:LastNativeExit -ne 0) { throw "Fallo la compilacion. Revisa build.log." }
        Write-Host "Ejecutando pruebas..." -ForegroundColor Cyan
        Invoke-LoggedNative -Executable $NpmExe -Arguments @("test") -LogPath (Join-Path $BackupRoot "tests.log")
        if ($script:LastNativeExit -ne 0) { throw "Fallaron las pruebas. Revisa tests.log." }
    } finally {
        Pop-Location
    }
} catch {
    $FailureMessage = $_.Exception.Message
    foreach ($Record in $Manifest) {
        $Destination = Join-Path $ProjectRoot $Record.path
        if ($Record.existed) {
            Copy-Item -LiteralPath (Join-Path $BackupRoot $Record.path) -Destination $Destination -Force
        } elseif (Test-Path -LiteralPath $Destination) {
            Remove-Item -LiteralPath $Destination
        }
    }
    throw "$FailureMessage Se restauraron los archivos del juego. Registros: $BackupRoot"
}
Write-Host "CARRO RUBI INTEGRADO LOCALMENTE. Compilacion y pruebas correctas." -ForegroundColor Green
Write-Host "Respaldo: $BackupRoot"
Write-Host "Los FPS y la apariencia en pista siguen pendientes de comprobacion."
$Listener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if (!$Listener) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm.cmd run dev" -WorkingDirectory $ProjectRoot
}
Start-Process "http://localhost:5173/"
