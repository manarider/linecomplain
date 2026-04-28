import { useState, useEffect, useCallback } from 'react';
import { getComplainants, getComplainantTickets, getComplainantProfiles } from '../api';
import { STATUS_BADGE, formatDate } from '../constants';

// ปีปัจจุบัน พ.ศ.
const CURRENT_YEAR_TH = new Date().getFullYear() + 543;

export default function ComplainantsPage({ showToast }) {
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'profiles'
  const [modalPerson, setModalPerson] = useState(null); // { lineUserId, displayName, pictureUrl, phone, statusMessage }

  return (
    <div>
      {modalPerson && (
        <ComplainantModal
          person={modalPerson}
          onClose={() => setModalPerson(null)}
          showToast={showToast}
        />
      )}

      {/* ── Tab bar ─────────────────────────────────────── */}
      <div style={S.tabBar}>
        <button
          style={{ ...S.tabBtn, ...(activeTab === 'stats' ? S.tabBtnActive : {}) }}
          onClick={() => setActiveTab('stats')}
        >
          📊 สถิติการร้อง
        </button>
        <button
          style={{ ...S.tabBtn, ...(activeTab === 'profiles' ? S.tabBtnActive : {}) }}
          onClick={() => setActiveTab('profiles')}
        >
          👤 ข้อมูลผู้ร้อง
        </button>
      </div>

      {activeTab === 'stats' && (
        <StatsTab showToast={showToast} onSelectPerson={setModalPerson} />
      )}
      {activeTab === 'profiles' && (
        <ProfilesTab showToast={showToast} onSelectPerson={setModalPerson} />
      )}
    </div>
  );
}

// ── Tab 1: สถิติการร้อง ────────────────────────────────────
function StatsTab({ showToast, onSelectPerson }) {
  const [rows, setRows]                   = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear]   = useState(CURRENT_YEAR_TH);
  const [loading, setLoading]             = useState(true);

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
      <div style={S.headerBar}>
        <div>
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

      {!loading && (
        <div style={S.summaryPill}>
          พบ <strong>{rows.length}</strong> ผู้ร้อง · รวม <strong>{rows.reduce((a, r) => a + r.count, 0)}</strong> คำร้อง ในปี {selectedYear}
        </div>
      )}

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
                  style={{ ...S.row, background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}
                  onClick={() => onSelectPerson({ lineUserId: r._id, displayName: r.displayName })}
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

// ── Tab 2: ข้อมูลผู้ร้อง ──────────────────────────────────
function ProfilesTab({ showToast, onSelectPerson }) {
  const [profiles, setProfiles] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage]         = useState(1);

  const load = useCallback((p = 1, s = search) => {
    setLoading(true);
    const params = { page: p, limit: 20 };
    if (s) params.search = s;
    getComplainantProfiles(params)
      .then(data => {
        setProfiles(data.profiles);
        setPagination(data.pagination);
      })
      .catch(() => showToast?.('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { load(1, ''); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
    load(1, searchInput);
  };

  const goPage = (p) => { setPage(p); load(p); };

  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          style={S.searchInput}
          placeholder="ค้นหาชื่อผู้ร้อง..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button style={S.searchBtn} onClick={handleSearch}>🔍 ค้นหา</button>
      </div>

      {!loading && pagination.total != null && (
        <div style={S.summaryPill}>
          พบ <strong>{pagination.total}</strong> ผู้ร้องทั้งหมด
        </div>
      )}

      <div style={S.tableWrap}>
        {loading ? (
          <div style={S.center}>⏳ กำลังโหลด...</div>
        ) : profiles.length === 0 ? (
          <div style={S.center}>ไม่พบข้อมูล</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>โปรไฟล์ LINE</Th>
                <Th>เบอร์โทร</Th>
                <Th>ข้อความสถานะ</Th>
                <Th align="center">คำร้อง</Th>
                <Th>ล่าสุด</Th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, idx) => (
                <tr
                  key={p._id}
                  style={{ ...S.row, background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}
                  onClick={() => onSelectPerson({
                    lineUserId: p._id,
                    displayName: p.displayName,
                    pictureUrl: p.pictureUrl,
                    phone: p.phone,
                    statusMessage: p.statusMessage,
                  })}
                >
                  <td style={S.td}>{(page - 1) * 20 + idx + 1}</td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {p.pictureUrl ? (
                        <img
                          src={p.pictureUrl}
                          alt=""
                          style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid #e2e8f0' }}
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                          👤
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.displayName || '(ไม่ทราบชื่อ)'}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: 1 }}>{p._id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={S.td}>
                    {p.phone ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '0.86rem' }}>{p.phone}</span>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>-</span>
                    )}
                  </td>
                  <td style={{ ...S.td, color: '#64748b', fontSize: '0.82rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.statusMessage || <span style={{ color: '#cbd5e1' }}>-</span>}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={{
                      ...S.countBadge,
                      background: p.count >= 10 ? '#fee2e2' : p.count >= 5 ? '#fef3c7' : '#dcfce7',
                      color:      p.count >= 10 ? '#dc2626' : p.count >= 5 ? '#d97706' : '#16a34a',
                    }}>
                      {p.count}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {p.lastTicketAt ? formatDate(p.lastTicketAt) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={S.pagination}>
          <button style={S.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>‹ ก่อนหน้า</button>
          <span style={{ fontSize: '0.82rem', color: '#64748b' }}>หน้า {page}/{pagination.totalPages}</span>
          <button style={S.pageBtn} disabled={page >= pagination.totalPages} onClick={() => goPage(page + 1)}>ถัดไป ›</button>
        </div>
      )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            {person.pictureUrl ? (
              <img
                src={person.pictureUrl}
                alt=""
                style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #e2e8f0' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                👤
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {person.displayName || '(ไม่ทราบชื่อ)'}
              </div>
              {person.statusMessage && (
                <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  💬 {person.statusMessage}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                {person.phone && (
                  <span style={{ fontSize: '0.76rem', color: '#1a5f9e', fontFamily: 'monospace' }}>📞 {person.phone}</span>
                )}
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>{person.lineUserId}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
  tabBar: {
    display: 'flex', gap: 4, marginBottom: 16,
    borderBottom: '2px solid #e2e8f0', paddingBottom: 0,
  },
  tabBtn: {
    padding: '8px 18px', border: 'none', background: 'none',
    fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 600,
    color: '#64748b', cursor: 'pointer', borderRadius: '8px 8px 0 0',
    borderBottom: '2px solid transparent', marginBottom: -2,
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabBtnActive: {
    color: '#1a5f9e', borderBottom: '2px solid #1a5f9e', background: '#eff6ff',
  },
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
  searchInput: {
    flex: 1, padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none',
  },
  searchBtn: {
    padding: '8px 16px', background: '#1a5f9e', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: '0.85rem', fontFamily: 'inherit', fontWeight: 600,
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
  td: { padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '0.86rem', verticalAlign: 'middle' },
  countBadge: {
    display: 'inline-block', padding: '2px 14px', borderRadius: 20,
    fontWeight: 700, fontSize: '0.9rem',
  },
  pagination: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 14, marginTop: 14,
  },
  pageBtn: {
    padding: '6px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8,
    background: '#fff', fontSize: '0.83rem', fontFamily: 'inherit',
    cursor: 'pointer', color: '#374151',
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

