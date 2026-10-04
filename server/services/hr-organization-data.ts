import { erpStore } from '../db/store.js';

/**
 * Resolve an HR row's tenant from its own organizationId, or from its linked
 * employee only when the legacy employee ID has exactly one owner. Ambiguous
 * and unassigned legacy rows fail closed.
 */
export function employeeDataBelongsToOrganization(
  employeeId: string,
  organizationId: string,
  recordOrganizationId?: unknown,
): boolean {
  if (!employeeId || !organizationId) return false;

  if (typeof recordOrganizationId === 'string' && recordOrganizationId.trim()) {
    return recordOrganizationId === organizationId;
  }

  const matches = (erpStore.employees ?? []).filter((employee) => employee.id === employeeId);
  if (matches.length !== 1) return false;
  return matches[0].organizationId === organizationId;
}
