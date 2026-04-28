$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PwaRoot = Join-Path $RepoRoot "apps\pwa"
$Port = 5173

Set-Location -LiteralPath $PwaRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm was not found. Install Node.js first, then run open-website.bat again."
    Read-Host "Press Enter to close"
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $PwaRoot "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    npm install
}

Write-Host "Starting Takeout Guard PWA at http://127.0.0.1:$Port"
Write-Host "Keep this window open while using the website. Close it to stop the local server."
npm run dev -- --strictPort
