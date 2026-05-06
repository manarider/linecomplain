/**
 * quotaRoutes.js
 * ─────────────────────────────────────────────────────────────
 * Routes สำหรับ LINE Quota Dashboard — เฉพาะ superadmin
 */

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { checkLineQuota, getLatestQuota, UsageStat } = require('../utils/lineQuota');
const Ticket = require('../models/Ticket');
const LineGroup = require('../models/LineGroup');

const router = express.Router();

// ทุก route ต้อง login และเป็น superadmin
router.use(requireAuth, requireRole('superadmin'));

// ============================================================
// GET /api/quota/current
// ดึงข้อมูลโควตาล่าสุดจาก MongoDB (ไม่เรียก LINE API)
// ใช้สำหรับแสดงผล Progress Bar
// ============================================================
router.get('/current', async (req, res) => {
  try {
    const data = await getLatestQuota();
    res.json(data);
  } catch (err) {
    console.error('GET /api/quota/current error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลโควตา' });
  }
});

// ============================================================
// POST /api/quota/refresh
// ดึงโควตาสดจาก LINE API แล้วบันทึก + คืนค่ากลับ
// ============================================================
router.post('/refresh', async (req, res) => {
  try {
    const data = await checkLineQuota();
    res.json(data);
  } catch (err) {
    console.error('POST /api/quota/refresh error:', err.message);
    res.status(500).json({ message: 'ไม่สามารถเชื่อมต่อ LINE API ได้' });
  }
});

// ============================================================
// GET /api/quota/history
// ดึงประวัติย้อนหลัง 12 เดือน เรียงจากใหม่ → เก่า
// ============================================================
router.get('/history', async (req, res) => {
  try {
    const docs = await UsageStat.find({})
      .sort({ month: -1 })
      .limit(12)
      .lean();
    res.json(docs);
  } catch (err) {
    console.error('GET /api/quota/history error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงประวัติโควตา' });
  }
});

// ============================================================
// GET /api/quota/push-stats
// นับจำนวนข้อความ Push (มีค่าใช้จ่าย) ที่ระบบส่งในเดือนนี้
// แยกตามประเภท: ยืนยันรับเรื่อง, แจ้งอัปเดตสถานะ, สรุปประจำวัน
// ============================================================
router.get('/push-stats', async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1) ยืนยันรับเรื่อง (ส่วนตัว): tickets ที่สร้างในเดือนนี้และมี lineUserId
    const confirmUser = await Ticket.countDocuments({
      lineUserId: { $exists: true, $ne: null },
      createdAt: { $gte: monthStart },
    });

    // 2) ยืนยันรับเรื่อง (กลุ่ม): tickets ที่สร้างในเดือนนี้และมี groupId
    const confirmGroup = await Ticket.countDocuments({
      groupId: { $exists: true, $nin: [null, ''] },
      createdAt: { $gte: monthStart },
    });

    // 3) แจ้งอัปเดตสถานะ: นับ history entries ของเดือนนี้ สำหรับ tickets ที่มี lineUserId
    const statusUpdateResult = await Ticket.aggregate([
      { $match: { lineUserId: { $exists: true, $ne: null } } },
      { $unwind: '$history' },
      { $match: { 'history.updatedAt': { $gte: monthStart } } },
      { $count: 'total' },
    ]);
    const statusUpdate = statusUpdateResult[0]?.total ?? 0;

    // 4) สรุปประจำวัน (EOD): นับจาก active groups × จำนวนวันที่ผ่านในเดือน
    const activeGroups = await LineGroup.countDocuments({ isActive: true });
    const daysPassed = now.getDate(); // วันที่ปัจจุบัน = จำนวนวันที่ผ่านมา (รวมวันนี้)
    const eodSummary = activeGroups * daysPassed;

    res.json({
      confirmUser,
      confirmGroup,
      statusUpdate,
      eodSummary,
      activeGroups,
      total: confirmUser + confirmGroup + statusUpdate + eodSummary,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      note: 'eodSummary เป็นค่าประมาณ (groups × วัน)',
    });
  } catch (err) {
    console.error('GET /api/quota/push-stats error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงสถิติข้อความ' });
  }
});

module.exports = router;
