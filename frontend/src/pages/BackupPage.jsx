import { useState } from 'react';
import { downloadDatabaseBackup } from '../api';

export default function BackupPage({ showToast }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { blob, filename } = await downloadDatabaseBackup();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast?.('ดาวน์โหลด backup ฐานข้อมูลสำเร็จ', 'success');
    } catch (err) {
      showToast?.(err.message || 'เกิดข้อผิดพลาดในการ backup', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={S.wrap}>
      <div style={S.panel}>
        <div>
          <h2 style={S.title}>Backup Database</h2>
          <p style={S.desc}>สำรองข้อมูลทั้งหมดในฐานข้อมูลเป็นไฟล์ JSON สำหรับ super admin เท่านั้น</p>
        </div>
        <button style={S.primaryBtn} onClick={handleDownload} disabled={downloading}>
          {downloading ? 'กำลัง backup...' : '⬇️ Backup DB'}
        </button>
      </div>
    </div>
  );
}

const S = {
  wrap: { maxWidth: 760 },
  panel: {
    background: '#fff', borderRadius: 10, padding: 20,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    flexWrap: 'wrap', borderTop: '3px solid #1a5f9e',
  },
  title: { margin: 0, fontSize: '1.05rem', color: '#1f2937' },
  desc: { margin: '6px 0 0', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.6 },
  primaryBtn: {
    padding: '10px 18px', background: '#1a5f9e', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
    minWidth: 150,
  },
};