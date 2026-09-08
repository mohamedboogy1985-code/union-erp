import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { parse } from 'dotenv';

export const BCRYPT_PATTERN = /^\$2[aby]\$(1[0-6])\$[./A-Za-z0-9]{53}$/;
const WEAK = new Set([
  'union-erp-dev-secret',
  'your_super_secret_jwt_key_change_in_production',
  'replace_with_a_strong_random_32_byte_hex_key',
  '<strong-random-secret>',
  'change_me_32_byte_random_master_key',
  'default-key',
  'secret',
  'password',
  '',
]);
const EDITABLE = new Set([
  'DEMO_MODE',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'ERP_ADMIN_USER_ID',
  'ERP_ADMIN_PASSWORD_HASH',
  'AI_ASSISTANT_ENABLED',
  'AI_ASSISTANT_GEMINI_API_KEY',
  'AI_ASSISTANT_MODEL',
  'DID_AVATAR_ENABLED',
  'DID_API_KEY',
  'DID_AGENT_ID',
]);
export function strongSecret(value) {
  return typeof value === 'string' && value.trim().length >= 16 && !WEAK.has(value.trim());
}
export function validServiceKey(value) {
  return (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 2048 &&
    /^[A-Za-z0-9_+/:=.\-]+$/.test(value) &&
    !/^(?:your_|replace_|<)/i.test(value)
  );
}
export function validAgentId(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,160}$/.test(value) &&
    !/^(?:your_|replace_)/i.test(value)
  );
}

export function setupStatus(config) {
  const checks = {
    DEMO_MODE:
      String(config.DEMO_MODE || '')
        .trim()
        .toLowerCase() === 'false',
    JWT_SECRET: strongSecret(config.JWT_SECRET),
    ENCRYPTION_KEY: strongSecret(config.ENCRYPTION_KEY),
    ERP_ADMIN_PASSWORD_HASH: BCRYPT_PATTERN.test(config.ERP_ADMIN_PASSWORD_HASH || ''),
    AI_ASSISTANT_ENABLED: config.AI_ASSISTANT_ENABLED === 'true',
    AI_ASSISTANT_GEMINI_API_KEY: validServiceKey(config.AI_ASSISTANT_GEMINI_API_KEY),
    AI_ASSISTANT_MODEL: /^gemini-[A-Za-z0-9._-]{1,80}$/.test(
      config.AI_ASSISTANT_MODEL || 'gemini-3.7-flash'
    ),
  };
  const videoChecks = {
    DID_AVATAR_ENABLED: config.DID_AVATAR_ENABLED === 'true',
    DID_API_KEY: validServiceKey((config.DID_API_KEY || '').replace(/^Basic\s+/i, '').trim()),
    DID_AGENT_ID: validAgentId(config.DID_AGENT_ID),
  };
  return {
    localConfigurationReady: Object.values(checks).every(Boolean),
    videoConfigurationReady:
      Object.values(checks).every(Boolean) && Object.values(videoChecks).every(Boolean),
    missingOrInvalid: Object.entries(checks)
      .filter(([, valid]) => !valid)
      .map(([name]) => name),
    videoMissingOrInvalid: Object.entries(videoChecks)
      .filter(([, valid]) => !valid)
      .map(([name]) => name),
    providerConnectionTested: false,
  };
}

/** Return only a configuration patch; this function never contacts a provider or writes a file. */
export function buildSetupPatch(current, input) {
  if (input.consent !== true)
    throw new Error('يلزم تأكيد الخصوصية والحصص وتأثير وضع الدخول الصارم قبل الحفظ.');
  const key = input.geminiKey?.trim() || current.AI_ASSISTANT_GEMINI_API_KEY?.trim();
  if (!validServiceKey(key))
    throw new Error(
      'مفتاح Gemini مفقود أو صيغته غير مناسبة. استخدم مفتاح الخدمة، وليس كلمة مرور حساب Google.'
    );
  const hash = input.passwordHash || current.ERP_ADMIN_PASSWORD_HASH;
  if (!BCRYPT_PATTERN.test(hash || ''))
    throw new Error('يلزم تعيين كلمة مرور مدير ببصمة bcrypt صالحة.');
  const adminId = current.ERP_ADMIN_USER_ID || 'usr-mohamed-abdallah';
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(adminId))
    throw new Error('راجع ERP_ADMIN_USER_ID على الخادم.');
  const model = current.AI_ASSISTANT_MODEL || 'gemini-3.7-flash';
  if (!/^gemini-[A-Za-z0-9._-]{1,80}$/.test(model))
    throw new Error('راجع اسم النموذج في AI_ASSISTANT_MODEL.');
  // A configured encryption key may protect existing data. Never silently rotate it.
  if (current.ENCRYPTION_KEY && !strongSecret(current.ENCRYPTION_KEY)) {
    throw new Error(
      'مفتاح التشفير الحالي ضعيف. لا تغيّره آلياً: راجع خطة تدوير المفاتيح واستعادة البيانات أولاً. لم تتغير الإعدادات.'
    );
  }
  const patch = {
    DEMO_MODE: 'false',
    ERP_ADMIN_USER_ID: adminId,
    ERP_ADMIN_PASSWORD_HASH: hash,
    AI_ASSISTANT_ENABLED: 'true',
    AI_ASSISTANT_GEMINI_API_KEY: key,
    AI_ASSISTANT_MODEL: model,
    DID_AVATAR_ENABLED: input.enableVideo === true ? 'true' : 'false',
  };
  if (!strongSecret(current.JWT_SECRET)) patch.JWT_SECRET = randomBytes(32).toString('hex');
  if (!current.ENCRYPTION_KEY) patch.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  if (input.enableVideo === true) {
    const videoKey = (input.didKey?.trim() || current.DID_API_KEY?.trim() || '')
      .replace(/^Basic\s+/i, '')
      .trim();
    const agentId = input.agentId?.trim() || current.DID_AGENT_ID?.trim();
    if (!validServiceKey(videoKey) || !validAgentId(agentId))
      throw new Error('للفيديو الواقعي يلزم مفتاح D-ID ومعرّف Agent صالحان.');
    patch.DID_API_KEY = videoKey;
    patch.DID_AGENT_ID = agentId;
  }
  return patch;
}

function closesQuote(value, quote, from = 0) {
  for (let index = from; index < value.length; index++) {
    if (value[index] !== quote) continue;
    let escapes = 0;
    for (let previous = index - 1; previous >= 0 && value[previous] === '\\'; previous--) escapes++;
    if (escapes % 2 === 0) return true;
  }
  return false;
}

/** Preserve unrelated settings and multiline values; collapse duplicate assignments only for patched keys. */
export function mergeEnvironment(source, patch) {
  for (const [name, value] of Object.entries(patch)) {
    if (!EDITABLE.has(name) || typeof value !== 'string' || /['\r\n\0]/.test(value))
      throw new Error('قيمة إعداد غير مسموحة.');
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/),
    result = [],
    used = new Set();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    let end = index;
    if (match && ["'", '"', '`'].includes(match[2][0])) {
      const quote = match[2][0];
      if (!closesQuote(match[2], quote, 1)) {
        while (end + 1 < lines.length) {
          end++;
          if (closesQuote(lines[end], quote)) break;
        }
      }
    }
    const name = match?.[1];
    if (name && Object.hasOwn(patch, name)) {
      if (!used.has(name)) result.push(`${name}='${patch[name]}'`);
      used.add(name);
    } else result.push(...lines.slice(index, end + 1));
    index = end;
  }
  for (const [name, value] of Object.entries(patch))
    if (!used.has(name)) result.push(`${name}='${value}'`);
  return result.join(newline).replace(/(?:\r?\n)*$/, newline);
}

export function readSetupEnvironment(root) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) {
    // lstat also detects dangling symlinks, which must not be replaced automatically.
    try {
      if (fs.lstatSync(file).isSymbolicLink())
        throw new Error('ملف .env رابط رمزي؛ استخدم مدير الأسرار بدلاً من الكتابة الآلية.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return { source: '', values: {}, existed: false };
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024)
    throw new Error('ملف .env ليس ملف إعداد عاديّاً آمناً للكتابة الآلية.');
  const source = fs.readFileSync(file, 'utf8');
  return { source, values: parse(source), existed: true };
}

/** Same-directory atomic replacement, mode 0600, no plaintext backup, and a stale-file guard. */
export function saveSetupEnvironment(root, original, patch) {
  const current = readSetupEnvironment(root);
  if (current.source !== original.source || current.existed !== original.existed)
    throw new Error('تغيّر .env أثناء الإعداد. أعد المحاولة دون الكتابة فوق تعديلات أخرى.');
  const content = mergeEnvironment(original.source, patch);
  const temporary = path.join(root, `.env.operator-setup-${randomUUID()}.tmp`);
  const destination = path.join(root, '.env');
  let fd,
    created = false;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    created = true;
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    const latest = readSetupEnvironment(root);
    if (latest.source !== original.source || latest.existed !== original.existed)
      throw new Error('تغيّر .env أثناء الحفظ. لم تُستبدل التعديلات الأخرى.');
    fs.renameSync(temporary, destination);
    created = false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (created) fs.unlinkSync(temporary);
  }
  return setupStatus(parse(content));
}
