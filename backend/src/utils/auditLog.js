// ── Audit Log Helper ──────────────────────────────────────
// ใช้เรียกจาก routes เพื่อบันทึก log โดยไม่ block response
const AuditLog = require('../models/AuditLog');

/**
 * บันทึก audit log แบบ fire-and-forget (ไม่ await ไม่ block)
 *
 * @param {object} data
 * @param {string}  data.actorId     - userId หรือ lineUserId หรือ 'system'
 * @param {string}  data.actorName   - ชื่อผู้กระทำ
 * @param {string}  data.actorRole   - role: superadmin|admin|staff|liff|system
 * @param {string}  data.action      - รหัสการกระทำ เช่น CREATE_TICKET
 * @param {string}  data.category    - ticket|auth|line_group|user|system
 * @param {string}  [data.targetId]  - id/ticketNo ของเป้าหมาย
 * @param {string}  [data.targetLabel]
 * @param {string}  [data.detail]    - ข้อความอธิบาย
 * @param {object}  [data.meta]      - JSON เพิ่มเติม
 * @param {string}  [data.ip]
 * @param {string}  [data.userAgent]
 * @param {boolean} [data.success]
 * @param {string}  [data.errorMessage]
 */
function logAction(data) {
  AuditLog.create(data).catch((err) => {
    // log error ไปยัง stderr เท่านั้น ไม่ throw
    console.error('[AuditLog] บันทึก log ไม่สำเร็จ:', err.message);
  });
}

/**
 * ดึง IP จาก request (รองรับ reverse proxy)
 */
function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    ''
  );
}

/**
 * สร้าง actor object จาก req.user (dashboard login)
 */
function actorFromUser(req) {
  if (!req.user) return { actorId: 'anonymous', actorName: 'anonymous', actorRole: '' };
  return {
    actorId:   req.user.userId || req.user.id || req.user._id || 'unknown',
    actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.username || 'unknown',
    actorRole: req.user.role || '',
    ip:        getIp(req),
    userAgent: req.headers['user-agent'] || '',
  };
}

/**
 * สร้าง actor object สำหรับผู้ใช้ LIFF (LINE)
 */
function actorFromLiff(lineUserId, displayName) {
  return {
    actorId:   lineUserId || 'unknown',
    actorName: displayName || 'ผู้ใช้ LINE',
    actorRole: 'liff',
  };
}

module.exports = { logAction, getIp, actorFromUser, actorFromLiff };
