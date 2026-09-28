/**
 * ===== خدمة التضمين الدلالي (RAG) — المرحلة P3 =====
 * استُعيدت من PR #24 مع تصحيحات تجعلها متوافقة مع عقد منع تصنيع البيانات (P0-1):
 *
 *  1) **البحث يعمل دائماً محلياً**: فهرس TF-IDF عربي مبنيّ من قاعدة المعرفة واللائحة المالية
 *     ودليل الحسابات — بلا مفتاح API وبلا قاعدة بيانات. لا يُختلق أي مستند أو إجابة.
 *  2) **pgvector تحسين لا شرط**: عند توفر `GEMINI_API_KEY` + جدول `kb_embeddings`
 *     (هجرة 004) يُستخدم بحث cosine، وإلا يُعاد إلى TF-IDF المحلي مع تسجيل السبب صراحةً
 *     في `provenance.reason` — لا ادّعاء بأن البحث «دلالي» حين لم يكن.
 *  3) **نموذج التضمين قابل للضبط** `EMBEDDING_MODEL` (الافتراضي `gemini-embedding-001`
 *     بأبعاد 768 لتطابق `vector(768)` في الهجرة) بدل تثبيت اسم نموذج قد يتقاعد.
 *  4) كل نتيجة تحمل `score` و`type` و`reference` من المستند الأصلي — بلا تحسين مموّه.
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
  embedding?: number[];
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

export type RagConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RagProvenance {
  modelUsed: 'local-tfidf' | 'pgvector-embedding';
  embedded: boolean;
  reason: string;
  topScore: number;
  /** ثقة المطابقة: LOW تعني «لا مطابقة واثقة» ويجب أن يقولها المستدعي بصراحة */
  confidence: RagConfidence;
}

/**
 * حدود ثقة معلنة (مقيسة على الأسئلة الحقيقية في هذا المستودع):
 * سؤال عن اللائحة ⇒ 0.34، حساب 1301 ⇒ 0.95، بينما سؤال خارج المجال ⇒ 0.16–0.19.
 * تحتها لا ندّعي مطابقة.
 */
export const RAG_CONFIDENCE_HIGH = 0.3;
export const RAG_CONFIDENCE_MEDIUM = 0.2;

export function ragConfidenceFor(topScore: number): RagConfidence {
  if (topScore >= RAG_CONFIDENCE_HIGH) return 'HIGH';
  if (topScore >= RAG_CONFIDENCE_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

export interface RagStats {
  seeded: boolean;
  count: number;
  vocabSize: number;
  databaseAvailable: boolean;
  vectorTableAvailable: boolean;
  embeddingModel: string;
  /** هل يمكن توليد تضمينات فعلاً الآن؟ */
  embeddingConfigured: boolean;
}

export const EMBEDDING_DIMENSIONS = 768;
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const VECTOR_TABLE = 'kb_embeddings';

class EmbeddingService {
  private memoryEmbeddings: EmbeddingRecord[] = [];
  private tfidfVocab: Map<string, number> = new Map();
  private tfidfIdf: Map<string, number> = new Map();
  private isSeeded = false;
  private vectorTableCache: { value: boolean; checkedAt: number } | null = null;
  private lastProvenance: RagProvenance | null = null;

  private get embeddingModel(): string {
    return process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  }

  /** بذر المستندات من قاعدة المعرفة + اللائحة المالية + دليل الحسابات النشط */
  public seedFromKnowledgeBase(): number {
    if (this.isSeeded) return this.memoryEmbeddings.length;
    const records: EmbeddingRecord[] = [];

    for (const rule of KNOWLEDGE_BASE.accountingRules)
      records.push({
        id: `kb-rule-${records.length}`,
        content: `${rule.titleAr}\n${rule.content}`,
        contentNormalized: normalizeArabicText(`${rule.titleAr} ${rule.content}`),
        type: 'RULE',
        reference: rule.titleAr,
        keywords: rule.keywords,
      });

    for (const reg of KNOWLEDGE_BASE.regulations)
      records.push({
        id: `kb-reg-${records.length}`,
        content: `${reg.titleAr}\n${reg.content}`,
        contentNormalized: normalizeArabicText(`${reg.titleAr} ${reg.content}`),
        type: 'REGULATION',
        reference: reg.titleAr,
        keywords: reg.keywords,
      });

    for (const faq of KNOWLEDGE_BASE.faqItems)
      records.push({
        id: `kb-faq-${records.length}`,
        content: `${faq.question}\n${faq.answer}`,
        contentNormalized: normalizeArabicText(`${faq.question} ${faq.answer}`),
        type: 'FAQ',
        reference: faq.question,
        keywords: faq.keywords,
      });

    for (const err of KNOWLEDGE_BASE.commonErrors)
      records.push({
        id: `kb-err-${records.length}`,
        content: `${err.error}\nالسبب: ${err.cause}\nالحل: ${err.solution}`,
        contentNormalized: normalizeArabicText(`${err.error} ${err.cause} ${err.solution}`),
        type: 'ERROR',
        reference: err.error,
        keywords: err.keywords,
      });

    for (const article of FINANCIAL_REGULATION_ARTICLES)
      records.push({
        id: `kb-art-${article.articleNo}`,
        content: `المادة ${article.articleNo}: ${article.title}\n${article.text}`,
        contentNormalized: normalizeArabicText(`${article.title} ${article.text} المادة ${article.articleNo}`),
        type: 'ARTICLE',
        reference: `المادة ${article.articleNo}: ${article.title}`,
        keywords: article.keywords,
      });

    for (const account of erpStore.accounts.filter((a) => !a.isParent && a.isActive).slice(0, 500))
      records.push({
        id: `kb-acc-${account.code}`,
        content: `حساب ${account.code} - ${account.name} نوع ${account.type} طبيعة ${account.nature}${account.requiresSubledger ? ' يتطلب أستاذ مساعد' : ''}`,
        contentNormalized: normalizeArabicText(`${account.code} ${account.name} ${account.type} ${account.nature}`),
        type: 'ACCOUNT',
        reference: `${account.code} - ${account.name}`,
        keywords: [account.code, account.name, account.type],
      });

    this.memoryEmbeddings = records;
    this.buildTfidfIndex();
    this.isSeeded = true;
    console.log(`🧠 RAG: تم بذر ${records.length} مستنداً محلياً (مفردات TF-IDF: ${this.tfidfVocab.size})`);
    return records.length;
  }

  private buildTfidfIndex(): void {
    const docFreq = new Map<string, number>();
    for (const record of this.memoryEmbeddings) {
      const terms = record.contentNormalized.split(/\s+/).filter((term) => term.length > 1);
      for (const term of new Set(terms)) docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
    const total = this.memoryEmbeddings.length;
    this.tfidfIdf.clear();
    this.tfidfVocab.clear();
    let index = 0;
    for (const [term, df] of docFreq) {
      this.tfidfIdf.set(term, Math.log((total + 1) / (df + 1)) + 1);
      this.tfidfVocab.set(term, index++);
    }
  }

  private textToTfidfVector(text: string): Map<number, number> {
    const normalized = normalizeArabicText(text);
    const terms = normalized.split(/\s+/).filter((term) => term.length > 1);
    const frequencies = new Map<string, number>();
    for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1);

    const vector = new Map<number, number>();
    for (const [term, count] of frequencies) {
      const vocabIndex = this.tfidfVocab.get(term);
      if (vocabIndex === undefined) continue;
      vector.set(vocabIndex, (count / Math.max(1, terms.length)) * (this.tfidfIdf.get(term) || 1));
    }
    return vector;
  }

  private cosineSimilaritySparse(a: Map<number, number>, b: Map<number, number>): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [index, value] of a) {
      normA += value * value;
      const other = b.get(index);
      if (other !== undefined) dot += value * other;
    }
    for (const value of b.values()) normB += value * value;
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** بحث دلالي محلي (TF-IDF) — يعمل دائماً بلا مفتاح ولا قاعدة بيانات */
  public searchLocal(query: string, limit = 5): RagSearchResult[] {
    if (!this.isSeeded) this.seedFromKnowledgeBase();
    const normalizedQuery = normalizeArabicText(query);
    const queryVector = this.textToTfidfVector(query);
    const results: RagSearchResult[] = [];

    for (const record of this.memoryEmbeddings) {
      const documentVector = this.textToTfidfVector(record.contentNormalized);
      const similarity = this.cosineSimilaritySparse(queryVector, documentVector);
      const keywordBoost = record.keywords.some((keyword) => normalizedQuery.includes(normalizeArabicText(keyword))) ? 0.15 : 0;
      const score = Math.min(1, similarity + keywordBoost);
      if (score > 0.05)
        results.push({
          id: record.id,
          content: record.content,
          reference: record.reference,
          type: record.type,
          score: Number(score.toFixed(4)),
          excerpt: record.content.slice(0, 200),
        });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** هل جدول pgvector موجود فعلاً؟ (نتيجة حقيقية من information_schema، مع تخزين 30 ثانية) */
  public async hasVectorTable(): Promise<boolean> {
    if (this.vectorTableCache && Date.now() - this.vectorTableCache.checkedAt < 30_000) return this.vectorTableCache.value;
    let value = false;
    if (postgresManager.isDbAvailable()) {
      try {
        const result = await getPool().query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS exists`,
          [VECTOR_TABLE]
        );
        value = Boolean(result.rows[0]?.exists);
      } catch {
        value = false;
      }
    }
    this.vectorTableCache = { value, checkedAt: Date.now() };
    return value;
  }

  public async search(query: string, limit = 5): Promise<{ results: RagSearchResult[]; provenance: RagProvenance }> {
    const startedAt = Date.now();
    let results: RagSearchResult[] = [];
    let provenance: RagProvenance = {
      modelUsed: 'local-tfidf',
      embedded: false,
      reason: process.env.GEMINI_API_KEY ? 'تعذّر استخدام pgvector — تم الرجوع للبحث المحلي' : 'لا يوجد GEMINI_API_KEY — بحث محلي TF-IDF',
      topScore: 0,
      confidence: 'LOW',
    };

    if (process.env.GEMINI_API_KEY && (await this.hasVectorTable())) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response: any = await client.models.embedContent({
          model: this.embeddingModel,
          contents: [{ parts: [{ text: query.slice(0, 8000) }] }],
          config: { outputDimensionality: EMBEDDING_DIMENSIONS } as any,
        } as any);
        const vector: number[] | undefined = response?.embeddings?.[0]?.values || response?.embedding?.values;
        if (vector?.length) {
          const rows = await getPool().query(
            `SELECT id, content, reference, type, 1 - (embedding <=> $1::vector) AS score
             FROM ${VECTOR_TABLE}
             WHERE embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector
             LIMIT $2`,
            [`[${vector.join(',')}]`, limit]
          );
          results = rows.rows.map((row: any) => ({
            id: row.id,
            content: row.content,
            reference: row.reference,
            type: row.type,
            score: Number(Number(row.score).toFixed(4)),
            excerpt: String(row.content).slice(0, 200),
          }));
          if (results.length)
            provenance = {
              modelUsed: 'pgvector-embedding',
              embedded: true,
              reason: `تضمين ${this.embeddingModel} + بحث cosine`,
              topScore: results[0].score,
              confidence: ragConfidenceFor(results[0].score),
            };
        }
      } catch (error: any) {
        provenance.reason = `فشل التضمين (${error?.message || 'خطأ غير معروف'}) — تم الرجوع للبحث المحلي`;
      }
    }

    if (results.length === 0) results = this.searchLocal(query, limit);

    const topScore = results[0]?.score ?? 0;
    provenance = { ...provenance, topScore, confidence: ragConfidenceFor(topScore) };
    if (provenance.confidence === 'LOW' && results.length)
      provenance.reason = `${provenance.reason} — لا مطابقة واثقة (أعلى درجة ${topScore})`;

    const latencyMs = Date.now() - startedAt;
    this.lastProvenance = provenance;

    if (await this.hasVectorTable()) {
      try {
        await getPool().query(
          `INSERT INTO rag_search_logs (id, query, query_normalized, results, top_score, latency_ms, model_used)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [
            `raglog-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            query,
            normalizeArabicText(query),
            JSON.stringify(results.slice(0, 3)),
            results[0]?.score || 0,
            latencyMs,
            provenance.modelUsed,
          ]
        );
      } catch {
        /* سجل البحث لا يُفشل الطلب */
      }
    }

    return { results, provenance };
  }

  /** توليد تضمينات وبذرها في pgvector — يحتاج المفتاح والجدول معاً، ويعود بأرقام حقيقية */
  public async seedToPostgres(): Promise<{ inserted: number; skipped: number; embedded: number; note?: string }> {
    if (!postgresManager.isDbAvailable())
      return { inserted: 0, skipped: 0, embedded: 0, note: 'قاعدة البيانات غير متاحة — البحث المحلي يعمل كاملاً' };
    if (!(await this.hasVectorTable()))
      return { inserted: 0, skipped: 0, embedded: 0, note: `الجدول ${VECTOR_TABLE} غير موجود — نفّذ الهجرة 004` };
    if (!this.isSeeded) this.seedFromKnowledgeBase();

    const pool = getPool();
    let embeddings = new Map<string, number[]>();
    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        for (let index = 0; index < this.memoryEmbeddings.length; index += 20) {
          const batch = this.memoryEmbeddings.slice(index, index + 20);
          const response: any = await client.models.embedContent({
            model: this.embeddingModel,
            contents: batch.map((record) => ({ parts: [{ text: record.content.slice(0, 8000) }] })),
            config: { outputDimensionality: EMBEDDING_DIMENSIONS } as any,
          } as any);
          const list = response?.embeddings || [];
          list.forEach((item: any, position: number) => {
            if (item?.values && batch[position]) embeddings.set(batch[position].id, item.values);
          });
          await new Promise((resolve) => setTimeout(resolve, 300)); // احترام حدود المعدل
        }
      } catch (error: any) {
        console.warn(`⚠️ فشل توليد التضمينات: ${error?.message || error}`);
      }
    }

    let inserted = 0;
    let skipped = 0;
    for (const record of this.memoryEmbeddings) {
      try {
        const vector = embeddings.get(record.id);
        if (vector)
          await pool.query(
            `INSERT INTO ${VECTOR_TABLE} (id, content, content_normalized, embedding, type, reference, keywords)
             VALUES ($1,$2,$3,$4::vector,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, content = EXCLUDED.content`,
            [record.id, record.content, record.contentNormalized, `[${vector.join(',')}]`, record.type, record.reference, record.keywords]
          );
        else
          await pool.query(
            `INSERT INTO ${VECTOR_TABLE} (id, content, content_normalized, type, reference, keywords)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, content_normalized = EXCLUDED.content_normalized`,
            [record.id, record.content, record.contentNormalized, record.type, record.reference, record.keywords]
          );
        inserted += 1;
      } catch {
        skipped += 1;
      }
    }

    try {
      await pool.query(`ANALYZE ${VECTOR_TABLE}`);
    } catch {
      /* ANALYZE تحسيني */
    }

    console.log(`✅ RAG: ${inserted} مستنداً في pgvector، ${skipped} فشل، ${embeddings.size} متجهاً مُولَّداً`);
    return { inserted, skipped, embedded: embeddings.size };
  }

  /** إحصاءات حقيقية عن الحالة الحالية (لا تُظهر «جدول موجود» إن لم يُتحقَّق منه) */
  public async getStats(): Promise<RagStats> {
    if (!this.isSeeded) this.seedFromKnowledgeBase();
    return {
      seeded: this.isSeeded,
      count: this.memoryEmbeddings.length,
      vocabSize: this.tfidfVocab.size,
      databaseAvailable: postgresManager.isDbAvailable(),
      vectorTableAvailable: await this.hasVectorTable(),
      embeddingModel: this.embeddingModel,
      embeddingConfigured: Boolean(process.env.GEMINI_API_KEY),
    };
  }

  public getLastProvenance(): RagProvenance | null {
    return this.lastProvenance;
  }
}

export const embeddingService = new EmbeddingService();
