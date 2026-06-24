/**
 * 工厂数字沙盘视图(viz+edit · 沙盘/逻辑 双视图之「沙盘」)。
 * 俯瞰真实车间:套间=分区、房间在内、设备各就其位、CIP 站在公用带、管线照走向连、物料 USP→DSP。
 *
 * 与「逻辑视图」(PsCipTopology)共享同一份数据 + 同一个编辑抽屉 + 同一套校验,只是空间摆位不同:
 *   点设备/站/管线 → onSelect 打开右侧编辑抽屉;校验问题节点亮红点;suite 角色/房间放行用颜色标。
 *
 * 摆位 = 合成示意(按工艺流程 + 设备类型分区),非测绘几何。布局坐标后续可做「拖动校准 + 保存」(下一步)。
 */
import React, { useMemo } from 'react';
import type {
  PsCipEquipment,
  PsCipStation,
  PsPipeline,
  PsRoom,
  PsSuite,
} from '../../types/psResource';
import { PS_CIP_EQUIP_TYPE_LABEL } from '../../types/psResource';
import type { PsCipFocus } from './PsCipTopology';

interface Props {
  suites: PsSuite[];
  rooms: PsRoom[];
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  equipment: PsCipEquipment[];
  mode?: 'view' | 'edit';
  selected?: PsCipFocus | null;
  onSelect?: (f: PsCipFocus | null) => void;
  issueEntities?: Map<string, { severity: 'error' | 'warn'; message: string }>;
}

const VW = 900;
const VH = 472;

// 设备类型 → 厂区分区(合成摆位:反应器在 USP、层析/UFDF 在 DSP 病毒前、罐/转料在公用储罐区)
const zoneOfEquip = (e: PsCipEquipment): 'usp' | 'dsp-pre' | 'utility' => {
  if (e.type === 'reactor') return 'usp';
  if (e.type === 'akta-skid' || e.type === 'ufdf-skid') return 'dsp-pre';
  return 'utility';
};

// suite 角色 → 分区 key(用于把套间放到 USP / DSP前 / DSP后 三栏)
const zoneOfSuite = (s: PsSuite): 'usp' | 'dsp-pre' | 'dsp-post' => {
  if (s.id.includes('usp') || /usp/i.test(s.name)) return 'usp';
  if (s.role === 'post-viral') return 'dsp-post';
  return 'dsp-pre';
};

interface Rect { x: number; y: number; w: number; h: number; }

export const PsFactorySandtable: React.FC<Props> = ({
  suites,
  rooms,
  stations,
  pipelines,
  equipment,
  mode = 'view',
  selected = null,
  onSelect,
  issueEntities,
}) => {
  const select = (f: PsCipFocus) => {
    if (!onSelect) return;
    const same = selected && selected.kind === f.kind && selected.id === f.id;
    onSelect(same ? null : f);
  };
  const issueOf = (id: string) => issueEntities?.get(id);
  const isSel = (kind: PsCipFocus['kind'], id: string) => selected?.kind === kind && selected.id === id;

  const layout = useMemo(() => {
    // 三个分区栏
    const zones: Record<'usp' | 'dsp-pre' | 'dsp-post', Rect> = {
      usp: { x: 16, y: 56, w: 268, h: 296 },
      'dsp-pre': { x: 300, y: 56, w: 300, h: 296 },
      'dsp-post': { x: 616, y: 56, w: 268, h: 296 },
    };

    // 房间盒(按 suite 归属塞进对应分区,纵向堆叠)
    const roomBox = new Map<string, Rect>();
    (['usp', 'dsp-pre', 'dsp-post'] as const).forEach((zk) => {
      const z = zones[zk];
      const zoneSuites = suites.filter((s) => zoneOfSuite(s) === zk);
      const zoneRooms = rooms.filter((r) => zoneSuites.some((s) => s.id === r.suiteId));
      const n = Math.max(zoneRooms.length, 1);
      const top = z.y + 34;
      const avail = z.h - 44;
      const rh = Math.min(avail / n - 8, 210);
      zoneRooms.forEach((r, i) => {
        roomBox.set(r.id, { x: z.x + 12, y: top + i * (rh + 8), w: z.w - 24, h: rh });
      });
    });

    // 设备芯片(塞进其分区第一个房间盒内,纵向堆叠;无房间则塞分区底)
    const equipPos = new Map<string, Rect>();
    (['usp', 'dsp-pre'] as const).forEach((zk) => {
      const z = zones[zk];
      const zoneSuites = suites.filter((s) => zoneOfSuite(s) === zk);
      const firstRoom = rooms.find((r) => zoneSuites.some((s) => s.id === r.suiteId));
      const host = firstRoom ? roomBox.get(firstRoom.id) : undefined;
      const eqs = equipment.filter((e) => zoneOfEquip(e) === zk);
      const startY = (host ? host.y : z.y) + 30;
      const x = (host ? host.x : z.x) + 10;
      const w = (host ? host.w : z.w) - 20;
      eqs.forEach((e, i) => equipPos.set(e.id, { x, y: startY + i * 32, w, h: 26 }));
    });

    // 公用带:左=储罐/配液(utility 设备),右=CIP 站
    const band: Rect = { x: 16, y: 372, w: 868, h: 86 };
    const utilEquip = equipment.filter((e) => zoneOfEquip(e) === 'utility');
    utilEquip.forEach((e, i) => {
      equipPos.set(e.id, { x: band.x + 12 + (i % 4) * 122, y: band.y + 30 + Math.floor(i / 4) * 30, w: 112, h: 26 });
    });

    const stationPos = new Map<string, Rect>();
    const stBaseX = band.x + 524;
    stations.forEach((s, i) => {
      stationPos.set(s.id, { x: stBaseX + i * 116, y: band.y + 34, w: 104, h: 40 });
    });

    return { zones, roomBox, equipPos, stationPos, band };
  }, [suites, rooms, equipment, stations]);

  const cx = (r?: Rect) => (r ? r.x + r.w / 2 : 0);
  const cy = (r?: Rect) => (r ? r.y + r.h / 2 : 0);

  return (
    <div className="psrm-sandtable">
      <div className="psrm-sand-cap">
        <span>WBP2486 原液车间 · 俯瞰沙盘(合成示意,位置可后续校准)</span>
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" aria-label="工厂数字沙盘平面图">
        <defs>
          <marker id="psand-flow" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--wx-primary, var(--wx-blue-600))" />
          </marker>
        </defs>

        {/* 物料流向 */}
        <line x1="92" y1="28" x2="840" y2="28" stroke="var(--wx-blue-300)" strokeWidth="1.4" markerEnd="url(#psand-flow)" />
        <text x="16" y="32" fontSize="11" fill="var(--wx-blue-700)">物料流向</text>
        <text x="400" y="24" fontSize="10.5" fill="var(--wx-text-secondary, var(--wx-blue-700))">USP 收获 → DSP 捕获(AC)→ 病毒灭活 → 灌装</text>

        {/* 管线(主站 → 设备):画在底层 */}
        {pipelines.map((p) => {
          const st = p.primaryStationId ? layout.stationPos.get(p.primaryStationId) : undefined;
          const eqs = equipment.filter((e) => e.pipelineId === p.id);
          const dim = selected != null && !(selected.kind === 'pipeline' && selected.id === p.id);
          if (!st) return null;
          return (
            <g key={`pl-${p.id}`} opacity={dim ? 0.35 : 1}>
              {eqs.map((e) => {
                const ep = layout.equipPos.get(e.id);
                if (!ep) return null;
                return (
                  <path
                    key={`pl-${p.id}-${e.id}`}
                    d={`M ${cx(st)} ${st.y} C ${cx(st)} ${st.y - 60}, ${cx(ep)} ${cy(ep) + 70}, ${cx(ep)} ${cy(ep)}`}
                    fill="none"
                    stroke="var(--wx-primary, var(--wx-blue-600))"
                    strokeWidth={1.4}
                    style={{ cursor: 'pointer' }}
                    onClick={() => select({ kind: 'pipeline', id: p.id })}
                  />
                );
              })}
            </g>
          );
        })}

        {/* 套间分区 + 房间 */}
        {suites.map((s) => {
          const zk = zoneOfSuite(s);
          const z = layout.zones[zk];
          const post = s.role === 'post-viral';
          const zoneRooms = rooms.filter((r) => r.suiteId === s.id);
          return (
            <g key={`z-${s.id}`}>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                rx={10}
                fill={post ? 'var(--wx-amber-100)' : 'var(--wx-blue-100)'}
                stroke={post ? 'var(--wx-amber-500)' : 'var(--wx-blue-300)'}
                strokeWidth={post ? 1.4 : 1}
              />
              <text x={z.x + 12} y={z.y + 20} fontSize="12.5" fontWeight="600" fill={post ? 'var(--wx-amber-700)' : 'var(--wx-blue-700)'}>
                {s.name}
              </text>
              <text x={z.x + z.w - 12} y={z.y + 20} fontSize="10.5" textAnchor="end" fill={post ? 'var(--wx-amber-700)' : 'var(--wx-blue-700)'}>
                {s.role === 'post-viral' ? '病毒后' : s.role === 'pre-viral' ? '病毒前' : '中性'}
              </text>
              {zoneRooms.map((r) => {
                const rb = layout.roomBox.get(r.id);
                if (!rb) return null;
                const released = r.releaseState === 'released';
                return (
                  <g key={`rm-${r.id}`}>
                    <rect x={rb.x} y={rb.y} width={rb.w} height={rb.h} rx={7} fill="var(--wx-bg, #ffffff)" stroke="var(--wx-blue-100)" strokeWidth={0.8} />
                    <circle cx={rb.x + rb.w - 12} cy={rb.y + 14} r={4} fill={released ? 'var(--wx-green-500)' : 'var(--wx-amber-500)'} />
                    <text x={rb.x + 12} y={rb.y + 17} fontSize="11.5" fontWeight="600" fill="var(--wx-blue-700)">{r.code}</text>
                    <text x={rb.x + 12} y={rb.y + 31} fontSize="10" fill="var(--wx-text-secondary, var(--wx-blue-700))">
                      {r.name} · {released ? '已放行' : '未放行'}
                    </text>
                  </g>
                );
              })}
              {post && zoneRooms.length > 1 && (
                <text x={z.x + 12} y={z.y + z.h - 8} fontSize="10" fill="var(--wx-amber-700)">同 suite 内 pre/post-viral 互斥</text>
              )}
            </g>
          );
        })}

        {/* 公用带:储罐/配液 + CIP 站 */}
        <rect x={layout.band.x} y={layout.band.y} width={524} height={layout.band.h} rx={10} fill="var(--wx-blue-100)" stroke="var(--wx-blue-300)" strokeWidth={0.8} />
        <text x={layout.band.x + 12} y={layout.band.y + 18} fontSize="11.5" fontWeight="600" fill="var(--wx-blue-700)">储罐 / 配液区(短占 · 转储释放)</text>
        <rect x={layout.band.x + 524} y={layout.band.y} width={344} height={layout.band.h} rx={10} fill="var(--wx-green-100)" stroke="var(--wx-green-300, var(--wx-green-500))" strokeWidth={0.8} />
        <text x={layout.band.x + 536} y={layout.band.y + 18} fontSize="11.5" fontWeight="600" fill="var(--wx-green-700)">CIP 站(容量 1 · 跨部门共用)</text>

        {/* 设备芯片 */}
        {equipment.map((e) => {
          const ep = layout.equipPos.get(e.id);
          if (!ep) return null;
          const sel = isSel('equipment', e.id);
          const issue = issueOf(e.id);
          const dim = selected != null && !sel && !(selected.kind === 'pipeline' && pipelines.find((p) => p.id === selected.id)?.id === e.pipelineId);
          return (
            <g key={`eq-${e.id}`} opacity={dim ? 0.4 : 1} style={{ cursor: 'pointer' }} onClick={() => select({ kind: 'equipment', id: e.id })}>
              <rect x={ep.x} y={ep.y} width={ep.w} height={ep.h} rx={5} fill="var(--wx-blue-200)" stroke={sel ? 'var(--wx-primary, var(--wx-blue-600))' : 'var(--wx-blue-300)'} strokeWidth={sel ? 2 : 0.8} />
              <text x={ep.x + 8} y={ep.y + 17} fontSize="10.5" fontWeight="600" fill="var(--wx-blue-700)">
                {e.code} · {PS_CIP_EQUIP_TYPE_LABEL[e.type]}
              </text>
              {issue && <SandBadge x={ep.x + ep.w - 6} y={ep.y + 5} severity={issue.severity} />}
            </g>
          );
        })}

        {/* CIP 站 */}
        {stations.map((s) => {
          const sp = layout.stationPos.get(s.id);
          if (!sp) return null;
          const sel = isSel('station', s.id);
          const issue = issueOf(s.id);
          const dim = selected != null && !sel && !(selected.kind === 'pipeline' && (pipelines.find((p) => p.id === selected.id)?.primaryStationId === s.id || pipelines.find((p) => p.id === selected.id)?.backupStationId === s.id));
          return (
            <g key={`st-${s.id}`} opacity={dim ? 0.4 : 1} style={{ cursor: 'pointer' }} onClick={() => select({ kind: 'station', id: s.id })}>
              <rect
                x={sp.x}
                y={sp.y}
                width={sp.w}
                height={sp.h}
                rx={6}
                fill={s.emergencyOnly ? 'var(--wx-amber-100)' : 'var(--wx-green-100)'}
                stroke={sel ? 'var(--wx-primary, var(--wx-blue-600))' : s.emergencyOnly ? 'var(--wx-amber-500)' : 'var(--wx-green-500)'}
                strokeWidth={sel ? 2.4 : 1.2}
              />
              <text x={sp.x + 10} y={sp.y + 17} fontSize="10.5" fontWeight="600" fill="var(--wx-green-700)">{s.code || '(未命名)'}</text>
              <text x={sp.x + 10} y={sp.y + 31} fontSize="9.5" fill="var(--wx-text-secondary, var(--wx-blue-700))">{s.emergencyOnly ? '备站 · 应急' : '主站'}</text>
              {issue && <SandBadge x={sp.x + sp.w - 6} y={sp.y + 5} severity={issue.severity} />}
            </g>
          );
        })}
      </svg>

      <div className="psrm-topo-legend">
        <span className="psrm-topo-leg"><span className="psrm-sand-sw blue" />病毒前套间</span>
        <span className="psrm-topo-leg"><span className="psrm-sand-sw amber" />病毒后套间(互斥)</span>
        <span className="psrm-topo-leg"><span className="psrm-sand-dot green" />房间已放行</span>
        <span className="psrm-topo-leg"><span className="psrm-sand-dot amber" />未放行</span>
        <span className="psrm-topo-hint">
          {mode === 'edit' ? '点房间外的设备 / CIP 站 / 管线编辑(房间编辑随四家族推) · 摆位拖动校准下一步' : '点单元查看 · 切到编辑可改'}
        </span>
      </div>
    </div>
  );
};

const SandBadge: React.FC<{ x: number; y: number; severity: 'error' | 'warn' }> = ({ x, y, severity }) => (
  <g pointerEvents="none">
    <circle cx={x} cy={y} r={6} fill={severity === 'error' ? 'var(--wx-red-500)' : 'var(--wx-amber-500)'} />
    <text x={x} y={y + 3} fontSize="9" fontWeight="700" textAnchor="middle" fill="#ffffff">!</text>
  </g>
);

export default PsFactorySandtable;
