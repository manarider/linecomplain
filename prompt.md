# CAPP — Context Prompt สำหรับ AI Assistant
> อัปเดตล่าสุด: 8 พฤษภาคม 2569

---

## บริบทโปรเจกต์

ฉันกำลังพัฒนาและดูแลระบบ **CAPP (Complaint Application)** ระบบรับเรื่องร้องทุกข์ออนไลน์ของ **เทศบาลนครนครสวรรค์** ที่ https://complain.nsm.go.th

**ระบบพัฒนาสมบูรณ์แล้ว** และอยู่ในสภาพ production ใช้งานจริง การสนทนานี้เป็นการบำรุงรักษาและต่อเติมฟีเจอร์ใหม่

---

## Tech Stack

| ชั้น | เทคโนโลยี |
|------|-----------|
| Backend | Node.js 22, Express 5, Mongoose 8 |
| Database | MongoDB 7 |
| Frontend | React 19, Vite 8 (SPA, build แล้ว serve จาก backend) |
| Auth | JWT httpOnly cookie (8h), UMS SSO |
| LINE | @line/bot-sdk v11, LIFF SDK 2 |
| Process | PM2, Nginx (reverse proxy), Cloudflare SSL |
| Security | Helmet.js CSP, CORS whitelist, Multer validation, Rate limiting |
| Image | heic2any.js (client), heic-convert + sharp (server) |

---

## โครงสร้างโปรเจกต์

```
/home/complain/app/
├── backend/
│   ├── server.js               # Express app + Helmet CSP + CORS + Cron + PM2
│   ├── public/liff/index.html  # หน้าฟอร์มแจ้งเรื่อง (LIFF in-app browser)
│   ├── uploads/                # รูปภาพที่อัปโหลด (serve ผ่าน /uploads)
│   └── src/
│       ├── config/
│       │   ├── constants.js    # DEPARTMENTS (11 หน่วยงาน), TICKET_STATUS, ROLES, SYSTEM_SETTINGS
│       │   └── db.js
│       ├── middleware/
│       │   └── authMiddleware.js   # requireAuth, requireRole
│       ├── models/
│       │   ├── Counter.js          # auto-increment ticketNo (atomic)
│       │   ├── Ticket.js           # เรื่องร้องทุกข์ (ดู Data Model ด้านล่าง)
│       │   ├── LineGroup.js        # กลุ่ม LINE ที่บอทอยู่
│       │   └── AuditLog.js         # TTL 120 วัน
│       ├── routes/
│       │   ├── authRoutes.js       # /auth/login, /auth/callback, /auth/me, /auth/logout
│       │   ├── ticketRoutes.js     # /api/tickets (LIFF/public)
│       │   ├── dashboardRoutes.js  # /api/dashboard (requireAuth)
│       │   ├── lineGroupRoutes.js  # /api/line-groups (admin+)
│       │   ├── auditRoutes.js      # /api/audit (superadmin)
│       │   ├── backupRoutes.js     # /api/backup (superadmin)
│       │   ├── quotaRoutes.js      # /api/quota (superadmin)
│       │   ├── statisticsRoutes.js # /api/statistics (admin+)
│       │   ├── publicRoutes.js     # /api/public (ไม่ต้อง auth)
│       │   └── lineWebhook.js      # /webhook (LINE signature validation)
│       └── utils/
│           ├── lineNotify.js   # push/reply LINE messages, Flex Messages
│           ├── lineQuota.js    # ตรวจ/บันทึกโควตา LINE API
│           ├── auditLog.js     # logAction() fire-and-forget
│           └── ums.js          # fetchUserInfo, extractProjectPermission
└── frontend/
    └── src/
        ├── App.jsx             # Routes: /login, /dashboard, /embed/fiscal-summary
        ├── api.js              # fetch wrapper ทุก API call
        ├── constants.js        # ต้องตรงกับ backend constants.js เสมอ
        ├── components/
        │   └── TicketModal.jsx # modal ดูรายละเอียด + Lightbox 3 กลุ่มรูป
        └── pages/
            ├── LoginPage.jsx
            ├── DashboardPage.jsx           # รวม PublicFiscalManagePage (superadmin)
            ├── StatisticsPage.jsx          # กราฟ + Excel export
            ├── LineGroupsPage.jsx
            ├── ComplainantsPage.jsx
            ├── QuotaPage.jsx
            ├── AuditLogPage.jsx
            ├── BackupPage.jsx
            ├── LineUsersPage.jsx
            └── PublicFiscalSummaryPage.jsx # /embed/fiscal-summary (สาธารณะ)
```

---

## Data Model: Ticket

```js
{
  ticketNo:           String,   // "RPT-YYMM-XXXX" auto-generate ผ่าน Counter (atomic)
  lineUserId:         String,
  displayName:        String,
  subject:            String,
  description:        String,
  assignedDepartment: String,   // auto-assign ถ้า "ไม่แน่ใจ" เมื่อรับเรื่อง
  status:             String,   // รอรับเรื่อง | ระหว่างดำเนินการ | ส่งต่อ | เสร็จสิ้น | ไม่รับเรื่อง
  images:             [String], // รูปภาพประกอบคำร้อง (path ใน /uploads)
  completionImages:   [String], // รูปภาพผลการดำเนินงาน (≤3 รูป)
  phone:              String,
  location:           { lat: Number, lng: Number },
  groupId:            String,   // กลุ่ม LINE ที่แจ้งเรื่อง (ถ้ามี)

  additionalInfoRequest: {      // เมื่อเจ้าหน้าที่ขอข้อมูลเพิ่มเติม
    note:        String,
    token:       String,        // UUID สำหรับ LIFF link
    requestedAt: Date,
  },
  additionalInfo: {             // เมื่อผู้ร้องส่งข้อมูลกลับมา
    text:         String,
    images:       [String],
    submittedAt:  Date,
  },
  isAdditionalInfoNew: Boolean, // true = กระพริบสีม่วงในรายการ

  history: [{
    status:      String,
    note:        String,
    updatedBy:   String,
    updatedAt:   Date,
    forwardedTo: String,
    forwardedBy: String,
  }],

  createdAt: Date,
  updatedAt: Date,
}
```

---

## Roles & สิทธิ์

| Role | Ticket | สถิติ | สถิติผู้ร้อง | LINE Groups | Audit | Quota | Backup | หน้าสถิติสาธารณะ |
|------|--------|-------|-------------|-------------|-------|-------|--------|-----------------|
| `staff` | จำกัด* | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `executive` | จำกัด* | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `admin` | ทั้งหมด | ✅ | ✅ | ดู+แก้ชื่อ | ❌ | ❌ | ❌ | ❌ |
| `superadmin` | ทั้งหมด | ✅ | ✅ | ✅ full | ✅ | ✅ | ✅ | ✅ |

> **จำกัด*** = tab "ระหว่างดำเนินการ" และ "ส่งต่อ" เห็นเฉพาะหน่วยงานตัวเอง, tab อื่นเห็นทุกหน่วยงาน

---

## Environment Variables (.env)

```env
PORT=5050
DOMAIN=https://complain.nsm.go.th
NODE_ENV=production
MONGODB_URI=mongodb://user:pass@host:27017/complain
JWT_SECRET=...
LINE_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
LIFF_ID=...
LINE_ADMIN_ID=...      # groupId กลุ่ม LINE admin สำหรับแจ้งเตือนคำร้องใหม่
UMS_LOGIN_URL=https://nssv.nsm.go.th/ums/
UMS_API_URL=https://nssv.nsm.go.th/ums/api/auth/me
UMS_PROJECT_KEY=...
LINE_GROUP_ID=...      # legacy
```

---

## การ Deploy

```bash
# Build frontend แล้ว restart backend (workflow ปกติ)
cd /home/complain/app/frontend && npm run build
pm2 restart complain-backend
```

---

## ฟีเจอร์ที่พัฒนาแล้วครบถ้วน

1. **LINE Bot + LIFF** — แจ้งเรื่อง, ตามเรื่อง, ตรวจสถานะ, join/leave group
2. **UMS SSO** — Login → UMS → JWT cookie (8h) → role mapping
3. **Dashboard** — RBAC, Stat Cards, search, pagination, print
4. **TicketModal** — Lightbox 3 กลุ่มรูป (prev/next/keyboard), history timeline
5. **Status workflow** — รอรับเรื่อง → ดำเนินการ → เสร็จสิ้น/ส่งต่อ/ไม่รับ
6. **Additional Info loop** — ขอข้อมูลเพิ่มเติม → LIFF token → กระพริบสีม่วง
7. **Auto-assign department** — เมื่อหน่วยงาน "ไม่แน่ใจ" รับเรื่องแล้วเปลี่ยนอัตโนมัติ
8. **LINE Group Management** — จัดการหลายกลุ่ม, เปิด/ปิด, sync ชื่อ
9. **Cron 17:00** — สรุปยอดประจำวันทุกกลุ่ม active
10. **Audit Log** — TTL 120 วัน, ค้นหา/กรอง, superadmin เท่านั้น
11. **Backup** — export JSON ทุก collection, บันทึก audit log
12. **LINE Quota** — ตรวจโควตา, แจ้งเตือนเมื่อใกล้หมด (กระพริบใน sidebar)
13. **Statistics** — กราฟแท่งรายเดือน, ตารางตามหน่วยงาน, Export Excel
14. **Public Fiscal Summary** — `/embed/fiscal-summary` สาธารณะ, iframe embed, layout auto
15. **Security** — Helmet CSP, CORS, rate limit, multer validate, regex escape

---

## หมายเหตุสำคัญสำหรับ AI

- Frontend ไม่มี dev server — ต้อง `npm run build` ทุกครั้งที่แก้ไข แล้ว restart `pm2`
- `frontend/src/constants.js` ต้องตรงกับ `backend/src/config/constants.js` เสมอ
- รูปภาพ HEIC แปลง 2 ทาง: client-side (heic2any.js ใน LIFF) และ server-side (heic-convert + sharp)
- CSP `frame-src` รวม `'self'` เพื่อให้ iframe preview ใน dashboard ทำงานได้
- Cron jobs อยู่ใน `backend/server.js` ด้านล่างสุด
- ดูรายละเอียด flow ทั้งหมดได้ที่ `flow.md`
- ดูประวัติการพัฒนาได้ที่ `progress.md`