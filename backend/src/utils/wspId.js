const Counter = require('../models/Counter');

// สร้างรหัสระบบประปา รูปแบบ WSP-YYMM-XXXXX (running ต่อเดือน)
async function generateWspId() {
  const now = new Date();
  const yymm =
    String(now.getFullYear()).slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0');
  const seq = await Counter.nextSeq(`wsp_${yymm}`);
  return `WSP-${yymm}-${String(seq).padStart(5, '0')}`;
}

module.exports = { generateWspId };
