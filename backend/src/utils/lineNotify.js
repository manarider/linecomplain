const { messagingApi } = require('@line/bot-sdk');
const { TICKET_STATUS } = require('../config/constants');
const Ticket = require('../models/Ticket');

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

const getSystemUrl = () => {
  const domain = (process.env.DOMAIN || '').replace(/\/$/, '');
  return domain ? `${domain}/dashboard` : '';
};

const formatTicketDateTime = (date) => {
  const ticketDate = date ? new Date(date) : new Date();
  return {
    date: ticketDate.toLocaleDateString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    time: ticketDate.toLocaleTimeString('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit', minute: '2-digit',
    }),
  };
};

// ============================================================
// pushAdminNewTicketAlert — แจ้งเตือนกลุ่ม LINE admin เมื่อมีคำร้องใหม่
// ============================================================
const pushAdminNewTicketAlert = async (ticket) => {
  const adminGroupId = process.env.LINE_ADMIN_ID;
  if (!adminGroupId || !adminGroupId.startsWith('C')) return;

  const systemUrl = getSystemUrl();
  const { date, time } = formatTicketDateTime(ticket.createdAt);

  const footerContents = systemUrl
    ? [{
        type: 'button',
        style: 'primary',
        height: 'sm',
        color: '#1a5f9e',
        action: {
          type: 'uri',
          label: 'เปิดระบบหลังบ้าน',
          uri: systemUrl,
        },
      }]
    : [];

  const message = {
    type: 'flex',
    altText: `มีคำร้องใหม่ ${ticket.ticketNo}: ${ticket.subject}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📥 คำร้องใหม่', weight: 'bold', color: '#ffffff', size: 'md' },
          { type: 'text', text: ticket.ticketNo, color: '#ffffffcc', size: 'xs', margin: 'xs' },
        ],
        backgroundColor: '#d97706',
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: ticket.subject, weight: 'bold', size: 'xl', color: '#111827', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'box', layout: 'horizontal', margin: 'md', contents: [
            { type: 'text', text: 'วันที่', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: date, size: 'sm', color: '#111827', flex: 4, wrap: true },
          ]},
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: 'เวลา', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: `${time} น.`, size: 'sm', color: '#111827', flex: 4, weight: 'bold' },
          ]},
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: 'หน่วยงาน', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: ticket.assignedDepartment || '-', size: 'sm', color: '#111827', flex: 4, wrap: true },
          ]},
        ],
      },
      ...(footerContents.length ? {
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: footerContents,
          paddingAll: '12px',
        },
      } : {}),
    },
  };

  await lineClient.pushMessage({ to: adminGroupId, messages: [message] });
};

/**
 * ส่ง Push Message แจ้งเตือนผู้แจ้งเรื่องเมื่อสถานะอัปเดต
 * @param {object} ticket - Ticket document จาก MongoDB
 * @param {string} note - หมายเหตุจากเจ้าหน้าที่ (optional)
 */
const pushStatusUpdate = async (ticket, note = '', options = {}) => {
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

  const additionalInfoButton = options.additionalInfoUrl
    ? [{
        type: 'button', style: 'primary', height: 'sm',
        color: '#7c3aed',
        action: {
          type: 'uri',
          label: 'กรอกข้อมูลเพิ่มเติม',
          uri: options.additionalInfoUrl,
        },
      }]
    : [];

  // footer: ปุ่มข้อมูลเพิ่มเติม, ปุ่มดูรูปแรก (กรณีมีรูปเดียว) หรือลิงก์ตรวจสอบสถานะ
  const imageFooterContents = completionImages.length === 1
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
    : [];

  const footerContents = [...additionalInfoButton, ...imageFooterContents];

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
      ...(footerContents.length ? {
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

  // แจ้งส่วนตัวเสมอ (ยกเลิกการส่งในกลุ่มแล้ว)
  await lineClient.pushMessage({ to: ticket.lineUserId, messages: [confirmMsg] });
};

// ============================================================
// pushGroupWeeklySummary — สรุปยอดประจำสัปดาห์ ทุกวันศุกร์ 17:00 น.
// ============================================================
const pushGroupWeeklySummary = async (groupId) => {
  const now = new Date();

  // ช่วงสัปดาห์นี้: จันทร์ 00:00 → ศุกร์ 23:59
  const dayOfWeek = now.getDay(); // 0=อา, 1=จ, ..., 5=ศ
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);

  const [newThisWeek, completedThisWeek, inProgress, pending, forwarded] = await Promise.all([
    Ticket.countDocuments({ createdAt: { $gte: weekStart, $lte: weekEnd } }),
    Ticket.countDocuments({ status: TICKET_STATUS.COMPLETED, updatedAt: { $gte: weekStart, $lte: weekEnd } }),
    Ticket.countDocuments({ status: TICKET_STATUS.IN_PROGRESS }),
    Ticket.countDocuments({ status: TICKET_STATUS.PENDING }),
    Ticket.countDocuments({ status: TICKET_STATUS.FORWARDED }),
  ]);

  const weekStartStr = weekStart.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short',
  });
  const nowStr = now.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric',
  });

  const statRow = (emoji, label, value, color = '#374151') => ({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: `${emoji} ${label}`, size: 'sm', color: '#6b7280', flex: 3 },
      { type: 'text', text: `${value} เรื่อง`, size: 'sm', weight: 'bold', color, flex: 2, align: 'end' },
    ],
  });

  const message = {
    type: 'flex',
    altText: `📊 สรุปประจำสัปดาห์ ${weekStartStr} – ${nowStr}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '📊 สรุปประจำสัปดาห์', weight: 'bold', color: '#ffffff', size: 'md' },
          { type: 'text', text: `${weekStartStr} – ${nowStr}`, color: '#ffffffcc', size: 'xs' },
        ],
        backgroundColor: '#1a5f9e', paddingAll: '16px',
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'text', text: 'สถิติสัปดาห์นี้', weight: 'bold', size: 'sm', color: '#1a5f9e' },
          { type: 'separator', margin: 'sm' },
          statRow('📥', 'เรื่องใหม่สัปดาห์นี้', newThisWeek),
          statRow('✅', 'เสร็จสิ้นสัปดาห์นี้', completedThisWeek, '#16a34a'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'สถานะคงค้าง ณ ปัจจุบัน', weight: 'bold', size: 'sm', color: '#1a5f9e', margin: 'md' },
          { type: 'separator', margin: 'sm' },
          statRow('⏳', 'รอรับเรื่อง', pending, '#d97706'),
          statRow('🔧', 'กำลังดำเนินการ', inProgress, '#2563eb'),
          statRow('📨', 'ส่งต่อหน่วยงาน', forwarded, '#7c3aed'),
        ],
      },
    },
  };

  await lineClient.pushMessage({ to: groupId, messages: [message] });
};

// ============================================================
// pushAdminBatchAlert — แจ้งกลุ่ม admin แบบรวมยอด วันละ 2 ครั้ง
// fromTime, toTime: Date object ของช่วงเวลาที่ query
// ============================================================
const pushAdminBatchAlert = async (fromTime, toTime) => {
  const adminGroupId = process.env.LINE_ADMIN_ID;
  if (!adminGroupId || !adminGroupId.startsWith('C')) return;

  const tickets = await Ticket.find(
    { createdAt: { $gte: fromTime, $lte: toTime } },
    'ticketNo subject assignedDepartment createdAt groupId'
  ).sort({ createdAt: 1 }).lean();

  if (!tickets.length) {
    console.log(`[Admin Batch] ไม่มีคำร้องใหม่ช่วง ${fromTime.toLocaleTimeString('th-TH')} – ${toTime.toLocaleTimeString('th-TH')}`);
    return;
  }

  const systemUrl = getSystemUrl();
  const rangeStr = `${fromTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} – ${toTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} น.`;
  const dateStr = toTime.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'long', day: 'numeric' });

  const rowItems = tickets.flatMap((t, i) => {
    const { time } = formatTicketDateTime(t.createdAt);
    const row = {
      type: 'box', layout: 'vertical', paddingAll: '8px',
      backgroundColor: i % 2 === 0 ? '#f8fafc' : '#ffffff',
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: t.ticketNo, size: 'xs', color: '#1a5f9e', weight: 'bold', flex: 4 },
            { type: 'text', text: `${time} น.`, size: 'xs', color: '#888888', flex: 3, align: 'end' },
          ],
        },
        { type: 'text', text: t.subject, size: 'sm', wrap: true, margin: 'xs', color: '#111827' },
        { type: 'text', text: t.assignedDepartment || '-', size: 'xs', color: '#6b7280', margin: 'xs' },
      ],
    };
    return i === 0 ? [row] : [{ type: 'separator' }, row];
  });

  const footerContents = systemUrl
    ? [{ type: 'button', style: 'primary', height: 'sm', color: '#1a5f9e',
        action: { type: 'uri', label: 'เปิดระบบหลังบ้าน', uri: systemUrl } }]
    : [];

  const message = {
    type: 'flex',
    altText: `📥 คำร้องใหม่ ${tickets.length} เรื่อง (${rangeStr})`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: `📥 คำร้องใหม่ ${tickets.length} เรื่อง`, weight: 'bold', color: '#ffffff', size: 'md' },
          { type: 'text', text: `${dateStr} | ${rangeStr}`, color: '#ffffffcc', size: 'xs', margin: 'xs' },
        ],
        backgroundColor: '#d97706', paddingAll: '16px',
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '0px',
        contents: rowItems,
      },
      ...(footerContents.length ? {
        footer: { type: 'box', layout: 'vertical', contents: footerContents, paddingAll: '12px' },
      } : {}),
    },
  };

  await lineClient.pushMessage({ to: adminGroupId, messages: [message] });
  console.log(`[Admin Batch] ส่งแจ้งกลุ่ม admin: ${tickets.length} เรื่อง (${rangeStr})`);
};

module.exports = { pushStatusUpdate, pushTicketConfirm, pushAdminBatchAlert, pushGroupWeeklySummary };
