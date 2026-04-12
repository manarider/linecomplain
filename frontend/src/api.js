// ── API Client สำหรับ Frontend ──────────────────────────────
// ใช้ credentials: 'include' เพื่อส่ง httpOnly cookie ทุกครั้ง

async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || 'เกิดข้อผิดพลาด');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────
export const getMe      = ()   => request('/auth/me');
export const doLogout   = ()   => request('/auth/logout', { method: 'POST' });

// ── Dashboard ─────────────────────────────────────────────
export const getSummary = ()       => request('/api/dashboard/tickets/summary');
export const getTickets = (params) => request(`/api/dashboard/tickets?${new URLSearchParams(params)}`);
export const getTicket  = (id)     => request(`/api/dashboard/tickets/${id}`);
export const updateStatus = (id, body, files = []) => {
  if (files.length > 0) {
    const fd = new FormData();
    fd.append('status', body.status);
    if (body.note) fd.append('note', body.note);
    files.forEach((f) => fd.append('completionImages', f));
    return fetch(`/api/dashboard/tickets/${id}/status`, {
      method: 'PATCH',
      credentials: 'include',
      body: fd,
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.message || 'เกิดข้อผิดพลาด');
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }
  return request(`/api/dashboard/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) });
};
export const forwardTicket = (id, body) =>
  request(`/api/dashboard/tickets/${id}/forward`, { method: 'PATCH', body: JSON.stringify(body) });

// ── LINE Groups ───────────────────────────────────────────
export const getLineGroups  = ()   => request('/api/line-groups');
export const toggleLineGroup = (id) => request(`/api/line-groups/${id}/toggle`, { method: 'PATCH' });
export const updateGroupName = (id, groupName) =>
  request(`/api/line-groups/${id}/name`, { method: 'PATCH', body: JSON.stringify({ groupName }) });
export const syncGroupName  = (id) => request(`/api/line-groups/sync-name/${id}`, { method: 'POST' });
export const deleteLineGroup = (id) => request(`/api/line-groups/${id}`, { method: 'DELETE' });

// ── Complainants (superadmin) ─────────────────────────────
export const getComplainants = (params) =>
  request(`/api/dashboard/complainants?${new URLSearchParams(params)}`);
export const getComplainantTickets = (lineUserId, params) =>
  request(`/api/dashboard/complainants/${encodeURIComponent(lineUserId)}/tickets?${new URLSearchParams(params)}`);

// ── LINE Quota (superadmin) ───────────────────────────────
export const getQuotaCurrent = () => request('/api/quota/current');
export const getQuotaHistory = () => request('/api/quota/history');

// ── Audit Log (superadmin) ────────────────────────────────
export const getAuditLogs = (params) => request(`/api/audit?${new URLSearchParams(params)}`);
export const getAuditMeta = ()        => request('/api/audit/meta');
