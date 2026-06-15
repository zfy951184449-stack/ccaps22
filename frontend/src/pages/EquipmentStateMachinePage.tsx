/**
 * 设备状态机编辑器(排产 · 模型层 · 无时间无实例)。
 * 权威设计:docs/production_scheduling/10_process_flow_model_spec.md §3.3(设备与状态机)。
 *
 * 设备状态 = 多属性状态向量;每属性一条小状态机 {值集, 转移边=操作, 过期钟}。属性三类:离散/计数/日历。
 * 布局:左 设备类列表(可点选)→ 右 该类多属性,每属性画一个小状态机(状态节点 + 转移边标操作 + 过期钟 DHT/CHT)。
 * 转移边:实线蓝=主链人编(投产/接种);虚线绿=引擎按需 pull 派生(CIP/SIP/装袋/换柱/房间放行)。
 */
import React, { useMemo, useState } from 'react';
import {
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
  WxbTag,
} from '../components/wxb-ui';
import { AttributePanel } from '../components/EquipmentStateMachine';
import { buildEsmCatalog } from '../mock/equipmentStateMachineMock';
import {
  ESM_EDGE_ORIGIN_LABEL,
} from '../types/equipmentStateMachine';
import type {
  EsmEquipmentClass,
  EsmFabrication,
  EsmTransition,
} from '../types/equipmentStateMachine';
import './EquipmentStateMachinePage.css';

const FAB_LABEL: Record<EsmFabrication, string> = {
  SUS: '一次性 SUS',
  SS: '不锈钢 SS',
  fixed: '固定设施',
  consumable: '耗材 / 跨批',
};

const findEdge = (cls: EsmEquipmentClass | undefined, id: string | null): EsmTransition | undefined => {
  if (!cls || !id) return undefined;
  for (const a of cls.attributes) {
    const e = a.transitions.find((t) => t.id === id);
    if (e) return e;
  }
  return undefined;
};

const EquipmentStateMachinePage: React.FC = () => {
  const catalog = useMemo(() => buildEsmCatalog(), []);
  const [selectedClassId, setSelectedClassId] = useState<string>(catalog.classes[0]?.id ?? '');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const selectedClass = catalog.classes.find((c) => c.id === selectedClassId);
  const selectedEdge = findEdge(selectedClass, selectedEdgeId);

  const selectClass = (id: string) => {
    setSelectedClassId(id);
    setSelectedEdgeId(null);
  };

  const totalAttrs = catalog.classes.reduce((n, c) => n + c.attributes.length, 0);

  return (
    <WxbPageShell size="full" gap="lg" className="esm-page">
      <WxbPageHeader
        eyebrow="排产 · 设备状态机(模型层 · 无时间无实例)"
        title="设备状态机编辑器"
        description="设备状态 = 多属性状态向量;每属性一条小状态机(值集 + 转移边=操作 + 过期钟 DHT/CHT)。CIP/SIP/装袋/换柱/房间放行 = 引擎按需 pull 派生的转移(虚线绿),不在主链手编。"
        meta={
          <span className="esm-meta">
            {catalog.classes.length} 个设备类 · {totalAttrs} 条属性 · 出处 {catalog.spec}
          </span>
        }
      />

      <div className="esm-legend" role="list" aria-label="图例">
        <span className="esm-legend-item" role="listitem">
          <svg width="34" height="10" aria-hidden>
            <line x1="2" y1="5" x2="32" y2="5" stroke="var(--wx-blue-600)" strokeWidth="2" />
          </svg>
          主链人编(投产 / 接种)
        </span>
        <span className="esm-legend-item" role="listitem">
          <svg width="34" height="10" aria-hidden>
            <line x1="2" y1="5" x2="32" y2="5" stroke="var(--wx-green-600)" strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          引擎派生(CIP / SIP / 装袋 / 房间放行)
        </span>
        <span className="esm-legend-item" role="listitem">
          <span className="esm-legend-clock">CHT / DHT</span>过期钟(max-lag)
        </span>
        <span className="esm-legend-item" role="listitem">
          <WxbTag color="blue">离散态</WxbTag>
          <WxbTag color="green">计数消耗</WxbTag>
          <WxbTag color="amber">日历过期</WxbTag>
        </span>
      </div>

      <div className="esm-split">
        {/* 左:设备类列表 */}
        <WxbPageSection variant="framed" density="compact" className="esm-classlist">
          <div className="esm-view-label">设备类(点选查看状态机)</div>
          {catalog.classes.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`esm-class${c.id === selectedClassId ? ' selected' : ''}`}
              onClick={() => selectClass(c.id)}
            >
              <div className="esm-class-title">
                <span className="esm-class-name">{c.name}</span>
                {c.code && <span className="esm-class-code">{c.code}</span>}
              </div>
              <div className="esm-class-tags">
                <WxbTag color={c.fabrication === 'SS' ? 'cyan' : 'neutral'}>{FAB_LABEL[c.fabrication]}</WxbTag>
                <WxbTag color={c.hasCip ? 'green' : 'neutral'}>{c.hasCip ? '有 CIP/SIP' : '无 CIP/SIP'}</WxbTag>
                {c.crossBatch && <WxbTag color="amber">跨批持久</WxbTag>}
                <span className="esm-class-attrcount">{c.attributes.length} 属性</span>
              </div>
              <p className="esm-class-summary">{c.summary}</p>
            </button>
          ))}
        </WxbPageSection>

        {/* 右:多属性状态机 + 检视 */}
        <WxbPageSection variant="framed" density="compact" className="esm-detail">
          {selectedClass ? (
            <>
              <div className="esm-detail-head">
                <div className="esm-detail-title">{selectedClass.name}</div>
                {selectedClass.readyText && <code className="esm-detail-ready">{selectedClass.readyText}</code>}
                {selectedClass.note && <p className="esm-detail-note">{selectedClass.note}</p>}
              </div>

              <div className="esm-attrs">
                {selectedClass.attributes.map((a) => (
                  <AttributePanel
                    key={a.id}
                    attribute={a}
                    selectedEdgeId={selectedEdgeId}
                    onEdgeClick={(t) => setSelectedEdgeId((prev) => (prev === t.id ? null : t.id))}
                  />
                ))}
              </div>

              {selectedEdge && (
                <div className="esm-edge-inspector">
                  <div className="esm-view-label">转移边 / 操作 — 检视</div>
                  <div className="esm-edge-title">
                    <WxbTag color={selectedEdge.origin === 'derivable' ? 'green' : 'blue'}>
                      {ESM_EDGE_ORIGIN_LABEL[selectedEdge.origin]}
                    </WxbTag>
                    <strong>{selectedEdge.operation}</strong>
                    {selectedEdge.clockText && <WxbTag color="amber">{selectedEdge.clockText}</WxbTag>}
                  </div>
                  <dl className="esm-dl">
                    <dt>转移</dt>
                    <dd>{selectedEdge.from} → {selectedEdge.to}</dd>
                    <dt>跨属性前提</dt>
                    <dd>
                      {selectedEdge.preconditions?.length
                        ? selectedEdge.preconditions.map((p) => p.label).join(' ∧ ')
                        : '（无）'}
                    </dd>
                    {(selectedEdge.countDelta || selectedEdge.resetCount) && (
                      <>
                        <dt>计数效果</dt>
                        <dd>
                          {selectedEdge.resetCount ? '寿命清零(换柱复位)' : ''}
                          {selectedEdge.countDelta ? `+${selectedEdge.countDelta} cycle` : ''}
                        </dd>
                      </>
                    )}
                    <dt>说明</dt>
                    <dd>{selectedEdge.note || '—'}</dd>
                  </dl>
                </div>
              )}

              <p className="esm-derive-hint">
                <strong>派生说明:</strong> 标「引擎派生」的转移(CIP/SIP/装袋/换柱/房间放行)<strong>不在主链手编</strong> ——
                由「操作需求:设备=clean∧sterile / 房间=released / 已装柱∧在寿命」在批次层用目标回归沿转移边反向走自动派生(§4)。此处只声明状态机结构。
                <span className="esm-todo">TODO:编辑(增删属性 / 改值集 / 改过期钟 / 自定义转移)与持久化后续接;当前为只读检视。</span>
              </p>
            </>
          ) : (
            <div className="esm-empty">点选左侧一个设备类查看其多属性状态机。</div>
          )}
        </WxbPageSection>
      </div>
    </WxbPageShell>
  );
};

export default EquipmentStateMachinePage;
