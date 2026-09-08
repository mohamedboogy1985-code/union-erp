import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import {
  BCRYPT_PATTERN,
  buildSetupPatch,
  readSetupEnvironment,
  saveSetupEnvironment,
  setupStatus,
  strongSecret,
  validAgentId,
  validServiceKey,
} from './operator-setup-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const help =
  'شغّل npm run assistant:setup من طرفية تفاعلية داخل المشروع.\nللفحص دون كتابة أو اتصال خارجي: npm run assistant:check\nلا تضع المفاتيح أو كلمات المرور في سطر الأوامر أو المحادثات.';

async function readInput(prompt, hidden = false, maximum = 2048) {
  // Disable terminal echo before showing the prompt, including fast clipboard/PTY input.
  process.stdin.setRawMode(true);
  process.stdout.write(prompt);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && ['c', 'd'].includes(key.name)) {
        cleanup();
        reject(new Error('تم الإلغاء دون حفظ الإعدادات.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(value);
      } else if (key.name === 'backspace') {
        if (value) {
          value = Array.from(value).slice(0, -1).join('');
          if (!hidden) process.stdout.write('\b \b');
        }
      } else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) {
        if (value.length + text.length > maximum) return;
        value += text;
        if (!hidden) process.stdout.write(text);
      }
    };
    process.stdin.on('keypress', onKey);
  });
}
async function yesNo(prompt, defaultYes = false) {
  while (true) {
    const answer = (await readInput(`${prompt} ${defaultYes ? '[Y/n]' : '[y/N]'}: `, false, 20))
      .trim()
      .toLowerCase();
    if (!answer) return defaultYes;
    if (['y', 'yes', 'نعم'].includes(answer)) return true;
    if (['n', 'no', 'لا'].includes(answer)) return false;
    console.log('اكتب y للموافقة أو n للإلغاء.');
  }
}
async function secretKey(label, existing, normalize = (value) => value.trim()) {
  while (true) {
    const value = normalize(
      await readInput(`${label} (لن يظهر${existing ? '؛ Enter للاحتفاظ بالحالي' : ''}): `, true)
    );
    const selected = value || existing;
    if (validServiceKey(selected)) return selected;
    console.log('يلزم مفتاح خدمة صالح بلا مسافات أو علامات اقتباس؛ لا تستخدم كلمة مرور حسابك.');
  }
}

try {
  if (args.length > 1 || (args.length === 1 && !['--check', '--help'].includes(args[0])))
    throw new Error(help);
  if (args[0] === '--help') {
    console.log(help);
  } else if (args[0] === '--check') {
    const file = readSetupEnvironment(root);
    const effective = { ...file.values, ...process.env };
    const relevant = [
      'DEMO_MODE',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
      'ERP_ADMIN_PASSWORD_HASH',
      'AI_ASSISTANT_ENABLED',
      'AI_ASSISTANT_GEMINI_API_KEY',
      'AI_ASSISTANT_MODEL',
      'DID_AVATAR_ENABLED',
      'DID_API_KEY',
      'DID_AGENT_ID',
    ];
    console.log(
      JSON.stringify(
        {
          envFileExists: file.existed,
          ...setupStatus(effective),
          processOverrides: relevant.filter(
            (name) => process.env[name] !== undefined && process.env[name] !== file.values[name]
          ),
        },
        null,
        2
      )
    );
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(help);
    if (fs.existsSync(new URL('../.git', import.meta.url))) {
      try {
        execFileSync('git', ['check-ignore', '--quiet', '.env'], { cwd: root, stdio: 'ignore' });
        execFileSync('git', ['check-ignore', '--quiet', '.env.operator-setup-check.tmp'], {
          cwd: root,
          stdio: 'ignore',
        });
      } catch {
        throw new Error('أوقف الإعداد: يجب استبعاد .env من Git وعدم تتبعه قبل كتابة أي سر.');
      }
    }
    const original = readSetupEnvironment(root),
      current = { ...original.values, ...process.env };
    if (current.ENCRYPTION_KEY && !strongSecret(current.ENCRYPTION_KEY))
      throw new Error(
        'مفتاح التشفير الحالي ضعيف. راجع تدويره واستعادة البيانات مع المسؤول قبل استخدام الإعداد الآلي.'
      );
    emitKeypressEvents(process.stdin);
    console.log('\nمحاسبك — إعداد محلي آمن للصوت والفيديو');
    console.log('لا تجري هذه الأداة اتصالاً بـ Google أو D-ID، ولا تنشئ حسابات أو اشتراكات.');
    console.log(
      'جهّز مفتاح Gemini من Google AI Studio، وللفيديو مفتاح D-ID وAgent من نوع V2/V3 بصوت عربي وشخصية مصرح بها.'
    );
    console.log(
      'التفعيل يحوّل ERP إلى الدخول الحقيقي: لا يكفي اختيار مستخدم العرض. استخدم كلمة مرور ERP مستقلة.'
    );
    if (!current.ENCRYPTION_KEY)
      console.log(
        'سيُنشأ مفتاح تشفير جديد. إن كانت لديك بيانات مشفّرة سابقة، استعد مفتاحها الأصلي ولا تكمل بغيره.'
      );
    if (!strongSecret(current.JWT_SECRET))
      console.log('سيُنشأ سر توقيع JWT جديد؛ هذا يبطل الجلسات القديمة.');
    if (
      !(await yesNo('هل راجعت الخصوصية والحصص وحقوق الشخصية وتأثير إعدادات الأمان وتريد المتابعة؟'))
    )
      throw new Error('تم الإلغاء دون تعديل الملفات.');

    const geminiKey = await secretKey(
      'مفتاح Gemini المخصص للمساعد',
      current.AI_ASSISTANT_GEMINI_API_KEY
    );
    const enableVideo = await yesNo(
      'هل تريد إعداد الفيديو الواقعي الآن؟',
      current.DID_AVATAR_ENABLED === 'true'
    );
    let didKey, agentId;
    if (enableVideo) {
      didKey = await secretKey(
        'مفتاح D-ID من إعدادات الحساب',
        (current.DID_API_KEY || '').replace(/^Basic\s+/i, '').trim(),
        (value) => value.replace(/^Basic\s+/i, '').trim()
      );
      while (!validAgentId(agentId)) {
        agentId =
          (
            await readInput(
              `معرّف D-ID Agent${current.DID_AGENT_ID ? ' (Enter للاحتفاظ بالحالي)' : ''}: `,
              false,
              160
            )
          ).trim() || current.DID_AGENT_ID;
        if (!validAgentId(agentId)) console.log('انسخ معرّف Agent نفسه، وليس رابط الصفحة.');
      }
    }
    let passwordHash = current.ERP_ADMIN_PASSWORD_HASH;
    while (true) {
      const password = await readInput(
        `كلمة مرور مدير ERP (لن تظهر${BCRYPT_PATTERN.test(passwordHash || '') ? '؛ Enter للاحتفاظ بالحالية' : ''}): `,
        true,
        256
      );
      if (!password && BCRYPT_PATTERN.test(passwordHash || '')) break;
      if (password.trim().length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
        console.log('اختر كلمة مرور من 12 حرفاً على الأقل وبحد أقصى 72 بايت UTF-8.');
        continue;
      }
      const confirmation = await readInput('أعد كتابة كلمة مرور ERP: ', true, 256);
      if (password !== confirmation) {
        console.log('كلمتا المرور غير متطابقتين.');
        continue;
      }
      passwordHash = await bcrypt.hash(password, 12);
      break;
    }
    const patch = buildSetupPatch(current, {
      consent: true,
      geminiKey,
      enableVideo,
      didKey,
      agentId,
      passwordHash,
    });
    console.log(`سيُحدّث ملف .env الخاص لحساب المدير ${patch.ERP_ADMIN_USER_ID}.`);
    console.log(
      `الفيديو: ${enableVideo ? 'مفعّل بعد إعادة التشغيل' : 'غير مفعّل؛ يمكن إعداده لاحقاً'}. لن تُطبع الأسرار أو تُنشأ نسخة احتياطية نصية منها.`
    );
    if (!(await yesNo('هل تؤكد حفظ هذه الإعدادات؟')))
      throw new Error('تم الإلغاء دون تعديل الملفات.');
    saveSetupEnvironment(root, original, patch);
    const written = readSetupEnvironment(root).values;
    const overrides = [...new Set([...Object.keys(patch), 'JWT_SECRET', 'ENCRYPTION_KEY'])].filter(
      (name) => process.env[name] !== undefined && process.env[name] !== written[name]
    );
    console.log(
      'تم حفظ .env محلياً بصلاحيات 0600 حيث يدعمها النظام. على Windows قيّد أذونات مجلد الخادم أيضاً. لم تُختبر المفاتيح لدى المزوّدين ولم تُرسَل بيانات إليهم.'
    );
    if (overrides.length)
      console.log(
        `انتبه: بيئة تشغيل هذه الطرفية تتجاوز إعدادات الملف لهذه الأسماء: ${overrides.join(', ')}. راجع إعدادات تشغيل الخادم أيضاً.`
      );
    console.log(
      'أوقف الخادم القديم ثم أعد تشغيله بالإعدادات الجديدة. افتح محاسبك وسجّل دخول ERP، ثم وافق على الجلسة وجرّب طلباً صغيراً.'
    );
    console.log('لا ترفع .env إلى Git ولا ترسل محتواه في المحادثة.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'تعذّر إكمال الإعداد.');
  process.exitCode = 1;
}
