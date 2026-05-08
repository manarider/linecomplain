# CAPP — System Flowcharts
> อัปเดตล่าสุด: 8 พฤษภาคม 2569

---

## 1. ภาพรวมระบบ (System Overview)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ประชาชน (LINE User)                          │
└────────────────┬────────────────────────────────────────────────────┘
                 │  พิมพ์คำสั่ง / Add Friend
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    LINE Messaging API (Webhook)                      │
│          POST /webhook  →  Signature validation                      │
└────────┬───────────────────────────┬────────────────────────────────┘
         │ แจ้งเรื่อง                │ ตามเรื่อง / RPT-XXXX
         ▼                           ▼
┌────────────────┐       ┌───────────────────────┐
│  Flex Message  │       │ ดึงสถานะจาก MongoDB   │
│  ปุ่มเปิด LIFF │       │ ตอบกลับทันที           │
└───────┬────────┘       └───────────────────────┘
        │ คลิกปุ่ม
        ▼
┌────────────────────────────────────────────────────────────────────┐
│                  LIFF (In-App Browser ของ LINE)                     │
│              https://liff.line.me/{LIFF_ID}?gid=xxx                │
│  กรอกฟอร์ม → บีบอัดรูป → POST /api/tickets                        │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                    MongoDB (Ticket Collection)                       │
│             บันทึก + สร้าง ticketNo RPT-YYMM-XXXX                 │
└──────────────────┬─────────────────────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
┌──────────────┐   ┌─────────────────────────────────┐
│ Push LINE    │   │  Dashboard (เจ้าหน้าที่)         │
│ ยืนยันผู้ร้อง│   │  React SPA — Login ผ่าน UMS      │
└──────────────┘   └─────────────────────────────────┘
```

---

## 2. Flow การแจ้งเรื่องของประชาชน (Complaint Submission)

```
ประชาชนเปิด LINE
        │
        ├─► Add Friend (follow event)
        │         └─► Bot ส่ง Welcome Message + คำแนะนำการใช้งาน
        │
        ├─► พิมพ์ "แจ้งเรื่อง" หรือ "ร้องเรียน"
        │         └─► Bot ส่ง Flex Message พร้อมปุ่ม "เข้าสู่ระบบแจ้งเรื่อง"
        │                   └─► URL: liff.line.me/{LIFF_ID}?gid={groupId}
        │
        └─► คลิกปุ่มเปิด LIFF
                    │
                    ▼
            [หน้าฟอร์ม LIFF]
            ┌─────────────────────────────────────────┐
            │ 1. ตรวจสอบ liff.getFriendship()         │
            │    ❌ ยังไม่ได้ add friend → แจ้งเตือน  │
            │    ✅ ผ่าน → แสดงฟอร์ม                  │
            │                                          │
            │ 2. กรอกข้อมูล:                          │
            │    - หัวข้อเรื่อง (บังคับ)               │
            │    - รายละเอียด (บังคับ)                 │
            │    - หน่วยงานที่เกี่ยวข้อง               │
            │    - เบอร์โทรศัพท์                       │
            │    - ปักหมุด GPS (ไม่บังคับ)             │
            │    - รูปภาพ ≤5 รูป (ไม่บังคับ)           │
            │                                          │
            │ 3. Processing รูปภาพ (client-side):      │
            │    - HEIC/HEIF → แปลงด้วย heic2any.js   │
            │    - Resize max 1280px + max 500KB/รูป   │
            │    - Quality 0.80                         │
            │    - Progress bar 0–100%                  │
            └────────────────┬────────────────────────┘
                             │ POST /api/tickets (multipart/form-data)
                             ▼
                    [Backend: ticketRoutes.js]
                    ┌─────────────────────────────────┐
                    │ Rate limit: 5 คำร้อง/ชม/user    │
                    │ บันทึก Ticket ใน MongoDB         │
                    │ สร้าง ticketNo (Counter atomic)  │
                    │ HEIC → heic-convert → sharp      │
                    │ บันทึกรูปใน /uploads/            │
                    │ logAction(CREATE_TICKET)          │
                    └────────────┬────────────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    ▼                          ▼
          [Push LINE ผู้ร้อง]       [Push Flex Message]
          ยืนยัน + เลขที่คำร้อง    แจ้งเตือนกลุ่ม Admin LINE
          RPT-YYMM-XXXX            พร้อมปุ่ม "เปิดระบบหลังบ้าน"
```

---

## 3. Flow คำสั่ง LINE Bot

```
ผู้ใช้พิมพ์ข้อความ
         │
         ├─ "แจ้งเรื่อง" / "ร้องเรียน"
         │       └─► ส่ง Flex Message ปุ่มเปิด LIFF (ฝัง groupId ถ้าพิมพ์จากกลุ่ม)
         │
         ├─ "ตามเรื่อง"
         │       └─► ค้นหา Ticket ที่ค้างดำเนินการของ lineUserId นั้น
         │               ├─ พิมพ์จากกลุ่ม → Push แชทส่วนตัว + Reply แจ้งในกลุ่ม
         │               └─ พิมพ์จากแชทส่วนตัว → Reply ทันที
         │
         ├─ "ตรวจสอบสถานะ" / "เช็คสถานะ"
         │       └─► ส่ง Flex Message แนะนำให้พิมพ์เลขที่คำร้อง
         │
         ├─ "RPT-XXXX-XXXX" (เลขที่คำร้อง)
         │       └─► ค้นหาจาก DB → ตอบสถานะปัจจุบัน + วันที่อัปเดตล่าสุด
         │
         └─ ข้อความอื่น → ไม่ตอบสนอง

[Event join — บอทถูก add เข้ากลุ่ม]
         └─► บันทึก LineGroup ใน DB (isActive: true)
             ส่ง Welcome Message ในกลุ่ม

[Event leave — บอทถูก kick]
         └─► อัปเดต LineGroup (isActive: false, leftAt: now)
```

---

## 4. Flow การ Login เจ้าหน้าที่ (UMS SSO)

```
เจ้าหน้าที่เปิด /dashboard
         │
         ▼
[Frontend ตรวจสอบ JWT cookie]
         │
    ❌ ไม่มี/หมดอายุ ──────► Redirect → /login
                                    │
                                    ▼
                            [LoginPage.jsx]
                            กดปุ่ม "เข้าสู่ระบบ"
                                    │
                                    ▼
                            GET /auth/login
                                    │
                                    ▼
                    Redirect → UMS Login Page
                    https://nssv.nsm.go.th/ums/
                                    │
                            กรอก username/password
                                    │
                                    ▼
                    UMS Redirect กลับ → GET /auth/callback?token=xxx
                                    │
                                    ▼
                    [authRoutes.js: /auth/callback]
                    ┌────────────────────────────────┐
                    │ fetchUserInfo(token) จาก UMS   │
                    │ extractProjectPermission()      │
                    │ Map role: superadmin/admin/     │
                    │          executive/staff        │
                    │ ออก JWT (8h) → httpOnly cookie  │
                    │ logAction(LOGIN)                 │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
                            Redirect → /dashboard
         │
    ✅ JWT ถูกต้อง ──────► โหลด Dashboard
```

---

## 5. Flow การจัดการคำร้อง (Dashboard Workflow)

```
เจ้าหน้าที่เข้า Dashboard
         │
         ▼
[DashboardPage.jsx]
รายการคำร้อง (filter ตามสิทธิ์อัตโนมัติ)

Stat Cards: รอรับเรื่อง / ดำเนินการ / ส่งต่อ / เสร็จสิ้น / ไม่รับ / ทั้งหมด
         │
         ▼
คลิกการ์ดคำร้อง → [TicketModal.jsx]
         │
         ├─► ดู: รายละเอียด, รูปภาพ (Lightbox), GPS, history timeline
         │
         └─► ดำเนินการ (ตามสิทธิ์):

┌──────────────────────────────────────────────────────────────────┐
│ สถานะปัจจุบัน: "รอรับเรื่อง"                                    │
│                                                                  │
│  ┌─ เปลี่ยนเป็น "ระหว่างดำเนินการ" ──────────────────────────┐ │
│  │  Auto-assign: ถ้าหน่วยงาน = "ไม่แน่ใจ"                   │ │
│  │  → เปลี่ยนเป็นหน่วยงานของผู้รับเรื่องอัตโนมัติ           │ │
│  │  Push LINE แจ้งผู้ร้อง                                     │ │
│  │  logAction(UPDATE_STATUS)                                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ เปลี่ยนเป็น "ไม่รับเรื่อง" ──────────────────────────────┐ │
│  │  ระบุหมายเหตุ → Push LINE แจ้งผู้ร้อง                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ สถานะปัจจุบัน: "ระหว่างดำเนินการ"                               │
│                                                                  │
│  ┌─ เปลี่ยนเป็น "เสร็จสิ้น" ──────────────────────────────────┐ │
│  │  แนบรูปผลการดำเนินงาน (≤3 รูป, ไม่บังคับ)                 │ │
│  │  Push LINE แจ้งผู้ร้อง                                     │ │
│  │  logAction(UPDATE_STATUS)                                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ ส่งต่อหน่วยงาน (staff+) ──────────────────────────────────┐ │
│  │  เลือกหน่วยงานปลายทาง + หมายเหตุ                          │ │
│  │  สถานะ → "ส่งต่อ", เปลี่ยน assignedDepartment             │ │
│  │  บันทึก forwardedBy ใน history                             │ │
│  │  Push LINE แจ้งผู้ร้อง                                     │ │
│  │  logAction(FORWARD_TICKET)                                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ ขอข้อมูลเพิ่มเติม (ไม่รวมส่งต่อ) ────────────────────────┐ │
│  │  ติ๊ก checkbox + หมายเหตุ → บันทึกสถานะ                   │ │
│  │  Push LINE + ปุ่ม "กรอกข้อมูลเพิ่มเติม" → LIFF token      │ │
│  │  logAction(REQUEST_ADDITIONAL_INFO)                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Flow ขอข้อมูลเพิ่มเติม (Additional Info Loop)

```
เจ้าหน้าที่ติ๊ก "ขอข้อมูลเพิ่มเติม"
         │
         ▼
บันทึก additionalInfoRequest: { note, token, requestedAt }
Push LINE ผู้ร้อง:
  - แจ้งสถานะเหมือนเดิม
  - เพิ่มปุ่ม "กรอกข้อมูลเพิ่มเติม"
    URI: /liff?additional={token}
         │
         ▼
ผู้ร้องคลิกปุ่ม → เปิด LIFF โหมด additional
┌──────────────────────────────────────────┐
│ แสดงหมายเหตุจากเจ้าหน้าที่ (ถ้ามี)      │
│ กล่องกรอกข้อมูล (บังคับ)                │
│ แนบรูปภาพ ≤5 รูป (ไม่บังคับ)           │
│ ตรวจสอบว่ายังไม่เคยส่งแล้ว (409 ถ้าซ้ำ) │
└──────────────┬───────────────────────────┘
               │ POST /api/tickets/additional-info/:token
               ▼
บันทึก additionalInfo: { text, images[], submittedAt }
ตั้งค่า isAdditionalInfoNew: true (กระพริบสีม่วงในรายการ)
         │
         ▼
เจ้าหน้าที่เปิดดู TicketModal
  → เห็นข้อมูลเพิ่มเติมใต้รายละเอียด
  → PATCH /api/dashboard/tickets/:id/additional-info/read
  → isAdditionalInfoNew: false (หยุดกระพริบ)
  logAction(READ_ADDITIONAL_INFO)
```

---

## 7. Ticket Status Flow

```
                    ┌─────────────────┐
                    │   รอรับเรื่อง   │  ← สถานะเริ่มต้น
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
  ┌───────────────────────┐     ┌───────────────────┐
  │ ระหว่างดำเนินการ      │     │   ไม่รับเรื่อง    │  (จบ)
  └──────┬────────────────┘     └───────────────────┘
         │
    ┌────┴──────────────────┐
    ▼                       ▼
┌──────────┐         ┌─────────────────────────┐
│ เสร็จสิ้น│  (จบ)   │ ส่งต่อ (เปลี่ยนหน่วยงาน)│
└──────────┘         └────────────┬────────────┘
                                  │
                                  ▼
                       ┌───────────────────────┐
                       │ ระหว่างดำเนินการ (ใหม่)│
                       └───────────────────────┘
```

---

## 8. สิทธิ์การเข้าถึงข้อมูล (Role-based Access)

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ Role         │ สิทธิ์การเข้าถึง                                            │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ staff        │ - ดู Ticket: ทุกหน่วยงาน ยกเว้น tab "ดำเนินการ"/"ส่งต่อ"  │
│              │   → เห็นเฉพาะหน่วยงานตัวเอง                                 │
│              │ - เปลี่ยนสถานะ, ส่งต่อ, ขอข้อมูลเพิ่มเติม                  │
│              │ - ดูสถิติและรายงาน (StatisticsPage)                          │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ executive    │ - สิทธิ์เหมือน staff                                         │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ admin        │ - ดู Ticket ทุกหน่วยงานทุก tab                               │
│              │ - สถิติผู้ร้อง (ComplainantsPage)                            │
│              │ - ดูรายการกลุ่ม LINE + แก้ชื่อกลุ่ม                         │
├──────────────┼──────────────────────────────────────────────────────────────┤
│ superadmin   │ - ทุกอย่างที่ admin ทำได้                                    │
│              │ - เปิด/ปิด/ลบกลุ่ม LINE, ซิงค์ชื่อจาก LINE API              │
│              │ - Audit Log (AuditLogPage)                                   │
│              │ - LINE Quota (QuotaPage)                                     │
│              │ - Backup Database (BackupPage)                               │
│              │ - หน้าสถิติสาธารณะ + Embed Code (PublicFiscalManagePage)     │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 9. Flow หน้าสถิติสาธารณะ (Public Fiscal Summary)

```
[Superadmin] เมนู "🌐 หน้าสถิติสาธารณะ"
         │
         ▼
[PublicFiscalManagePage]
  - เลือกปีงบประมาณ, ปรับ width/height
  - Preset: 960×540, 1280×720, 800×450, 640×360
  - แสดง Embed Code <iframe> พร้อมปุ่มคัดลอก
  - Preview iframe realtime
  - ปุ่มเปิดในแท็บใหม่
         │
         ▼
[หน้า /embed/fiscal-summary?fiscalYear=2569&width=960&height=540]
  (สาธารณะ — ไม่ต้อง login)
         │
         ▼
GET /api/public/fiscal-summary?fiscalYear=2569
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ คำนวณจาก MongoDB:                                    │
│ - วันเริ่มต้น = วันที่ ticket แรกสุดในปีนั้น         │
│ - วันสิ้นสุด = วันปัจจุบัน (หรือ 30 ก.ย. ถ้าจบแล้ว)│
│ - ยอดรวม, เสร็จสิ้น, กำลังดำเนินการ                 │
│ - แยกตามหน่วยงาน                                     │
│ - เวลาเฉลี่ยดำเนินการเสร็จ                           │
└──────────────────────────────────────────────────────┘
         │
         ▼
[PublicFiscalSummaryPage.jsx]
  Layout อัตโนมัติตาม width/height:
  ┌─────────────────────────────────────────────────┐
  │ width≥680 & height≥430:  horizontal / vertical  │
  │ width<680 หรือ height<430: compact              │
  │ width<560 หรือ height<360: counts (แค่ตัวเลข)   │
  └─────────────────────────────────────────────────┘
  
  3 Panels:
  ┌─────────────┐  ┌────────────────┐  ┌─────────────────────┐
  │ คำร้องทั้งหมด│  │  เสร็จสิ้นแล้ว │  │ ระหว่างดำเนินการ    │
  │ + แยกตามงาน │  │ + เวลาเฉลี่ย   │  │ + แยกตามหน่วยงาน    │
  └─────────────┘  └────────────────┘  └─────────────────────┘
  
  ด้านล่าง: ปุ่ม "แจ้งเรื่องผ่าน LINE OA" → https://lin.ee/rOVBU2y
```

---

## 10. Flow Cron Jobs & LINE Notifications

```
[node-cron — Asia/Bangkok]

17:00 ทุกวัน ─────────────────────────────────────────────────────────►
  │
  ├─ ดึงกลุ่ม isActive=true ทั้งหมดจาก DB
  └─ Push "สรุปยอดประจำวัน" เข้าทุกกลุ่ม active
       - จำนวนรอรับเรื่อง / กำลังดำเนินการ / เสร็จสิ้นวันนี้

[LINE Notifications ที่ trigger จาก action]

CREATE_TICKET
  ├─ Push ผู้ร้อง: ยืนยันรับเรื่อง + เลขที่คำร้อง
  └─ Push กลุ่ม Admin: Flex Message หัวข้อ + ปุ่มเปิด Dashboard

UPDATE_STATUS / FORWARD_TICKET
  └─ Push ผู้ร้อง: แจ้งสถานะใหม่ + หมายเหตุ (ถ้ามี)

REQUEST_ADDITIONAL_INFO
  └─ Push ผู้ร้อง: แจ้งสถานะ + ปุ่ม "กรอกข้อมูลเพิ่มเติม"
```

---

## 11. Flow Audit Log

```
ทุก action สำคัญในระบบ
         │
         ▼
logAction({ action, category, actor, targetId, meta })
  [fire-and-forget — ไม่ block response]
         │
         ▼
บันทึกใน AuditLog Collection (TTL index 120 วัน)
         │
         ▼
[superadmin] เมนู "🗂️ Audit Log"
  GET /api/audit?action=&category=&from=&to=&page=
  → ค้นหา, กรอง, pagination
  
Actions ที่บันทึก:
  LOGIN, LOGIN_FAILED, LOGOUT
  CREATE_TICKET
  UPDATE_STATUS (รวม auto-assign department)
  FORWARD_TICKET (รวม หน่วยงานต้นทาง/ปลายทาง)
  REQUEST_ADDITIONAL_INFO
  SUBMIT_ADDITIONAL_INFO
  READ_ADDITIONAL_INFO
  BACKUP_DATABASE
```

---

## 12. Security Layers

```
Request เข้าระบบ
         │
         ▼
[Cloudflare] — SSL termination, DDoS protection
         │
         ▼
[Nginx] — Reverse proxy → port 5050
         │
         ▼
[Express + Helmet.js]
  - Content-Security-Policy (whitelist domains)
  - X-Frame-Options (SAMEORIGIN + LINE LIFF)
  - CORS whitelist: complain.nsm.go.th + liff.line.me
         │
         ├─► /webhook  → LINE Signature Validation (HMAC-SHA256)
         │
         ├─► /api/tickets  → Rate limit: 5 req/hr/lineUserId
         │                   Multer: mimetype + size + random filename
         │
         ├─► /api/dashboard/*  → requireAuth (JWT httpOnly cookie)
         │
         ├─► /api/audit, /api/quota, /api/backup
         │                    → requireAuth + requireRole('superadmin')
         │
         └─► /api/statistics  → requireAuth + requireRole(admin+)
```

---

## 13. Image Processing Pipeline

```
[LIFF — ฝั่ง Client]
ผู้ใช้เลือกรูป (JPEG/PNG/HEIC/HEIF)
         │
    ┌────┴────────────────────┐
    │ HEIC/HEIF?              │
    │ ✅ → heic2any.js        │
    │      แปลงเป็น JPEG      │
    └────┬────────────────────┘
         │
    Canvas resize
    Max 1280px (longest side)
    Quality 0.80
    Max 500KB/รูป
         │
         ▼
    base64 → Blob → FormData
         │
         ▼
POST /api/tickets (multipart/form-data)

[Backend — ฝั่ง Server]
         │
    ┌────┴──────────────────────────────┐
    │ HEIC ที่ผ่านมาจาก server path?   │
    │ ✅ → heic-convert + sharp resize  │
    └────┬──────────────────────────────┘
         │
    บันทึกไฟล์ → /uploads/{random-name}.jpg
    URL: /uploads/{filename}

[TicketModal — Lightbox Viewer]
รูปแยก 3 กลุ่ม:
  📎 รูปภาพประกอบคำร้อง (images[])
  📎 รูปภาพเพิ่มเติม (additionalInfo.images[])
  📎 รูปภาพผลการดำเนินงาน (completionImages[])
  
  คลิกรูป → Lightbox prev/next + keyboard (← → Esc)
```

---

## 14. Data Model ย่อ (Ticket)

```
Ticket {
  ticketNo:           "RPT-2604-0001"        // auto RPT-YYMM-XXXX
  lineUserId:         string
  displayName:        string
  subject:            string
  description:        string
  assignedDepartment: string                 // auto-assign ถ้า "ไม่แน่ใจ"
  status:             รอรับเรื่อง | ระหว่างดำเนินการ | ส่งต่อ | เสร็จสิ้น | ไม่รับเรื่อง
  images:             string[]               // รูปภาพประกอบคำร้อง
  completionImages:   string[]               // รูปภาพผลการดำเนินงาน
  phone:              string
  location:           { lat, lng }
  
  additionalInfoRequest: {
    note:        string
    token:       string                      // UUID สำหรับ LIFF link
    requestedAt: Date
  }
  
  additionalInfo: {
    text:         string
    images:       string[]                   // รูปภาพเพิ่มเติมจากผู้ร้อง
    submittedAt:  Date
  }
  isAdditionalInfoNew: boolean               // กระพริบสีม่วงในรายการ
  
  history: [{
    status:      string
    note:        string
    updatedBy:   string
    updatedAt:   Date
    forwardedTo: string
    forwardedBy: string
  }]
  
  createdAt:    Date
  updatedAt:    Date
}
```
