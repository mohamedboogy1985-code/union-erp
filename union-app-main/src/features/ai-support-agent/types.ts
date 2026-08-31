// أنواع البيانات للمساعد الذكي

export enum TicketCategoryType {
  ACCOUNT_INQUIRY = 'ACCOUNT_INQUIRY',
  REGULATION = 'REGULATION',
  BALANCE_CHECK = 'BALANCE_CHECK',
  ENTRY_HELP = 'ENTRY_HELP',
  TECHNICAL_SUPPORT = 'TECHNICAL_SUPPORT',
  OTHER = 'OTHER'
}

export interface SupportQuestion {
  question: string;
  questionAr: string;
  category?: TicketCategoryType;
  userId: string;
  context?: QuestionContext;
}

export interface QuestionContext {
  recentEntries?: string[];
  relevantAccounts?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
}

export interface SupportAnswer {
  answer: string;
  answerAr: string;
  sources: AnswerSource[];
  confidence: number;
  suggestedActions?: SuggestedAction[];
}

export interface AnswerSource {
  type: 'ACCOUNT' | 'REGULATION' | 'FAQ' | 'DATABASE';
  reference: string;
  data?: any;
}

export interface SuggestedAction {
  action: string;
  actionAr: string;
  type: 'CREATE_ENTRY' | 'UPDATE_ACCOUNT' | 'FETCH_DATA';
  params?: any;
}

export interface BalanceInfo {
  accountId: string;
  accountName: string;
  currentBalance: number;
  previousBalance: number;
  changeAmount: number;
  lastUpdateDate: Date;
  recentTransactions: Transaction[];
}

export interface Transaction {
  entryId: string;
  date: Date;
  description: string;
  debit: number;
  credit: number;
  status: string;
}

export interface AccountBalance {
  code: string;
  name: string;
  nameAr: string;
  balance: number;
  type: string;
  lastUpdate: Date;
}
