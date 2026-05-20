/**
 * สคริปต์ดึงจำนวนสมาชิกของกลุ่ม LINE ทั้งหมด
 *
 * วิธีใช้:
 * 1. Login เข้าระบบด้วย superadmin
 * 2. เรียก POST /api/line-groups/sync-all-members
 *
 * หรือรันสคริปต์นี้โดยตรง: node syncGroupMembers.js
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const { messagingApi } = require('@line/bot-sdk');
const LineGroup = require('./src/models/LineGroup');

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
});

async function syncAllGroupMembers() {
  try {
    console.log('🔗 เชื่อมต่อ MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ เชื่อมต่อสำเร็จ\n');

    console.log('📊 ดึงรายการกลุ่ม LINE ทั้งหมด...');
    const groups = await LineGroup.find(); // ดึงทุกกลุ่ม รวม inactive

    if (!groups.length) {
      console.log('❌ ไม่พบกลุ่ม active ในระบบ');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`พบ ${groups.length} กลุ่ม\n`);
    console.log('🔄 กำลังดึงข้อมูลจำนวนสมาชิก...\n');

    let updated = 0;
    let failed = 0;

    const axios = require('axios');

    for (const group of groups) {
      try {
        // ดึงชื่อกลุ่มจาก getGroupSummary
        const summary = await lineClient.getGroupSummary(group.groupId);
        const groupName = summary.groupName || group.groupName;

        // ดึงจำนวนสมาชิกจาก endpoint โดยตรง
        const countResponse = await axios.get(
          `https://api.line.me/v2/bot/group/${group.groupId}/members/count`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
            }
          }
        );

        console.log(`\n📋 ${groupName}`);
        console.log(`   Count API Response:`, countResponse.data);

        const memberCount = countResponse.data.count || 0;

        await LineGroup.findByIdAndUpdate(group._id, {
          memberCount,
          groupName,
        });

        console.log(`✅ ${groupName}: ${memberCount} สมาชิก`);
        updated++;
      } catch (err) {
        console.error(`❌ ${group.groupName}: ${err.message}`);
        if (err.response) {
          console.error(`   Status:`, err.response.status);
          console.error(`   Data:`, JSON.stringify(err.response.data, null, 2));
        }
        failed++;
      }
    }

    console.log(`\n📈 สรุป: สำเร็จ ${updated}/${groups.length} กลุ่ม ${failed > 0 ? `(ล้มเหลว ${failed} กลุ่ม)` : ''}`);

    await mongoose.disconnect();
    console.log('\n👋 ปิดการเชื่อมต่อ MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ เกิดข้อผิดพลาด:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

syncAllGroupMembers();
