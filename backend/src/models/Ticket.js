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
    lineUserId:     { type: String, required: true, index: true },
    displayName:    { type: String, default: '' },        // ชื่อ LINE profile
    pictureUrl:     { type: String, default: '' },        // URL รูปโปรไฟล์ LINE
    statusMessage:  { type: String, default: '' },        // ข้อความสถานะ LINE
    groupId:        { type: String, default: null },      // กรณีส่งจากกลุ่ม LINE

    // ── รายละเอียดเรื่อง ──────────────────────────────────
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },

    // ── รูปภาพ (filename ที่เซฟลง ./uploads) ─────────────
    images: [{ type: String }], // เก็บแค่ชื่อไฟล์

    // ── รูปยืนยันผลการดำเนินงาน (แนบตอนเปลี่ยนสถานะเสร็จสิ้น) ──
    completionImages: [{ type: String }],

    // ── ประเมินความพึงพอใจ ─────────────────────────────────────
    satisfactionScore:   { type: Number, min: 1, max: 5, default: null },
    satisfactionAt:      { type: Date, default: null },
    satisfactionReplied: { type: Boolean, default: false }, // ป้องกันการให้คะแนนซ้ำ

    // ── ข้อมูลเพิ่มเติมจากผู้ร้อง (ขอโดยเจ้าหน้าที่ผ่าน LIFF) ──
    additionalInfoRequests: [
      {
        requestText: { type: String, default: '', trim: true },
        note: { type: String, default: '', trim: true },
        token: { type: String, required: true }, // index ประกาศไว้ด้านล่างแล้ว
        requestedById: { type: String, default: '' },
        requestedByName: { type: String, default: '' },
        requestedAt: { type: Date, default: Date.now },
        responseText: { type: String, default: '', trim: true },
        responseImages: [{ type: String }],
        respondedAt: { type: Date, default: null },
        isRead: { type: Boolean, default: true },
        readById: { type: String, default: '' },
        readByName: { type: String, default: '' },
        readAt: { type: Date, default: null },
      },
    ],

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

// ── Indexes สำหรับ query ที่ใช้บ่อย ──────────────────────
// 🔍 Dashboard query patterns: filter (status/department) + sort (createdAt desc)
ticketSchema.index({ status: 1, assignedDepartment: 1, createdAt: -1 }); // ดีสุด: filter + sort ในครั้งเดียว
ticketSchema.index({ status: 1, createdAt: -1 });                        // filter status + sort
ticketSchema.index({ assignedDepartment: 1, createdAt: -1 });            // filter department + sort
ticketSchema.index({ createdAt: -1 });                                   // sort อย่างเดียว (all tickets)

// 🔍 Additional info request queries
ticketSchema.index({ 'additionalInfoRequests.token': 1 });
ticketSchema.index({ 'additionalInfoRequests.isRead': 1, 'additionalInfoRequests.respondedAt': 1 });

// 🔍 Text search สำหรับ ticketNo, subject, displayName (ใช้แทน regex ได้เร็วกว่า)
ticketSchema.index({ ticketNo: 'text', subject: 'text', displayName: 'text' }, {
  name: 'text_search_idx',
  weights: {
    ticketNo: 3,      // ให้น้ำหนักเลขที่คำร้องสูงสุด
    subject: 2,       // หัวเรื่องรองลงมา
    displayName: 1,   // ชื่อผู้ร้องน้ำหนักต่ำสุด
  },
});

module.exports = mongoose.model('Ticket', ticketSchema);
