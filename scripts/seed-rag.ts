/**
 * بذر فهرس RAG (المرحلة P3):
 *  - دائماً: الفهرس المحلي (TF-IDF) من قاعدة المعرفة + مواد اللائحة المالية + دليل الحسابات.
 *  - عند توفر GEMINI_API_KEY + جدول kb_embeddings: توليد تضمينات وبذرها في pgvector.
 *
 * التشغيل: npm run rag:seed
 */
import { embeddingService } from '../server/services/embedding.service.js';

async function main(): Promise<void> {
  const localCount = embeddingService.seedFromKnowledgeBase();
  console.log(`📚 الفهرس المحلي: ${localCount} مستنداً`);

  const postgres = await embeddingService.seedToPostgres();
  console.log(
    `🗄️ pgvector: ${postgres.inserted} مُدخلاً، ${postgres.skipped} متخطّى، ${postgres.embedded} متجهاً` +
      (postgres.note ? ` — ${postgres.note}` : '')
  );

  const stats = await embeddingService.getStats();
  console.log('📊 الإحصاءات:', JSON.stringify(stats, null, 2));
  if (!stats.embeddingConfigured)
    console.log('ℹ️ GEMINI_API_KEY غير مضبوط — البحث الدلالي يعمل محلياً (TF-IDF) بلا تضمينات.');
}

main().catch((error) => {
  console.error(`⚠️ فشل البذر: ${error?.message || error}`);
  process.exit(1);
});
