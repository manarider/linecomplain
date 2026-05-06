import { useState, useEffect, useRef } from 'react';
import {
  getTicket, updateStatus, forwardTicket, markAdditionalInfoRead,
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
  const [requestAdditionalInfo, setRequestAdditionalInfo] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');
  const [completionFiles, setCompletionFiles]       = useState([]);
  const [completionPreviews, setCompletionPreviews] = useState([]);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const onUpdatedRef = useRef(onUpdated);

  const showToast = (msg, type = '') => {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 3500);
  };

  useEffect(() => {
    onUpdatedRef.current = onUpdated;
  }, [onUpdated]);

  useEffect(() => {
    setLoading(true);
    getTicket(ticketId)
      .then((data) => {
        setTicket(data);
        const hasUnreadAdditionalInfo = data.additionalInfoRequests?.some((item) => item.respondedAt && !item.isRead);
        if (hasUnreadAdditionalInfo) {
          markAdditionalInfoRead(ticketId)
            .then(() => onUpdatedRef.current?.())
            .catch(() => {});
        }
      })
      .catch(() => showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error'))
      .finally(() => setLoading(false));
  }, [ticketId]);

  const handleUpdateStatus = async () => {
    if (!actionStatus) { showToast('กรุณาเลือกสถานะ', 'error'); return; }
    setSaving(true);
    try {
      const files = actionStatus === 'เสร็จสิ้น' ? completionFiles : [];
      await updateStatus(ticketId, {
        status: actionStatus,
        note: actionNote,
        requestAdditionalInfo,
      }, files);
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
  const answeredAdditionalInfo = ticket?.additionalInfoRequests?.filter((item) => item.respondedAt) || [];
  const canForward = user && FULL_ACCESS_ROLES.includes(user.role);
  // staff เห็น action form เฉพาะ ticket ของหน่วยงานตัวเอง
  const canEdit = user && (
    FULL_ACCESS_ROLES.includes(user.role) ||
    ticket?.assignedDepartment === user.subDepartment
  );

  const handlePrint = () => {
    if (!ticket) return;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast('กรุณาอนุญาตให้เปิด popup สำหรับการพิมพ์', 'error');
      return;
    }

    const printDate = new Date().toLocaleDateString('th-TH', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // สร้าง HTML เอกสารราชการ
    const htmlContent = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>เอกสารคำร้อง ${ticket.ticketNo}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 2.5cm 2cm 2cm 3cm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'TH SarabunPSK', 'TH Sarabun New', 'Sarabun', serif;
      font-size: 16pt;
      line-height: 1.3;
      color: #000;
      background: white;
    }

    .page {
      page-break-after: always;
    }

    .page:last-child {
      page-break-after: auto;
    }

    /* หัวกระดาษ */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20pt;
    }

    .header-center {
      text-align: center;
      flex: 2;
    }

    .header-center h1 {
      font-size: 20pt;
      font-weight: 700;
      margin: 0 0 4pt;
    }

    .header-center h2 {
      font-size: 18pt;
      font-weight: 400;
      margin: 0 0 4pt;
    }

    .header-center div {
      font-size: 14pt;
    }

    .header-left,
    .header-right {
      flex: 1;
    }

    .header-right {
      text-align: right;
    }

    .ticket-box {
      border: 2pt solid #000;
      padding: 6pt 10pt;
      display: inline-block;
      font-size: 14pt;
    }

    .divider {
      border-bottom: 2pt solid #000;
      margin-bottom: 16pt;
    }

    /* ตาราง */
    .print-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20pt;
    }

    .print-table td {
      border: 1pt solid #000;
      padding: 8pt 12pt;
      text-align: left;
      vertical-align: top;
    }

    .print-table tr:first-child td {
      font-weight: 700;
      background-color: #f5f5f5;
      text-align: center;
    }

    .print-table td:first-child {
      font-weight: 700;
      width: 35%;
    }

    /* Status Badge */
    .status-badge {
      border: 1pt solid #000;
      padding: 2pt 8pt;
      font-weight: 700;
      display: inline-block;
    }

    /* Section Title */
    .section-title {
      font-size: 16pt;
      font-weight: 700;
      margin: 20pt 0 12pt;
    }

    /* ภาคผนวก */
    .appendix-header {
      font-size: 16pt;
      font-weight: 700;
      margin-bottom: 20pt;
      padding-bottom: 12pt;
      border-bottom: 1pt solid #000;
    }

    /* รูปภาพ */
    .img-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12pt;
      margin: 12pt 0;
    }

    .img-grid img {
      width: 100%;
      max-width: 100%;
      height: auto;
      border: 1pt solid #ccc;
    }

    /* ประวัติ */
    .history-item {
      padding: 8pt 0;
      border-bottom: 1pt solid #ccc;
      margin-bottom: 8pt;
    }

    .history-note {
      font-size: 14pt;
      color: #333;
      margin-top: 4pt;
    }

    .history-meta {
      font-size: 12pt;
      color: #666;
      margin-top: 2pt;
    }

    /* Link */
    a {
      color: #1a5f9e;
      text-decoration: underline;
    }

    .note-text {
      text-align: center;
      color: #666;
      font-size: 14pt;
      margin-top: 20pt;
    }
  </style>
</head>
<body>
  <!-- หน้าที่ 1: ข้อมูลหลัก -->
  <div class="page">
    <div class="header">
      <div class="header-left"></div>
      <div class="header-center">
        <h1>เทศบาลนครนครสวรรค์</h1>
        <h2>แบบฟอร์มคำร้องออนไลน์</h2>
        <div>ของดิจิทัลประชาไทย</div>
      </div>
      <div class="header-right">
        <div class="ticket-box">${ticket.ticketNo}</div>
      </div>
    </div>
    <div class="divider"></div>

    <div style="font-size: 16pt; margin-bottom: 12pt;">
      วันที่พิมพ์: ${printDate}
      <span style="float: right;">หน่วยงาน: ${ticket.assignedDepartment}</span>
    </div>

    <table class="print-table">
      <tbody>
        <tr>
          <td>หัวข้อการ</td>
          <td>รายละเอียดข้อมูล</td>
        </tr>
        <tr>
          <td>สถานะ</td>
          <td><span class="status-badge">${badge?.label || ticket.status}</span></td>
        </tr>
        <tr>
          <td>ชื่อผู้แจ้ง</td>
          <td>${ticket.displayName || '-'}</td>
        </tr>
        <tr>
          <td>เบอร์โทรศัพท์</td>
          <td>${ticket.phone || '-'}</td>
        </tr>
        <tr>
          <td>หัวข้อ</td>
          <td><strong>${ticket.subject}</strong></td>
        </tr>
        <tr>
          <td>รายละเอียด</td>
          <td><div style="white-space: pre-wrap; line-height: 1.6;">${ticket.description}</div></td>
        </tr>
        <tr>
          <td>หน่วยงานรับผิดชอบ</td>
          <td>${ticket.assignedDepartment}</td>
        </tr>
        <tr>
          <td>วันที่แจ้ง</td>
          <td>${formatDate(ticket.createdAt)}</td>
        </tr>
        ${ticket.assignedToName ? `
        <tr>
          <td>ผู้รับเรื่อง</td>
          <td>${ticket.assignedToName}</td>
        </tr>
        ` : ''}
      </tbody>
    </table>
  </div>

  ${(ticket.images?.length > 0 || ticket.additionalInfoRequests?.some(item => item.responseImages?.length > 0) || ticket.completionImages?.length > 0 || ticket.history?.length > 0) ? `
  <!-- หน้าที่ 2: ภาคผนวก -->
  <div class="page">
    <div class="appendix-header">ภาคผนวก</div>

    ${ticket.images?.length > 0 ? `
    <div class="section-title">รูปภาพประกอบ</div>
    <div class="img-grid">
      ${ticket.images.map(f => `<img src="/uploads/${f}" alt="รูปประกอบ" />`).join('')}
    </div>
    ` : ''}

    ${ticket.additionalInfoRequests?.some(item => item.responseImages?.length > 0) ? `
    <div class="section-title">รูปภาพเพิ่มเติมจากผู้ร้อง</div>
    <div class="img-grid">
      ${ticket.additionalInfoRequests.flatMap(item => item.responseImages || []).map(f => `<img src="/uploads/${f}" alt="รูปเพิ่มเติม" />`).join('')}
    </div>
    ` : ''}

    ${ticket.completionImages?.length > 0 ? `
    <div class="section-title">รูปภาพผลการดำเนินงาน</div>
    <div class="img-grid">
      ${ticket.completionImages.map(f => `<img src="/uploads/${f}" alt="รูปผลงาน" />`).join('')}
    </div>
    ` : ''}

    ${ticket.history?.length > 0 ? `
    <div class="section-title">ประวัติการดำเนินการ</div>
    ${[...ticket.history].reverse().map(h => {
      const hb = STATUS_BADGE[h.status];
      return `
      <div class="history-item">
        <span class="status-badge">${hb?.label || h.status}</span>
        ${h.note ? `<div class="history-note">หมายเหตุ: ${h.note}</div>` : ''}
        <div class="history-meta">โดย ${h.updatedByName || '-'} · ${formatDate(h.updatedAt)}</div>
      </div>
      `;
    }).join('')}
    ` : ''}
  </div>
  ` : ''}

  ${ticket.location?.lat && ticket.location?.lng ? `
  <!-- หน้าที่ 3: พิกัดแผนที่ -->
  <div class="page">
    <div class="appendix-header">พิกัดแผนที่</div>

    <table class="print-table">
      <tbody>
        <tr>
          <td>ละติจูด (Latitude)</td>
          <td>${ticket.location.lat}</td>
        </tr>
        <tr>
          <td>ลองจิจูด (Longitude)</td>
          <td>${ticket.location.lng}</td>
        </tr>
        <tr>
          <td>ลิงก์ Google Maps</td>
          <td>
            <a href="https://www.google.com/maps?q=${ticket.location.lat},${ticket.location.lng}" 
               target="_blank" rel="noopener noreferrer">
              เปิดดูในแผนที่
            </a>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="note-text">
      หมายเหตุ: สามารถสแกน QR Code เพื่อเปิดดูตำแหน่งบน Google Maps ได้
    </div>
  </div>
  ` : ''}
</body>
</html>
    `.trim();

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // รอให้โหลดเสร็จแล้วพิมพ์
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 250);
    };
  };

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {ticket && (
              <button style={S.printBtn} onClick={handlePrint} title="พิมพ์เอกสาร">
                🖨️ พิมพ์
              </button>
            )}
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
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
              <SectionTitle>📋 สถานะ</SectionTitle>
              <Row label="สถานะ">
                <span className={`status-badge ${badge?.cls}`}>{badge?.label || ticket.status}</span>
              </Row>

              <SectionTitle>👤 ผู้แจ้ง</SectionTitle>
              <Row label="ชื่อ">{ticket.displayName || '-'}</Row>
              <Row label="เบอร์โทร">{ticket.phone || '-'}</Row>

              <SectionTitle>📝 รายละเอียด</SectionTitle>
              <Row label="หัวข้อ"><strong>{ticket.subject}</strong></Row>
              <Row label="รายละเอียด">
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{ticket.description}</div>
              </Row>

              {answeredAdditionalInfo.length > 0 && (
                <>
                  <SectionTitle>💬 ข้อมูลเพิ่มเติมจากผู้ร้อง</SectionTitle>
                  {answeredAdditionalInfo.map((item) => (
                    <div key={item._id || item.respondedAt} style={S.additionalInfoBox}>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.responseText}</div>
                      <div style={S.additionalInfoMeta}>ส่งเมื่อ {formatDate(item.respondedAt)}</div>
                    </div>
                  ))}
                </>
              )}

              <SectionTitle>🏢 หน่วยงาน</SectionTitle>
              <Row label="รับผิดชอบ">{ticket.assignedDepartment}</Row>
              {ticket.assignedToName && <Row label="ผู้รับเรื่อง">{ticket.assignedToName}</Row>}
              <Row label="วันที่แจ้ง">{formatDate(ticket.createdAt)}</Row>

              {/* รูปภาพประกอบ */}
              {ticket.images?.length > 0 && (
                <>
                  <SectionTitle>📷 รูปภาพประกอบ</SectionTitle>
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

              {answeredAdditionalInfo.some((item) => item.responseImages?.length > 0) && (
                <>
                  <SectionTitle>🖼️ รูปภาพเพิ่มเติมจากผู้ร้อง</SectionTitle>
                  <div style={S.imgGrid}>
                    {answeredAdditionalInfo.flatMap((item) => item.responseImages || []).map(f => (
                      <img
                        key={f}
                        src={`/uploads/${f}`}
                        alt="รูปเพิ่มเติม"
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
                  <SectionTitle>✅ รูปภาพผลการดำเนินงาน</SectionTitle>
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

              {/* ประวัติการดำเนินการ */}
              {ticket.history?.length > 0 && (
                <>
                  <SectionTitle>📜 ประวัติการดำเนินการ</SectionTitle>
                  {[...ticket.history].reverse().map((h, i) => {
                    const hb = STATUS_BADGE[h.status];
                    return (
                      <div key={i} style={S.historyItem}>
                        <span className={`status-badge ${hb?.cls}`}>{hb?.label || h.status}</span>
                        {h.note && <div style={{ fontSize: '0.82rem', color: '#555', marginTop: 3 }}>หมายเหตุ: {h.note}</div>}
                        <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: 2 }}>
                          โดย {h.updatedByName || '-'} · {formatDate(h.updatedAt)}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* พิกัดแผนที่ (ถ้ามี) */}
              {ticket.location?.lat && ticket.location?.lng && (
                <>
                  <SectionTitle>📍 พิกัดแผนที่</SectionTitle>
                  <Row label="ละติจูด">{ticket.location.lat}</Row>
                  <Row label="ลองจิจูด">{ticket.location.lng}</Row>
                  <Row label="Google Maps">
                    <a 
                      href={`https://www.google.com/maps?q=${ticket.location.lat},${ticket.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1a5f9e', textDecoration: 'underline' }}
                    >
                      เปิดดูในแผนที่
                    </a>
                  </Row>
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

            <label style={S.checkboxRow}>
              <input
                type="checkbox"
                checked={requestAdditionalInfo}
                onChange={e => setRequestAdditionalInfo(e.target.checked)}
              />
              ขอข้อมูลเพิ่มเติมจากผู้ร้อง
            </label>

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
    <div className="print-row" style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: '0.88rem' }}>
      <span style={{ color: '#718096', minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{children}</span>
    </div>
  );
}
function SectionTitle({ children }) {
  return (
    <div className="print-section-title" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#718096', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
  printHeader: {
    display: 'none',
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
  printBtn: {
    background: '#059669', color: '#fff', border: 'none',
    padding: '6px 14px', borderRadius: 6, fontSize: '0.85rem',
    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 4,
  },
  modalBody: { padding: '20px 20px 0' },
  actionForm: { padding: '0 20px 20px', borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 16 },
  center: { textAlign: 'center', padding: 40, color: '#718096', fontSize: '0.9rem' },
  imgGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 },
  thumb: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: 'pointer' },
  historyItem: { padding: '8px 0', borderBottom: '1px solid #e2e8f0' },
  additionalInfoBox: {
    background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8,
    padding: '10px 12px', marginBottom: 8, fontSize: '0.88rem', color: '#3b0764',
  },
  additionalInfoMeta: { marginTop: 6, fontSize: '0.75rem', color: '#7c3aed' },
  input: {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontSize: '0.88rem', fontFamily: 'inherit',
    marginBottom: 10, display: 'block', background: '#fff',
  },
  actionBtns: { display: 'flex', gap: 10 },
  checkboxRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: '0.86rem', fontWeight: 600, color: '#374151',
    margin: '0 0 10px', cursor: 'pointer',
  },
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
  printTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'TH SarabunPSK, TH Sarabun New, Sarabun, serif',
    fontSize: '16pt',
  },
  printTableHeaderCell: {
    border: '1pt solid #000',
    padding: '8pt 12pt',
    fontWeight: 700,
    backgroundColor: '#f5f5f5',
    textAlign: 'left',
    verticalAlign: 'top',
    width: '35%',
  },
  printTableCell: {
    border: '1pt solid #000',
    padding: '8pt 12pt',
    textAlign: 'left',
    verticalAlign: 'top',
  },
};
