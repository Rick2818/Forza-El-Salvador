# Launches Horizon El Salvador in a dedicated Chrome window.
# Starts the production preview server if it is not already running.
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
$port = 4173
$url = "http://localhost:$port/"

function Test-HorizonUp {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
    return $r.StatusCode -ge 200 -and $r.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-HorizonUp)) {
  $dist = Join-Path $project "dist\index.html"
  if (-not (Test-Path $dist)) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "Falta la compilacion de produccion.`nEjecuta: npm --prefix `"$project`" run build",
      "Horizon El Salvador"
    ) | Out-Null
    exit 1
  }
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm --prefix `"$project`" run preview -- --port $port --strictPort" `
    -WindowStyle Hidden
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-HorizonUp) { break }
  }
}

$chrome = Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
  $chrome = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
}

if (Test-Path $chrome) {
  Start-Process -FilePath $chrome -ArgumentList "--app=$url", "--start-maximized", "--window-size=1600,900"
} else {
  Start-Process $url
}
