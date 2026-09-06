import { embeddingService } from '../server/services/embedding.service.js';
const count = embeddingService.seedFromKnowledgeBase();
console.log(`✅ RAG seeded locally: ${count} records`);
console.log('ℹ️ To seed to Postgres (with vectors if GEMINI_API_KEY set):');
console.log('   Set DATABASE_URL and run via API: POST /api/system/rag/seed');
console.log('   Or run: tsx -e "import(\'./server/services/embedding.service.ts\').then(async m=>{ const {postgresManager}=await import(\'./server/db/postgresSync.js\'); const {erpStore}=await import(\'./server/db/store.js\'); await postgresManager.initialize(erpStore); const r=await m.embeddingService.seedToPostgres(); console.log(r); })"');
