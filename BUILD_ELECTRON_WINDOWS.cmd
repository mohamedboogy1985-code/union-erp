@echo off
chcp 65001 > nul
echo ===================================================================
echo   بناء نسخة سطح المكتب Union Financial ERP (Electron)
echo   Build Windows Desktop Installer (NSIS + Portable)
echo ===================================================================

echo [1/4] التحقق من البيئة وتثبيت الاعتمادات...
call npm install
if errorlevel 1 goto :error

echo [1.5/4] إصلاح توافق electron-builder مع npm الحديثة (postinstall يغطيه تلقائياً)...
call node scripts\patch-electron-builder.mjs
if errorlevel 1 goto :error

echo [2/4] بناء الواجهة (Vite)...
call npm run build:frontend
if errorlevel 1 goto :error

echo [3/4] تجميع الخادم (esbuild bundle)...
call npm run build:server
if errorlevel 1 goto :error

echo [4/4] حزم تطبيق Electron (مثبت + نسخة محمولة)...
call npx electron-builder --win nsis portable
if errorlevel 1 goto :error

echo.
echo ===================================================================
echo   اكتمل البناء بنجاح. الملفات الناتجة في مجلد release\
echo   - UnionERP-x64.exe         (مثبت NSIS)
echo   - UnionERP-Portable-x64.exe (نسخة محمولة بدون تثبيت)
echo ===================================================================
pause
exit /b 0

:error
echo.
echo فشل البناء! راجع الرسائل أعلاه.
pause
exit /b 1
