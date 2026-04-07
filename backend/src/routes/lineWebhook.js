const express = require('express');
const { middleware, messagingApi } = require('@line/bot-sdk');
const LineGroup = require('../models/LineGroup');

const router = express.Router();

// ── LINE Bot Config ────────────────────────────────────────
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// @line/bot-sdk v11: ใช้ MessagingApiClient
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

// ── Flex Message: ปุ่มเปิด LIFF แจ้งเรื่อง ────────────────
const createComplainFlexMessage = (liffUrl) => ({
  type: 'flex',
  altText: 'กดปุ่มด้านล่างเพื่อแจ้งเรื่องร้องทุกข์',
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '📋 แจ้งเรื่องร้องทุกข์',
          weight: 'bold',
          size: 'xl',
          color: '#ffffff',
        },
        {
          type: 'text',
          text: 'ระบบรับเรื่องร้องทุกข์ออนไลน์',
          size: 'sm',
          color: '#ffffffcc',
          margin: 'sm',
        },
      ],
      backgroundColor: '#1a5f9e',
      paddingAll: '20px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'กรอกแบบฟอร์มแจ้งเรื่องร้องทุกข์ผ่านระบบออนไลน์ได้เลยครับ/ค่ะ',
          wrap: true,
          size: 'sm',
          color: '#555555',
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📌 ข้อมูลที่ต้องกรอก',
              weight: 'bold',
              size: 'sm',
              margin: 'md',
            },
            {
              type: 'text',
              text: '• หัวข้อเรื่อง\n• รายละเอียด\n• หน่วยงานที่เกี่ยวข้อง\n• เบอร์โทรศัพท์ (ไม่บังคับ)\n• รูปภาพประกอบ (ไม่บังคับ)',
              wrap: true,
              size: 'sm',
              color: '#777777',
              margin: 'sm',
            },
          ],
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          action: {
            type: 'uri',
            label: '📝 แจ้งเรื่องร้องทุกข์',
            uri: liffUrl || `https://liff.line.me/${process.env.LIFF_ID}`,
          },
          color: '#1a5f9e',
        },
      ],
      paddingAll: '15px',
    },
  },
});

// ── Flex Message: ตรวจสอบสถานะ ─────────────────────────────
const createCheckStatusFlexMessage = () => ({
  type: 'flex',
  altText: 'ตรวจสอบสถานะเรื่องร้องทุกข์',
  contents: {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '🔍 ตรวจสอบสถานะ',
          weight: 'bold',
          size: 'lg',
        },
        {
          type: 'text',
          text: 'กรุณาพิมพ์เลขที่คำร้อง เช่น RPT-2604-0001 เพื่อตรวจสอบสถานะครับ/ค่ะ',
          wrap: true,
          size: 'sm',
          color: '#555555',
          margin: 'md',
        },
      ],
    },
  },
});

// ── ฟังก์ชันส่ง Welcome Message ─────────────────────────────
const sendWelcomeMessage = async (replyToken, displayName) => {
  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: 'text',
        text: `สวัสดีครับ คุณ${displayName} 👋\nยินดีต้อนรับสู่ระบบรับเรื่องร้องทุกข์\n\nพิมพ์ "แจ้งเรื่อง" เพื่อเปิดฟอร์มแจ้งเรื่อง\nพิมพ์ "ตรวจสอบสถานะ" หรือ เลขที่คำร้อง เพื่อติดตามสถานะครับ`,
      },
    ],
  });
};

// ============================================================
// POST /webhook
// LINE Messaging API Webhook
// ============================================================
router.post('/', middleware(lineConfig), async (req, res) => {
  // ตอบ 200 ทันทีตามที่ LINE กำหนด
  res.status(200).json({ status: 'ok' });

  // ประมวลผล events แบบ async
  const events = req.body.events;
  await Promise.allSettled(events.map(handleEvent));
});

// ── ประมวลผลแต่ละ Event ────────────────────────────────────
const handleEvent = async (event) => {
  try {
    // ── บอทถูก add เข้ากลุ่ม ──────────────────────────────
    if (event.type === 'join' && event.source.type === 'group') {
      const groupId = event.source.groupId;
      let groupName = 'ไม่ทราบชื่อกลุ่ม';
      try {
        const summary = await client.getGroupSummary(groupId);
        groupName = summary.groupName || groupName;
      } catch (_) {}

      await LineGroup.findOneAndUpdate(
        { groupId },
        { groupId, groupName, isActive: true, addedAt: new Date(), leftAt: null },
        { upsert: true, new: true }
      );
      console.log(`[JOIN GROUP] ${groupId} — "${groupName}"`);

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `สวัสดีครับ 👋 ระบบรับเรื่องร้องทุกข์พร้อมใช้งานแล้ว\nพิมพ์ "ร้องเรียน" เพื่อแจ้งเรื่อง\nพิมพ์ "ตามเรื่อง" เพื่อติดตามสถานะครับ` }],
      });
      return;
    }

    // ── บอทถูก kick หรือออกจากกลุ่ม ──────────────────────
    if (event.type === 'leave' && event.source.type === 'group') {
      const groupId = event.source.groupId;
      await LineGroup.findOneAndUpdate(
        { groupId },
        { isActive: false, leftAt: new Date() }
      );
      console.log(`[LEAVE GROUP] ${groupId}`);
      return;
    }

    // กรณีผู้ใช้ add friend (follow event)
    if (event.type === 'follow') {
      const profile = await client.getProfile(event.source.userId);
      await sendWelcomeMessage(event.replyToken, profile.displayName);
      return;
    }

    // รับเฉพาะ message event ประเภท text
    if (event.type !== 'message' || event.message.type !== 'text') return;

    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    // ── คำสั่ง "ร้องเรียน" หรือ "แจ้งเรื่อง" ─────────────
    // ฝัง groupId ใน LIFF URL ผ่าน query string เพื่อให้ ticketRoutes รับได้
    if (text === 'ร้องเรียน' || text === 'แจ้งเรื่อง') {
      const gid = event.source.groupId || '';
      const liffUrl = `https://liff.line.me/${process.env.LIFF_ID}${gid ? '?gid=' + gid : ''}`;
      const flexMsg = createComplainFlexMessage(liffUrl);
      await client.replyMessage({ replyToken, messages: [flexMsg] });
      return;
    }

    // ── คำสั่ง "ตรวจสอบสถานะ" ────────────────────────────
    if (text === 'ตรวจสอบสถานะ' || text === 'เช็คสถานะ') {
      await client.replyMessage({ replyToken, messages: [createCheckStatusFlexMessage()] });
      return;
    }

    // ── คำสั่ง "ตามเรื่อง" ───────────────────────────────
    if (text === 'ตามเรื่อง') {
      const Ticket = require('../models/Ticket');
      const { TICKET_STATUS } = require('../config/constants');
      const userId = event.source.userId;

      console.log(`[ตามเรื่อง] userId=${userId}`);

      // กรณี userId ไม่สามารถระบุได้ (เช่น privacy settings ของกลุ่ม)
      if (!userId) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: 'ไม่สามารถตรวจสอบได้ เนื่องจากไม่สามารถระบุตัวตนของคุณได้\nกรุณาส่งข้อความผ่านแชทส่วนตัวกับบอทครับ 🙏' }],
        });
        return;
      }

      const openTickets = await Ticket.find(
        {
          lineUserId: userId,
          status: { $nin: [TICKET_STATUS.COMPLETED, TICKET_STATUS.REJECTED] },
        },
        'ticketNo subject status createdAt'
      ).sort({ createdAt: -1 }).limit(10);

      console.log(`[ตามเรื่อง] พบ ${openTickets.length} รายการ`);

      if (!openTickets.length) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: 'ไม่มีเรื่องที่ค้างดำเนินการอยู่ครับ ✅' }],
        });
        return;
      }

      // สร้าง Flex Bubble การ์ดเดียว แสดง list รายการทั้งหมด
      // แต่ละแถวกดได้เพื่อส่งเลขที่คำร้อง
      const rowItems = openTickets.flatMap((t, i) => {
        const statusColor = {
          'รอรับเรื่อง':          '#e67e22',
          'ระหว่างดำเนินการ':     '#2980b9',
          'ส่งต่อ':               '#8e44ad',
        }[t.status] || '#888888';

        const row = {
          type: 'box',
          layout: 'vertical',
          paddingAll: '10px',
          backgroundColor: i % 2 === 0 ? '#f8fafc' : '#ffffff',
          action: { type: 'message', label: t.ticketNo, text: t.ticketNo },
          contents: [
            {
              type: 'box', layout: 'horizontal',
              contents: [
                { type: 'text', text: t.ticketNo, size: 'xs', color: '#1a5f9e', weight: 'bold', flex: 4 },
                { type: 'text', text: t.status, size: 'xs', color: statusColor, flex: 3, align: 'end' },
              ],
            },
            { type: 'text', text: t.subject || '-', size: 'sm', wrap: true, margin: 'xs', color: '#333333' },
            { type: 'text', text: `🗓 ${new Date(t.createdAt).toLocaleDateString('th-TH')}`, size: 'xs', color: '#aaaaaa', margin: 'xs' },
          ],
        };
        // เส้นคั่นระหว่างแถว (ยกเว้นแถวแรก)
        return i === 0 ? [row] : [{ type: 'separator' }, row];
      });

      const singleBubble = {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          backgroundColor: '#1a5f9e', paddingAll: '16px',
          contents: [
            { type: 'text', text: '📋 เรื่องที่ค้างดำเนินการ', weight: 'bold', color: '#ffffff', size: 'md' },
            { type: 'text', text: `${openTickets.length} รายการ — กดเพื่อดูรายละเอียด`, size: 'xs', color: '#ffffffcc', margin: 'xs' },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '0px',
          contents: rowItems,
        },
      };

      const groupId = event.source.groupId;

      if (groupId) {
        // ── พิมพ์จากกลุ่ม: push ไปไลน์ส่วนตัว + reply ในกลุ่ม ──
        // ดึงชื่อผู้ใช้จากโปรไฟล์กลุ่ม
        let displayName = 'คุณ';
        try {
          const profile = await client.getGroupMemberProfile(groupId, userId);
          displayName = profile.displayName || 'คุณ';
        } catch (_) { /* ถ้าดึงไม่ได้ใช้ค่า default */ }

        // push รายการไปไลน์ส่วนตัว
        await client.pushMessage({
          to: userId,
          messages: [{
            type: 'flex',
            altText: `เรื่องที่ค้างดำเนินการ ${openTickets.length} รายการ`,
            contents: singleBubble,
          }],
        });

        // reply ในกลุ่มแจ้งว่าส่งให้แล้ว
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: `สวัสดีคุณ ${displayName} 👋\nได้ส่งรายการเรื่องที่ค้างดำเนินการให้ในไลน์ส่วนตัวแล้วครับ 📩` }],
        });
      } else {
        // ── พิมพ์จากแชทส่วนตัว: reply ปกติ ──
        await client.replyMessage({
          replyToken,
          messages: [{
            type: 'flex',
            altText: `เรื่องที่ค้างดำเนินการ ${openTickets.length} รายการ`,
            contents: singleBubble,
          }],
        });
      }
      return;
    }

    // ── ตรวจสอบสถานะด้วยเลขที่คำร้อง RPT-XXXX-XXXX ──────
    if (/^RPT-\d{4}-\d{4}$/i.test(text)) {
      const ticketNo = text.toUpperCase();

      // เรียกข้อมูลจาก API ภายใน
      const Ticket = require('../models/Ticket');
      const ticket = await Ticket.findOne(
        { ticketNo },
        'ticketNo subject status assignedDepartment createdAt'
      );

      if (!ticket) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: `ไม่พบเลขที่คำร้อง ${ticketNo} ในระบบครับ` }],
        });
        return;
      }

      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: 'text',
            text:
              `📋 เลขที่คำร้อง: ${ticket.ticketNo}\n` +
              `📌 หัวข้อ: ${ticket.subject}\n` +
              `🏢 หน่วยงาน: ${ticket.assignedDepartment}\n` +
              `📊 สถานะ: ${ticket.status}\n` +
              `🗓️ วันที่แจ้ง: ${new Date(ticket.createdAt).toLocaleDateString('th-TH')}`,
          },
        ],
      });
      return;
    }

    // ── ข้อความอื่นๆ ไม่ตอบสนอง ──────────────────────────
    // (ตอบเฉพาะคำว่า "ร้องเรียน", "ตามเรื่อง" และเลขที่คำร้อง RPT-XXXX-XXXX เท่านั้น)
  } catch (err) {
    // LINE Bot SDK v11 ใช้ err.body (string) สำหรับ HTTP error
    console.error('LINE event handler error:', err.message, err.body || '');
  }
};

module.exports = router;
