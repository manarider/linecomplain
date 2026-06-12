const mongoose = require('mongoose');

// ── SystemSetting: เก็บค่าตั้งค่าระบบแบบ key/value ──────────
// ใช้ upsert ผ่าน SystemSetting.setSetting(key, value)
// และดึงผ่าน SystemSetting.getSetting(key, defaultValue)
const systemSettingSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

// Helper: ดึงค่า setting (คืน defaultValue ถ้าไม่พบ)
systemSettingSchema.statics.getSetting = async function (key, defaultValue = null) {
  const doc = await this.findOne({ key }).lean();
  return doc ? doc.value : defaultValue;
};

// Helper: บันทึกค่า setting (upsert)
systemSettingSchema.statics.setSetting = async function (key, value) {
  return this.findOneAndUpdate(
    { key },
    { value },
    { upsert: true, new: true, runValidators: true }
  );
};

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
