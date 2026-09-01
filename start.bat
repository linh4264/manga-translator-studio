@echo off
title Manga Translator Studio
cd /d "%~dp0"

REM Auto-detect Node.js in standard installation directories
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
if exist "%APPDATA%\npm" set "PATH=%APPDATA%\npm;%PATH%"

echo =======================================================
echo   Manga Translator Studio - Khoi dong May chu Cuc bo
echo =======================================================
echo.

call npm start
if errorlevel 1 (
    echo.
    echo [Loi] May chu dung dot ngot.
    pause
)
