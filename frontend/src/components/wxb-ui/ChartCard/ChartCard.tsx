import React, { useState, useRef, MouseEvent, useMemo } from 'react';
import './ChartCard.css';

/* ── Legacy API (Capacity Utilization mode) ── */
export interface WxbChartDataPoint {
  used: number;
  avail: number;
  label: string;
  date: string;
}

/* ── Multi-series API ── */
export interface WxbChartSeriesConfig {
  key: string;
  label: string;
  color: string;
  /** 'line' (default) or 'bar' (stacked) */
  geometry?: 'line' | 'bar';
  lineWidth?: number;
  dash?: number[];       // stroke-dasharray, e.g. [4, 2]
  showPoints?: boolean;  // default true
  areaFill?: boolean;    // show area polygon
}

export interface WxbChartPoint {
  label: string;
  date?: string;
  values: Record<string, number>;
}

export interface WxbChartCardProps {
  title?: string;
  subtitle?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Only render chart area — no card chrome / header / legend */
  headless?: boolean;

  // ── Legacy mode ──
  data?: WxbChartDataPoint[];
  targetValue?: number;

  // ── Multi-series mode ──
  seriesConfig?: WxbChartSeriesConfig[];
  points?: WxbChartPoint[];
  yUnit?: string;
  tooltipFormatter?: (v: number) => string;
}

const X0 = 40, X1 = 640, Y0 = 6, Y1 = 162;

/* ── Nice tick calculation ── */
function niceScale(maxVal: number, tickCount = 5): { max: number; ticks: number[] } {
  if (maxVal <= 0) return { max: 100, ticks: [0, 25, 50, 75, 100] };
  const rawStep = maxVal / (tickCount - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const res = rawStep / mag;
  const niceStep = res <= 1.5 ? mag : res <= 3 ? 2 * mag : res <= 7 ? 5 * mag : 10 * mag;
  const niceMax = Math.ceil(maxVal / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += niceStep) ticks.push(v);
  return { max: niceMax, ticks };
}

export const WxbChartCard: React.FC<WxbChartCardProps> = (props) => {
  const {
    title, subtitle, className = '', style, headless = false,
    data, targetValue = 80,
    seriesConfig, points,
    yUnit, tooltipFormatter,
  } = props;

  const isMulti = !!(seriesConfig && points && points.length > 0);

  /* ── Normalise into unified model ── */
  const { series, pts, yScale, isLegacy, barSeries, lineSeries } = useMemo(() => {
    if (isMulti) {
      const bars = seriesConfig!.filter(s => s.geometry === 'bar');
      const lines = seriesConfig!.filter(s => s.geometry !== 'bar');
      let mx = 0;
      // For line series: max of individual values
      for (const pt of points!) for (const sc of lines) {
        const v = pt.values[sc.key]; if (v !== undefined && v > mx) mx = v;
      }
      // For bar series: max of stacked totals per point
      if (bars.length > 0) {
        for (const pt of points!) {
          let stack = 0;
          for (const sc of bars) stack += (pt.values[sc.key] ?? 0);
          if (stack > mx) mx = stack;
        }
      }
      return { series: seriesConfig!, pts: points!, yScale: niceScale(mx), isLegacy: false, barSeries: bars, lineSeries: lines };
    }
    if (data && data.length > 0) {
      const s: WxbChartSeriesConfig[] = [
        { key: 'used', label: 'Used', color: '#0B3D7F', lineWidth: 1.7, showPoints: true, areaFill: true },
        { key: 'avail', label: 'Available', color: '#A3CC4F', lineWidth: 1.6 },
      ];
      const p = data.map(d => ({ label: d.label, date: d.date, values: { used: d.used, avail: d.avail } }));
      return { series: s, pts: p, yScale: { max: 100, ticks: [0, 25, 50, 75, 100] }, isLegacy: true, barSeries: [] as WxbChartSeriesConfig[], lineSeries: s };
    }
    return { series: [], pts: [], yScale: { max: 100, ticks: [0, 25, 50, 75, 100] }, isLegacy: true, barSeries: [] as WxbChartSeriesConfig[], lineSeries: [] as WxbChartSeriesConfig[] };
  }, [isMulti, seriesConfig, points, data]);

  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const N = pts.length;

  const [hover, setHover] = useState<{
    on: boolean; i: number; sx: number; sy: number; left: number; top: number; cursorVal: number;
  }>({ on: false, i: 0, sx: 0, sy: 0, left: 0, top: 0, cursorVal: 0 });

  const xs = useMemo(() => {
    if (N <= 1) return pts.map(() => X0);
    return pts.map((_, i) => X0 + i * ((X1 - X0) / (N - 1)));
  }, [N, pts]);

  const yFor = (val: number) => Y1 - (val / yScale.max) * (Y1 - Y0);

  /* polyline strings for line-geometry series only */
  const polylines = useMemo(() =>
    lineSeries.map(sc => ({
      ...sc,
      pts: pts.map((pt, i) => `${xs[i]},${yFor(pt.values[sc.key] ?? 0)}`).join(' '),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [lineSeries, pts, xs, yScale.max]);

  /* area polygons for line-geometry series only */
  const areas = useMemo(() =>
    lineSeries.filter(s => s.areaFill).map(sc => {
      const inner = pts.map((pt, i) => `${xs[i]},${yFor(pt.values[sc.key] ?? 0)}`).join(' ');
      return { key: sc.key, color: sc.color, poly: `${xs[0]},${Y1} ${inner} ${xs[N - 1]},${Y1}` };
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [lineSeries, pts, xs, N, yScale.max]);

  /* stacked bar rects */
  const barWidth = N > 1 ? ((X1 - X0) / (N - 1)) * 0.55 : 40;
  const stackedBars = useMemo(() => {
    if (barSeries.length === 0) return [];
    return pts.map((pt, i) => {
      let base = Y1;
      return barSeries.map(sc => {
        const v = pt.values[sc.key] ?? 0;
        const h = (v / yScale.max) * (Y1 - Y0);
        const y = base - h;
        base = y;
        return { key: `${sc.key}-${i}`, x: xs[i] - barWidth / 2, y, w: barWidth, h, color: sc.color };
      });
    }).flat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barSeries, pts, xs, yScale.max, barWidth]);

  /* mouse interaction */
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!svgRef.current || !chartRef.current || N === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (660 / rect.width);
    const sy = (e.clientY - rect.top) * (200 / rect.height);
    if (sx < X0 || sx > X1 || sy < Y0 || sy > Y1) { setHover(p => ({ ...p, on: false })); return; }

    let bi = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = Math.abs(xs[i] - sx); if (d < bd) { bd = d; bi = i; } }

    const pk = series[0]?.key;
    const yU = yFor(pk ? (pts[bi]?.values[pk] ?? 0) : 0);
    const px = (xs[bi] / 660) * rect.width;
    const py = (yU / 200) * rect.height;
    const tipW = 200, tipH = 20 + series.length * 22;
    let left = px + 14;
    if (left + tipW + 12 > rect.width) left = px - tipW - 14;
    left = Math.max(2, Math.min(rect.width - tipW - 2, left));
    let top = py - tipH / 2;
    top = Math.max(2, Math.min(rect.height - tipH - 2, top));

    setHover({ on: true, i: bi, sx: xs[bi], sy, left, top, cursorVal: ((Y1 - sy) / (Y1 - Y0)) * yScale.max });
  };

  const active = hover.on && N > 0 ? pts[hover.i] : null;
  const fmtVal = tooltipFormatter ?? ((v: number) => isLegacy ? `${v.toFixed(1)} %` : `${v.toFixed(1)}${yUnit ? ` ${yUnit}` : ''}`);
  const yLabel = (v: number) => isLegacy ? `${v}%` : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)));

  /* label skip for dense X axis */
  const xStep = N <= 15 ? 1 : Math.ceil(N / 12);

  /* ── SVG chart ── */
  const chartSvg = (
    <div className="wxb-chart-area" ref={chartRef} onMouseMove={onMove} onMouseLeave={() => setHover(p => ({ ...p, on: false }))}>
      <svg viewBox="0 0 660 200" ref={svgRef} preserveAspectRatio="xMidYMid meet">
        {/* hover slice */}
        <rect className={`wxb-chart-slice ${hover.on ? 'is-on' : ''}`}
          x={hover.on ? hover.sx - (N > 1 ? ((X1 - X0) / (N - 1)) / 2 : 10) : 0}
          y="6" width={N > 1 ? (X1 - X0) / (N - 1) : 20} height="156" />

        {/* Y grid */}
        <g fontFamily="var(--wx-font-mono)" fontSize="10" fill="#8898A8">
          {yScale.ticks.map((t, i) => {
            const y = yFor(t);
            return (<g key={i}><text x={6} y={y + 4}>{yLabel(t)}</text><line x1="40" y1={y} x2="640" y2={y} stroke={t === 0 ? '#E4EAF1' : '#EEF2F7'} /></g>);
          })}
        </g>

        {/* target line (legacy) */}
        {isLegacy && <line x1="40" y1={yFor(targetValue)} x2="640" y2={yFor(targetValue)} stroke="#E8B53C" strokeDasharray="3 3" strokeWidth="1" />}

        {/* stacked bars */}
        {stackedBars.map(b => (
          <rect key={b.key} x={b.x} y={b.y} width={b.w} height={Math.max(0, b.h)} rx={2} fill={b.color} fillOpacity="0.85" />
        ))}

        {/* areas (line series only) */}
        {areas.map(a => <polygon key={a.key} fill={a.color} fillOpacity="0.10" points={a.poly} />)}

        {/* lines (line series only) */}
        {polylines.map(pl => (
          <polyline key={pl.key} fill="none" stroke={pl.color}
            strokeWidth={pl.lineWidth ?? 1.5}
            strokeDasharray={pl.dash ? pl.dash.join(' ') : undefined}
            points={pl.pts} />
        ))}

        {/* data points (line series only) */}
        {lineSeries.filter(s => s.showPoints !== false).map(sc => (
          <g key={sc.key} fill="#fff" stroke={sc.color} strokeWidth="1.5">
            {pts.map((pt, i) => <circle key={i} cx={xs[i]} cy={yFor(pt.values[sc.key] ?? 0)} r={3} />)}
          </g>
        ))}

        {/* crosshair */}
        <g className={`wxb-chart-crosshair ${hover.on ? 'is-on' : ''}`}>
          <line x1={hover.sx} y1="6" x2={hover.sx} y2="162" />
          <line x1="40" y1={hover.sy} x2="640" y2={hover.sy} />
        </g>

        {/* active markers (line series only) */}
        {hover.on && active && (
          <g className="wxb-chart-markers is-on">
            {lineSeries.map((sc, si) => {
              const v = active.values[sc.key] ?? 0;
              return (
                <g key={sc.key}>
                  {si === 0 && <circle className="halo" cx={xs[hover.i]} cy={yFor(v)} r="8" fill={sc.color} />}
                  <circle cx={xs[hover.i]} cy={yFor(v)} r={si === 0 ? 5.5 : 4.5} fill={sc.color} stroke="#fff" strokeWidth="2" />
                </g>
              );
            })}
          </g>
        )}

        {/* X labels */}
        <g fontFamily="var(--wx-font-mono)" fontSize="10" fill="#8898A8">
          {pts.map((pt, i) => (i % xStep === 0 || i === N - 1)
            ? <text key={i} x={xs[i]} y="180" textAnchor="middle">{pt.label}</text>
            : null
          )}
        </g>

        {/* axis tags */}
        {hover.on && active && (<>
          <g className="wxb-chart-axis-tag is-on">
            <rect x="0" y={hover.sy - 7} width="40" height="14" rx="3" />
            <text x="20" y={hover.sy + 3} textAnchor="middle">{yLabel(hover.cursorVal)}</text>
          </g>
          <g className="wxb-chart-axis-tag is-on">
            <rect x={hover.sx - 18} y="170" width="40" height="14" rx="3" />
            <text x={hover.sx} y="180" textAnchor="middle">{active.label}</text>
          </g>
        </>)}
      </svg>

      {/* tooltip */}
      <div className={`wxb-chart-tip ${hover.on ? 'is-on' : ''}`} style={{ left: hover.left, top: hover.top }}>
        {active && (<>
          <div className="wxb-chart-tip-when">{active.label}{active.date ? ` · ${active.date}` : ''}</div>
          {series.map(sc => (
            <div key={sc.key} className="wxb-chart-tip-row">
              <span className="l"><span className="wxb-chart-swatch" style={{ background: sc.color }} />{sc.label}</span>
              <span className="v">{fmtVal(active.values[sc.key] ?? 0)}</span>
            </div>
          ))}
          {isLegacy && (
            <div className="wxb-chart-tip-row">
              <span className="l"><span className="wxb-chart-swatch" style={{ background: '#E8B53C' }} />vs Target</span>
              <span className={`wxb-chart-tip-delta ${(active.values['used'] ?? 0) - targetValue >= 0 ? 'is-good' : 'is-bad'}`}>
                {(active.values['used'] ?? 0) - targetValue >= 0 ? '+' : '−'}{Math.abs((active.values['used'] ?? 0) - targetValue).toFixed(1)}
              </span>
            </div>
          )}
        </>)}
      </div>
    </div>
  );

  /* ── headless: just the chart ── */
  if (headless) return <div className={className} style={style}>{chartSvg}</div>;

  /* ── full card mode ── */
  return (
    <div className={`wxb-chart-card ${className}`} style={style}>
      <div className="wxb-chart-head"><h3 className="wxb-chart-title">{title}</h3></div>
      {subtitle && <div className="wxb-chart-sub">{subtitle}</div>}
      <div className="wxb-chart-legend">
        {series.map(sc => (
          <span key={sc.key} className="wxb-chart-legend-item">
            <span className="wxb-chart-swatch" style={{ background: sc.color }} />{sc.label}
          </span>
        ))}
        {isLegacy && <span className="wxb-chart-legend-item"><span className="wxb-chart-swatch" style={{ background: '#E8B53C' }} />Target {targetValue}%</span>}
      </div>
      {chartSvg}
    </div>
  );
};
