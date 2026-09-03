@echo off
chcp 65001 > nul
echo ===================================================================
echo   معالج إصلاح بيئة Electron وتثبيت الحزم على Windows
echo ===================================================================
echo جارٍ تنظيف الـ Cache وإعادة بناء مكتبات الواجهة...
call npm cache clean --force
call npm install
echo تم إصلاح البيئة بنجاح. يمكنك الآن تشغيل RUN_UNION_ERP_WINDOWS.cmd
pause
