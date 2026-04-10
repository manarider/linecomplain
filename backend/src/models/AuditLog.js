const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    // ── ผู้กระทำ ─────────────────────────────────────────
    actorId:       { type: String, default: 'system' }, // userId หรือ 'system'
    actorName:     { type: String, default: 'system' }, // ชื่อ-นามสกุล หรือ 'system'
    actorRole:     { type: String, default: '' },       // superadmin / admin / staff / liff

    // ── การกระทำ ─────────────────────────────────────────
    action:        { type: String, required: true },    // เช่น CREATE_TICKET, UPDATE_STATUS
    category:      { type: String, required: true },    // ticket | auth | line_group | user | system

    // ── เป้าหมาย ──────────────────────────────────────────
    targetId:      { type: String, default: '' },       // ticketNo, userId, groupId ที่ถูกกระทำ
    targetLabel:   { type: String, default: '' },       // ชื่อหรือรายละเอียดสั้นๆ

    // ── รายละเอียด ────────────────────────────────────────
    detail:        { type: String, default: '' },       // ข้อความอธิบาย human-readable
    meta:          { type: mongoose.Schema.Types.Mixed, default: {} }, // ข้อมูลเพิ่มเติม JSON

    // ── Network ───────────────────────────────────────────
    ip:            { type: String, default: '' },
    userAgent:     { type: String, default: '' },

    // ── ผลลัพธ์ ───────────────────────────────────────────
    success:       { type: Boolean, default: true },
    errorMessage:  { type: String, default: '' },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ── TTL Index: ลบ log ที่มีอายุมากกว่า 120 วันอัตโนมัติ ──
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 120 * 24 * 60 * 60 } // 120 วัน
);

// ── Indexes สำหรับค้นหา ───────────────────────────────────
auditLogSchema.index({ actorId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ category: 1 });
auditLogSchema.index({ targetId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
