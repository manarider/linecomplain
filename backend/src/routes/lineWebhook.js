const express = require('express');
const crypto = require('crypto');
const { messagingApi } = require('@line/bot-sdk');
const LineGroup = require('../models/LineGroup');
const Ticket = require('../models/Ticket');
const Counter = require('../models/Counter');
const { TICKET_STATUS } = require('../config/constants');
const { createComplaintEntryFlexMessage } = require('../utils/lineNotify');

const router = express.Router();
const groupMemberCountCache = new Map();
const GROUP_MEMBER_COUNT_TTL_MS = 10 * 60 * 1000;

// ── Idempotency: dedup events ด้วย webhookEventId (TTL 5 นาที) ────────────
const processedEventIds = new Map();
const EVENT_DEDUP_TTL_MS = 5 * 60 * 1000;

const isDuplicateEvent = (eventId) => {
  if (!eventId) return false;
  const now = Date.now();
  // ล้าง entry เก่าที่หมดอายุ
  for (const [id, ts] of processedEventIds) {
    if (now - ts > EVENT_DEDUP_TTL_MS) processedEventIds.delete(id);
  }
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.set(eventId, now);
  return false;
};

// @line/bot-sdk v11: ใช้ MessagingApiClient
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

const safeCompareBase64 = (actual, expected) => {
  const actualBuffer = Buffer.from(actual || '');
  const expectedBuffer = Buffer.from(expected || '');

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const verifyLineSignature = (rawBody, signature) => {
  if (!process.env.LINE_CHANNEL_SECRET || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('SHA256', process.env.LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest('base64');

  return safeCompareBase64(signature, expected);
};

const verifyGatewaySignature = (rawBody, signature, timestamp, gatewayName) => {
  if (!process.env.GATEWAY_SECRET || !signature || !timestamp) {
    return false;
  }

  const expectedName = process.env.GATEWAY_NAME || 'line-webhook-gateway';
  if (gatewayName !== expectedName) {
    return false;
  }

  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime)) {
    return false;
  }

  const fiveMinutesMs = 5 * 60 * 1000;
  if (Math.abs(Date.now() - requestTime) > fiveMinutesMs) {
    return false;
  }

  const expected = crypto
    .createHmac('SHA256', process.env.GATEWAY_SECRET)
    .update(rawBody)
    .digest('base64');

  return safeCompareBase64(signature, expected);
};

const normalizeWebhookEvents = (body, fromGateway) => {
  if (fromGateway) {
    if (Array.isArray(body?.events)) return body.events;
    return body && body.type ? [body] : [];
  }

  return Array.isArray(body.events) ? body.events : [];
};

const updateGroupMemberCountInBackground = (groupId) => {
  if (!groupId) return;

  updateGroupMemberCount(groupId).catch((err) => {
    console.error(`[updateGroupMemberCount] Background error for ${groupId}:`, err.message);
  });
};

const getPushTargetFromEvent = (event) => {
  if (event.source?.type === 'group') return event.source.groupId;
  if (event.source?.type === 'room') return event.source.roomId;
  return event.source?.userId || '';
};

const isInvalidReplyTokenError = (err) => {
  const detail = [err?.message, err?.body].filter(Boolean).join(' ');
  return detail.includes('Invalid reply token');
};

const sendReplyOrPushToSource = async (event, messages, contextLabel) => {
  try {
    await client.replyMessage({ replyToken: event.replyToken, messages });
  } catch (err) {
    if (!isInvalidReplyTokenError(err)) {
      throw err;
    }

    const to = getPushTargetFromEvent(event);
    if (!to) {
      throw err;
    }

    console.warn(`[${contextLabel}] reply token invalid; fallback push to ${event.source?.type || 'unknown'}`);
    await client.pushMessage({ to, messages });
  }
};

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
const sendWelcomeMessage = async (event, displayName) => {
  await sendReplyOrPushToSource(event, [
    {
      type: 'text',
      text: `สวัสดีครับ คุณ${displayName} 👋\nยินดีต้อนรับสู่ระบบรับเรื่องร้องทุกข์\n\nพิมพ์ "แจ้งเรื่อง" เพื่อเปิดฟอร์มแจ้งเรื่อง\nพิมพ์ "ตามเรื่อง" เพื่อติดตามสถานะ\nพิมพ์ "id" เพื่อดู User ID ของคุณครับ`,
    },
  ], 'welcome');
};

// ============================================================
// POST /webhook
// LINE Messaging API Webhook / LINE Webhook Gateway
// ============================================================
router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
  const rawBody = req.body;
  const _rawMode = (process.env.WEBHOOK_MODE || 'both').toLowerCase();
  const _validModes = ['line', 'gateway', 'both'];
  const mode = _validModes.includes(_rawMode) ? _rawMode : 'both';
  if (!_validModes.includes(_rawMode)) {
    console.warn(`[Webhook] WEBHOOK_MODE="${process.env.WEBHOOK_MODE}" ไม่ถูกต้อง — fallback เป็น "both"`);
  }
  const lineEnabled = mode === 'line' || mode === 'both';
  const gatewayEnabled = mode === 'gateway' || mode === 'both';

  const fromLineDirect = lineEnabled && verifyLineSignature(rawBody, req.headers['x-line-signature']);
  const fromGateway = gatewayEnabled && verifyGatewaySignature(
    rawBody,
    req.headers['x-gateway-signature'],
    req.headers['x-gateway-timestamp'],
    req.headers['x-gateway-name']
  );

  if (!fromLineDirect && !fromGateway) {
    return res.status(401).json({ message: 'Invalid webhook signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }

  // ตอบ 200 ทันทีตามที่ LINE กำหนด
  res.status(200).json({ status: 'ok' });

  // ประมวลผล events แบบ async
  const events = normalizeWebhookEvents(body, fromGateway);
  const results = await Promise.allSettled(events.map(handleEvent));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[Webhook] failed events ${failed.length}/${events.length}:`, failed.map((result) => result.reason?.message || String(result.reason)).join(' | '));
  }
});

// ── ฟังก์ชันอัพเดทจำนวนสมาชิกในกลุ่ม ─────────────────────
const updateGroupMemberCount = async (groupId) => {
  try {
    const lastUpdatedAt = groupMemberCountCache.get(groupId) || 0;
    if (Date.now() - lastUpdatedAt < GROUP_MEMBER_COUNT_TTL_MS) {
      return null;
    }

    groupMemberCountCache.set(groupId, Date.now());

    // ใช้ endpoint โดยตรงเพื่อดึงจำนวนสมาชิก
    const axios = require('axios');
    const response = await axios.get(
      `https://api.line.me/v2/bot/group/${groupId}/members/count`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
        }
      }
    );
    const memberCount = response.data.count || 0;
    await LineGroup.findOneAndUpdate(
      { groupId },
      { memberCount },
      { upsert: false }
    );
    return memberCount;
  } catch (err) {
    groupMemberCountCache.delete(groupId);
    console.error(`[updateGroupMemberCount] Error for ${groupId}:`, err.message);
    return 0;
  }
};

// ── ประมวลผลแต่ละ Event ────────────────────────────────────
const handleEvent = async (event) => {
  try {
    // ── Idempotency: ข้าม event ที่เคย process ไปแล้ว ──────
    if (isDuplicateEvent(event.webhookEventId)) {
      console.warn(`[Webhook] duplicate event skipped: ${event.webhookEventId}`);
      return;
    }

    // ── บอทถูก add เข้ากลุ่ม ──────────────────────────────
    if (event.type === 'join' && event.source.type === 'group') {
      const groupId = event.source.groupId;
      let groupName = 'ไม่ทราบชื่อกลุ่ม';
      let memberCount = 0;
      try {
        const summary = await client.getGroupSummary(groupId);
        groupName = summary.groupName || groupName;

        // ดึงจำนวนสมาชิกจาก endpoint โดยตรง
        const axios = require('axios');
        const countResponse = await axios.get(
          `https://api.line.me/v2/bot/group/${groupId}/members/count`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
            }
          }
        );
        memberCount = countResponse.data.count || 0;
      } catch (_) { }

      await LineGroup.findOneAndUpdate(
        { groupId },
        { groupId, groupName, memberCount, isActive: true, addedAt: new Date(), leftAt: null },
        { upsert: true, new: true }
      );
      console.log(`[JOIN GROUP] ${groupId} — "${groupName}" (${memberCount} สมาชิก)`);

      await sendReplyOrPushToSource(event, [{ type: 'text', text: `สวัสดีครับ 👋 ระบบรับเรื่องร้องทุกข์พร้อมใช้งานแล้ว\nพิมพ์ "แจ้งเรื่อง" เพื่อเปิดฟอร์มแจ้งเรื่อง\nพิมพ์ "ตามเรื่อง" เพื่อติดตามสถานะ\nพิมพ์ "id" เพื่อดู User ID ของคุณครับ` }], 'join');
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
      await sendWelcomeMessage(event, profile.displayName);
      return;
    }

    // ── Postback event: รับคะแนนความพึงพอใจ ──────────────────
    if (event.type === 'postback') {
      const params = new URLSearchParams(event.postback.data || '');
      if (params.get('action') === 'satisfy') {
        const ticketId = params.get('ticketId');
        const score = parseInt(params.get('score'), 10);
        if (ticketId && score >= 1 && score <= 5) {
          const t = await Ticket.findById(ticketId);
          if (t && !t.satisfactionReplied) {
            t.satisfactionScore = score;
            t.satisfactionAt = new Date();
            t.satisfactionReplied = true;
            await t.save();
          }
        }
        await sendReplyOrPushToSource(event, [{
          type: 'text',
          text: 'ขอบคุณสำหรับการให้คะแนนความพึงพอใจในการรับบริการ เรื่องร้องเรียน/ร้องทุกข์ ครับ 🙏',
        }], 'satisfaction');
      }
      return;
    }

    // รับเฉพาะ message event ประเภท text
    if (event.type !== 'message' || event.message.type !== 'text') return;

    // normalize: กำจัด zero-width chars ก่อน match คำสั่ง
    const text = event.message.text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
    const replyToken = event.replyToken;
    const groupId = event.source.type === 'group' ? event.source.groupId : '';

    // ── อัพเดทจำนวนสมาชิกในกลุ่มแบบ background ไม่หน่วง replyToken ────────
    updateGroupMemberCountInBackground(groupId);

    // ── คำสั่ง "แจ้งเรื่อง" / "ร้องเรียน" ────────────────────
    // ฝัง groupId ใน LIFF URL ผ่าน query string เพื่อให้ ticketRoutes รับได้
    if (text === 'แจ้งเรื่อง' || text === 'ร้องเรียน') {
      const gid = groupId || '';
      const liffUrl = `https://liff.line.me/${process.env.LIFF_ID}${gid ? '?gid=' + gid : ''}`;
      const flexMsg = createComplaintEntryFlexMessage(liffUrl);
      await sendReplyOrPushToSource(event, [flexMsg], 'แจ้งเรื่อง');
      return;
    }

    // ── คำสั่ง "ตรวจสอบสถานะ" ────────────────────────────
    if (text === 'ตรวจสอบสถานะ' || text === 'เช็คสถานะ') {
      await sendReplyOrPushToSource(event, [createCheckStatusFlexMessage()], 'ตรวจสอบสถานะ');
      return;
    }

    // ── คำสั่ง "ตามเรื่อง" ───────────────────────────────
    if (text === 'ตามเรื่อง') {
      const userId = event.source.userId;

      console.log(`[ตามเรื่อง] userId=${userId}`);

      // กรณี userId ไม่สามารถระบุได้ (เช่น privacy settings ของกลุ่ม)
      if (!userId) {
        await sendReplyOrPushToSource(event, [{ type: 'text', text: 'ไม่สามารถตรวจสอบได้ เนื่องจากไม่สามารถระบุตัวตนของคุณได้\nกรุณาส่งข้อความผ่านแชทส่วนตัวกับบอทครับ 🙏' }], 'ตามเรื่อง');
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
        await sendReplyOrPushToSource(event, [{ type: 'text', text: 'ไม่มีเรื่องที่ค้างดำเนินการอยู่ครับ ✅' }], 'ตามเรื่อง');
        return;
      }

      // สร้าง Flex Bubble การ์ดเดียว แสดง list รายการทั้งหมด
      // แต่ละแถวกดได้เพื่อส่งเลขที่คำร้อง
      const rowItems = openTickets.flatMap((t, i) => {
        const statusColor = {
          'รอรับเรื่อง': '#e67e22',
          'ระหว่างดำเนินการ': '#2980b9',
          'ส่งต่อ': '#8e44ad',
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

        // นับจำนวนครั้งที่ใช้คำสั่ง "ตามเรื่อง" ในกลุ่ม (สำหรับคำนวน quota)
        const now = new Date();
        const yymm = String(now.getFullYear()).slice(-2) + String(now.getMonth() + 1).padStart(2, '0');
        const trackingKey = `tracking_${yymm}`;
        Counter.nextSeq(trackingKey).catch(err => console.error('Counter tracking error:', err.message));

        // reply ในกลุ่มแจ้งว่าส่งให้แล้ว
        await sendReplyOrPushToSource(event, [{ type: 'text', text: `สวัสดีคุณ ${displayName} 👋\nได้ส่งรายการเรื่องที่ค้างดำเนินการให้ในไลน์ส่วนตัวแล้วครับ 📩` }], 'ตามเรื่อง');
      } else {
        // ── พิมพ์จากแชทส่วนตัว: reply ปกติ ──
        await sendReplyOrPushToSource(event, [{
          type: 'flex',
          altText: `เรื่องที่ค้างดำเนินการ ${openTickets.length} รายการ`,
          contents: singleBubble,
        }], 'ตามเรื่อง');
      }
      return;
    }

    // ── คำสั่ง "id" (เฉพาะแชทส่วนตัว) ─────────────────────
    if (text.toLowerCase() === 'id') {
      console.log(`[id command] text="${text}", source.type=${event.source?.type}`);

      // ตรวจสอบว่าเป็นแชทส่วนตัวเท่านั้น (ไม่ใช่กลุ่ม)
      if (event.source?.type === 'group' || event.source?.type === 'room') {
        await sendReplyOrPushToSource(event, [{ type: 'text', text: 'คำสั่ง "id" ใช้งานได้เฉพาะในแชทส่วนตัวเท่านั้นครับ 🙏\nกรุณาส่งข้อความมาที่แชทส่วนตัวกับบอทครับ' }], 'id');
        return;
      }

      const userId = event.source.userId;
      console.log(`[id command] userId=${userId}`);

      if (!userId) {
        await sendReplyOrPushToSource(event, [{ type: 'text', text: 'ไม่สามารถระบุ User ID ได้\nกรุณาลองใหม่อีกครั้งครับ 🙏' }], 'id');
        return;
      }

      await sendReplyOrPushToSource(event, [{ type: 'text', text: `🆔 User ID ของคุณคือ:\n${userId}` }], 'id');
      return;
    }

    // ── ตรวจสอบสถานะด้วยเลขที่คำร้อง RPT-XXXX-XXXX ──────
    if (/^RPT-\d{4}-\d{4}$/i.test(text)) {
      const ticketNo = text.toUpperCase();

      // เรียกข้อมูลจาก API ภายใน
      const ticket = await Ticket.findOne(
        { ticketNo },
        'ticketNo subject status assignedDepartment createdAt'
      );

      if (!ticket) {
        await sendReplyOrPushToSource(event, [{ type: 'text', text: `ไม่พบเลขที่คำร้อง ${ticketNo} ในระบบครับ` }], 'ตรวจเลขคำร้อง');
        return;
      }

      await sendReplyOrPushToSource(event, [
        {
          type: 'text',
          text:
            `📋 เลขที่คำร้อง: ${ticket.ticketNo}\n` +
            `📌 หัวข้อ: ${ticket.subject}\n` +
            `🏢 หน่วยงาน: ${ticket.assignedDepartment}\n` +
            `📊 สถานะ: ${ticket.status}\n` +
            `🗓️ วันที่แจ้ง: ${new Date(ticket.createdAt).toLocaleDateString('th-TH')}`,
        },
      ], 'ตรวจเลขคำร้อง');
      return;
    }

    // ── ข้อความอื่นๆ ไม่ตอบสนอง ──────────────────────────
    // (ตอบเฉพาะคำว่า "แจ้งเรื่อง"/"ร้องเรียน", "ตามเรื่อง" และเลขที่คำร้อง RPT-XXXX-XXXX เท่านั้น)
  } catch (err) {
    // LINE Bot SDK v11 ใช้ err.body (string) สำหรับ HTTP error
    console.error('LINE event handler error:', err.message, err.body || '');
    throw err;
  }
};

module.exports = router;
