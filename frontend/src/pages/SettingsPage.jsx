import { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings } from '../api';

const POLL_OPTIONS = [
  { value: 30,  label: '30 วินาที' },
  { value: 60,  label: '1 นาที (แนะนำ)' },
  { value: 120, label: '2 นาที' },
  { value: 300, label: '5 นาที' },
];

export default function SettingsPage({ showToast }) {
  const [pollInterval, setPollInterval] = useState(60);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getSettings();
      setPollInterval(s?.pollIntervalSeconds?.value ?? 60);
    } catch {
      showToast?.('ไม่สามารถโหลดการตั้งค่าได้', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({ pollIntervalSeconds: pollInterval });
      showToast?.('บันทึกการตั้งค่าสำเร็จ ✅', 'success');
    } catch (err) {
      showToast?.(err.message || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={S.wrap}><p style={S.hint}>กำลังโหลด...</p></div>;

  return (
    <div style={S.wrap}>

      {/* ── Badge & Polling ──────────────────────────────── */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>⚙️ การตั้งค่าการแจ้งเตือน Badge</h2>
        <p style={S.desc}>
          ระบบจะตรวจสอบจำนวนคำร้อง "รอรับเรื่อง" โดยอัตโนมัติในช่วงเวลาที่กำหนด
          และแสดงตัวเลขบน icon ของ PWA รวมถึงกระพริบเมื่อมีคำร้องใหม่ที่ยังไม่ได้ดู
        </p>

        <div style={S.fieldRow}>
          <label style={S.label}>ช่วงเวลา Polling</label>
          <div style={S.radioGroup}>
            {POLL_OPTIONS.map(opt => (
              <label key={opt.value} style={S.radioLabel}>
                <input
                  type="radio"
                  name="pollInterval"
                  value={opt.value}
                  checked={pollInterval === opt.value}
                  onChange={() => setPollInterval(opt.value)}
                  style={{ marginRight: 6 }}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <p style={S.hint}>
            ค่านี้จะมีผลทันทีสำหรับผู้ใช้ที่เปิดหน้าต่างใหม่หรือ refresh
          </p>
        </div>

        <div style={S.actions}>
          <button style={S.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
          </button>
        </div>
      </div>

    </div>
  );
}

const S = {
  wrap:      { maxWidth: 600 },
  card:      {
    background: '#fff', borderRadius: 10, padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: '3px solid #14532d',
    marginBottom: 20,
  },
  cardTitle: { margin: '0 0 8px', fontSize: '1.05rem', color: '#1f2937' },
  desc:      { margin: '0 0 18px', fontSize: '0.88rem', color: '#6b7280', lineHeight: 1.6 },
  fieldRow:  { marginBottom: 12 },
  label:     { display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#374151', marginBottom: 8 },
  radioGroup: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px' },
  radioLabel: { fontSize: '0.9rem', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  hint:      { margin: '8px 0 0', fontSize: '0.8rem', color: '#9ca3af' },
  actions:   { marginTop: 20, display: 'flex', gap: 10 },
  saveBtn:   {
    background: '#14532d', color: '#fff', border: 'none', borderRadius: 7,
    padding: '9px 22px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
  },
};
