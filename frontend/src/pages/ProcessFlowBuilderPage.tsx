/**
 * 主工艺构建界面(工艺流模板编辑 · 模板层 · 无时间)。
 * D17 双视图:① 相对示意甘特(投影)② 语义构建(阶段→操作,需求+产出)。单一真值源 = 模板模型。
 * 只编主链;辅助(CIP/配液/房间放行)由引擎在批次层按需求自动派生(banner 明示)。
 */
import React, { useMemo, useState } from 'react';
import {
  WxbButton,
  WxbGanttChart,
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
} from '../components/wxb-ui';
import { buildWbp2486Template } from '../mock/wbp2486Template';
import { projectTemplateToGantt } from '../components/ProcessFlowBuilder/pfProjector';
import { PF_HOOK_LABEL } from '../types/processFlowTemplate';
import type { PfOperation, PfTemplate } from '../types/processFlowTemplate';
import './ProcessFlowBuilderPage.css';

const findOp = (tpl: PfTemplate, id: string | null): PfOperation | undefined => {
  if (!id) return undefined;
  for (const s of tpl.stages) {
    const o = s.operations.find((op) => op.id === id);
    if (o) return o;
  }
  return undefined;
};

const ProcessFlowBuilderPage: React.FC = () => {
  const [template, setTemplate] = useState<PfTemplate>(() => buildWbp2486Template());
  const [selectedId, setSelectedId] = useState<string | null>('op-fill');

  const projection = useMemo(() => projectTemplateToGantt(template), [template]);
  const selected = findOp(template, selectedId);

  const addOperation = (stageId: string) => {
    const id = `op-new-${Date.now()}`;
    setTemplate((prev) => ({
      ...prev,
      stages: prev.stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              operations: [
                ...s.operations,
                { id, name: '新操作(待编辑)', anchor: false, durationText: '4h', demands: [], effects: [] },
              ],
            }
          : s,
      ),
    }));
    setSelectedId(id);
  };

  return (
    <WxbPageShell size="full" gap="lg" className="pfb-page">
      <WxbPageHeader
        eyebrow="排产 · 主工艺构建(模板层 · 无时间)"
        title={`工艺流构建 — ${template.name}`}
        description="D17 双视图:相对示意甘特 + 语义构建(操作 = 需求 + 产出)。单一真值源 = 模板模型。"
        meta={
          <span className="pfb-meta">
            {template.code} · {template.stages.length} 阶段 · {template.stages.reduce((n, s) => n + s.operations.length, 0)} 主链操作 · {template.hooks.length} 生成规则
          </span>
        }
      />

      <div className="pfb-banner">
        <strong>只编主工艺链。</strong>
        {template.derivedNote}
      </div>

      <WxbPageSection variant="framed" density="compact" className="pfb-section">
        <div className="pfb-view-label">相对示意甘特 · 非真实日期(Day N)· 钉子=实心 / 弹簧=带窗 · 拖拽改约束(后续)</div>
        <div className="pfb-gantt">
          <WxbGanttChart
            tasks={projection.tasks}
            groups={projection.groups}
            timeUnit="day"
            readOnly
            showToday={false}
            onTaskClick={(t) => setSelectedId(t.id.startsWith('hook-') ? selectedId : t.id)}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </WxbPageSection>

      <div className="pfb-split">
        {/* 左:语义构建 */}
        <WxbPageSection variant="framed" density="compact" className="pfb-builder">
          <div className="pfb-view-label">语义构建 · 阶段 → 操作(点选查看 / 编辑)</div>
          {template.stages.map((stage) => (
            <div className="pfb-stage" key={stage.id}>
              <div className="pfb-stage-head">
                <span className={`pfb-phase pfb-phase-${stage.phase.toLowerCase()}`}>{stage.phase}</span>
                {stage.name}
                <WxbButton className="pfb-add" onClick={() => addOperation(stage.id)}>
                  + 操作
                </WxbButton>
              </div>
              {stage.operations.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  className={`pfb-op${o.id === selectedId ? ' selected' : ''}`}
                  onClick={() => setSelectedId(o.id)}
                >
                  <div className="pfb-op-title">
                    <span className={`pfb-kind ${o.anchor ? 'anchor' : 'spring'}`}>{o.anchor ? '钉子' : '弹簧'}</span>
                    {o.code && <span className="pfb-code">{o.code}</span>}
                    <span className="pfb-op-name">{o.name}</span>
                    {o.durationText && <span className="pfb-dur">{o.durationText}</span>}
                    {o.interruptible === false && <span className="pfb-flag">不可中断</span>}
                  </div>
                  <div className="pfb-io">
                    {o.demands.map((d, i) => (
                      <span className="pfb-chip demand" key={`d${i}`} title={d.kind}>
                        需 {d.target}
                        {d.qty ? ` ·${d.qty}` : ''}
                      </span>
                    ))}
                    {o.effects.map((e, i) => (
                      <span className="pfb-chip effect" key={`e${i}`}>
                        产 {e.target}
                        {e.shelfLife && e.shelfLife !== '—' ? ` ·效期${e.shelfLife}` : ''}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </WxbPageSection>

        {/* 右:检视 / 编辑 + 生成规则 */}
        <WxbPageSection variant="framed" density="compact" className="pfb-inspector">
          <div className="pfb-view-label">检视 / 编辑</div>
          {selected ? (
            <div className="pfb-detail">
              <div className="pfb-detail-title">
                <span className={`pfb-kind ${selected.anchor ? 'anchor' : 'spring'}`}>{selected.anchor ? '钉子' : '弹簧'}</span>
                {selected.code && <span className="pfb-code">{selected.code}</span>} {selected.name}
              </div>
              <dl className="pfb-dl">
                <dt>标称时长</dt>
                <dd>{selected.durationText || '—'}{selected.people ? ` · ${selected.people} 人` : ''}{selected.interruptible === false ? ' · 不可中断' : ''}</dd>
                <dt>时序(钉子+弹簧)</dt>
                <dd>{selected.temporal ? `${selected.temporal.relation}${selected.temporal.windowText ? ` · ${selected.temporal.windowText}` : ''}${selected.temporal.hard ? ' · 硬' : ''}` : '—'}</dd>
                <dt>需求 demands</dt>
                <dd>
                  {selected.demands.length ? (
                    <ul className="pfb-list">
                      {selected.demands.map((d, i) => (
                        <li key={i}><span className="pfb-chip demand">{d.kind}</span> {d.target}{d.qty ? ` · ${d.qty}` : ''}</li>
                      ))}
                    </ul>
                  ) : '（无）'}
                </dd>
                <dt>产出 effects</dt>
                <dd>
                  {selected.effects.length ? (
                    <ul className="pfb-list">
                      {selected.effects.map((e, i) => (
                        <li key={i}><span className="pfb-chip effect">{e.kind}</span> {e.target}{e.shelfLife && e.shelfLife !== '—' ? ` · 效期 ${e.shelfLife}` : ''}</li>
                      ))}
                    </ul>
                  ) : '（无）'}
                </dd>
              </dl>
              <p className="pfb-derive-hint">
                此操作的 demands(设备/物料目标态)将在批次层触发引擎<strong>自动派生</strong> CIP/SIP/配液/房间放行 等辅助 —— 不在此手编。
              </p>
            </div>
          ) : (
            <div className="pfb-empty">点选左侧或甘特上的一道操作查看详情。</div>
          )}

          <div className="pfb-view-label pfb-hooks-label">生成规则(钩子 · 挂主链,不展开)</div>
          <ul className="pfb-hooks">
            {template.hooks.map((h) => (
              <li key={h.id}>
                <span className="pfb-hook-type">{PF_HOOK_LABEL[h.type]}</span>
                <strong>{h.label}</strong>
                {h.note && <span className="pfb-hook-note">{h.note}</span>}
              </li>
            ))}
          </ul>
        </WxbPageSection>
      </div>
    </WxbPageShell>
  );
};

export default ProcessFlowBuilderPage;
