const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const sharp = require('sharp');
const { messagingApi } = require('@line/bot-sdk');
const router = express.Router();

// LINE client สำหรับตรวจสอบ/แจ้งเตือนผู้ร้อง
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

const WSP_DEPARTMENT = 'สำนักการประปา';

const { requireAuth, requireWspAccess } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/authMiddleware');
const Ticket    = require('../models/Ticket');
const Counter   = require('../models/Counter');
const WspReason = require('../models/WspReason');
const WspAgency = require('../models/WspAgency');
const { logAction, getIp } = require('../utils/auditLog');
const { uploadsDir, cleanupFiles, getDateBasedPath } = require('../utils/fileHelper');
const { SYSTEM_SETTINGS } = require('../config/constants');
const { sendWspTicketCreatedEmail } = require('../utils/emailNotify');
const { generateWspId } = require('../utils/wspId');

// ── Multer: รับรูปยืนยันการเก็บงาน ────────────────────────
const cleanupStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const datePath = getDateBasedPath();
    const fullPath = path.join(uploadsDir, datePath);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const cleanupFileFilter = (req, file, cb) => {
  const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype) ||
             /\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname);
  ok ? cb(null, true) : cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
};
const cleanupUpload = multer({
  storage: cleanupStorage,
  fileFilter: cleanupFileFilter,
  limits: { fileSize: SYSTEM_SETTINGS.MAX_IMAGE_SIZE, files: 5 },
});
const runCleanupUpload = (req, res) =>
  new Promise((resolve, reject) => {
    cleanupUpload.array('cleanupImages', 5)(req, res, (err) => {
      if (err) reject(err); else resolve();
    });
  });

// ทุก route ใน /api/wsp ต้อง login + WSP access
router.use(requireAuth, requireWspAccess);

// ────────────────────────────────────────────────────────────
// SECTION 1: เหตุร้องทุกข์ (WspReason)
// ────────────────────────────────────────────────────────────

// GET /api/wsp/reasons — ดึงทั้งหมด
router.get('/reasons', async (req, res) => {
  try {
    const reasons = await WspReason.find().sort({ name: 1 }).lean();
    res.json(reasons);
  } catch (err) {
    console.error('GET /api/wsp/reasons error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเหตุร้องทุกข์' });
  }
});

// POST /api/wsp/reasons — สร้างใหม่ (admin/superadmin เท่านั้น)
router.post('/reasons', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'กรุณาระบุชื่อเหตุร้องทุกข์' });
    }
    const reason = await WspReason.create({ name: name.trim() });
    logAction({
      actorId: req.user.userId, actorName: `${req.user.firstName} ${req.user.lastName}`.trim(),
      actorRole: req.user.role, action: 'WSP_REASON_CREATE', category: 'wsp',
      detail: `สร้างเหตุร้องทุกข์: ${reason.name}`, ip: getIp(req),
    });
    res.status(201).json(reason);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'ชื่อเหตุร้องทุกข์นี้มีอยู่แล้ว' });
    console.error('POST /api/wsp/reasons error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างเหตุร้องทุกข์' });
  }
});

// PUT /api/wsp/reasons/:id — แก้ไข (admin/superadmin เท่านั้น)
router.put('/reasons/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (isActive !== undefined) update.isActive = isActive;
    const reason = await WspReason.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!reason) return res.status(404).json({ message: 'ไม่พบเหตุร้องทุกข์' });
    res.json(reason);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'ชื่อเหตุร้องทุกข์นี้มีอยู่แล้ว' });
    console.error('PUT /api/wsp/reasons/:id error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขเหตุร้องทุกข์' });
  }
});

// DELETE /api/wsp/reasons/:id — ลบ (superadmin เท่านั้น)
router.delete('/reasons/:id', requireRole('superadmin'), async (req, res) => {
  try {
    const reason = await WspReason.findByIdAndDelete(req.params.id);
    if (!reason) return res.status(404).json({ message: 'ไม่พบเหตุร้องทุกข์' });
    logAction({
      actorId: req.user.userId, actorName: `${req.user.firstName} ${req.user.lastName}`.trim(),
      actorRole: req.user.role, action: 'WSP_REASON_DELETE', category: 'wsp',
      detail: `ลบเหตุร้องทุกข์: ${reason.name}`, ip: getIp(req),
    });
    res.json({ message: 'ลบเหตุร้องทุกข์สำเร็จ' });
  } catch (err) {
    console.error('DELETE /api/wsp/reasons/:id error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบเหตุร้องทุกข์' });
  }
});

// ────────────────────────────────────────────────────────────
// SECTION 2: หน่วยรับผิดชอบ (WspAgency)
// ────────────────────────────────────────────────────────────

// GET /api/wsp/agencies — ดึงทั้งหมด
router.get('/agencies', async (req, res) => {
  try {
    const agencies = await WspAgency.find().sort({ name: 1 }).lean();
    res.json(agencies);
  } catch (err) {
    console.error('GET /api/wsp/agencies error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลหน่วยรับผิดชอบ' });
  }
});

// POST /api/wsp/agencies — สร้างใหม่ (admin/superadmin เท่านั้น)
router.post('/agencies', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'กรุณาระบุชื่อหน่วยรับผิดชอบ' });
    }
    const agency = await WspAgency.create({ name: name.trim() });
    logAction({
      actorId: req.user.userId, actorName: `${req.user.firstName} ${req.user.lastName}`.trim(),
      actorRole: req.user.role, action: 'WSP_AGENCY_CREATE', category: 'wsp',
      detail: `สร้างหน่วยรับผิดชอบ: ${agency.name}`, ip: getIp(req),
    });
    res.status(201).json(agency);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'ชื่อหน่วยรับผิดชอบนี้มีอยู่แล้ว' });
    console.error('POST /api/wsp/agencies error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างหน่วยรับผิดชอบ' });
  }
});

// PUT /api/wsp/agencies/:id — แก้ไข (admin/superadmin เท่านั้น)
router.put('/agencies/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (isActive !== undefined) update.isActive = isActive;
    const agency = await WspAgency.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!agency) return res.status(404).json({ message: 'ไม่พบหน่วยรับผิดชอบ' });
    res.json(agency);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'ชื่อหน่วยรับผิดชอบนี้มีอยู่แล้ว' });
    console.error('PUT /api/wsp/agencies/:id error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขหน่วยรับผิดชอบ' });
  }
});

// DELETE /api/wsp/agencies/:id — ลบ (superadmin เท่านั้น)
router.delete('/agencies/:id', requireRole('superadmin'), async (req, res) => {
  try {
    const agency = await WspAgency.findByIdAndDelete(req.params.id);
    if (!agency) return res.status(404).json({ message: 'ไม่พบหน่วยรับผิดชอบ' });
    logAction({
      actorId: req.user.userId, actorName: `${req.user.firstName} ${req.user.lastName}`.trim(),
      actorRole: req.user.role, action: 'WSP_AGENCY_DELETE', category: 'wsp',
      detail: `ลบหน่วยรับผิดชอบ: ${agency.name}`, ip: getIp(req),
    });
    res.json({ message: 'ลบหน่วยรับผิดชอบสำเร็จ' });
  } catch (err) {
    console.error('DELETE /api/wsp/agencies/:id error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบหน่วยรับผิดชอบ' });
  }
});

// PATCH /api/wsp/agencies/:id/members — อัปเดตสมาชิกรับแจ้งเตือน (สูงสุด 2 คน)
router.patch('/agencies/:id/members', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { members } = req.body; // [{ lineUserId, displayName }, ...]
    if (!Array.isArray(members) || members.length > 2) {
      return res.status(400).json({ message: 'กรุณาส่งรายชื่อสมาชิก (array สูงสุด 2 คน)' });
    }
    const cleaned = members
      .filter(m => m.lineUserId && m.lineUserId.trim())
      .slice(0, 2)
      .map(m => ({ lineUserId: m.lineUserId.trim(), displayName: (m.displayName || '').trim() }));

    const agency = await WspAgency.findByIdAndUpdate(
      req.params.id,
      { $set: { members: cleaned } },
      { new: true, runValidators: true }
    );
    if (!agency) return res.status(404).json({ message: 'ไม่พบหน่วยรับผิดชอบ' });
    res.json(agency);
  } catch (err) {
    console.error('PATCH /api/wsp/agencies/:id/members error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตสมาชิก' });
  }
});

// ────────────────────────────────────────────────────────────
// SECTION 3: คำร้องประปา (WSP Tickets)
// การรับเรื่อง/ดำเนินการ/เปลี่ยนสถานะ ทำผ่านระบบเดิม (dashboard)
// ทะเบียนคุมแสดงเฉพาะคำร้องของ "สำนักการประปา" ที่รับเรื่องแล้ว
// ────────────────────────────────────────────────────────────

// GET /api/wsp/tickets — ดึงคำร้องของสำนักการประปา (รับเรื่องแล้ว)
// Query params: view (inprogress|completed_pending|completed_done), agency, page, limit
router.get('/tickets', async (req, res) => {
  try {
    const { view, agency, page = 1, limit = 50 } = req.query;
    // แสดงเฉพาะคำร้องที่รับเรื่องแล้ว (ไม่ใช่ "รอรับเรื่อง")
    const filter = {
      assignedDepartment: WSP_DEPARTMENT,
      status: { $ne: 'รอรับเรื่อง' },
    };

    if (view === 'inprogress') {
      filter.status = 'ระหว่างดำเนินการ';
    } else if (view === 'completed_pending') {
      filter.status = 'เสร็จสิ้น';
      filter.wspCleanupStatus = { $ne: 'COMPLETED' };
    } else if (view === 'completed_done') {
      filter.status = 'เสร็จสิ้น';
      filter.wspCleanupStatus = 'COMPLETED';
    }

    if (agency) filter.wspAgency = agency;

    const skip = (Number(page) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    res.json({ tickets, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('GET /api/wsp/tickets error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงคำร้องประปา' });
  }
});

// GET /api/wsp/tickets/:id — ดึงคำร้องเดี่ยว (ของสำนักการประปา)
router.get('/tickets/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'รูปแบบ ID ไม่ถูกต้อง' });
    }
    const ticket = await Ticket.findOne({ _id: req.params.id, assignedDepartment: WSP_DEPARTMENT }).lean();
    if (!ticket) return res.status(404).json({ message: 'ไม่พบคำร้องประปา' });
    res.json(ticket);
  } catch (err) {
    console.error('GET /api/wsp/tickets/:id error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำร้อง' });
  }
});

// POST /api/wsp/verify-line — ตรวจสอบ LINE User ID ของผู้ร้อง
// หมายเหตุ: LINE OA ไม่สามารถ "ส่งคำขอเป็นเพื่อน" ไปยังผู้ใช้ได้ (LINE ไม่อนุญาต)
// ทำได้เพียงตรวจว่า userId เป็นเพื่อนกับ OA อยู่แล้วหรือไม่ (getProfile)
router.post('/verify-line', async (req, res) => {
  try {
    const lineUserId = (req.body.lineUserId || '').trim();
    if (!lineUserId) {
      return res.status(400).json({ message: 'กรุณาระบุ LINE User ID' });
    }
    try {
      const profile = await lineClient.getProfile(lineUserId);
      return res.json({
        found: true,
        displayName: profile.displayName || '',
        pictureUrl: profile.pictureUrl || '',
        addFriendQr: '/uploads/Line/LineQR.png',
      });
    } catch (lineErr) {
      // ไม่พบ = ยังไม่ได้เพิ่ม OA เป็นเพื่อน / ID ไม่ถูกต้อง
      return res.json({
        found: false,
        message: 'ตรวจไม่พบ — ผู้ใช้ยังไม่ได้เพิ่มบัญชีทางการเป็นเพื่อน หรือ ID ไม่ถูกต้อง',
        addFriendQr: '/uploads/Line/LineQR.png',
      });
    }
  } catch (err) {
    console.error('POST /api/wsp/verify-line error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการตรวจสอบ LINE ID' });
  }
});

// POST /api/wsp/verify-email — ตรวจสอบอีเมลว่าใช้งานได้จริงหรือไม่
// ตรวจ 2 ระดับ: รูปแบบ (regex) + โดเมนรับอีเมลได้ (DNS MX record)
// หมายเหตุ: ยืนยันได้แค่ว่าโดเมนรับเมลได้ ไม่สามารถยืนยันว่ากล่องเมลนั้นมีอยู่จริง
router.post('/verify-email', async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !re.test(email)) {
      return res.json({ valid: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    const domain = email.split('@')[1];
    try {
      const mx = await dns.resolveMx(domain);
      if (mx && mx.length > 0) {
        return res.json({ valid: true, message: 'อีเมลใช้งานได้ (โดเมนรับอีเมลได้)' });
      }
      return res.json({ valid: false, message: 'โดเมนนี้ไม่รองรับการรับอีเมล' });
    } catch (dnsErr) {
      return res.json({ valid: false, message: 'ไม่พบโดเมนอีเมลนี้ (ตรวจ MX ไม่สำเร็จ)' });
    }
  } catch (err) {
    console.error('POST /api/wsp/verify-email error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการตรวจสอบอีเมล' });
  }
});

// POST /api/wsp/tickets — เจ้าหน้าที่กรอกคำร้องแทนผู้ร้อง (walk-in / โทรศัพท์)
// บันทึกลงระบบเดิม สถานะ "ระหว่างดำเนินการ" ทันที แล้วดำเนินการต่อผ่านระบบเดิม
router.post('/tickets', requireRole('superadmin', 'admin', 'executive', 'staff'), async (req, res) => {
  try {
    const {
      displayName, phone, email, subject, description,
      wspReason, wspReasonOther, wspAgency, notifyLineUserId,
      location,
    } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: 'กรุณาระบุหัวเรื่องและรายละเอียด' });
    }

    // ถ้าเลือกเหตุ "อื่น ๆ" จำเป็นต้องระบุรายละเอียด
    const reasonOtherText = (wspReasonOther || '').trim();
    if (wspReason === 'อื่น ๆ' && !reasonOtherText) {
      return res.status(400).json({ message: 'กรุณาระบุรายละเอียดเหตุร้องทุกข์อื่น ๆ' });
    }

    const wspId = await generateWspId();
    const staffName = `${req.user.firstName} ${req.user.lastName}`.trim();

    // ช่องทางแจ้งเตือน: ถ้ามี LINE ID (ตรวจสอบแล้ว) → ใช้ id ผู้ร้อง, ไม่งั้นใช้ id staff
    const cleanLineId = (notifyLineUserId || '').trim();
    const hasLine  = /^U[0-9a-f]{32}$/i.test(cleanLineId);
    const hasEmail = !!(email && email.trim());
    // ไม่มีทั้ง LINE และ email → ต้องแจ้งกลับผู้ร้องช่องทางอื่น
    const wspNeedManualContact = !hasLine && !hasEmail;

    const ticket = await Ticket.create({
      // LIFF ต้องการ lineUserId → ใช้ id ผู้ร้องถ้ามี ไม่งั้นใช้ id staff
      lineUserId:         hasLine ? cleanLineId : req.user.userId,
      displayName:        displayName || staffName,
      phone:              phone || '',
      email:              hasEmail ? email.trim() : '',
      subject:            subject.trim(),
      description:        description.trim(),
      assignedDepartment: WSP_DEPARTMENT,
      status:             'ระหว่างดำเนินการ',
      location:           location || { lat: null, lng: null },
      // WSP fields
      isWsp:              true,
      wspId,
      wspReason:          wspReason || null,
      wspReasonOther:     wspReason === 'อื่น ๆ' ? reasonOtherText : '',
      wspAgency:          wspAgency || null,
      wspCreatedBy:       req.user.userId,
      wspCleanupStatus:   'NONE',
      wspNeedManualContact,
      history: [{
        status:        'ระหว่างดำเนินการ',
        note:          `เจ้าหน้าที่กรอกคำร้องแทนผู้ร้อง (WSP ID: ${wspId})`,
        updatedById:   req.user.userId,
        updatedByName: staffName,
        updatedAt:     new Date(),
      }],
    });

    logAction({
      actorId: req.user.userId, actorName: staffName,
      actorRole: req.user.role, action: 'WSP_TICKET_CREATE', category: 'wsp',
      detail: `สร้างคำร้องประปา ${wspId} — ${subject}`, ip: getIp(req),
    });

    // แจ้งเตือนผู้ร้องทางอีเมล (ถ้ามีอีเมล) — ไม่บล็อกการตอบกลับ
    if (hasEmail) {
      sendWspTicketCreatedEmail(ticket).catch((e) =>
        console.error('sendWspTicketCreatedEmail error:', e.message));
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error('POST /api/wsp/tickets error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างคำร้องประปา' });
  }
});

// PATCH /api/wsp/tickets/:id/agency — จ่ายงาน / เปลี่ยนหน่วยรับผิดชอบ (สำนักการประปา)
router.patch('/tickets/:id/agency', requireRole('superadmin', 'admin', 'executive', 'staff'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'รูปแบบ ID ไม่ถูกต้อง' });
    }
    const ticket = await Ticket.findOne({ _id: req.params.id, assignedDepartment: WSP_DEPARTMENT });
    if (!ticket) {
      return res.status(404).json({ message: 'ไม่พบคำร้องประปา' });
    }
    const wspAgency = (req.body.wspAgency || '').trim();
    const staffName = `${req.user.firstName} ${req.user.lastName}`.trim();
    const prev = ticket.wspAgency || '(ไม่ระบุ)';
    ticket.wspAgency = wspAgency || null;
    ticket.history.push({
      status:        ticket.status,
      note:          `จ่ายงานให้หน่วยรับผิดชอบ: ${wspAgency || '(ไม่ระบุ)'}${prev !== (wspAgency || '(ไม่ระบุ)') ? ` (เดิม: ${prev})` : ''}`,
      updatedById:   req.user.userId,
      updatedByName: staffName,
      updatedAt:     new Date(),
    });
    await ticket.save();

    // ส่งแจ้งเตือนไปยังสมาชิกหน่วยรับผิดชอบ (ถ้ามี)
    if (wspAgency) {
      const agency = await WspAgency.findOne({ name: wspAgency }).lean();
      if (agency && agency.members && agency.members.length > 0) {
        const message = {
          type: 'flex',
          altText: `[จ่ายงาน] ${ticket.wspId || ticket.ticketNo}`,
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '💼 มีงานใหม่จ่ายเข้ามา', weight: 'bold', color: '#ffffff', size: 'md' },
              ],
              backgroundColor: '#1a5f9e',
              paddingAll: '12px',
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: `${ticket.wspId || ticket.ticketNo}`, weight: 'bold', size: 'lg', color: '#1a5f9e' },
                { type: 'text', text: ticket.subject || '-', wrap: true, margin: 'sm', size: 'sm' },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: `หน่วยรับผิดชอบ: ${wspAgency}`, size: 'sm', color: '#666666', margin: 'md' },
                { type: 'text', text: `จ่ายงานโดย: ${staffName}`, size: 'xs', color: '#999999', margin: 'xs' },
              ],
            },
          },
        };
        for (const member of agency.members) {
          try {
            await lineClient.pushMessage({ to: member.lineUserId, messages: [message] });
          } catch (pushErr) {
            console.error(`LINE push to ${member.lineUserId} failed:`, pushErr.message);
          }
        }
      }
    }

    logAction({
      actorId: req.user.userId, actorName: staffName,
      actorRole: req.user.role, action: 'WSP_ASSIGN_AGENCY', category: 'wsp',
      detail: `จ่ายงาน ${ticket.wspId || ticket.ticketNo} → ${wspAgency || '(ไม่ระบุ)'}`, ip: getIp(req),
    });

    res.json(ticket);
  } catch (err) {
    console.error('PATCH /api/wsp/tickets/:id/agency error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการจ่ายงาน' });
  }
});

// PATCH /api/wsp/tickets/:id/cleanup — อัปเดต workflow การเก็บงาน
router.patch('/tickets/:id/cleanup', requireRole('superadmin', 'admin', 'executive', 'staff'), async (req, res) => {
  // รับไฟล์ก่อน (ถ้ามี) แล้วค่อยประมวลผล
  try {
    await runCleanupUpload(req, res);
  } catch (uploadErr) {
    if (uploadErr instanceof multer.MulterError) {
      return res.status(400).json({ message: `อัปโหลดไม่สำเร็จ: ${uploadErr.message}` });
    }
    return res.status(400).json({ message: uploadErr.message || 'ไฟล์ไม่ถูกต้อง' });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: 'รูปแบบ ID ไม่ถูกต้อง' });
    }

    const ticket = await Ticket.findOne({ _id: req.params.id, assignedDepartment: WSP_DEPARTMENT });
    if (!ticket) {
      cleanupFiles(req.files);
      return res.status(404).json({ message: 'ไม่พบคำร้องประปา' });
    }

    const { wspCleanupStatus, wspCleanupDueDays } = req.body;
    const VALID = ['NONE', 'WAITING', 'COMPLETED'];
    if (!VALID.includes(wspCleanupStatus)) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: 'สถานะการเก็บงานไม่ถูกต้อง (NONE/WAITING/COMPLETED)' });
    }

    const staffName = `${req.user.firstName} ${req.user.lastName}`.trim();
    ticket.wspCleanupStatus = wspCleanupStatus;

    if (wspCleanupStatus === 'WAITING') {
      if (!wspCleanupDueDays || Number(wspCleanupDueDays) < 1) {
        cleanupFiles(req.files);
        return res.status(400).json({ message: 'กรุณาระบุจำนวนวันรอเก็บงาน (อย่างน้อย 1 วัน)' });
      }
      ticket.wspCleanupDueDays = Number(wspCleanupDueDays);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Number(wspCleanupDueDays));
      ticket.wspCleanupDueDate = dueDate;
      ticket.history.push({
        status:        ticket.status,
        note:          `ตั้งสถานะรอเก็บงาน ภายใน ${wspCleanupDueDays} วัน (ถึง ${dueDate.toLocaleDateString('th-TH')})`,
        updatedById:   req.user.userId,
        updatedByName: staffName,
        updatedAt:     new Date(),
      });
    }

    if (wspCleanupStatus === 'COMPLETED') {
      // ประมวลผลรูปที่อัปโหลด (compress ด้วย sharp)
      const uploadedFilenames = [];
      for (const file of (req.files || [])) {
        try {
          const datePath = getDateBasedPath();
          const outName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const outPath = path.join(uploadsDir, datePath, outName);
          if (!fs.existsSync(path.join(uploadsDir, datePath))) {
            fs.mkdirSync(path.join(uploadsDir, datePath), { recursive: true });
          }
          await sharp(file.path)
            .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(outPath);
          fs.unlink(file.path, () => {});
          uploadedFilenames.push(`${datePath}/${outName}`);
        } catch {
          uploadedFilenames.push(`${getDateBasedPath()}/${path.basename(file.path)}`);
        }
      }

      if (uploadedFilenames.length === 0) {
        return res.status(400).json({ message: 'กรุณาแนบรูปยืนยันการเก็บงานอย่างน้อย 1 รูป' });
      }
      ticket.wspCleanupImages = uploadedFilenames;
      ticket.status = 'เสร็จสิ้น';
      ticket.history.push({
        status:        'เสร็จสิ้น',
        note:          'เก็บงานเสร็จสิ้น (มีรูปยืนยัน)',
        updatedById:   req.user.userId,
        updatedByName: staffName,
        updatedAt:     new Date(),
      });
    }

    await ticket.save();
    res.json(ticket);
  } catch (err) {
    cleanupFiles(req.files);
    console.error('PATCH /api/wsp/tickets/:id/cleanup error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตการเก็บงาน' });
  }
});

// GET /api/wsp/stats — สถิติภาพรวมคำร้องประปา
router.get('/stats', async (req, res) => {
  try {
    const { year, month } = req.query; // year=2026, month=7 (optional)
    const filter = {
      assignedDepartment: WSP_DEPARTMENT,
      status: { $ne: 'รอรับเรื่อง' },
    };

    if (year || month) {
      const y = Number(year) || new Date().getFullYear();
      const m = month ? Number(month) - 1 : null; // JS month 0-based
      const start = m !== null ? new Date(y, m, 1) : new Date(y, 0, 1);
      const end   = m !== null ? new Date(y, m + 1, 1) : new Date(y + 1, 0, 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const [total, byStatus, byAgency, byReason, overdue, completed, cleanupDone] = await Promise.all([
      Ticket.countDocuments(filter),
      Ticket.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Ticket.aggregate([
        { $match: filter },
        { $group: { _id: '$wspAgency', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Ticket.aggregate([
        { $match: filter },
        { $group: { _id: '$wspReason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Ticket.countDocuments({
        ...filter,
        wspCleanupStatus: 'WAITING',
        wspCleanupDueDate: { $lt: new Date() },
      }),
      Ticket.countDocuments({ ...filter, status: 'เสร็จสิ้น' }),
      Ticket.countDocuments({ ...filter, status: 'เสร็จสิ้น', wspCleanupStatus: 'COMPLETED' }),
    ]);

    res.json({ total, byStatus, byAgency, byReason, overdue, completed, cleanupDone });
  } catch (err) {
    console.error('GET /api/wsp/stats error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงสถิติ' });
  }
});

module.exports = router;
