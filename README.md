# CAPP — ระบบรับเรื่องร้องทุกข์ออนไลน์
**เทศบาลนครนครสวรรค์** · https://complain.nsm.go.th

---

## ภาพรวมระบบ

CAPP (Complaint Application) เป็นระบบรับเรื่องร้องทุกข์ออนไลน์ผ่าน LINE สำหรับประชาชน และมี Dashboard สำหรับเจ้าหน้าที่จัดการเรื่องตามสิทธิ์หน่วยงาน

```
ประชาชน ─► LINE Bot ─► กรอกฟอร์ม LIFF ─► บันทึก MongoDB
                                                  │
เจ้าหน้าที่ ◄── Dashboard ──────────────────────┘
(Login ผ่าน UMS)     React SPA
```

---

## โครงสร้างโปรเจกต์

```
app/
├── .env                        # Environment variables (ไม่ commit)
├── backend/
│   ├── server.js               # Express app + Cron jobs
│   ├── package.json
│   ├── public/liff/index.html  # หน้าฟอร์มแจ้งเรื่อง (LIFF)
│   ├── uploads/                # รูปภาพที่อัปโหลด
│   └── src/
│       ├── config/
│       │   ├── constants.js    # DEPARTMENTS, TICKET_STATUS, ROLES
│       │   └── db.js           # MongoDB connection
│       ├── middleware/
│       │   └── authMiddleware.js  # requireAuth, requireRole
│       ├── models/
│       │   ├── Counter.js      # Auto-increment ticketNo
│       │   ├── Ticket.js       # เรื่องร้องทุกข์
│       │   ├── LineGroup.js    # กลุ่ม LINE ที่บอทอยู่
│       │   └── AuditLog.js     # Audit log (TTL 120 วัน)
│       ├── routes/
│       │   ├── authRoutes.js        # /auth/*
│       │   ├── ticketRoutes.js      # /api/tickets/*
│       │   ├── dashboardRoutes.js   # /api/dashboard/*
│       │   ├── lineGroupRoutes.js   # /api/line-groups/*
│       │   ├── auditRoutes.js       # /api/audit/*
│       │   ├── backupRoutes.js      # /api/backup/*
│       │   └── lineWebhook.js       # /webhook
│       └── utils/
│           ├── lineNotify.js   # push/reply LINE messages
│           ├── lineQuota.js    # ตรวจ/บันทึกโควตา LINE
│           ├── auditLog.js     # logAction helper
│           └── ums.js          # UMS API integration
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js              # Fetch wrapper ทุก API
    │   ├── constants.js        # DEPARTMENTS, STATUS, ROLES (ต้องตรงกับ backend)
    │   └── pages/
    │       ├── LoginPage.jsx
            ├── DashboardPage.jsx        # รวม PublicFiscalManagePage (superadmin)
            ├── LineGroupsPage.jsx
            ├── ComplainantsPage.jsx
            ├── QuotaPage.jsx
            ├── BackupPage.jsx
            ├── AuditLogPage.jsx
            ├── StatisticsPage.jsx
            └── PublicFiscalSummaryPage.jsx  # /embed/fiscal-summary (สาธารณะ)
```

---

## Environment Variables (`.env`)

```env
PORT=5050
DOMAIN=https://complain.nsm.go.th
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb://user:pass@host:27017/complain

# JWT
JWT_SECRET=...

# LINE Messaging API
LINE_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
LIFF_ID=...
LINE_ADMIN_ID=...  # groupId กลุ่ม LINE admin สำหรับแจ้งเตือนคำร้องใหม่

# UMS (ระบบสมาชิกเจ้าหน้าที่)
UMS_LOGIN_URL=https://nssv.nsm.go.th/ums/
UMS_API_URL=https://nssv.nsm.go.th/ums/api/auth/me
UMS_PROJECT_KEY=...

# LINE Group (legacy — ปัจจุบันดึงจาก DB อัตโนมัติ)
LINE_GROUP_ID=...
```

---

## API Endpoints

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/login` | — | Redirect ไป UMS Login |
| GET | `/auth/callback` | — | รับ token จาก UMS, ออก JWT cookie |
| GET | `/auth/me` | Cookie | ข้อมูล user ที่ login อยู่ |
| POST | `/auth/logout` | Cookie | ล้าง cookie |

### Tickets (LIFF / Public)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/tickets` | — | บันทึกเรื่องร้องทุกข์ใหม่ |
| GET | `/api/tickets/additional-info/:token` | — | ดึงคำขอข้อมูลเพิ่มเติมสำหรับ LIFF |
| POST | `/api/tickets/additional-info/:token` | — | ส่งข้อมูล/รูปภาพเพิ่มเติมจากผู้ร้อง |
| GET | `/api/tickets/status/:ticketNo` | — | ตรวจสอบสถานะ (LINE Bot ใช้) |
| POST | `/api/tickets/preview-heic` | — | แปลง HEIC → JPEG + resize (สำหรับ LIFF) |

### Dashboard (เจ้าหน้าที่)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard/tickets` | JWT | รายการ (filter/search/page) |
| GET | `/api/dashboard/tickets/summary` | JWT | นับตามสถานะ |
| GET | `/api/dashboard/tickets/:id` | JWT | รายละเอียด + history |
| PATCH | `/api/dashboard/tickets/:id/status` | JWT | อัปเดตสถานะ |
| PATCH | `/api/dashboard/tickets/:id/additional-info/read` | JWT | ทำเครื่องหมายข้อมูลเพิ่มเติมว่าอ่านแล้ว |
| PATCH | `/api/dashboard/tickets/:id/forward` | JWT + admin | ส่งต่อหน่วยงาน |
| GET | `/api/dashboard/complainants` | JWT + admin | สถิติผู้ร้องตามปี |
| GET | `/api/dashboard/complainant-profiles` | JWT + admin | รายชื่อผู้ร้องพร้อมข้อมูล LINE profile |
| GET | `/api/dashboard/complainants/:lineUserId/tickets` | JWT + admin | รายการคำร้องของผู้ร้องรายคน |

### LINE Groups (admin+)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/line-groups` | JWT + admin | รายการกลุ่มทั้งหมด |
| PATCH | `/api/line-groups/:id/toggle` | JWT + superadmin | เปิด/ปิดกลุ่ม |
| PATCH | `/api/line-groups/:id/name` | JWT + admin | แก้ชื่อกลุ่ม |
| POST | `/api/line-groups/sync-name/:id` | JWT + superadmin | ดึงชื่อจาก LINE API |
| DELETE | `/api/line-groups/:id` | JWT + superadmin | ลบกลุ่ม |

### Audit Log (superadmin)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit` | JWT + superadmin | ดึง log พร้อม search/filter/pagination |
| GET | `/api/audit/meta` | JWT + superadmin | distinct actions & categories |

### LINE Quota (superadmin)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/quota/current` | JWT + superadmin | โควตา LINE ปัจจุบัน |
| POST | `/api/quota/refresh` | JWT + superadmin | รีเฟรชโควตา |
| GET | `/api/quota/history` | JWT + superadmin | ประวัติโควตา |

### Backup (superadmin)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/backup/download` | JWT + superadmin | ดาวน์โหลด backup ทุก collection เป็นไฟล์ JSON |

### Public Statistics / Embed
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/public/fiscal-summary` | — | สรุปสถิติปีงบประมาณปัจจุบันแบบสาธารณะ |
| GET | `/embed/fiscal-summary?width=960&height=540&layout=auto` | — | หน้า embed สรุปสถิติแบบ fixed size ไม่มี scrollbar |

Query สำหรับหน้า embed:
- `width`, `height` กำหนดพื้นที่แสดงผลเป็น px
- `layout` เลือก `auto`, `horizontal`, `vertical`, `compact`, `counts`
- เมื่อพื้นที่เล็กมาก ระบบจะใช้ `counts` อัตโนมัติ แสดงเฉพาะจำนวน ไม่แสดงกราฟหรือรายละเอียด
- `fiscalYear` ระบุปีงบประมาณได้ทั้ง ค.ศ. เช่น `2026` หรือ พ.ศ. เช่น `2569`

---

## Role & Permission

| Role | เห็น Ticket | ส่งต่อ | สถิติ/รายงาน | สถิติผู้ร้อง | ดูกลุ่ม LINE | ดำเนินการกลุ่ม LINE | Audit Log | Quota | Backup |
|------|------------|--------|--------------|--------------|--------------|----------------------|-----------|-------|--------|
| `staff` | จำกัด* | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `executive` | จำกัด* | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `admin` | ทุกหน่วยงาน | ✅ | ✅ | ✅ | ✅ | แก้ชื่อเท่านั้น | ❌ | ❌ | ❌ |
| `superadmin` | ทุกหน่วยงาน | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **จำกัด*** = หมวด "รอรับเรื่อง", "เสร็จสิ้น", "ไม่รับเรื่อง", "ทั้งหมด" เห็นทุกหน่วยงาน<br>
> แต่หมวด "ดำเนินการ" และ "ส่งต่อ" เห็นเฉพาะหน่วยงานตัวเอง

---

## Ticket Status Flow

```
รอรับเรื่อง ──► ระหว่างดำเนินการ ──► เสร็จสิ้น
     │                  │
     └──► ไม่รับเรื่อง  └──► ส่งต่อ (เปลี่ยนหน่วยงาน)
```

รูปแบบเลขที่คำร้อง: `RPT-YYMM-XXXX` เช่น `RPT-2604-0001`

### ขอข้อมูลเพิ่มเติมจากผู้ร้อง
เจ้าหน้าที่สามารถติ๊ก “ขอข้อมูลเพิ่มเติมจากผู้ร้อง” ในส่วนดำเนินการของคำร้องได้ โดยไม่รวม flow ส่งต่อ

- เมื่อเลือก กดบันทึกสถานะได้เลย (ใส่หมายเหตุเพิ่มเติมในช่องหมายเหตุปกติได้)
- ระบบส่ง LINE แจ้งสถานะตามปกติ และเพิ่มปุ่ม "กรอกข้อมูลเพิ่มเติม" ไปยัง LIFF (`/liff?additional=token`)
- ใน LIFF: แสดงหมายเหตุจากเจ้าหน้าที่ (ถ้ามี) และกล่องกรอกข้อมูลบังคับ + แนบรูปได้สูงสุด 5 รูป
- ข้อความเพิ่มเติมแสดงใต้รายละเอียดคำร้อง
- รูปเพิ่มเติมแสดงใต้รูปภาพประกอบเดิม ถ้ามีรูปเดิมอยู่แล้ว
- คำร้องที่มีข้อมูลเพิ่มเติมใหม่และยังไม่เปิดดู จะกระพริบสีม่วงในหน้ารายการ และหยุดเมื่อเจ้าหน้าที่เปิดดู
- ป้องกันการส่งข้อมูลเพิ่มเติมซ้ำ: หากผู้ร้องส่งแล้ว ปุ่มจะ disabled ไม่สามารถส่งซ้ำได้

### Auto-assign Department
เมื่อรับเรื่อง (เปลี่ยนสถานะเป็น "ระหว่างดำเนินการ") หากหน่วยงานเป็น "ไม่แน่ใจ":
- ระบบจะเปลี่ยนหน่วยงานเป็นหน่วยงานของผู้รับเรื่องอัตโนมัติ
- บันทึกการเปลี่ยนแปลงใน history และ audit log

---

## LINE Bot Commands

| คำสั่ง | ผล |
|--------|-----|
| `ร้องเรียน` หรือ `แจ้งเรื่อง` | ส่ง Flex Message พร้อมปุ่มเปิดฟอร์ม LIFF |
| `ตามเรื่อง` | แสดงรายการที่ค้างดำเนินการ (push แชทส่วนตัวถ้าพิมพ์จากกลุ่ม) |
| `RPT-XXXX-XXXX` | ตอบสถานะเรื่องนั้นทันที |

เมื่อมีคำร้องใหม่ ระบบจะส่ง Flex Message แจ้งเตือนไปยังกลุ่ม LINE admin (`LINE_ADMIN_ID`) พร้อมหัวข้อคำร้อง วันที่ เวลา และปุ่มเปิดระบบหลังบ้าน (`DOMAIN/dashboard`)

---

## Cron Jobs (Asia/Bangkok)

| เวลา | วัน | งาน |
|------|-----|-----|
| 17:00 | ทุกวัน | สรุปยอดประจำวัน เข้าทุกกลุ่ม active |

---

## การ Deploy

```bash
# 1. ติดตั้ง dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Build frontend
cd frontend && npm run build

# 3. รัน backend ด้วย PM2
cd backend && pm2 start server.js --name complain-backend

# 4. ตรวจสอบ
pm2 status
pm2 logs complain-backend --lines 30
```

---

## การ Update (workflow ปกติ)

```bash
# แก้โค้ด → build → restart
cd /home/complain/app/frontend && npm run build
pm2 restart complain-backend
```

## Backup Database

เมนู `💾 Backup` อยู่ใน Dashboard เฉพาะ `superadmin` และดาวน์โหลดข้อมูลทุก collection เป็นไฟล์ JSON ผ่าน `/api/backup/download`

Backup ครั้งแรกที่ทำหลังเพิ่มเมนู:

```text
backups/capp-db-backup-2026-05-06T10-39-53-774Z.json
```

---

## Tech Stack

| ชั้น | เทคโนโลยี |
|------|-----------|
| Backend | Node.js 22, Express 5, Mongoose 8 |
| Database | MongoDB 7 |
| Frontend | React 19, Vite 8 |
| Auth | JWT (httpOnly cookie), UMS SSO |
| LINE | @line/bot-sdk v11, LIFF SDK 2 |
| Process | PM2, Nginx (reverse proxy), Cloudflare SSL |
| Security | Helmet.js, CORS whitelist, Multer file validation, Audit Log |
| Image | heic-convert (HEIC→JPEG), sharp (resize) |

---

© 2026 งานจัดทำและพัฒนาระบบข้อมูลสารสนเทศ กลุ่มงานสถิติข้อมูลและสารสนเทศ เทศบาลนครนครสวรรค์ by manarider
