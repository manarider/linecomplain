const path = require('path');
const fs = require('fs');

// ── ตำแหน่ง root ของโฟลเดอร์ uploads ─────────────────────
const uploadsDir = path.join(__dirname, '../../uploads');

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── ลบไฟล์ temp อย่างปลอดภัย (cleanup หลัง error) ─────────
const cleanupFiles = (files) => {
  if (!files || !Array.isArray(files)) return;
  files.forEach((f) => {
    if (f && f.path) {
      fs.unlink(f.path, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error(`Failed to delete temp file ${f.path}:`, err.message);
        }
      });
    }
  });
};

// ── สร้าง date-based folder path (uploads/YYYY/MM/DD/) ────
const getDateBasedPath = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
};

module.exports = { uploadsDir, cleanupFiles, getDateBasedPath };
