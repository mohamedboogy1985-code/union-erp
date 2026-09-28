-- Migration 004: دعم البحث الدلالي عبر pgvector — P2 RAG
-- التاريخ: 2026-09-06
-- يتطلب: CREATE EXTENSION vector (متاح في Cloud SQL + Postgres 15+ مع pgvector)

BEGIN;

-- تفعيل الإضافات
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- جدول التضمينات الدلالية لقاعدة المعرفة (قواعد/لوائح/FAQ/أخطاء/مواد)
CREATE TABLE IF NOT EXISTS kb_embeddings (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  content_normalized TEXT NOT NULL, -- نص مطبع عربياً للبحث الاحتياطي بدون vector
  embedding vector(768), -- Gemini text-embedding-004 = 768 بعد
  type TEXT NOT NULL, -- RULE, REGULATION, FAQ, ERROR, ARTICLE, ACCOUNT
  reference TEXT NOT NULL, -- عنوان أو مرجع المادة
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهرس IVFFlat للبحث السريع (يحتاج ANALYZE بعد إدخال بيانات)
-- ملاحظة: IVFFlat يتطلب بيانات أولاً، لذا ننشئه بعد أول دفعة
-- CREATE INDEX kb_embeddings_vector_idx ON kb_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- بديل HNSW (Postgres 15+ pgvector 0.5+):
CREATE INDEX IF NOT EXISTS kb_embeddings_vector_hnsw_idx ON kb_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS kb_embeddings_type_idx ON kb_embeddings(type);
CREATE INDEX IF NOT EXISTS kb_embeddings_reference_trgm_idx ON kb_embeddings USING gin (reference gin_trgm_ops);
CREATE INDEX IF NOT EXISTS kb_embeddings_content_trgm_idx ON kb_embeddings USING gin (content_normalized gin_trgm_ops);

-- جدول سجل البحث الدلالي (لتتبع جودة RAG)
CREATE TABLE IF NOT EXISTS rag_search_logs (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  query_normalized TEXT NOT NULL,
  results JSONB DEFAULT '[]',
  top_score DOUBLE PRECISION DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  model_used TEXT DEFAULT 'local-tfidf',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_search_logs_created_idx ON rag_search_logs(created_at DESC);

-- دالة تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_kb_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kb_embeddings_updated_at ON kb_embeddings;
CREATE TRIGGER trg_kb_embeddings_updated_at
  BEFORE UPDATE ON kb_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_kb_embeddings_updated_at();

COMMIT;

-- بعد التنفيذ:
-- 1) شغل سكريبت بذر التضمينات: npm run rag:seed
-- 2) ANALYZE kb_embeddings;
-- 3) إن كان لديك >1000 صف: CREATE INDEX ... ivfflat
