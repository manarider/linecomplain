import { useState, useEffect, useCallback } from 'react';
import { getQuotaCurrent, getQuotaHistory } from '../api';

export default function QuotaPage({ showToast }) {
  const [current, setCurrent]   = useState(null);
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);

  // ── โหลดข้อมูลจาก MongoDB (เร็ว, ไม่เรียก LINE API) ─────
  const loadData = useCallback(async () => {
    try {
      const [cur, hist] = await Promise.all([getQuotaCurrent(), getQuotaHistory()]);
      setCurrent(cur);
      setHistory(hist);
    } catch {
      showToast?.('เกิดข้อผิดพลาดในการโหลดข้อมูลโควตา', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── รีเฟรชจาก LINE API โดยตรง ────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await refreshQuota();
      setCurrent(fresh);
      // อัปเดต history ด้วยค่าใหม่ (แทน item ของเดือนนี้)
      setHistory(prev => {
        const next = [...prev];
        const idx = next.findIndex(h => h.month === fresh.month);
        if (idx >= 0) next[idx] = { ...next[idx], ...fresh };
        else next.unshift(fresh);
        return next;
      });
      showToast?.('อัปเดตโควตาสำเร็จ ✅', 'success');
    } catch {
      showToast?.('ไม่สามารถเชื่อมต่อ LINE API ได้', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const isWarning = current?.isWarning;
  const percent   = current?.percent ?? 0;
  const unlimited = current?.monthlyLimit === -1;

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div style={S.headerBar}>
        <div>
          <h2 style={S.title}>📡 LINE Quota</h2>
          <div style={S.sub}>ติดตามการใช้งานข้อความรายเดือน (อัปเดตอัตโนมัติทุกวัน 06:00 น.)</div>
        </div>
      </div>

      {/* ── Current Usage Card ───────────────────────────── */}
      {loading ? (
        <div style={S.center}>⏳ กำลังโหลด...</div>
      ) : !current || current.totalUsage === null ? (
        <div style={S.emptyCard}>
          ยังไม่มีข้อมูลโควตา ระบบจะดึงข้อมูลอัตโนมัติเวลา 06:00 น.
        </div>
      ) : (
        <div style={{ ...S.currentCard, borderColor: isWarning ? '#f59e0b' : '#e2e8f0' }}>
          {/* Warning Banner */}
          {isWarning && (
            <div style={S.warningBanner}>
              ⚠️ ใช้งานแล้ว {percent}% — เหลือโควตาน้อย กรุณาตรวจสอบแผน LINE OA
            </div>
          )}

          {/* Stats row */}
          <div style={S.statsRow}>
            <StatBox label="ใช้ไปแล้ว" value={current.totalUsage?.toLocaleString()} unit="ข้อความ" color="#1a5f9e" />
            <StatBox
              label="ขีดจำกัด"
              value={unlimited ? '∞' : current.monthlyLimit?.toLocaleString()}
              unit={unlimited ? 'ไม่จำกัด' : 'ข้อความ'}
              color="#6b7280"
            />
            <StatBox label="ใช้ไปแล้ว" value={unlimited ? '-' : `${percent}%`} unit="ของโควตา"
              color={percent >= 90 ? '#dc2626' : percent >= 80 ? '#d97706' : '#16a34a'}
            />
          </div>

          {/* Progress Bar */}
          {!unlimited && (
            <div style={{ marginTop: 20 }}>
              <div style={S.progressLabel}>
                <span>0</span>
                <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
                  อัปเดตล่าสุด: {current.updatedAt
                    ? new Date(current.updatedAt).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '-'}
                </span>
                <span>{current.monthlyLimit?.toLocaleString()}</span>
              </div>
              <div style={S.progressTrack}>
                <div style={{
                  ...S.progressBar,
                  width: `${percent}%`,
                  background: percent >= 90 ? '#dc2626' : percent >= 80 ? '#f59e0b' : '#1a5f9e',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ textAlign: 'center', marginTop: 6, fontWeight: 700, fontSize: '1rem',
                color: percent >= 90 ? '#dc2626' : percent >= 80 ? '#d97706' : '#1a5f9e' }}>
                {percent}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History Table ────────────────────────────────── */}
      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#475569', marginBottom: 10 }}>
            📅 ประวัติย้อนหลัง
          </div>
          <div style={S.tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>เดือน</Th>
                  <Th align="center">ใช้ไป</Th>
                  <Th align="center">ขีดจำกัด</Th>
                  <Th align="center">ร้อยละ</Th>
                  <Th align="center">สถานะ</Th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => {
                  const [y, m] = h.month.split('-');
                  const thYear = Number(y) + 543;
                  const monthName = new Date(Number(y), Number(m) - 1).toLocaleString('th-TH', { month: 'long' });
                  const pct = h.percent ?? 0;
                  const unlim = h.monthlyLimit === -1;
                  return (
                    <tr key={h.month} style={S.tr}>
                      <td style={S.td}>{monthName} {thYear}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>{h.totalUsage?.toLocaleString() ?? '-'}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>{unlim ? '∞' : h.monthlyLimit?.toLocaleString() ?? '-'}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        {unlim ? '-' : (
                          <div style={{ position: 'relative', background: '#f1f5f9', borderRadius: 4, height: 16, width: '100%', minWidth: 60 }}>
                            <div style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0,
                              width: `${pct}%`, borderRadius: 4,
                              background: pct >= 90 ? '#dc2626' : pct >= 80 ? '#f59e0b' : '#1a5f9e',
                            }} />
                            <span style={{ position: 'relative', fontSize: '0.72rem', fontWeight: 700, color: '#fff', paddingLeft: 4 }}>
                              {pct}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        {h.isWarning
                          ? <span style={S.badgeWarn}>⚠️ เกิน 80%</span>
                          : <span style={S.badgeOk}>✅ ปกติ</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub components ─────────────────────────────────────────
function StatBox({ label, value, unit, color }) {
  return (
    <div style={S.statBox}>
      <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{value ?? '-'}</div>
      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{unit}</div>
      <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Th({ children, align }) {
  return (
    <th style={{
      background: '#f1f5f9', padding: '10px 14px',
      textAlign: align || 'left', fontSize: '0.78rem',
      fontWeight: 700, color: '#64748b',
      borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  );
}

// ── Styles ─────────────────────────────────────────────────
const S = {
  headerBar: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 12, marginBottom: 20,
  },
  title: { fontSize: '1.1rem', fontWeight: 700, margin: 0 },
  sub: { fontSize: '0.78rem', color: '#64748b', marginTop: 3 },
  btnRefresh: {
    padding: '8px 16px', background: '#1a5f9e', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: '0.85rem', fontFamily: 'inherit', fontWeight: 600,
  },
  center: { textAlign: 'center', padding: 40, color: '#94a3b8' },
  emptyCard: {
    background: '#fffbeb', border: '1.5px dashed #f59e0b', borderRadius: 10,
    padding: '24px 20px', textAlign: 'center', color: '#92400e', fontSize: '0.9rem',
  },
  currentCard: {
    background: '#fff', borderRadius: 12, padding: '20px 24px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '2px solid #e2e8f0',
  },
  warningBanner: {
    background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
    padding: '10px 14px', marginBottom: 18, color: '#92400e',
    fontSize: '0.88rem', fontWeight: 600,
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
  },
  statBox: {
    textAlign: 'center', padding: '12px 8px',
    background: '#f8fafc', borderRadius: 10,
  },
  progressLabel: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: '0.75rem', color: '#94a3b8', marginBottom: 6,
  },
  progressTrack: {
    background: '#e2e8f0', borderRadius: 8, height: 18,
    overflow: 'hidden', position: 'relative',
  },
  progressBar: {
    height: '100%', borderRadius: 8, minWidth: 4,
  },
  tableWrap: {
    background: '#fff', borderRadius: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden',
  },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '10px 14px', fontSize: '0.85rem', verticalAlign: 'middle' },
  badgeWarn: {
    display: 'inline-block', padding: '2px 10px', borderRadius: 20,
    background: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: 600,
  },
  badgeOk: {
    display: 'inline-block', padding: '2px 10px', borderRadius: 20,
    background: '#dcfce7', color: '#166534', fontSize: '0.75rem', fontWeight: 600,
  },
};
