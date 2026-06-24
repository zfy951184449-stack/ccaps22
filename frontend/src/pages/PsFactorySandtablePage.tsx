/**
 * 工厂数字沙盘页(排产原型 · 自成一套独立数据)。
 * 厂区 → 产线 → 房间 → 设备;产线着色 + 按产线聚焦;房间内分类整齐网格;设备形状即信息。
 * 本切片:沙盘只读渲染 + 产线聚焦 + 选中查看。拖拽摆位 / 增删 / 编辑抽屉 / 批量改 / CIP 拓扑 / 清单为后续切片。
 */
import React, { useMemo, useState } from 'react';
import { WxbPageHeader, WxbPageShell, WxbTag } from '../components/wxb-ui';
import { buildPsFactoryModel } from '../mock/psSandtableMock';
import { PsSandtableCanvas } from '../components/PsResourceMaster/PsSandtableCanvas';
import { PS_EQUIPMENT_TYPE_LABEL } from '../types/psSandtable';
import './PsFactorySandtablePage.css';

const PsFactorySandtablePage: React.FC = () => {
  const model = useMemo(() => buildPsFactoryModel(), []);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const lineColorVar = (i: number) => `var(--ps-line-${(i % 6) + 1})`;

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

  return (
    <WxbPageShell size="full" gap="lg" className="psft-page">
      <WxbPageHeader
        eyebrow="排产原型 · 工厂数字沙盘(自成一套 · 独立数据)"
        title="工厂数字沙盘"
        description="厂区 → 产线 → 房间 → 设备。产线用颜色 + 聚焦表达,部分房间多产线共用;房间内设备按类别自动整齐成网格,形状即信息(罐子就像罐子)。本切片为沙盘只读渲染 + 产线聚焦 + 选中查看。"
        meta={
          <span className="psft-tb-label">
            {model.site.name} · {counts.lines} 产线 · {counts.rooms} 房间(含 {counts.shared} 共用)· {counts.equipment} 设备
          </span>
        }
      />

      <div className="psft-toolbar">
        <span className="psft-tb-label">按产线聚焦:</span>
        <span
          className={`psft-line-chip${focusedLineId === null ? ' on' : ''}`}
          onClick={() => setFocusedLineId(null)}
        >
          全部
        </span>
        {model.lines.map((l, i) => (
          <span
            key={l.id}
            className={`psft-line-chip${focusedLineId === l.id ? ' on' : ''}`}
            style={{ color: focusedLineId === l.id ? lineColorVar(i) : undefined }}
            onClick={() => setFocusedLineId((cur) => (cur === l.id ? null : l.id))}
          >
            <span className="psft-line-dot" style={{ background: lineColorVar(i) }} />
            {l.name}
          </span>
        ))}
        <div className="psft-legend">
          <span className="psft-leg"><span className="psft-leg-sw" style={{ background: 'var(--ps-line-1)' }} />产线色 = 属哪条线</span>
          <span className="psft-leg"><span className="psft-leg-sw" style={{ background: 'var(--ps-eq-fill)', border: '0.5px solid var(--ps-border)' }} />设备灰 = 形状即"是什么"</span>
          <span className="psft-leg"><span className="psft-leg-sw" style={{ background: 'var(--ps-eq-fill-cip)', border: '0.5px solid var(--ps-border)' }} />绿 = CIP / 公用</span>
        </div>
      </div>

      {selected ? (
        <div className="psft-selbar">
          <span className="psft-sel-code">{selected.eq.code}</span>
          <WxbTag color="blue">{PS_EQUIPMENT_TYPE_LABEL[selected.eq.equipmentType]}</WxbTag>
          <span className="psft-sel-name">{selected.eq.name}</span>
          <span className="psft-sel-sep" />
          {selected.eq.equipmentType === 'reactor' && (
            <span className="psft-sel-kv">{selected.eq.stirDirection === 'bottom' ? '下搅拌' : '上搅拌'}</span>
          )}
          {selected.eq.volumeL ? <span className="psft-sel-kv">{selected.eq.volumeL}L</span> : null}
          {selected.eq.brand ? <span className="psft-sel-kv">{selected.eq.brand}</span> : null}
          <span className="psft-sel-kv">房间 {selected.room ? `${selected.room.code} ${selected.room.name}` : '未归位'}</span>
          <span className="psft-sel-kv">产线 {selected.lines.map((l) => l.code).join(' / ') || '—'}</span>
          <span className="psft-sel-hint">编辑 / 拖拽摆位 / 批量改为下一切片</span>
          <span className="psft-sel-close" onClick={() => setSelectedId(null)}>清除选择</span>
        </div>
      ) : (
        <div className="psft-selbar muted">点选任一设备查看详情 · 形状即信息(反应器按上/下搅拌与尺寸、储罐、配液罐、层析柱、超滤膜包、Wave、摇瓶、BSC/LAF、CIP 撬装)</div>
      )}

      <div className="psft-stage">
        <PsSandtableCanvas
          model={model}
          focusedLineId={focusedLineId}
          selectedEquipmentId={selectedId}
          onSelectEquipment={setSelectedId}
        />
      </div>
    </WxbPageShell>
  );
};

export default PsFactorySandtablePage;
