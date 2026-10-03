import { db, getPool } from '../../src/db/index.js';
import * as schema from '../../src/db/schema.js';
import { STATUTORY_DISTRIBUTION_MODELS } from '../data/statutory-distribution-models.js';
import type {
  StatutoryDistributionModel,
  StatutoryDistributionModelRow,
  StatutoryDistributionModelsResponse,
} from '../../src/types/erp.distribution.js';

/** Create the article-2 model tables on both fresh and already-existing PostgreSQL databases. */
export async function ensureStatutoryDistributionTables(): Promise<void> {
  await getPool().query(`CREATE TABLE IF NOT EXISTS statutory_distribution_models (
    id text PRIMARY KEY NOT NULL,
    code text NOT NULL UNIQUE,
    model_kind text NOT NULL,
    title_ar text NOT NULL,
    article_no text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    posting_enabled boolean DEFAULT false NOT NULL,
    posting_block_reason_ar text DEFAULT '' NOT NULL,
    source_file text NOT NULL,
    source_path text NOT NULL,
    source_sheet_ar text NOT NULL,
    source_commit text NOT NULL,
    source_sha256 text NOT NULL,
    source_row_count integer NOT NULL,
    basis_ar text NOT NULL,
    calculation_ar text NOT NULL,
    scope_ar text NOT NULL,
    share_config jsonb NOT NULL,
    totals jsonb,
    open_items_ar jsonb NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
  )`);
  await getPool().query(`CREATE TABLE IF NOT EXISTS statutory_distribution_model_rows (
    id text PRIMARY KEY NOT NULL,
    model_id text NOT NULL REFERENCES statutory_distribution_models(id) ON DELETE CASCADE,
    sequence_no integer NOT NULL,
    source_row integer NOT NULL,
    name_ar text NOT NULL,
    governorate_ar text,
    member_count integer,
    membership_fee_per_member numeric(18,2),
    receipt_range_ar text,
    receipts_count integer,
    receipt_fee numeric(18,2),
    gross_collected numeric(18,2),
    education_support numeric(18,2),
    distribution_base numeric(18,2),
    general_share numeric(18,2),
    committee_share numeric(18,2),
    federation_share numeric(18,2),
    printing_share numeric(18,2),
    general_collected numeric(18,2),
    calculated boolean DEFAULT false NOT NULL,
    source_formulas jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
  )`);
  await getPool().query(`CREATE UNIQUE INDEX IF NOT EXISTS statutory_distribution_model_rows_model_sequence_unique
    ON statutory_distribution_model_rows (model_id, sequence_no)`);
}

const rowValues = (modelId: string, row: StatutoryDistributionModelRow) => ({
  id: row.id,
  modelId,
  sequenceNo: row.sequence,
  sourceRow: row.sourceRow,
  nameAr: row.nameAr,
  governorateAr: row.governorateAr,
  memberCount: row.memberCount,
  membershipFeePerMember: row.membershipFeePerMember,
  receiptRangeAr: row.receiptRangeAr,
  receiptsCount: row.receiptsCount,
  receiptFee: row.receiptFee,
  grossCollected: row.grossCollected,
  educationSupport: row.educationSupport,
  distributionBase: row.distributionBase,
  generalShare: row.generalShare,
  committeeShare: row.committeeShare,
  federationShare: row.federationShare,
  printingShare: row.printingShare,
  generalCollected: row.generalCollected,
  calculated: row.calculated,
  sourceFormulas: row.sourceFormulas,
});

/**
 * Idempotently seed the two Excel-backed reference models. The account mapping is
 * intentionally absent; `postingEnabled` stays false until COA-OPEN-003 is resolved.
 * Existing activation choices are not overwritten on conflict.
 */
export async function seedStatutoryDistributionModels(): Promise<{ models: number; rows: number }> {
  let rowCount = 0;
  for (const model of STATUTORY_DISTRIBUTION_MODELS) {
    await db.insert(schema.statutoryDistributionModels).values({
      id: model.id,
      code: model.code,
      modelKind: model.modelKind,
      titleAr: model.titleAr,
      articleNo: model.articleNo,
      isActive: model.isActive,
      postingEnabled: model.postingEnabled,
      postingBlockReasonAr: model.postingBlockReasonAr,
      sourceFile: model.sourceFile,
      sourcePath: model.sourcePath,
      sourceSheetAr: model.sourceSheetAr,
      sourceCommit: model.sourceCommit,
      sourceSha256: model.sourceSha256,
      sourceRowCount: model.sourceRowCount,
      basisAr: model.basisAr,
      calculationAr: model.calculationAr,
      scopeAr: model.scopeAr,
      shareConfig: model.shareConfig,
      totals: model.totals,
      openItemsAr: model.openItemsAr,
      updatedAt: new Date(),
    }).onConflictDoNothing();

    for (const row of model.rows) {
      await db.insert(schema.statutoryDistributionModelRows)
        .values(rowValues(model.id, row))
        .onConflictDoNothing();
      rowCount += 1;
    }
  }
  return { models: STATUTORY_DISTRIBUTION_MODELS.length, rows: rowCount };
}

const asObject = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as T : fallback;

const mapStoredRow = (row: typeof schema.statutoryDistributionModelRows.$inferSelect): StatutoryDistributionModelRow => ({
  id: row.id,
  sequence: row.sequenceNo,
  sourceRow: row.sourceRow,
  nameAr: row.nameAr,
  governorateAr: row.governorateAr,
  memberCount: row.memberCount,
  membershipFeePerMember: row.membershipFeePerMember,
  receiptRangeAr: row.receiptRangeAr,
  receiptsCount: row.receiptsCount,
  receiptFee: row.receiptFee,
  grossCollected: row.grossCollected,
  educationSupport: row.educationSupport,
  distributionBase: row.distributionBase,
  generalShare: row.generalShare,
  committeeShare: row.committeeShare,
  federationShare: row.federationShare,
  printingShare: row.printingShare,
  generalCollected: row.generalCollected,
  calculated: row.calculated,
  sourceFormulas: asObject(row.sourceFormulas, {}),
});

const modelFromStoredRow = (
  row: typeof schema.statutoryDistributionModels.$inferSelect,
  rows: StatutoryDistributionModelRow[],
): StatutoryDistributionModel => {
  const fallback = STATUTORY_DISTRIBUTION_MODELS.find((model) => model.id === row.id);
  return {
    id: row.id,
    code: row.code,
    modelKind: row.modelKind as StatutoryDistributionModel['modelKind'],
    titleAr: row.titleAr,
    articleNo: row.articleNo,
    isActive: row.isActive,
    postingEnabled: row.postingEnabled,
    postingBlockReasonAr: row.postingBlockReasonAr,
    sourceFile: row.sourceFile,
    sourcePath: row.sourcePath,
    sourceSheetAr: row.sourceSheetAr,
    sourceCommit: row.sourceCommit,
    sourceSha256: row.sourceSha256,
    sourceRowCount: row.sourceRowCount,
    basisAr: row.basisAr,
    calculationAr: row.calculationAr,
    scopeAr: row.scopeAr,
    shareConfig: asObject(row.shareConfig, fallback?.shareConfig ?? {
      generalPercent: 30,
      committeePercent: 60,
      federationPercent: 10,
      generalBeneficiaryAr: 'النقابة العامة',
      committeeBeneficiaryAr: 'اللجنة النقابية',
      federationBeneficiaryAr: 'الاتحاد النقابي إن وجد',
      distributionBaseAr: '',
      educationSupportPerReceipt: null,
      educationSupportBeneficiaryAr: null,
      extraPercentages: [],
    }),
    totals: row.totals === null ? null : asObject(row.totals, fallback?.totals ?? null),
    openItemsAr: Array.isArray(row.openItemsAr) ? row.openItemsAr.map(String) : (fallback?.openItemsAr ?? []),
    rows,
  };
};

const memoryFallback = (): StatutoryDistributionModelsResponse => ({
  storageBackend: 'memory',
  models: structuredClone(STATUTORY_DISTRIBUTION_MODELS),
});

/** Read active status and imported rows back from SQL; fall back without weakening API auth. */
export async function loadStatutoryDistributionModels(
  usePostgres: boolean,
): Promise<StatutoryDistributionModelsResponse> {
  if (!usePostgres) return memoryFallback();
  try {
    const [storedModels, storedRows] = await Promise.all([
      db.select().from(schema.statutoryDistributionModels),
      db.select().from(schema.statutoryDistributionModelRows),
    ]);
    if (storedModels.length === 0) return memoryFallback();
    storedRows.sort((a, b) => a.modelId.localeCompare(b.modelId) || a.sequenceNo - b.sequenceNo);
    const rowsByModel = new Map<string, StatutoryDistributionModelRow[]>();
    for (const row of storedRows) {
      const list = rowsByModel.get(row.modelId) ?? [];
      list.push(mapStoredRow(row));
      rowsByModel.set(row.modelId, list);
    }
    const models = storedModels.map((model) => modelFromStoredRow(model, rowsByModel.get(model.id) ?? []));
    models.sort((a, b) => a.modelKind.localeCompare(b.modelKind));
    return { storageBackend: 'postgres', models };
  } catch {
    return memoryFallback();
  }
}
