import { useState, useEffect, useCallback } from 'react';
import { DEPARTMENTS } from '../constants';
import { getSatisfactionSummary } from '../api';

// ── ปีงบประมาณ (พ.ศ.) ────────────────────────────────────────
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1; // 1-12
// ปีงบฯ ปัจจุบัน = ค.ศ. + 543 (ถ้าเดือน ต.ค.-ธ.ค. นับเป็นปีถัดไป)
const currentFY = currentMonth >= 10
  ? (currentYear + 1) + 543
  : currentYear + 543;

const FISCAL_YEARS = Array.from({ length: 4 }, (_, i) => currentFY - i);
const YEARS_CE = Array.from({ length: 4 }, (_, i) => currentYear - i);
const MONTHS = [
  { v: 1, label: 'มกราคม' }, { v: 2, label: 'กุมภาพันธ์' }, { v: 3, label: 'มีนาคม' },
  { v: 4, label: 'เมษายน' }, { v: 5, label: 'พฤษภาคม' },   { v: 6, label: 'มิถุนายน' },
  { v: 7, label: 'กรกฎาคม' },{ v: 8, label: 'สิงหาคม' },   { v: 9, label: 'กันยายน' },
  { v: 10, label: 'ตุลาคม' },{ v: 11, label: 'พฤศจิกายน' },{ v: 12, label: 'ธันวาคม' },
];

// ── Stars display ─────────────────────────────────────────────
const StarDisplay = ({ score, size = 18 }) => (
  <span style={{ fontSize: size, lineHeight: 1 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <span key={i} style={{ color: i <= Math.round(score) ? '#f59e0b' : '#d1d5db' }}>★</span>
    ))}
  </span>
);

// ── Bar chart แนวนอน ───────────────────────────────────────────
const HorizBar = ({ value, max, color = '#f59e0b', height = 20 }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{
        flex: 1, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', height,
      }}>
        <div style={{
          width: `${pct}%`, background: color, height: '100%',
          borderRadius: 4, transition: 'width 0.6s ease',
          minWidth: value > 0 ? 4 : 0,
        }} />
      </div>
      <span style={{ fontSize: 13, color: '#374151', minWidth: 28, textAlign: 'right', fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
};

// ── คะแนนเฉลี่ย badge ────────────────────────────────────────
const ScoreBadge = ({ avg }) => {
  const color = avg >= 4.5 ? '#16a34a' : avg >= 3.5 ? '#2563eb' : avg >= 2.5 ? '#d97706' : '#dc2626';
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 20,
      padding: '3px 12px', fontWeight: 700, fontSize: 15,
    }}>
      {avg.toFixed(2)}
    </span>
  );
};

export default function SatisfactionPage({ showToast }) {
  // ── Filter state ──────────────────────────────────────────
  const [periodType, setPeriodType]   = useState('all');    // all | month | fiscal
  const [selYear, setSelYear]         = useState(currentYear);
  const [selMonth, setSelMonth]       = useState(currentMonth);
  const [selFY, setSelFY]             = useState(currentFY);
  const [selDept, setSelDept]         = useState('');

  // ── Data state ────────────────────────────────────────────
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);

  // ── โหลดข้อมูล ──────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (periodType === 'month') {
        params.year  = selYear;
        params.month = selMonth;
      } else if (periodType === 'fiscal') {
        params.fiscalYear = selFY;
      }
      if (selDept) params.department = selDept;
      const result = await getSatisfactionSummary(params);
      setData(result);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [periodType, selYear, selMonth, selFY, selDept, showToast]);

  useEffect(() => { load(); }, [load]);

  const { overview, byDepartment } = data || { overview: null, byDepartment: [] };
  const maxDist = overview
    ? Math.max(...Object.values(overview.distribution), 1)
    : 1;

  // ── รายชื่อเดือนภาษาไทย ───────────────────────────────────
  const periodLabel = () => {
    if (periodType === 'month') {
      const mn = MONTHS.find(m => m.v === selMonth)?.label || '';
      return `${mn} ${selYear + 543}`;
    }
    if (periodType === 'fiscal') return `ปีงบประมาณ ${selFY}`;
    return 'ทั้งหมด';
  };

  return (
    <div style={{ padding: '0 0 32px' }}>

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <div style={S.filterBar}>
        {/* ประเภทช่วงเวลา */}
        <select style={S.sel} value={periodType} onChange={e => setPeriodType(e.target.value)}>
          <option value="all">ทั้งหมด</option>
          <option value="month">รายเดือน</option>
          <option value="fiscal">ปีงบประมาณ</option>
        </select>

        {/* รายเดือน */}
        {periodType === 'month' && (<>
          <select style={S.sel} value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}>
            {YEARS_CE.map(y => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
          <select style={S.sel} value={selMonth} onChange={e => setSelMonth(parseInt(e.target.value))}>
            {MONTHS.map(m => (
              <option key={m.v} value={m.v}>{m.label}</option>
            ))}
          </select>
        </>)}

        {/* ปีงบประมาณ */}
        {periodType === 'fiscal' && (
          <select style={S.sel} value={selFY} onChange={e => setSelFY(parseInt(e.target.value))}>
            {FISCAL_YEARS.map(fy => (
              <option key={fy} value={fy}>ปีงบประมาณ {fy}</option>
            ))}
          </select>
        )}

        {/* หน่วยงาน */}
        <select style={S.sel} value={selDept} onChange={e => setSelDept(e.target.value)}>
          <option value="">ทุกหน่วยงาน</option>
          {DEPARTMENTS.filter(d => d !== 'ไม่แน่ใจ').map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>กำลังโหลด...</div>
      )}

      {!loading && overview && (
        <>
          {/* ── Summary Cards ────────────────────────────────── */}
          <div style={S.cardRow}>
            <div style={S.card}>
              <div style={S.cardLabel}>คะแนนเฉลี่ยรวม</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: '#f59e0b', lineHeight: 1.1 }}>
                {overview.avgScore.toFixed(2)}
              </div>
              <StarDisplay score={overview.avgScore} size={24} />
              <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>เต็ม 5 ดาว</div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>จำนวนผู้ประเมิน</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: '#1a5f9e', lineHeight: 1.1 }}>
                {overview.totalRated.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>ราย</div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>ช่วงเวลา</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginTop: 8 }}>
                {periodLabel()}
              </div>
              {selDept && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{selDept}</div>
              )}
            </div>
          </div>

          {/* ── การกระจายคะแนน ───────────────────────────────── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>📊 การกระจายคะแนน</div>
            <div style={S.distGrid}>
              {[5, 4, 3, 2, 1].map(star => {
                const count = overview.distribution[star] || 0;
                const pct = overview.totalRated > 0
                  ? ((count / overview.totalRated) * 100).toFixed(1)
                  : '0.0';
                const barColor = star === 5 ? '#16a34a' : star === 4 ? '#2563eb'
                  : star === 3 ? '#d97706' : star === 2 ? '#ea580c' : '#dc2626';
                return (
                  <div key={star} style={S.distRow}>
                    <div style={{ minWidth: 90, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 18, color: '#f59e0b' }}>{'★'.repeat(star)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <HorizBar value={count} max={maxDist} color={barColor} height={22} />
                    </div>
                    <div style={{ minWidth: 48, textAlign: 'right', fontSize: 12, color: '#6b7280' }}>
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── แยกหน่วยงาน ──────────────────────────────────── */}
          {!selDept && byDepartment.length > 0 && (
            <div style={S.section}>
              <div style={S.sectionTitle}>🏢 คะแนนแยกหน่วยงาน</div>
              <div style={S.deptTable}>
                {/* Header */}
                <div style={{ ...S.deptRow, background: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>
                  <div style={{ flex: 3 }}>หน่วยงาน</div>
                  <div style={{ flex: 4 }}>คะแนนเฉลี่ย</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>ผู้ประเมิน</div>
                </div>
                {byDepartment.map(d => {
                  const maxAvg = Math.max(...byDepartment.map(x => x.avgScore), 1);
                  const pct = maxAvg > 0 ? (d.avgScore / 5) * 100 : 0;
                  const barColor = d.avgScore >= 4.5 ? '#16a34a' : d.avgScore >= 3.5 ? '#2563eb'
                    : d.avgScore >= 2.5 ? '#d97706' : '#dc2626';
                  return (
                    <div key={d.department} style={S.deptRow}>
                      <div style={{ flex: 3, fontSize: 13, color: '#374151', paddingRight: 8 }}>
                        {d.department}
                      </div>
                      <div style={{ flex: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', height: 18 }}>
                          <div style={{
                            width: `${pct}%`, background: barColor, height: '100%',
                            borderRadius: 4, transition: 'width 0.6s ease',
                            minWidth: d.avgScore > 0 ? 4 : 0,
                          }} />
                        </div>
                        <ScoreBadge avg={d.avgScore} />
                        <StarDisplay score={d.avgScore} size={13} />
                      </div>
                      <div style={{ flex: 1, textAlign: 'right', fontSize: 13, color: '#374151', fontWeight: 600 }}>
                        {d.totalRated}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── กรณีไม่มีข้อมูล ───────────────────────────────── */}
          {overview.totalRated === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 15 }}>
              ยังไม่มีข้อมูลการประเมินในช่วงที่เลือก
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const S = {
  filterBar: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
    marginBottom: 24, alignItems: 'center',
  },
  sel: {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
    fontSize: 14, background: '#fff', color: '#374151',
    cursor: 'pointer', outline: 'none',
  },
  cardRow: {
    display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24,
  },
  card: {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: '20px 24px', minWidth: 180, flex: 1,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardLabel: {
    fontSize: 13, color: '#64748b', fontWeight: 600,
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  section: {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: '20px 24px', marginBottom: 20,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 16,
  },
  distGrid: {
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  distRow: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  deptTable: {
    display: 'flex', flexDirection: 'column', gap: 0,
    border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden',
  },
  deptRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
  },
};
