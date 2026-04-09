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
│       │   └── LineGroup.js    # กลุ่ม LINE ที่บอทอยู่
│       ├── routes/
│       │   ├── authRoutes.js        # /auth/*
│       │   ├── ticketRoutes.js      # /api/tickets/*
│       │   ├── dashboardRoutes.js   # /api/dashboard/*
│       │   ├── lineGroupRoutes.js   # /api/line-groups/*
│       │   └── lineWebhook.js       # /webhook
│       └── utils/
│           ├── lineNotify.js   # push/reply LINE messages
│           └── ums.js          # UMS API integration
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js              # Fetch wrapper ทุก API
    │   ├── constants.js        # DEPARTMENTS, STATUS, ROLES (ต้องตรงกับ backend)
    │   └── pages/
    │       ├── LoginPage.jsx
    │       ├── DashboardPage.jsx
    │       └── LineGroupsPage.jsx
    └── components/
        └── TicketModal.jsx
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
| GET | `/api/tickets/status/:ticketNo` | — | ตรวจสอบสถานะ (LINE Bot ใช้) |

### Dashboard (เจ้าหน้าที่)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard/tickets` | JWT | รายการ (filter/search/page) |
| GET | `/api/dashboard/tickets/summary` | JWT | นับตามสถานะ |
| GET | `/api/dashboard/tickets/:id` | JWT | รายละเอียด + history |
| PATCH | `/api/dashboard/tickets/:id/status` | JWT | อัปเดตสถานะ |
| PATCH | `/api/dashboard/tickets/:id/forward` | JWT + admin | ส่งต่อหน่วยงาน |

### LINE Groups (admin+)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/line-groups` | JWT + admin | รายการกลุ่มทั้งหมด |
| PATCH | `/api/line-groups/:id/toggle` | JWT + admin | เปิด/ปิดกลุ่ม |
| PATCH | `/api/line-groups/:id/name` | JWT + admin | แก้ชื่อกลุ่ม |
| POST | `/api/line-groups/sync-name/:id` | JWT + admin | ดึงชื่อจาก LINE API |
| DELETE | `/api/line-groups/:id` | JWT + admin | ลบกลุ่ม |

---

## Role & Permission

| Role | เห็น Ticket | ส่งต่อ | จัดการกลุ่ม LINE |
|------|------------|--------|-----------------|
| `staff` | เฉพาะหน่วยงานตัวเอง | ❌ | ❌ |
| `executive` | ทุกหน่วยงาน | ✅ | ❌ |
| `admin` | ทุกหน่วยงาน | ✅ | ✅ |
| `superadmin` | ทุกหน่วยงาน | ✅ | ✅ |

---

## Ticket Status Flow

```
รอรับเรื่อง ──► ระหว่างดำเนินการ ──► เสร็จสิ้น
     │                  │
     └──► ไม่รับเรื่อง  └──► ส่งต่อ (เปลี่ยนหน่วยงาน)
```

รูปแบบเลขที่คำร้อง: `RPT-YYMM-XXXX` เช่น `RPT-2604-0001`

---

## LINE Bot Commands

| คำสั่ง | ผล |
|--------|-----|
| `ร้องเรียน` หรือ `แจ้งเรื่อง` | ส่ง Flex Message พร้อมปุ่มเปิดฟอร์ม LIFF |
| `ตามเรื่อง` | แสดงรายการที่ค้างดำเนินการ (push แชทส่วนตัวถ้าพิมพ์จากกลุ่ม) |
| `RPT-XXXX-XXXX` | ตอบสถานะเรื่องนั้นทันที |

---

## Cron Jobs (Asia/Bangkok)

| เวลา | วัน | งาน |
|------|-----|-----|
| 16:30 | จันทร์–ศุกร์ | แจ้งเตือนงานค้าง (รอรับเรื่อง) เข้าทุกกลุ่ม active |
| 17:00 | จันทร์–ศุกร์ | สรุปยอดประจำวัน เข้าทุกกลุ่ม active |

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
| Security | Helmet.js, CORS whitelist, Multer file validation |

---

© 2026 งานจัดทำและพัฒนาระบบข้อมูลสารสนเทศ กลุ่มงานสถิติข้อมูลและสารสนเทศ เทศบาลนครนครสวรรค์ by manarider
