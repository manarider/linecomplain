import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, doLogout, getSummary, getTickets, getQuotaCurrent } from '../api';
import { TICKET_STATUS, STATUS_BADGE, FULL_ACCESS_ROLES, formatDate, DEPARTMENTS } from '../constants';
import TicketModal from '../components/TicketModal';
import LineGroupsPage from './LineGroupsPage';
import ComplainantsPage from './ComplainantsPage';
import QuotaPage from './QuotaPage';
import AuditLogPage from './AuditLogPage';

export default function DashboardPage() {
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────
  const [user, setUser]             = useState(null);
  const [summary, setSummary]       = useState({});
  const [tickets, setTickets]       = useState([]);
  const [pagination, setPagination] = useState({});
  const [filterStatus, setFilterStatus] = useState('รอรับเรื่อง');
  const [filterDept, setFilterDept]     = useState('');
  const [search, setSearch]             = useState('');
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast]         = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu]   = useState('tickets');
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth <= 768);
  const [quotaWarning, setQuotaWarning] = useState(false); // กระพริบเมนู quota

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showToast = (msg, type = '') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── โหลด User ─────────────────────────────────────────────
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  // ── ตรวจโควตา LINE (superadmin เท่านั้น) ────────────────
  useEffect(() => {
    if (!user || user.role !== 'superadmin') return;
    getQuotaCurrent()
      .then(data => setQuotaWarning(data?.isWarning ?? false))
      .catch(() => {}); // ถ้า error ไม่ต้องแจ้ง — ไม่ block UI
  }, [user]);

  // ── โหลด Summary & Tickets เมื่อ filter เปลี่ยน ──────────
  const fetchData = useCallback(async (p = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (filterStatus) params.status = filterStatus;
      if (search)       params.search = search;
      if (filterDept && FULL_ACCESS_ROLES.includes(user.role)) params.department = filterDept;

      const [sumData, tickData] = await Promise.all([getSummary(), getTickets(params)]);
      setSummary(sumData);
      setTickets(tickData.tickets);
      setPagination(tickData.pagination);
    } catch {
      showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, filterStatus, filterDept, search]);

  useEffect(() => {
    setPage(1);
    fetchData(1);
  }, [user, filterStatus, filterDept]);

  const handleSearch = () => { setPage(1); fetchData(1); };

  const goPage = (p) => { setPage(p); fetchData(p); };

  //── Logout ───────────────────────────────────────────────
  const handleLogout = async () => {
    await doLogout();
    navigate('/login', { replace: true });
  };

  const isFullAccess = user && FULL_ACCESS_ROLES.includes(user.role);

  return (
    <div style={S.layout}>
      {/* Toast */}
      {toast && (
        <div style={{ ...S.toast, background: toast.type === 'success' ? '#15803d' : toast.type === 'error' ? '#dc2626' : '#1e293b' }}>
          {toast.msg}
        </div>
      )}

      {/* Modal */}
      {selectedId && (
        <TicketModal
          ticketId={selectedId}
          user={user}
          onClose={() => setSelectedId(null)}
          onUpdated={() => fetchData(page)}
        />
      )}

      {/* ── Overlay (mobile) ────────────────────────────── */}
      {isMobile && sidebarOpen && (
        <div style={S.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside style={{
        ...S.sidebar,
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0,
          zIndex: 300, width: 260,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
        } : { width: 240, flexShrink: 0 }),
      }}>
        <div style={S.sidebarLogo}>
          <div style={S.sidebarLogoIcon}>C</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>CAPP</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.75, marginTop: 2 }}>ระบบรับแจ้งเรื่อง</div>
          </div>
        </div>

        {user && (
          <div style={S.sidebarUser}>
            <div style={{ fontWeight: 700 }}>{user.firstName} {user.lastName}</div>
            <div style={S.roleBadge}>
              {user.role === 'superadmin' ? '👑 Super Admin' : user.role === 'admin' ? '🔑 Admin' : user.role === 'executive' ? '🏅 Executive' : user.role === 'staff' ? '👤 Staff' : '👥 User'}
            </div>
            {user.subDepartment && (
              <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: 4 }}>{user.subDepartment}</div>
            )}
          </div>
        )}

        <nav style={{ flex: 1, padding: '12px 0' }}>
          <div
            style={{ ...S.navItem, ...(activeMenu === 'tickets' ? S.navItemActive : {}) }}
            onClick={() => { setActiveMenu('tickets'); setSidebarOpen(false); }}
          >📋 รายการคำร้อง</div>
          {user && (user.role === 'superadmin' || user.role === 'admin') && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'line-groups' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('line-groups'); setSidebarOpen(false); }}
            >💬 จัดการกลุ่ม LINE</div>
          )}
          {user && user.role === 'superadmin' && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'complainants' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('complainants'); setSidebarOpen(false); }}
            >📊 สถิติผู้ร้อง</div>
          )}
          {user && user.role === 'superadmin' && (
            <div
              style={{
                ...S.navItem,
                ...(activeMenu === 'quota' ? S.navItemActive : {}),
                ...(quotaWarning && activeMenu !== 'quota' ? S.navItemBlink : {}),
              }}
              onClick={() => { setActiveMenu('quota'); setSidebarOpen(false); }}
            >
              📡 LINE Quota
              {quotaWarning && activeMenu !== 'quota' && (
                <span style={S.warnDot}>!</span>
              )}
            </div>
          )}
          {user && user.role === 'superadmin' && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'audit' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('audit'); setSidebarOpen(false); }}
            >🗂️ Audit Log</div>
          )}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <div style={S.main}>
        <div style={S.topbar}>
          {/* Hamburger — แสดงเฉพาะบนโมบาย */}
          {isMobile && (
            <button style={S.hamburger} onClick={() => setSidebarOpen(v => !v)} aria-label="เปิดเมนู">
              <span style={S.hamburgerBar} />
              <span style={S.hamburgerBar} />
              <span style={S.hamburgerBar} />
            </button>
          )}

          {/* Title + Subtitle */}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
              {activeMenu === 'line-groups' ? '💬 จัดการกลุ่ม LINE' : activeMenu === 'complainants' ? '📊 สถิติผู้ร้อง' : activeMenu === 'quota' ? '📡 LINE Quota' : activeMenu === 'audit' ? '🗂️ Audit Log' : 'รายการเรื่องร้องทุกข์'}
            </h1>
            {activeMenu === 'tickets' && user?.subDepartment && (
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                🏢 {user.subDepartment}
              </div>
            )}
          </div>

          {/* Logout — มุมขวาบน */}
          <button style={S.btnLogout} onClick={handleLogout}>🚪 ออกจากระบบ</button>
        </div>

        <div style={S.content}>
          {activeMenu === 'line-groups' && (
            <LineGroupsPage showToast={showToast} />
          )}
          {activeMenu === 'complainants' && (
            <ComplainantsPage showToast={showToast} />
          )}
          {activeMenu === 'quota' && (
            <QuotaPage showToast={showToast} />
          )}
          {activeMenu === 'audit' && (
            <AuditLogPage showToast={showToast} />
          )}
          {activeMenu === 'tickets' && (<>

          {/* Stat Cards */}
          <div style={S.statGrid}>
            {[
              { label: 'รอรับเรื่อง',   key: 'รอรับเรื่อง',   status: 'รอรับเรื่อง'       },
              { label: 'ดำเนินการ',     key: 'ระหว่างดำเนินการ', status: 'ระหว่างดำเนินการ' },
              { label: 'เสร็จสิ้น',     key: 'เสร็จสิ้น',     status: 'เสร็จสิ้น'         },
              { label: 'ไม่รับคำร้อง', key: 'ไม่รับเรื่อง',   status: 'ไม่รับเรื่อง'      },
              { label: 'ทั้งหมด',       key: 'ทั้งหมด',       status: ''                  },
            ].map(({ label, key, status }) => (
              <div
                key={key}
                style={{
                  ...S.statCard,
                  borderTopColor: filterStatus === status ? '#1a5f9e' : '#e2e8f0',
                  boxShadow: filterStatus === status ? '0 2px 8px rgba(26,95,158,0.2)' : undefined,
                }}
                onClick={() => setFilterStatus(status)}
              >
                <div style={{ ...S.statCount, color: STATUS_COLOR[key] || '#1a5f9e' }}>
                  {summary[key] ?? '-'}
                </div>
                <div style={S.statLabel}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div style={S.filterBar}>
            <input
              style={S.filterInput}
              placeholder="🔍 ค้นหาเลขที่คำร้อง, หัวข้อ, ชื่อ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            {isFullAccess && (
              <select style={S.filterSelect} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                <option value="">ทุกหน่วยงาน</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <button style={S.btnSearch} onClick={handleSearch}>ค้นหา</button>
          </div>

          {/* Table */}
          <div style={S.tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>เลขที่คำร้อง</Th>
                  <Th>หัวข้อ</Th>
                  <Th hide>หน่วยงาน</Th>
                  <Th hide>วันที่แจ้ง</Th>
                  <Th>สถานะ</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={S.tableCenter}>กำลังโหลด...</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={5} style={S.tableCenter}>ไม่พบรายการ</td></tr>
                ) : tickets.map(t => {
                  const b = STATUS_BADGE[t.status];
                  return (
                    <tr key={t._id} style={S.tableRow} onClick={() => setSelectedId(t._id)}>
                      <td style={S.td}><strong>{t.ticketNo}</strong></td>
                      <td style={S.td}>{t.subject}</td>
                      <td style={{ ...S.td, fontSize: '0.8rem', display: window.innerWidth < 768 ? 'none' : undefined }}>{t.assignedDepartment}</td>
                      <td style={{ ...S.td, fontSize: '0.8rem', display: window.innerWidth < 768 ? 'none' : undefined }}>{formatDate(t.createdAt)}</td>
                      <td style={S.td}>
                        <span className={`status-badge ${b?.cls}`}>{b?.label || t.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div style={S.pagination}>
                {page > 1 && <PageBtn label="‹" onClick={() => goPage(page - 1)} />}
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter(p => Math.abs(p - page) <= 2)
                  .map(p => (
                    <PageBtn key={p} label={p} active={p === page} onClick={() => goPage(p)} />
                  ))}
                {page < pagination.totalPages && <PageBtn label="›" onClick={() => goPage(page + 1)} />}
                <span style={{ fontSize: '0.8rem', color: '#718096', marginLeft: 4 }}>
                  รวม {pagination.total} รายการ
                </span>
              </div>
            )}
          </div>
          </>)}
        </div>
        <footer style={S.footer}>
          © 2026 งานจัดทำและพัฒนาระบบข้อมูลสารสนเทศ กลุ่มงานสถิติข้อมูลและสารสนเทศ เทศบาลนครนครสวรรค์ by manarider
        </footer>
      </div>
    </div>
  );
}

// ── Sub components ─────────────────────────────────────────
function Th({ children, hide }) {
  return (
    <th style={{
      background: '#f7fafc', textAlign: 'left', padding: '10px 14px',
      fontSize: '0.8rem', fontWeight: 700, color: '#718096',
      borderBottom: '1px solid #e2e8f0',
      ...(hide ? { display: window.innerWidth < 768 ? 'none' : undefined } : {}),
    }}>
      {children}
    </th>
  );
}
function PageBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 32, height: 32, border: '1px solid #e2e8f0', borderRadius: 6,
        background: active ? '#1a5f9e' : '#fff',
        color: active ? '#fff' : '#333',
        cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

// ── Color map สำหรับ stat cards ────────────────────────────
const STATUS_COLOR = {
  'ทั้งหมด': '#1a5f9e',
  'รอรับเรื่อง': '#d97706',
  'ระหว่างดำเนินการ': '#2563eb',
  'เสร็จสิ้น': '#16a34a',
  'ไม่รับเรื่อง': '#dc2626',
};

// ── Styles ─────────────────────────────────────────────────
const S = {
  layout: { display: 'flex', minHeight: '100vh', fontFamily: "'Sarabun', 'Helvetica Neue', Arial, sans-serif" },
  sidebar: {
    background: '#1a5f9e', color: '#fff',
    display: 'flex', flexDirection: 'column',
  },
  // Applied on mobile when open (handled via CSS class now)
  sidebarOpen: {},
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)', zIndex: 299,
  },
  sidebarLogo: { padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 10 },
  sidebarLogoIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, background: '#14532d', borderRadius: 7,
    color: '#fff', fontSize: '1.2rem', fontWeight: 900, flexShrink: 0,
  },
  sidebarUser: { padding: 16, borderBottom: '1px solid rgba(255,255,255,0.15)', fontSize: '0.85rem' },
  roleBadge: {
    display: 'inline-block', marginTop: 4,
    background: 'rgba(255,255,255,0.2)', borderRadius: 20,
    padding: '2px 8px', fontSize: '0.72rem',
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', cursor: 'pointer', fontSize: '0.88rem',
    transition: 'background 0.15s', borderLeft: '3px solid transparent',
  },
  navItemActive: {
    background: 'rgba(255,255,255,0.15)',
    borderLeftColor: '#fff', fontWeight: 700,
  },
  navItemBlink: {
    animation: 'blink 1.2s ease-in-out infinite',
    background: 'rgba(245,158,11,0.2)',
    borderLeftColor: '#f59e0b',
  },
  warnDot: {
    marginLeft: 'auto', background: '#f59e0b', color: '#fff',
    borderRadius: '50%', width: 18, height: 18,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
  },
  btnLogout: {
    padding: '6px 14px', background: 'rgba(220,38,38,0.85)',
    color: '#fff', border: 'none', borderRadius: 6,
    cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit',
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  topbar: {
    background: '#fff', borderBottom: '1px solid #e2e8f0',
    padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f0f4f8' },
  hamburger: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    gap: 5, background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px 6px', borderRadius: 6, flexShrink: 0,
  },
  hamburgerBar: {
    display: 'block', width: 22, height: 2,
    background: '#1a5f9e', borderRadius: 2,
  },
  content: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 12, marginBottom: 20,
  },
  statCard: {
    background: '#fff', borderRadius: 10, padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer',
    borderTop: '3px solid #e2e8f0', transition: 'transform 0.15s',
  },
  statCount: { fontSize: '1.8rem', fontWeight: 800 },
  statLabel: { fontSize: '0.8rem', color: '#718096', marginTop: 2 },
  filterBar: {
    background: '#fff', borderRadius: 10, padding: '12px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16,
    display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
  },
  filterInput: {
    flex: 1, minWidth: 180, padding: '7px 10px',
    border: '1.5px solid #e2e8f0', borderRadius: 7,
    fontSize: '0.85rem', fontFamily: 'inherit',
  },
  filterSelect: {
    padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7,
    fontSize: '0.85rem', fontFamily: 'inherit', background: '#fff',
  },
  btnSearch: {
    padding: '7px 16px', background: '#1a5f9e', color: '#fff',
    border: 'none', borderRadius: 7, cursor: 'pointer',
    fontSize: '0.85rem', fontFamily: 'inherit',
  },
  tableWrap: {
    background: '#fff', borderRadius: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
  },
  tableRow: { cursor: 'pointer' },
  td: { padding: '11px 14px', fontSize: '0.85rem', borderBottom: '1px solid #e2e8f0', verticalAlign: 'middle' },
  tableCenter: { padding: 40, textAlign: 'center', color: '#718096', fontSize: '0.9rem' },
  pagination: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    gap: 6, padding: 14, flexWrap: 'wrap',
  },
  toast: {
    position: 'fixed', bottom: 40, right: 24, zIndex: 999,
    color: '#fff', padding: '12px 18px', borderRadius: 8,
    fontSize: '0.88rem', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    pointerEvents: 'none',
  },
  footer: {
    textAlign: 'center', padding: '12px 16px',
    fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.6,
    borderTop: '1px solid #e2e8f0', background: '#f0f4f8',
    marginTop: 'auto',
  },
};
