/**
 * خدمة التضمين الدلالي RAG — P2
 * تدعم:
 * - Gemini text-embedding-004 (768 dim) عند توفر GEMINI_API_KEY
 * - Fallback محلي TF-IDF + cosine similarity (بدون اعتماد خارجي)
 * - تخزين في kb_embeddings (pgvector) أو ذاكرة داخلية
 */

import { erpStore } from '../db/store.js';
import { KNOWLEDGE_BASE } from '../data/knowledge-base.js';
import { FINANCIAL_REGULATION_ARTICLES } from '../data/financial-regulation.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { postgresManager } from '../db/postgresSync.js';
import { getPool } from '../../src/db/index.js';

export interface EmbeddingRecord {
  id: string;
  content: string;
  contentNormalized: string;
  embedding?: number[]; // 768 dim
  type: string;
  reference: string;
  keywords: string[];
}

export interface RagSearchResult {
  id: string;
  content: string;
  reference: string;
  type: string;
  score: number;
  excerpt: string;
}

class EmbeddingService {
  private memoryEmbeddings: EmbeddingRecord[] = [];
  private tfidfVocab: Map<string, number> = new Map();
  private tfidfIdf: Map<string, number> = new Map();
  private isSeeded = false;

  /** بذر التضمينات من قاعدة المعرفة + اللائحة + دليل الحسابات */
  public seedFromKnowledgeBase(): number {
    if (this.isSeeded) return this.memoryEmbeddings.length;
    const records: EmbeddingRecord[] = [];

    // 1) قواعد محاسبية
    for (const rule of KNOWLEDGE_BASE.accountingRules) {
      records.push({
        id: `kb-rule-${rule.titleAr.slice(0, 20)}-${records.length}`,
        content: `${rule.titleAr}\n${rule.content}`,
        contentNormalized: normalizeArabicText(`${rule.titleAr} ${rule.content}`),
        type: 'RULE',
        reference: rule.titleAr,
        keywords: rule.keywords,
      });
    }
    // 2) لوائح
    for (const reg of KNOWLEDGE_BASE.regulations) {
      records.push({
        id: `kb-reg-${reg.titleAr.slice(0, 20)}-${records.length}`,
        content: `${reg.titleAr}\n${reg.content}`,
        contentNormalized: normalizeArabicText(`${reg.titleAr} ${reg.content}`),
        type: 'REGULATION',
        reference: reg.titleAr,
        keywords: reg.keywords,
      });
    }
    // 3) FAQ
    for (const faq of KNOWLEDGE_BASE.faqItems) {
      records.push({
        id: `kb-faq-${faq.question.slice(0, 20)}-${records.length}`,
        content: `${faq.question}\n${faq.answer}`,
        contentNormalized: normalizeArabicText(`${faq.question} ${faq.answer}`),
        type: 'FAQ',
        reference: faq.question,
        keywords: faq.keywords,
      });
    }
    // 4) أخطاء شائعة
    for (const err of KNOWLEDGE_BASE.commonErrors) {
      records.push({
        id: `kb-err-${err.error.slice(0, 20)}-${records.length}`,
        content: `${err.error}\nالسبب: ${err.cause}\nالحل: ${err.solution}`,
        contentNormalized: normalizeArabicText(`${err.error} ${err.cause} ${err.solution}`),
        type: 'ERROR',
        reference: err.error,
        keywords: err.keywords,
      });
    }
    // 5) مواد اللائحة المالية (86 مادة)
    for (const art of FINANCIAL_REGULATION_ARTICLES) {
      records.push({
        id: `kb-art-${art.articleNo}-${records.length}`,
        content: `المادة ${art.articleNo}: ${art.title}\n${art.text}`,
        contentNormalized: normalizeArabicText(`${art.title} ${art.text} المادة ${art.articleNo}`),
        type: 'ARTICLE',
        reference: `المادة ${art.articleNo}: ${art.title}`,
        keywords: art.keywords,
      });
    }
    // 6) دليل الحسابات النشط
    for (const acc of erpStore.accounts.filter((a) => !a.isParent && a.isActive).slice(0, 200)) {
      records.push({
        id: `kb-acc-${acc.code}-${records.length}`,
        content: `حساب ${acc.code} - ${acc.name} نوع ${acc.type} طبيعة ${acc.nature} ${acc.requiresSubledger ? 'يتطلب أستاذ مساعد' : ''}`,
        contentNormalized: normalizeArabicText(`${acc.code} ${acc.name} ${acc.type}`),
        type: 'ACCOUNT',
        reference: `${acc.code} - ${acc.name}`,
        keywords: [acc.code, acc.name, acc.type],
      });
    }

    this.memoryEmbeddings = records;
    this.buildTfidfIndex();
    this.isSeeded = true;
    console.log(`🧠 RAG seeded: ${records.length} records (TF-IDF vocab ${this.tfidfVocab.size})`);
    return records.length;
  }

  /** بناء فهرس TF-IDF محلي */
  private buildTfidfIndex() {
    const docTerms: Map<string, number>[] = [];
    const docFreq = new Map<string, number>();

    for (const rec of this.memoryEmbeddings) {
      const terms = rec.contentNormalized.split(/\s+/).filter((t) => t.length > 1);
      const tf = new Map<string, number>();
      for (const term of terms) {
        tf.set(term, (tf.get(term) || 0) + 1);
      }
      // احسب تكرار المستندات
      for (const term of new Set(terms)) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
      docTerms.push(tf);
    }

    const N = this.memoryEmbeddings.length;
    // IDF
    for (const [term, df] of docFreq) {
      this.tfidfIdf.set(term, Math.log((N + 1) / (df + 1)) + 1);
    }
    // vocab index
    let idx = 0;
    for (const term of docFreq.keys()) {
      this.tfidfVocab.set(term, idx++);
    }
  }

  /** تحويل نص إلى متجه TF-IDF */
  private textToTfidfVector(text: string): Map<number, number> {
    const normalized = normalizeArabicText(text);
    const terms = normalized.split(/\s+/).filter((t) => t.length > 1);
    const tf = new Map<string, number>();
    for (const term of terms) tf.set(term, (tf.get(term) || 0) + 1);

    const vec = new Map<number, number>();
    for (const [term, count] of tf) {
      const vocabIdx = this.tfidfVocab.get(term);
      if (vocabIdx === undefined) continue;
      const idf = this.tfidfIdf.get(term) || 1;
      vec.set(vocabIdx, (count / terms.length) * idf);
    }
    return vec;
  }

  private cosineSimilaritySparse(a: Map<number, number>, b: Map<number, number>): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [idx, val] of a) {
      normA += val * val;
      const bVal = b.get(idx);
      if (bVal !== undefined) dot += val * bVal;
    }
    for (const val of b.values()) normB += val * val;
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** بحث دلالي محلي TF-IDF */
  public searchLocal(query: string, limit = 5): RagSearchResult[] {
    if (!this.isSeeded) this.seedFromKnowledgeBase();
    const queryVec = this.textToTfidfVector(query);
    const results: RagSearchResult[] = [];

    for (const rec of this.memoryEmbeddings) {
      const docVec = this.textToTfidfVector(rec.contentNormalized);
      const score = this.cosineSimilaritySparse(queryVec, docVec);
      // تعزيز إضافي إذا تطابقت كلمات مفتاحية حرفياً
      const keywordBoost = rec.keywords.some((k) => normalizeArabicText(query).includes(normalizeArabicText(k))) ? 0.15 : 0;
      const finalScore = score + keywordBoost;
      if (finalScore > 0.05) {
        results.push({
          id: rec.id,
          content: rec.content,
          reference: rec.reference,
          type: rec.type,
          score: Math.min(1, finalScore),
          excerpt: rec.content.slice(0, 200),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** بحث عبر Gemini embeddings إن توفر المفتاح، وإلا fallback محلي */
  public async search(query: string, limit = 5): Promise<RagSearchResult[]> {
    const start = Date.now();
    let results: RagSearchResult[] = [];
    let modelUsed = 'local-tfidf';

    // محاولة Gemini embedding إذا توفر المفتاح وقاعدة البيانات متاحة
    if (process.env.GEMINI_API_KEY && postgresManager.isDbAvailable()) {
      try {
        const pool = getPool();
        // تحقق من وجود جدول embeddings
        const check = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='kb_embeddings') as exists`);
        if (check.rows[0]?.exists) {
          // استدعاء Gemini embedding
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const embedResp: any = await (ai as any).models?.embedContent?.({
            model: 'text-embedding-004',
            contents: [{ parts: [{ text: query }] }],
          });
          const queryEmbedding = embedResp?.embeddings?.[0]?.values || embedResp?.embedding?.values;
          if (queryEmbedding && queryEmbedding.length > 0) {
            // بحث cosine في pgvector
            const vectorStr = `[${queryEmbedding.join(',')}]`;
            const sql = `
              SELECT id, content, reference, type,
                     1 - (embedding <=> $1::vector) as score
              FROM kb_embeddings
              WHERE embedding IS NOT NULL
              ORDER BY embedding <=> $1::vector
              LIMIT $2
            `;
            const res = await pool.query(sql, [vectorStr, limit]);
            results = res.rows.map((r: any) => ({
              id: r.id,
              content: r.content,
              reference: r.reference,
              type: r.type,
              score: Number(r.score),
              excerpt: r.content.slice(0, 200),
            }));
            modelUsed = 'gemini-text-embedding-004';
          }
        }
      } catch (e: any) {
        console.warn(`⚠️ RAG vector search failed, falling back to TF-IDF: ${e.message}`);
      }
    }

    // fallback محلي
    if (results.length === 0) {
      results = this.searchLocal(query, limit);
    }

    const latency = Date.now() - start;

    // تسجيل البحث (اختياري، لا يوقف عند الفشل)
    if (postgresManager.isDbAvailable()) {
      try {
        const pool = getPool();
        await pool.query(
          `INSERT INTO rag_search_logs (id, query, query_normalized, results, top_score, latency_ms, model_used)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [
            `raglog-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            query,
            normalizeArabicText(query),
            JSON.stringify(results.slice(0, 3)),
            results[0]?.score || 0,
            latency,
            modelUsed,
          ]
        );
      } catch {}
    }

    return results;
  }

  /** بذر embeddings إلى PostgreSQL (يستدعى مرة واحدة) */
  public async seedToPostgres(): Promise<{ inserted: number; skipped: number }> {
    if (!postgresManager.isDbAvailable()) return { inserted: 0, skipped: 0 };
    if (!this.isSeeded) this.seedFromKnowledgeBase();

    const pool = getPool();
    let inserted = 0;
    let skipped = 0;

    // تحقق من وجود الجدول
    try {
      const check = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='kb_embeddings') as exists`);
      if (!check.rows[0]?.exists) {
        console.warn('⚠️ kb_embeddings table not found — run migration 004 first');
        return { inserted: 0, skipped: this.memoryEmbeddings.length };
      }
    } catch {
      return { inserted: 0, skipped: 0 };
    }

    // إذا توفر Gemini، أنشئ embeddings حقيقية
    let embeddingsMap = new Map<string, number[]>();
    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        // دفعات 20
        for (let i = 0; i < this.memoryEmbeddings.length; i += 20) {
          const batch = this.memoryEmbeddings.slice(i, i + 20);
          const contents = batch.map((r) => ({ parts: [{ text: r.content.slice(0, 8000) }] }));
          // @ts-ignore
          const resp: any = await (ai as any).models?.embedContentBatch?.({
            model: 'text-embedding-004',
            requests: contents.map((c) => ({ model: 'text-embedding-004', content: c })),
          });
          // fallback single
          if (!resp) {
            for (const rec of batch) {
              try {
                // @ts-ignore
                const single: any = await (ai as any).models?.embedContent?.({
                  model: 'text-embedding-004',
                  contents: [{ parts: [{ text: rec.content.slice(0, 8000) }] }],
                });
                const vals = single?.embeddings?.[0]?.values || single?.embedding?.values;
                if (vals) embeddingsMap.set(rec.id, vals);
              } catch {}
            }
          } else {
            // batch response
            const embs = resp?.embeddings || [];
            embs.forEach((e: any, idx: number) => {
              const vals = e?.values;
              if (vals) embeddingsMap.set(batch[idx].id, vals);
            });
          }
          // احترام rate limit
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (e: any) {
        console.warn(`⚠️ Gemini embedding batch failed: ${e.message}`);
      }
    }

    for (const rec of this.memoryEmbeddings) {
      try {
        const emb = embeddingsMap.get(rec.id);
        const vectorStr = emb ? `[${emb.join(',')}]` : null;
        if (vectorStr) {
          await pool.query(
            `INSERT INTO kb_embeddings (id, content, content_normalized, embedding, type, reference, keywords)
             VALUES ($1,$2,$3,$4::vector,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, content = EXCLUDED.content`,
            [rec.id, rec.content, rec.contentNormalized, vectorStr, rec.type, rec.reference, rec.keywords]
          );
        } else {
          await pool.query(
            `INSERT INTO kb_embeddings (id, content, content_normalized, type, reference, keywords)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO NOTHING`,
            [rec.id, rec.content, rec.contentNormalized, rec.type, rec.reference, rec.keywords]
          );
        }
        inserted++;
      } catch {
        skipped++;
      }
    }

    try {
      await pool.query('ANALYZE kb_embeddings');
    } catch {}

    console.log(`✅ RAG seed to Postgres: ${inserted} inserted, ${skipped} skipped, ${embeddingsMap.size} vectors`);
    return { inserted, skipped };
  }

  public getStats() {
    return {
      seeded: this.isSeeded,
      count: this.memoryEmbeddings.length,
      vocabSize: this.tfidfVocab.size,
      hasVectorTable: postgresManager.isDbAvailable(),
    };
  }
}

export const embeddingService = new EmbeddingService();
