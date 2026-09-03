/**
 * ===== IMPROVEMENTS.md 7.1: Caching ذكي =====
 * CachingStrategy: تخزين مؤقت بطبقتين:
 * - Redis عند توفر REDIS_URL (للنشر السحابي متعدد النسخ)
 * - ذاكرة داخلية بـ TTL كخيار احتياطي (بدون اعتماديات خارجية)
 * مع إبطال تلقائي للمفاتيح عند تغير البيانات (Cache Invalidation).
 */

interface MemoryEntry {
  value: string; // JSON serialized
  expiresAt: number;
}

export class CachingStrategy {
  private redis: any = null;
  private memory: Map<string, MemoryEntry> = new Map();
  private defaultTtlSeconds: number;

  constructor(defaultTtlSeconds: number = Number(process.env.REDIS_TTL || 3600)) {
    this.defaultTtlSeconds = defaultTtlSeconds;

    if (process.env.REDIS_URL) {
      import('redis')
        .then(async (mod) => {
          const client = mod.createClient({ url: process.env.REDIS_URL });
          client.on('error', (err: any) => console.warn('Redis cache error (falling back to memory):', err.message));
          await client.connect();
          this.redis = client;
          console.log('✅ Redis cache connected');
        })
        .catch(() => {
          console.log('ℹ️ Redis unavailable - using in-memory cache');
        });
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    // 1) Redis أولاً
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) return JSON.parse(cached);
      } catch {
        /* تجاهل والرجوع للذاكرة */
      }
    }
    // 2) الذاكرة الداخلية
    const entry = this.memory.get(key);
    if (entry) {
      if (entry.expiresAt > Date.now()) {
        return JSON.parse(entry.value);
      }
      this.memory.delete(key); // انتهت صلاحيته
    }
    return null;
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    const serialized = JSON.stringify(value);

    if (this.redis) {
      try {
        await this.redis.setEx(key, ttl, serialized);
        return;
      } catch {
        /* تجاهل والرجوع للذاكرة */
      }
    }
    this.memory.set(key, { value: serialized, expiresAt: Date.now() + ttl * 1000 });
  }

  /**
   * versión متزامنة للذاكرة الداخلية فقط (التقارير المتزامنة).
   * لا تحتاج جولة Redis إضافية في مسار الخادم الحالي.
   */
  public getSync<T>(key: string): T | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt > Date.now()) {
      try {
        return JSON.parse(entry.value) as T;
      } catch {
        this.memory.delete(key);
        return null;
      }
    }
    this.memory.delete(key);
    return null;
  }

  public setSync(key: string, value: any, ttlSeconds?: number): void {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    const serialized = JSON.stringify(value);
    this.memory.set(key, { value: serialized, expiresAt: Date.now() + ttl * 1000 });
  }

  public wrapSync<T>(key: string, producer: () => T, ttlSeconds?: number): T {
    const cached = this.getSync<T>(key);
    if (cached !== null) return cached;
    const fresh = producer();
    this.setSync(key, fresh, ttlSeconds);
    return fresh;
  }

  /**
   * get-setter مدمج: يجلب من الكاش أو ينفذ المُنتِج ويخزن الناتج
   */
  public async wrap<T>(key: string, producer: () => Promise<T> | T, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await producer();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /**
   * تحديث الكاش عند التغيير: حذف مفتاح أو كل المفاتيح التي تبدأ ببادئة
   */
  public async invalidate(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        /* تجاهل */
      }
    }
    this.memory.delete(key);
  }

  public async invalidatePrefix(prefix: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys && keys.length > 0) await this.redis.del(keys);
      } catch {
        /* تجاهل */
      }
    }
    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) this.memory.delete(key);
    }
  }

  /**
   * إحصاءات الكاش للتشخيص
   */
  public stats(): { driver: 'redis' | 'memory'; memoryKeys: number; redisConnected: boolean } {
    return {
      driver: this.redis ? 'redis' : 'memory',
      memoryKeys: this.memory.size,
      redisConnected: Boolean(this.redis),
    };
  }
}

/** مفاتيح الكاش الموحدة للنظام */
export const CACHE_KEYS = {
  dashboardSummary: (orgId?: string) => `cache:dashboard:${orgId || 'all'}`,
  accountsList: () => 'cache:accounts:active',
  trialBalance: (orgId?: string) => `cache:reports:trial-balance:${orgId || 'all'}`,
  balanceSheet: (orgId?: string) => `cache:reports:balance-sheet:${orgId || 'all'}`,
  incomeExpense: (orgId?: string) => `cache:reports:income-expense:${orgId || 'all'}`,
  generalLedger: (orgId?: string) => `cache:reports:general-ledger:${orgId || 'all'}`,
  financialSnapshot: (orgId?: string) => `cache:reports:financial-snapshot:${orgId || 'all'}`,
  aiFinancialContext: (orgId?: string) => `cache:ai:context:${orgId || 'all'}`,
  journalTemplates: () => 'cache:journal-templates:active',
};

export const cacheService = new CachingStrategy();
