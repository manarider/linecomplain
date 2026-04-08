const { messagingApi } = require('@line/bot-sdk');
const { TICKET_STATUS } = require('../config/constants');

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

// ── ตรวจโควตาหลังส่งข้อความ (non-blocking) ───────────────
// import แบบ lazy เพื่อหลีกเลี่ยง circular dependency
const triggerQuotaCheck = () => {
  setImmediate(() => {
    const { checkLineQuota } = require('./lineQuota');
    checkLineQuota().catch((e) => console.error('[LINE Quota hook] error:', e.message));
  });
};

// สถานะที่แสดงเป็นภาษาไทยพร้อม emoji
const STATUS_LABEL = {
  [TICKET_STATUS.PENDING]: '⏳ รอรับเรื่อง',
  [TICKET_STATUS.IN_PROGRESS]: '🔧 ระหว่างดำเนินการ',
  [TICKET_STATUS.COMPLETED]: '✅ เสร็จสิ้น',
  [TICKET_STATUS.FORWARDED]: '📨 ส่งต่อหน่วยงาน',
  [TICKET_STATUS.REJECTED]: '❌ ไม่รับเรื่อง',
};

/**
 * ส่ง Push Message แจ้งเตือนผู้แจ้งเรื่องเมื่อสถานะอัปเดต
 * @param {object} ticket - Ticket document จาก MongoDB
 * @param {string} note - หมายเหตุจากเจ้าหน้าที่ (optional)
 */
const pushStatusUpdate = async (ticket, note = '') => {
  if (!ticket.lineUserId) return;

  const statusLabel = STATUS_LABEL[ticket.status] || ticket.status;

  const message = {
    type: 'flex',
    altText: `อัปเดตสถานะเรื่องร้องทุกข์ ${ticket.ticketNo}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📋 อัปเดตสถานะคำร้อง', weight: 'bold', color: '#ffffff', size: 'md' },
        ],
        backgroundColor: '#1a5f9e',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: 'เลขที่คำร้อง', size: 'sm', color: '#888888', flex: 2 },
              { type: 'text', text: ticket.ticketNo, size: 'sm', weight: 'bold', flex: 3 },
            ],
            margin: 'sm',
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: 'หัวข้อ', size: 'sm', color: '#888888', flex: 2 },
              { type: 'text', text: ticket.subject, size: 'sm', flex: 3, wrap: true },
            ],
            margin: 'sm',
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: 'สถานะใหม่', size: 'sm', color: '#888888', flex: 2 },
              { type: 'text', text: statusLabel, size: 'sm', weight: 'bold', color: '#1a5f9e', flex: 3 },
            ],
            margin: 'sm',
          },
          ...(note ? [{
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: 'หมายเหตุ', size: 'sm', color: '#888888', flex: 2 },
              { type: 'text', text: note, size: 'sm', flex: 3, wrap: true },
            ],
            margin: 'sm',
          }] : []),
        ],
        paddingAll: '16px',
      },
    },
  };

  await lineClient.pushMessage({
    to: ticket.lineUserId,
    messages: [message],
  });

  // -- ตรวจโควตาหลังส่งข้อความ (บันทึกลง DB พื้นหลัง) --
  triggerQuotaCheck();
};

// ============================================================
// pushTicketConfirm — แจ้งยืนยันรับเรื่องใหม่
// ถ้ามี groupId → แจ้งทั้งกลุ่มและส่วนตัว
// ============================================================
const pushTicketConfirm = async (ticket, groupId = null) => {
  if (!ticket.lineUserId) return;

  const now = new Date();
  const dateStr = now.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const confirmMsg = {
    type: 'flex',
    altText: `ได้รับคำร้อง ${ticket.ticketNo} แล้ว`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'text', text: '✅ ได้รับคำร้องของคุณแล้ว', weight: 'bold', color: '#ffffff', size: 'md' }],
        backgroundColor: '#27ae60', paddingAll: '16px',
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: 'ชื่อ', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: ticket.displayName || '-', size: 'sm', flex: 3, wrap: true },
          ]},
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: 'เรื่อง', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: ticket.subject, size: 'sm', flex: 3, wrap: true, weight: 'bold' },
          ]},
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: 'เลขที่คำร้อง', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: ticket.ticketNo, size: 'sm', flex: 3, weight: 'bold', color: '#1a5f9e' },
          ]},
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: 'วันที่', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: dateStr, size: 'sm', flex: 3, wrap: true },
          ]},
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'พิมพ์ "ตามเรื่อง" เพื่อตรวจสอบสถานะครับ', size: 'xs', color: '#aaaaaa', margin: 'md', wrap: true },
        ],
      },
    },
  };

  // แจ้งส่วนตัวเสมอ
  await lineClient.pushMessage({ to: ticket.lineUserId, messages: [confirmMsg] });

  // ถ้ามี groupId → แจ้งในกลุ่มด้วย Flex Message เดียวกัน
  const targetGroup = groupId || ticket.groupId;
  if (targetGroup && targetGroup.startsWith('C')) {
    await lineClient.pushMessage({ to: targetGroup, messages: [confirmMsg] });
  }

  // -- ตรวจโควตาหลังส่งข้อความ (บันทึกลง DB พื้นหลัง) --
  triggerQuotaCheck();
};

// ============================================================
// pushGroupPending — แจ้งเตือนงานค้าง 16:30 น.
// ============================================================
const pushGroupPending = async (groupId) => {
  const Ticket = require('../models/Ticket');
  const { TICKET_STATUS } = require('../config/constants');

  const pending = await Ticket.find(
    { status: TICKET_STATUS.PENDING },
    'ticketNo subject createdAt assignedDepartment'
  ).sort({ createdAt: 1 }).limit(20);

  if (!pending.length) {
    await lineClient.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text: '✅ ไม่มีงานค้างที่รอรับเรื่องครับ' }],
    });
    return;
  }

  const list = pending.map((t, i) =>
    `${i + 1}. [${t.ticketNo}] ${t.subject}\n   📂 ${t.assignedDepartment} · ${new Date(t.createdAt).toLocaleDateString('th-TH')}`
  ).join('\n\n');

  await lineClient.pushMessage({
    to: groupId,
    messages: [{
      type: 'text',
      text: `⚠️ งานค้าง: รอรับเรื่อง ${pending.length} รายการ\n\n${list}`,
    }],
  });
};

// ============================================================
// pushGroupDailySummary — สรุปยอดประจำวัน 17:00 น.
// ============================================================
const pushGroupDailySummary = async (groupId) => {
  const Ticket = require('../models/Ticket');
  const { TICKET_STATUS } = require('../config/constants');

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [newToday, completedToday, inProgressToday, oldPending, pendingToday] = await Promise.all([
    Ticket.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
    Ticket.countDocuments({ status: TICKET_STATUS.COMPLETED, updatedAt: { $gte: todayStart } }),
    Ticket.countDocuments({ status: TICKET_STATUS.IN_PROGRESS }),
    Ticket.countDocuments({ status: TICKET_STATUS.PENDING, createdAt: { $lt: todayStart } }),
    Ticket.countDocuments({ status: TICKET_STATUS.PENDING, createdAt: { $gte: todayStart } }),
  ]);

  const nowStr = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: 'long', day: 'numeric',
  });

  await lineClient.pushMessage({
    to: groupId,
    messages: [{
      type: 'text',
      text:
        `📊 สรุปประจำวัน ${nowStr}\n` +
        `${'─'.repeat(28)}\n` +
        `📥 เรื่องใหม่วันนี้       : ${newToday} เรื่อง\n` +
        `⏳ ค้างเก่า (ก่อนวันนี้)  : ${oldPending} เรื่อง\n` +
        `🔴 ค้างวันนี้             : ${pendingToday} เรื่อง\n` +
        `🔧 กำลังดำเนินการ        : ${inProgressToday} เรื่อง\n` +
        `✅ เสร็จสิ้นวันนี้        : ${completedToday} เรื่อง`,
    }],
  });
};

module.exports = { pushStatusUpdate, pushTicketConfirm, pushGroupPending, pushGroupDailySummary };
