/**
 * quotaRoutes.js
 * ─────────────────────────────────────────────────────────────
 * Routes สำหรับ LINE Quota Dashboard — เฉพาะ superadmin
 */

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { checkLineQuota, getLatestQuota, UsageStat } = require('../utils/lineQuota');

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

module.exports = router;
