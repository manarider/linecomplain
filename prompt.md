Prompt: > "ฉันกำลังพัฒนาระบบรับเรื่องร้องทุกข์ด้วย Node.js, Express, และ MongoDB โดยมีการเชื่อมต่อกับระบบ UMS (User Management System) ภายนอกเพื่อพิสูจน์ตัวตนเจ้าหน้าที่

สิ่งที่ต้องการให้ช่วยเขียน:

1. ระบบ Authentication กับ UMS:

สร้าง Route /auth/login สำหรับ Redirect เจ้าหน้าที่ไปที่หน้า Login ของ UMS

สร้าง Route /auth/callback เพื่อรับ token จาก URL (Query String)

เขียนฟังก์ชันเรียก API ของ UMS (GET /api/auth/me) โดยส่ง Token ใน Header (Bearer) เพื่อรับข้อมูล User Object (ที่มีชื่อ, นามสกุล, และ projectPermissions)

เมื่อได้ข้อมูลมาแล้ว ให้เช็คสิทธิ์ใน projectPermissions ว่า User คนนี้มีบทบาท (role) และหน่วยงาน (subDepartment) อะไรในโปรเจกต์ร้องทุกข์นี้ และเก็บข้อมูลลง Session หรือ JWT ของระบบเราเอง

2. ระบบรับเรื่อง (Line Bot & LIFF):

เขียน Webhook รับข้อความ 'แจ้งเรื่อง' จาก LINE หากเป็นเพื่อนแล้วให้ส่ง Flex Message ปุ่มเปิด LIFF

เขียน API /api/tickets รับ Data จาก LIFF (ใช้ multer เซฟรูปลง ./uploads) และบันทึกลง MongoDB

โครงสร้าง Ticket ต้องมีฟิลด์ assignedDepartment (เพื่อเอาไว้ Match กับ subDepartment ของเจ้าหน้าที่จาก UMS)

3. หน้า Dashboard (Admin/Staff):

เขียน API ดึงรายการคำร้องที่กรองตามสิทธิ์ (Authorization Middleware):

หาก User จาก UMS มี role เป็น 'admin' หรือ 'manager' ให้เห็นคำร้องทั้งหมด

หากเป็น 'staff' ให้เห็นเฉพาะคำร้องที่ assignedDepartment ตรงกับ subDepartment ที่ UMS ส่งมาให้

4. ระบบแจ้งเตือน:

เมื่อเจ้าหน้าที่อัปเดตสถานะใน Dashboard ให้ส่ง pushMessage แจ้งเตือนผู้ร้องผ่าน LINE User ID

ใช้ node-cron สรุปรายงานประจำวันเวลา 17.00 น. ส่งเข้ากลุ่ม LINE

ข้อมูลทางเทคนิคเพิ่มเติม:

UMS API URL: https://nssv.nsm.go.th/ums/api/auth/me

ใช้ mongoose สำหรับ MongoDB

ใช้ axios สำหรับเรียก API ภายนอก

เขียน Code ให้รองรับ Environment Variables (.env) และอธิบายคอมเมนต์เป็นภาษาไทย"