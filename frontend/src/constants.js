export const DEPARTMENTS = [
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

export const TICKET_STATUS = {
  PENDING:     'รอรับเรื่อง',
  IN_PROGRESS: 'ระหว่างดำเนินการ',
  COMPLETED:   'เสร็จสิ้น',
  FORWARDED:   'ส่งต่อ',
  REJECTED:    'ไม่รับเรื่อง',
};

export const FULL_ACCESS_ROLES = ['superadmin', 'admin', 'executive'];

export const STATUS_BADGE = {
  'รอรับเรื่อง':       { label: '⏳ รอรับเรื่อง',    cls: 'badge-pending'    },
  'ระหว่างดำเนินการ': { label: '🔧 ดำเนินการ',       cls: 'badge-inprogress' },
  'เสร็จสิ้น':        { label: '✅ เสร็จสิ้น',       cls: 'badge-completed'  },
  'ส่งต่อ':           { label: '📨 ส่งต่อ',          cls: 'badge-forwarded'  },
  'ไม่รับเรื่อง':     { label: '❌ ไม่รับเรื่อง',    cls: 'badge-rejected'   },
};

export function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
