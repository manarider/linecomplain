const { messagingApi } = require('@line/bot-sdk');
const { TICKET_STATUS } = require('../config/constants');

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

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
  const domain = (process.env.DOMAIN || '').replace(/\/$/, '');

  const isCompleted = ticket.status === TICKET_STATUS.COMPLETED;
  const completionImages = isCompleted && ticket.completionImages?.length > 0
    ? ticket.completionImages : [];

  const bodyContents = [
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
    ...(completionImages.length > 0 ? [{
      type: 'box', layout: 'horizontal',
      contents: [
        { type: 'text', text: 'รูปผลงาน', size: 'sm', color: '#888888', flex: 2 },
        {
          type: 'text',
          text: `📎 ${completionImages.length} รูป (ดูด้านล่าง)`,
          size: 'sm', flex: 3, color: '#16a34a', weight: 'bold',
        },
      ],
      margin: 'sm',
    }] : []),
  ];

  // footer: ปุ่มดูรูปแรก (กรณีมีรูปเดียว) หรือลิงก์ตรวจสอบสถานะ
  const footerContents = completionImages.length === 1
    ? [{
        type: 'button', style: 'primary', height: 'sm',
        color: '#1a5f9e',
        action: {
          type: 'uri',
          label: '🖼️ ดูรูปผลการดำเนินงาน',
          uri: `${domain}/uploads/${completionImages[0]}`,
        },
      }]
    : completionImages.length > 1
    ? [...completionImages.slice(0, 3).map((img, i) => ({
        type: 'button', style: 'secondary', height: 'sm',
        action: {
          type: 'uri',
          label: `🖼️ ดูรูปที่ ${i + 1}`,
          uri: `${domain}/uploads/${img}`,
        },
      }))]
    : null;

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
        contents: bodyContents,
        paddingAll: '16px',
      },
      ...(footerContents ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: footerContents,
          spacing: 'sm',
          paddingAll: '12px',
        },
      } : {}),
    },
  };

  // รวม messages: Flex bubble + image messages (ถ้ามี completionImages)
  const messages = [message];
  for (const img of completionImages.slice(0, 3)) {
    const imgUrl = `${domain}/uploads/${img}`;
    messages.push({
      type: 'image',
      originalContentUrl: imgUrl,
      previewImageUrl: imgUrl,
    });
  }

  await lineClient.pushMessage({
    to: ticket.lineUserId,
    messages,   // LINE รองรับสูงสุด 5 messages ต่อ push → Flex + 3 รูป = 4 ✅
  });
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
};

// ============================================================
// pushGroupEODSummary — สรุปยอด + งานค้าง 17:00 น. (Flex Message)
// ============================================================
const pushGroupEODSummary = async (groupId) => {
  const Ticket = require('../models/Ticket');
  const { TICKET_STATUS } = require('../config/constants');

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [newToday, completedToday, inProgressToday, oldPending, pendingToday, pendingList] = await Promise.all([
    Ticket.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
    Ticket.countDocuments({ status: TICKET_STATUS.COMPLETED, updatedAt: { $gte: todayStart } }),
    Ticket.countDocuments({ status: TICKET_STATUS.IN_PROGRESS }),
    Ticket.countDocuments({ status: TICKET_STATUS.PENDING, createdAt: { $lt: todayStart } }),
    Ticket.countDocuments({ status: TICKET_STATUS.PENDING, createdAt: { $gte: todayStart } }),
    Ticket.find(
      { status: TICKET_STATUS.PENDING },
      'ticketNo subject assignedDepartment createdAt'
    ).sort({ createdAt: 1 }).limit(10),
  ]);

  const totalPending = oldPending + pendingToday;

  const nowStr = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const statRow = (emoji, label, value, color = '#374151') => ({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: `${emoji} ${label}`, size: 'sm', color: '#6b7280', flex: 3 },
      { type: 'text', text: `${value} เรื่อง`, size: 'sm', weight: 'bold', color, flex: 2, align: 'end' },
    ],
  });

  const pendingContents = totalPending === 0
    ? [{ type: 'text', text: '✅ ไม่มีงานค้างรอรับเรื่อง', size: 'sm', color: '#16a34a' }]
    : pendingList.map((t, i) => ({
        type: 'box', layout: 'vertical', margin: 'sm',
        contents: [
          { type: 'text', text: `${i + 1}. ${t.ticketNo}`, size: 'xs', weight: 'bold', color: '#1a5f9e' },
          { type: 'text', text: t.subject, size: 'xs', color: '#374151', wrap: true },
          { type: 'text', text: `📂 ${t.assignedDepartment} · ${new Date(t.createdAt).toLocaleDateString('th-TH')}`, size: 'xs', color: '#9ca3af' },
        ],
      }));

  const message = {
    type: 'flex',
    altText: `📊 สรุปประจำวัน ${nowStr} | งานค้าง ${totalPending} เรื่อง`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '📊 สรุปประจำวัน', weight: 'bold', color: '#ffffff', size: 'md' },
          { type: 'text', text: nowStr, color: '#ffffffcc', size: 'xs' },
        ],
        backgroundColor: '#1a5f9e', paddingAll: '16px',
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'สถิติวันนี้', weight: 'bold', size: 'sm', color: '#1a5f9e' },
          { type: 'separator', margin: 'sm' },
          statRow('📥', 'เรื่องใหม่วันนี้', newToday),
          statRow('✅', 'เสร็จสิ้นวันนี้', completedToday, '#16a34a'),
          statRow('🔧', 'กำลังดำเนินการ', inProgressToday, '#2563eb'),
          {
            type: 'text',
            text: `⚠️ งานค้างรอรับเรื่อง (${totalPending} รายการ)`,
            weight: 'bold', size: 'sm',
            color: totalPending > 0 ? '#dc2626' : '#16a34a',
            margin: 'md',
          },
          { type: 'separator', margin: 'sm' },
          ...pendingContents,
        ],
      },
    },
  };

  await lineClient.pushMessage({ to: groupId, messages: [message] });
};

module.exports = { pushStatusUpdate, pushTicketConfirm, pushGroupEODSummary };
