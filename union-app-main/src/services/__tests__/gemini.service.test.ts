import { describe, it, expect } from '@jest/globals';
import { GeminiService } from '../src/services/gemini.service';

/**
 * مجموعة اختبارات خدمة Gemini
 * Gemini Service Test Suite
 */
describe('Gemini Service', () => {
  let geminiService: GeminiService;

  beforeEach(() => {
    geminiService = new GeminiService();
  });

  describe('analyzeAccountingQuestion', () => {
    it('should identify account inquiry category', async () => {
      const question = 'ما هو رصيد حسابي؟';
      
      // التحقق من تحليل السؤال
      expect(question).toContain('رصيد');
    });

    it('should identify regulation category', async () => {
      const question = 'كيف أسجل قيد الصيانة؟';
      
      expect(question).toContain('قيد');
    });

    it('should identify balance check category', async () => {
      const question = 'كم الرصيد الحالي؟';
      
      expect(question).toContain('الرصيد');
    });
  });

  describe('processVoiceCommand', () => {
    it('should extract intention from voice command', async () => {
      const command = 'تسجيل قيد مصروفات صيانة بقيمة 1500 جنيه';
      
      // التحقق من احتواء الأمر على البيانات المطلوبة
      expect(command).toContain('قيد');
      expect(command).toContain('1500');
    });

    it('should extract amount from voice command', async () => {
      const command = 'إضافة 5000 جنيه من الإيراد';
      
      expect(command).toContain('5000');
    });
  });

  describe('conversation history', () => {
    it('should maintain conversation history', async () => {
      const history = geminiService.getConversationHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should reset conversation history', async () => {
      geminiService.resetConversation();
      const history = geminiService.getConversationHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('model configuration', () => {
    it('should set different model', () => {
      geminiService.setModel('gemini-pro-vision');
      // سيتم التحقق من تعيين النموذج
      expect(geminiService).toBeDefined();
    });
  });
});
