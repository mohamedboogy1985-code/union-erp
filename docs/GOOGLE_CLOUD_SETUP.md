# Google Cloud Model API Setup Guide

> ⚠️ **تنبيه أمني**: لا تضع scripts التثبيت في المشروع مباشرة!
> استخدم متغيرات البيئة وملفات `.env` بدلاً من ذلك.

## 📋 المتطلبات الأولية

- Google Cloud Account مع مشروع نشط
- Google Cloud SDK مثبت
- PowerShell 7+ (على Windows)

## 🔧 الخطوات اليدوية (الطريقة الآمنة)

### 1️⃣ تثبيت Google Cloud SDK

```bash
# على Windows (استخدم chocolatey)
choco install google-cloud-sdk

# على macOS
brew install --cask google-cloud-sdk

# على Linux
curl https://sdk.cloud.google.com | bash
```

### 2️⃣ تسجيل الدخول

```bash
gcloud auth application-default login
```

سيفتح نافذة متصفح لتسجيل الدخول. بعد التسجيل، ستُحفظ بيانات الاعتماد محلياً.

### 3️⃣ تعيين مشروع Google Cloud

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### 4️⃣ تفعيل API

```bash
gcloud services enable aiplatform.googleapis.com
```

### 5️⃣ التحقق من الوصول

```bash
curl -X POST "https://aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/global/publishers/google/models/gemini-2.5-flash:generateContent" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "Reply only with SUCCESS"}]
    }]
  }'
```

---

## 🔐 إعداد آمن عبر متغيرات البيئة

### في `.env.local`:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
GOOGLE_AI_MODEL=gemini-2.5-flash
```

### في الكود (TypeScript):

```typescript
import { GoogleGenerativeAI } from "@google/genai";

const client = new GoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

const model = client.getGenerativeModel({
  model: process.env.GOOGLE_AI_MODEL || "gemini-2.5-flash",
});

export async function testAIAccess(): Promise<boolean> {
  try {
    const response = await model.generateContent("Reply only with SUCCESS");
    const text = response.response.text();
    return text.includes("SUCCESS");
  } catch (error) {
    console.error("AI Access Error:", error);
    return false;
  }
}
```

---

## ⚙️ إعداد Express Server

في `server.ts` أو `middleware/ai.ts`:

```typescript
import express from 'express';
import { GoogleGenerativeAI } from '@google/genai';

const router = express.Router();

// تهيئة Google AI
const googleAI = new GoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

/**
 * POST /api/ai/generate
 * استخدام Google Gemini لإنشاء محتوى
 */
router.post('/generate', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const model = googleAI.getGenerativeModel({
      model: process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash',
    });

    const response = await model.generateContent(prompt);
    const text = response.response.text();

    res.json({
      success: true,
      content: text,
      model: process.env.GOOGLE_AI_MODEL,
    });
  } catch (error) {
    console.error('AI Generation Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/ai/health
 * التحقق من وصول الـ API
 */
router.get('/health', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const model = googleAI.getGenerativeModel({
      model: process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash',
    });

    const response = await model.generateContent('Reply only with SUCCESS');
    const text = response.response.text();

    res.json({
      success: text.includes('SUCCESS'),
      status: 'API is accessible',
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'configured' : 'not configured',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

---

## 🧪 اختبار الاتصال

### عبر Postman:

```
POST http://localhost:3000/api/ai/health

{
  "success": true,
  "status": "API is accessible",
  "credentials": "configured"
}
```

### عبر curl:

```bash
curl -X GET http://localhost:3000/api/ai/health

curl -X POST http://localhost:3000/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, how are you?"}'
```

---

## 🐛 استكشاف الأخطاء

### خطأ: "Could not find credentials"

```bash
# إعادة تسجيل الدخول
gcloud auth application-default login

# التحقق من مسار الاعتماديات
echo $env:GOOGLE_APPLICATION_CREDENTIALS  # Windows
echo $GOOGLE_APPLICATION_CREDENTIALS      # macOS/Linux
```

### خطأ: "Permission denied"

```bash
# التحقق من أدوار المشروع
gcloud projects get-iam-policy YOUR_PROJECT_ID

# إضافة دور "Vertex AI User"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=user:your-email@example.com \
  --role=roles/aiplatform.user
```

### خطأ: "API not enabled"

```bash
# تفعيل API
gcloud services enable aiplatform.googleapis.com
gcloud services enable generativelanguage.googleapis.com
```

---

## 📚 الموارد الإضافية

- [Google Cloud Docs](https://cloud.google.com/docs)
- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Gemini API Reference](https://ai.google.dev/docs)

---

## ✅ قائمة التحقق

- [ ] Google Cloud SDK مثبت
- [ ] تسجيل دخول نجح (`gcloud auth list`)
- [ ] المشروع محدد (`gcloud config list`)
- [ ] API مفعّل (`gcloud services list --enabled`)
- [ ] بيانات الاعتماديات محفوظة (`$env:APPDATA\gcloud\application_default_credentials.json`)
- [ ] `.env.local` يحتوي على `GOOGLE_API_KEY` و `GOOGLE_CLOUD_PROJECT_ID`
- [ ] Test endpoint يعود بـ `"success": true`

---

**⚠️ تذكر**: لا تضع مفاتيح API في Git! استخدم `.env.local` و `.gitignore` دائماً! 🔐
