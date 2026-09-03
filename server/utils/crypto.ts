import crypto from 'crypto';

export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function hashNationalId(nationalId: string): string {
  const salt = 'union-erp-national-id-salt-2026';
  return crypto.createHmac('sha256', salt).update(nationalId.trim()).digest('hex');
}

export function maskNationalId(nationalId: string): string {
  const clean = nationalId.trim();
  if (clean.length < 8) return '****';
  return clean.slice(0, 3) + '******' + clean.slice(-4);
}

export function maskIban(iban: string): string {
  const clean = iban.trim();
  if (clean.length < 10) return 'EG****************';
  return clean.slice(0, 4) + ' **** **** **** ' + clean.slice(-4);
}

export function generateVerificationToken(prefix = 'TOK'): string {
  const random = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `${prefix}-${random}`;
}

export function calculateAuditHash(
  timestamp: string,
  userId: string,
  action: string,
  entityId: string,
  previousHash: string
): string {
  return sha256(`${timestamp}:${userId}:${action}:${entityId}:${previousHash}`);
}
