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
  user:       'user',
};

const extractProjectPermission = (umsUser) => {
  const permissions = umsUser.projectPermissions || [];
  const projectKey = process.env.UMS_PROJECT_KEY;

  // UMS อาจเก็บ field เป็น `project` (ObjectId string) หรือ `projectKey`
  const projectPerm = permissions.find(
    (p) =>
      String(p.project) === projectKey ||
      String(p.projectKey) === projectKey
  );

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
