# Susanoo Reel Kit installer: launcher for Windows (PowerShell).
# The real installer is setup/install.mjs (Node). All options pass straight through:  .\setup\install.ps1 --help
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 18 or newer is needed first."
  Write-Host "Install it with:  winget install OpenJS.NodeJS.LTS"
  Write-Host "Then open a NEW PowerShell window and run this again."
  exit 1
}
& node (Join-Path $PSScriptRoot 'install.mjs') @args
exit $LASTEXITCODE
