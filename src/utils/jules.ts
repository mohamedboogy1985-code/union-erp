import type { JulesActivity, JulesPlan } from '../types/jules.js';

/** Remote links are untrusted. Never render javascript:, credentials or arbitrary hosts. */
export function safeJulesLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'jules.google.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/session\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function safePullRequestLink(
  value: string | undefined,
  repository: string
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/');
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      parts.length === 5 &&
      parts[3] === 'pull' &&
      /^\d+$/.test(parts[4]) &&
      `${parts[1]}/${parts[2]}`.toLowerCase() === repository.toLowerCase()
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function latestJulesPlan(activities: JulesActivity[]): JulesPlan | undefined {
  const plans = activities.filter((activity) => activity.planGenerated?.plan.id);
  plans.sort((a, b) =>
    (a.createTime || a.planGenerated?.plan.createTime || '').localeCompare(
      b.createTime || b.planGenerated?.plan.createTime || ''
    )
  );
  return plans[plans.length - 1]?.planGenerated?.plan;
}

export const JULES_STATES: Record<string, { label: string; color: string }> = {
  STATE_UNSPECIFIED: { label: 'غير محددة', color: 'text-slate-300 bg-slate-800' },
  QUEUED: { label: 'في قائمة الانتظار', color: 'text-slate-300 bg-slate-800' },
  PLANNING: { label: 'إعداد الخطة', color: 'text-sky-300 bg-sky-500/10' },
  AWAITING_PLAN_APPROVAL: { label: 'بانتظار اعتمادك', color: 'text-amber-300 bg-amber-500/10' },
  AWAITING_USER_FEEDBACK: { label: 'يحتاج ملاحظاتك', color: 'text-amber-300 bg-amber-500/10' },
  IN_PROGRESS: { label: 'قيد التنفيذ', color: 'text-sky-300 bg-sky-500/10' },
  PAUSED: { label: 'متوقف مؤقتاً', color: 'text-slate-300 bg-slate-800' },
  COMPLETED: { label: 'مكتملة', color: 'text-emerald-300 bg-emerald-500/10' },
  FAILED: { label: 'تعذّر التنفيذ', color: 'text-rose-300 bg-rose-500/10' },
};
