const express = require('express');
const { messagingApi } = require('@line/bot-sdk');
const LineGroup = require('../models/LineGroup');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const requireSuperadmin = requireRole('superadmin');

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
router.patch('/:id/toggle', requireSuperadmin, async (req, res) => {
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
// PATCH /api/line-groups/:id/member-count
// แก้ไขจำนวนสมาชิกแบบ manual (เนื่องจาก LINE API ไม่ให้ข้อมูล)
// ============================================================
router.patch('/:id/member-count', async (req, res) => {
  try {
    const { memberCount } = req.body;
    const count = parseInt(memberCount, 10);

    if (isNaN(count) || count < 0) {
      return res.status(400).json({ message: 'กรุณาระบุจำนวนสมาชิกที่ถูกต้อง (ตัวเลข ≥ 0)' });
    }

    const group = await LineGroup.findByIdAndUpdate(
      req.params.id,
      { memberCount: count },
      { new: true }
    );

    if (!group) return res.status(404).json({ message: 'ไม่พบกลุ่มนี้' });
    res.json({ message: `ตั้งค่าจำนวนสมาชิกเป็น ${count} คนแล้ว`, group });
  } catch (err) {
    console.error('PATCH /api/line-groups/:id/member-count error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

// ============================================================
// POST /api/line-groups/sync-name/:id
// ดึงชื่อกลุ่มและจำนวนสมาชิกล่าสุดจาก LINE API
// ============================================================
router.post('/sync-name/:id', requireSuperadmin, async (req, res) => {
  try {
    const group = await LineGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'ไม่พบกลุ่มนี้' });

    const summary = await lineClient.getGroupSummary(group.groupId);
    group.groupName = summary.groupName || group.groupName;

    // ดึงจำนวนสมาชิกจาก endpoint โดยตรง
    const axios = require('axios');
    const countResponse = await axios.get(
      `https://api.line.me/v2/bot/group/${group.groupId}/members/count`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
        }
      }
    );
    group.memberCount = countResponse.data.count || 0;
    await group.save();

    res.json({ message: 'ซิงค์ชื่อกลุ่มและจำนวนสมาชิกสำเร็จ', group });
  } catch (err) {
    console.error('POST /api/line-groups/sync-name error:', err.message);
    res.status(500).json({ message: 'ดึงข้อมูลไม่ได้: ' + err.message });
  }
});

// ============================================================
// POST /api/line-groups/sync-all-members
// ดึงจำนวนสมาชิกทั้งหมดจาก LINE API
// ============================================================
router.post('/sync-all-members', requireSuperadmin, async (req, res) => {
  try {
    const axios = require('axios');
    const groups = await LineGroup.find(); // ดึงทุกกลุ่ม รวม inactive
    if (!groups.length) {
      return res.json({ message: 'ไม่มีกลุ่มในระบบ', updated: 0 });
    }

    let updated = 0;
    let failed = 0;
    const results = [];

    for (const group of groups) {
      try {
        const summary = await lineClient.getGroupSummary(group.groupId);
        const groupName = summary.groupName || group.groupName;

        // ดึงจำนวนสมาชิกจาก endpoint โดยตรง
        const countResponse = await axios.get(
          `https://api.line.me/v2/bot/group/${group.groupId}/members/count`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
            }
          }
        );
        const memberCount = countResponse.data.count || 0;

        await LineGroup.findByIdAndUpdate(group._id, {
          memberCount,
          groupName,
        });

        updated++;
        results.push({
          groupId: group.groupId,
          groupName,
          memberCount,
          status: 'success'
        });
      } catch (err) {
        failed++;
        results.push({
          groupId: group.groupId,
          groupName: group.groupName,
          error: err.message,
          status: 'failed'
        });
      }
    }

    res.json({
      message: `ซิงค์สำเร็จ ${updated}/${groups.length} กลุ่ม`,
      updated,
      failed,
      total: groups.length,
      results,
    });
  } catch (err) {
    console.error('POST /api/line-groups/sync-all-members error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด: ' + err.message });
  }
});

// ============================================================
// DELETE /api/line-groups/:id
// ลบกลุ่มออกจากระบบ
// ============================================================
router.delete('/:id', requireSuperadmin, async (req, res) => {
  try {
    await LineGroup.findByIdAndDelete(req.params.id);
    res.json({ message: 'ลบกลุ่มออกจากระบบแล้ว' });
  } catch (err) {
    console.error('DELETE /api/line-groups/:id error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;
