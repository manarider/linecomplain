import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMe } from '../api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error'); // 'session_expired' | 'auth_failed' | null

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMe()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => {
        setChecking(false);
        // ถ้าไม่มี error param → auto-redirect ไป UMS ทันที
        // ถ้ามี error param → แสดงหน้า login พร้อมข้อความแจ้ง (ไม่วนลูป)
        if (!error) {
          window.location.href = '/auth/login';
        }
      });
  }, [navigate, error]);

  const errorMessage = {
    session_expired: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
    auth_failed: 'เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองอีกครั้ง',
  }[error];

  if (checking) return null; // รอตรวจสอบ session ก่อนแสดงผล

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <span style={styles.logo}>C</span>
        </div>
        <h1 style={styles.title}>CAPP ระบบรับแจ้งเรื่อง</h1>
        <p style={styles.subtitle}>เข้าสู่ระบบสำหรับเจ้าหน้าที่</p>
        {errorMessage && (
          <div style={styles.errorBox}>{errorMessage}</div>
        )}
        <button
          style={styles.btn}
          onClick={() => { window.location.href = '/auth/login'; }}
          onMouseOver={e => e.target.style.background = '#154d82'}
          onMouseOut={e => e.target.style.background = '#1a5f9e'}
        >
          🔐 เข้าสู่ระบบด้วยบัญชี UMS
        </button>
      </div>
      <footer style={styles.footer}>
        © 2026 งานจัดทำและพัฒนาระบบข้อมูลสารสนเทศ กลุ่มงานสถิติข้อมูลและสารสนเทศ เทศบาลนครนครสวรรค์ by manarider
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #e8f0fe 0%, #f0f4f8 100%)',
    fontFamily: "'Sarabun', 'Helvetica Neue', Arial, sans-serif",
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '48px 40px',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '380px',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  logo: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    background: '#14532d',
    borderRadius: 10,
    color: '#fff',
    fontSize: '2rem',
    fontWeight: 900,
    fontFamily: "'Sarabun', 'Helvetica Neue', Arial, sans-serif",
    letterSpacing: '-1px',
  },
  title: { fontSize: '1.4rem', fontWeight: 800, color: '#14532d', marginBottom: '8px' },
  subtitle: { fontSize: '0.9rem', color: '#718096', marginBottom: '32px' },
  btn: {
    width: '100%',
    padding: '14px',
    background: '#1a5f9e',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  errorBox: {
    background: '#fff5f5',
    border: '1px solid #feb2b2',
    color: '#c53030',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '0.85rem',
    marginBottom: '16px',
    textAlign: 'left',
  },
  footer: {
    position: 'fixed',
    bottom: 0, left: 0, right: 0,
    textAlign: 'center',
    padding: '10px 16px',
    fontSize: '0.72rem',
    color: '#94a3b8',
    lineHeight: 1.6,
    background: 'transparent',
  },
};
