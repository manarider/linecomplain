/**
 * quotaRoutes.js
 * ─────────────────────────────────────────────────────────────
 * Routes สำหรับ LINE Quota Dashboard — อ่านได้สำหรับ visiter, แก้ไขเฉพาะ superadmin
 */

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { checkLineQuota, getLatestQuota, UsageStat } = require('../utils/lineQuota');
const Ticket = require('../models/Ticket');
const LineGroup = require('../models/LineGroup');
const Counter = require('../models/Counter');

const router = express.Router();

// ทุก route ต้อง login และอย่างน้อยเป็นผู้ใช้งานที่อ่านได้
router.use(requireAuth, requireRole('superadmin', 'visiter'));

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
router.post('/refresh', requireRole('superadmin'), async (req, res) => {
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

    // 2) แจ้งเตือนกลุ่ม admin เรื่องใหม่: tickets ที่สร้างในเดือนนี้ (pushAdminNewTicketAlert)
    // คำนวนโดยคูณด้วยจำนวนสมาชิกในกลุ่ม admin (ถ้ามี)
    const adminGroupId = process.env.LINE_ADMIN_ID;
    let adminNewTickets = 0;
    if (adminGroupId && adminGroupId.startsWith('C')) {
      const ticketCount = await Ticket.countDocuments({ createdAt: { $gte: monthStart } });
      const adminGroup = await LineGroup.findOne({ groupId: adminGroupId }).lean();
      const adminMemberCount = adminGroup?.memberCount || 1;
      adminNewTickets = ticketCount * adminMemberCount;
    }

    // 3) แจ้งอัปเดตสถานะ: นับ history entries ของเดือนนี้ สำหรับ tickets ที่มี lineUserId
    const statusUpdateResult = await Ticket.aggregate([
      { $match: { lineUserId: { $exists: true, $ne: null } } },
      { $unwind: '$history' },
      { $match: { 'history.updatedAt': { $gte: monthStart } } },
      { $count: 'total' },
    ]);
    const statusUpdate = statusUpdateResult[0]?.total ?? 0;

    // ตัวแปรที่ใช้ร่วมกัน
    const daysPassed = now.getDate(); // วันที่ปัจจุบัน = จำนวนวันที่ผ่านมา (รวมวันนี้)

    // นับจำนวนวันจันทร์-ศุกร์ที่ผ่านในเดือนนี้ (cron admin batch รันเฉพาะวันทำการ)
    let weekdaysPassed = 0;
    for (let d = 1; d <= daysPassed; d++) {
      const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
      if (dow >= 1 && dow <= 5) weekdaysPassed++;
    }

    // 4) แจ้งกลุ่ม admin แบบรวมยอด (pushAdminBatchAlert)
    // Cron 2 ครั้ง/วัน (07:45 & 16:30) จันทร์-ศุกร์ × วันทำการที่ผ่าน × memberCount
    let adminBatchAlert = 0;
    if (adminGroupId && adminGroupId.startsWith('C')) {
      const adminGroup = await LineGroup.findOne({ groupId: adminGroupId }).lean();
      const adminMemberCount = adminGroup?.memberCount || 1;
      adminBatchAlert = 2 * weekdaysPassed * adminMemberCount;
    }

    // 5) สรุปประจำสัปดาห์ (pushGroupWeeklySummary)
    // Cron ทุกวันศุกร์ 17:00 × จำนวนศุกร์ที่ผ่าน × ผลรวม memberCount
    const totalMembersResult = await LineGroup.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, totalMembers: { $sum: '$memberCount' } } }
    ]);
    const totalMembersInActiveGroups = totalMembersResult[0]?.totalMembers ?? 0;
    const activeGroups = await LineGroup.countDocuments({ isActive: true });

    // นับจำนวนวันศุกร์ที่ผ่านในเดือนนี้
    let fridayCount = 0;
    for (let d = 1; d <= daysPassed; d++) {
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      if (date.getDay() === 5) fridayCount++; // 5 = ศุกร์
    }
    const weeklySummary = fridayCount * totalMembersInActiveGroups;

    // 6) คำสั่ง "ตามเรื่อง" ในกลุ่ม (push ไปส่วนตัว)
    // นับจาก Counter collection โดยใช้ key 'tracking_YYMM'
    const yymm = String(now.getFullYear()).slice(-2) + String(now.getMonth() + 1).padStart(2, '0');
    const trackingKey = `tracking_${yymm}`;
    const trackingCounter = await Counter.findOne({ _id: trackingKey }).lean();
    const trackingRequests = trackingCounter?.seq ?? 0;

    const total = confirmUser + adminNewTickets + statusUpdate + adminBatchAlert + weeklySummary + trackingRequests;

    res.json({
      confirmUser,
      adminNewTickets,
      statusUpdate,
      adminBatchAlert,
      weeklySummary,
      trackingRequests,
      activeGroups,
      totalMembersInActiveGroups,
      fridayCount,
      total,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      note: 'คำนวนจาก push ทั้งหมดในระบบ (รวม "ตามเรื่อง" จริง)',
      warnings: [],
    });
  } catch (err) {
    console.error('GET /api/quota/push-stats error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงสถิติข้อความ' });
  }
});

module.exports = router;
