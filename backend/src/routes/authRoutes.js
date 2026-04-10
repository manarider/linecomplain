const express = require('express');
const jwt = require('jsonwebtoken');
const { fetchUserInfo, extractProjectPermission } = require('../utils/ums');
const { logAction, getIp } = require('../utils/auditLog');

const router = express.Router();

// ============================================================
// GET /auth/login
// Redirect เจ้าหน้าที่ไปหน้า Login ของ UMS
// ============================================================
router.get('/login', (req, res) => {
  // สร้าง URL สำหรับ redirect กลับมาหลัง login สำเร็จ
  const callbackUrl = encodeURIComponent(
    `${process.env.DOMAIN}/auth/callback`
  );

  // Redirect ไปหน้า Login ของ UMS พร้อมส่ง callback URL
  const redirectUrl = `${process.env.UMS_LOGIN_URL}?redirect=${callbackUrl}`;
  res.redirect(redirectUrl);
});

// ============================================================
// GET /auth/callback?token=xxxx
// รับ Token จาก UMS แล้วยืนยันตัวตนและสร้าง JWT ของระบบเรา
// ============================================================
router.get('/callback', async (req, res) => {
  const { token } = req.query;

  // ตรวจสอบว่าได้รับ token มาหรือไม่
  if (!token) {
    return res.status(400).json({ message: 'ไม่พบ token จาก UMS' });
  }

  try {
    // 1. เรียก UMS API เพื่อดึงข้อมูล User จาก token
    const umsUser = await fetchUserInfo(token);

    // 2. ตรวจสอบสิทธิ์ในโปรเจกต์ร้องทุกข์
    const permission = extractProjectPermission(umsUser);

    if (!permission) {
      return res.status(403).json({
        message: 'คุณไม่มีสิทธิ์เข้าใช้งานระบบร้องทุกข์นี้',
      });
    }

    // 3. สร้าง Payload สำหรับ JWT ของระบบเรา
    const payload = {
      userId: umsUser._id || umsUser.id,
      firstName: umsUser.firstName,
      lastName: umsUser.lastName,
      role: permission.role,
      subDepartment: permission.subDepartment,
    };

    // 4. ออก JWT ของระบบร้องทุกข์ (อายุ 8 ชั่วโมง)
    const ourToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '8h',
    });

    // 5. เก็บ JWT ใน httpOnly cookie (ปลอดภัยจาก XSS)
    res.cookie('auth_token', ourToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // https only ใน production
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 ชั่วโมง
    });

    // 6. Redirect ไปหน้า Dashboard
    logAction({
      actorId:   payload.userId,
      actorName: `${payload.firstName} ${payload.lastName}`.trim(),
      actorRole: payload.role,
      action:    'LOGIN',
      category:  'auth',
      detail:    `เข้าสู่ระบบสำเร็จ (${payload.role})`,
      ip:        getIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Auth callback error:', error.message);
    logAction({
      actorId:  'unknown',
      actorName:'unknown',
      actorRole:'',
      action:   'LOGIN_FAILED',
      category: 'auth',
      detail:   `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`,
      ip:        getIp(req),
      userAgent: req.headers['user-agent'] || '',
      success:  false,
      errorMessage: error.message,
    });
    // กรณี UMS ตอบ 401 (token หมดอายุหรือไม่ถูกต้อง)
    if (error.response?.status === 401) {
      return res.redirect('/auth/login');
    }
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการยืนยันตัวตน' });
  }
});

// ============================================================
// GET /auth/me
// ดึงข้อมูล User ที่ login อยู่ (สำหรับ Frontend)
// ============================================================
router.get('/me', (req, res) => {
  const token = req.cookies?.auth_token;

  if (!token) {
    return res.status(401).json({ message: 'ยังไม่ได้เข้าสู่ระบบ' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({
      userId: decoded.userId,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      role: decoded.role,
      subDepartment: decoded.subDepartment,
    });
  } catch {
    res.status(401).json({ message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
});

// ============================================================
// POST /auth/logout
// ล้าง cookie และออกจากระบบ
// ============================================================
router.post('/logout', (req, res) => {
  const token = req.cookies?.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logAction({
        actorId:   decoded.userId,
        actorName: `${decoded.firstName} ${decoded.lastName}`.trim(),
        actorRole: decoded.role,
        action:    'LOGOUT',
        category:  'auth',
        detail:    'ออกจากระบบ',
        ip:        getIp(req),
        userAgent: req.headers['user-agent'] || '',
      });
    } catch { /* token หมดอายุ ไม่ต้อง log */ }
  }
  res.clearCookie('auth_token');
  res.json({ message: 'ออกจากระบบสำเร็จ' });
});

module.exports = router;
