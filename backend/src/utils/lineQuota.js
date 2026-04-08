/**
 * lineQuota.js
 * ─────────────────────────────────────────────────────────────
 * Module สำหรับตรวจสอบและบันทึกโควตาการส่งข้อความ LINE
 * ใช้ @line/bot-sdk และเก็บสถิติไว้ใน MongoDB collection "usage_stats"
 */

const { messagingApi } = require('@line/bot-sdk');
const mongoose = require('mongoose');

// ── LINE Messaging API Client ──────────────────────────────
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

// ── Schema สำหรับบันทึกสถิติโควตา ─────────────────────────
// เก็บ 1 document ต่อ 1 เดือน  key = "YYYY-MM"
const usageStatSchema = new mongoose.Schema(
  {
    month:        { type: String, required: true, unique: true, index: true }, // เช่น "2026-04"
    totalUsage:   { type: Number, default: 0 },   // จำนวนข้อความที่ส่งไปแล้ว
    monthlyLimit: { type: Number, default: 0 },   // ขีดจำกัดสูงสุดของบัญชี
    percent:      { type: Number, default: 0 },   // ร้อยละการใช้งาน (0-100)
    isWarning:    { type: Boolean, default: false }, // true ถ้า >= 80%
    updatedAt:    { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// ใช้ model ที่มีอยู่แล้ว หรือสร้างใหม่ (ป้องกัน re-compile ใน dev)
const UsageStat = mongoose.models.UsageStat
  || mongoose.model('UsageStat', usageStatSchema, 'usage_stats');

// ── ฟังก์ชัน key เดือนปัจจุบัน ──────────────────────────────
const getCurrentMonthKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

// ────────────────────────────────────────────────────────────
// checkLineQuota()
// ดึงข้อมูลโควตาจาก LINE API แล้วบันทึกลง MongoDB
// คืนค่า object { totalUsage, monthlyLimit, percent, isWarning }
// ────────────────────────────────────────────────────────────
const checkLineQuota = async () => {
  // -- ดึงยอดการใช้งานในเดือนปัจจุบัน (จำนวนครั้งที่ส่งจริง) --
  const consumptionRes = await lineClient.getMessageQuotaConsumption();
  const totalUsage = consumptionRes.totalUsage ?? 0;

  // -- ดึงขีดจำกัดสูงสุดของบัญชี (เช่น 200, 1000, หรือ -1 = unlimited) --
  const quotaRes = await lineClient.getMessageQuota();
  // type: "none" = unlimited, "limited" = มีขีดจำกัด
  const monthlyLimit = quotaRes.type === 'limited' ? (quotaRes.value ?? 0) : -1;

  // -- คำนวณร้อยละ (ถ้า unlimited ให้เป็น 0) --
  const percent = monthlyLimit > 0
    ? Math.min(100, Math.round((totalUsage / monthlyLimit) * 100))
    : 0;

  const isWarning = percent >= 80;

  // -- บันทึก/อัปเดตลง MongoDB --
  const monthKey = getCurrentMonthKey();
  await UsageStat.findOneAndUpdate(
    { month: monthKey },
    { totalUsage, monthlyLimit, percent, isWarning, updatedAt: new Date() },
    { upsert: true, new: true }
  );

  // -- Log สถานะ --
  const tag = isWarning ? '⚠️  WARNING' : '✅ OK';
  console.log(
    `[LINE Quota] ${tag} | เดือน ${monthKey} | ใช้แล้ว ${totalUsage}/${monthlyLimit === -1 ? '∞' : monthlyLimit} (${percent}%)`
  );

  return { totalUsage, monthlyLimit, percent, isWarning, month: monthKey };
};

// ────────────────────────────────────────────────────────────
// getLatestQuota()
// ดึงค่าล่าสุดจาก MongoDB โดยไม่เรียก LINE API
// ใช้สำหรับ Dashboard ที่ต้องการแสดงผลเร็ว
// ────────────────────────────────────────────────────────────
const getLatestQuota = async () => {
  const monthKey = getCurrentMonthKey();
  const doc = await UsageStat.findOne({ month: monthKey }).lean();
  return doc ?? {
    month: monthKey,
    totalUsage: null,
    monthlyLimit: null,
    percent: null,
    isWarning: false,
    updatedAt: null,
  };
};

module.exports = { checkLineQuota, getLatestQuota, UsageStat };
