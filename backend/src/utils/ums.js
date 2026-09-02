const axios = require('axios');

/**
 * ดึงข้อมูล User จาก UMS โดยใช้ Token
 * @param {string} token - Bearer token ที่ได้รับจาก UMS callback
 * @returns {object} ข้อมูล User พร้อม projectPermissions
 */
const fetchUserInfo = async (token) => {
  const response = await axios.get(process.env.UMS_API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 10000,
  });
  // UMS ตอบกลับเป็น { status, user } — unwrap .user ถ้ามี
  return response.data?.user || response.data;
};

/**
 * แปลง projectPermissions จาก UMS เป็นข้อมูลที่ใช้งานในระบบร้องทุกข์
 * @param {object} umsUser - User object จาก UMS
 * @returns {object} { role, subDepartment } ของโปรเจกต์นี้
 */
// map role จาก UMS → role ของระบบ
const ROLE_MAP = {
  superadmin: 'superadmin',
  admin:      'admin',
  executive:  'executive',
  manager:    'executive', // legacy: map manager → executive
  staff:      'staff',
  visiter:    'visiter',
  visitor:    'visiter',
  user:       'user',
};

// ดึง identifier จาก p.project ไม่ว่าจะเป็น ObjectId string หรือ populated object
const resolveProjectId = (project) => {
  if (!project) return [];
  if (typeof project === 'string') return [project];
  if (typeof project === 'object') {
    const ids = [];
    if (project._id)  ids.push(String(project._id));
    if (project.code) ids.push(String(project.code));
    return ids;
  }
  return [];
};

const extractProjectPermission = (umsUser) => {
  const permissions = umsUser.projectPermissions || [];
  const projectKey = process.env.UMS_PROJECT_KEY;

  const projectPerm = permissions.find((p) => {
    // ตรวจ p.projectKey ก่อน (ถ้า UMS ส่งมาตรง)
    if (p.projectKey && String(p.projectKey) === projectKey) return true;
    // ตรวจ p.project ซึ่งอาจเป็น string หรือ populated object
    return resolveProjectId(p.project).includes(projectKey);
  });

  if (!projectPerm) {
    return null; // ไม่มีสิทธิ์ในโปรเจกต์นี้
  }

  const rawRole = (projectPerm.role || '').toLowerCase();
  const role = ROLE_MAP[rawRole] || null;

  if (!role) {
    return null; // role ไม่รู้จัก
  }

  return {
    role,
    subDepartment: projectPerm.subDepartment || null,
  };
};

module.exports = { fetchUserInfo, extractProjectPermission };
