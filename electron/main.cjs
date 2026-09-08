/**
 * Union Financial ERP — Electron Main Process
 *
 * وضعان للتشغيل:
 * - التطوير (!app.isPackaged): يسجّل tsx ويشغّل server.ts مباشرة ثم يفتح النافذة.
 * - الإنتاج (الحزمة): يحمّل الخادم المجمّع dist-server/index.cjs داخل العملية
 *   الرئيسية (NODE_ENV=production) ويخدم الواجهة من dist/ ثم يفتح النافذة.
 */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { isAppOrigin, allowedMediaRequest, safeExternalUrl, configuredAppUrl } = require('./assistant-media-policy.cjs');

const PORT = Number(process.env.PORT || 3000);
const REMOTE_SERVER = process.env.ERP_SERVER_URL?.trim();
const APP_URL = configuredAppUrl(REMOTE_SERVER, PORT);
const HEALTH_URL = `${APP_URL}/api/health`;

let mainWindow = null;
let serverStarted = false;

/** فحص جاهزية الخادم (محاولة واحدة) */
function checkHealth() {
  return new Promise((resolve) => {
    const req = (APP_URL.startsWith('https:') ? https : http).get(HEALTH_URL, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** انتظار جاهزية الخادم مع مهمة قصوى */
async function waitForServer(timeoutMs = 90000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkHealth()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/** تشغيل خادم Express داخل العملية الرئيسية */
async function startServer() {
  if (await checkHealth()) {
    // خادم يعمل مسبقاً (npm run dev مثلاً) — نستخدمه مباشرة
    serverStarted = true;
    return;
  }

  if (REMOTE_SERVER) {
    dialog.showErrorBox('تعذّر الاتصال بخادم ERP', 'راجع ERP_SERVER_URL واتصال الشبكة وشهادة HTTPS. لم يُشغّل خادم بديل ببيانات مختلفة.');
    app.quit(); return;
  }

  if (app.isPackaged) {
    // الإنتاج: الحزمة المجمّعة مسبقاً بـ esbuild (CJS)
    process.env.NODE_ENV = 'production';
    require(path.join(__dirname, '..', 'dist-server', 'index.cjs'));
  } else {
    // التطوير: تشغيل server.ts عبر tsx CLI في عملية فرعية (متوافق مع tsx v4 الذي حذف tsx/cjs)
    process.env.NODE_ENV = process.env.NODE_ENV || 'development';
    const projectRoot = path.join(__dirname, '..');
    const tsxBin = path.join(
      projectRoot,
      'node_modules',
      process.platform === 'win32' ? '.bin\\tsx.cmd' : '.bin/tsx'
    );
    spawn(tsxBin, [path.join(projectRoot, 'server.ts')], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
  }

  const ok = await waitForServer();
  if (!ok) {
    dialog.showErrorBox(
      'خطأ في تشغيل الخادم — Server Startup Error',
      `تعذر تشغيل خادم النظام المالي على ${APP_URL}.\n` +
        'يرجى التأكد من أن المنفذ 3000 غير مستخدم وإعادة المحاولة.\n\n' +
        `Failed to start the financial server on port ${PORT}.`
    );
    app.quit();
    return;
  }
  serverStarted = true;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 868,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f172a',
    title: 'Union Financial ERP — النظام المالي والمحاسبي المتكامل للنقابة العامة',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Grant microphone/camera access only to the actual app origin and only after a visible user decision.
  mainWindow.webContents.session.setPermissionCheckHandler((contents, permission, origin) =>
    allowedMediaRequest(contents, origin, permission, APP_URL));
  mainWindow.webContents.session.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (!allowedMediaRequest(contents, details.requestingUrl || contents?.getURL() || '', permission, APP_URL)) {
      callback(false); return;
    }
    try {
      const camera = details.mediaTypes?.includes('video');
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question', title: 'إذن الوسائط — Union ERP',
        message: camera ? 'هل تسمح لهذه الجلسة باستخدام الكاميرا والميكروفون؟' : 'هل تسمح لهذه الجلسة باستخدام الميكروفون؟',
        detail: 'ابدأ التسجيل من الزر الظاهر في البرنامج. يمكنك إيقافه في أي وقت؛ المساعد المرئي لا يحتاج الكاميرا.',
        buttons: ['رفض', 'سماح'], defaultId: 0, cancelId: 0,
      });
      callback(result.response === 1);
    } catch { callback(false); }
  });

  // الروابط الخارجية تفتح في المتصفح الافتراضي (وليس داخل التطبيق)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppOrigin(url, APP_URL) && safeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // منع التنقل خارج أصل التطبيق
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppOrigin(url, APP_URL)) {
      event.preventDefault();
      if (safeExternalUrl(url)) shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(APP_URL);

  // قائمة مختصرة تناسب التطبيق المالي
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'النظام',
        submenu: [
          { label: 'تحديث الصفحة', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
          { type: 'separator' },
          { label: 'خروج', accelerator: 'Alt+F4', click: () => app.quit() },
        ],
      },
      {
        label: 'عرض',
        submenu: [
          { label: 'تكبير', role: 'zoomIn' },
          { label: 'تصغير', role: 'zoomOut' },
          { label: 'الحجم الأصلي', role: 'resetZoom' },
          { label: 'ملء الشاشة', role: 'togglefullscreen' },
        ],
      },
      {
        label: 'أدوات',
        submenu: [
          { label: 'أدوات المطور', role: 'toggleDevTools' },
          { label: 'طباعة', role: 'print' },
        ],
      },
    ])
  );
}

// مثيل واحد فقط للتطبيق
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await startServer();
    if (!serverStarted) return;

    // فتح ملف ببرنامجه الافتراضي من شاشة نماذج (تعديل/طباعة بعيداً عن المتصفح)
    ipcMain.handle('shell:open-path', async (_event, filePath) => {
      if (typeof filePath !== 'string' || !filePath) return { error: 'مسار غير صالح' };
      const err = await shell.openPath(filePath);
      return err ? { error: err } : { ok: true };
    });

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
