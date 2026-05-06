const mongoose = require('mongoose');

// เชื่อมต่อ MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // รอ server selection ไม่เกิน 10 วิ
      connectTimeoutMS: 10000,         // รอเชื่อมต่อไม่เกิน 10 วิ
      socketTimeoutMS: 45000,          // timeout socket ที่ idle
    });
    console.log(`✅ MongoDB เชื่อมต่อสำเร็จ: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB เชื่อมต่อล้มเหลว: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
