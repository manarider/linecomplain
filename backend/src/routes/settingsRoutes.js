const express = require('express');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const SystemSetting = require('../models/SystemSetting');

const router = express.Router();

// ค่า default และ config ของแต่ละ setting key
const SETTING_DEFS = {
  pollIntervalSeconds: {
    label: 'ช่วงเวลา polling badge (วินาที)',
    default: 60,
    allowed: [30, 60, 120, 300],
  },
};

// ── GET /api/settings ──────────────────────────────────────
// ดึงค่าตั้งค่าทั้งหมด (ทุก role ที่ login แล้ว)
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = {};
    for (const [key, def] of Object.entries(SETTING_DEFS)) {
      result[key] = {
        value:   await SystemSetting.getSetting(key, def.default),
        label:   def.label,
        allowed: def.allowed,
        default: def.default,
      };
    }
    res.json(result);
  } catch (err) {
    console.error('GET /api/settings error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงค่าตั้งค่า' });
  }
});

// ── PUT /api/settings ──────────────────────────────────────
// อัปเดตค่าตั้งค่า (superadmin เท่านั้น)
router.put('/', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    const updates = req.body; // { pollIntervalSeconds: 120 }

    for (const [key, val] of Object.entries(updates)) {
      const def = SETTING_DEFS[key];
      if (!def) {
        return res.status(400).json({ message: `ไม่รู้จัก setting key: ${key}` });
      }
      if (!def.allowed.includes(Number(val))) {
        return res.status(400).json({
          message: `ค่า ${key} ต้องเป็นหนึ่งใน: ${def.allowed.join(', ')}`,
        });
      }
      await SystemSetting.setSetting(key, Number(val));
    }

    res.json({ message: 'บันทึกการตั้งค่าสำเร็จ' });
  } catch (err) {
    console.error('PUT /api/settings error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกค่าตั้งค่า' });
  }
});

module.exports = router;
