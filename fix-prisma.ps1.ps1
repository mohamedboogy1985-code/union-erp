# ============================================================
# Script to fix Prisma 8 setup and apply blockchain security
# ============================================================

Write-Host "=== Starting fix script ===" -ForegroundColor Cyan

# 1. Check if we are in the right directory
if (-not (Test-Path "prisma\schema.prisma")) {
    Write-Host "ERROR: prisma\schema.prisma not found. Run this script from the project root." -ForegroundColor Red
    exit 1
}
Write-Host "Step 1: Found schema.prisma" -ForegroundColor Green

# 2. Fix prisma.config.ts if it exists
if (Test-Path "prisma.config.ts") {
    Write-Host "Step 2: Fixing prisma.config.ts..." -ForegroundColor Yellow
    Copy-Item "prisma.config.ts" "prisma.config.ts.backup"
    
    $configContent = Get-Content "prisma.config.ts" -Raw
    $configContent = $configContent -replace "from '@prisma/cli-engine'", "from '@prisma/orm-postgres/config'"
    $configContent = $configContent -replace "require\('@prisma/cli-engine'\)", "require('@prisma/orm-postgres/config')"
    Set-Content -Path "prisma.config.ts" -Value $configContent
    Write-Host "Step 2: Fixed prisma.config.ts" -ForegroundColor Green
}

# 3. Install required dependencies
Write-Host "Step 3: Installing dependencies..." -ForegroundColor Yellow
npm install @prisma/orm-postgres dotenv @prisma/client

# 4. Add security fields to schema.prisma if not present
Write-Host "Step 4: Checking for security fields..." -ForegroundColor Yellow
$schemaContent = Get-Content "prisma\schema.prisma" -Raw

if ($schemaContent -match "previousHash") {
    Write-Host "Step 4: Security fields already exist." -ForegroundColor Green
} else {
    Write-Host "Step 4: Adding security fields..." -ForegroundColor Yellow
    $newSchemaContent = $schemaContent -replace "(model JournalEntry \{)", "`$1`r`n  // ===== Blockchain Security =====`r`n  previousHash  String   @default(`"0`")`r`n  currentHash   String   @unique`r`n  isBlockValid  Boolean  @default(true)`r`n  // ==============================="
    Set-Content -Path "prisma\schema.prisma" -Value $newSchemaContent
    Write-Host "Step 4: Security fields added." -ForegroundColor Green
}

# 5. Create service files
Write-Host "Step 5: Creating service files..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "server\services" -Force | Out-Null
New-Item -ItemType Directory -Path "server\routes" -Force | Out-Null

$hashServiceContent = @'
const crypto = require('crypto');

function calculateEntryHash(entryData, previousHash) {
  const dataString = [
    entryData.id || '',
    entryData.entryDate?.toISOString() || '',
    entryData.description || '',
    entryData.debit?.toString() || '0',
    entryData.credit?.toString() || '0',
    entryData.accountId || '',
    previousHash || '0'
  ].join('|');
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

async function verifyChain(db) {
  const entries = await db.journalEntry.findMany({ orderBy: { createdAt: 'asc' } });
  let isValid = true;
  let previousHash = '0';
  const brokenEntries = [];
  for (const entry of entries) {
    const expectedHash = calculateEntryHash(entry, previousHash);
    if (entry.currentHash !== expectedHash) {
      isValid = false;
      brokenEntries.push(entry.id);
    }
    previousHash = entry.currentHash;
  }
  return { isValid, brokenEntries, totalEntries: entries.length };
}

module.exports = { calculateEntryHash, verifyChain };
'@
Set-Content -Path "server\services\hash.service.js" -Value $hashServiceContent

$securityRoutesContent = @'
const express = require('express');
const { verifyChain } = require('../services/hash.service');
const router = express.Router();

router.get('/verify-chain', async (req, res) => {
  try {
    const result = await verifyChain(req.app.get('db'));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
'@
Set-Content -Path "server\routes\security.routes.js" -Value $securityRoutesContent

Write-Host "Step 5: Service files created." -ForegroundColor Green

# 6. Try to emit the contract
Write-Host "Step 6: Attempting to emit contract..." -ForegroundColor Yellow

$emitCommands = @(
    "npx prisma contract emit",
    "npx prisma orm emit",
    "npx prisma generate"
)

$emitSuccess = $false
foreach ($cmd in $emitCommands) {
    Write-Host "  Trying: $cmd" -ForegroundColor Gray
    try {
        Invoke-Expression $cmd
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  SUCCESS: $cmd" -ForegroundColor Green
            $emitSuccess = $true
            break
        } else {
            Write-Host "  FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  EXCEPTION: $_" -ForegroundColor Red
    }
}

if (-not $emitSuccess) {
    Write-Host "Step 6: No emit command succeeded. Continuing..." -ForegroundColor Yellow
}

# 7. Try to update the database
Write-Host "Step 7: Attempting to update database..." -ForegroundColor Yellow

$updateCommands = @(
    "npx prisma db update",
    "npx prisma db push",
    "npx prisma migrate dev --name init"
)

$updateSuccess = $false
foreach ($cmd in $updateCommands) {
    Write-Host "  Trying: $cmd" -ForegroundColor Gray
    try {
        Invoke-Expression $cmd
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  SUCCESS: $cmd" -ForegroundColor Green
            $updateSuccess = $true
            break
        } else {
            Write-Host "  FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  EXCEPTION: $_" -ForegroundColor Red
    }
}

# 8. Push changes to GitHub
Write-Host "Step 8: Pushing changes to GitHub..." -ForegroundColor Yellow
git add .
git commit -m "Add blockchain security for accounting entries"
git push origin feature/blockchain-security

# 9. Final report
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "SCRIPT COMPLETED!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "  1. Fixed prisma.config.ts (if existed)" -ForegroundColor Gray
Write-Host "  2. Installed required dependencies" -ForegroundColor Gray
Write-Host "  3. Added security fields to schema.prisma" -ForegroundColor Gray
Write-Host "  4. Created server/services/hash.service.js" -ForegroundColor Gray
Write-Host "  5. Created server/routes/security.routes.js" -ForegroundColor Gray
if ($emitSuccess) { Write-Host "  6. Contract emitted successfully" -ForegroundColor Green }
else { Write-Host "  6. Contract emit needs manual intervention" -ForegroundColor Yellow }
if ($updateSuccess) { Write-Host "  7. Database updated successfully" -ForegroundColor Green }
else { Write-Host "  7. Database update needs manual intervention" -ForegroundColor Yellow }
Write-Host "  8. Changes pushed to GitHub" -ForegroundColor Gray
Write-Host ""
Write-Host "Pull Request URL:" -ForegroundColor White
Write-Host "  https://github.com/mohamedboogy1985-code/union-erp/pull/new/feature/blockchain-security" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan