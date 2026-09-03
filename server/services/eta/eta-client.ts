import axios, { AxiosInstance } from 'axios';
import {
  getEtaCredentials,
  getEtaEndpoints,
  getEtaEnv,
  isEtaConfigured,
  readEtaPrivateKey,
} from './eta-config.js';
import { buildEtaRequestSigning, uuid } from './eta-crypto.js';

/**
 * ===== عميل HTTPS لمنظومة الفاتورة الإلكترونية (ETA) =====
 * يشمل:
 *  - الحصول على توكن OAuth2 (client_credentials) مع تخزين مؤقت.
 *  - إرسال/استعلام/تنزيل/إلغاء المستندات.
 *  - توقيع الطلبات وفق معيار Standard 1.0 عند توفر السر.
 *  - وضع محاكاة آمن عند غياب بيانات الاعتماد (بدون أي إرسال حقيقي).
 */

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function clearEtaTokenCache(): void {
  cachedToken = null;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > nowSeconds() + 60) {
    return cachedToken.accessToken;
  }
  const cred = getEtaCredentials();
  const endpoints = getEtaEndpoints();

  const params = new URLSearchParams();
  params.append('grant_type', cred.grantType || 'client_credentials');
  params.append('client_id', cred.clientId);
  params.append('client_secret', cred.clientSecret);

  const res = await axios.post(endpoints.token, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });
  const data = res.data || {};
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? nowSeconds() + Number(data.expires_in) : nowSeconds() + 3600,
  };
  return cachedToken.accessToken;
}

function buildClient(): AxiosInstance {
  return axios.create({
    timeout: 45000,
    maxBodyLength: 20 * 1024 * 1024,
  });
}

function signRequest(client: AxiosInstance, method: string, uri: string, body?: string): void {
  const cred = getEtaCredentials();
  if (!cred.clientSecret) return;
  const { timestamp, signature } = buildEtaRequestSigning({
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    uri,
    method,
    body,
    timestamp: new Date().toISOString(),
  });
  client.defaults.headers.common['X-Timestamp'] = timestamp;
  client.defaults.headers.common['X-Signature'] = signature;
}

/**
 * مولد استجابة محاكاة واقعية (يُستخدَم فقط عند غياب بيانات الاعتماد)
 * حتى يمكن اختبار سير العمل كاملاً دون إرسال مستند حقيقي.
 */
function simulatedSubmission(docUuid: string): Record<string, any> {
  const submissions = [uuid(), uuid()];
  return {
    simulated: true,
    submissionId: `SUB-${submissions[0].substring(0, 8).toUpperCase()}`,
    acceptedDocuments: [
      { uuid: docUuid, longId: `${uuid()}`, internalId: docUuid, status: 'VALID' },
    ],
    rejectedDocuments: [],
    submission: {
      submissionId: `SUB-${submissions[0].substring(0, 8).toUpperCase()}`,
      status: 'VALID',
      createdBy: 'simulated',
      uuid: docUuid,
      acceptedDocumentCount: 1,
      rejectedDocumentCount: 0,
    },
  };
}

export const etaClient = {
  async submitDocuments(documents: Record<string, any>[]): Promise<Record<string, any>> {
    if (!isEtaConfigured()) {
      const first = documents[0]?.documentHeader?.uuid || '';
      return simulatedSubmission(first);
    }
    const client = buildClient();
    const token = await getAccessToken();
    const body = JSON.stringify({ documents });
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    client.defaults.headers.common['Content-Type'] = 'application/json';
    signRequest(client, 'POST', getEtaEndpoints().submit, body);
    const res = await client.post(getEtaEndpoints().submit, body);
    return res.data;
  },

  async querySubmission(submissionId: string): Promise<Record<string, any>> {
    if (!isEtaConfigured()) {
      return {
        simulated: true,
        documents: [],
        queryParameters: { submissionId },
        status: 'VALID',
      };
    }
    const client = buildClient();
    const token = await getAccessToken();
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    signRequest(client, 'GET', `${getEtaEndpoints().query}/${submissionId}/documents`);
    const res = await client.get(`${getEtaEndpoints().query}/${submissionId}/documents`);
    return res.data;
  },

  async verifyDocument(documentId: string): Promise<Record<string, any>> {
    if (!isEtaConfigured()) {
      return { simulated: true, documentUuid: documentId, status: 'VALID' };
    }
    const client = buildClient();
    const token = await getAccessToken();
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    signRequest(client, 'GET', `${getEtaEndpoints().verify}/${documentId}/verify`);
    const res = await client.get(`${getEtaEndpoints().verify}/${documentId}/verify`);
    return res.data;
  },

  async downloadDocument(documentId: string): Promise<Buffer> {
    if (!isEtaConfigured()) {
      return Buffer.from(JSON.stringify({ simulated: true, uuid: documentId }));
    }
    const client = buildClient();
    const token = await getAccessToken();
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    client.defaults.responseType = 'arraybuffer';
    signRequest(client, 'GET', `${getEtaEndpoints().download}/${documentId}/raw`);
    const res = await client.get(`${getEtaEndpoints().download}/${documentId}/raw`);
    return Buffer.from(res.data);
  },

  async cancelDocument(documentId: string, reason: string): Promise<Record<string, any>> {
    if (!isEtaConfigured()) {
      return { simulated: true, uuid: documentId, status: 'CANCELLED', reason };
    }
    const client = buildClient();
    const token = await getAccessToken();
    const body = JSON.stringify({ status: 'CANCELLED', rejectionReason: reason });
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    client.defaults.headers.common['Content-Type'] = 'application/json';
    signRequest(client, 'POST', `${getEtaEndpoints().cancel}/${documentId}/state/cancel`, body);
    const res = await client.post(`${getEtaEndpoints().cancel}/${documentId}/state/cancel`, body);
    return res.data;
  },

  async getIssuer(): Promise<Record<string, any>> {
    if (!isEtaConfigured()) {
      return {
        simulated: true,
        idType: 'B',
        name: 'النقابة العامة للعاملين بصناعات البناء والأخشاب',
        taxId: '877-640-100',
      };
    }
    const client = buildClient();
    const token = await getAccessToken();
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    signRequest(client, 'GET', getEtaEndpoints().issuer);
    const res = await client.get(getEtaEndpoints().issuer);
    return res.data;
  },
};

export { getEtaEnv, readEtaPrivateKey };
