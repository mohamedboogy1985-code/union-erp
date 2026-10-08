import assert from 'node:assert';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomAgentStudio } from '../src/components/CustomAgentStudio.js';
import { AiHub } from '../src/pages/AiHub.js';

test('CustomAgentStudio renders agent creation form and default agents list', () => {
  const html = renderToStaticMarkup(
    <CustomAgentStudio
      organizationId="org-123"
      currentUser={{
        id: 'user-1',
        username: 'admin',
        fullName: 'أحمد محمود',
        role: 'ADMIN',
        organizationId: 'org-123',
        isActive: true,
      }}
    />
  );

  assert.match(html, /استوديو الوكلاء المخصصين/);
  assert.match(html, /صناعة وتخصيص وكيل الذكاء الاصطناعي/);
  assert.match(html, /وكيل التدقيق والمراجعة المالية/);
  assert.match(html, /وكيل المستشار الضريبي/);
  assert.match(html, /وكيل المحلل المالي والإستراتيجي/);
});

test('AiHub renders custom agent studio tab by default', () => {
  const html = renderToStaticMarkup(
    <AiHub
      organizationId="org-123"
      currentUser={{
        id: 'user-1',
        username: 'admin',
        fullName: 'أحمد محمود',
        role: 'ADMIN',
        organizationId: 'org-123',
        isActive: true,
      }}
      onShowToast={() => undefined}
      onNavigate={() => undefined}
      onVoiceReceiptDraft={() => undefined}
    />
  );

  assert.match(html, /الوكيل الذكي المخصص \(Custom Agent\)/);
  assert.match(html, /استوديو الوكلاء المخصصين/);
});
