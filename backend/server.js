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
const statisticsRoutes = require('./src/routes/statisticsRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const backupRoutes = require('./src/routes/backupRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const satisfactionRoutes = require('./src/routes/satisfactionRoutes');
const wspRoutes = require('./src/routes/wspRoutes');
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
      frameSrc:    ["'self'", "https://access.line.me", "https://liff.line.me"],
      frameAncestors: ["'self'", "https://liff.line.me"],
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
const isPublicReadPath = (req) => (
  req.path.startsWith('/api/public') ||
  req.path.startsWith('/embed/') ||
  req.path.startsWith('/assets/')
);
app.use(cors((req, cb) => {
  if (isPublicReadPath(req)) {
    return cb(null, { origin: true, credentials: false });
  }
  return cb(null, {
    origin: (origin, originCb) => {
      // อนุญาต request ที่ไม่มี origin (เช่น curl, mobile app) หรือ origin ที่อยู่ใน list
      if (!origin || allowedOrigins.includes(origin)) return originCb(null, true);
      // ปฏิเสธ CORS โดยไม่ throw Error เพื่อป้องกัน unhandled error ใน Express
      originCb(null, false);
    },
    credentials: true,
  });
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

// ── Public Embed Page: อนุญาตให้นำไปฝังในเว็บไซต์อื่นได้ ─────
const servePublicEmbedPage = (req, res, next) => {
  const indexFile = path.join(__dirname, '../frontend/dist/index.html');
  if (!fs.existsSync(indexFile)) return next();
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Resource-Policy');
  res.sendFile(indexFile);
};
app.get('/embed/fiscal-summary', servePublicEmbedPage);

// ── Routes: Authentication (ไม่ต้อง login ก่อน) ───────────
app.use('/auth', authRoutes);

// ── Routes: Ticket API (ไม่ต้อง auth – ส่งจาก LIFF โดยใช้ lineUserId) ─
app.use('/api/tickets', ticketRoutes);

// ── Routes: Public read-only APIs (ไม่ต้อง login) ──────────
app.use('/api/public', publicRoutes);

// ── Routes: Dashboard API (ต้อง login) ─────────────────────
app.use('/api/dashboard', dashboardRoutes);

// ── Routes: LINE Groups Management (ต้อง login + admin) ────
app.use('/api/line-groups', lineGroupRoutes);

// ── Routes: LINE Quota (ต้อง login + superadmin) ─────
app.use('/api/quota', quotaRoutes);

// ── Routes: Audit Log (ต้อง login + superadmin) ─────
app.use('/api/audit', auditRoutes);

// ── Routes: Database Backup (ต้อง login + superadmin) ─────
app.use('/api/backup', backupRoutes);

// ── Routes: Statistics (ต้อง login + admin/executive/superadmin) ─────
app.use('/api/statistics', statisticsRoutes);

// ── Routes: System Settings (GET: all auth, PUT: superadmin) ──
app.use('/api/settings', settingsRoutes);

// ── Routes: Satisfaction (ต้อง login + superadmin/admin) ──
app.use('/api/satisfaction', satisfactionRoutes);

// ── Routes: WSP (สำนักการประปา) ─────────────────────────
app.use('/api/wsp', wspRoutes);

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

  // ── Webhook mode diagnostics ──────────────────────────────
  const webhookMode = (process.env.WEBHOOK_MODE || 'both').toLowerCase();
  const validModes = ['line', 'gateway', 'both'];
  if (!validModes.includes(webhookMode)) {
    console.warn(`⚠️  WEBHOOK_MODE="${webhookMode}" ไม่ถูกต้อง — ใช้ "both" แทน (ค่าที่รองรับ: line | gateway | both)`);
  }
  console.log(`📡 Webhook mode: ${webhookMode}`);
  if (webhookMode === 'line' || webhookMode === 'both') {
    const lineOk = !!process.env.LINE_CHANNEL_SECRET && !!process.env.LINE_ACCESS_TOKEN;
    console.log(`   [LINE direct]  LINE_CHANNEL_SECRET: ${process.env.LINE_CHANNEL_SECRET ? '✅ set' : '❌ NOT SET'} | LINE_ACCESS_TOKEN: ${process.env.LINE_ACCESS_TOKEN ? '✅ set' : '❌ NOT SET'}`);
    if (!lineOk) console.warn('   ⚠️  LINE direct mode เปิดอยู่แต่ขาด env vars — request จะถูก reject ทั้งหมด');
  }
  if (webhookMode === 'gateway' || webhookMode === 'both') {
    const gatewayName = process.env.GATEWAY_NAME || 'line-webhook-gateway';
    console.log(`   [Gateway]      GATEWAY_NAME: ${gatewayName} | GATEWAY_SECRET: ${process.env.GATEWAY_SECRET ? '✅ set' : '❌ NOT SET'}`);
    if (!process.env.GATEWAY_SECRET) console.warn('   ⚠️  Gateway mode เปิดอยู่แต่ขาด GATEWAY_SECRET — request จะถูก reject ทั้งหมด');
  }
});

// ── Scheduled LINE Notifications (node-cron) ───────────────
const cron = require('node-cron');
const { pushGroupWeeklySummary, pushAdminBatchAlert } = require('./src/utils/lineNotify');
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

// 11:30 น. ทุกวัน → แจ้ง admin กลุ่ม: คำร้องที่เข้าช่วง 16:30 เมื่อวาน – 11:30 วันนี้
cron.schedule('30 11 * * *', () => {
  console.log('⏰ Cron: แจ้ง admin batch 11:30');
  const toTime = new Date();
  const fromTime = new Date();
  fromTime.setDate(fromTime.getDate() - 1);
  fromTime.setHours(16, 30, 0, 0);
  pushAdminBatchAlert(fromTime, toTime).catch((e) => console.error('Cron admin-batch 11:30 error:', e.message));
}, { timezone: 'Asia/Bangkok' });

// 16:30 น. ทุกวัน → แจ้ง admin กลุ่ม: คำร้องที่เข้าช่วง 11:30 – 16:30 วันนี้
cron.schedule('30 16 * * *', () => {
  console.log('⏰ Cron: แจ้ง admin batch 16:30');
  const toTime = new Date();
  const fromTime = new Date();
  fromTime.setHours(11, 30, 0, 0);
  pushAdminBatchAlert(fromTime, toTime).catch((e) => console.error('Cron admin-batch 16:30 error:', e.message));
}, { timezone: 'Asia/Bangkok' });

// 17:00 น. ทุกวันศุกร์ → สรุปยอดประจำสัปดาห์ (Flex Message)
cron.schedule('0 17 * * 5', () => {
  console.log('⏰ Cron: สรุปยอดประจำสัปดาห์ (ศุกร์) 17:00');
  runCronForAllActiveGroups(pushGroupWeeklySummary, 'weekly-summary');
}, { timezone: 'Asia/Bangkok' });

console.log('✅ Cron jobs ตั้งค่าแล้ว (06:00 ตรวจโควตา | 11:30/16:30 แจ้ง admin | ศุกร์ 17:00 สรุปสัปดาห์) — ดึงกลุ่มจาก DB อัตโนมัติ');
