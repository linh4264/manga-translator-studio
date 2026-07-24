const fs = require('fs');
const path = require('path');

const src = "C:\\Users\\Acer\\.gemini\\antigravity-ide\\brain\\1adcb06b-239d-4ff3-bb9e-58bb7f9417b3\\media__1784912414198.jpg";
const dest = path.join(__dirname, "demo.jpg");

try {
    fs.copyFileSync(src, dest);
    console.log("Sao chép ảnh thành công!");
    
    // Tự xóa file script này sau khi chạy xong
    fs.unlinkSync(__filename);
} catch (err) {
    console.error("Lỗi khi sao chép ảnh:", err);
}
