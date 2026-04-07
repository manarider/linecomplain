const express = require('express');
const Ticket = require('../models/Ticket');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { pushStatusUpdate } = require('../utils/lineNotify');
const { TICKET_STATUS, FULL_ACCESS_ROLES, DEPARTMENTS } = require('../config/constants');

const router = express.Router();

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

    // staff เห็นเฉพาะงานที่ assignedDepartment ตรงกับ subDepartment ของตัวเอง
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      filter.assignedDepartment = req.user.subDepartment;
    }

    // กรองเพิ่มเติมตาม query params
    if (status) filter.status = status;
    if (department && FULL_ACCESS_ROLES.includes(req.user.role)) {
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
    const filter = {};
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      filter.assignedDepartment = req.user.subDepartment;
    }

    const summary = await Ticket.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // แปลงเป็น object key=status, value=count
    const result = Object.values(TICKET_STATUS).reduce((acc, s) => {
      acc[s] = 0;
      return acc;
    }, {});
    summary.forEach(({ _id, count }) => {
      if (_id in result) result[_id] = count;
    });
    result['ทั้งหมด'] = Object.values(result).reduce((a, b) => a + b, 0);

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

    // staff ตรวจสิทธิ์ก่อนดู
    if (!FULL_ACCESS_ROLES.includes(req.user.role) &&
        ticket.assignedDepartment !== req.user.subDepartment) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึงเรื่องนี้' });
    }

    res.json(ticket);
  } catch (err) {
    console.error('GET /dashboard/tickets/:id error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// PATCH /api/dashboard/tickets/:id/status
// อัปเดตสถานะ + แจ้งเตือนผู้แจ้งผ่าน LINE
// Body: { status, note }
// ============================================================
router.patch('/tickets/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body;

    // ตรวจสอบว่า status ที่ส่งมาถูกต้อง
    if (!Object.values(TICKET_STATUS).includes(status)) {
      return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'ไม่พบเรื่องร้องทุกข์นี้' });

    // staff ตรวจสิทธิ์ก่อนอัปเดต
    if (!FULL_ACCESS_ROLES.includes(req.user.role) &&
        ticket.assignedDepartment !== req.user.subDepartment) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเรื่องนี้' });
    }

    const previousStatus = ticket.status;

    // อัปเดตสถานะ
    ticket.status = status;
    ticket.assignedToId = req.user.userId;
    ticket.assignedToName = `${req.user.firstName} ${req.user.lastName}`;

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
  } catch (err) {
    console.error('PATCH /dashboard/tickets/:id/status error:', err.message);
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

      // เปลี่ยนหน่วยงานและสถานะเป็น "ส่งต่อ"
      ticket.assignedDepartment = targetDepartment;
      ticket.status = TICKET_STATUS.FORWARDED;
      ticket.assignedToId = req.user.userId;
      ticket.assignedToName = `${req.user.firstName} ${req.user.lastName}`;

      ticket.history.push({
        status: TICKET_STATUS.FORWARDED,
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
    } catch (err) {
      console.error('PATCH /dashboard/tickets/:id/forward error:', err.message);
      res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งต่อเรื่อง' });
    }
  }
);

module.exports = router;
