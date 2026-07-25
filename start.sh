#!/bin/bash

# Manga Translator Studio Local Server Starter for macOS / Linux

echo "======================================================="
echo "  Manga Translator Studio - Khởi động máy chủ Cục bộ"
echo "======================================================="
echo ""

# Function to open browser
open_browser() {
    local url=$1
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url"
    elif command -v open >/dev/null 2>&1; then
        open "$url"
    else
        echo "⚠️ Không thể tự động mở trình duyệt. Hãy truy cập: $url"
    fi
}

if command -v node >/dev/null 2>&1; then
    echo "[OK] Phát hiện Node.js. Đang chạy server.js..."
    echo ""
    node server.js
elif command -v python3 >/dev/null 2>&1; then
    echo "[Gợi ý] Không tìm thấy Node.js."
    echo "[OK] Phát hiện Python3. Đang chạy python3 -m http.server 3000..."
    echo ""
    open_browser "http://localhost:3000"
    python3 -m http.server 3000
elif command -v python >/dev/null 2>&1; then
    echo "[Gợi ý] Không tìm thấy Node.js."
    echo "[OK] Phát hiện Python. Đang chạy python -m http.server 3000..."
    echo ""
    open_browser "http://localhost:3000"
    python -m http.server 3000
else
    echo "[Cảnh báo] Máy bạn chưa cài cả Node.js lẫn Python!"
    echo ""
    echo "Hãy thực hiện một trong các cách sau:"
    echo "1. Cài đặt Node.js tại: https://nodejs.org/"
    echo "2. Hoặc mở thư mục này bằng VS Code và cài extension 'Live Server' để chạy."
    echo "3. Hoặc sử dụng extension Chrome 'Web Server for Chrome'."
    echo ""
    read -p "Nhấn [Enter] để thoát..."
fi
