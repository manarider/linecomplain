const mongoose = require('mongoose');

// ============================================================
// WspReason — เหตุร้องทุกข์ของสำนักการประปา
// ใช้สำหรับ CRUD จัดการรายการเหตุผลที่ประชาชนอาจร้องเรียน
// ============================================================
const wspReasonSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WspReason', wspReasonSchema);
