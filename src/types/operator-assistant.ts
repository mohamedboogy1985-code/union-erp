import type { PortalId } from '../config/portals.js';

export const ASSISTANT_LIMITS = {
  text: 6000,
  audioSeconds: 45,
  audioBytes: 1_500_000,
  fields: 40,
  history: 8,
} as const;
export interface AssistantScreen {
  id: string;
  label: string;
  portalId: PortalId;
  organizationId: string;
}
export interface AssistantField {
  id: string;
  label: string;
  type: string;
}
export interface FieldChange {
  id: string;
  value: string;
}
export type AssistantIntent =
  | { kind: 'answer' }
  | { kind: 'navigate'; screenId: string }
  | { kind: 'fill'; changes: FieldChange[] }
  | { kind: 'report'; reportId: string; startDate?: string; endDate?: string; keyword?: string };
export interface AssistantTurnInput {
  organizationId: string;
  screenId: string;
  consent: true;
  text?: string;
  audio?: { mimeType: 'audio/wav'; data: string };
  fields: AssistantField[];
  history: { role: 'user' | 'assistant'; text: string }[];
}
export interface AssistantTurnResult {
  id: string;
  heardText: string;
  message: string;
  intent: AssistantIntent;
  navigation?: AssistantScreen;
}
export interface AssistantStatus {
  enabled: boolean;
  strictAuth: boolean;
  authenticated: boolean;
  accountReady: boolean;
  textReady: boolean;
  avatarReady: boolean;
  model: string;
  problems: string[];
  screens: AssistantScreen[];
}
export interface AssistantReport {
  id: string;
  title: string;
  organizationId: string;
  generatedAt: string;
  summary: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  totalRows: number;
  truncated: boolean;
}
export interface AvatarConnection {
  id: string;
  offer: RTCSessionDescriptionInit;
  iceServers: RTCIceServer[];
  expiresAt: number;
}

/** These are capabilities, not URLs or arbitrary API/shell instructions. */
export const ASSISTANT_REPORTS = [
  { id: 'trial_balance', label: 'ميزان المراجعة' },
  { id: 'income_expense', label: 'الإيرادات والمصروفات' },
  { id: 'general_ledger', label: 'الأستاذ العام' },
  { id: 'receipts_payments', label: 'المقبوضات والمدفوعات' },
  { id: 'receipts', label: 'سجل التحصيل' },
  { id: 'journal_entries', label: 'القيود المحاسبية' },
  { id: 'debtors', label: 'الجهات والأستاذ المساعد' },
  { id: 'members', label: 'دليل الأعضاء' },
  { id: 'employees', label: 'دليل العاملين' },
] as const;

export const SCREEN_WRITE_PERMISSIONS: Record<string, string> = {
  journals: 'journal:create',
  accounting: 'journal:create',
  receipts: 'receipts:issue',
  members: 'members:manage',
  membership: 'members:manage',
  accounts: 'accounts:manage',
  subledgers: 'subledger:manage',
  employees: 'hr:manage',
  hrs: 'hr:manage',
  payroll: 'hr:manage',
  advances: 'hr:manage',
  attendance: 'attendance:manage',
  models: 'documents:manage',
  banking: 'accounts:manage',
  procurement: 'accounts:manage',
  budgets: 'accounts:manage',
  assets: 'accounts:manage',
  einvoicing: 'accounts:manage',
  settings: 'system:admin',
  committees: 'members:manage',
  actuarial: 'accounts:manage',
};
