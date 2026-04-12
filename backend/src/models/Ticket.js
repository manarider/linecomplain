const mongoose = require('mongoose');
const Counter = require('./Counter');
const { DEPARTMENTS, TICKET_STATUS } = require('../config/constants');

const ticketSchema = new mongoose.Schema(
  {
    // ── เลขที่คำร้อง (auto-generate) ──────────────────────
    ticketNo: {
      type: String,
      unique: true,
      index: true,
    },

    // ── ข้อมูลผู้แจ้ง (จาก LINE LIFF) ────────────────────
    lineUserId: { type: String, required: true, index: true },
    displayName: { type: String }, // ชื่อ LINE profile
    groupId: { type: String, default: null }, // กรณีส่งจากกลุ่ม LINE

    // ── รายละเอียดเรื่อง ──────────────────────────────────
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },

    // ── รูปภาพ (filename ที่เซฟลง ./uploads) ─────────────
    images: [{ type: String }], // เก็บแค่ชื่อไฟล์

    // ── รูปยืนยันผลการดำเนินงาน (แนบตอนเปลี่ยนสถานะเสร็จสิ้น) ──
    completionImages: [{ type: String }],

    // ── การกำหนดหน่วยงาน ──────────────────────────────────
    // ใช้ match กับ subDepartment ของเจ้าหน้าที่จาก UMS
    assignedDepartment: {
      type: String,
      enum: DEPARTMENTS,
      required: true,
    },

    // ── สถานะ ──────────────────────────────────────────────
    status: {
      type: String,
      enum: Object.values(TICKET_STATUS),
      default: TICKET_STATUS.PENDING,
    },

    // ── ตำแหน่ง GPS (ไม่บังคับ) ──────────────────────────
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    // ── ข้อมูลการดำเนินการ (กรอกโดยเจ้าหน้าที่ใน Phase 4) ─
    assignedToId: { type: String, default: null },   // userId ของเจ้าหน้าที่
    assignedToName: { type: String, default: null }, // ชื่อเจ้าหน้าที่

    // ── ประวัติการอัปเดต ───────────────────────────────────
    history: [
      {
        status: { type: String },
        note: { type: String },
        updatedById: { type: String },
        updatedByName: { type: String },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true, // createdAt, updatedAt อัตโนมัติ
  }
);

// ── Pre-save: สร้าง ticketNo อัตโนมัติ ────────────────────
ticketSchema.pre('save', async function () {
  if (this.isNew) {
    // Format: RPT-YYMM-XXXX เช่น RPT-2604-0001
    const now = new Date();
    const yymm =
      String(now.getFullYear()).slice(-2) +
      String(now.getMonth() + 1).padStart(2, '0');
    const counterKey = `ticket_${yymm}`;
    const seq = await Counter.nextSeq(counterKey);
    this.ticketNo = `RPT-${yymm}-${String(seq).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
