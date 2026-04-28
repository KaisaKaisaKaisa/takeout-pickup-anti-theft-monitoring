$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$launcher = Join-Path $repoRoot "open-website.bat"
$openScript = Join-Path $repoRoot "scripts\open_pwa_dev.ps1"
$serverScript = Join-Path $repoRoot "scripts\run_pwa_vite.ps1"

function Assert-FileContains {
    param(
        [string] $Path,
        [string] $Pattern,
        [string] $Message
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing file: $Path"
    }

    $content = Get-Content -LiteralPath $Path -Raw
    if ($content -notmatch $Pattern) {
        throw $Message
    }
}

Assert-FileContains `
    -Path $launcher `
    -Pattern 'open_pwa_dev\.ps1' `
    -Message "Root launcher must call scripts\open_pwa_dev.ps1."

Assert-FileContains `
    -Path $openScript `
    -Pattern 'http://127\.0\.0\.1:\$Port' `
    -Message "Open script must use the local Vite URL."

Assert-FileContains `
    -Path $openScript `
    -Pattern 'run_pwa_vite\.ps1' `
    -Message "Open script must start the Vite server script."

Assert-FileContains `
    -Path $openScript `
    -Pattern 'Start-Process \$Url' `
    -Message "Open script must open the browser after the server is ready."

Assert-FileContains `
    -Path $serverScript `
    -Pattern 'npm run dev -- --strictPort' `
    -Message "Server script must run the Vite dev server on the configured port."

Assert-FileContains `
    -Path $serverScript `
    -Pattern 'npm install' `
    -Message "Server script must install dependencies when node_modules is missing."

Write-Host "One-click launcher contract passed."
