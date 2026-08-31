@echo off
chcp 65001 > nul
echo ===================================================================
echo   تنظيف وبدء تشغيل نظيف لنظام النقابة العامة Financial ERP
echo ===================================================================
call npm run clean
call npm run build
call npm run test
call npm run dev
pause
