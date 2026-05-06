import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicFiscalSummary } from '../api';

const PALETTE = ['#0f766e', '#2563eb', '#c2410c', '#7c3aed', '#0891b2', '#be123c', '#4d7c0f', '#9333ea'];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const readNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
};

const compactRows = (departments, field, total, maxRows) => {
  const rows = departments
    .filter((item) => item[field] > 0)
    .sort((a, b) => b[field] - a[field]);

  if (rows.length <= maxRows) return rows;

  const visible = rows.slice(0, Math.max(maxRows - 1, 1));
  const rest = rows.slice(visible.length).reduce((acc, item) => acc + item[field], 0);
  return [
    ...visible,
    {
      department: 'หน่วยงานอื่น ๆ',
      [field]: rest,
      totalPercent: field === 'total' && total ? Number(((rest / total) * 100).toFixed(2)) : 0,
      inProgressPercent: field === 'inProgress' && total ? Number(((rest / total) * 100).toFixed(2)) : 0,
    },
  ];
};

const formatNumber = (value) => Number(value || 0).toLocaleString('th-TH');

const formatDuration = (ms) => {
  if (!ms) return '0 วัน';
  const hours = ms / 3600000;
  if (hours < 24) return `${Math.max(1, Math.round(hours)).toLocaleString('th-TH')} ชม.`;
  const days = hours / 24;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} วัน`;
  const months = days / 30;
  return `${months.toFixed(months < 10 ? 1 : 0)} เดือน`;
};

export default function PublicFiscalSummaryPage() {
  const [params] = useSearchParams();
  const width = readNumber(params.get('width'), 960, 320, 1920);
  const height = readNumber(params.get('height'), 540, 240, 1080);
  const requestedLayout = params.get('layout') || 'auto';
  const fiscalYear = params.get('fiscalYear') || params.get('year') || '';
  const [summaryState, setSummaryState] = useState({ fiscalYear: null, data: null, error: '' });
  const isCurrentResult = summaryState.fiscalYear === fiscalYear;
  const data = isCurrentResult ? summaryState.data : null;
  const error = isCurrentResult ? summaryState.error : '';
  const loading = !isCurrentResult;

  const layout = useMemo(() => {
    if (['horizontal', 'vertical', 'compact', 'counts'].includes(requestedLayout)) return requestedLayout;
    if (width < 560 || height < 360) return 'counts';
    if (width < 680 || height < 430) return 'compact';
    if (width >= height * 1.45) return 'horizontal';
    return 'vertical';
  }, [height, requestedLayout, width]);

  const scale = useMemo(() => {
    if (width < 520 || height < 360) return 'small';
    if (width > 1180 && height > 620) return 'large';
    return 'normal';
  }, [height, width]);

  const maxRows = useMemo(() => {
    if (layout === 'counts') return 0;
    if (layout === 'compact') return height < 430 ? 3 : 4;
    if (layout === 'horizontal') return height < 480 ? 4 : 6;
    return height < 620 ? 5 : 7;
  }, [height, layout]);

  useEffect(() => {
    let active = true;
    getPublicFiscalSummary(fiscalYear ? { fiscalYear } : {})
      .then((result) => {
        if (active) setSummaryState({ fiscalYear, data: result, error: '' });
      })
      .catch((err) => {
        if (active) {
          setSummaryState({ fiscalYear, data: null, error: err.message || 'โหลดข้อมูลไม่สำเร็จ' });
        }
      });
    return () => { active = false; };
  }, [fiscalYear]);

  const totalRows = data ? compactRows(data.departments, 'total', data.totals.total, maxRows) : [];
  const progressRows = data ? compactRows(data.departments, 'inProgress', data.totals.inProgress, maxRows) : [];

  return (
    <div style={{ ...S.page, width, height }}>
      <style>{'html,body,#root{overflow:hidden!important;} body{background:#ffffff!important;}'}</style>
      <div style={{ ...S.shell, ...(scale === 'small' ? S.shellSmall : {}) }}>
        <header style={S.header}>
          <div style={S.headingBlock}>
            <div style={{ ...S.kicker, ...(scale === 'small' ? S.hideOnSmall : {}) }}>เทศบาลนครนครสวรรค์</div>
            <h1 style={{ ...S.title, ...(scale === 'small' ? S.titleSmall : {}), ...(scale === 'large' ? S.titleLarge : {}) }}>
              สรุปสถิติคำร้อง ปีงบประมาณ {data?.fiscalYearBE || '....'}
            </h1>
          </div>
          <div style={{ ...S.period, ...(scale === 'small' ? S.periodSmall : {}) }}>
            {data?.fiscalPeriod?.label || '1 ต.ค. 2568 - 30 ก.ย. 2569'}
          </div>
        </header>

        <main style={{ ...S.content, ...(layout === 'counts' ? S.contentCounts : {}), ...(layout === 'horizontal' ? S.contentHorizontal : {}), ...(!['horizontal', 'counts'].includes(layout) ? S.contentVertical : {}) }}>
          {loading && <StateMessage text="กำลังโหลดข้อมูล" />}
          {!loading && error && <StateMessage text={error} tone="error" />}
          {!loading && !error && data && (
            <>
              {layout === 'counts' ? (
                <>
                  <CountOnlyPanel title="คำร้องทั้งหมด" value={data.totals.total} accent="#0f766e" scale={scale} />
                  <CountOnlyPanel title="เสร็จสิ้นแล้ว" value={data.totals.completed} accent="#16a34a" scale={scale} />
                  <CountOnlyPanel title="อยู่ระหว่างดำเนินการ" value={data.totals.inProgress} accent="#2563eb" scale={scale} />
                </>
              ) : (
                <>
                  <SummaryPanel
                    title="คำร้องทั้งหมด"
                    value={data.totals.total}
                    subtitle="แยกตามหน่วยงาน"
                    accent="#0f766e"
                    rows={totalRows}
                    field="total"
                    percentField="totalPercent"
                    total={data.totals.total}
                    scale={scale}
                  />
                  <CompletedPanel
                    value={data.totals.completed}
                    average={formatDuration(data.totals.averageCompletionMs)}
                    scale={scale}
                  />
                  <SummaryPanel
                    title="อยู่ระหว่างดำเนินการ"
                    value={data.totals.inProgress}
                    subtitle="แยกตามหน่วยงาน"
                    accent="#2563eb"
                    rows={progressRows}
                    field="inProgress"
                    percentField="inProgressPercent"
                    total={data.totals.inProgress}
                    scale={scale}
                  />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SummaryPanel({ title, value, subtitle, accent, rows, field, percentField, total, scale }) {
  return (
    <section style={S.panel}>
      <PanelHeader title={title} subtitle={subtitle} value={value} accent={accent} scale={scale} />
      <div style={S.barList}>
        {rows.length > 0 ? rows.map((row, index) => (
          <BarRow
            key={`${row.department}-${index}`}
            row={row}
            value={row[field]}
            percent={row[percentField] || (total ? (row[field] / total) * 100 : 0)}
            color={PALETTE[index % PALETTE.length]}
            scale={scale}
          />
        )) : (
          <div style={S.emptyText}>ไม่มีข้อมูลในช่วงปีงบประมาณนี้</div>
        )}
      </div>
    </section>
  );
}

function CompletedPanel({ value, average, scale }) {
  return (
    <section style={{ ...S.panel, ...S.completedPanel }}>
      <PanelHeader title="เสร็จสิ้นแล้ว" subtitle="รวมทั้งปีงบประมาณ" value={value} accent="#16a34a" scale={scale} />
      <div style={S.avgBox}>
        <div style={{ ...S.avgLabel, ...(scale === 'small' ? S.textSmall : {}) }}>ระยะเวลาเฉลี่ยในการดำเนินการ</div>
        <div style={{ ...S.avgValue, ...(scale === 'small' ? S.avgValueSmall : {}), ...(scale === 'large' ? S.avgValueLarge : {}) }}>{average}</div>
        <div style={{ ...S.avgHint, ...(scale === 'small' ? S.hideOnSmall : {}) }}>คำนวณจากวันรับคำร้องถึงวันที่เปลี่ยนสถานะเป็นเสร็จสิ้น</div>
      </div>
    </section>
  );
}

function CountOnlyPanel({ title, value, accent, scale }) {
  return (
    <section style={{ ...S.countPanel, borderTopColor: accent }}>
      <div style={{ ...S.countTitle, ...(scale === 'small' ? S.countTitleSmall : {}) }}>{title}</div>
      <div style={{ ...S.countValue, color: accent, ...(scale === 'small' ? S.countValueSmall : {}) }}>{formatNumber(value)}</div>
    </section>
  );
}

function PanelHeader({ title, subtitle, value, accent, scale }) {
  return (
    <div style={S.panelHeader}>
      <div style={S.panelTitleGroup}>
        <div style={{ ...S.panelTitle, ...(scale === 'small' ? S.panelTitleSmall : {}) }}>{title}</div>
        <div style={{ ...S.panelSubtitle, ...(scale === 'small' ? S.hideOnSmall : {}) }}>{subtitle}</div>
      </div>
      <div style={{ ...S.bigNumber, color: accent, ...(scale === 'small' ? S.bigNumberSmall : {}), ...(scale === 'large' ? S.bigNumberLarge : {}) }}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function BarRow({ row, value, percent, color, scale }) {
  const safePercent = clamp(Number(percent) || 0, 0, 100);
  return (
    <div style={S.barRow}>
      <div style={{ ...S.rowTop, ...(scale === 'small' ? S.rowTopSmall : {}) }}>
        <span style={S.deptName}>{row.department}</span>
        <span style={S.percentText}>{safePercent.toFixed(safePercent >= 10 ? 0 : 1)}%</span>
      </div>
      <div style={S.barTrack}>
        <div style={{ ...S.barFill, width: `${safePercent}%`, background: color }} />
      </div>
      <div style={{ ...S.rowValue, ...(scale === 'small' ? S.hideOnSmall : {}) }}>{formatNumber(value)} เรื่อง</div>
    </div>
  );
}

function StateMessage({ text, tone = 'normal' }) {
  return (
    <div style={{ ...S.stateMessage, color: tone === 'error' ? '#b91c1c' : '#475569' }}>
      {text}
    </div>
  );
}

const S = {
  page: {
    overflow: 'hidden',
    background: '#f8fafc',
    color: '#0f172a',
    fontFamily: "'Sarabun', 'Helvetica Neue', Arial, sans-serif",
  },
  shell: {
    width: '100%',
    height: '100%',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gap: 12,
    padding: 16,
    overflow: 'hidden',
    border: '1px solid #dbe3ea',
    background: '#ffffff',
  },
  shellSmall: { gap: 8, padding: 10 },
  header: {
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: 10,
  },
  headingBlock: { minWidth: 0 },
  kicker: { fontSize: 12, fontWeight: 700, color: '#64748b', lineHeight: 1.1 },
  title: { margin: 0, fontSize: 20, lineHeight: 1.15, fontWeight: 800, letterSpacing: 0, color: '#0f172a' },
  titleSmall: { fontSize: 15 },
  titleLarge: { fontSize: 24 },
  period: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#0f766e',
    background: '#ecfdf5',
    border: '1px solid #bbf7d0',
    borderRadius: 6,
    padding: '6px 10px',
    whiteSpace: 'nowrap',
  },
  periodSmall: { fontSize: 11, padding: '4px 6px' },
  content: { minHeight: 0, overflow: 'hidden', gap: 10 },
  contentHorizontal: { display: 'grid', gridTemplateColumns: '1.2fr 0.92fr 1.2fr' },
  contentVertical: { display: 'grid', gridTemplateRows: '1fr 0.82fr 1fr' },
  contentCounts: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  panel: {
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gap: 8,
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 12,
    background: '#ffffff',
  },
  completedPanel: { background: '#fbfffd' },
  panelHeader: { minHeight: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  panelTitleGroup: { minWidth: 0 },
  panelTitle: { fontSize: 14, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  panelTitleSmall: { fontSize: 12 },
  panelSubtitle: { marginTop: 2, fontSize: 11, color: '#64748b', lineHeight: 1.2 },
  bigNumber: { flexShrink: 0, fontSize: 34, fontWeight: 900, lineHeight: 0.95, letterSpacing: 0 },
  bigNumberSmall: { fontSize: 24 },
  bigNumberLarge: { fontSize: 44 },
  barList: { minHeight: 0, display: 'grid', gap: 6, alignContent: 'stretch', overflow: 'hidden' },
  barRow: { minWidth: 0, display: 'grid', gridTemplateRows: 'auto 7px auto', gap: 3, overflow: 'hidden' },
  rowTop: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 12, lineHeight: 1.1 },
  rowTopSmall: { fontSize: 10 },
  deptName: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: '#334155' },
  percentText: { fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' },
  barTrack: { width: '100%', height: 7, overflow: 'hidden', borderRadius: 999, background: '#e5e7eb' },
  barFill: { height: '100%', borderRadius: 999 },
  rowValue: { fontSize: 10, color: '#64748b', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  avgBox: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    borderTop: '1px solid #dcfce7',
    paddingTop: 8,
    overflow: 'hidden',
  },
  avgLabel: { fontSize: 13, color: '#475569', fontWeight: 700, lineHeight: 1.25 },
  avgValue: { marginTop: 6, fontSize: 36, lineHeight: 1, fontWeight: 900, color: '#16a34a', letterSpacing: 0 },
  avgValueSmall: { fontSize: 24 },
  avgValueLarge: { fontSize: 46 },
  avgHint: { marginTop: 8, maxWidth: 280, fontSize: 11, lineHeight: 1.35, color: '#64748b' },
  emptyText: { alignSelf: 'center', textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 700 },
  stateMessage: { gridColumn: '1 / -1', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700 },
  countPanel: {
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: '1px solid #e2e8f0',
    borderTop: '4px solid',
    borderRadius: 8,
    background: '#ffffff',
    padding: 10,
    textAlign: 'center',
  },
  countTitle: { maxWidth: '100%', fontSize: 13, lineHeight: 1.15, fontWeight: 800, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  countTitleSmall: { fontSize: 11 },
  countValue: { fontSize: 44, lineHeight: 1, fontWeight: 900, letterSpacing: 0 },
  countValueSmall: { fontSize: 30 },
  hideOnSmall: { display: 'none' },
  textSmall: { fontSize: 11 },
};