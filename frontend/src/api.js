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
    if (body.requestAdditionalInfo) fd.append('requestAdditionalInfo', 'true');
    if (body.additionalInfoRequestText) fd.append('additionalInfoRequestText', body.additionalInfoRequestText);
    if (body.newDepartment) fd.append('newDepartment', body.newDepartment);
    if (body.wspCleanupStatus) fd.append('wspCleanupStatus', body.wspCleanupStatus);
    if (body.wspCleanupDueDays) fd.append('wspCleanupDueDays', String(body.wspCleanupDueDays));
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
export const markAdditionalInfoRead = (id) =>
  request(`/api/dashboard/tickets/${id}/additional-info/read`, { method: 'PATCH' });
export const deleteCompletionImage = (ticketId, filename) =>
  request(`/api/dashboard/tickets/${ticketId}/completion-images`, {
    method: 'DELETE',
    body: JSON.stringify({ filename }),
  });

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
export const getComplainantProfiles = (params) =>
  request(`/api/dashboard/complainant-profiles?${new URLSearchParams(params)}`);

// ── LINE Quota (superadmin) ───────────────────────────────
export const getQuotaCurrent   = () => request('/api/quota/current');
export const getQuotaHistory   = () => request('/api/quota/history');
export const refreshQuota      = () => request('/api/quota/refresh', { method: 'POST' });
export const getQuotaPushStats = () => request('/api/quota/push-stats');

// ── Audit Log (superadmin) ────────────────────────────────
export const getAuditLogs = (params) => request(`/api/audit?${new URLSearchParams(params)}`);
export const getAuditMeta = ()        => request('/api/audit/meta');

// ── Backup (superadmin) ──────────────────────────────────
export const downloadDatabaseBackup = async () => {
  const res = await fetch('/api/backup/download', { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || 'เกิดข้อผิดพลาด');
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return { blob, filename: match?.[1] || `capp-db-backup-${new Date().toISOString()}.json` };
};

// ── Statistics (admin/executive/superadmin) ───────────────
export const getStatistics = (params) => request(`/api/statistics?${new URLSearchParams(params)}`);

// ── Public Statistics (ไม่ต้อง login) ─────────────────────
export const getPublicFiscalSummary = (params) =>
  request(`/api/public/fiscal-summary?${new URLSearchParams(params)}`);

// ── System Settings ──────────────────────────────────────
export const getSettings    = ()       => request('/api/settings');
export const updateSettings = (body)   => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) });

// ── Satisfaction (superadmin/admin) ──────────────────────
export const getSatisfactionSummary = (params) =>
  request(`/api/satisfaction/summary?${new URLSearchParams(params)}`);

// ── WSP (สำนักการประปา) ───────────────────────────────────
export const getWspReasons       = ()         => request('/api/wsp/reasons');
export const createWspReason     = (body)     => request('/api/wsp/reasons', { method: 'POST', body: JSON.stringify(body) });
export const updateWspReason     = (id, body) => request(`/api/wsp/reasons/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteWspReason     = (id)       => request(`/api/wsp/reasons/${id}`, { method: 'DELETE' });

export const getWspAgencies      = ()         => request('/api/wsp/agencies');
export const createWspAgency     = (body)     => request('/api/wsp/agencies', { method: 'POST', body: JSON.stringify(body) });
export const updateWspAgency     = (id, body) => request(`/api/wsp/agencies/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const updateWspAgencyMembers = (id, members) => request(`/api/wsp/agencies/${id}/members`, { method: 'PATCH', body: JSON.stringify({ members }) });
export const deleteWspAgency     = (id)       => request(`/api/wsp/agencies/${id}`, { method: 'DELETE' });

export const getWspTickets       = (params)   => request(`/api/wsp/tickets?${new URLSearchParams(params)}`);
export const getWspTicket        = (id)       => request(`/api/wsp/tickets/${id}`);
export const assignWspTicketAgency = (id, wspAgency) => request(`/api/wsp/tickets/${id}/agency`, { method: 'PATCH', body: JSON.stringify({ wspAgency }) });
export const createWspTicket     = (body)     => request('/api/wsp/tickets', { method: 'POST', body: JSON.stringify(body) });
export const verifyWspLineId     = (lineUserId) => request('/api/wsp/verify-line', { method: 'POST', body: JSON.stringify({ lineUserId }) });
export const verifyWspEmail      = (email)      => request('/api/wsp/verify-email', { method: 'POST', body: JSON.stringify({ email }) });
export const getWspStats         = (params)   => request(`/api/wsp/stats?${new URLSearchParams(params)}`);

export const updateWspCleanup = (id, body, files = []) => {
  const fd = new FormData();
  fd.append('wspCleanupStatus', body.wspCleanupStatus);
  if (body.wspCleanupDueDays) fd.append('wspCleanupDueDays', body.wspCleanupDueDays);
  files.forEach((f) => fd.append('cleanupImages', f));
  return fetch(`/api/wsp/tickets/${id}/cleanup`, {
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
};