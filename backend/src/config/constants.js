// ============================================================
// รายชื่อหน่วยงาน (ใช้เป็น enum ใน Ticket model และ UMS subDepartment)
// ============================================================
const DEPARTMENTS = [
  'สำนักปลัดเทศบาล',
  'สำนักการศึกษา',
  'สำนักคลัง',
  'สำนักสาธารณสุขและสิ่งแวดล้อม',
  'สำนักช่าง',
  'สำนักการประปา',
  'กองยุทธศาสตร์และงบประมาณ',
  'กองสวัสดิการสังคม',
  'กองสารสนเทศภาษีและทะเบียนทรัพย์สิน',
  'กองการเจ้าหน้าที่',
  'หน่วยตรวจสอบภายใน',
  'ไม่แน่ใจ',
];

// ============================================================
// การตั้งค่าระบบ
// ============================================================
const SYSTEM_SETTINGS = {
  MAX_IMAGE_SIZE: 512000,        // 500KB (bytes) per file
  TIMEZONE: 'Asia/Bangkok',
  DATE_FORMAT: 'dd/MM/yyyy',
  CURRENCY: 'THB',
};

// ============================================================
// สถานะของ Ticket
// ============================================================
const TICKET_STATUS = {
  PENDING: 'รอรับเรื่อง',
  IN_PROGRESS: 'ระหว่างดำเนินการ',
  COMPLETED: 'เสร็จสิ้น',
  FORWARDED: 'ส่งต่อ',
  REJECTED: 'ไม่รับเรื่อง',
};

// ============================================================
// Role ของเจ้าหน้าที่จาก UMS
// ============================================================
const STAFF_ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN:      'admin',
  EXECUTIVE:  'executive',
  STAFF:      'staff',
  USER:       'user',
};

// Roles ที่เห็นคำร้องได้ทุกหน่วยงาน + ส่งต่อได้
const FULL_ACCESS_ROLES = [
  STAFF_ROLES.SUPERADMIN,
  STAFF_ROLES.ADMIN,
  STAFF_ROLES.EXECUTIVE,
];

module.exports = {
  DEPARTMENTS,
  SYSTEM_SETTINGS,
  TICKET_STATUS,
  STAFF_ROLES,
  FULL_ACCESS_ROLES,
};
