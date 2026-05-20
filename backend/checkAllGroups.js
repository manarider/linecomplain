const mongoose = require('mongoose');
const LineGroup = require('./src/models/LineGroup');
require('dotenv').config({ path: '../.env' });

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const groups = await LineGroup.find().sort({ isActive: -1, groupName: 1 });

    console.log('\n📊 สถานะกลุ่ม LINE ทั้งหมด:\n');
    console.log('='.repeat(70));

    const activeGroups = groups.filter(g => g.isActive);
    const inactiveGroups = groups.filter(g => g.isActive === false);

    console.log('\n✅ กลุ่ม ACTIVE (' + activeGroups.length + ' กลุ่ม):\n');
    activeGroups.forEach(g => {
      console.log(`  📱 ${g.groupName}`);
      console.log(`     จำนวนสมาชิก: ${g.memberCount} คน`);
      console.log(`     Group ID: ${g.groupId}\n`);
    });

    if (inactiveGroups.length > 0) {
      console.log('❌ กลุ่ม INACTIVE (' + inactiveGroups.length + ' กลุ่ม):\n');
      inactiveGroups.forEach(g => {
        console.log(`  📱 ${g.groupName}`);
        console.log(`     จำนวนสมาชิก: ${g.memberCount} คน`);
        console.log(`     Group ID: ${g.groupId}\n`);
      });
    }

    console.log('='.repeat(70));
    const totalActive = activeGroups.reduce((sum, g) => sum + g.memberCount, 0);
    const totalInactive = inactiveGroups.reduce((sum, g) => sum + g.memberCount, 0);
    const totalAll = totalActive + totalInactive;

    console.log(`\n📈 สรุป:`);
    console.log(`   Active กลุ่ม: ${activeGroups.length} กลุ่ม = ${totalActive} คน`);
    console.log(`   Inactive กลุ่ม: ${inactiveGroups.length} กลุ่ม = ${totalInactive} คน`);
    console.log(`   รวมทั้งหมด: ${groups.length} กลุ่ม = ${totalAll} คน\n`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.message);
    process.exit(1);
  }
})();
