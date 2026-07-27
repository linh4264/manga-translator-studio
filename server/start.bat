@echo off
title Manga Translator Studio Local Server
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
    echo [OK] Phat hien Node.js. Dang chay server.js...
    echo.
    node server.js
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        echo [Goi y] Khong tim thay Node.js. 
        echo [OK] Phat hien Python. Dang chay python -m http.server 3000...
        echo.
        start http://localhost:3000
        python -m http.server 3000
    ) else (
        echo [Canh bao] May ban chua cai ca Node.js lan Python!
        echo.
        echo Hay thuc hien mot trong cac cach sau:
        echo 1. Cai dat Node.js tai: https://nodejs.org/
        echo 2. Hoac mo thu muc nay bang VS Code va cai extension "Live Server" de chay.
        echo 3. Hoac su dung extension Chrome "Web Server for Chrome".
        echo.
        pause
    )
)
