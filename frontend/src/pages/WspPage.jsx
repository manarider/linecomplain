import { useState, useEffect, useCallback } from 'react';
import {
  getWspTickets, createWspTicket, verifyWspLineId, verifyWspEmail, getWspStats,
  getWspReasons, createWspReason, updateWspReason, deleteWspReason,
  getWspAgencies, createWspAgency, updateWspAgency, deleteWspAgency, updateWspAgencyMembers,
} from '../api';

// ปิดฟีเจอร์ตรวจสอบ LINE ID ไว้ก่อน (ยังไม่มีทางออกที่เหมาะสม) — เปลี่ยนเป็น true เพื่อเปิดใช้อีกครั้ง
const SHOW_LINE_ID_FIELD = false;
import { STATUS_BADGE, formatDate } from '../constants';
import TicketModal from '../components/TicketModal';

// ── ตรวจ admin access ──────────────────────────────────────
const isAdmin = (user) => user && ['superadmin', 'admin'].includes(user.role);

const CURRENT_YEAR = new Date().getFullYear();

// ── CRUD Table สำหรับ Reasons / Agencies ──────────────────
function CrudTable({ title, items, onAdd, onEdit, onToggle, onDelete, user }) {
  const [name, setName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try { await onAdd(name.trim()); setName(''); }
    finally { setLoading(false); }
  };
  const handleEdit = async (id) => {
    setLoading(true);
    try { await onEdit(id, editName.trim()); setEditId(null); }
    finally { setLoading(false); }
  };
  const handleDel = async (id) => {
    setLoading(true);
    try { await onDelete(id); setConfirmDel(null); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {isAdmin(user) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={`เพิ่ม${title}ใหม่...`}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.875rem', fontFamily: 'inherit' }}
          />
          <button onClick={handleAdd} disabled={loading || !name.trim()} style={CT.btnAdd}>
            + เพิ่ม
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: '12px 0' }}>ยังไม่มีข้อมูล</div>}
        {items.map(item => (
          <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: item.isActive ? '#f8fafc' : '#f1f5f9', borderRadius: 8, border: '1px solid #e2e8f0', opacity: item.isActive ? 1 : 0.6 }}>
            {editId === item._id ? (
              <>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1, padding: '5px 8px', border: '1px solid #93c5fd', borderRadius: 5, fontSize: '0.875rem', fontFamily: 'inherit' }} autoFocus />
                <button onClick={() => handleEdit(item._id)} disabled={loading} style={CT.btnSave}>บันทึก</button>
                <button onClick={() => setEditId(null)} style={CT.btnCancel}>ยกเลิก</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '0.875rem', color: item.isActive ? '#1e293b' : '#94a3b8' }}>{item.name}</span>
                {!item.isActive && <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>ปิดใช้งาน</span>}
                {isAdmin(user) && (
                  <>
                    <button onClick={() => { setEditId(item._id); setEditName(item.name); }} style={CT.btnEdit} title="แก้ไข">✏️</button>
                    <button onClick={() => onToggle(item._id, !item.isActive)} style={CT.btnToggle} title={item.isActive ? 'ปิด' : 'เปิด'}>{item.isActive ? '🔓' : '🔒'}</button>
                    {user.role === 'superadmin' && (
                      confirmDel === item._id
                        ? <><button onClick={() => handleDel(item._id)} disabled={loading} style={CT.btnDelConfirm}>ยืนยันลบ</button><button onClick={() => setConfirmDel(null)} style={CT.btnCancel}>ยกเลิก</button></>
                        : <button onClick={() => setConfirmDel(item._id)} style={CT.btnDel} title="ลบ">🗑️</button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
const CT = {
  btnAdd:       { padding: '8px 16px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' },
  btnSave:      { padding: '4px 10px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem' },
  btnCancel:    { padding: '4px 10px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem' },
  btnEdit:      { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 4px' },
  btnToggle:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 4px' },
  btnDel:       { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 4px' },
  btnDelConfirm:{ padding: '4px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem' },
};

const M = {
  overlay:    { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' },
  box:        { background: '#fff', borderRadius: 12, padding: '24px', maxWidth: 500, width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' },
  btnSave:    { padding: '8px 16px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' },
  btnCancel:  { padding: '8px 16px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' },
};

// ── ตารางหน่วยรับผิดชอบ (รองรับสมาชิก) ────────────────────
function AgencyTable({ title, items, onAdd, onEdit, onToggle, onDelete, onManageMembers, user }) {
  const [name, setName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try { await onAdd(name.trim()); setName(''); }
    finally { setLoading(false); }
  };
  const handleEdit = async (id) => {
    setLoading(true);
    try { await onEdit(id, editName.trim()); setEditId(null); }
    finally { setLoading(false); }
  };
  const handleDel = async (id) => {
    setLoading(true);
    try { await onDelete(id); setConfirmDel(null); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {isAdmin(user) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={`เพิ่ม${title}ใหม่...`}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.875rem', fontFamily: 'inherit' }}
          />
          <button onClick={handleAdd} disabled={loading || !name.trim()} style={CT.btnAdd}>
            + เพิ่ม
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: '12px 0' }}>ยังไม่มีข้อมูล</div>}
        {items.map(item => (
          <div key={item._id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 12px', background: item.isActive ? '#f8fafc' : '#f1f5f9', borderRadius: 8, border: '1px solid #e2e8f0', opacity: item.isActive ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editId === item._id ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1, padding: '5px 8px', border: '1px solid #93c5fd', borderRadius: 5, fontSize: '0.875rem', fontFamily: 'inherit' }} autoFocus />
                  <button onClick={() => handleEdit(item._id)} disabled={loading} style={CT.btnSave}>บันทึก</button>
                  <button onClick={() => setEditId(null)} style={CT.btnCancel}>ยกเลิก</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '0.875rem', color: item.isActive ? '#1e293b' : '#94a3b8' }}>{item.name}</span>
                  {!item.isActive && <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>ปิดใช้งาน</span>}
                  {isAdmin(user) && (
                    <>
                      <button onClick={() => onManageMembers(item)} style={{ padding: '4px 10px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' }} title="จัดการสมาชิก">
                        👥 เพิ่มสมาชิก
                      </button>
                      <button onClick={() => { setEditId(item._id); setEditName(item.name); }} style={CT.btnEdit} title="แก้ไข">✏️</button>
                      <button onClick={() => onToggle(item._id, !item.isActive)} style={CT.btnToggle} title={item.isActive ? 'ปิด' : 'เปิด'}>{item.isActive ? '🔓' : '🔒'}</button>
                      {user.role === 'superadmin' && (
                        confirmDel === item._id
                          ? <><button onClick={() => handleDel(item._id)} disabled={loading} style={CT.btnDelConfirm}>ยืนยันลบ</button><button onClick={() => setConfirmDel(null)} style={CT.btnCancel}>ยกเลิก</button></>
                          : <button onClick={() => setConfirmDel(item._id)} style={CT.btnDel} title="ลบ">🗑️</button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {/* แสดงรายชื่อสมาชิก */}
            {item.members && item.members.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#64748b', paddingLeft: '8px', borderLeft: '2px solid #cbd5e1', marginTop: 2 }}>
                👥 สมาชิก: {item.members.map((m, i) => <span key={i} style={{ marginRight: 8 }}>{m.displayName || m.lineUserId}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ตารางทะเบียนคุม ─────────────────────────────────────────
function RegisterTable({ tickets, loading, onSelect }) {
  return (
    <div style={TB.wrap}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th>เลขที่คำร้อง</Th>
            <Th>หัวข้อ</Th>
            <Th hide>หน่วยรับผิดชอบ</Th>
            <Th hide>วันที่แจ้ง</Th>
            <Th>สถานะ</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={TB.center}>กำลังโหลด...</td></tr>
          ) : tickets.length === 0 ? (
            <tr><td colSpan={5} style={TB.center}>ไม่พบคำร้อง</td></tr>
          ) : tickets.map(t => {
            const b = STATUS_BADGE[t.status];
            const isOverdue = t.wspCleanupStatus === 'WAITING' &&
              t.wspCleanupDueDate && new Date(t.wspCleanupDueDate) < new Date();
            // ไม่มีช่องทางแจ้งเตือน + เสร็จสิ้นแล้ว → พื้นสีน้ำเงิน
            const needManual = t.wspNeedManualContact && t.status === 'เสร็จสิ้น';
            const rowBg = needManual ? '#dbeafe' : undefined;
            return (
              <tr
                key={t._id}
                style={{ ...TB.row, ...(rowBg ? { backgroundColor: rowBg } : {}) }}
                onClick={() => onSelect(t._id)}
              >
                <td style={TB.td}>
                  <strong style={{ color: '#1a5f9e' }}>{t.wspId || t.ticketNo}</strong>
                  {t.wspId && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{t.ticketNo}</div>}
                  {needManual && <span style={TB.manualBadge}>📞 แจ้งกลับเอง</span>}
                </td>
                <td style={TB.td}>{t.subject}</td>
                <td style={{ ...TB.td, fontSize: '0.8rem', display: window.innerWidth < 768 ? 'none' : undefined }}>{t.wspAgency || '-'}</td>
                <td style={{ ...TB.td, fontSize: '0.8rem', display: window.innerWidth < 768 ? 'none' : undefined }}>{formatDate(t.createdAt)}</td>
                <td style={TB.td}>
                  <span className={`status-badge ${b?.cls}`}>{b?.label || t.status}</span>
                  {t.wspCleanupStatus === 'WAITING' && (
                    <div style={{ fontSize: '0.7rem', marginTop: 3, color: isOverdue ? '#dc2626' : '#d97706', fontWeight: 700 }}>
                      {isOverdue ? '🚨 เกินกำหนดเก็บงาน' : '⏳ รอเก็บงาน'}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Th({ children, hide }) {
  return (
    <th style={{
      background: '#f7fafc', textAlign: 'left', padding: '10px 14px',
      fontSize: '0.8rem', fontWeight: 700, color: '#718096',
      borderBottom: '1px solid #e2e8f0',
      ...(hide ? { display: window.innerWidth < 768 ? 'none' : undefined } : {}),
    }}>{children}</th>
  );
}
const TB = {
  wrap: { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' },
  center: { textAlign: 'center', padding: 40, color: '#94a3b8' },
  row: { cursor: 'pointer', borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' },
  td: { padding: '10px 14px', fontSize: '0.875rem', color: '#1e293b', verticalAlign: 'top' },
  manualBadge: { display: 'inline-block', marginTop: 4, fontSize: '0.68rem', background: '#1d4ed8', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 },
};

// ── แถบสถิติและรายงาน ───────────────────────────────────────
function StatsReport() {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (year) params.year = year;
      if (month) params.month = month;
      setStats(await getWspStats(params));
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const findStatus = (name) => (stats?.byStatus || []).find(s => s._id === name)?.count || 0;
  const years = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  return (
    <div>
      {/* ตัวกรอง */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={SR.select}>
          <option value="">ทุกปี</option>
          {years.map(y => <option key={y} value={y}>ปี {y + 543}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} style={SR.select}>
          <option value="">ทั้งปี</option>
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {loading || !stats ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>กำลังโหลด...</div>
      ) : (
        <>
          {/* การ์ดสรุป */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'คำร้องทั้งหมด', value: stats.total, color: '#1a5f9e' },
              { label: 'ระหว่างดำเนินการ', value: findStatus('ระหว่างดำเนินการ'), color: '#2563eb' },
              { label: 'ดำเนินการเสร็จสิ้นแล้ว', value: stats.completed, color: '#16a34a' },
              { label: 'เก็บงานแล้ว', value: stats.cleanupDone, color: '#0d9488' },
              { label: '🚨 เกินกำหนดเก็บงาน', value: stats.overdue, color: '#dc2626' },
            ].map((s, i) => (
              <div key={i} style={SR.card}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value ?? 0}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <ReportTable title="จำแนกตามหน่วยรับผิดชอบ" rows={stats.byAgency} total={stats.total} />
          <ReportTable title="จำแนกตามเหตุร้องทุกข์" rows={stats.byReason} total={stats.total} />
          <ReportTable title="จำแนกตามสถานะ" rows={stats.byStatus} total={stats.total} />
        </>
      )}
    </div>
  );
}
function ReportTable({ title, rows = [], total }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', margin: '0 0 10px' }}>{title}</h3>
      <div style={TB.wrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>รายการ</Th>
              <Th>จำนวน</Th>
              <Th>สัดส่วน</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} style={TB.center}>ไม่มีข้อมูล</td></tr>
            ) : rows.map((r, i) => {
              const pct = total ? Math.round((r.count / total) * 100) : 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={TB.td}>{r._id || '(ไม่ระบุ)'}</td>
                  <td style={{ ...TB.td, fontWeight: 700 }}>{r.count}</td>
                  <td style={TB.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, maxWidth: 160, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#1a5f9e' }} />
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const SR = {
  select: { padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontFamily: 'inherit', fontSize: '0.875rem' },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
};

// ── Main WspPage ───────────────────────────────────────────
export default function WspPage({ user, showToast }) {
  const [tab, setTab] = useState('register'); // register | new | stats | reasons | agencies
  const [regView, setRegView] = useState('inprogress'); // inprogress | completed_pending | completed_done
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterAgency, setFilterAgency] = useState('');
  // members modal
  const [membersModal, setMembersModal] = useState(null); // { agencyId, agencyName, members }
  const [member1Line, setMember1Line] = useState('');
  const [member1Name, setMember1Name] = useState('');
  const [member1Check, setMember1Check] = useState(null);
  const [member2Line, setMember2Line] = useState('');
  const [member2Name, setMember2Name] = useState('');
  const [member2Check, setMember2Check] = useState(null);
  const [savingMembers, setSavingMembers] = useState(false);

  // modal
  const [selectedId, setSelectedId] = useState(null);

    // เฉพาะ dept ประปา, admin หรือ visiter จึงเห็นแถบสถิติ
  const canSeeStats = user && (
      isAdmin(user) || user.role === 'visiter' || user.subDepartment === 'สำนักการประปา'
  );
    const canCreateTicket = user && (
      isAdmin(user) || (['executive', 'staff'].includes(user.role) && user.subDepartment === 'สำนักการประปา')
    );
    const canViewCatalogs = user && (isAdmin(user) || user.role === 'visiter');

  // create ticket form
  const [form, setForm] = useState({ displayName: '', phone: '', notifyLineUserId: '', email: '', subject: '', description: '', wspReason: '', wspReasonOther: '', wspAgency: '' });
  const [formSaving, setFormSaving] = useState(false);
  const [lineCheck, setLineCheck] = useState(null); // { checking, found, msg, displayName, qr }
  const [emailCheck, setEmailCheck] = useState(null); // { checking, valid, msg }

  // ── โหลดคำร้องทะเบียนคุม ──────────────────────────────────
  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = { view: regView };
      if (filterAgency) params.agency = filterAgency;
      const data = await getWspTickets(params);
      setTickets(data.tickets || []);
    } catch (err) {
      showToast(err.message || 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally { setLoading(false); }
  }, [regView, filterAgency, showToast]);

  // ── โหลดสถิติ + config ────────────────────────────────────
  const loadMeta = useCallback(async () => {
    try {
      const [statsData, rData, aData] = await Promise.all([
        getWspStats({}), getWspReasons(), getWspAgencies(),
      ]);
      setStats(statsData);
      setReasons(rData);
      setAgencies(aData);
    } catch (err) {
      showToast(err.message || 'โหลดข้อมูลไม่สำเร็จ', 'error');
    }
  }, [showToast]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadTickets(); }, [loadTickets]);

  const refreshAll = () => { loadTickets(); loadMeta(); };

  // ── ตรวจสอบ LINE ID ───────────────────────────────────────
  const handleVerifyLine = async () => {
    const id = form.notifyLineUserId.trim();
    if (!id) { showToast('กรุณากรอก LINE User ID ก่อน', 'error'); return; }
    setLineCheck({ checking: true });
    try {
      const res = await verifyWspLineId(id);
      if (res.found) {
        setLineCheck({ found: true, displayName: res.displayName, qr: res.addFriendQr, msg: `พบผู้ใช้: ${res.displayName || '(ไม่มีชื่อ)'}` });
      } else {
        setLineCheck({ found: false, qr: res.addFriendQr, msg: res.message || 'ตรวจไม่พบ' });
      }
    } catch (err) {
      setLineCheck({ found: false, msg: err.message || 'ตรวจสอบไม่สำเร็จ' });
    }
  };

  // ── คัดลอก LINE ID ────────────────────────────────────────
  const handleCopyLineId = async () => {
    try {
      await navigator.clipboard.writeText(form.notifyLineUserId.trim());
      showToast('คัดลอก LINE ID แล้ว', 'success');
    } catch {
      showToast('คัดลอกไม่สำเร็จ', 'error');
    }
  };

  // ── ตรวจสอบอีเมล ──────────────────────────────────────────
  const handleVerifyEmail = async () => {
    const em = form.email.trim();
    if (!em) { showToast('กรุณากรอกอีเมลก่อน', 'error'); return; }
    setEmailCheck({ checking: true });
    try {
      const res = await verifyWspEmail(em);
      setEmailCheck({ valid: !!res.valid, msg: res.message || (res.valid ? 'ใช้งานได้' : 'ตรวจไม่ผ่าน') });
    } catch (err) {
      setEmailCheck({ valid: false, msg: err.message || 'ตรวจสอบไม่สำเร็จ' });
    }
  };

  // ── Create Ticket ─────────────────────────────────────────
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!form.subject || !form.description) {
      showToast('กรุณากรอกหัวเรื่องและรายละเอียด', 'error'); return;
    }
    if (form.wspReason === 'อื่น ๆ' && !form.wspReasonOther.trim()) {
      showToast('กรุณาระบุรายละเอียดเหตุร้องทุกข์อื่น ๆ', 'error'); return;
    }
    setFormSaving(true);
    try {
      await createWspTicket(form);
      showToast('บันทึกคำร้องลงระบบสำเร็จ', 'success');
      setForm({ displayName: '', phone: '', notifyLineUserId: '', email: '', subject: '', description: '', wspReason: '', wspReasonOther: '', wspAgency: '' });
      setLineCheck(null);
      setEmailCheck(null);
      setTab('register'); setRegView('inprogress');
      refreshAll();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setFormSaving(false); }
  };

  // ── Reasons CRUD ──────────────────────────────────────────
  const handleAddReason = async (name) => {
    try { await createWspReason({ name }); loadMeta(); showToast('เพิ่มสำเร็จ', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const handleEditReason = async (id, name) => {
    try { await updateWspReason(id, { name }); loadMeta(); showToast('แก้ไขสำเร็จ', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const handleToggleReason = async (id, isActive) => {
    try { await updateWspReason(id, { isActive }); loadMeta(); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const handleDelReason = async (id) => {
    try { await deleteWspReason(id); loadMeta(); showToast('ลบสำเร็จ', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  };

  // ── Agencies CRUD ─────────────────────────────────────────
  const handleAddAgency = async (name) => {
    try { await createWspAgency({ name }); loadMeta(); showToast('เพิ่มสำเร็จ', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const handleEditAgency = async (id, name) => {
    try { await updateWspAgency(id, { name }); loadMeta(); showToast('แก้ไขสำเร็จ', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const handleToggleAgency = async (id, isActive) => {
    try { await updateWspAgency(id, { isActive }); loadMeta(); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const handleDelAgency = async (id) => {
    try { await deleteWspAgency(id); loadMeta(); showToast('ลบสำเร็จ', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  };

  // ── Members (สมาชิกหน่วยรับผิดชอบ) ─────────────────────────
  const handleManageMembers = (agency) => {
    const m = agency.members || [];
    setMembersModal({ agencyId: agency._id, agencyName: agency.name, members: m });
    setMember1Line(m[0]?.lineUserId || '');
    setMember1Name(m[0]?.displayName || '');
    setMember1Check(null);
    setMember2Line(m[1]?.lineUserId || '');
    setMember2Name(m[1]?.displayName || '');
    setMember2Check(null);
  };
  const handleVerifyMember = async (slot) => {
    const id = slot === 1 ? member1Line.trim() : member2Line.trim();
    if (!id) { showToast('กรุณากรอก LINE User ID ก่อน', 'error'); return; }
    const setCheck = slot === 1 ? setMember1Check : setMember2Check;
    const setName  = slot === 1 ? setMember1Name  : setMember2Name;
    setCheck({ checking: true });
    try {
      const res = await verifyWspLineId(id);
      if (res.found) {
        setCheck({ found: true, msg: `พบผู้ใช้: ${res.displayName || '(ไม่มีชื่อ)'}` });
        setName(res.displayName || '');
      } else {
        setCheck({ found: false, msg: res.message || 'ตรวจไม่พบ' });
      }
    } catch (err) {
      setCheck({ found: false, msg: err.message || 'ตรวจสอบไม่สำเร็จ' });
    }
  };
  const handleSaveMembers = async () => {
    const m1 = member1Line.trim();
    const m2 = member2Line.trim();
    if (!m1 && !m2) { showToast('กรุณากรอก LINE ID อย่างน้อย 1 คน', 'error'); return; }
    const members = [];
    if (m1) members.push({ lineUserId: m1, displayName: member1Name.trim() });
    if (m2) members.push({ lineUserId: m2, displayName: member2Name.trim() });
    setSavingMembers(true);
    try {
      await updateWspAgencyMembers(membersModal.agencyId, members);
      loadMeta();
      showToast('บันทึกสมาชิกสำเร็จ ✅', 'success');
      setMembersModal(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSavingMembers(false); }
  };

  const TABS = [
      { key: 'register', label: '📋 ทะเบียนคุม' },
      ...(canCreateTicket ? [{ key: 'new', label: '➕ คำร้องใหม่' }] : []),
    ...(canSeeStats ? [{ key: 'stats', label: '📊 สถิติและรายงาน' }] : []),
      ...(canViewCatalogs ? [
      { key: 'reasons', label: '📝 เหตุร้องทุกข์' },
      { key: 'agencies', label: '🏢 หน่วยรับผิดชอบ' },
    ] : []),
  ];

  const REG_TABS = [
    { key: 'inprogress', label: '🔧 คำร้อง (ระหว่างดำเนินการ)' },
    { key: 'completed_pending', label: '✅ เสร็จสิ้น (ยังไม่เก็บงาน)' },
    { key: 'completed_done', label: '🧹 เสร็จสิ้นและเก็บงานแล้ว' },
  ];

  const findStatus = (name) => (stats?.byStatus || []).find(s => s._id === name)?.count || 0;
  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Modal — ใช้ TicketModal ของระบบเดิม (เปลี่ยนสถานะ/เก็บงานได้จากที่นี่) */}
      {selectedId && (
        <TicketModal
          ticketId={selectedId}
          user={user}
          onClose={() => setSelectedId(null)}
          onUpdated={refreshAll}
        />
      )}

      {/* Stats Bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { label: 'คำร้องทั้งหมด', value: stats.total, color: '#1a5f9e' },
            { label: 'ระหว่างดำเนินการ', value: findStatus('ระหว่างดำเนินการ'), color: '#2563eb' },
            { label: 'ดำเนินการเสร็จสิ้นแล้ว', value: stats.completed, color: '#16a34a' },
            { label: '🚨 เกินกำหนดเก็บงาน', value: stats.overdue, color: '#dc2626' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#fff', border: `2px solid ${s.color}20`, borderRadius: 10, padding: '10px 16px', minWidth: 120, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value ?? 0}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? '#1a5f9e' : '#64748b',
            borderBottom: tab === t.key ? '3px solid #1a5f9e' : '3px solid transparent',
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: ทะเบียนคุม ────────────────────────────────── */}
      {tab === 'register' && (
        <div>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {REG_TABS.map(rt => (
              <button key={rt.key} onClick={() => setRegView(rt.key)} style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem',
                fontWeight: regView === rt.key ? 700 : 500,
                border: `1px solid ${regView === rt.key ? '#1a5f9e' : '#e2e8f0'}`,
                background: regView === rt.key ? '#1a5f9e' : '#fff',
                color: regView === rt.key ? '#fff' : '#475569',
              }}>{rt.label}</button>
            ))}
          </div>

          {/* Filter หน่วยรับผิดชอบ */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <select value={filterAgency} onChange={e => setFilterAgency(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontFamily: 'inherit', fontSize: '0.875rem' }}>
              <option value="">ทุกหน่วยรับผิดชอบ</option>
              {agencies.map(a => <option key={a._id} value={a.name}>{a.name}</option>)}
            </select>
          </div>

          <RegisterTable tickets={tickets} loading={loading} onSelect={setSelectedId} />
        </div>
      )}

      {/* ── Tab: คำร้องใหม่ ─────────────────────────────────── */}
      {tab === 'new' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.82rem', color: '#1e40af' }}>
            💡 กรอกคำร้องแทนผู้ร้อง (กรณีมาร้องด้วยตนเอง/ทางโทรศัพท์) ระบบจะบันทึกลงระบบเดิมในสถานะ "ระหว่างดำเนินการ" และดำเนินการต่อผ่านระบบเดิม
          </div>
          <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>ชื่อ-สกุล ผู้แจ้ง</label>
              <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="กรอกชื่อผู้แจ้ง" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>เบอร์โทรศัพท์</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="เช่น 055-XXXXXX" style={inputStyle} />
            </div>
            {/* ซ่อนชั่วคราว: การตรวจสอบ LINE ID ยังไม่มีทางออกที่เหมาะสม — รอพัฒนาต่อ */}
            {SHOW_LINE_ID_FIELD && (
            <div>
              <label style={labelStyle}>LINE User ID <span style={{ color: '#94a3b8', fontWeight: 400 }}>(ไม่บังคับ)</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={form.notifyLineUserId}
                  onChange={e => { setForm(f => ({ ...f, notifyLineUserId: e.target.value })); setLineCheck(null); }}
                  placeholder="Uxxxxxxxx... สำหรับแจ้งเตือนผ่าน LINE"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button type="button" onClick={handleVerifyLine} disabled={lineCheck?.checking} style={{ padding: '0 16px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  {lineCheck?.checking ? 'กำลังตรวจ...' : 'ตรวจสอบ ID'}
                </button>
              </div>
              {lineCheck && !lineCheck.checking && (
                <div style={{ marginTop: 6, fontSize: '0.8rem', color: lineCheck.found ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {lineCheck.found ? '✅ ' : '❌ '}{lineCheck.msg}
                </div>
              )}
              {lineCheck?.found && lineCheck.qr && (
                <div style={{ marginTop: 10, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img src={lineCheck.qr} alt="LINE QR" style={{ width: 96, height: 96, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <div style={{ fontSize: '0.78rem', color: '#166534' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>📲 QR เพิ่มเพื่อน LINE OA</div>
                    <div style={{ color: '#475569', marginBottom: 8 }}>ให้ผู้ร้องสแกนเพื่อเพิ่มบัญชีทางการเป็นเพื่อน</div>
                    <button type="button" onClick={handleCopyLineId} style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.76rem' }}>
                      📋 คัดลอก LINE ID
                    </button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#94a3b8' }}>
                * ต้องเป็นผู้ที่เพิ่มบัญชีทางการ (LINE OA) เป็นเพื่อนแล้ว จึงจะแจ้งเตือนผ่าน LINE ได้
              </div>
            </div>
            )}
            <div>
              <label style={labelStyle}>อีเมล <span style={{ color: '#94a3b8', fontWeight: 400 }}>(ไม่บังคับ)</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setEmailCheck(null); }}
                  placeholder="สำหรับแจ้งเตือนทางอีเมล"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button type="button" onClick={handleVerifyEmail} disabled={emailCheck?.checking} style={{ padding: '0 16px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  {emailCheck?.checking ? 'กำลังตรวจ...' : 'ตรวจสอบ email'}
                </button>
              </div>
              {emailCheck && !emailCheck.checking && (
                <div style={{ marginTop: 6, fontSize: '0.8rem', color: emailCheck.valid ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {emailCheck.valid ? '✅ ' : '❌ '}{emailCheck.msg}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>หัวเรื่อง <span style={{ color: '#dc2626' }}>*</span></label>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="หัวเรื่องคำร้อง" style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>รายละเอียด <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="รายละเอียดปัญหา สถานที่ ฯลฯ" style={{ ...inputStyle, height: 100, resize: 'vertical' }} required />
            </div>
            <div>
              <label style={labelStyle}>เหตุร้องทุกข์</label>
              <select value={form.wspReason} onChange={e => setForm(f => ({ ...f, wspReason: e.target.value, wspReasonOther: e.target.value === 'อื่น ๆ' ? f.wspReasonOther : '' }))} style={inputStyle}>
                <option value="">-- เลือกเหตุร้องทุกข์ --</option>
                {reasons.filter(r => r.isActive).map(r => <option key={r._id} value={r.name}>{r.name}</option>)}
              </select>
              {form.wspReason === 'อื่น ๆ' && (
                <input
                  value={form.wspReasonOther}
                  onChange={e => setForm(f => ({ ...f, wspReasonOther: e.target.value }))}
                  placeholder="ระบุเหตุร้องทุกข์อื่น ๆ"
                  style={{ ...inputStyle, marginTop: 8 }}
                  required
                />
              )}
            </div>
            <div>
              <label style={labelStyle}>หน่วยรับผิดชอบ</label>
              <select value={form.wspAgency} onChange={e => setForm(f => ({ ...f, wspAgency: e.target.value }))} style={inputStyle}>
                <option value="">-- เลือกหน่วยรับผิดชอบ --</option>
                {agencies.filter(a => a.isActive).map(a => <option key={a._id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <button type="submit" disabled={formSaving} style={{ padding: '10px 24px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', alignSelf: 'flex-start' }}>
              {formSaving ? 'กำลังบันทึก...' : '💧 บันทึกคำร้อง'}
            </button>
          </form>
        </div>
      )}

      {/* ── Tab: สถิติและรายงาน ─────────────────────────────── */}
      {tab === 'stats' && canSeeStats && (
        <StatsReport />
      )}

      {/* ── Tab: เหตุร้องทุกข์ (admin only) ─────────────────── */}
      {tab === 'reasons' && isAdmin(user) && (
        <div style={{ maxWidth: 600 }}>
          <CrudTable title="เหตุร้องทุกข์" items={reasons} user={user}
            onAdd={handleAddReason} onEdit={handleEditReason}
            onToggle={handleToggleReason} onDelete={handleDelReason}
          />
        </div>
      )}

      {/* ── Tab: หน่วยรับผิดชอบ (admin only) ────────────────── */}
      {tab === 'agencies' && isAdmin(user) && (
        <div style={{ maxWidth: 600 }}>
          <AgencyTable title="หน่วยรับผิดชอบ" items={agencies} user={user}
            onAdd={handleAddAgency} onEdit={handleEditAgency}
            onToggle={handleToggleAgency} onDelete={handleDelAgency}
            onManageMembers={handleManageMembers}
          />
        </div>
      )}

      {/* ── Modal: จัดการสมาชิกหน่วยรับผิดชอบ ───────────────────*/}
      {membersModal && (
        <div onClick={() => setMembersModal(null)} style={M.overlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...M.box, maxWidth: 600, width: '90%' }}>
            <h3 style={{ margin: 0, marginBottom: 16, fontSize: '1.1rem', color: '#1a5f9e' }}>
              👥 จัดการสมาชิกหน่วยรับผิดชอบ
            </h3>
            <div style={{ marginBottom: 12, fontSize: '0.9rem', color: '#64748b' }}>
              {membersModal.agencyName} <span style={{ color: '#94a3b8' }}>(สูงสุด 2 คน)</span>
            </div>

            {/* สมาชิกคนที่ 1 */}
            <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>สมาชิกคนที่ 1</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text" placeholder="LINE User ID"
                  value={member1Line} onChange={e => { setMember1Line(e.target.value); setMember1Check(null); }}
                  style={{ flex: 1, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.875rem', fontFamily: 'inherit' }}
                />
                <button onClick={() => handleVerifyMember(1)} disabled={!member1Line.trim() || member1Check?.checking}
                  style={{ padding: '7px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}>
                  {member1Check?.checking ? '⏳' : '✓ ตรวจสอบ'}
                </button>
              </div>
              {member1Check && !member1Check.checking && (
                <div style={{ fontSize: '0.75rem', color: member1Check.found ? '#15803d' : '#dc2626', marginBottom: 8 }}>
                  {member1Check.found ? '✓' : '✗'} {member1Check.msg}
                </div>
              )}
              <input
                type="text" placeholder="ชื่อ-นามสกุล (ไม่บังคับ)"
                value={member1Name} onChange={e => setMember1Name(e.target.value)}
                style={{ width: '100%', padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.875rem', fontFamily: 'inherit' }}
              />
            </div>

            {/* สมาชิกคนที่ 2 */}
            <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>สมาชิกคนที่ 2</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text" placeholder="LINE User ID"
                  value={member2Line} onChange={e => { setMember2Line(e.target.value); setMember2Check(null); }}
                  style={{ flex: 1, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.875rem', fontFamily: 'inherit' }}
                />
                <button onClick={() => handleVerifyMember(2)} disabled={!member2Line.trim() || member2Check?.checking}
                  style={{ padding: '7px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}>
                  {member2Check?.checking ? '⏳' : '✓ ตรวจสอบ'}
                </button>
              </div>
              {member2Check && !member2Check.checking && (
                <div style={{ fontSize: '0.75rem', color: member2Check.found ? '#15803d' : '#dc2626', marginBottom: 8 }}>
                  {member2Check.found ? '✓' : '✗'} {member2Check.msg}
                </div>
              )}
              <input
                type="text" placeholder="ชื่อ-นามสกุล (ไม่บังคับ)"
                value={member2Name} onChange={e => setMember2Name(e.target.value)}
                style={{ width: '100%', padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.875rem', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setMembersModal(null)} disabled={savingMembers} style={M.btnCancel}>ยกเลิก</button>
              <button onClick={handleSaveMembers} disabled={savingMembers} style={M.btnSave}>
                {savingMembers ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
