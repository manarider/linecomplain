const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const Ticket = require('../models/Ticket');
const { DEPARTMENTS, SYSTEM_SETTINGS } = require('../config/constants');
const { pushTicketConfirm } = require('../utils/lineNotify');
const { logAction, actorFromLiff, getIp } = require('../utils/auditLog');

// ── Rate Limiter: ป้องกัน spam submit ─────────────────────
// จำกัด 10 คำร้องต่อ IP ต่อ 15 นาที
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'ส่งคำร้องบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
  keyGenerator: (req) => req.ip || 'unknown',
});

// ── LIFF ID Token Verification ─────────────────────────────
// ยืนยัน idToken กับ LINE API เพื่อป้องกันการปลอม lineUserId
const verifyLiffIdToken = async (idToken, claimedUserId) => {
  // channelId = ส่วนแรกของ LIFF_ID (รูปแบบ: {channelId}-{suffix})
  const channelId = (process.env.LIFF_ID || '').split('-')[0];
  if (!channelId) throw new Error('LIFF_ID ไม่ได้ตั้งค่า');

  const params = new URLSearchParams({ id_token: idToken, client_id: channelId });
  const resp = await axios.post(
    'https://api.line.me/oauth2/v2.1/verify',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
  );
  // resp.data.sub คือ LINE userId จริง ตรวจสอบว่าตรงกับที่ client อ้างหรือไม่
  return resp.data.sub === claimedUserId;
};

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
  const allowed = /^image\/(jpeg|png|gif|webp|heic|heif)$/;
  const extAllowed = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i;
  if (allowed.test(file.mimetype) || extAllowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: SYSTEM_SETTINGS.MAX_IMAGE_SIZE, // 500KB per file
    files: 5,                                 // สูงสุด 5 รูป
  },
});

// ── Multer สำหรับ HEIC (ไม่จำกัดขนาด เพราะ server จะ resize เอง) ──
const heicStorage = multer.memoryStorage();
const heicUpload = multer({
  storage: heicStorage,
  limits: { fileSize: 30 * 1024 * 1024, files: 1 }, // รับ HEIC ได้สูงสุด 30MB
  fileFilter: (req, file, cb) => {
    const extOk = /\.(heic|heif)$/i.test(file.originalname);
    const mimeOk = /^image\/(heic|heif)$/.test(file.mimetype);
    if (extOk || mimeOk) cb(null, true);
    else cb(new Error('รับเฉพาะไฟล์ HEIC/HEIF เท่านั้น'));
  },
});

// ============================================================
// POST /api/tickets/preview-heic
// รับไฟล์ HEIC → แปลงเป็น JPEG + resize → คืน base64 preview
// ============================================================
router.post('/preview-heic', (req, res) => {
  heicUpload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'ไม่พบไฟล์' });
    try {
      // ขั้น 1: แปลง HEIC → JPEG ด้วย heic-convert (รองรับ H.265)
      const jpegRawBuffer = await heicConvert({
        buffer: req.file.buffer,
        format: 'JPEG',
        quality: 0.8,
      });

      // ขั้น 2: resize ด้วย sharp และลด quality จนได้ไม่เกิน 500KB
      const MAX_DIM = 1280;
      const MAX_BYTES = 500 * 1024;

      // resize ก่อนด้วย quality สูงสุด
      const resizedBuffer = await sharp(Buffer.from(jpegRawBuffer))
        .rotate()  // auto-rotate จาก EXIF
        .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 95 })
        .toBuffer();

      // ลด quality จนได้ขนาดไม่เกิน 500KB
      let q = 80;
      let jpegBuffer = await sharp(resizedBuffer).jpeg({ quality: q }).toBuffer();
      while (jpegBuffer.length > MAX_BYTES && q > 30) {
        q -= 10;
        jpegBuffer = await sharp(resizedBuffer).jpeg({ quality: q }).toBuffer();
      }

      // ขั้น 3: thumbnail สำหรับ preview (300px)
      const thumbBuffer = await sharp(jpegBuffer)
        .resize(300, 300, { fit: 'inside' })
        .jpeg({ quality: 70 })
        .toBuffer();

      res.json({
        previewDataUrl: 'data:image/jpeg;base64,' + thumbBuffer.toString('base64'),
        fileDataUrl:    'data:image/jpeg;base64,' + jpegBuffer.toString('base64'),
        size:           jpegBuffer.length,
        name:           req.file.originalname.replace(/\.[^.]+$/, '.jpg'),
      });
    } catch (e) {
      console.error('HEIC convert error:', e);
      res.status(500).json({ message: 'ไม่สามารถแปลงไฟล์ HEIC ได้: ' + e.message });
    }
  });
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
router.post('/', submitLimiter, async (req, res) => {
  // ── รัน multer ก่อน ────────────────────────────────────
  try {
    await runUpload(req, res);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ message: 'ไฟล์มีขนาดเกิน 500KB' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: 'อัปโหลดได้สูงสุด 5 รูปเท่านั้น' });
    }
    return res.status(400).json({ message: err.message });
  }

  // ── Main handler ────────────────────────────────────────
  try {
    const { lineUserId, displayName, idToken, subject, description, phone, assignedDepartment, lat, lng, groupId } = req.body;

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

    // ── ยืนยัน LIFF ID Token กับ LINE API ─────────────────
    // ป้องกันการปลอม lineUserId โดยตรวจสอบกับ token จริง
    if (!idToken) {
      if (req.files) req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(401).json({ message: 'ไม่พบ idToken กรุณาเปิดแอปผ่าน LINE ใหม่' });
    }
    try {
      const valid = await verifyLiffIdToken(idToken, lineUserId);
      if (!valid) {
        if (req.files) req.files.forEach((f) => fs.unlink(f.path, () => {}));
        return res.status(403).json({ message: 'ตรวจสอบตัวตนไม่ผ่าน กรุณาเปิดแอปผ่าน LINE ใหม่' });
      }
    } catch (tokenErr) {
      console.error('LIFF token verify error:', tokenErr.message);
      if (req.files) req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(503).json({ message: 'ไม่สามารถยืนยันตัวตนได้ชั่วคราว กรุณาลองใหม่' });
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

    // ── Audit Log ──
    logAction({
      ...actorFromLiff(lineUserId, displayName),
      action: 'CREATE_TICKET',
      category: 'ticket',
      targetId: ticket.ticketNo,
      targetLabel: ticket.subject,
      detail: `แจ้งเรื่อง: "${ticket.subject}" → ${dept}`,
      meta: { ticketId: ticket._id, phone, groupId: groupId || null },
      ip: getIp(req),
      userAgent: req.headers['user-agent'] || '',
    });

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
