/**
 * 工厂数字沙盘页(排产原型 · 自成一套独立数据)。
 * 厂区 → 产线 → 房间 → 设备;产线着色 + 按产线聚焦;房间内分类整齐网格;设备形状即信息。
 * 界面 chrome 全部基于 wxb-ui(WxbKpiCard / WxbSparkline / WxbSegmented / WxbCard / WxbProgress);
 * 中央沙盘为 bespoke SVG 可视化(同 WxbGanttChart 的定位)。本切片:只读渲染 + 产线聚焦 + 选中查看。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  WxbButton,
  WxbCard,
  WxbDivider,
  WxbKpiCard,
  WxbPageHeader,
  WxbPageShell,
  WxbProgress,
  WxbSegmented,
  WxbTag,
} from '../components/wxb-ui';
import { buildPsFactoryModel } from '../mock/psSandtableMock';
import { PsSandtableCanvas } from '../components/PsResourceMaster/PsSandtableCanvas';
import { colorGroup } from '../components/PsResourceMaster/PsEquipmentIcon';
import {
  PS_CATEGORY_LABEL,
  PS_CATEGORY_ORDER,
  PS_EQUIPMENT_CATEGORY,
  PS_EQUIPMENT_TYPE_LABEL,
} from '../types/psSandtable';
import type { PsEquipmentCategory } from '../types/psSandtable';
import './PsFactorySandtablePage.css';

const lineColorVar = (i: number) => `var(--ps-line-${(i % 6) + 1})`;

const PsFactorySandtablePage: React.FC = () => {
  const model = useMemo(() => buildPsFactoryModel(), []);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const eq = model.equipment.find((e) => e.id === selectedId);
    if (!eq) return null;
    const room = model.rooms.find((r) => r.id === eq.roomId);
    const lineIds = model.roomLines.filter((rl) => rl.roomId === eq.roomId).map((rl) => rl.lineId);
    const lines = model.lines.filter((l) => lineIds.includes(l.id));
    return { eq, room, lines };
  }, [selectedId, model]);

  const counts = {
    lines: model.lines.length,
    rooms: model.rooms.length,
    equipment: model.equipment.length,
    shared: new Set(
      model.roomLines.reduce<string[]>((acc, rl) => {
        const n = model.roomLines.filter((x) => x.roomId === rl.roomId).length;
        if (n > 1) acc.push(rl.roomId);
        return acc;
      }, []),
    ).size,
  };

  const dist = useMemo(() => {
    const cat = new Map<PsEquipmentCategory, number>();
    model.equipment.forEach((e) => {
      const c = PS_EQUIPMENT_CATEGORY[e.equipmentType];
      cat.set(c, (cat.get(c) ?? 0) + 1);
    });
    const catArr = PS_CATEGORY_ORDER.filter((c) => cat.has(c)).map((c) => ({ key: c, label: PS_CATEGORY_LABEL[c], count: cat.get(c) ?? 0 }));
    const roomLine = new Map<string, string[]>();
    model.roomLines.forEach((rl) => {
      const a = roomLine.get(rl.roomId) ?? [];
      a.push(rl.lineId);
      roomLine.set(rl.roomId, a);
    });
    const lineCount = new Map<string, number>();
    model.equipment.forEach((e) => {
      if (!e.roomId) return;
      (roomLine.get(e.roomId) ?? []).forEach((lid) => lineCount.set(lid, (lineCount.get(lid) ?? 0) + 1));
    });
    const lineArr = model.lines.map((l, i) => ({ code: l.code, name: l.name, count: lineCount.get(l.id) ?? 0, colorIndex: i }));
    const catMax = Math.max(...catArr.map((c) => c.count), 1);
    const lineMax = Math.max(...lineArr.map((l) => l.count), 1);
    return { catArr, lineArr, catMax, lineMax };
  }, [model]);

  const lineOptions = [
    { label: '全部', value: 'all' },
    ...model.lines.map((l, i) => ({
      value: l.id,
      label: (
        <span className="psft-seg-line">
          <span className="psft-line-dot" style={{ background: lineColorVar(i) }} />
          {l.name}
        </span>
      ),
    })),
  ];

  // 聚焦切换:若选中设备落在被淡出的房间,清掉选中(视觉淡出=不可选)
  useEffect(() => {
    if (!selectedId || !focusedLineId) return;
    const eq = model.equipment.find((e) => e.id === selectedId);
    if (!eq?.roomId) return;
    const inFocus = model.roomLines.some((rl) => rl.roomId === eq.roomId && rl.lineId === focusedLineId);
    if (!inFocus) setSelectedId(null);
  }, [focusedLineId, selectedId, model]);

  const tagColor = selected ? ({ blue: 'blue', green: 'green', cip: 'green', slate: 'neutral' } as const)[colorGroup(selected.eq.equipmentType)] : 'blue';

  return (
    <WxbPageShell size="full" gap="lg" className="psft-page">
      <WxbPageHeader
        eyebrow="排产原型 · 工厂数字沙盘(自成一套 · 独立数据)"
        title="工厂数字沙盘"
        description="厂区 → 产线 → 房间 → 设备。产线用颜色 + 聚焦表达,部分房间多产线共用;房间内设备按类别自动整齐成网格,形状即信息(罐子就像罐子)。本切片为沙盘只读渲染 + 产线聚焦 + 选中查看。"
        meta={<span className="psft-meta">{model.site.name}</span>}
      />

      <div className="psft-kpis">
        <WxbKpiCard title="产线" value={counts.lines} />
        <WxbKpiCard title="主要功能间" value={counts.rooms} />
        <WxbKpiCard title="设备" value={counts.equipment} />
        <WxbKpiCard title="多产线共用房间" value={counts.shared} />
      </div>

      <WxbCard className="psft-toolbar" style={{ padding: '12px 16px' }}>
        <WxbSegmented
          options={[{ label: '浏览', value: 'view' }, { label: '编辑', value: 'edit' }]}
          value={editMode ? 'edit' : 'view'}
          onChange={(v) => setEditMode(v === 'edit')}
        />
        {editMode && <span className="psft-edit-hint">拖表头移动房间 · 拖右下角改宽 · 自动吸附网格</span>}
        <WxbDivider direction="vertical" />
        <span className="psft-meta">按产线聚焦</span>
        <WxbSegmented
          options={lineOptions}
          value={focusedLineId ?? 'all'}
          onChange={(v) => setFocusedLineId(v === 'all' ? null : v)}
        />
        <div className="psft-legend">
          <span className="psft-leg"><span className="psft-leg-sw cg-blue" />蓝 = 反应器 / 罐 / 离心机</span>
          <span className="psft-leg"><span className="psft-leg-sw cg-green" />绿 = 培养器具 / 储袋</span>
          <span className="psft-leg"><span className="psft-leg-sw cg-cip" />绿 = CIP / 公用</span>
        </div>
      </WxbCard>

      {selected ? (
        <WxbCard className="psft-selbar" style={{ padding: '10px 16px' }}>
          <span className="psft-sel-code">{selected.eq.code}</span>
          <WxbTag color={tagColor}>{PS_EQUIPMENT_TYPE_LABEL[selected.eq.equipmentType]}</WxbTag>
          <span className="psft-sel-name">{selected.eq.name}</span>
          <WxbDivider direction="vertical" />
          {selected.eq.equipmentType === 'reactor' && (
            <span className="psft-sel-kv">{selected.eq.stirDirection === 'bottom' ? '下搅拌' : '上搅拌'}</span>
          )}
          {selected.eq.volumeL ? <span className="psft-sel-kv">{selected.eq.volumeL}L</span> : null}
          {selected.eq.brand ? <span className="psft-sel-kv">{selected.eq.brand}</span> : null}
          <span className="psft-sel-kv">房间 {selected.room ? `${selected.room.code} ${selected.room.name}` : '未归位'}</span>
          <span className="psft-sel-kv">产线 {selected.lines.map((l) => l.code).join(' / ') || '—'}</span>
          <span className="psft-sel-hint">切「编辑」可拖房间摆位</span>
          <WxbButton variant="ghost" size="sm" onClick={() => setSelectedId(null)}>清除选择</WxbButton>
        </WxbCard>
      ) : (
        <WxbCard className="psft-selbar muted" style={{ padding: '10px 16px' }}>
          点选任一设备查看详情 · 形状即信息(反应器按上/下搅拌与尺寸、储罐、配液罐、层析柱、超滤膜包、Wave、摇瓶、BSC/LAF、CIP 撬装)
        </WxbCard>
      )}

      <div className="psft-stage">
        <PsSandtableCanvas
          model={model}
          focusedLineId={focusedLineId}
          selectedEquipmentId={selectedId}
          onSelectEquipment={setSelectedId}
          editMode={editMode}
        />
      </div>

      <div className="psft-charts">
        <WxbCard>
          <div className="psft-chart-title">设备类别分布</div>
          <div className="psft-bars">
            {dist.catArr.map((c) => (
              <div className="psft-bar-row" key={c.key}>
                <span className="psft-bar-label">{c.label}</span>
                <span className="psft-bar-prog"><WxbProgress percent={Math.round((c.count / dist.catMax) * 100)} showInfo={false} status="success" /></span>
                <span className="psft-bar-val">{c.count}</span>
              </div>
            ))}
          </div>
        </WxbCard>
        <WxbCard>
          <div className="psft-chart-title">各产线设备数</div>
          <div className="psft-bars">
            {dist.lineArr.map((l) => (
              <div className="psft-bar-row" key={l.code}>
                <span className="psft-bar-label"><span className="psft-line-dot" style={{ background: lineColorVar(l.colorIndex) }} />{l.code}</span>
                <span className="psft-bar-prog"><WxbProgress percent={Math.round((l.count / dist.lineMax) * 100)} showInfo={false} /></span>
                <span className="psft-bar-val">{l.count}</span>
              </div>
            ))}
          </div>
        </WxbCard>
      </div>
    </WxbPageShell>
  );
};

export default PsFactorySandtablePage;
