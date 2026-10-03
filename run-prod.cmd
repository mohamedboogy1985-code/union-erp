@echo off
setlocal
cd /d "%~dp0"
title Union ERP - production server
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install Node.js 20 or newer from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies ^(first run, needs internet^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
if not exist dist (
  echo dist folder not found - run: npm run build:frontend
  pause
  exit /b 1
)
if "%PORT%"=="" set PORT=3000
if "%STATUTE_ENFORCEMENT_STAGE%"=="" set STATUTE_ENFORCEMENT_STAGE=SHADOW
set NODE_ENV=production
echo Starting production server on http://localhost:%PORT%/  ^(new module page: /statutory^)
start "" http://localhost:%PORT%/
call npx tsx server.ts
pause
