import {
  buildEtaDocument,
  BuiltEtaDocument,
  EtaDocumentInput,
  journalEntryToInvoiceInput,
  receiptToInvoiceInput,
} from './eta/invoice-builder.js';
import { etaClient } from './eta/eta-client.js';
import { etaStore } from './eta/eta-store.js';
import { getEtaStatus, isEtaConfigured } from './eta/eta-config.js';

/**
 * ===== خدمة تنسيق منظومة ETA =====
 * تحوي الإرسال الحقيقي/المحاكاة، التخزين، والاستعلام المرتجع من البوابة.
 */

function normalizeSubmissionResult(
  built: BuiltEtaDocument,
  createdBy: string,
  raw: Record<string, any>
) {
  const accepted = raw?.acceptedDocuments?.[0];
  const status = (accepted?.status)?.toUpperCase?.() as string;
  return etaStore.save({
    uuid: built.uuid,
    internalId: built.internalId,
    source: built.source,
    docType: built.document.documentHeader.documentType || 'INVOICE',
    docNumber: built.document.documentHeader.documentReference?.[0]?.referenceID || built.uuid,
    receiverName: built.document.documentHeader.issuedFor?.name || '',
    netAmount: built.totals.netAmount,
    taxAmount: built.totals.taxAmount,
    grossAmount: built.totals.grossAmount,
    submissionId: raw?.submissionId || raw?.submission?.submissionId,
    status: /VALID|VALID|SUBMITTED/.test(status || '') ? 'VALID' : status === 'REJECTED' ? 'REJECTED' : 'SUBMITTED',
    etaStatusCode: status,
    etaValidationErrors: undefined,
    simulated: !!raw?.simulated,
    createdBy,
    createdAt: new Date().toISOString(),
    responseRaw: raw,
  });
}

export const etaService = {
  getStatus() {
    return getEtaStatus();
  },

  async submit(input: EtaDocumentInput, createdBy: string) {
    const built = buildEtaDocument(input);
    const raw = await etaClient.submitDocuments([built.document]);
    normalizeSubmissionResult(built, createdBy, raw);
    return {
      uuid: built.uuid,
      docNumber: input.docNumber,
      status: raw?.acceptedDocuments?.[0]?.status || 'SUBMITTED',
      submissionId: raw?.submissionId || raw?.submission?.submissionId,
      simulated: !!raw?.simulated || built.signatureSimulated,
      totals: built.totals,
      document: built.document,
    };
  },

  /** يسحب من إيصال ويرسل كمستند للنقابة */
  async submitFromReceipt(receipt: any, createdBy: string) {
    return this.submit(receiptToInvoiceInput(receipt), createdBy);
  },

  /** يسحب من قيد محاسبي ويرسل */
  async submitFromJournal(entry: any, createdBy: string) {
    return this.submit(journalEntryToInvoiceInput(entry), createdBy);
  },

  list() {
    return etaStore.list();
  },

  get(uuid: string) {
    return etaStore.get(uuid);
  },

  async querySubmission(submissionId: string) {
    const raw = await etaClient.querySubmission(submissionId);
    return raw;
  },

  async verify(uuid: string) {
    const rec = etaStore.get(uuid);
    if (!rec) throw new Error('المستند غير موجود.');

    if (!isEtaConfigured() || rec.simulated) {
      const updated = etaStore.update(uuid, { status: 'VALID', etaStatusCode: 'VALID' });
      return { simulated: true, status: 'VALID', record: updated };
    }

    const raw = await etaClient.verifyDocument(uuid);
    const status = ((raw?.status || raw?.documentStatus || 'PENDING') as string).toUpperCase();
    const updated = etaStore.update(uuid, {
      status: status as any,
      etaStatusCode: status,
      etaValidationErrors: raw?.validationErrors,
    });
    return { raw, record: updated };
  },

  async download(uuid: string) {
    const rec = etaStore.get(uuid);
    if (!rec) throw new Error('المستند غير موجود.');
    if (!isEtaConfigured() || rec.simulated) {
      return {
        buffer: Buffer.from(JSON.stringify({ ...rec, note: 'محاكاة — بيانات العرض فقط' }, null, 2)),
        fileName: `${uuid}.json`,
        contentType: 'application/json',
      };
    }
    const buffer = await etaClient.downloadDocument(uuid);
    return { buffer, fileName: `${uuid}.pdf`, contentType: 'application/pdf' };
  },

  async cancel(uuid: string, reason: string) {
    const rec = etaStore.get(uuid);
    if (!rec) throw new Error('المستند غير موجود.');
    const raw = await etaClient.cancelDocument(uuid, reason);
    const updated = etaStore.update(uuid, { status: 'CANCELLED', etaStatusCode: 'CANCELLED' });
    return { raw, record: updated };
  },
};
