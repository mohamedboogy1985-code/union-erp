#requires -version 5.1
<#
  Union ERP launcher (ASCII-only script for PowerShell 5.1)
  Usage:  .\run.ps1 [-Port 3000] [-Prod] [-Open] [-NoInstall]
#>
param(
  [int]$Port = 3000,
  [switch]$Prod,
  [switch]$Open,
  [switch]$NoInstall
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Union ERP - accounting program + new modules" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Host "Node.js not found. Install Node.js 20 or newer from https://nodejs.org" -ForegroundColor Red
  exit 1
}
Write-Host ("Node.js: " + (& node -v))

if (($Prod) -and (-not (Test-Path "dist"))) {
  Write-Host "dist folder not found - falling back to dev mode (npm run dev uses vite)." -ForegroundColor Yellow
  $Prod = $false
}

if (-not (Test-Path "node_modules")) {
  if ($NoInstall) {
    Write-Host "node_modules is missing and -NoInstall was given. Run: npm install" -ForegroundColor Red
    exit 1
  }
  Write-Host "Installing dependencies (first run, needs internet)..." -ForegroundColor Yellow
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed." -ForegroundColor Red
    exit 1
  }
}

$env:PORT = "$Port"
if (-not $env:STATUTE_ENFORCEMENT_STAGE) { $env:STATUTE_ENFORCEMENT_STAGE = "SHADOW" }
if ($Prod) { $env:NODE_ENV = "production" } else { $env:NODE_ENV = "development" }

Write-Host ("Enforcement stage: " + $env:STATUTE_ENFORCEMENT_STAGE)
Write-Host ("Open in browser: http://localhost:" + $Port + "/   (new module page: /statutory)")
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

if ($Open) {
  Start-Process ("http://localhost:" + $Port + "/") | Out-Null
}

& npx tsx server.ts
