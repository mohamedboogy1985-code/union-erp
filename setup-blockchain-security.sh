#!/bin/bash

# ============================================================
# سكريبت التثبيت الآلي لأمان سلسلة الكتل المحاسبية
# لنظام Union ERP - النقابة العامة للعاملين بصناعات البناء والأخشاب
# ============================================================

echo "🚀 بدء تنفيذ السكريبت..."

# 1. التحقق من وجود المشروع في المسار الحالي
if [ ! -d "server" ] || [ ! -d "prisma" ]; then
  echo "❌ الخطأ: يجب تشغيل السكريبت من المجلد الجذر للمشروع (حيث يوجد مجلدات server و prisma)"
  exit 1
fi

# 2. إنشاء فرع جديد
echo "🌿 إنشاء فرع جديد: feature/blockchain-security"
git checkout -b feature/blockchain-security

# 3. تحديث ملف Prisma Schema
echo "📝 تحديث ملف Prisma Schema..."
SCHEMA_FILE="server/prisma/schema.prisma"
if [ -f "$SCHEMA_FILE" ]; then
  # إضافة الحقول الجديدة بعد العثور على model JournalEntry
  sed -i '/model JournalEntry {/a \
  // ===== أمان السلسلة المحاسبية =====\
  previousHash  String   @default("0")\
  currentHash   String   @unique\
  isBlockValid  Boolean  @default(true)\
  // ===================================
  ' "$SCHEMA_FILE"
  echo "✅ تم تحديث $SCHEMA_FILE"
else
  echo "❌ لم يتم العثور على $SCHEMA_FILE"
  exit 1
fi

# 4. تشغيل ترحيل قاعدة البيانات
echo "🗄️  تشغيل ترحيل قاعدة البيانات..."
npx prisma migrate dev --name add_blockchain_security
if [ $? -ne 0 ]; then
  echo "❌ فشل ترحيل قاعدة البيانات"
  exit 1
fi

# 5. إنشاء ملف خدمة التجزئة
echo "📄 إنشاء ملف hash.service.js..."
mkdir -p server/services
cat > server/services/hash.service.js << 'EOF'
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
EOF
echo "✅ تم إنشاء server/services/hash.service.js"

# 6. تحديث خدمة إنشاء القيد
echo "📝 تحديث journal.service.js..."
JOURNAL_SERVICE="server/services/journal.service.js"
if [ -f "$JOURNAL_SERVICE" ]; then
  # إضافة الاستيراد في الأعلى
  sed -i '1i const { calculateEntryHash } = require("./hash.service");' "$JOURNAL_SERVICE"
  
  # استبدال دالة createEntry (هذا الجزء يحتاج لضبط يدوي حسب الكود الفعلي)
  echo "⚠️  تنبيه: تحتاج لاستبدال دالة createEntry يدويًا في $JOURNAL_SERVICE بالكود الموجود في الشرح السابق."
else
  echo "⚠️  لم يتم العثور على $JOURNAL_SERVICE، تأكد من تعديلها يدويًا."
fi

# 7. إنشاء نقطة نهاية API
echo "📄 إنشاء security.routes.js..."
mkdir -p server/routes
cat > server/routes/security.routes.js << 'EOF'
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
EOF
echo "✅ تم إنشاء server/routes/security.routes.js"

# 8. تثبيت الحزم الإضافية
echo "📦 تثبيت الحزم الإضافية..."
npm install node-cron

# 9. إضافة الجدولة اليومية
echo "📄 إنشاء scheduler.service.js..."
cat > server/services/scheduler.service.js << 'EOF'
const cron = require('node-cron');
const { verifyChain } = require('./hash.service');

function startBlockchainVerification(db, io) {
  cron.schedule('0 2 * * *', async () => {
    console.log('🔍 بدء التحقق من سلامة السلسلة المحاسبية...');
    const result = await verifyChain(db);
    if (!result.isValid) {
      console.error('🚨 تم اكتشاف تلاعب في القيود:', result.brokenEntries);
      io?.emit('blockchain_alert', {
        type: 'TAMPERING_DETECTED',
        brokenEntries: result.brokenEntries,
        timestamp: new Date()
      });
    } else {
      console.log('✅ السلسلة المحاسبية سليمة.');
    }
  });
}
module.exports = { startBlockchainVerification };
EOF
echo "✅ تم إنشاء server/services/scheduler.service.js"

# 10. إضافة نقطة النهاية في الـ routes الرئيسي (هذا يحتاج لتعديل يدوي)
echo "⚠️  تنبيه: تحتاج لإضافة السطر التالي في ملف server/routes/index.js:"
echo '   app.use("/api/security", require("./security.routes"));'

# 11. إضافة الجدولة في ملف البدء الرئيسي
echo "⚠️  تنبيه: تحتاج لإضافة السطر التالي في ملف بدء التشغيل (مثل server/index.js أو app.js):"
echo '   const { startBlockchainVerification } = require("./services/scheduler.service");'
echo '   startBlockchainVerification(db, null); // مرّر الـ io إن وجد'

# 12. رفع التغييرات وإنشاء Pull Request
echo "📤 رفع التغييرات إلى GitHub..."
git add .
git commit -m "إضافة آلية سلسلة الكتل لحماية القيود المحاسبية من التلاعب"
git push origin feature/blockchain-security

echo "============================================================"
echo "🎉 اكتمل السكريبت بنجاح!"
echo "🔗 الآن اذهب إلى GitHub وأنشئ Pull Request من فرع:"
echo "   feature/blockchain-security"
echo "============================================================"