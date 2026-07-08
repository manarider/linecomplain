const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// พาธรูป QR สำหรับเพิ่มเพื่อน LINE OA
const LINE_QR_PATH = path.join(__dirname, '../../uploads/Line/LineQR.png');

// ============================================================
// ตั้งค่า SMTP transporter จาก environment variables
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false),
//   SMTP_USER, SMTP_PASS, SMTP_FROM (ชื่อผู้ส่ง)
// ถ้าไม่ได้ตั้งค่า → ระบบจะข้ามการส่งอีเมล (ไม่ error)
// ============================================================
let transporter = null;
let warnedOnce = false;

const isConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_PORT);

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE) === 'true', // true = 465, false = 587/25
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
};

const getFrom = () => {
  const name = process.env.SMTP_FROM_NAME || 'ระบบรับเรื่องร้องทุกข์ สำนักการประปา';
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  return `${name} <${addr}>`;
};

const getSystemUrl = () => {
  const domain = (process.env.DOMAIN || '').replace(/\/$/, '');
  return domain ? `${domain}/dashboard` : '';
};

const formatDateTime = (date) => {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ส่งอีเมลทั่วไป — คืน true/false ไม่ throw
const sendMail = async ({ to, subject, html, text, attachments }) => {
  const tx = getTransporter();
  if (!tx) {
    if (!warnedOnce) {
      console.warn('✉️  SMTP ยังไม่ได้ตั้งค่า (SMTP_HOST/SMTP_PORT) — ข้ามการส่งอีเมล');
      warnedOnce = true;
    }
    return false;
  }
  if (!to) return false;

  try {
    await tx.sendMail({ from: getFrom(), to, subject, html, text, attachments });
    console.log(`✉️  ส่งอีเมลสำเร็จ → ${to} (${subject})`);
    return true;
  } catch (err) {
    console.error(`✉️  ส่งอีเมลล้มเหลว → ${to}:`, err.message);
    return false;
  }
};

// ============================================================
// อีเมลยืนยันรับคำร้องใหม่ (สำนักการประปา)
// ============================================================
const sendWspTicketCreatedEmail = async (ticket) => {
  if (!ticket || !ticket.email) return false;

  const systemUrl = getSystemUrl();
  const refNo = ticket.ticketNo || ticket.wspId || '-';
  const hasQr = fs.existsSync(LINE_QR_PATH);
  const qrBlock = hasQr ? `
        <div style="margin-top: 20px; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; text-align: center;">
          <p style="margin: 0 0 8px; font-weight: bold; color: #166534;">📲 เพิ่มเพื่อน LINE เพื่อรับแจ้งเตือนความคืบหน้า</p>
          <img src="cid:lineqr" alt="LINE QR" style="width: 180px; height: 180px; border-radius: 8px;" />
          <p style="margin: 8px 0 0; color: #64748b; font-size: 12px;">สแกน QR นี้ด้วยแอป LINE เพื่อเพิ่มบัญชีทางการเป็นเพื่อน</p>
        </div>` : '';

  const html = `
    <div style="font-family: 'Tahoma', sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: #1a5f9e; color: #fff; padding: 18px 24px;">
        <h2 style="margin: 0; font-size: 18px;">💧 สำนักการประปา — รับคำร้องของท่านแล้ว</h2>
      </div>
      <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.7;">
        <p>เรียน คุณ${ticket.displayName || 'ผู้ร้อง'}</p>
        <p>ระบบได้รับคำร้องของท่านเรียบร้อยแล้ว รายละเอียดดังนี้</p>
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0;">
          <tr><td style="padding: 6px 0; color: #64748b; width: 130px;">เลขที่คำร้อง</td><td style="padding: 6px 0; font-weight: bold;">${refNo}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">หัวเรื่อง</td><td style="padding: 6px 0;">${ticket.subject || '-'}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">รายละเอียด</td><td style="padding: 6px 0;">${ticket.description || '-'}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">สถานะ</td><td style="padding: 6px 0;">🔧 ระหว่างดำเนินการ</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">วันที่รับเรื่อง</td><td style="padding: 6px 0;">${formatDateTime(ticket.createdAt)}</td></tr>
        </table>
        <p style="color: #64748b;">เจ้าหน้าที่จะดำเนินการและแจ้งความคืบหน้าให้ท่านทราบต่อไป</p>
        ${qrBlock}
      </div>
      <div style="background: #f8fafc; padding: 14px 24px; color: #94a3b8; font-size: 12px;">
        อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ${systemUrl ? ` · <a href="${systemUrl}" style="color:#1a5f9e;">ระบบจัดการคำร้อง</a>` : ''}
      </div>
    </div>`;

  const text = `สำนักการประปา — รับคำร้องของท่านแล้ว
เลขที่คำร้อง: ${refNo}
หัวเรื่อง: ${ticket.subject || '-'}
สถานะ: ระหว่างดำเนินการ
วันที่รับเรื่อง: ${formatDateTime(ticket.createdAt)}

เพิ่มเพื่อน LINE เพื่อรับแจ้งเตือน: สแกน QR ที่แนบมาในอีเมลนี้`;

  const attachments = hasQr
    ? [{ filename: 'LineQR.png', path: LINE_QR_PATH, cid: 'lineqr' }]
    : [];

  return sendMail({
    to: ticket.email,
    subject: `[สำนักการประปา] รับคำร้อง ${refNo} เรียบร้อยแล้ว`,
    html,
    text,
    attachments,
  });
};

module.exports = {
  sendMail,
  sendWspTicketCreatedEmail,
  isConfigured,
};
