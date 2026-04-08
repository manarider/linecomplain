import { useState, useEffect } from 'react';
import { getComplainants, getComplainantTickets } from '../api';
import { STATUS_BADGE, formatDate } from '../constants';

// ปีปัจจุบัน พ.ศ.
const CURRENT_YEAR_TH = new Date().getFullYear() + 543;

export default function ComplainantsPage({ showToast }) {
  const [rows, setRows]                   = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear]   = useState(CURRENT_YEAR_TH);
  const [loading, setLoading]             = useState(true);
  // modal state
  const [modalPerson, setModalPerson]     = useState(null); // { lineUserId, displayName }

  useEffect(() => {
    setLoading(true);
    getComplainants({ year: selectedYear })
      .then(data => {
        setRows(data.rows);
        const years = data.availableYears.map(y => y + 543);
        setAvailableYears(years);
        if (years.length && !years.includes(selectedYear)) {
          setSelectedYear(years[0]);
        }
      })
      .catch(() => showToast?.('เกิดข้อผิดพลาดในการโหลดสถิติ', 'error'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  return (
    <div>
      {/* Modal รายการคำร้องรายคน */}
      {modalPerson && (
        <ComplainantModal
          person={modalPerson}
          onClose={() => setModalPerson(null)}
          showToast={showToast}
        />
      )}

      {/* Header bar */}
      <div style={S.headerBar}>
        <div>
          <h2 style={S.title}>📊 สถิติผู้ร้อง</h2>
          <div style={S.sub}>เรียงตามจำนวนการร้องมากสุด → น้อยสุด · คลิกแถวเพื่อดูรายการคำร้อง</div>
        </div>
        <select
          style={S.yearSelect}
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
        >
          {availableYears.length === 0 && <option value={selectedYear}>{selectedYear}</option>}
          {availableYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
        </select>
      </div>

      {/* Summary pill */}
      {!loading && (
        <div style={S.summaryPill}>
          พบ <strong>{rows.length}</strong> ผู้ร้อง · รวม <strong>{rows.reduce((a, r) => a + r.count, 0)}</strong> คำร้อง ในปี {selectedYear}
        </div>
      )}

      {/* Table */}
      <div style={S.tableWrap}>
        {loading ? (
          <div style={S.center}>⏳ กำลังโหลด...</div>
        ) : rows.length === 0 ? (
          <div style={S.center}>ไม่มีข้อมูลในปี {selectedYear}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>ชื่อผู้ร้อง</Th>
                <Th>LINE User ID</Th>
                <Th align="center">จำนวนคำร้อง</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r._id}
                  style={{
                    ...S.row,
                    background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                  }}
                  onClick={() => setModalPerson({ lineUserId: r._id, displayName: r.displayName })}
                >
                  <td style={S.td}>{idx + 1}</td>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600 }}>{r.displayName || '(ไม่ทราบชื่อ)'}</div>
                  </td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569' }}>
                    {r._id}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={{
                      ...S.countBadge,
                      background: r.count >= 10 ? '#fee2e2' : r.count >= 5 ? '#fef3c7' : '#dcfce7',
                      color:      r.count >= 10 ? '#dc2626' : r.count >= 5 ? '#d97706' : '#16a34a',
                    }}>
                      {r.count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Modal รายการคำร้องของผู้ร้องรายคน ─────────────────────
function ComplainantModal({ person, onClose, showToast }) {
  const [tickets, setTickets]             = useState([]);
  const [availableYears, setAvailableYears] = useState([]); // พ.ศ.
  const [selectedYear, setSelectedYear]   = useState(null);
  const [loading, setLoading]             = useState(true);

  // โหลดครั้งแรก — ดึงปีล่าสุดของคนนี้ก่อน
  useEffect(() => {
    setLoading(true);
    getComplainantTickets(person.lineUserId, {})
      .then(data => {
        const years = data.availableYears.map(y => y + 543).sort((a, b) => b - a);
        setAvailableYears(years);
        const latestYear = years[0] ?? CURRENT_YEAR_TH;
        setSelectedYear(latestYear);
        // กรองเฉพาะปีล่าสุดจาก tickets ที่ได้มา
        if (data.availableYears.length > 0) {
          const latestCE = data.availableYears[0]; // sorted desc
          setTickets(data.tickets.filter(t => new Date(t.createdAt).getFullYear() === latestCE));
        } else {
          setTickets(data.tickets);
        }
      })
      .catch(() => showToast?.('เกิดข้อผิดพลาดในการโหลดคำร้อง', 'error'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.lineUserId]);

  // โหลดใหม่เมื่อเลือกปีอื่น
  const handleYearChange = (y) => {
    setSelectedYear(y);
    setLoading(true);
    getComplainantTickets(person.lineUserId, { year: y })
      .then(data => setTickets(data.tickets))
      .catch(() => showToast?.('เกิดข้อผิดพลาดในการโหลดคำร้อง', 'error'))
      .finally(() => setLoading(false));
  };

  return (
    <div style={MS.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={MS.card}>
        {/* Header */}
        <div style={MS.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {person.displayName || '(ไม่ทราบชื่อ)'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
              {person.lineUserId}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Year dropdown — แสดงเฉพาะถ้ามีมากกว่า 1 ปี */}
            {availableYears.length > 1 && (
              <select
                style={MS.yearSelect}
                value={selectedYear ?? ''}
                onChange={e => handleYearChange(Number(e.target.value))}
              >
                {availableYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
              </select>
            )}
            {availableYears.length === 1 && (
              <span style={MS.yearPill}>ปี {availableYears[0]}</span>
            )}
            <button style={MS.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={MS.body}>
          {loading ? (
            <div style={MS.center}>⏳ กำลังโหลด...</div>
          ) : tickets.length === 0 ? (
            <div style={MS.center}>ไม่มีคำร้องในปี {selectedYear}</div>
          ) : (
            <>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>
                รวม <strong>{tickets.length}</strong> คำร้อง
              </div>
              {tickets.map(t => {
                const b = STATUS_BADGE[t.status];
                return (
                  <div key={t._id} style={MS.ticketRow}>
                    <div style={MS.ticketLeft}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1a5f9e' }}>
                        {t.ticketNo}
                      </div>
                      <div style={{ fontSize: '0.86rem', marginTop: 2 }}>{t.subject}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 3 }}>
                        🏢 {t.assignedDepartment} · 📅 {formatDate(t.createdAt)}
                      </div>
                    </div>
                    <span className={`status-badge ${b?.cls}`} style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
                      {b?.label || t.status}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub components ─────────────────────────────────────────
function Th({ children, align }) {
  return (
    <th style={{
      background: '#f1f5f9', padding: '10px 14px', textAlign: align || 'left',
      fontSize: '0.78rem', fontWeight: 700, color: '#64748b',
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
    flexWrap: 'wrap', gap: 12, marginBottom: 12,
  },
  title: { fontSize: '1.1rem', fontWeight: 700, margin: 0 },
  sub: { fontSize: '0.78rem', color: '#64748b', marginTop: 3 },
  yearSelect: {
    padding: '7px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: '0.88rem', fontFamily: 'inherit', background: '#fff',
    cursor: 'pointer', outline: 'none',
  },
  summaryPill: {
    display: 'inline-block', marginBottom: 14, padding: '5px 14px',
    background: '#eff6ff', borderRadius: 20, fontSize: '0.82rem', color: '#1e40af',
  },
  tableWrap: {
    background: '#fff', borderRadius: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden',
  },
  center: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: '0.9rem' },
  row: { transition: 'background 0.1s', cursor: 'pointer' },
  td: { padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '0.86rem', verticalAlign: 'top' },
  countBadge: {
    display: 'inline-block', padding: '2px 14px', borderRadius: 20,
    fontWeight: 700, fontSize: '0.9rem',
  },
};

const MS = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  card: {
    background: '#fff', borderRadius: 14, width: '100%', maxWidth: 600,
    maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
  },
  header: {
    padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    position: 'sticky', top: 0, background: '#fff', borderRadius: '14px 14px 0 0',
  },
  yearSelect: {
    padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: '0.82rem', fontFamily: 'inherit', background: '#f8fafc',
    cursor: 'pointer', outline: 'none',
  },
  yearPill: {
    display: 'inline-block', padding: '4px 12px', background: '#eff6ff',
    borderRadius: 20, fontSize: '0.78rem', color: '#1e40af', fontWeight: 600,
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '1.2rem',
    cursor: 'pointer', color: '#94a3b8', lineHeight: 1, padding: 2,
  },
  body: { overflowY: 'auto', padding: '16px 20px', flex: 1 },
  center: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: '0.9rem' },
  ticketRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
    padding: '12px 0', borderBottom: '1px solid #f1f5f9',
  },
  ticketLeft: { flex: 1, minWidth: 0 },
};

