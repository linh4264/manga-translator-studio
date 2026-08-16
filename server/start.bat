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
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        echo [Goi y] Khong tim thay Node.js. 
        echo [OK] Phat hien Python. Dang chay python -m http.server 3000...
        echo.
        start http://localhost:3000
        cd /d "%~dp0\..\public"
        python -m http.server 3000
        if errorlevel 1 (
            echo.
            echo [Loi] May chu Python bi dung.
            pause
        )
    ) else (
        echo [Canh bao] May ban chua cai ca Node.js lan Python!
        echo.
        echo Hay thuc hien mot trong cac cac sau:
        echo 1. Cai dat Node.js tai: https://nodejs.org/
        echo 2. Hoac mo thu muc nay bang VS Code va cai extension "Live Server" de chay.
        echo 3. Hoac su dung extension Chrome "Web Server for Chrome".
        echo.
        pause
    )
)
