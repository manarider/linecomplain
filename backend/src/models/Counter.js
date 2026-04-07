const mongoose = require('mongoose');

// Counter สำหรับสร้าง ticketNo แบบ atomic (ป้องกัน race condition)
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // เช่น "ticket_2604"
  seq: { type: Number, default: 0 },
});

counterSchema.statics.nextSeq = async function (key) {
  const result = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return result.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
