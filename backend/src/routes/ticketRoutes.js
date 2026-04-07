const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Ticket = require('../models/Ticket');
const { DEPARTMENTS, SYSTEM_SETTINGS } = require('../config/constants');
const { pushTicketConfirm } = require('../utils/lineNotify');

const router = express.Router();

// ── Multer: กำหนดที่เก็บรูปภาพ ────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads');

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // ชื่อไฟล์: timestamp-random.ext (ป้องกัน path traversal)
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  // รับเฉพาะไฟล์รูปภาพ
  const allowed = /^image\/(jpeg|png|gif|webp)$/;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ (jpg, png, gif, webp) เท่านั้น'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: SYSTEM_SETTINGS.MAX_IMAGE_SIZE, // 4MB
    files: 5, // สูงสุด 5 รูป
  },
});

// ── helper: run multer as promise (Express v5 compatible) ──
const runUpload = (req, res) =>
  new Promise((resolve, reject) => {
    upload.array('images', 5)(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

// ============================================================
// POST /api/tickets
// รับฟอร์มแจ้งเรื่องจาก LIFF พร้อมอัปโหลดรูปภาพ
// ============================================================
router.post('/', async (req, res) => {
  // ── รัน multer ก่อน ────────────────────────────────────
  try {
    await runUpload(req, res);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ message: 'ไฟล์มีขนาดเกิน 4MB' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: 'อัปโหลดได้สูงสุด 5 รูปเท่านั้น' });
    }
    return res.status(400).json({ message: err.message });
  }

  // ── Main handler ────────────────────────────────────────
  try {
    const { lineUserId, displayName, subject, description, phone, assignedDepartment, lat, lng, groupId } = req.body;

    // ── Validate ข้อมูลที่จำเป็น ──────────────────────────
    if (!lineUserId || !subject || !description) {
      // ลบไฟล์ที่อัปโหลดมาถ้า validate ไม่ผ่าน
      if (req.files) {
        req.files.forEach((f) => fs.unlink(f.path, () => {}));
      }
      return res.status(400).json({
        message: 'กรุณากรอกข้อมูลให้ครบ (lineUserId, subject, description)',
      });
    }

    // ── หน่วยงาน (optional – ถ้าไม่ระบุ ใช้ ไม่แน่ใจ) ────
    const dept = assignedDepartment && DEPARTMENTS.includes(assignedDepartment)
      ? assignedDepartment
      : 'ไม่แน่ใจ';

    // ── ตำแหน่ง GPS (optional) ────────────────────────────
    const location = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;

    // ── เก็บชื่อไฟล์รูปภาพ ────────────────────────────────
    const imageFiles = req.files ? req.files.map((f) => f.filename) : [];

    // ── บันทึก Ticket ลง MongoDB ──────────────────────────
    const ticket = new Ticket({
      lineUserId,
      displayName: displayName || '',
      subject: subject.trim(),
      description: description.trim(),
      phone: phone ? phone.trim() : '',
      images: imageFiles,
      assignedDepartment: dept,
      ...(location && { location }),
      ...(groupId && { groupId }),
    });

    await ticket.save();

    // ── Push แจ้งยืนยัน LINE (ไม่ blocking) ────────────────
    pushTicketConfirm(ticket, groupId || null).catch((err) =>
      console.error('LINE confirm push error:', err.message)
    );

    res.status(201).json({
      message: 'บันทึกเรื่องร้องทุกข์สำเร็จ',
      ticketNo: ticket.ticketNo,
      ticketId: ticket._id,
    });
  } catch (error) {
    // ลบไฟล์ที่อัปโหลดมาถ้า error
    if (req.files) {
      req.files.forEach((f) => fs.unlink(f.path, () => {}));
    }
    console.error('POST /api/tickets error:', error.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
  }
});

// ============================================================
// GET /api/tickets/status/:ticketNo
// ตรวจสอบสถานะเรื่องร้องทุกข์ (สำหรับผู้แจ้ง)
// ============================================================
router.get('/status/:ticketNo', async (req, res) => {
  try {
    const ticket = await Ticket.findOne(
      { ticketNo: req.params.ticketNo },
      'ticketNo subject status assignedDepartment createdAt history'
    );

    if (!ticket) {
      return res.status(404).json({ message: 'ไม่พบเลขที่คำร้องนี้' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('GET /api/tickets/status error:', error.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;
