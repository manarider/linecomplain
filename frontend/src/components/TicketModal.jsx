import { useState, useEffect, useRef } from 'react';
import {
  getTicket, updateStatus, forwardTicket,
} from '../api';
import {
  DEPARTMENTS, TICKET_STATUS, STATUS_BADGE, formatDate, FULL_ACCESS_ROLES,
} from '../constants';

// ── ตรวจสอบอุปกรณ์มือถือ ─────────────────────────────────
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || navigator.maxTouchPoints > 0;

// ── บีบอัดรูปให้ไม่เกิน 500KB, max 1280px ────────────────
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        const MAX_DIM = 1280, MAX_BYTES = 500 * 1024;
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
          else       { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const newName = file.name.replace(/\.[^.]+$/, '.jpg');
        const tryQ = (q) => {
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= MAX_BYTES || q <= 0.3)
              resolve(new File([blob], newName, { type: 'image/jpeg' }));
            else tryQ(+(q - 0.1).toFixed(1));
          }, 'image/jpeg', q);
        };
        tryQ(0.80);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

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
  const [completionFiles, setCompletionFiles]       = useState([]);
  const [completionPreviews, setCompletionPreviews] = useState([]);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

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
      const files = actionStatus === 'เสร็จสิ้น' ? completionFiles : [];
      await updateStatus(ticketId, { status: actionStatus, note: actionNote }, files);
      showToast(`อัปเดตสถานะ "${actionStatus}" สำเร็จ ✅`, 'success');
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSaving(false); }
  };

  const handleCompletionPhoto = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;
    const remaining = 3 - completionFiles.length;
    const toProcess = files.slice(0, remaining);
    if (!toProcess.length) { showToast('แนบรูปได้สูงสุด 3 รูป', 'error'); return; }
    const newFiles = [], newPreviews = [];
    for (const file of toProcess) {
      const compressed = await compressImage(file);
      newFiles.push(compressed);
      newPreviews.push(URL.createObjectURL(compressed));
    }
    setCompletionFiles((p) => [...p, ...newFiles]);
    setCompletionPreviews((p) => [...p, ...newPreviews]);
  };

  const removeCompletionImage = (i) => {
    setCompletionFiles((p) => p.filter((_, j) => j !== i));
    setCompletionPreviews((p) => p.filter((_, j) => j !== i));
  };

  const handleForward = async () => {
    if (!forwardDept) { showToast('กรุณาเลือกหน่วยงานปลายทาง', 'error'); return; }
    setSaving(true);
    try {
      await forwardTicket(ticketId, { targetDepartment: forwardDept, note: forwardNote });
      showToast(`ส่งต่อไป "${forwardDept}" สำเร็จ — สถานะเปลี่ยนเป็นระหว่างดำเนินการ ✅`, 'success');
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSaving(false); }
  };

  const badge = ticket ? STATUS_BADGE[ticket.status] : null;
  const canForward = user && FULL_ACCESS_ROLES.includes(user.role);
  // staff เห็น action form เฉพาะ ticket ของหน่วยงานตัวเอง
  const canEdit = user && (
    FULL_ACCESS_ROLES.includes(user.role) ||
    ticket?.assignedDepartment === user.subDepartment
  );

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

              {/* รูปภาพประกอบ */}
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

              {/* รูปผลการดำเนินงาน */}
              {ticket.completionImages?.length > 0 && (
                <>
                  <SectionTitle>📸 รูปผลการดำเนินงาน</SectionTitle>
                  <div style={S.imgGrid}>
                    {ticket.completionImages.map(f => (
                      <img
                        key={f}
                        src={`/uploads/${f}`}
                        alt="รูปผลงาน"
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

        {/* hint read-only สำหรับ staff ที่ดู ticket หน่วยงานอื่น */}
        {!loading && ticket && ticket.status !== 'เสร็จสิ้น' && ticket.status !== 'ไม่รับเรื่อง' && !canEdit && (
          <div style={{ padding: '10px 20px 16px', borderTop: '1px solid #e2e8f0', marginTop: 16 }}>
            <div style={{ fontSize: '0.82rem', color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '8px 12px' }}>
              👁️ รับข้อมูลได้อย่างเดียว — ticket นี้อยู่ในความรับผิดชอบของ <strong>{ticket.assignedDepartment}</strong>
            </div>
          </div>
        )}

        {/* Action Form — ซ่อนเมื่อ เสร็จสิ้น หรือ ไม่รับเรื่อง หรือ staff ดู ticket หน่วยงานอื่น */}
        {!loading && ticket && ticket.status !== 'เสร็จสิ้น' && ticket.status !== 'ไม่รับเรื่อง' && canEdit && (
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

            {/* ── อัปโหลดรูปผลการดำเนินงาน (เฉพาะ เสร็จสิ้น) ── */}
            {actionStatus === 'เสร็จสิ้น' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#444', marginBottom: 8 }}>
                  📸 รูปผลการดำเนินงาน
                  <span style={{ color: '#999', fontWeight: 400 }}> (ไม่บังคับ สูงสุด 3 รูป)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {isMobile && (
                    <label style={S.photoBtn}>
                      📷 ถ่ายรูป
                      <input
                        ref={cameraRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleCompletionPhoto}
                      />
                    </label>
                  )}
                  <label style={S.photoBtn}>
                    🖼️ เลือกจากเครื่อง
                    <input
                      ref={galleryRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleCompletionPhoto}
                    />
                  </label>
                </div>
                {completionPreviews.length > 0 && (
                  <div style={S.imgGrid}>
                    {completionPreviews.map((src, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={src} style={S.thumb} alt={`preview ${i}`} />
                        <button
                          style={S.removeThumb}
                          onClick={() => removeCompletionImage(i)}
                          title="ลบรูป"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={S.actionBtns}>
              <button style={S.btnUpdate} disabled={saving} onClick={handleUpdateStatus}>
                💾 บันทึกสถานะ
              </button>
              {canForward && (
                <button style={S.btnForward} onClick={() => setShowForward(v => !v)}>
                  � ส่งต่อหน่วยงาน
                </button>
              )}
            </div>

            {/* ส่งต่อ / เปลี่ยนหน่วยงาน */}
            {showForward && canForward && (
              <div style={{ marginTop: 14 }}>
                <SectionTitle>🔀 เปลี่ยนหน่วยงานรับผิดชอบ</SectionTitle>
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
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 8 }}>
                  ⚠️ เรื่องจะเปลี่ยนหน่วยงานและสถานะเป็น "ระหว่างดำเนินการ" โดยอัตโนมัติ
                </div>
                <button style={S.btnForward} disabled={saving} onClick={handleForward}>
                  🔀 ยืนยันส่งต่อ
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
  photoBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: '10px 8px', border: '1.5px solid #1a5f9e',
    borderRadius: 8, background: '#f0f7ff', color: '#1a5f9e',
    fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
  },
  removeThumb: {
    position: 'absolute', top: 3, right: 3,
    background: 'rgba(0,0,0,0.55)', color: '#fff',
    border: 'none', borderRadius: '50%', width: 20, height: 20,
    fontSize: 12, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  },
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
