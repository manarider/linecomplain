const express = require('express');
const { messagingApi } = require('@line/bot-sdk');
const LineGroup = require('../models/LineGroup');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

// ทุก route ต้อง login และเป็น admin ขึ้นไป
router.use(requireAuth);
router.use(requireRole('superadmin', 'admin'));

// ============================================================
// GET /api/line-groups
// รายการกลุ่มทั้งหมด
// ============================================================
router.get('/', async (req, res) => {
  try {
    const groups = await LineGroup.find().sort({ addedAt: -1 });
    res.json(groups);
  } catch (err) {
    console.error('GET /api/line-groups error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// PATCH /api/line-groups/:id/toggle
// เปิด/ปิดการใช้งานกลุ่ม
// ============================================================
router.patch('/:id/toggle', async (req, res) => {
  try {
    const group = await LineGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'ไม่พบกลุ่มนี้' });

    group.isActive = !group.isActive;
    await group.save();

    res.json({ message: `${group.isActive ? 'เปิด' : 'ปิด'}การใช้งานกลุ่มแล้ว`, group });
  } catch (err) {
    console.error('PATCH /api/line-groups/:id/toggle error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// PATCH /api/line-groups/:id/name
// แก้ไขชื่อกลุ่ม (กรณีดึงชื่อไม่ได้อัตโนมัติ)
// ============================================================
router.patch('/:id/name', async (req, res) => {
  try {
    const { groupName } = req.body;
    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ message: 'กรุณาระบุชื่อกลุ่ม' });
    }
    const group = await LineGroup.findByIdAndUpdate(
      req.params.id,
      { groupName: groupName.trim() },
      { new: true }
    );
    if (!group) return res.status(404).json({ message: 'ไม่พบกลุ่มนี้' });
    res.json({ message: 'แก้ไขชื่อกลุ่มแล้ว', group });
  } catch (err) {
    console.error('PATCH /api/line-groups/:id/name error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// POST /api/line-groups/sync-name/:id
// ดึงชื่อกลุ่มล่าสุดจาก LINE API
// ============================================================
router.post('/sync-name/:id', async (req, res) => {
  try {
    const group = await LineGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'ไม่พบกลุ่มนี้' });

    const summary = await lineClient.getGroupSummary(group.groupId);
    group.groupName = summary.groupName || group.groupName;
    await group.save();

    res.json({ message: 'ซิงค์ชื่อกลุ่มสำเร็จ', group });
  } catch (err) {
    console.error('POST /api/line-groups/sync-name error:', err.message);
    res.status(500).json({ message: 'ดึงชื่อกลุ่มไม่ได้: ' + err.message });
  }
});

// ============================================================
// DELETE /api/line-groups/:id
// ลบกลุ่มออกจากระบบ
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    await LineGroup.findByIdAndDelete(req.params.id);
    res.json({ message: 'ลบกลุ่มออกจากระบบแล้ว' });
  } catch (err) {
    console.error('DELETE /api/line-groups/:id error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;
