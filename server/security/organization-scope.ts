import type { User } from '../../src/types/erp.js';
import { can } from './permissions.js';

export type OrganizationScopeResult =
  | { ok: true; organizationId: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Organization access is always granted from the authenticated user's server-side
 * record. A requested organization may select among those grants, but can never
 * create a grant by itself.
 */
export function userCanAccessOrganization(user: User, organizationId: string): boolean {
  return Boolean(
    organizationId &&
    (user.organizationId === organizationId ||
      (Array.isArray(user.allowedOrgIds) && user.allowedOrgIds.includes(organizationId)) ||
      can(user, 'system:admin')),
  );
}

/** Resolve a requested organization against the authenticated user's grants. */
export function resolveOrganizationScope(
  user: User,
  requestedOrganizationId: unknown,
): OrganizationScopeResult {
  const organizationId = requestedOrganizationId === undefined
    ? user.organizationId
    : typeof requestedOrganizationId === 'string'
      ? requestedOrganizationId.trim()
      : '';

  if (
    !organizationId ||
    organizationId.length > 80 ||
    /[\u0000-\u001F\u007F]/.test(organizationId)
  ) {
    return { ok: false, status: 400, error: 'معرّف المؤسسة غير صالح.' };
  }

  if (!userCanAccessOrganization(user, organizationId)) {
    return { ok: false, status: 403, error: 'غير مصرح بالوصول إلى بيانات هذه المؤسسة.' };
  }

  return { ok: true, organizationId };
}
