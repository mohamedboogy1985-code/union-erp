import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import * as schema from '../../src/db/schema.js';
import type {
  ActuarialFund,
  ActuarialSimulationParams,
  ActuarialSimulationResult,
} from '../../src/types/erp.js';

const finiteNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

const FUND_TYPES = ['PENSION', 'SOLIDARITY', 'HEALTHCARE', 'EMERGENCY', 'SOCIAL_ACTIVITY'] as const;
const fundType = (value: unknown): ActuarialFund['type'] =>
  typeof value === 'string' && FUND_TYPES.includes(value as ActuarialFund['type'])
    ? value as ActuarialFund['type']
    : 'PENSION';

const fundStatus = (value: string): ActuarialFund['status'] =>
  value === 'SOLVENT' || value === 'WARNING' || value === 'DEFICIT' || value === 'CRITICAL'
    ? value
    : 'WARNING';

const mapFund = (fund: typeof schema.actuarialFunds.$inferSelect): ActuarialFund => ({
  ...fund,
  type: fundType(fund.type),
  status: fundStatus(fund.status),
  createdAt: fund.createdAt?.toISOString(),
  lastValuationDate: fund.lastValuationDate ?? undefined,
  notes: fund.notes ?? undefined,
});

export async function listActuarialFunds(organizationId: string): Promise<ActuarialFund[]> {
  const funds = await db.select().from(schema.actuarialFunds)
    .where(eq(schema.actuarialFunds.organizationId, organizationId));
  return funds.map(mapFund);
}

export async function createActuarialFund(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<ActuarialFund> {
  const name = text(input.name);
  if (!name) throw new Error('اسم الصندوق مطلوب.');
  const currentReserve = finiteNumber(input.currentReserve, 0);
  const targetReserve = finiteNumber(input.targetReserve, 0);
  const solvencyRatio = targetReserve > 0 ? (currentReserve / targetReserve) * 100 : 100;
  const status = solvencyRatio >= 100 ? 'SOLVENT' : solvencyRatio >= 80 ? 'WARNING' : 'DEFICIT';
  const id = `fund-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fund = {
    id,
    code: text(input.code) || `FND-${Math.floor(100 + Math.random() * 900)}`,
    name,
    type: fundType(input.type),
    currentReserve,
    targetReserve,
    actuarialSurplusDeficit: currentReserve - targetReserve,
    discountRate: finiteNumber(input.discountRate, 8.5),
    inflationRate: finiteNumber(input.inflationRate, 12),
    activeMembersCount: Math.max(0, Math.trunc(finiteNumber(input.activeMembersCount, 0))),
    beneficiariesCount: Math.max(0, Math.trunc(finiteNumber(input.beneficiariesCount, 0))),
    monthlyInflow: finiteNumber(input.monthlyInflow, 0),
    monthlyOutflow: finiteNumber(input.monthlyOutflow, 0),
    solvencyRatio,
    status,
    organizationId,
    lastValuationDate: text(input.lastValuationDate) || new Date().toISOString().slice(0, 10),
    notes: text(input.notes),
  };
  const [created] = await db.insert(schema.actuarialFunds).values(fund).returning();
  if (!created) throw new Error('تعذر حفظ الصندوق الاكتواري.');
  return mapFund(created);
}

export async function updateActuarialFund(
  organizationId: string,
  id: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  const [existing] = await db.select().from(schema.actuarialFunds)
    .where(and(eq(schema.actuarialFunds.id, id), eq(schema.actuarialFunds.organizationId, organizationId)))
    .limit(1);
  if (!existing) return false;

  const currentReserve = finiteNumber(input.currentReserve, existing.currentReserve);
  const targetReserve = finiteNumber(input.targetReserve, existing.targetReserve);
  const solvencyRatio = targetReserve > 0 ? (currentReserve / targetReserve) * 100 : 100;
  const status = solvencyRatio >= 100 ? 'SOLVENT' : solvencyRatio >= 80 ? 'WARNING' : 'DEFICIT';
  await db.update(schema.actuarialFunds).set({
    name: text(input.name, existing.name),
    currentReserve,
    targetReserve,
    actuarialSurplusDeficit: currentReserve - targetReserve,
    discountRate: finiteNumber(input.discountRate, existing.discountRate),
    inflationRate: finiteNumber(input.inflationRate, existing.inflationRate),
    activeMembersCount: Math.max(0, Math.trunc(finiteNumber(input.activeMembersCount, existing.activeMembersCount))),
    beneficiariesCount: Math.max(0, Math.trunc(finiteNumber(input.beneficiariesCount, existing.beneficiariesCount))),
    monthlyInflow: finiteNumber(input.monthlyInflow, existing.monthlyInflow),
    monthlyOutflow: finiteNumber(input.monthlyOutflow, existing.monthlyOutflow),
    solvencyRatio,
    status,
    notes: text(input.notes, existing.notes ?? ''),
    lastValuationDate: text(input.lastValuationDate, new Date().toISOString().slice(0, 10)),
  }).where(and(
    eq(schema.actuarialFunds.id, id),
    eq(schema.actuarialFunds.organizationId, organizationId),
  ));
  return true;
}

const rate = (value: unknown, fallback: number): number => finiteNumber(value, fallback);

export async function simulateActuarialFund(
  organizationId: string,
  input: Partial<ActuarialSimulationParams>,
): Promise<ActuarialSimulationResult | null> {
  const fundId = text(input.fundId);
  if (!fundId) return null;
  const [fund] = await db.select().from(schema.actuarialFunds)
    .where(and(
      eq(schema.actuarialFunds.id, fundId),
      eq(schema.actuarialFunds.organizationId, organizationId),
    ))
    .limit(1);
  if (!fund) return null;

  const horizonYears = Math.max(1, Math.min(50, Math.trunc(rate(input.horizonYears, 10))));
  const expectedAnnualReturn = rate(input.expectedAnnualReturn, 9.5);
  const expectedInflation = rate(input.expectedInflation, 11);
  const pensionIncreaseRate = rate(input.pensionIncreaseRate, 8);
  const memberGrowthRate = rate(input.memberGrowthRate, 2.5);
  const retirementRate = rate(input.retirementRate, 4);
  const currentYear = new Date().getFullYear();
  let reserve = fund.currentReserve;
  let annualInflow = fund.monthlyInflow * 12;
  let annualOutflow = fund.monthlyOutflow * 12;
  let depletionYear: number | null = null;
  const projections: ActuarialSimulationResult['projections'] = [];

  for (let yearOffset = 1; yearOffset <= horizonYears; yearOffset += 1) {
    const year = currentYear + yearOffset;
    annualInflow *= 1 + (memberGrowthRate + expectedInflation * 0.3) / 100;
    annualOutflow *= 1 + (pensionIncreaseRate + retirementRate * 0.4) / 100;
    const investmentReturn = reserve > 0 ? reserve * (expectedAnnualReturn / 100) : 0;
    const netCashFlow = annualInflow + investmentReturn - annualOutflow;
    reserve += netCashFlow;
    if (reserve <= 0 && depletionYear === null) depletionYear = year;

    const requiredReserveAtYear = annualOutflow * 3.5;
    const solvencyRatio = requiredReserveAtYear > 0 ? (Math.max(0, reserve) / requiredReserveAtYear) * 100 : 0;
    projections.push({
      year,
      yearLabel: String(year),
      projectedReserve: Math.round(reserve),
      projectedContributions: Math.round(annualInflow),
      projectedBenefitsPaid: Math.round(annualOutflow),
      netCashFlow: Math.round(netCashFlow),
      solvencyRatio: Number(solvencyRatio.toFixed(1)),
      isSolvent: reserve > 0,
    });
  }

  const sustainableYears = depletionYear ? depletionYear - currentYear : horizonYears;
  const summaryStatus = !depletionYear
    ? 'HEALTHY'
    : sustainableYears >= 7 ? 'MODERATE_RISK' : 'HIGH_DEFICIT_RISK';
  const recommendedContributionIncrease = summaryStatus === 'HIGH_DEFICIT_RISK'
    ? 18.5
    : summaryStatus === 'MODERATE_RISK' ? 9 : 0;
  const recommendedReserveInjection = summaryStatus === 'HIGH_DEFICIT_RISK' ? Math.round(Math.abs(reserve) * 0.4) : 0;
  const actuarialOpinion = summaryStatus === 'HEALTHY'
    ? `يتمتع الصندوق بمتانة مالية واحتياطي استثماري مستقر يلبي التزامات المعاشات والمزايا للأعضاء على مدى ${horizonYears} سنوات قادمة بمعدل عائد متوقع ${expectedAnnualReturn}%.`
    : `تظهر المحاكاة ضغطاً إكتوارياً مستقبلياً مع احتمالية استنزاف الاحتياطي بحلول عام ${depletionYear}. يُوصى بمراجعة اشتراكات الصندوق ورفع العائد الاستثماري لمحافظ الودائع وصناديق الاستثمار.`;

  return {
    fundId,
    fundName: fund.name,
    horizonYears,
    depletionYear,
    sustainableYears,
    recommendedContributionIncrease,
    recommendedReserveInjection,
    summaryStatus,
    actuarialOpinion,
    projections,
  };
}
