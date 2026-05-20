/**
 * ========================================
 * 🔧 Rebuild MongoDB Indexes Script
 * ========================================
 *
 * สคริปต์นี้ใช้สำหรับ:
 * 1. ลบ indexes เก่าที่ไม่ใช้แล้ว
 * 2. สร้าง indexes ใหม่ตามที่กำหนดใน model
 * 3. ตรวจสอบและแสดงรายการ indexes ทั้งหมด
 *
 * วิธีใช้งาน:
 *   node rebuildIndexes.js
 *
 * หมายเหตุ:
 * - ใช้เวลาพอสมควรถ้าข้อมูลเยอะ
 * - ควรรันในช่วงที่ไม่มีผู้ใช้งานหนา
 * - Production ควร plan index maintenance ล่วงหน้า
 */

const path = require('path');

// โหลด .env จาก parent directory (/home/complain/app/.env)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');
const LineGroup = require('./src/models/LineGroup');
const AuditLog = require('./src/models/AuditLog');

async function rebuildIndexes() {
  try {
    console.log('\n🔗 กำลังเชื่อมต่อ MongoDB...');
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.error('\n❌ ไม่พบ MONGODB_URI ใน environment variables');
      console.error('\nวิธีใช้งาน:');
      console.error('  export MONGODB_URI="mongodb://username:password@host:port/database"');
      console.error('  node rebuildIndexes.js');
      console.error('\nหรือ:');
      console.error('  MONGODB_URI="mongodb://..." node rebuildIndexes.js\n');
      process.exit(1);
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ เชื่อมต่อสำเร็จ\n');

    // ────────────────────────────────────────────────────
    // 1️⃣ Ticket Collection
    // ────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════');
    console.log('📋 Ticket Collection');
    console.log('═══════════════════════════════════════════\n');

    console.log('🗑️  ลบ indexes เก่า...');
    try {
      await Ticket.collection.dropIndexes();
      console.log('   ✅ ลบ indexes เก่าสำเร็จ\n');
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound') {
        console.log('   ⚠️  Collection ยังไม่มี indexes\n');
      } else {
        console.log(`   ⚠️  ${err.message}\n`);
      }
    }

    console.log('🔨 สร้าง indexes ใหม่...');
    await Ticket.ensureIndexes();
    console.log('   ✅ สร้าง indexes สำเร็จ\n');

    console.log('📊 รายการ indexes ที่มีอยู่:');
    const ticketIndexes = await Ticket.collection.indexes();
    ticketIndexes.forEach((idx, i) => {
      console.log(`   ${i + 1}. ${idx.name}`);
      console.log(`      Keys: ${JSON.stringify(idx.key)}`);
      if (idx.weights) console.log(`      Weights: ${JSON.stringify(idx.weights)}`);
      if (idx.unique) console.log(`      Unique: ${idx.unique}`);
    });
    console.log('');

    // ────────────────────────────────────────────────────
    // 2️⃣ LineGroup Collection
    // ────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════');
    console.log('👥 LineGroup Collection');
    console.log('═══════════════════════════════════════════\n');

    console.log('🗑️  ลบ indexes เก่า...');
    try {
      await LineGroup.collection.dropIndexes();
      console.log('   ✅ ลบ indexes เก่าสำเร็จ\n');
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound') {
        console.log('   ⚠️  Collection ยังไม่มี indexes\n');
      } else {
        console.log(`   ⚠️  ${err.message}\n`);
      }
    }

    console.log('🔨 สร้าง indexes ใหม่...');
    await LineGroup.ensureIndexes();
    console.log('   ✅ สร้าง indexes สำเร็จ\n');

    console.log('📊 รายการ indexes ที่มีอยู่:');
    const lineGroupIndexes = await LineGroup.collection.indexes();
    lineGroupIndexes.forEach((idx, i) => {
      console.log(`   ${i + 1}. ${idx.name}`);
      console.log(`      Keys: ${JSON.stringify(idx.key)}`);
      if (idx.unique) console.log(`      Unique: ${idx.unique}`);
    });
    console.log('');

    // ────────────────────────────────────────────────────
    // 3️⃣ AuditLog Collection
    // ────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════');
    console.log('📝 AuditLog Collection');
    console.log('═══════════════════════════════════════════\n');

    console.log('🗑️  ลบ indexes เก่า...');
    try {
      await AuditLog.collection.dropIndexes();
      console.log('   ✅ ลบ indexes เก่าสำเร็จ\n');
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound') {
        console.log('   ⚠️  Collection ยังไม่มี indexes\n');
      } else {
        console.log(`   ⚠️  ${err.message}\n`);
      }
    }

    console.log('🔨 สร้าง indexes ใหม่...');
    await AuditLog.ensureIndexes();
    console.log('   ✅ สร้าง indexes สำเร็จ\n');

    console.log('📊 รายการ indexes ที่มีอยู่:');
    const auditLogIndexes = await AuditLog.collection.indexes();
    auditLogIndexes.forEach((idx, i) => {
      console.log(`   ${i + 1}. ${idx.name}`);
      console.log(`      Keys: ${JSON.stringify(idx.key)}`);
      if (idx.expireAfterSeconds) console.log(`      TTL: ${idx.expireAfterSeconds}s`);
    });
    console.log('');

    // ────────────────────────────────────────────────────
    // 4️⃣ สรุปผล
    // ────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════');
    console.log('✅ Rebuild Indexes สำเร็จทั้งหมด');
    console.log('═══════════════════════════════════════════\n');

    const stats = await mongoose.connection.db.stats();
    console.log('📊 สถิติฐานข้อมูล:');
    console.log(`   Database: ${stats.db}`);
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   Data Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Index Size: ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

  } catch (error) {
    console.error('\n❌ เกิดข้อผิดพลาด:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 ตัดการเชื่อมต่อ MongoDB แล้ว\n');
    process.exit(0);
  }
}

// Run script
rebuildIndexes();
