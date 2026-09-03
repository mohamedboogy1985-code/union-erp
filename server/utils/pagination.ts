import type { PaginatedResult, PaginationParams } from '../../src/types/erp.js';

/**
 * ===== IMPROVEMENTS.md 7.2: Pagination و Lazy Loading =====
 * خدمة ترقيم صفحي موحدة لكل قوائم النظام مع فرز اختياري.
 */
export class PaginationService {
  /**
   * ترقيم أي مصفوفة بيانات مع دعم الفرز
   */
  public paginate<T>(items: T[], params: Partial<PaginationParams> = {}): PaginatedResult<T> {
    const page = Math.max(1, Math.floor(params.page || 1));
    const limit = Math.min(200, Math.max(1, Math.floor(params.limit || 20)));
    const sortBy = params.sortBy;
    const sortOrder = params.sortOrder === 'ASC' ? 1 : -1;

    let data = [...items];
    if (sortBy) {
      data.sort((a: any, b: any) => {
        const av = a?.[sortBy];
        const bv = b?.[sortBy];
        if (av === bv) return 0;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortOrder;
        return String(av).localeCompare(String(bv), 'ar') * sortOrder;
      });
    }

    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;

    return {
      data: data.slice(start, start + limit),
      total,
      page: safePage,
      pageSize: limit,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    };
  }

  /**
   * قراءة باراميترات الترقيم من query string الطلب
   */
  public fromQuery(query: Record<string, any>): PaginationParams {
    return {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      sortBy: query.sortBy ? String(query.sortBy) : undefined,
      sortOrder: query.sortOrder === 'asc' ? 'ASC' : query.sortOrder === 'desc' ? 'DESC' : undefined,
    };
  }
}

export const paginationService = new PaginationService();
