const express = require('express');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ทุก route ต้อง login + superadmin เท่านั้น
router.use(requireAuth, requireRole('superadmin'));

// ============================================================
// GET /api/audit
// ดึง audit log พร้อม search/filter/pagination
// Query: ?search=&action=&category=&actorId=&from=&to=&page=1&limit=50
// ============================================================
router.get('/', async (req, res) => {
  try {
    const {
      search   = '',
      action   = '',
      category = '',
      actorId  = '',
      from     = '',
      to       = '',
      page     = 1,
      limit    = 50,
    } = req.query;

    const filter = {};

    // ── ค้นหาแบบ text ─────────────────────────────────────
    if (search) {
      const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { actorName:   { $regex: esc, $options: 'i' } },
        { actorId:     { $regex: esc, $options: 'i' } },
        { detail:      { $regex: esc, $options: 'i' } },
        { targetId:    { $regex: esc, $options: 'i' } },
        { targetLabel: { $regex: esc, $options: 'i' } },
      ];
    }

    if (action)   filter.action   = action;
    if (category) filter.category = category;
    if (actorId)  filter.actorId  = actorId;

    // ── กรองตามช่วงวันที่ ────────────────────────────────
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })  // ล่าสุดก่อน
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error('GET /api/audit error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึง audit log' });
  }
});

// ============================================================
// GET /api/audit/meta
// ดึงรายการ action และ category ที่มีอยู่ทั้งหมด (สำหรับ dropdown)
// ============================================================
router.get('/meta', async (req, res) => {
  try {
    const [actions, categories] = await Promise.all([
      AuditLog.distinct('action'),
      AuditLog.distinct('category'),
    ]);
    res.json({ actions, categories });
  } catch (err) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;
