const express = require('express');
const Ticket = require('../models/Ticket');
const { TICKET_STATUS } = require('../config/constants');

const router = express.Router();

const toFiscalYear = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed > 2400 ? parsed - 543 : parsed;
  }
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
};

const formatLocalDate = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const formatThaiDateShort = (date) => date.toLocaleDateString('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// ============================================================
// GET /api/public/fiscal-summary
// สรุปสถิติปีงบประมาณแบบสาธารณะ สำหรับหน้า embed
// Query: ?fiscalYear=2026 หรือ 2569
// ============================================================
router.get('/fiscal-summary', async (req, res) => {
  try {
    const fiscalYear = toFiscalYear(req.query.fiscalYear);
    const fiscalStart = new Date(fiscalYear - 1, 9, 1, 0, 0, 0, 0);
    const fiscalEnd = new Date(fiscalYear, 8, 30, 23, 59, 59, 999);
    const matchFiscalPeriod = { createdAt: { $gte: fiscalStart, $lte: fiscalEnd } };

    const [statusSummary, departmentStats, completionSummary] = await Promise.all([
      Ticket.aggregate([
        { $match: matchFiscalPeriod },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.COMPLETED] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.IN_PROGRESS] }, 1, 0] } },
          },
        },
      ]),
      Ticket.aggregate([
        { $match: matchFiscalPeriod },
        {
          $group: {
            _id: '$assignedDepartment',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.COMPLETED] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', TICKET_STATUS.IN_PROGRESS] }, 1, 0] } },
          },
        },
        { $sort: { total: -1, _id: 1 } },
      ]),
      Ticket.aggregate([
        { $match: { ...matchFiscalPeriod, status: TICKET_STATUS.COMPLETED } },
        {
          $addFields: {
            completedEvents: {
              $filter: {
                input: '$history',
                as: 'item',
                cond: { $eq: ['$$item.status', TICKET_STATUS.COMPLETED] },
              },
            },
          },
        },
        {
          $addFields: {
            completionAt: { $ifNull: [{ $max: '$completedEvents.updatedAt' }, '$updatedAt'] },
          },
        },
        {
          $project: {
            durationMs: { $max: [0, { $subtract: ['$completionAt', '$createdAt'] }] },
          },
        },
        {
          $group: {
            _id: null,
            completed: { $sum: 1 },
            averageDurationMs: { $avg: '$durationMs' },
          },
        },
      ]),
    ]);

    const totals = statusSummary[0] || { total: 0, completed: 0, inProgress: 0 };
    const completion = completionSummary[0] || { completed: 0, averageDurationMs: 0 };
    const safeTotal = totals.total || 0;
    const safeInProgress = totals.inProgress || 0;

    const departments = departmentStats.map((item) => ({
      department: item._id || 'ไม่ระบุหน่วยงาน',
      total: item.total,
      completed: item.completed,
      inProgress: item.inProgress,
      totalPercent: safeTotal ? Number(((item.total / safeTotal) * 100).toFixed(2)) : 0,
      inProgressPercent: safeInProgress ? Number(((item.inProgress / safeInProgress) * 100).toFixed(2)) : 0,
    }));

    res.json({
      fiscalYear,
      fiscalYearBE: fiscalYear + 543,
      fiscalPeriod: {
        start: formatLocalDate(fiscalStart),
        end: formatLocalDate(fiscalEnd),
        label: `${formatThaiDateShort(fiscalStart)} - ${formatThaiDateShort(fiscalEnd)}`,
      },
      generatedAt: new Date().toISOString(),
      totals: {
        total: safeTotal,
        completed: totals.completed || 0,
        inProgress: safeInProgress,
        averageCompletionMs: Math.round(completion.averageDurationMs || 0),
      },
      departments,
    });
  } catch (err) {
    console.error('GET /api/public/fiscal-summary error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสาธารณะ' });
  }
});

module.exports = router;