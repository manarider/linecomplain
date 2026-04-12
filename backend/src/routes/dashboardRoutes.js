const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Ticket = require('../models/Ticket');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { pushStatusUpdate } = require('../utils/lineNotify');
const { TICKET_STATUS, FULL_ACCESS_ROLES, DEPARTMENTS, SYSTEM_SETTINGS } = require('../config/constants');
const { logAction, actorFromUser } = require('../utils/auditLog');

const router = express.Router();

// ── Multer สำหรับ completionImages (รูปผลการดำเนินงาน) ─────
const uploadsDir = path.join(__dirname, '../../uploads');
const completionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safeName);
  },
});
const completionFileFilter = (req, file, cb) => {
  const allowed = /^image\/(jpeg|png|gif|webp)$/;
  const extAllowed = /\.(jpg|jpeg|png|gif|webp)$/i;
  if (allowed.test(file.mimetype) || extAllowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
  }
};
const completionUpload = multer({
  storage: completionStorage,
  fileFilter: completionFileFilter,
  limits: { fileSize: SYSTEM_SETTINGS.MAX_IMAGE_SIZE, files: 3 },
});
const runCompletionUpload = (req, res) =>
  new Promise((resolve, reject) => {
    completionUpload.array('completionImages', 3)(req, res, (err) => {
      if (err) reject(err); else resolve();
    });
  });

// ทุก route ใน dashboard ต้อง login ก่อน
router.use(requireAuth);

// ============================================================
// GET /api/dashboard/tickets
// ดึงรายการคำร้อง (กรองตามสิทธิ์อัตโนมัติ)
// Query: ?status=รอรับเรื่อง&department=สำนักช่าง&page=1&limit=20&search=
// ============================================================
router.get('/tickets', async (req, res) => {
  try {
    const { status, department, page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // ── สร้าง filter ตามสิทธิ์ ─────────────────────────────
    const filter = {};

    // staff เห็นเฉพาะงานหน่วยงานตัวเองเมื่อดู "ระหว่างดำเนินการ" เท่านั้น
    // แท็บอื่น (รอรับเรื่อง, เสร็จสิ้น, ไม่รับเรื่อง, ทั้งหมด) เห็นได้ทุกหน่วยงาน
    const isStaff = !FULL_ACCESS_ROLES.includes(req.user.role);
    if (isStaff && status === TICKET_STATUS.IN_PROGRESS) {
      filter.assignedDepartment = req.user.subDepartment;
    }

    // กรองเพิ่มเติมตาม query params
    if (status) filter.status = status;
    if (department && !isStaff) {
      filter.assignedDepartment = department;
    }
    if (search) {
      // escape special regex characters เพื่อป้องกัน ReDoS
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { ticketNo: { $regex: escaped, $options: 'i' } },
        { subject: { $regex: escaped, $options: 'i' } },
        { displayName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-history'), // ไม่ดึง history ในหน้ารายการ (ดึงตอนเปิด detail)
      Ticket.countDocuments(filter),
    ]);

    res.json({
      tickets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error('GET /dashboard/tickets error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

// ============================================================
// GET /api/dashboard/tickets/summary
// สรุปจำนวนตามสถานะ (สำหรับแสดงนับที่ tab)
// ============================================================
router.get('/tickets/summary', async (req, res) => {
  try {
    const isStaff = !FULL_ACCESS_ROLES.includes(req.user.role);

    // นับทุกสถานะโดยไม่กรองหน่วยงาน (รอรับเรื่อง/เสร็จสิ้น/ไม่รับเรื่องทุกคนเห็นครบ)
    const summary = await Ticket.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const result = Object.values(TICKET_STATUS).reduce((acc, s) => {
      acc[s] = 0;
      return acc;
    }, {});
    summary.forEach(({ _id, count }) => {
      if (_id in result) result[_id] = count;
    });

    // staff เห็นจำนวน ดำเนินการ เฉพาะหน่วยงานตัวเอง
    if (isStaff) {
      result[TICKET_STATUS.IN_PROGRESS] = await Ticket.countDocuments({
        assignedDepartment: req.user.subDepartment,
        status: TICKET_STATUS.IN_PROGRESS,
      });
    }

    // ทั้งหมด = นับ tickets ทั้ง collection ไม่กรอง
    result['ทั้งหมด'] = await Ticket.countDocuments({});

    res.json(result);
  } catch (err) {
    console.error('GET /dashboard/tickets/summary error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// GET /api/dashboard/tickets/:id
// ดูรายละเอียดเต็ม + history
// ============================================================
router.get('/tickets/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'ไม่พบเรื่องร้องทุกข์นี้' });

    // ทุก role ดูรายละเอียดได้ — การแก้ไขสถานะยังคงตรวจสิทธิ์ที่ PATCH /status
    res.json(ticket);
  } catch (err) {
    console.error('GET /dashboard/tickets/:id error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// PATCH /api/dashboard/tickets/:id/status
// อัปเดตสถานะ + แจ้งเตือนผู้แจ้งผ่าน LINE
// Body: { status, note } หรือ multipart/form-data (พร้อมรูป completionImages)
// ============================================================
router.patch('/tickets/:id/status', async (req, res) => {
  // ── รับ multipart (รูปผลงาน) ถ้ามี ──────────────────────
  if (req.is('multipart/form-data')) {
    try {
      await runCompletionUpload(req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ message: 'ไฟล์มีขนาดเกิน 500KB' });
        if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: 'อัปโหลดได้สูงสุด 3 รูปเท่านั้น' });
      }
      return res.status(400).json({ message: err.message });
    }
  }

  try {
    const { status, note } = req.body;

    // ตรวจสอบว่า status ที่ส่งมาถูกต้อง
    if (!Object.values(TICKET_STATUS).includes(status)) {
      if (req.files) req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      if (req.files) req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(404).json({ message: 'ไม่พบเรื่องร้องทุกข์นี้' });
    }

    // staff ตรวจสิทธิ์ก่อนอัปเดต
    if (!FULL_ACCESS_ROLES.includes(req.user.role) &&
        ticket.assignedDepartment !== req.user.subDepartment) {
      if (req.files) req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเรื่องนี้' });
    }

    const previousStatus = ticket.status;

    // อัปเดตสถานะ
    ticket.status = status;
    ticket.assignedToId = req.user.userId;
    ticket.assignedToName = `${req.user.firstName} ${req.user.lastName}`;

    // บันทึกรูปผลการดำเนินงาน (เฉพาะสถานะเสร็จสิ้น)
    if (status === TICKET_STATUS.COMPLETED && req.files && req.files.length > 0) {
      ticket.completionImages = req.files.map((f) => f.filename);
    }

    // บันทึก history
    ticket.history.push({
      status,
      note: note || '',
      updatedById: req.user.userId,
      updatedByName: `${req.user.firstName} ${req.user.lastName}`,
    });

    await ticket.save();

    // ส่ง push notification ให้ผู้แจ้ง (ไม่ blocking)
    pushStatusUpdate(ticket, note).catch((err) =>
      console.error('LINE push error:', err.message)
    );

    res.json({
      message: 'อัปเดตสถานะสำเร็จ',
      ticketNo: ticket.ticketNo,
      previousStatus,
      newStatus: status,
    });

    // ── Audit Log ──
    logAction({
      ...actorFromUser(req),
      action: 'UPDATE_STATUS',
      category: 'ticket',
      targetId: ticket.ticketNo,
      targetLabel: ticket.subject,
      detail: `เปลี่ยนสถานะ "${previousStatus}" → "${status}"${note ? ` (หมายเหตุ: ${note})` : ''}`,
      meta: { ticketId: req.params.id, previousStatus, newStatus: status, note },
    });
  } catch (err) {
    if (req.files) req.files.forEach((f) => fs.unlink(f.path, () => {}));
    console.error('updateStatus error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ' });
  }
});

// ============================================================
// PATCH /api/dashboard/tickets/:id/forward
// ส่งต่อเรื่องไปหน่วยงานอื่น (admin/manager เท่านั้น)
// Body: { targetDepartment, note }
// ============================================================
router.patch(
  '/tickets/:id/forward',
  requireRole('superadmin', 'admin', 'executive'),
  async (req, res) => {
    try {
      const { targetDepartment, note } = req.body;

      if (!DEPARTMENTS.includes(targetDepartment) && targetDepartment !== 'ไม่แน่ใจ') {
        return res.status(400).json({ message: 'หน่วยงานปลายทางไม่ถูกต้อง' });
      }

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ message: 'ไม่พบเรื่องร้องทุกข์นี้' });

      const previousDepartment = ticket.assignedDepartment;

      // เปลี่ยนหน่วยงาน และตั้งสถานะเป็น "ระหว่างดำเนินการ" (ไปอยู่ใน tab ดำเนินการ)
      ticket.assignedDepartment = targetDepartment;
      ticket.status = TICKET_STATUS.IN_PROGRESS;
      ticket.assignedToId = req.user.userId;
      ticket.assignedToName = `${req.user.firstName} ${req.user.lastName}`;

      ticket.history.push({
        status: TICKET_STATUS.IN_PROGRESS,
        note: `ส่งต่อจาก ${previousDepartment} ไป ${targetDepartment}${note ? `: ${note}` : ''}`,
        updatedById: req.user.userId,
        updatedByName: `${req.user.firstName} ${req.user.lastName}`,
      });

      await ticket.save();

      // แจ้งเตือนผู้แจ้ง
      pushStatusUpdate(ticket, `ส่งต่อไปยัง${targetDepartment}`).catch((err) =>
        console.error('LINE push error:', err.message)
      );

      res.json({
        message: 'ส่งต่อเรื่องสำเร็จ',
        ticketNo: ticket.ticketNo,
        from: previousDepartment,
        to: targetDepartment,
      });

      // ── Audit Log ──
      logAction({
        ...actorFromUser(req),
        action: 'FORWARD_TICKET',
        category: 'ticket',
        targetId: ticket.ticketNo,
        targetLabel: ticket.subject,
        detail: `ส่งต่อจาก "${previousDepartment}" → "${targetDepartment}"${note ? ` (หมายเหตุ: ${note})` : ''}`,
        meta: { ticketId: req.params.id, from: previousDepartment, to: targetDepartment, note },
      });
    } catch (err) {
      console.error('forwardTicket error:', err);
      res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งต่อเรื่อง' });
    }
  }
);

// ============================================================
// GET /api/dashboard/complainants
// สถิติผู้ร้อง — เฉพาะ superadmin
// Query: ?year=2568  (พุทธศักราช)
// ============================================================
router.get(
  '/complainants',
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const { year } = req.query; // พุทธศักราช เช่น 2568

      // ── รายชื่อปีที่มีคำร้อง (ค.ศ.) ──────────────────────
      const yearDocs = await Ticket.aggregate([
        { $group: { _id: { $year: '$createdAt' } } },
        { $sort: { _id: -1 } },
      ]);
      const availableYears = yearDocs.map(d => d._id); // ค.ศ.

      // ── สร้าง match filter ตามปีที่เลือก ─────────────────
      const match = {};
      if (year) {
        const ce = Number(year) - 543; // แปลง พ.ศ. → ค.ศ.
        match.createdAt = {
          $gte: new Date(`${ce}-01-01T00:00:00.000Z`),
          $lt:  new Date(`${ce + 1}-01-01T00:00:00.000Z`),
        };
      }

      // ── aggregate ตาม lineUserId ──────────────────────────
      const rows = await Ticket.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$lineUserId',
            displayName: { $last: '$displayName' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      res.json({ rows, availableYears });
    } catch (err) {
      console.error('GET /dashboard/complainants error:', err.message);
      res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
    }
  }
);

// ============================================================
// GET /api/dashboard/complainants/:lineUserId/tickets
// รายการคำร้องของผู้ร้องรายคน — เฉพาะ superadmin
// Query: ?year=2568  (พุทธศักราช)
// ============================================================
router.get(
  '/complainants/:lineUserId/tickets',
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const { lineUserId } = req.params;
      const { year } = req.query;

      // ── ปีที่ผู้ร้องรายนี้มีคำร้อง ──────────────────────
      const yearDocs = await Ticket.aggregate([
        { $match: { lineUserId } },
        { $group: { _id: { $year: '$createdAt' } } },
        { $sort: { _id: -1 } },
      ]);
      const availableYears = yearDocs.map(d => d._id); // ค.ศ.

      // ── filter ตามปี ──────────────────────────────────────
      const match = { lineUserId };
      if (year) {
        const ce = Number(year) - 543;
        match.createdAt = {
          $gte: new Date(`${ce}-01-01T00:00:00.000Z`),
          $lt:  new Date(`${ce + 1}-01-01T00:00:00.000Z`),
        };
      }

      const tickets = await Ticket.find(match)
        .sort({ createdAt: -1 })
        .select('ticketNo subject status assignedDepartment createdAt displayName');

      res.json({ tickets, availableYears });
    } catch (err) {
      console.error('GET /dashboard/complainants/:lineUserId/tickets error:', err.message);
      res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
    }
  }
);

module.exports = router;
