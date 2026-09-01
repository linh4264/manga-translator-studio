@echo off
title Manga Translator Studio Local Server
cd /d "%~dp0"

REM Auto-detect Node.js in standard installation directories
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
if exist "%APPDATA%\npm" set "PATH=%APPDATA%\npm;%PATH%"

echo =======================================================
echo   Manga Translator Studio - Khoi dong may chu Cuc bo
echo =======================================================
echo.

where git >nul 2>nul
if %errorlevel%==0 (
    echo [Git] Dang tu dong cap nhat ma nguon tu kho Git...
    git pull
    echo.
) else (
    echo [Goi y] Khong tim thay Git tren he thong. Bo qua cap nhat.
    echo.
)

where bun >nul 2>nul
if %errorlevel%==0 (
    echo [OK] Phat hien Bun runtime.
    echo [Web] Dang khoi chay server bang Bun tren cong 3000...
    echo.
    bun server.js
    if errorlevel 1 (
        echo.
        echo [Loi] May chu Bun bi dung dot ngot.
        pause
    )
    goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
    echo [OK] Phat hien Node.js.
    echo [Web] Dang chay server.js tren cong 3000...
    echo.
    node server.js
    if errorlevel 1 (
        echo.
        echo [Loi] May chu Node.js bi dung dot ngot.
        pause
    )
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo [Canh bao] Phat hien Python, nhung du an TypeScript yeu cau Bun hoac Node.js de bien dich!
    echo Vui long cai dat Bun (https://bun.sh) hoac Node.js (https://nodejs.org) de chay server.js.
    echo.
)

echo [Canh bao] May ban chua cai Bun hoac Node.js!
echo.
echo Hay thuc hien mot trong cac cach sau:
echo 1. Cai dat Bun tai: https://bun.sh/ (Khuyen nghi - Chay sieu nhanh tren Windows)
echo 2. Hoac cai dat Node.js tai: https://nodejs.org/
echo.
pause
