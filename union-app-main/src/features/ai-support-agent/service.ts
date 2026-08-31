import { PrismaClient } from '@prisma/client';
import {
  SupportQuestion,
  SupportAnswer,
  BalanceInfo,
  TicketCategoryType,
  AnswerSource
} from './types';

const prisma = new PrismaClient();

export class AISuportAgentService {
  /**
   * معالجة سؤال المستخدم والحصول على إجابة ذكية
   */
  async handleQuestion(question: SupportQuestion): Promise<SupportAnswer> {
    try {
      // 1. تصنيف السؤال
      const category = await this.classifyQuestion(question.question);
      question.category = category;

      // 2. جمع البيانات ذات الصلة
      const relevantData = await this.gatherRelevantData(question);

      // 3. توليد الإجابة باستخدام Gemini AI
      const answer = await this.generateAnswer(question, relevantData);

      // 4. حفظ في قاعدة البيانات
      await this.saveSupportTicket(question, answer);

      return answer;
    } catch (error) {
      console.error('Error handling question:', error);
      throw new Error('Failed to process question');
    }
  }

  /**
   * الحصول على رصيد الحساب 1301 فوراً
   */
  async getAccount1301Balance(userId: string): Promise<BalanceInfo> {
    try {
      const account = await prisma.account.findFirst({
        where: {
          code: '1301',
          userId
        },
        include: {
          journalEntryDetails: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!account) {
        throw new Error('Account 1301 not found');
      }

      // حساب آخر 10 معاملات
      const transactions = account.journalEntryDetails.map(detail => ({
        entryId: detail.entryId,
        date: detail.createdAt,
        description: detail.description || detail.descriptionAr || 'No description',
        debit: Number(detail.debit),
        credit: Number(detail.credit),
        status: 'COMPLETED'
      }));

      const previousBalance = Number(account.balance);
      const totalChange = transactions.reduce(
        (sum, t) => sum + t.debit - t.credit,
        0
      );

      return {
        accountId: account.id,
        accountName: account.name,
        currentBalance: previousBalance,
        previousBalance: previousBalance - totalChange,
        changeAmount: totalChange,
        lastUpdateDate: account.updatedAt,
        recentTransactions: transactions
      };
    } catch (error) {
      console.error('Error fetching Account 1301:', error);
      throw error;
    }
  }

  /**
   * الحصول على آخر الإيصالات
   */
  async getLatestReceipts(userId: string, limit: number = 5) {
    try {
      return await prisma.journalEntry.findMany({
        where: {
          userId,
          source: 'MANUAL'
        },
        orderBy: { date: 'desc' },
        take: limit,
        include: {
          details: true
        }
      });
    } catch (error) {
      console.error('Error fetching latest receipts:', error);
      throw error;
    }
  }

  /**
   * الحصول على حالة القيود المعلقة
   */
  async getPendingEntries(userId: string) {
    try {
      return await prisma.journalEntry.findMany({
        where: {
          userId,
          status: 'PENDING'
        },
        orderBy: { createdAt: 'desc' },
        include: {
          details: {
            include: { account: true }
          }
        }
      });
    } catch (error) {
      console.error('Error fetching pending entries:', error);
      throw error;
    }
  }

  /**
   * تصنيف السؤال تلقائياً
   */
  private async classifyQuestion(question: string): Promise<TicketCategoryType> {
    const keywords = {
      [TicketCategoryType.ACCOUNT_INQUIRY]: ['رصيد', 'حساب', 'كم', 'إجمالي'],
      [TicketCategoryType.BALANCE_CHECK]: ['كم الرصيد', 'ما الرصيد', 'الرصيد الحالي'],
      [TicketCategoryType.REGULATION]: ['قانون', 'لائحة', 'نظام', 'قاعدة'],
      [TicketCategoryType.ENTRY_HELP]: ['قيد', 'إدخال', 'جنرال', 'يومية'],
      [TicketCategoryType.TECHNICAL_SUPPORT]: ['خطأ', 'مشكلة', 'لا يعمل', 'عطل']
    };

    for (const [category, keywords_list] of Object.entries(keywords)) {
      if (keywords_list.some(kw => question.includes(kw))) {
        return category as TicketCategoryType;
      }
    }

    return TicketCategoryType.OTHER;
  }

  /**
   * جمع البيانات ذات الصلة
   */
  private async gatherRelevantData(question: SupportQuestion): Promise<any> {
    const data: any = {};

    // جمع البيانات حسب نوع السؤال
    if (question.category === TicketCategoryType.BALANCE_CHECK) {
      data.account1301 = await this.getAccount1301Balance(question.userId);
      data.allAccounts = await prisma.account.findMany({
        where: { userId: question.userId },
        select: { code: true, name: true, nameAr: true, balance: true }
      });
    }

    if (
      question.category === TicketCategoryType.ACCOUNT_INQUIRY ||
      question.category === TicketCategoryType.ENTRY_HELP
    ) {
      data.recentEntries = await this.getLatestReceipts(question.userId, 5);
      data.pendingEntries = await this.getPendingEntries(question.userId);
    }

    return data;
  }

  /**
   * توليد الإجابة من Gemini AI
   */
  private async generateAnswer(
    question: SupportQuestion,
    data: any
  ): Promise<SupportAnswer> {
    // هذا سيتم تطويره مع Gemini API
    // مثال بسيط الآن

    const sources: AnswerSource[] = [];

    if (data.account1301) {
      sources.push({
        type: 'ACCOUNT',
        reference: 'Account 1301',
        data: data.account1301
      });
    }

    return {
      answer: 'Answer will be generated by Gemini AI',
      answerAr: 'سيتم توليد الإجابة من قبل Gemini AI',
      sources,
      confidence: 0.85,
      suggestedActions: []
    };
  }

  /**
   * حفظ السؤال والإجابة في قاعدة البيانات
   */
  private async saveSupportTicket(
    question: SupportQuestion,
    answer: SupportAnswer
  ): Promise<void> {
    try {
      await prisma.supportTicket.create({
        data: {
          question: question.question,
          questionAr: question.questionAr,
          category: question.category || TicketCategoryType.OTHER,
          answer: answer.answer,
          answerAr: answer.answerAr,
          sources: answer.sources,
          confidence: answer.confidence,
          userId: question.userId
        }
      });
    } catch (error) {
      console.error('Error saving support ticket:', error);
      // Don't throw to prevent losing the answer
    }
  }
}
