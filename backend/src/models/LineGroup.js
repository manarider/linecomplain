const mongoose = require('mongoose');

// ============================================================
// LineGroup — เก็บข้อมูลกลุ่ม LINE ที่บอทถูก add เข้ามา
// ============================================================
const lineGroupSchema = new mongoose.Schema(
  {
    groupId:   { type: String, required: true, unique: true, index: true },
    groupName: { type: String, default: 'ไม่ทราบชื่อกลุ่ม' },
    isActive:  { type: Boolean, default: true },  // เปิด/ปิด cron notify
    addedAt:   { type: Date, default: Date.now }, // วันที่ add บอทเข้ากลุ่ม
    leftAt:    { type: Date, default: null },      // วันที่บอทถูก kick/ออก
  },
  { timestamps: true }
);

module.exports = mongoose.model('LineGroup', lineGroupSchema);
