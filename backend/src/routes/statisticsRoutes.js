const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const Ticket = require('../models/Ticket');

// ── เฉพาะ admin, executive, superadmin เท่านั้น ───────────
router.use(requireAuth, requireRole('admin', 'executive', 'staff', 'superadmin'));

// ── GET /api/statistics?year=YYYY&fiscalYear=YYYY ─────────
// สรุปสถิติรายเดือนและรายปี
router.get('/', async (req, res, next) => {
  try {
    const { year, fiscalYear } = req.query;
    
    // default: ปีปัจจุบัน
    const currentYear = new Date().getFullYear();
    const targetYear = year ? parseInt(year) : currentYear;
    
    // ปีงบประมาณ: ตุลาคม (ปีก่อน) - กันยายน (ปีปัจจุบัน)
    // เช่น ปีงบ 2569 = ต.ค. 2568 - ก.ย. 2569
    const targetFiscalYear = fiscalYear ? parseInt(fiscalYear) : currentYear;
    const fiscalStart = new Date(targetFiscalYear - 1, 9, 1); // 1 ต.ค. ปีก่อน
    const fiscalEnd = new Date(targetFiscalYear, 8, 30, 23, 59, 59); // 30 ก.ย. ปีปัจจุบัน

    // ── สถิติรายเดือน (ปีปฏิทิน) ────────────────────────────
    const monthlyStats = await Ticket.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(targetYear, 0, 1), // 1 ม.ค.
            $lte: new Date(targetYear, 11, 31, 23, 59, 59), // 31 ธ.ค.
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: '$createdAt' } },
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'รอรับเรื่อง'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'ระหว่างดำเนินการ'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'เสร็จสิ้น'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'ไม่รับเรื่อง'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]);

    // เติมเดือนที่ไม่มีข้อมูลให้ครบ 12 เดือน
    const months = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyStats.find((s) => s._id.month === i + 1);
      return found || {
        _id: { month: i + 1 },
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        rejected: 0,
      };
    });

    // ── สถิติรายปีงบประมาณ ─────────────────────────────────
    const fiscalStats = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: fiscalStart, $lte: fiscalEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'รอรับเรื่อง'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'ระหว่างดำเนินการ'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'เสร็จสิ้น'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'ไม่รับเรื่อง'] }, 1, 0] } },
        },
      },
    ]);

    // ── สถิติตามหน่วยงาน (ปีงบประมาณ) ───────────────────────
    const departmentStats = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: fiscalStart, $lte: fiscalEnd },
        },
      },
      {
        $group: {
          _id: '$assignedDepartment',
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'รอรับเรื่อง'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'ระหว่างดำเนินการ'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'เสร็จสิ้น'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'ไม่รับเรื่อง'] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({
      year: targetYear,
      fiscalYear: targetFiscalYear,
      fiscalPeriod: {
        start: fiscalStart.toISOString().split('T')[0],
        end: fiscalEnd.toISOString().split('T')[0],
      },
      monthlyStats: months,
      fiscalStats: fiscalStats[0] || { total: 0, pending: 0, inProgress: 0, completed: 0, rejected: 0 },
      departmentStats,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
