// Run locally in a terminal. Passwords are masked and never appear in argv/history.
import { emitKeypressEvents } from 'node:readline';
import bcrypt from 'bcryptjs';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('شغّل هذا الأمر في طرفية تفاعلية محلية؛ لا تمرر كلمة المرور في سطر الأوامر.');
  process.exit(1);
}

emitKeypressEvents(process.stdin);
async function readSecret(prompt) {
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
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('تم الإلغاء.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(value);
      } else if (key.name === 'backspace') {
        value = Array.from(value).slice(0, -1).join('');
      } else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) {
        value += text;
      }
    };
    process.stdin.on('keypress', onKey);
  });
}

try {
  const password = await readSecret('كلمة مرور المدير (لن تظهر أثناء الكتابة): ');
  const confirmation = await readSecret('أعد كتابة كلمة المرور: ');
  if (password !== confirmation) throw new Error('كلمتا المرور غير متطابقتين.');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('استخدم 12 حرفاً على الأقل، وبحد أقصى 72 بايت UTF-8 (حد bcrypt).');
  }
  const hash = await bcrypt.hash(password, 12);
  console.log('احفظ السطر التالي سراً في .env على الخادم، ولا تضفه إلى Git:');
  console.log(`ERP_ADMIN_PASSWORD_HASH='${hash}'`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
