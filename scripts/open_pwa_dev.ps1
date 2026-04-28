$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Port = 5173
$Url = "http://127.0.0.1:$Port"
$ServerScript = Join-Path $PSScriptRoot "run_pwa_vite.ps1"

function Test-ServerReady {
    param([string] $TargetUrl)

    try {
        $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

if (-not (Test-ServerReady -TargetUrl $Url)) {
    Start-Process `
        -FilePath "powershell" `
        -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-NoExit",
            "-File", "`"$ServerScript`""
        ) `
        -WorkingDirectory $RepoRoot
}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    if (Test-ServerReady -TargetUrl $Url) {
        Start-Process $Url
        exit 0
    }

    Start-Sleep -Milliseconds 500
}

Write-Host "The website server did not become ready within 30 seconds."
Write-Host "Leave the server window open and try opening this URL manually:"
Write-Host $Url
Read-Host "Press Enter to close"
exit 1
