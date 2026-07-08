const mongoose = require('mongoose');

// ============================================================
// WspAgency — หน่วยรับผิดชอบของสำนักการประปา
// ใช้สำหรับ CRUD จัดการหน่วยงานย่อยที่รับงานประปา
// ============================================================
const wspAgencySchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
    members:  [
      {
        lineUserId:  { type: String, required: true },
        displayName: { type: String, default: '' },
      }
    ], // สมาชิกรับแจ้งเตือน (สูงสุด 2 คน)
  },
  { timestamps: true }
);

module.exports = mongoose.model('WspAgency', wspAgencySchema);
