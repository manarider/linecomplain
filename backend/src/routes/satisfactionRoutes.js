const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// ทุก route ต้อง login + superadmin/admin หรือ visiter (อ่านอย่างเดียว)
router.use(requireAuth, requireRole('superadmin', 'admin', 'visiter'));

// ============================================================
// GET /api/satisfaction/summary
// ดึงข้อมูลสรุปคะแนนความพึงพอใจ
// Query:
//   fiscalYear  — ปีงบประมาณ (พ.ศ.) เช่น 2568
//   year        — ปี ค.ศ. เช่น 2026
//   month       — เดือน 1-12 (ใช้ร่วมกับ year)
//   department  — ชื่อหน่วยงาน
// ============================================================
router.get('/summary', async (req, res) => {
  try {
    const { fiscalYear, year, month, department } = req.query;

    // ── Base filter: มีการให้คะแนนแล้ว ──
    const match = { satisfactionScore: { $ne: null }, satisfactionReplied: true };

    // ── Filter ช่วงเวลา ──
    if (fiscalYear) {
      // ปีงบประมาณไทย: 1 ต.ค. ปีก่อน — 30 ก.ย. ปีปัจจุบัน
      // fiscalYear เป็น พ.ศ. → แปลงเป็น ค.ศ. = พ.ศ. - 543
      const fy = parseInt(fiscalYear, 10);
      const gregYear = fy - 543;
      const start = new Date(gregYear - 1, 9, 1, 0, 0, 0);    // 1 ต.ค. ปีก่อน
      const end   = new Date(gregYear, 8, 30, 23, 59, 59, 999); // 30 ก.ย. ปีนี้
      match.satisfactionAt = { $gte: start, $lte: end };
    } else if (year && month) {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10) - 1; // 0-indexed
      const start = new Date(y, m, 1, 0, 0, 0);
      const end   = new Date(y, m + 1, 0, 23, 59, 59, 999);
      match.satisfactionAt = { $gte: start, $lte: end };
    } else if (year) {
      const y = parseInt(year, 10);
      const start = new Date(y, 0, 1, 0, 0, 0);
      const end   = new Date(y, 11, 31, 23, 59, 59, 999);
      match.satisfactionAt = { $gte: start, $lte: end };
    }

    if (department) {
      match.assignedDepartment = department;
    }

    // ── Aggregation รวม ──
    const [overviewResult, byDeptResult] = await Promise.all([
      Ticket.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalRated: { $sum: 1 },
            avgScore:   { $avg: '$satisfactionScore' },
            score1: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 1] }, 1, 0] } },
            score2: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 2] }, 1, 0] } },
            score3: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 3] }, 1, 0] } },
            score4: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 4] }, 1, 0] } },
            score5: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 5] }, 1, 0] } },
          },
        },
      ]),
      Ticket.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$assignedDepartment',
            totalRated: { $sum: 1 },
            avgScore:   { $avg: '$satisfactionScore' },
            score1: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 1] }, 1, 0] } },
            score2: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 2] }, 1, 0] } },
            score3: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 3] }, 1, 0] } },
            score4: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 4] }, 1, 0] } },
            score5: { $sum: { $cond: [{ $eq: ['$satisfactionScore', 5] }, 1, 0] } },
          },
        },
        { $sort: { avgScore: -1 } },
      ]),
    ]);

    const ov = overviewResult[0] || { totalRated: 0, avgScore: 0, score1: 0, score2: 0, score3: 0, score4: 0, score5: 0 };

    res.json({
      overview: {
        totalRated: ov.totalRated,
        avgScore:   ov.avgScore ? parseFloat(ov.avgScore.toFixed(2)) : 0,
        distribution: {
          1: ov.score1,
          2: ov.score2,
          3: ov.score3,
          4: ov.score4,
          5: ov.score5,
        },
      },
      byDepartment: byDeptResult.map(d => ({
        department: d._id || '-',
        totalRated: d.totalRated,
        avgScore:   d.avgScore ? parseFloat(d.avgScore.toFixed(2)) : 0,
        distribution: {
          1: d.score1,
          2: d.score2,
          3: d.score3,
          4: d.score4,
          5: d.score5,
        },
      })),
    });
  } catch (err) {
    console.error('[Satisfaction] Error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;
