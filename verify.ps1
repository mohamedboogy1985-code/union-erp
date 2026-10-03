#requires -version 5.1
<#
  Union ERP verification (ASCII-only script for PowerShell 5.1)
  Usage:  .\verify.ps1            -> type check + module checks + original tests
          .\verify.ps1 -Live      -> adds live checks against a running server
#>
param(
  [int]$Port = 3000,
  [switch]$Live
)

$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot
$failed = 0

Write-Host "[1/4] TypeScript check for the added modules (expected: 0 errors)" -ForegroundColor Cyan
& npx tsc --noEmit -p tsconfig.statutory.json
if ($LASTEXITCODE -ne 0) { $failed = $failed + 1; Write-Host "  FAILED" -ForegroundColor Red } else { Write-Host "  OK" -ForegroundColor Green }

Write-Host "[2/4] Module verification suite (expected: 50 passed / 0 failed)" -ForegroundColor Cyan
& npx tsx scripts/verify-statutory-integration.ts
if ($LASTEXITCODE -ne 0) { $failed = $failed + 1; Write-Host "  FAILED" -ForegroundColor Red } else { Write-Host "  OK" -ForegroundColor Green }

Write-Host "[3/4] Original project tests (regulation + accounting)" -ForegroundColor Cyan
& npx tsx test/regulation.test.ts
if ($LASTEXITCODE -ne 0) { $failed = $failed + 1; Write-Host "  regulation FAILED" -ForegroundColor Red } else { Write-Host "  regulation OK" -ForegroundColor Green }
& npx tsx test/accounting.test.ts
if ($LASTEXITCODE -ne 0) { $failed = $failed + 1; Write-Host "  accounting FAILED" -ForegroundColor Red } else { Write-Host "  accounting OK" -ForegroundColor Green }

Write-Host "[4/4] Optional live checks" -ForegroundColor Cyan
if ($Live) {
  $env:BASE_URL = "http://127.0.0.1:$Port"
  & node scripts/live-integration-check.mjs
  if ($LASTEXITCODE -ne 0) { $failed = $failed + 1; Write-Host "  live FAILED" -ForegroundColor Red } else { Write-Host "  live OK" -ForegroundColor Green }
} else {
  Write-Host "  skipped (run with -Live while the server is up)" -ForegroundColor Yellow
}

Write-Host ""
if ($failed -eq 0) {
  Write-Host "ALL VERIFICATIONS PASSED" -ForegroundColor Green
  exit 0
} else {
  Write-Host ("VERIFICATION FAILED - groups with errors: " + $failed) -ForegroundColor Red
  exit 1
}
