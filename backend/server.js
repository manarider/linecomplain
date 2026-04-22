require('dotenv').config({ path: '../.env' });
process.env.TZ = 'Asia/Bangkok'; // ตั้ง timezone ของ Node.js เป็นไทย
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const lineWebhook = require('./src/routes/lineWebhook');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const lineGroupRoutes = require('./src/routes/lineGroupRoutes');
const quotaRoutes = require('./src/routes/quotaRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const path = require('path');
const fs = require('fs');

const app = express();

// ── Trust Proxy (nginx reverse proxy) ─────────────────────
// ต้องตั้งก่อน middleware อื่น ๆ เพื่อให้ req.ip และ
// x-forwarded-for ถูกต้องสำหรับ rate-limit และ audit log
app.set('trust proxy', 1);

// ── เชื่อมต่อ MongoDB ──────────────────────────────────────
connectDB();

// ── Security Middleware ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://static.line-scdn.net", "https://static.cloudflareinsights.com", "https://liff.line.me"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "blob:", "https://profile.line-scdn.net", "https://obs.line-scdn.net"],
      connectSrc:  ["'self'", "https://api.line.me", "https://access.line.me", "https://obs.line-scdn.net", "https://liff.line.me"],
      fontSrc:     ["'self'", "data:"],
      mediaSrc:    ["'self'", "data:"],
      objectSrc:   ["'none'"],
      frameSrc:    ["https://access.line.me", "https://liff.line.me"],
      frameAncestors: ["https://liff.line.me"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // LIFF SDK ต้องการ
}));

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = [
  process.env.DOMAIN,           // https://complain.nsm.go.th
  'https://liff.line.me',       // LIFF iframe origin
];
app.use(cors({
  origin: (origin, cb) => {
    // อนุญาต request ที่ไม่มี origin (เช่น curl, mobile app) หรือ origin ที่อยู่ใน list
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));

// ── Routes: LINE Webhook (ต้องรับ raw body ก่อน json middleware) ──
app.use('/webhook', lineWebhook);

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Static Files ──────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/liff/assets', express.static(path.join(__dirname, 'public/liff')));

// ── React Frontend (static dist) ───────────────────────
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// ── LIFF Page: inject LIFF_ID ลงใน HTML ───────────────────
// ปิด CSP เฉพาะหน้านี้ เพราะ LIFF SDK ต้องการเรียกหลาย domain ของ LINE
const serveLiffPage = (req, res) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Type-Options');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Resource-Policy');
  res.removeHeader('Origin-Agent-Cluster');
  const html = fs.readFileSync(path.join(__dirname, 'public/liff/index.html'), 'utf-8');
  res.send(
    html
      .replace('%%LIFF_ID%%', process.env.LIFF_ID || '')
      .replace('%%DOMAIN%%', process.env.DOMAIN || '')
  );
};
app.get('/liff', serveLiffPage);
app.get('/liff/', serveLiffPage);

// ── Routes: Authentication (ไม่ต้อง login ก่อน) ───────────
app.use('/auth', authRoutes);

// ── Routes: Ticket API (ไม่ต้อง auth – ส่งจาก LIFF โดยใช้ lineUserId) ─
app.use('/api/tickets', ticketRoutes);

// ── Routes: Dashboard API (ต้อง login) ─────────────────────
app.use('/api/dashboard', dashboardRoutes);

// ── Routes: LINE Groups Management (ต้อง login + admin) ────
app.use('/api/line-groups', lineGroupRoutes);

// ── Routes: LINE Quota (ต้อง login + superadmin) ─────
app.use('/api/quota', quotaRoutes);

// ── Routes: Audit Log (ต้อง login + superadmin) ─────
app.use('/api/audit', auditRoutes);

// ── Health Check ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── SPA Fallback (React handles routing) ─────────────────
app.get('*path', (req, res) => {
  // routes เหล่านี้ไม่ใช่ frontend – ตอบ 404 JSON
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhook')) {
    return res.status(404).json({ message: 'ไม่พบ endpoint ที่ร้องขอ' });
  }
  const indexFile = path.join(__dirname, '../frontend/dist/index.html');
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  res.status(404).send('Frontend ยังไม่ได้ build');
});

// ── Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.name === 'SignatureValidationFailed') {
    return res.status(401).json({ message: 'Invalid LINE signature' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
});

// ── Start Server ────────────────────────────────────────────
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 Server เริ่มทำงานที่ port ${PORT}`);
  console.log(`🌐 Domain: ${process.env.DOMAIN}`);
});

// ── Scheduled LINE Notifications (node-cron) ───────────────
const cron = require('node-cron');
const { pushGroupEODSummary } = require('./src/utils/lineNotify');
const { checkLineQuota } = require('./src/utils/lineQuota');
const LineGroup = require('./src/models/LineGroup');

// ดึงกลุ่มที่ isActive=true ทั้งหมดจาก DB แล้ว push ทีละกลุ่ม
const runCronForAllActiveGroups = async (fn, label) => {
  const groups = await LineGroup.find({ isActive: true }, 'groupId groupName');
  if (!groups.length) {
    console.log(`⏰ Cron ${label}: ไม่มีกลุ่ม active ใน DB`);
    return;
  }
  for (const g of groups) {
    fn(g.groupId).catch((e) => console.error(`Cron ${label} [${g.groupName}] error:`, e.message));
  }
};

// 06:00 น. ทุกวัน → ตรวจโควตา LINE และบันทึกลง MongoDB
cron.schedule('0 6 * * *', () => {
  console.log('⏰ Cron: ตรวจโควตา LINE 06:00');
  checkLineQuota().catch((e) => console.error('Cron quota error:', e.message));
}, { timezone: 'Asia/Bangkok' });

// 17:00 น. ทุกวันจันทร์-ศุกร์ → สรุปยอดประจำวัน + งานค้าง (Flex Message)
cron.schedule('0 17 * * 1-5', () => {
  console.log('⏰ Cron: สรุปยอด + งานค้าง 17:00');
  runCronForAllActiveGroups(pushGroupEODSummary, 'eod-summary');
}, { timezone: 'Asia/Bangkok' });

console.log('✅ Cron jobs ตั้งค่าแล้ว (06:00 ตรวจโควตา, 17:00 สรุปวัน+งานค้าง) — ดึงกลุ่มจาก DB อัตโนมัติ');
