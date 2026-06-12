const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const Ticket = require('../models/Ticket');
const { TICKET_STATUS } = require('../config/constants');

// ── เฉพาะ admin, executive, superadmin เท่านั้น ───────────
router.use(requireAuth, requireRole('admin', 'executive', 'staff', 'superadmin'));

// ── GET /api/statistics?year=YYYY&month=M&fiscalYear=YYYY ─────────
// สรุปสถิติรายเดือนและรายปี
router.get('/', async (req, res, next) => {
  try {
    const { year, fiscalYear, month } = req.query;
    
    // default: ปีปัจจุบัน
    const currentYear = new Date().getFullYear();
    const targetYear = year ? parseInt(year) : currentYear;
    const targetMonth = month ? parseInt(month) : null;
    
    // ปีงบประมาณ: ตุลาคม (ปีก่อน) - กันยายน (ปีปัจจุบัน)
    const targetFiscalYear = fiscalYear ? parseInt(fiscalYear) : currentYear;
    const fiscalStart = new Date(targetFiscalYear - 1, 9, 1); // 1 ต.ค. ปีก่อน
    const fiscalEnd = new Date(targetFiscalYear, 8, 30, 23, 59, 59); // 30 ก.ย. ปีปัจจุบัน

    // ── สถิติรายเดือน (ปีปฏิทิน) ────────────────────────────
    const monthlyStats = await Ticket.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(targetYear, 0, 1),
            $lte: new Date(targetYear, 11, 31, 23, 59, 59),
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: '$createdAt' } },
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.PENDING] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.IN_PROGRESS] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.COMPLETED] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.REJECTED] }, 1, 0] } },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]);

    // เติมเดือนที่ไม่มีข้อมูลให้ครบ 12 เดือน
    const months = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyStats.find((s) => s._id.month === i + 1);
      return found || {
        _id: { month: i + 1 },
        total: 0, pending: 0, inProgress: 0, completed: 0, rejected: 0,
      };
    });

    // ── ปีงบประมาณที่มีข้อมูล สำหรับ dropdown ───────────────
    const availableFiscalYears = await Ticket.aggregate([
      { $group: {
        _id: { $cond: [
          { $gte: [{ $month: '$createdAt' }, 10] },
          { $add: [{ $year: '$createdAt' }, 1] },
          { $year: '$createdAt' }
        ]},
        count: { $sum: 1 }
      }},
      { $match: { count: { $gt: 0 } } },
      { $sort: { _id: -1 } },
      { $project: { _id: 0, fiscalYear: '$_id' } },
    ]);

    // ── เดือนที่มีข้อมูล (ทุกปี) สำหรับ dropdown ─────────────
    const availableMonths = await Ticket.aggregate([
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 0 } } },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month' } },
    ]);

    // ── สถิติแยกหน่วยงานของเดือนที่เลือก ─────────────────────
    let monthlyDeptStats = [];
    if (targetMonth) {
      const mStart = new Date(targetYear, targetMonth - 1, 1);
      const mEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59);
      monthlyDeptStats = await Ticket.aggregate([
        { $match: { createdAt: { $gte: mStart, $lte: mEnd } } },
        { $group: {
          _id: '$assignedDepartment',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.COMPLETED] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.IN_PROGRESS] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.PENDING] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.REJECTED] }, 1, 0] } },
        }},
        { $sort: { total: -1 } },
      ]);
    }

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
          pending: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.PENDING] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.IN_PROGRESS] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.COMPLETED] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.REJECTED] }, 1, 0] } },
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
          pending: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.PENDING] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.IN_PROGRESS] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.COMPLETED] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.REJECTED] }, 1, 0] } },
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
      monthlyDeptStats,
      availableMonths,
      availableFiscalYears,
      fiscalStats: fiscalStats[0] || { total: 0, pending: 0, inProgress: 0, completed: 0, rejected: 0 },
      departmentStats,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
