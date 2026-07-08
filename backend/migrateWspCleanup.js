/**
 * ========================================
 * 🔧 Migrate WSP Cleanup Status
 * ========================================
 * ตั้งค่าคำร้องเดิมของสำนักการประปาที่ "เสร็จสิ้น" แล้ว
 * ให้เป็น "เสร็จสิ้นและเก็บงานแล้ว" (wspCleanupStatus = 'COMPLETED')
 *
 * วิธีใช้งาน:
 *   node migrateWspCleanup.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');

const WSP_DEPARTMENT = 'สำนักการประปา';

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ ไม่พบ MONGODB_URI ใน environment variables');
    process.exit(1);
  }

  console.log('🔗 กำลังเชื่อมต่อ MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ เชื่อมต่อสำเร็จ');

  const filter = {
    assignedDepartment: WSP_DEPARTMENT,
    status: 'เสร็จสิ้น',
    wspCleanupStatus: { $ne: 'COMPLETED' },
  };

  const count = await Ticket.countDocuments(filter);
  console.log(`📋 พบคำร้องที่จะอัปเดต: ${count} รายการ`);

  if (count > 0) {
    const result = await Ticket.updateMany(filter, {
      $set: { wspCleanupStatus: 'COMPLETED' },
    });
    console.log(`✅ อัปเดตแล้ว: ${result.modifiedCount} รายการ`);
  }

  await mongoose.disconnect();
  console.log('🔌 ปิดการเชื่อมต่อแล้ว');
}

run().catch((err) => {
  console.error('❌ เกิดข้อผิดพลาด:', err);
  process.exit(1);
});
