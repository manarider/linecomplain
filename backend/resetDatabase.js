/**
 * 🔥 สคริปต์ลบข้อมูลทดสอบเพื่อเปิดบริการจริง
 * 
 * ลบ:
 * - Ticket (คำร้องทั้งหมด + ข้อมูลผู้ร้อง)
 * - AuditLog (ข้อมูล log)
 * - Counter (รีเซ็ตตัวนับ)
 * - ไฟล์รูปภาพใน uploads/
 * 
 * เก็บไว้:
 * - LineGroup (ข้อมูลกลุ่ม LINE)
 * 
 * วิธีใช้: node resetDatabase.js
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// Import models
const Ticket = require('./src/models/Ticket');
const AuditLog = require('./src/models/AuditLog');
const Counter = require('./src/models/Counter');
const LineGroup = require('./src/models/LineGroup');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

async function resetDatabase() {
  try {
    console.log('🔗 เชื่อมต่อ MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ เชื่อมต่อสำเร็จ\n');

    // ────────────────────────────────────────────────────
    // 1️⃣ นับข้อมูลก่อนลบ
    // ────────────────────────────────────────────────────
    console.log('📊 นับข้อมูลในระบบ...');
    const ticketCount = await Ticket.countDocuments();
    const auditLogCount = await AuditLog.countDocuments();
    const counterCount = await Counter.countDocuments();
    const lineGroupCount = await LineGroup.countDocuments();

    console.log(`  - Ticket (คำร้อง): ${ticketCount} รายการ`);
    console.log(`  - AuditLog (log): ${auditLogCount} รายการ`);
    console.log(`  - Counter (ตัวนับ): ${counterCount} รายการ`);
    console.log(`  - LineGroup (กลุ่ม LINE): ${lineGroupCount} รายการ [จะเก็บไว้]\n`);

    // ────────────────────────────────────────────────────
    // 2️⃣ ยืนยันการลบ
    // ────────────────────────────────────────────────────
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      readline.question(
        '⚠️  ต้องการลบข้อมูลทดสอบทั้งหมด (ยกเว้นกลุ่ม LINE) ใช่หรือไม่? (พิมพ์ YES เพื่อยืนยัน): ',
        (ans) => {
          readline.close();
          resolve(ans);
        }
      );
    });

    if (answer !== 'YES') {
      console.log('❌ ยกเลิกการลบข้อมูล');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('\n🗑️  เริ่มลบข้อมูล...\n');

    // ────────────────────────────────────────────────────
    // 3️⃣ ลบข้อมูล Ticket
    // ────────────────────────────────────────────────────
    console.log('🗑️  ลบ Ticket (คำร้องทั้งหมด)...');
    const deleteTickets = await Ticket.deleteMany({});
    console.log(`   ✅ ลบสำเร็จ ${deleteTickets.deletedCount} รายการ`);

    // ────────────────────────────────────────────────────
    // 4️⃣ ลบข้อมูล AuditLog
    // ────────────────────────────────────────────────────
    console.log('🗑️  ลบ AuditLog (log ทั้งหมด)...');
    const deleteAuditLogs = await AuditLog.deleteMany({});
    console.log(`   ✅ ลบสำเร็จ ${deleteAuditLogs.deletedCount} รายการ`);

    // ────────────────────────────────────────────────────
    // 5️⃣ ลบข้อมูล Counter (รีเซ็ตตัวนับ)
    // ────────────────────────────────────────────────────
    console.log('🗑️  ลบ Counter (รีเซ็ตตัวนับเลขที่คำร้อง)...');
    const deleteCounters = await Counter.deleteMany({});
    console.log(`   ✅ ลบสำเร็จ ${deleteCounters.deletedCount} รายการ`);

    // ────────────────────────────────────────────────────
    // 6️⃣ ลบไฟล์รูปภาพใน uploads/
    // ────────────────────────────────────────────────────
    console.log('🗑️  ลบไฟล์รูปภาพใน uploads/...');
    let deletedFiles = 0;
    
    try {
      const files = await fs.readdir(UPLOADS_DIR);
      
      for (const file of files) {
        // ข้าม .gitkeep หรือไฟล์ระบบ
        if (file === '.gitkeep' || file.startsWith('.')) {
          continue;
        }
        
        const filePath = path.join(UPLOADS_DIR, file);
        const stat = await fs.stat(filePath);
        
        if (stat.isFile()) {
          await fs.unlink(filePath);
          deletedFiles++;
        }
      }
      
      console.log(`   ✅ ลบไฟล์สำเร็จ ${deletedFiles} ไฟล์`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('   ⚠️  ไม่พบโฟลเดอร์ uploads/');
      } else {
        console.log(`   ⚠️  เกิดข้อผิดพลาดในการลบไฟล์: ${error.message}`);
      }
    }

    // ────────────────────────────────────────────────────
    // 7️⃣ สรุปผล
    // ────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log('✅ ลบข้อมูลทดสอบเสร็จสิ้น');
    console.log('='.repeat(60));
    console.log(`📝 สรุป:`);
    console.log(`  ✓ ลบ Ticket: ${deleteTickets.deletedCount} รายการ`);
    console.log(`  ✓ ลบ AuditLog: ${deleteAuditLogs.deletedCount} รายการ`);
    console.log(`  ✓ ลบ Counter: ${deleteCounters.deletedCount} รายการ`);
    console.log(`  ✓ ลบไฟล์รูปภาพ: ${deletedFiles} ไฟล์`);
    console.log(`  ✓ เก็บ LineGroup ไว้: ${lineGroupCount} รายการ`);
    console.log('\n🎉 พร้อมเปิดบริการอย่างเป็นทางการแล้ว!\n');

    await mongoose.disconnect();
    console.log('👋 ปิดการเชื่อมต่อ MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ เกิดข้อผิดพลาด:', error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// เริ่มทำงาน
resetDatabase();
