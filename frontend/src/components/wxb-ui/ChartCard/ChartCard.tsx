import React, { useState, useRef, MouseEvent, useMemo } from 'react';
import './ChartCard.css';

export interface WxbChartDataPoint {
  used: number;
  avail: number;
  label: string;
  date: string;
}

export interface WxbChartCardProps {
  title: string;
  subtitle: string;
  data: WxbChartDataPoint[];
  targetValue?: number;
}

const X0 = 40, X1 = 640, Y0 = 6, Y1 = 162;

export const WxbChartCard: React.FC<WxbChartCardProps> = ({ title, subtitle, data, targetValue = 80 }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [hoverState, setHoverState] = useState<{
    on: boolean;
    i: number;
    sx: number;
    sy: number;
    left: number;
    top: number;
    pctAtCursor: number;
  }>({ on: false, i: 0, sx: 0, sy: 0, left: 0, top: 0, pctAtCursor: 0 });

  const N = data.length;
  // compute X dynamically
  const layoutData = useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      x: X0 + i * ((X1 - X0) / (N - 1))
    }));
  }, [data, N]);

  const yFor = (pct: number) => Y1 - (pct / 100) * (Y1 - Y0);

  const usedPts = layoutData.map(d => `${d.x},${yFor(d.used)}`).join(' ');
  const availPts = layoutData.map(d => `${d.x},${yFor(d.avail)}`).join(' ');
  const areaPts = `${layoutData[0].x},${Y1} ${usedPts} ${layoutData[N - 1].x},${Y1}`;

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!svgRef.current || !chartRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (660 / rect.width);
    const sy = (e.clientY - rect.top) * (200 / rect.height);
    
    if (sx < X0 || sx > X1 || sy < Y0 || sy > Y1) {
      setHoverState(prev => ({ ...prev, on: false }));
      return;
    }

    let bestI = 0, bd = Infinity;
    for (let i = 0; i < layoutData.length; i++) {
      const dist = Math.abs(layoutData[i].x - sx);
      if (dist < bd) { bd = dist; bestI = i; }
    }

    const d = layoutData[bestI];
    const yU = yFor(d.used);

    const px = (d.x / 660) * rect.width;
    const py = (yU / 200) * rect.height;
    
    const tipW = 200, tipH = 100; // approx
    let left = px + 14;
    if (left + tipW + 12 > rect.width) left = px - tipW - 14;
    left = Math.max(2, Math.min(rect.width - tipW - 2, left));
    let top = py - tipH / 2;
    top = Math.max(2, Math.min(rect.height - tipH - 2, top));

    setHoverState({
      on: true,
      i: bestI,
      sx: layoutData[bestI].x,
      sy,
      left,
      top,
      pctAtCursor: ((Y1 - sy) / (Y1 - Y0)) * 100
    });
  };

  const activeData = hoverState.on ? layoutData[hoverState.i] : null;

  return (
    <div className="wxb-chart-card">
      <div className="wxb-chart-head">
        <h3 className="wxb-chart-title">{title}</h3>
      </div>
      <div className="wxb-chart-sub">{subtitle}</div>
      <div className="wxb-chart-legend">
        <span className="wxb-chart-legend-item"><span className="wxb-chart-swatch" style={{ background: '#0B3D7F' }} />Used %</span>
        <span className="wxb-chart-legend-item"><span className="wxb-chart-swatch" style={{ background: '#A3CC4F' }} />Available %</span>
        <span className="wxb-chart-legend-item"><span className="wxb-chart-swatch" style={{ background: '#E8B53C' }} />Target {targetValue}%</span>
      </div>

      <div className="wxb-chart-area" ref={chartRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverState(prev => ({ ...prev, on: false }))}>
        <svg viewBox="0 0 660 200" ref={svgRef} preserveAspectRatio="xMidYMid meet">
          <rect className={`wxb-chart-slice ${hoverState.on ? 'is-on' : ''}`} x={hoverState.on ? hoverState.sx - ((X1 - X0) / (N - 1)) / 2 : 0} y="6" width={(X1 - X0) / (N - 1)} height="156" />

          <g fontFamily="var(--wx-font-mono)" fontSize="10" fill="#8898A8">
            <text x="0" y="10">100%</text><line x1="40" y1="6" x2="640" y2="6" stroke="#EEF2F7" />
            <text x="6" y="46">75%</text> <line x1="40" y1="42" x2="640" y2="42" stroke="#EEF2F7" />
            <text x="6" y="86">50%</text> <line x1="40" y1="82" x2="640" y2="82" stroke="#EEF2F7" />
            <text x="6" y="126">25%</text><line x1="40" y1="122" x2="640" y2="122" stroke="#EEF2F7" />
            <text x="12" y="166">0%</text> <line x1="40" y1="162" x2="640" y2="162" stroke="#E4EAF1" />
          </g>

          <line x1="40" y1={yFor(targetValue)} x2="640" y2={yFor(targetValue)} stroke="#E8B53C" strokeDasharray="3 3" strokeWidth="1" />
          
          <polygon fill="#0B3D7F" fillOpacity="0.10" points={areaPts} />
          <polyline fill="none" stroke="#0B3D7F" strokeWidth="1.7" points={usedPts} />
          <polyline fill="none" stroke="#A3CC4F" strokeWidth="1.6" points={availPts} />

          <g fill="#fff" stroke="#0B3D7F" strokeWidth="1.5">
            {layoutData.map((d, i) => <circle key={i} cx={d.x} cy={yFor(d.used)} r={3} />)}
          </g>

          <g className={`wxb-chart-crosshair ${hoverState.on ? 'is-on' : ''}`}>
            <line x1={hoverState.sx} y1="6" x2={hoverState.sx} y2="162" />
            <line x1="40" y1={hoverState.sy} x2="640" y2={hoverState.sy} />
          </g>

          {hoverState.on && activeData && (
            <g className="wxb-chart-markers is-on">
              <circle className="halo" cx={activeData.x} cy={yFor(activeData.used)} r="8" fill="#1F6FEB" />
              <circle cx={activeData.x} cy={yFor(activeData.used)} r="5.5" fill="#0B3D7F" stroke="#fff" strokeWidth="2" />
              <circle cx={activeData.x} cy={yFor(activeData.avail)} r="4.5" fill="#A3CC4F" stroke="#fff" strokeWidth="2" />
            </g>
          )}

          <g id="xLabels" fontFamily="var(--wx-font-mono)" fontSize="10" fill="#8898A8">
            {layoutData.map((d, i) => <text key={i} x={d.x} y="180" textAnchor="middle">{d.label}</text>)}
          </g>
          
          {hoverState.on && activeData && (
            <>
              <g className="wxb-chart-axis-tag is-on">
                <rect x="4" y={hoverState.sy - 7} width="36" height="14" rx="3" />
                <text x="22" y={hoverState.sy + 3} textAnchor="middle">{hoverState.pctAtCursor.toFixed(0)}%</text>
              </g>
              <g className="wxb-chart-axis-tag is-on">
                <rect x={hoverState.sx - 18} y="170" width="40" height="14" rx="3" />
                <text x={hoverState.sx} y="180" textAnchor="middle">{activeData.label}</text>
              </g>
            </>
          )}
        </svg>

        <div className={`wxb-chart-tip ${hoverState.on ? 'is-on' : ''}`} style={{ left: hoverState.left, top: hoverState.top }}>
          {activeData && (
            <>
              <div className="wxb-chart-tip-when">{activeData.label} · {activeData.date}</div>
              <div className="wxb-chart-tip-row"><span className="l"><span className="wxb-chart-swatch" style={{ background: '#0B3D7F' }} />Used</span><span className="v">{activeData.used.toFixed(1)} %</span></div>
              <div className="wxb-chart-tip-row"><span className="l"><span className="wxb-chart-swatch" style={{ background: '#A3CC4F' }} />Available</span><span className="v">{activeData.avail.toFixed(1)} %</span></div>
              <div className="wxb-chart-tip-row">
                <span className="l"><span className="wxb-chart-swatch" style={{ background: '#E8B53C' }} />vs Target</span>
                <span className={`wxb-chart-tip-delta ${activeData.used - targetValue >= 0 ? 'is-good' : 'is-bad'}`}>
                  {activeData.used - targetValue >= 0 ? '+' : '−'}{Math.abs(activeData.used - targetValue).toFixed(1)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
