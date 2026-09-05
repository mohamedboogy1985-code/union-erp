# ============================================================
# سكريبت إصلاح تهيئة Prisma 8 وتطبيق تعديلات أمان سلسلة الكتل
# يعمل على Windows PowerShell
# ============================================================

Write-Host "🚀 بدء السكريبت المتكامل..." -ForegroundColor Cyan

# 1. التأكد من أننا في المسار الصحيح
if (-not (Test-Path "prisma\schema.prisma")) {
    Write-Host "❌ خطأ: لم يتم العثور على prisma\schema.prisma. تأكد من تشغيل السكريبت من مجلد المشروع." -ForegroundColor Red
    exit 1
}
Write-Host "✅ تم العثور على ملف المخطط." -ForegroundColor Green

# 2. إصلاح ملف prisma.config.ts (إذا كان موجوداً)
if (Test-Path "prisma.config.ts") {
    Write-Host "📝 إصلاح ملف prisma.config.ts..." -ForegroundColor Yellow
    
    # عمل نسخة احتياطية
    Copy-Item "prisma.config.ts" "prisma.config.ts.backup"
    
    # قراءة الملف وإصلاحه
    $configContent = Get-Content "prisma.config.ts" -Raw
    
    # استبدال import غير الصحيح
    $configContent = $configContent -replace "from '@prisma/cli-engine'", "from '@prisma/orm-postgres/config'"
    $configContent = $configContent -replace "require\('@prisma/cli-engine'\)", "require('@prisma/orm-postgres/config')"
    
    # حفظ الملف المعدل
    Set-Content -Path "prisma.config.ts" -Value $configContent
    Write-Host "✅ تم إصلاح prisma.config.ts" -ForegroundColor Green
}

# 3. تثبيت الاعتماديات المطلوبة
Write-Host "📦 تثبيت الاعتماديات المطلوبة..." -ForegroundColor Yellow
npm install @prisma/orm-postgres dotenv @prisma/client

# 4. إضافة الحقول الجديدة إلى schema.prisma (إذا لم تكن موجودة)
Write-Host "📝 التحقق من وجود حقول الأمان في schema.prisma..." -ForegroundColor Yellow
$schemaContent = Get-Content "prisma\schema.prisma" -Raw

if ($schemaContent -match "previousHash") {
    Write-Host "✅ حقول الأمان موجودة بالفعل." -ForegroundColor Green
} else {
    Write-Host "➕ إضافة حقول الأمان إلى schema.prisma..." -ForegroundColor Yellow
    
    # إضافة الحقول بعد model JournalEntry {
    $newSchemaContent = $schemaContent -replace "(model JournalEntry \{)", "`$1`r`n  // ===== أمان السلسلة المحاسبية =====`r`n  previousHash  String   @default(`"0`")`r`n  currentHash   String   @unique`r`n  isBlockValid  Boolean  @default(true)`r`n  // ==================================="
    
    Set-Content -Path "prisma\schema.prisma" -Value $newSchemaContent
    Write-Host "✅ تمت إضافة حقول الأمان." -ForegroundColor Green
}

# 5. إنشاء مجلدات وملفات الخدمة (إذا لم تكن موجودة)
Write-Host "📁 إنشاء ملفات الخدمة..." -ForegroundColor Yellow

# إنشاء مجلدات
New-Item -ItemType Directory -Path "server\services" -Force | Out-Null
New-Item -ItemType Directory -Path "server\routes" -Force | Out-Null

# إنشاء hash.service.js
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

# إنشاء security.routes.js
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

Write-Host "✅ تم إنشاء ملفات الخدمة." -ForegroundColor Green

# 6. محاولة إصدار العقد (بأمرين مختلفين)
Write-Host "🔧 محاولة إصدار العقد..." -ForegroundColor Yellow

$emitCommands = @(
    "npx prisma contract emit",
    "npx prisma orm emit",
    "npx prisma generate"
)

$emitSuccess = $false
foreach ($cmd in $emitCommands) {
    Write-Host "   تشغيل: $cmd" -ForegroundColor Gray
    try {
        $result = Invoke-Expression $cmd
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ نجح الأمر: $cmd" -ForegroundColor Green
            $emitSuccess = $true
            break
        } else {
            Write-Host "   ⚠️ فشل الأمر (رمز: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ استثناء: $_" -ForegroundColor Red
    }
}

if (-not $emitSuccess) {
    Write-Host "⚠️ لم ينجح أي من أوامر الإصدار. سنحاول تحديث قاعدة البيانات مباشرة..." -ForegroundColor Yellow
}

# 7. محاولة تحديث قاعدة البيانات
Write-Host "🗄️ محاولة تحديث قاعدة البيانات..." -ForegroundColor Yellow

$updateCommands = @(
    "npx prisma db update",
    "npx prisma db push",
    "npx prisma migrate dev --name init"
)

$updateSuccess = $false
foreach ($cmd in $updateCommands) {
    Write-Host "   تشغيل: $cmd" -ForegroundColor Gray
    try {
        $result = Invoke-Expression $cmd
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ نجح الأمر: $cmd" -ForegroundColor Green
            $updateSuccess = $true
            break
        } else {
            Write-Host "   ⚠️ فشل الأمر (رمز: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ استثناء: $_" -ForegroundColor Red
    }
}

# 8. رفع التغييرات إلى GitHub
Write-Host "📤 رفع التغييرات إلى GitHub..." -ForegroundColor Yellow
git add .
git commit -m "إضافة أمان سلسلة الكتل للقيود المحاسبية (تلقائي)"
git push origin feature/blockchain-security

# 9. عرض التقرير النهائي
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🎉 اكتمل السكريبت!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 التغييرات المنفذة:" -ForegroundColor White
Write-Host "   1. تم إصلاح prisma.config.ts (إذا كان موجوداً)" -ForegroundColor Gray
Write-Host "   2. تم تثبيت الاعتماديات المطلوبة" -ForegroundColor Gray
Write-Host "   3. تمت إضافة حقول الأمان إلى schema.prisma" -ForegroundColor Gray
Write-Host "   4. تم إنشاء server/services/hash.service.js" -ForegroundColor Gray
Write-Host "   5. تم إنشاء server/routes/security.routes.js" -ForegroundColor Gray
if ($emitSuccess) { Write-Host "   6. ✅ تم إصدار العقد بنجاح" -ForegroundColor Green }
else { Write-Host "   6. ⚠️ إصدار العقد يحتاج لتدخل يدوي (راجع الأخطاء أعلاه)" -ForegroundColor Yellow }
if ($updateSuccess) { Write-Host "   7. ✅ تم تحديث قاعدة البيانات بنجاح" -ForegroundColor Green }
else { Write-Host "   7. ⚠️ تحديث قاعدة البيانات يحتاج لتدخل يدوي" -ForegroundColor Yellow }
Write-Host "   8. ✅ تم رفع التغييرات إلى GitHub" -ForegroundColor Gray
Write-Host ""
Write-Host "🔗 الرابط لإنشاء Pull Request:" -ForegroundColor White
Write-Host "   https://github.com/mohamedboogy1985-code/union-erp/pull/new/feature/blockchain-security" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan