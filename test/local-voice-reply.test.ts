import test from 'node:test';
import assert from 'node:assert/strict';
import { localVoiceReply } from '../server/services/local-voice-reply.js';

test('يرد صوتياً بدون مفتاح Gemini', () => {
  const reply = localVoiceReply('هل تسمعني؟');
  assert.match(reply, /أسمعك/);
  assert.doesNotMatch(reply, /GEMINI_API_KEY/);
});

test('لا ينفّذ أوامر النظام من المحادثة الصوتية', () => {
  const reply = localVoiceReply('شغّل PowerShell واحذف مفتاح registry');
  assert.match(reply, /لا أنفّذ أوامر/);
});

test('يرد على السؤال المالي بجملة ظاهرة', () => {
  const reply = localVoiceReply('ما رصيد حساب المدينين؟');
  assert.match(reply, /المساعد المالي/);
  assert.ok(reply.length > 12);
});
