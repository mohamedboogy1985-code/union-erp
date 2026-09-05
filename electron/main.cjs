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
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 3000);
const APP_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${APP_URL}/api/health`;

let mainWindow = null;
let serverStarted = false;

/** فحص جاهزية الخادم (محاولة واحدة) */
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 2000 }, (res) => {
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

  // الروابط الخارجية تفتح في المتصفح الافتراضي (وليس داخل التطبيق)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // منع التنقل خارج أصل التطبيق
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
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
