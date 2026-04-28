import { useState, useEffect, useCallback, useRef } from 'react';
import { getComplainantProfiles } from '../api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function LineUsersPage({ showToast }) {
  const [rows, setRows]             = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);

  // เก็บ query ที่ใช้ค้นหาจริง ๆ (แยกจาก input ที่กำลังพิมพ์)
  const [appliedSearch, setAppliedSearch] = useState('');
  // ใช้ ref เพื่อไม่ให้ showToast เข้า deps ของ useCallback (ป้องกัน infinite loop)
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const fetchData = useCallback(async (p, q) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (q) params.search = q;
      const data = await getComplainantProfiles(params);
      setRows(data.profiles);
      setPagination(data.pagination);
    } catch (err) {
      showToastRef.current?.(
        err?.message ? `โหลดข้อมูลไม่สำเร็จ: ${err.message}` : 'เกิดข้อผิดพลาดในการโหลดข้อมูล',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, []); // stable — ไม่ขึ้นกับ prop ใด

  // โหลดครั้งแรก + โหลดใหม่เมื่อ page หรือ appliedSearch เปลี่ยน
  useEffect(() => {
    fetchData(page, appliedSearch);
  }, [fetchData, page, appliedSearch]);

  const handleSearch = () => {
    setPage(1);
    setAppliedSearch(search);
  };

  const handleClear = () => {
    setSearch('');
    setPage(1);
    setAppliedSearch('');
  };

  const goPage = (p) => {
    setPage(p);
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div style={S.headerBar}>
        <div>
          <h2 style={S.title}>📱 ผู้ใช้ LINE</h2>
          <div style={S.sub}>รายชื่อผู้ร้องที่เคยส่งคำร้องผ่าน LINE LIFF</div>
        </div>
        <div style={S.totalBadge}>
          ทั้งหมด <strong>{pagination.total ?? '—'}</strong> คน
        </div>
      </div>

      {/* ── Search Bar ──────────────────────────────────── */}
      <div style={S.searchCard}>
        <div style={S.searchRow}>
          <input
            style={S.input}
            placeholder="🔍 ค้นหาชื่อ LINE หรือเบอร์โทร..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button style={S.btnSearch} onClick={handleSearch}>ค้นหา</button>
          {(search || appliedSearch) && (
            <button style={S.btnClear} onClick={handleClear}>✕ ล้าง</button>
          )}
        </div>
        {pagination.totalPages > 1 && (
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 6 }}>
            หน้า {page} / {pagination.totalPages}
          </div>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      {loading ? (
        <div style={S.loading}>⏳ กำลังโหลด...</div>
      ) : rows.length === 0 ? (
        <div style={S.empty}>ไม่พบข้อมูล</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr style={S.thead}>
                <th style={S.th}>#</th>
                <th style={S.th}>โปรไฟล์</th>
                <th style={S.th}>LINE User ID</th>
                <th style={S.th}>เบอร์โทร</th>
                <th style={S.th}>ข้อความสถานะ</th>
                <th style={{ ...S.th, textAlign: 'center' }}>คำร้องทั้งหมด</th>
                <th style={S.th}>ครั้งแรก</th>
                <th style={S.th}>ครั้งล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row._id} style={{ ...S.tr, background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {/* ลำดับ */}
                  <td style={{ ...S.td, ...S.tdNo }}>
                    {(page - 1) * 20 + idx + 1}
                  </td>

                  {/* โปรไฟล์ */}
                  <td style={S.td}>
                    <div style={S.profileCell}>
                      {row.pictureUrl ? (
                        <img
                          src={row.pictureUrl}
                          alt={row.displayName}
                          style={S.avatar}
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div style={S.avatarFallback}>
                          {(row.displayName || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={S.displayName}>{row.displayName || '—'}</div>
                      </div>
                    </div>
                  </td>

                  {/* LINE User ID */}
                  <td style={{ ...S.td, ...S.tdMono }}>{row._id}</td>

                  {/* เบอร์โทร */}
                  <td style={S.td}>{row.phone || <span style={S.na}>—</span>}</td>

                  {/* ข้อความสถานะ */}
                  <td style={{ ...S.td, ...S.tdStatus }}>
                    {row.statusMessage ? (
                      <span style={S.statusMsg}>{row.statusMessage}</span>
                    ) : (
                      <span style={S.na}>—</span>
                    )}
                  </td>

                  {/* จำนวนคำร้อง */}
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={S.countBadge}>{row.count}</span>
                  </td>

                  {/* ครั้งแรก */}
                  <td style={{ ...S.td, ...S.tdDate }}>{formatDate(row.firstTicketAt)}</td>

                  {/* ครั้งล่าสุด */}
                  <td style={{ ...S.td, ...S.tdDate }}>{formatDate(row.lastTicketAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────── */}
      {!loading && pagination.totalPages > 1 && (
        <div style={S.pager}>
          <button style={S.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>‹ ก่อนหน้า</button>
          {buildPageRange(page, pagination.totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} style={{ padding: '0 4px', alignSelf: 'center' }}>…</span>
            ) : (
              <button
                key={p}
                style={{ ...S.pageBtn, ...(p === page ? S.pageBtnActive : {}) }}
                onClick={() => goPage(p)}
              >{p}</button>
            )
          )}
          <button style={S.pageBtn} disabled={page >= pagination.totalPages} onClick={() => goPage(page + 1)}>ถัดไป ›</button>
        </div>
      )}
    </div>
  );
}

/** สร้าง array ของหน้าที่จะแสดงในปุ่ม pagination พร้อม '…' */
function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current]);
  if (current > 1) pages.add(current - 1);
  if (current < total) pages.add(current + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

// ── Styles ────────────────────────────────────────────────
const S = {
  headerBar:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  title:        { margin: 0, fontSize: '1.15rem', fontWeight: 700 },
  sub:          { fontSize: '0.8rem', color: '#64748b', marginTop: 2 },
  totalBadge:   { background: '#e0f2fe', color: '#0369a1', padding: '4px 14px', borderRadius: 20, fontSize: '0.85rem', alignSelf: 'center' },

  searchCard:   { background: '#fff', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 14 },
  searchRow:    { display: 'flex', gap: 8 },
  input:        { flex: 1, padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none' },
  btnSearch:    { padding: '9px 18px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnClear:     { padding: '9px 14px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 7, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },

  loading:      { textAlign: 'center', padding: 40, color: '#64748b' },
  empty:        { textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: '0.9rem' },

  tableWrap:    { overflowX: 'auto', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  table:        { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '0.84rem' },
  thead:        { background: '#f1f5f9' },
  th:           { padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.8rem', color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  tr:           { borderBottom: '1px solid #f1f5f9' },
  td:           { padding: '10px 12px', verticalAlign: 'middle' },
  tdNo:         { color: '#9ca3af', fontSize: '0.78rem', width: 36, textAlign: 'center' },
  tdMono:       { fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap' },
  tdDate:       { whiteSpace: 'nowrap', color: '#475569', fontSize: '0.8rem' },
  tdStatus:     { maxWidth: 180 },

  profileCell:  { display: 'flex', alignItems: 'center', gap: 10 },
  avatar:       { width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #e2e8f0' },
  avatarFallback: { width: 38, height: 38, borderRadius: '50%', background: '#1a5f9e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 },
  displayName:  { fontWeight: 600, fontSize: '0.88rem', color: '#1e293b' },

  statusMsg:    { fontSize: '0.78rem', color: '#475569', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  na:           { color: '#cbd5e1' },
  countBadge:   { display: 'inline-block', background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, fontSize: '0.85rem', padding: '2px 10px', borderRadius: 12 },

  pager:        { display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap', alignItems: 'center' },
  pageBtn:      { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' },
  pageBtnActive:{ background: '#1a5f9e', color: '#fff', border: '1px solid #1a5f9e' },
};
