@echo off
title Manga Translator Studio Local Server
cd /d "%~dp0"
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
    echo [Goi y] Khong tim thay Bun hoac Node.js. 
    echo [OK] Phat hien Python. Dang chay server Python...
    echo.
    start http://localhost:3000
    cd /d "%~dp0\.."
    python -m http.server 3000
    if errorlevel 1 (
        echo.
        echo [Loi] May chu Python bi dung.
        pause
    )
    goto :eof
)

echo [Canh bao] May ban chua cai ca Bun, Node.js lan Python!
echo.
echo Hay thuc hien mot trong cac cach sau:
echo 1. Cai dat Bun tai: https://bun.sh/ (Khuyen nghi cho Windows)
echo 2. Hoac cai dat Node.js tai: https://nodejs.org/
echo.
pause
