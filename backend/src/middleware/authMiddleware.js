const jwt = require('jsonwebtoken');

/**
 * Middleware ตรวจสอบว่า Login แล้วหรือยัง
 * ใช้กับทุก route ที่ต้องการ authentication
 */
const requireAuth = (req, res, next) => {
  const token = req.cookies?.auth_token;

  if (!token) {
    // ถ้าเป็น API request ให้ตอบ JSON
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    // ถ้าเป็นหน้าเว็บให้ redirect ไป login
    return res.redirect('/auth/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // แนบข้อมูล user ไว้ใน request
    next();
  } catch {
    res.clearCookie('auth_token');
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ message: 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
    }
    return res.redirect('/auth/login');
  }
};

/**
 * Middleware ตรวจสอบสิทธิ์ตาม Role
 * ใช้กับ route ที่ต้องการ role เฉพาะ
 * @param {...string} roles - roles ที่อนุญาต เช่น 'admin', 'manager', 'staff'
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `ไม่มีสิทธิ์เข้าถึง (ต้องการ role: ${roles.join(' หรือ ')})`,
      });
    }

    next();
  };
};

module.exports = { requireAuth, requireRole };
