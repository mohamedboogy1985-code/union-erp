import { Router, Request, Response } from 'express';
import { AISuportAgentService } from './service';
import { SupportQuestion } from './types';

const router = Router();
const aiService = new AISuportAgentService();

/**
 * POST /api/support/ask
 * Submit a support question
 */
router.post('/ask', async (req: Request, res: Response) => {
  try {
    const { question, questionAr, userId } = req.body;

    const supportQuestion: SupportQuestion = {
      question,
      questionAr,
      userId
    };

    const answer = await aiService.handleQuestion(supportQuestion);

    res.json({
      success: true,
      data: answer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process question',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/support/account/1301/balance
 * Get Account 1301 balance immediately
 */
router.get('/account/1301/balance', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const balanceInfo = await aiService.getAccount1301Balance(userId);

    res.json({
      success: true,
      data: balanceInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account balance',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/support/receipts/latest
 * Get latest receipts
 */
router.get('/receipts/latest', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 5;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const receipts = await aiService.getLatestReceipts(userId, limit);

    res.json({
      success: true,
      data: receipts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch receipts',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/support/entries/pending
 * Get pending journal entries
 */
router.get('/entries/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    const pendingEntries = await aiService.getPendingEntries(userId);

    res.json({
      success: true,
      data: pendingEntries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending entries',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
