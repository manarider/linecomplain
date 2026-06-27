const express = require('express');
const mongoose = require('mongoose');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { logAction, actorFromUser } = require('../utils/auditLog');

const router = express.Router();

router.use(requireAuth, requireRole('superadmin'));

const makeBackupFilename = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `capp-db-backup-${stamp}.json`;
};

router.get('/download', async (req, res) => {
  const db = mongoose.connection.db;
  if (!db) return res.status(503).json({ message: 'ยังไม่ได้เชื่อมต่อฐานข้อมูล' });

  let collections;
  try {
    collections = await db.listCollections().toArray();
  } catch (err) {
    console.error('GET /api/backup/download error (listCollections):', err.message);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสำรองฐานข้อมูล' });
  }

  const filename = makeBackupFilename();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // ── Stream JSON ทีละ collection เพื่อลด peak memory ──────
  // แทนการโหลดข้อมูลทั้งหมดเข้า RAM พร้อมกัน
  try {
    res.write('{\n');
    res.write(`  "generatedAt": ${JSON.stringify(new Date().toISOString())},\n`);
    res.write(`  "database": ${JSON.stringify(db.databaseName)},\n`);
    res.write(`  "collectionCount": ${collections.length},\n`);
    res.write('  "collections": {\n');

    for (let i = 0; i < collections.length; i++) {
      const collectionName = collections[i].name;
      const isLast = i === collections.length - 1;
      res.write(`    ${JSON.stringify(collectionName)}: [`);

      let isFirstDoc = true;
      const cursor = db.collection(collectionName).find({});
      for await (const doc of cursor) {
        if (!isFirstDoc) res.write(',');
        res.write(JSON.stringify(doc));
        isFirstDoc = false;
      }

      res.write(`]${isLast ? '' : ','}\n`);
    }

    res.write('  }\n}');
    res.end();

    logAction({
      ...actorFromUser(req),
      action: 'BACKUP_DATABASE',
      category: 'system',
      targetId: filename,
      targetLabel: 'Database backup',
      detail: `ดาวน์โหลด backup ฐานข้อมูล ${db.databaseName}`,
      meta: {
        database: db.databaseName,
        collectionCount: collections.length,
        filename,
      },
    });
  } catch (err) {
    console.error('GET /api/backup/download error:', err.message);
    // ถ้า response ยังไม่ได้ส่งไป สามารถส่ง error ได้
    if (!res.headersSent) {
      res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสำรองฐานข้อมูล' });
    } else {
      // response เริ่มส่งแล้ว ปิด stream
      res.end();
    }
  }
});

module.exports = router;