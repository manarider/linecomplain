import { useState, useEffect, useCallback } from 'react';
import {
  getTicket, updateStatus, forwardTicket,
} from '../api';
import {
  DEPARTMENTS, TICKET_STATUS, STATUS_BADGE, formatDate, FULL_ACCESS_ROLES,
} from '../constants';

export default function TicketModal({ ticketId, user, onClose, onUpdated }) {
  const [ticket, setTicket]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [actionStatus, setActionStatus] = useState('');
  const [actionNote, setActionNote]     = useState('');
  const [forwardDept, setForwardDept]   = useState('');
  const [forwardNote, setForwardNote]   = useState('');
  const [showForward, setShowForward]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');

  const showToast = (msg, type = '') => {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 3500);
  };

  useEffect(() => {
    setLoading(true);
    getTicket(ticketId)
      .then(setTicket)
      .catch(() => showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error'))
      .finally(() => setLoading(false));
  }, [ticketId]);

  const handleUpdateStatus = async () => {
    if (!actionStatus) { showToast('กรุณาเลือกสถานะ', 'error'); return; }
    setSaving(true);
    try {
      await updateStatus(ticketId, { status: actionStatus, note: actionNote });
      showToast(`อัปเดตสถานะ "${actionStatus}" สำเร็จ ✅`, 'success');
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSaving(false); }
  };

  const handleForward = async () => {
    if (!forwardDept) { showToast('กรุณาเลือกหน่วยงานปลายทาง', 'error'); return; }
    setSaving(true);
    try {
      await forwardTicket(ticketId, { targetDepartment: forwardDept, note: forwardNote });
      showToast(`ส่งต่อไป "${forwardDept}" สำเร็จ 📨`, 'success');
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSaving(false); }
  };

  const badge = ticket ? STATUS_BADGE[ticket.status] : null;
  const canForward = user && FULL_ACCESS_ROLES.includes(user.role);

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Toast */}
      {toast && (
        <div style={{ ...S.toast, background: toast.type === 'success' ? '#15803d' : toast.type === 'error' ? '#dc2626' : '#1e293b' }}>
          {toast.msg}
        </div>
      )}

      <div style={S.modal}>
        {/* Header */}
        <div style={S.modalHeader}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
            {ticket ? ticket.ticketNo : 'รายละเอียดคำร้อง'}
          </h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={S.modalBody}>
          {loading ? (
            <div style={S.center}>กำลังโหลด...</div>
          ) : !ticket ? (
            <div style={S.center}>เกิดข้อผิดพลาด</div>
          ) : (
            <>
              {/* ข้อมูลหลัก */}
              <Row label="สถานะ">
                <span className={`status-badge ${badge?.cls}`}>{badge?.label || ticket.status}</span>
              </Row>
              <Row label="ผู้แจ้ง">{ticket.displayName || '-'}</Row>
              <Row label="เบอร์โทร">{ticket.phone || '-'}</Row>
              <Row label="หัวข้อ"><strong>{ticket.subject}</strong></Row>
              <Row label="รายละเอียด">{ticket.description}</Row>
              <Row label="หน่วยงาน">{ticket.assignedDepartment}</Row>
              <Row label="วันที่แจ้ง">{formatDate(ticket.createdAt)}</Row>
              {ticket.assignedToName && <Row label="ผู้รับเรื่อง">{ticket.assignedToName}</Row>}

              {/* รูปภาพ */}
              {ticket.images?.length > 0 && (
                <>
                  <SectionTitle>🖼️ รูปภาพ</SectionTitle>
                  <div style={S.imgGrid}>
                    {ticket.images.map(f => (
                      <img
                        key={f}
                        src={`/uploads/${f}`}
                        alt="รูปประกอบ"
                        style={S.thumb}
                        onClick={() => window.open(`/uploads/${f}`)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* ประวัติ */}
              {ticket.history?.length > 0 && (
                <>
                  <SectionTitle>📜 ประวัติการดำเนินการ</SectionTitle>
                  {[...ticket.history].reverse().map((h, i) => {
                    const hb = STATUS_BADGE[h.status];
                    return (
                      <div key={i} style={S.historyItem}>
                        <span className={`status-badge ${hb?.cls}`}>{hb?.label || h.status}</span>
                        {h.note && <div style={{ fontSize: '0.82rem', color: '#555', marginTop: 3 }}>📝 {h.note}</div>}
                        <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 2 }}>
                          โดย {h.updatedByName || '-'} · {formatDate(h.updatedAt)}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Action Form */}
        {!loading && ticket && ticket.status !== 'เสร็จสิ้น' && (
          <div style={S.actionForm}>
            <SectionTitle>⚙️ ดำเนินการ</SectionTitle>
            <select style={S.input} value={actionStatus} onChange={e => setActionStatus(e.target.value)}>
              <option value="">-- เปลี่ยนสถานะ --</option>
              {Object.values(TICKET_STATUS).filter(s => s !== 'ส่งต่อ').map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <textarea
              style={{ ...S.input, minHeight: 64, resize: 'vertical' }}
              placeholder="หมายเหตุ (ไม่บังคับ)"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
            />
            <div style={S.actionBtns}>
              <button style={S.btnUpdate} disabled={saving} onClick={handleUpdateStatus}>
                💾 บันทึกสถานะ
              </button>
              {canForward && (
                <button style={S.btnForward} onClick={() => setShowForward(v => !v)}>
                  📨 ส่งต่อ
                </button>
              )}
            </div>

            {/* ส่งต่อ */}
            {showForward && canForward && (
              <div style={{ marginTop: 14 }}>
                <SectionTitle>📨 ส่งต่อไปหน่วยงาน</SectionTitle>
                <select style={S.input} value={forwardDept} onChange={e => setForwardDept(e.target.value)}>
                  <option value="">-- เลือกหน่วยงานปลายทาง --</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <textarea
                  style={{ ...S.input, minHeight: 64, resize: 'vertical' }}
                  placeholder="หมายเหตุการส่งต่อ"
                  value={forwardNote}
                  onChange={e => setForwardNote(e.target.value)}
                />
                <button style={S.btnForward} disabled={saving} onClick={handleForward}>
                  📨 ยืนยันส่งต่อ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── sub components ─────────────────────────────────────────
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: '0.88rem' }}>
      <span style={{ color: '#718096', minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{children}</span>
    </div>
  );
}
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#718096', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: '#fff', borderRadius: 14, width: '100%', maxWidth: 600,
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, background: '#fff', zIndex: 1,
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '1.3rem',
    cursor: 'pointer', color: '#718096', lineHeight: 1,
  },
  modalBody: { padding: '20px 20px 0' },
  actionForm: { padding: '0 20px 20px', borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 16 },
  center: { textAlign: 'center', padding: 40, color: '#718096', fontSize: '0.9rem' },
  imgGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 },
  thumb: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: 'pointer' },
  historyItem: { padding: '8px 0', borderBottom: '1px solid #e2e8f0' },
  input: {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontSize: '0.88rem', fontFamily: 'inherit',
    marginBottom: 10, display: 'block', background: '#fff',
  },
  actionBtns: { display: 'flex', gap: 10 },
  btnUpdate: {
    flex: 1, padding: 10, background: '#1a5f9e', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
  },
  btnForward: {
    flex: 1, padding: 10, background: '#7c3aed', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
    width: '100%', marginTop: 0,
  },
  toast: {
    position: 'fixed', bottom: 24, right: 24, zIndex: 200,
    color: '#fff', padding: '12px 18px', borderRadius: 8,
    fontSize: '0.88rem', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    pointerEvents: 'none',
  },
};
