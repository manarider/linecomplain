# 📋 แผนการพัฒนาระบบรับเรื่องร้องทุกข์ (CAPP — Complaint Application)
> อัปเดตล่าสุด: 7 เมษายน 2569

---

## ✅ Phase 1: Foundation (โครงสร้างพื้นฐาน)
- [x] Ubuntu Server + Node.js + MongoDB + Nginx + PM2
- [x] Domain `complain.nsm.go.th` + Cloudflare SSL
- [x] LINE Messaging API Channel (Token/Secret)

## ✅ Phase 2: UMS Integration & Auth (ระบบสมาชิกเจ้าหน้าที่)
- [x] ตั้งค่า `UMS_LOGIN_URL`, `UMS_API_URL`, `UMS_PROJECT_KEY` ใน `.env`
- [x] `GET /auth/login` → Redirect ไปยัง UMS Login
- [x] `GET /auth/callback` → รับ token จาก UMS, ออก JWT เก็บใน httpOnly cookie (8h)
- [x] `fetchUserInfo` + `extractProjectPermission` ใน `utils/ums.js` พร้อม role mapping
- [x] Middleware `requireAuth`, `requireRole` ครอบคลุม routes ทุกจุด
- [x] รายชื่อหน่วยงาน 11 หน่วยงาน + `FULL_ACCESS_ROLES` ใน `config/constants.js`

## ✅ Phase 3: LIFF & Complaint Flow (ฝั่งประชาชน)
- [x] LINE Webhook รับคำสั่ง `ร้องเรียน` / `แจ้งเรื่อง` → ส่ง Flex Message พร้อมปุ่มเปิด LIFF
- [x] LINE Webhook รับคำสั่ง `ตามเรื่อง` → แสดงรายการค้างดำเนินการ (single bubble card)
  - กรณีพิมพ์จากกลุ่ม: push ไปแชทส่วนตัว + reply แจ้งในกลุ่ม
- [x] LINE Webhook รับเลขที่คำร้อง `RPT-XXXX-XXXX` → ตอบสถานะทันที
- [x] LIFF หน้าฟอร์ม (`/liff`) — หัวข้อ, รายละเอียด, หน่วยงาน, เบอร์โทร, GPS pin, รูปภาพ (≤5รูป/4MB)
  - Image compression อัตโนมัติ (max 1920px, max 1MB/รูป)
  - ตรวจสอบ `liff.getFriendship()` ก่อนส่ง
  - ฝัง `groupId` ผ่าน query string `?gid=` จาก webhook
- [x] `POST /api/tickets` — บันทึก ticket + push Flex Message ยืนยันทั้งแชทส่วนตัวและกลุ่ม
- [x] `GET /api/tickets/status/:ticketNo` — ตรวจสถานะแบบ public (LINE Bot ใช้)
- [x] `ticketNo` auto-generate `RPT-YYMM-XXXX` atomic ผ่าน Counter model

## ✅ Phase 4: Admin Dashboard (หลังบ้านตามสิทธิ์ UMS)
- [x] SPA Frontend React + Vite — LoginPage, DashboardPage, TicketModal, LineGroupsPage
- [x] Dashboard protected ด้วย JWT cookie — redirect login อัตโนมัติ
- [x] `GET /api/dashboard/tickets` — รายการพร้อม pagination, search (escape regex), filter สถานะ/หน่วยงาน
- [x] `GET /api/dashboard/tickets/summary` — นับจำนวนตามสถานะ (Stat Cards)
- [x] **Logic คัดกรอง:** `staff` เห็นเฉพาะ `assignedDepartment === subDepartment`, `admin/superadmin/executive` เห็นทั้งหมด
- [x] `PATCH /api/dashboard/tickets/:id/status` — อัปเดตสถานะ + push LINE แจ้งผู้แจ้ง
- [x] `PATCH /api/dashboard/tickets/:id/forward` — ส่งต่อ (admin+ เท่านั้น) + push LINE
- [x] TicketModal: รูปภาพ, history, ฟอร์มอัปเดต/ส่งต่อ — ซ่อนส่วนดำเนินการเมื่อสถานะ "เสร็จสิ้น" แล้ว
- [x] Dashboard responsive: Sidebar slide drawer บนมือถือ, ปุ่ม logout มุมขวาบน, แสดงชื่อหน่วยงานใต้หัวข้อ

## ✅ Phase 5: LINE Group Management (ระบบจัดการกลุ่ม LINE)
- [x] `LineGroup` model — เก็บ groupId, groupName, isActive, addedAt, leftAt
- [x] Webhook `join` event — บันทึกกลุ่มเข้า DB + ทักทายในกลุ่ม
- [x] Webhook `leave` event — อัปเดต `isActive: false, leftAt`
- [x] `GET/PATCH/POST/DELETE /api/line-groups` — API จัดการกลุ่ม (admin+ เท่านั้น)
  - toggle เปิด/ปิดกลุ่ม, แก้ชื่อ, sync ชื่อจาก LINE API, ลบ
- [x] LineGroupsPage — หน้าจัดการกลุ่ม LINE บน Dashboard (superadmin/admin เท่านั้น)
- [x] Cron 16:30 แจ้งงานค้าง + Cron 17:00 สรุปยอดประจำวัน — **ดึงกลุ่ม isActive จาก DB อัตโนมัติ** (รองรับหลายกลุ่ม)

## 🔒 Security (ที่ได้ดำเนินการ)
- [x] Helmet.js + CSP whitelist เฉพาะ domain ที่จำเป็น
- [x] CORS whitelist เฉพาะ `complain.nsm.go.th` + `liff.line.me`
- [x] LINE Webhook Signature validation ทุก request
- [x] JWT httpOnly cookie (`secure: true` ใน production)
- [x] File upload: ตรวจ mimetype, จำกัดขนาด, ชื่อไฟล์ random (ป้องกัน path traversal)
- [x] Regex search input escaping (ป้องกัน ReDoS)
- [x] Role-based access control ทุก protected route

## 📊 Phase 6: Statistics & Report (แผนในอนาคต)
- [ ] หน้าสรุปสถิติรายเดือน/รายปีงบประมาณ สำหรับ executive/admin
- [ ] Export รายงาน PDF / Excel
- [ ] Rate limiting สำหรับ `POST /api/tickets` (ป้องกัน spam)