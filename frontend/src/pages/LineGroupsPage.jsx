import { useState, useEffect } from 'react';
import { getLineGroups, toggleLineGroup, syncGroupName, deleteLineGroup, updateGroupName } from '../api';

export default function LineGroupsPage({ showToast }) {
  const [groups, setGroups]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editId, setEditId]       = useState(null);
  const [editName, setEditName]   = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setGroups(await getLineGroups());
    } catch (e) {
      showToast(e.message || 'โหลดข้อมูลไม่ได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (id) => {
    try {
      const res = await toggleLineGroup(id);
      showToast(res.message, 'success');
      setGroups(gs => gs.map(g => g._id === id ? res.group : g));
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleSync = async (id) => {
    try {
      const res = await syncGroupName(id);
      showToast(res.message, 'success');
      setGroups(gs => gs.map(g => g._id === id ? res.group : g));
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`ลบ "${name}" ออกจากระบบ?`)) return;
    try {
      await deleteLineGroup(id);
      showToast('ลบกลุ่มแล้ว', 'success');
      setGroups(gs => gs.filter(g => g._id !== id));
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleEditSave = async (id) => {
    if (!editName.trim()) return;
    try {
      const res = await updateGroupName(id, editName);
      showToast('แก้ไขชื่อแล้ว', 'success');
      setGroups(gs => gs.map(g => g._id === id ? res.group : g));
      setEditId(null);
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div style={S.center}>กำลังโหลด...</div>;

  return (
    <div>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>💬 จัดการกลุ่ม LINE</h2>
          <p style={S.subtitle}>กลุ่มทั้งหมดที่บอทถูก add เข้ามา · {groups.length} กลุ่ม</p>
        </div>
        <button style={S.btnRefresh} onClick={load}>🔄 รีเฟรช</button>
      </div>

      {groups.length === 0 ? (
        <div style={S.empty}>
          ยังไม่มีกลุ่มในระบบ<br />
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 8, display: 'block' }}>
            เมื่อ add บอทเข้ากลุ่ม ระบบจะบันทึกกลุ่มนั้นอัตโนมัติ
          </span>
        </div>
      ) : (
        <div style={S.grid}>
          {groups.map(g => (
            <div key={g._id} style={{ ...S.card, borderLeftColor: g.isActive ? '#16a34a' : '#dc2626' }}>
              <div style={S.cardTop}>
                <span style={{ ...S.badge, background: g.isActive ? '#dcfce7' : '#fee2e2', color: g.isActive ? '#16a34a' : '#dc2626' }}>
                  {g.isActive ? '🟢 เปิดใช้งาน' : '🔴 ปิดใช้งาน'}
                </span>
                {g.leftAt && (
                  <span style={{ ...S.badge, background: '#fef3c7', color: '#92400e', marginLeft: 4 }}>
                    ⚠️ บอทออกจากกลุ่มแล้ว
                  </span>
                )}
              </div>

              {editId === g._id ? (
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    style={S.input}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEditSave(g._id)}
                    autoFocus
                  />
                  <button style={S.btnSm} onClick={() => handleEditSave(g._id)}>บันทึก</button>
                  <button style={{ ...S.btnSm, background: '#6b7280' }} onClick={() => setEditId(null)}>ยกเลิก</button>
                </div>
              ) : (
                <div style={S.groupName} onClick={() => { setEditId(g._id); setEditName(g.groupName); }}>
                  {g.groupName}
                  <span style={S.editHint}>✏️</span>
                </div>
              )}

              <div style={S.groupId}>{g.groupId}</div>
              <div style={S.meta}>
                เพิ่มเมื่อ {new Date(g.addedAt).toLocaleDateString('th-TH')}
                {g.leftAt && ` · ออกเมื่อ ${new Date(g.leftAt).toLocaleDateString('th-TH')}`}
              </div>

              <div style={S.actions}>
                <button
                  style={{ ...S.btnAction, background: g.isActive ? '#ef4444' : '#16a34a' }}
                  onClick={() => handleToggle(g._id)}
                >
                  {g.isActive ? '🔴 ปิดใช้งาน' : '🟢 เปิดใช้งาน'}
                </button>
                <button style={{ ...S.btnAction, background: '#2563eb' }} onClick={() => handleSync(g._id)}>
                  🔄 ซิงค์ชื่อ
                </button>
                <button style={{ ...S.btnAction, background: '#6b7280' }} onClick={() => handleDelete(g._id, g.groupName)}>
                  🗑️ ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title:     { fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: 0 },
  subtitle:  { fontSize: '0.8rem', color: '#64748b', marginTop: 4 },
  btnRefresh:{ padding: '6px 14px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' },
  center:    { textAlign: 'center', padding: 40, color: '#64748b' },
  empty:     { textAlign: 'center', padding: 60, color: '#64748b', background: '#fff', borderRadius: 10 },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  card:      { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: '4px solid #16a34a' },
  cardTop:   { marginBottom: 8 },
  badge:     { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 },
  groupName: { fontSize: '1rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 },
  editHint:  { fontSize: '0.75rem', opacity: 0.5 },
  groupId:   { fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace', marginBottom: 4 },
  meta:      { fontSize: '0.75rem', color: '#94a3b8', marginBottom: 12 },
  actions:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  btnAction: { padding: '5px 10px', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' },
  input:     { flex: 1, padding: '5px 8px', border: '1.5px solid #1a5f9e', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit' },
  btnSm:     { padding: '5px 10px', background: '#1a5f9e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' },
};
