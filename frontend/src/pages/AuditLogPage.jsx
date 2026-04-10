import { useState, useEffect, useCallback } from 'react';
import { getAuditLogs, getAuditMeta } from '../api';

// ── Action แปลเป็นภาษาไทย ─────────────────────────────────
const ACTION_LABEL = {
  CREATE_TICKET:  '📝 แจ้งเรื่อง',
  UPDATE_STATUS:  '🔄 เปลี่ยนสถานะ',
  FORWARD_TICKET: '📨 ส่งต่อ',
  LOGIN:          '🔑 เข้าสู่ระบบ',
  LOGIN_FAILED:   '🚫 Login ล้มเหลว',
  LOGOUT:         '🚪 ออกจากระบบ',
};

const CATEGORY_LABEL = {
  ticket:     '📋 คำร้อง',
  auth:       '🔐 Auth',
  line_group: '💬 LINE Group',
  user:       '👤 ผู้ใช้',
  system:     '⚙️ ระบบ',
};

const ROLE_BADGE = {
  superadmin: { bg: '#7c3aed', label: '👑 Super Admin' },
  admin:      { bg: '#1d4ed8', label: '🔑 Admin' },
  executive:  { bg: '#0f766e', label: '🏅 Executive' },
  staff:      { bg: '#374151', label: '👤 Staff' },
  liff:       { bg: '#b45309', label: '📱 LINE User' },
  system:     { bg: '#6b7280', label: '⚙️ System' },
};

export default function AuditLogPage({ showToast }) {
  const [logs, setLogs]             = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading]       = useState(true);
  const [meta, setMeta]             = useState({ actions: [], categories: [] });

  // ── Filter state ──────────────────────────────────────────
  const [search,   setSearch]   = useState('');
  const [action,   setAction]   = useState('');
  const [category, setCategory] = useState('');
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');
  const [page,     setPage]     = useState(1);

  // ── โหลด meta (dropdown options) ────────────────────────────
  useEffect(() => {
    getAuditMeta()
      .then(setMeta)
      .catch(() => {});
  }, []);

  // ── โหลด logs ──────────────────────────────────────────────
  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50 };
      if (search)   params.search   = search;
      if (action)   params.action   = action;
      if (category) params.category = category;
      if (from)     params.from     = from;
      if (to)       params.to       = to;
      const data = await getAuditLogs(params);
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch {
      showToast?.('เกิดข้อผิดพลาดในการโหลด Audit Log', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, action, category, from, to, showToast]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [action, category, from, to]);   // eslint-disable-line

  const handleSearch = () => { setPage(1); fetchLogs(1); };
  const goPage = (p) => { setPage(p); fetchLogs(p); };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div style={S.headerBar}>
        <div>
          <h2 style={S.title}>🗂️ Audit Log</h2>
          <div style={S.sub}>บันทึกการใช้งานระบบ — เก็บย้อนหลัง 120 วัน</div>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────── */}
      <div style={S.filterCard}>
        {/* ค้นหา text */}
        <div style={S.filterRow}>
          <input
            style={S.input}
            placeholder="🔍 ค้นหาชื่อ, รายละเอียด, เลขที่คำร้อง..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button style={S.btnSearch} onClick={handleSearch}>ค้นหา</button>
        </div>

        {/* dropdowns + date range */}
        <div style={S.filterRow2}>
          <select style={S.select} value={action} onChange={e => setAction(e.target.value)}>
            <option value="">— ทุกการกระทำ —</option>
            {meta.actions.sort().map(a => (
              <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
            ))}
          </select>

          <select style={S.select} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">— ทุกหมวด —</option>
            {meta.categories.sort().map(c => (
              <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>
            ))}
          </select>

          <input type="date" style={S.dateInput} value={from} onChange={e => setFrom(e.target.value)} title="จากวันที่" />
          <span style={{ alignSelf: 'center', color: '#64748b' }}>ถึง</span>
          <input type="date" style={S.dateInput} value={to}   onChange={e => setTo(e.target.value)}   title="ถึงวันที่" />

          {(search || action || category || from || to) && (
            <button style={S.btnClear} onClick={() => {
              setSearch(''); setAction(''); setCategory(''); setFrom(''); setTo('');
            }}>✕ ล้าง</button>
          )}
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────── */}
      <div style={S.statsRow}>
        <span style={S.statsBadge}>
          ทั้งหมด <strong>{pagination.total ?? '—'}</strong> รายการ
        </span>
        {pagination.totalPages > 1 && (
          <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
            หน้า {page} / {pagination.totalPages}
          </span>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      {loading ? (
        <div style={S.loading}>⏳ กำลังโหลด...</div>
      ) : logs.length === 0 ? (
        <div style={S.empty}>ไม่พบข้อมูล</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr style={S.thead}>
                <th style={S.th}>เวลา</th>
                <th style={S.th}>ผู้กระทำ</th>
                <th style={S.th}>การกระทำ</th>
                <th style={S.th}>รายละเอียด</th>
                <th style={S.th}>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const roleCfg = ROLE_BADGE[log.actorRole] || ROLE_BADGE.system;
                return (
                  <tr key={log._id} style={S.tr}>
                    <td style={{ ...S.td, ...S.tdTime }}>
                      {new Date(log.createdAt).toLocaleString('th-TH', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </td>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.actorName}</div>
                      <span style={{ ...S.rolePill, background: roleCfg.bg }}>
                        {roleCfg.label}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={{
                        ...S.actionPill,
                        background: log.success === false ? '#fee2e2' : '#e0f2fe',
                        color:      log.success === false ? '#991b1b' : '#0369a1',
                      }}>
                        {ACTION_LABEL[log.action] || log.action}
                      </span>
                      <div style={S.categoryTag}>
                        {CATEGORY_LABEL[log.category] || log.category}
                      </div>
                    </td>
                    <td style={{ ...S.td, maxWidth: 320 }}>
                      <div style={S.detail}>{log.detail}</div>
                      {log.targetId && (
                        <div style={S.target}>🎯 {log.targetId}{log.targetLabel ? ` — ${log.targetLabel}` : ''}</div>
                      )}
                      {log.errorMessage && (
                        <div style={S.errText}>⚠️ {log.errorMessage}</div>
                      )}
                    </td>
                    <td style={{ ...S.td, ...S.tdIp }}>{log.ip || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────── */}
      {pagination.totalPages > 1 && (
        <div style={S.pager}>
          <button style={S.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>‹ ก่อนหน้า</button>
          {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                style={{ ...S.pageBtn, ...(p === page ? S.pageBtnActive : {}) }}
                onClick={() => goPage(p)}
              >{p}</button>
            );
          })}
          {pagination.totalPages > 7 && page < pagination.totalPages && (
            <>
              <span style={{ padding: '0 4px' }}>…</span>
              <button style={S.pageBtn} onClick={() => goPage(pagination.totalPages)}>
                {pagination.totalPages}
              </button>
            </>
          )}
          <button style={S.pageBtn} disabled={page >= pagination.totalPages} onClick={() => goPage(page + 1)}>ถัดไป ›</button>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────
const S = {
  headerBar:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title:      { margin: 0, fontSize: '1.15rem', fontWeight: 700 },
  sub:        { fontSize: '0.8rem', color: '#64748b', marginTop: 2 },

  filterCard: { background: '#fff', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 14 },
  filterRow:  { display: 'flex', gap: 8, marginBottom: 10 },
  filterRow2: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },

  input:      { flex: 1, padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none' },
  select:     { padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: '0.85rem', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' },
  dateInput:  { padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: '0.85rem', fontFamily: 'inherit' },
  btnSearch:  { padding: '9px 18px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  btnClear:   { padding: '8px 14px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 7, fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer' },

  statsRow:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  statsBadge: { background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: 20, fontSize: '0.82rem' },
  loading:    { textAlign: 'center', padding: 40, color: '#64748b' },
  empty:      { textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: '0.9rem' },

  tableWrap:  { overflowX: 'auto', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  table:      { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '0.84rem' },
  thead:      { background: '#f1f5f9' },
  th:         { padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.8rem', color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  tr:         { borderBottom: '1px solid #f1f5f9' },
  td:         { padding: '10px 12px', verticalAlign: 'top' },
  tdTime:     { whiteSpace: 'nowrap', color: '#475569', fontSize: '0.8rem', minWidth: 120 },
  tdIp:       { color: '#64748b', fontSize: '0.78rem', whiteSpace: 'nowrap' },

  rolePill:   { display: 'inline-block', marginTop: 3, padding: '1px 7px', borderRadius: 20, fontSize: '0.72rem', color: '#fff', fontWeight: 600 },
  actionPill: { display: 'inline-block', padding: '2px 8px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 600 },
  categoryTag:{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 },
  detail:     { fontSize: '0.84rem', lineHeight: 1.4 },
  target:     { fontSize: '0.76rem', color: '#0369a1', marginTop: 3 },
  errText:    { fontSize: '0.76rem', color: '#dc2626', marginTop: 3 },

  pager:      { display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' },
  pageBtn:    { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' },
  pageBtnActive: { background: '#1a5f9e', color: '#fff', border: '1px solid #1a5f9e' },
};
