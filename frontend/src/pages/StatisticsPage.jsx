import { useState, useEffect } from 'react';
import { getStatistics } from '../api';
import * as XLSX from 'xlsx';

const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function StatisticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchData();
  }, [year, fiscalYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getStatistics({ year, fiscalYear });
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    if (!data) return;

    // สร้าง workbook
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: สรุปปีงบประมาณ ───────────────────────────
    const fiscalData = [
      ['สรุปสถิติปีงบประมาณ', fiscalYear + 543],
      ['ช่วงเวลา', `${data.fiscalPeriod.start} ถึง ${data.fiscalPeriod.end}`],
      [],
      ['สถานะ', 'จำนวน'],
      ['รวมทั้งหมด', data.fiscalStats.total],
      ['รอรับเรื่อง', data.fiscalStats.pending],
      ['ระหว่างดำเนินการ', data.fiscalStats.inProgress],
      ['เสร็จสิ้น', data.fiscalStats.completed],
      ['ไม่รับเรื่อง', data.fiscalStats.rejected],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(fiscalData);
    ws1['!cols'] = [{ wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'สรุปปีงบประมาณ');

    // ── Sheet 2: รายเดือน ───────────────────────────────────
    const monthlyData = [
      ['สถิติรายเดือน ปี', year + 543],
      [],
      ['เดือน', 'รวม', 'รอรับเรื่อง', 'ระหว่างดำเนินการ', 'เสร็จสิ้น', 'ไม่รับเรื่อง'],
      ...data.monthlyStats.map(m => [
        MONTH_NAMES[m._id.month - 1],
        m.total,
        m.pending,
        m.inProgress,
        m.completed,
        m.rejected,
      ]),
      [],
      ['รวมทั้งปี',
        data.monthlyStats.reduce((sum, m) => sum + m.total, 0),
        data.monthlyStats.reduce((sum, m) => sum + m.pending, 0),
        data.monthlyStats.reduce((sum, m) => sum + m.inProgress, 0),
        data.monthlyStats.reduce((sum, m) => sum + m.completed, 0),
        data.monthlyStats.reduce((sum, m) => sum + m.rejected, 0),
      ],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(monthlyData);
    ws2['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'รายเดือน');

    // ── Sheet 3: ตามหน่วยงาน ────────────────────────────────
    const deptData = [
      ['สถิติตามหน่วยงาน ปีงบประมาณ', fiscalYear + 543],
      [],
      ['หน่วยงาน', 'รวม', 'รอรับเรื่อง', 'ระหว่างดำเนินการ', 'เสร็จสิ้น', 'ไม่รับเรื่อง'],
      ...data.departmentStats.map(d => [
        d._id || '(ไม่ระบุ)',
        d.total,
        d.pending,
        d.inProgress,
        d.completed,
        d.rejected,
      ]),
      [],
      ['รวมทั้งหมด',
        data.departmentStats.reduce((sum, d) => sum + d.total, 0),
        data.departmentStats.reduce((sum, d) => sum + d.pending, 0),
        data.departmentStats.reduce((sum, d) => sum + d.inProgress, 0),
        data.departmentStats.reduce((sum, d) => sum + d.completed, 0),
        data.departmentStats.reduce((sum, d) => sum + d.rejected, 0),
      ],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(deptData);
    ws3['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'ตามหน่วยงาน');

    // บันทึกไฟล์
    const fileName = `สถิติคำร้อง_${fiscalYear + 543}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (loading) {
    return (
      <div style={S.container}>
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>กำลังโหลดข้อมูลสถิติ...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={S.container}>
        <div style={{ textAlign: 'center', padding: 60, color: '#dc2626' }}>เกิดข้อผิดพลาดในการโหลดข้อมูล</div>
      </div>
    );
  }

  const maxMonthly = Math.max(...data.monthlyStats.map(m => m.total), 1);

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <h2 style={S.title}>📊 สรุปสถิติคำร้องทุกข์</h2>
        <button style={S.exportBtn} onClick={exportToExcel}>
          📥 Export Excel
        </button>
      </div>

      {/* Year Selector */}
      <div style={S.controlBar}>
        <div style={S.controlGroup}>
          <label style={S.label}>ปีปฏิทิน (รายเดือน)</label>
          <select style={S.select} value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
        </div>
        <div style={S.controlGroup}>
          <label style={S.label}>ปีงบประมาณ (ต.ค. - ก.ย.)</label>
          <select style={S.select} value={fiscalYear} onChange={e => setFiscalYear(parseInt(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Fiscal Year Summary */}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>
          📅 สรุปปีงบประมาณ {fiscalYear + 543}
          <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#888', marginLeft: 8 }}>
            ({data.fiscalPeriod.start} ถึง {data.fiscalPeriod.end})
          </span>
        </h3>
        <div style={S.statsGrid}>
          <StatCard label="รวมทั้งหมด" value={data.fiscalStats.total} color="#1e293b" />
          <StatCard label="รอรับเรื่อง" value={data.fiscalStats.pending} color="#d97706" />
          <StatCard label="ระหว่างดำเนินการ" value={data.fiscalStats.inProgress} color="#2563eb" />
          <StatCard label="เสร็จสิ้น" value={data.fiscalStats.completed} color="#16a34a" />
          <StatCard label="ไม่รับเรื่อง" value={data.fiscalStats.rejected} color="#dc2626" />
        </div>
      </div>

      {/* Monthly Chart */}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>📈 สถิติรายเดือน (ปีปฏิทิน {year + 543})</h3>
        <div style={S.chartContainer}>
          {data.monthlyStats.map(m => {
            const heightPercent = maxMonthly > 0 ? (m.total / maxMonthly) * 100 : 0;
            return (
              <div key={m._id.month} style={S.chartBar}>
                <div style={{ ...S.barStack, height: `${heightPercent}%` }}>
                  <div
                    style={{ flex: m.completed, background: '#16a34a' }}
                    title={`เสร็จสิ้น ${m.completed}`}
                  />
                  <div
                    style={{ flex: m.inProgress, background: '#2563eb' }}
                    title={`ระหว่างดำเนินการ ${m.inProgress}`}
                  />
                  <div
                    style={{ flex: m.pending, background: '#d97706' }}
                    title={`รอรับเรื่อง ${m.pending}`}
                  />
                  <div
                    style={{ flex: m.rejected, background: '#dc2626' }}
                    title={`ไม่รับเรื่อง ${m.rejected}`}
                  />
                </div>
                <div style={S.barLabel}>{m.total}</div>
                <div style={S.barMonth}>{MONTH_NAMES[m._id.month - 1]}</div>
              </div>
            );
          })}
        </div>
        <div style={S.legend}>
          <LegendItem color="#16a34a" label="เสร็จสิ้น" />
          <LegendItem color="#2563eb" label="ระหว่างดำเนินการ" />
          <LegendItem color="#d97706" label="รอรับเรื่อง" />
          <LegendItem color="#dc2626" label="ไม่รับเรื่อง" />
        </div>
      </div>

      {/* Department Stats Table */}
      <div style={S.section}>
        <h3 style={S.sectionTitle}>🏢 สถิติตามหน่วยงาน (ปีงบประมาณ {fiscalYear + 543})</h3>
        <div style={S.tableWrapper}>
          <table style={S.table}>
            <thead>
              <tr style={S.tableHeaderRow}>
                <th style={{ ...S.th, textAlign: 'left' }}>หน่วยงาน</th>
                <th style={S.th}>รวม</th>
                <th style={S.th}>รอรับเรื่อง</th>
                <th style={S.th}>ระหว่างดำเนินการ</th>
                <th style={S.th}>เสร็จสิ้น</th>
                <th style={S.th}>ไม่รับเรื่อง</th>
              </tr>
            </thead>
            <tbody>
              {data.departmentStats.map((d, i) => (
                <tr key={i} style={S.tableRow}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{d._id || '(ไม่ระบุ)'}</td>
                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 700 }}>{d.total}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{d.pending}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{d.inProgress}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{d.completed}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{d.rejected}</td>
                </tr>
              ))}
              {data.departmentStats.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                    ไม่มีข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sub Components ───────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{ ...S.statCard, borderLeftColor: color }}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, color }}>{value.toLocaleString()}</div>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={S.legendItem}>
      <div style={{ ...S.legendColor, background: color }} />
      <span>{label}</span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────
const S = {
  container: {
    padding: '24px 32px 60px',
    maxWidth: 1400,
    margin: '0 auto',
  },
  header: {
    marginBottom: 24,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
  },
  exportBtn: {
    padding: '10px 20px',
    background: '#059669',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  controlBar: {
    display: 'flex',
    gap: 20,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#555',
  },
  select: {
    padding: '8px 12px',
    border: '1.5px solid #cbd5e1',
    borderRadius: 6,
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    background: '#fff',
    cursor: 'pointer',
  },
  section: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: 20,
    marginTop: 0,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
  },
  statCard: {
    padding: '16px 20px',
    borderRadius: 10,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderLeft: '4px solid',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#64748b',
    fontWeight: 600,
    marginBottom: 6,
  },
  statValue: {
    fontSize: '1.8rem',
    fontWeight: 700,
  },
  chartContainer: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 280,
    padding: '10px 0',
    marginBottom: 20,
  },
  chartBar: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  barStack: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column-reverse',
    borderRadius: '6px 6px 0 0',
    overflow: 'hidden',
    minHeight: 4,
    transition: 'height 0.3s ease',
  },
  barLabel: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#1e293b',
  },
  barMonth: {
    fontSize: '0.75rem',
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 60,
    lineHeight: 1.2,
  },
  legend: {
    display: 'flex',
    gap: 20,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '0.85rem',
    color: '#555',
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
  },
  tableHeaderRow: {
    background: '#f1f5f9',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'center',
    fontWeight: 700,
    color: '#475569',
    borderBottom: '2px solid #cbd5e1',
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
  },
  td: {
    padding: '10px 16px',
    color: '#334155',
  },
};
