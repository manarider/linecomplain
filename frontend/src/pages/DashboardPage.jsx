import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, doLogout, getSummary, getTickets, getQuotaCurrent } from '../api';
import { TICKET_STATUS, STATUS_BADGE, FULL_ACCESS_ROLES, formatDate, DEPARTMENTS } from '../constants';
import TicketModal from '../components/TicketModal';
import LineGroupsPage from './LineGroupsPage';
import ComplainantsPage from './ComplainantsPage';
import QuotaPage from './QuotaPage';
import AuditLogPage from './AuditLogPage';
import StatisticsPage from './StatisticsPage';
import LineUsersPage from './LineUsersPage';
import BackupPage from './BackupPage';
import SettingsPage from './SettingsPage';
import SatisfactionPage from './SatisfactionPage';

export default function DashboardPage() {
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────
  const [user, setUser]             = useState(null);
  const [summary, setSummary]       = useState({});
  const [tickets, setTickets]       = useState([]);
  const [pagination, setPagination] = useState({});
  const [filterStatus, setFilterStatus] = useState('รอรับเรื่อง');
  const [filterDept, setFilterDept]     = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
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

  const showToast = useCallback((msg, type = '') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

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
      if (appliedSearch) params.search = appliedSearch;
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
  }, [user, filterStatus, filterDept, appliedSearch, showToast]);

  useEffect(() => {
    setPage(1);
    fetchData(1);
  }, [fetchData]);

  const handleSearch = () => {
    const nextSearch = searchInput.trim();
    setPage(1);
    if (nextSearch === appliedSearch) fetchData(1);
    else setAppliedSearch(nextSearch);
  };

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
      <aside className="no-print" style={{
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
            <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: 1 }}>เทศบาลนครนครสวรรค์</div>
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
          {user && ['admin', 'executive', 'staff', 'superadmin'].includes(user.role) && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'statistics' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('statistics'); setSidebarOpen(false); }}
            >📊 สถิติและรายงาน</div>
          )}
          {user && (user.role === 'superadmin' || user.role === 'admin') && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'line-groups' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('line-groups'); setSidebarOpen(false); }}
            >💬 จัดการกลุ่ม LINE</div>
          )}
          {user && (user.role === 'superadmin' || user.role === 'admin') && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'complainants' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('complainants'); setSidebarOpen(false); }}
            >👥 สถิติผู้ร้อง</div>
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
          {/* เมนู ผู้ใช้ LINE — ซ่อนไว้ก่อน รอปรับปรุง */}
          {user && user.role === 'superadmin' && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'audit' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('audit'); setSidebarOpen(false); }}
            >🗂️ Audit Log</div>
          )}
          {user && user.role === 'superadmin' && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'backup' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('backup'); setSidebarOpen(false); }}
            >💾 Backup</div>
          )}
          {user && user.role === 'superadmin' && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'public-fiscal' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('public-fiscal'); setSidebarOpen(false); }}
            >🌐 หน้าสถิติสาธารณะ</div>
          )}
          {user && (user.role === 'superadmin' || user.role === 'admin') && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'satisfaction' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('satisfaction'); setSidebarOpen(false); }}
            >⭐ ประเมินความพึงพอใจ</div>
          )}
          {user && user.role === 'superadmin' && (
            <div
              style={{ ...S.navItem, ...(activeMenu === 'settings' ? S.navItemActive : {}) }}
              onClick={() => { setActiveMenu('settings'); setSidebarOpen(false); }}
            >⚙️ ตั้งค่าระบบ</div>
          )}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <div className="no-print" style={S.main}>
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
              {activeMenu === 'statistics' ? '📊 สถิติและรายงาน' : activeMenu === 'line-groups' ? '💬 จัดการกลุ่ม LINE' : activeMenu === 'complainants' ? '👥 สถิติผู้ร้อง' : activeMenu === 'quota' ? '📡 LINE Quota' : activeMenu === 'audit' ? '🗂️ Audit Log' : activeMenu === 'backup' ? '💾 Backup Database' : activeMenu === 'line-users' ? '📱 ผู้ใช้ LINE' : activeMenu === 'public-fiscal' ? '🌐 หน้าสถิติสาธารณะ' : activeMenu === 'settings' ? '⚙️ ตั้งค่าระบบ' : activeMenu === 'satisfaction' ? '⭐ ประเมินความพึงพอใจ' : 'รายการเรื่องร้องทุกข์'}
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
          {activeMenu === 'statistics' && (
            <StatisticsPage showToast={showToast} />
          )}
          {activeMenu === 'line-groups' && (
            <LineGroupsPage showToast={showToast} user={user} />
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
          {activeMenu === 'backup' && (
            <BackupPage showToast={showToast} />
          )}
          {activeMenu === 'settings' && (
            <SettingsPage showToast={showToast} />
          )}
          {activeMenu === 'satisfaction' && (
            <SatisfactionPage showToast={showToast} />
          )}
          {activeMenu === 'line-users' && (
            <LineUsersPage showToast={showToast} />
          )}
          {activeMenu === 'public-fiscal' && (
            <PublicFiscalManagePage />
          )}
          {activeMenu === 'tickets' && (<>

          {/* Stat Cards */}
          <div style={S.statGrid}>
            {[
              { label: 'รอรับเรื่อง',   key: 'รอรับเรื่อง',       status: 'รอรับเรื่อง'       },
              { label: 'ดำเนินการ',     key: 'ระหว่างดำเนินการ',  status: 'ระหว่างดำเนินการ' },
              { label: 'ส่งต่อ',        key: 'ส่งต่อ',            status: 'ส่งต่อ'            },
              { label: 'เสร็จสิ้น',     key: 'เสร็จสิ้น',         status: 'เสร็จสิ้น'         },
              { label: 'ไม่รับคำร้อง', key: 'ไม่รับเรื่อง',      status: 'ไม่รับเรื่อง'      },
              { label: 'ทั้งหมด',       key: 'ทั้งหมด',           status: ''                  },
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
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
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
                  const isOverdue = t.status === 'รอรับเรื่อง' &&
                    (Date.now() - new Date(t.createdAt).getTime()) > 24 * 60 * 60 * 1000;
                  const hasUnreadAdditionalInfo = t.additionalInfoRequests?.some((item) => item.respondedAt && !item.isRead);
                  const SATISFACTION_ROW_COLOR = { 5: '#f0fdf4', 4: '#eff6ff', 3: '#fdf2f8', 2: '#fff7ed', 1: '#f9fafb' };
                  const satisfactionBg = t.satisfactionReplied && t.satisfactionScore
                    ? SATISFACTION_ROW_COLOR[t.satisfactionScore]
                    : undefined;
                  return (
                    <tr
                      key={t._id}
                      className={hasUnreadAdditionalInfo ? 'ticket-row-additional-unread' : ''}
                      style={{ ...S.tableRow, ...(satisfactionBg ? { backgroundColor: satisfactionBg } : {}) }}
                      onClick={() => setSelectedId(t._id)}
                    >
                      <td style={S.td}>
                        <strong className={isOverdue ? 'ticket-no-overdue' : ''}>
                          {t.ticketNo}
                        </strong>
                        {hasUnreadAdditionalInfo && <span style={S.additionalInfoBadge}>ข้อมูลใหม่</span>}
                      </td>
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
  'ส่งต่อ': '#8e44ad',
  'เสร็จสิ้น': '#16a34a',
  'ไม่รับเรื่อง': '#dc2626',
};

// ── หน้าจัดการสถิติสาธารณะ (superadmin) ───────────────────
function PublicFiscalManagePage() {
  const origin = window.location.origin;
  const publicUrl = `${origin}/embed/fiscal-summary`;
  const [copied, setCopied] = useState(false);
  const [previewYear, setPreviewYear] = useState('');
  const [embedWidth, setEmbedWidth] = useState(960);
  const [embedHeight, setEmbedHeight] = useState(540);

  const currentFiscalYear = (() => {
    const now = new Date();
    return now.getMonth() >= 9 ? now.getFullYear() + 544 : now.getFullYear() + 543;
  })();

  const buildSrc = (w, h) => {
    const params = new URLSearchParams();
    if (previewYear) params.set('fiscalYear', previewYear);
    params.set('width', w);
    params.set('height', h);
    return `${publicUrl}?${params.toString()}`;
  };

  const iframeSrc = buildSrc(embedWidth, embedHeight);
  const embedCode = `<iframe src="${iframeSrc}" width="${embedWidth}" height="${embedHeight}" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const inputStyle = { width: 90, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' };
  const labelStyle = { fontWeight: 600, fontSize: '0.875rem' };

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 700 }}>🌐 หน้าสถิติสาธารณะ (Public Fiscal Summary)</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
          หน้านี้เปิดให้สาธารณะเข้าถึงได้โดยไม่ต้องล็อกอิน — ใช้สำหรับฝัง (embed) ลงเว็บไซต์หรือจอแสดงผล
        </p>
      </div>

      {/* ── การตั้งค่าตัวอย่าง ── */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={labelStyle}>ปีงบประมาณ (พ.ศ.):</label>
          <input
            type="number"
            value={previewYear}
            onChange={e => setPreviewYear(e.target.value)}
            placeholder={String(currentFiscalYear)}
            style={{ ...inputStyle, width: 110 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={labelStyle}>กว้าง (px):</label>
          <input
            type="number"
            value={embedWidth}
            onChange={e => setEmbedWidth(Math.max(320, Number(e.target.value) || 960))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={labelStyle}>สูง (px):</label>
          <input
            type="number"
            value={embedHeight}
            onChange={e => setEmbedHeight(Math.max(240, Number(e.target.value) || 540))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[[960,540],[1280,720],[800,450],[640,360]].map(([w,h]) => (
            <button key={`${w}x${h}`} onClick={() => { setEmbedWidth(w); setEmbedHeight(h); }}
              style={{ padding: '4px 10px', background: embedWidth===w && embedHeight===h ? '#1a5f9e' : '#e2e8f0', color: embedWidth===w && embedHeight===h ? '#fff' : '#334155', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
              {w}×{h}
            </button>
          ))}
        </div>
        <a href={iframeSrc} target="_blank" rel="noopener noreferrer"
          style={{ padding: '6px 16px', background: '#1a5f9e', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
          🔗 เปิดในแท็บใหม่
        </a>
      </div>

      {/* ── Embed Code ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>โค้ดสำหรับฝัง (Embed Code)</span>
          <button onClick={handleCopy} style={{ padding: '4px 12px', background: copied ? '#16a34a' : '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
            {copied ? '✅ คัดลอกแล้ว' : '📋 คัดลอก'}
          </button>
        </div>
        <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '12px 16px', borderRadius: 8, fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
          {embedCode}
        </pre>
      </div>

      {/* ── Preview ── */}
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>ตัวอย่างหน้า ({embedWidth}×{embedHeight})</div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', background: '#f1f5f9' }}>
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            width={embedWidth}
            height={embedHeight}
            style={{ border: 'none', display: 'block' }}
            title="Public Fiscal Summary Preview"
            scrolling="no"
          />
        </div>
      </div>
    </div>
  );
}

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
  additionalInfoBadge: {
    display: 'inline-block', marginLeft: 8, padding: '2px 7px',
    borderRadius: 999, background: '#7c3aed', color: '#fff',
    fontSize: '0.68rem', fontWeight: 800, verticalAlign: 'middle',
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
