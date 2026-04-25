@echo off
title Auto-Sync to GitHub
echo.
echo ============================================
echo   Talent ^& Onboarding Log — Auto-Sync
echo   Backing up to GitHub every 60 seconds
echo   Press Ctrl+C to stop
echo ============================================
echo.

:loop
git add .
git commit -m "Auto backup %date% %time%" 2>nul
if %errorlevel%==0 (
    git push 2>nul
    echo [%time%] Backup pushed to GitHub
) else (
    echo [%time%] No changes to backup
)
timeout /t 60 /nobreak >nul
goto loop
