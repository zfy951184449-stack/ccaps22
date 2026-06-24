/**
 * CIP 实体编辑抽屉(viz+edit 重设计核心)。点拓扑图任一节点 → 右侧滑出,三段:
 *   (A) 改动后果解读卡:讲「这么一改引擎会怎样」(非现状),最强 GMP 可解释点。
 *   (B) 设备身份(平台同步):折叠、灰底、只读 —— code/name/type/department/capacity 来自平台
 *       resources/resource_nodes,此处只读 + 「去资源节点管理 →」深链。(管线是排产纯概念,无此段)
 *   (C) 排产专属配置:本页唯一编辑入口 —— 管线主/备站、站 emergencyOnly、设备挂载管线。
 *
 * 保存语义(用户拍板):抽屉级逐条直接保存 —— 字段 onChange 即时回写前端 state,图上即时重画;
 * 无页头批量草稿带。footer = 完成(关闭)+ 删除(在用资源引用计数拦截)。
 */
import React from 'react';
import {
  WxbButton,
  WxbCollapse,
  WxbFormField,
  WxbInput,
  WxbPopconfirm,
  WxbSelect,
  WxbSwitch,
  WxbTag,
} from '../wxb-ui';
import type {
  PsCipEquipment,
  PsCipStation,
  PsPipeline,
} from '../../types/psResource';
import { PS_CIP_EQUIP_TYPE_LABEL } from '../../types/psResource';
import type { PsCipFocus } from './PsCipTopology';
import { pipelineEquipment, stationReferences } from './psResourceValidation';

interface Props {
  focus: PsCipFocus;
  isNew?: boolean;
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  equipment: PsCipEquipment[];
  onPatchStation: (id: string, partial: Partial<PsCipStation>) => void;
  onPatchPipeline: (id: string, partial: Partial<PsPipeline>) => void;
  onPatchEquipment: (id: string, partial: Partial<PsCipEquipment>) => void;
  onDelete: (focus: PsCipFocus) => void;
  onSelect: (focus: PsCipFocus | null) => void;
}

const LockRow: React.FC<{ label: string; value: React.ReactNode; note?: string }> = ({ label, value, note }) => (
  <div className="psrm-lock-row">
    <span className="psrm-lock-label">{label}</span>
    <span className="psrm-lock-value">{value}</span>
    {note && <span className="psrm-lock-note">{note}</span>}
  </div>
);

/** 平台只读身份折叠区(站/设备共用)。 */
const IdentitySection: React.FC<{ rows: { label: string; value: React.ReactNode; note?: string }[] }> = ({ rows }) => (
  <WxbCollapse
    className="psrm-identity-collapse"
    items={[
      {
        key: 'identity',
        label: (
          <span className="psrm-identity-head">
            <LockGlyph />
            设备身份 · 平台同步
            <WxbTag color="neutral">只读</WxbTag>
          </span>
        ),
        children: (
          <div className="psrm-identity-body">
            {rows.map((r) => (
              <LockRow key={r.label} label={r.label} value={r.value} note={r.note} />
            ))}
            <a className="psrm-identity-link" href="/equipment-management" onClick={(e) => e.preventDefault()}>
              去资源节点管理修改 →
            </a>
          </div>
        ),
      },
    ]}
  />
);

export const PsCipEditDrawerBody: React.FC<Props> = ({
  focus,
  isNew,
  stations,
  pipelines,
  equipment,
  onPatchStation,
  onPatchPipeline,
  onPatchEquipment,
  onDelete,
  onSelect,
}) => {
  // ── 改动后果解读 ──
  const consequence = (): React.ReactNode => {
    if (focus.kind === 'pipeline') {
      const p = pipelines.find((pp) => pp.id === focus.id);
      if (!p) return null;
      const primary = stations.find((s) => s.id === p.primaryStationId);
      const sharers = primary
        ? pipelines.filter((q) => q.id !== p.id && q.primaryStationId === primary.id)
        : [];
      if (!primary) {
        return <>当前 <strong>{p.code}</strong> 未指定主站 → 引擎无处可排,必须先选主站。</>;
      }
      return (
        <>
          <strong>{p.code}</strong> 的 CIP 排到主站 <strong className="psrm-read-primary">{primary.code}</strong>。
          {sharers.length > 0 ? (
            <>
              {' '}{primary.code} 还服务 <strong>{sharers.map((q) => q.code).join('、')}</strong> → 这几条管线抢同一时间轴,
              排不下就 <strong className="psrm-read-danger">报增援</strong>。
            </>
          ) : (
            <>{' '}目前独占该站时间轴。</>
          )}
        </>
      );
    }
    if (focus.kind === 'station') {
      const s = stations.find((st) => st.id === focus.id);
      if (!s) return null;
      const refs = stationReferences(s.id, pipelines);
      return s.emergencyOnly ? (
        <>
          <strong>{s.code}</strong> 标为应急<strong className="psrm-read-backup">备站</strong> → 引擎默认不往这排,
          仅 {refs.asBackup.map((p) => p.code).join('、') || '相关管线'} 主站满时由人工启用。
        </>
      ) : (
        <>
          <strong>{s.code}</strong>(容量 1)是 <strong>{refs.asPrimary.map((p) => p.code).join('、') || '—'}</strong> 的主站
          {refs.asBackup.length > 0 && <>、{refs.asBackup.map((p) => p.code).join('、')} 的备站</>}。
          {refs.asPrimary.length > 1 && ' 多条管线抢它 → 排不下报增援。'}
        </>
      );
    }
    const eq = equipment.find((e) => e.id === focus.id);
    if (!eq) return null;
    const p = pipelines.find((pp) => pp.id === eq.pipelineId);
    return (
      <>
        <strong>{eq.code}</strong> 的 CIP 走管线 <strong>{p?.code ?? '(未挂)'}</strong> → 主站{' '}
        <strong className="psrm-read-primary">{stations.find((s) => s.id === p?.primaryStationId)?.code ?? '(未指定)'}</strong>。
        改挂管线 = 改它走哪条 CIP 路由。
      </>
    );
  };

  // ── 删除拦截 ──
  const deleteGuard = (): { disabled: boolean; reason?: string; label: string } => {
    if (focus.kind === 'station') {
      const s = stations.find((st) => st.id === focus.id);
      const refs = stationReferences(focus.id, pipelines);
      const used = [...refs.asPrimary, ...refs.asBackup];
      if (used.length > 0) {
        return {
          disabled: true,
          reason: `${s?.code} 是 ${refs.asPrimary.map((p) => p.code).join('、') || '—'} 的主站${
            refs.asBackup.length ? `、${refs.asBackup.map((p) => p.code).join('、')} 的备站` : ''
          },删除后这些管线将无对应站。先改路由再删。`,
          label: '删除此 CIP 站',
        };
      }
      return { disabled: false, label: '删除此 CIP 站' };
    }
    if (focus.kind === 'pipeline') {
      const p = pipelines.find((pp) => pp.id === focus.id);
      const eqs = pipelineEquipment(focus.id, equipment);
      if (eqs.length > 0) {
        return {
          disabled: true,
          reason: `${eqs.map((e) => e.code).join('、')} 挂在 ${p?.code} 上,删除后这些设备将无 CIP 路由。先改挂再删。`,
          label: '删除此管线',
        };
      }
      return { disabled: false, label: '删除此管线' };
    }
    return { disabled: false, label: '删除此设备' };
  };

  const guard = deleteGuard();

  return (
    <div className="psrm-drawer-body">
      <div className="psrm-conseq">
        <RouteGlyph />
        <span>{consequence()}</span>
      </div>

      {focus.kind === 'station' && <StationEditor isNew={isNew} stations={stations} pipelines={pipelines} focusId={focus.id} onPatch={onPatchStation} onSelect={onSelect} />}
      {focus.kind === 'pipeline' && <PipelineEditor stations={stations} pipelines={pipelines} equipment={equipment} focusId={focus.id} onPatch={onPatchPipeline} onSelect={onSelect} />}
      {focus.kind === 'equipment' && <EquipmentEditor isNew={isNew} equipment={equipment} pipelines={pipelines} focusId={focus.id} onPatch={onPatchEquipment} />}

      <div className="psrm-drawer-foot">
        <WxbPopconfirm
          title={guard.disabled ? '无法删除' : '确认删除?'}
          description={guard.disabled ? guard.reason : '删除后该节点及其连线将从图上移除。'}
          okText="删除"
          cancelText="取消"
          disabled={guard.disabled}
          onConfirm={() => onDelete(focus)}
        >
          <button type="button" className={`psrm-del-btn${guard.disabled ? ' disabled' : ''}`} disabled={guard.disabled} title={guard.disabled ? guard.reason : undefined}>
            <TrashGlyph /> {guard.label}
          </button>
        </WxbPopconfirm>
      </div>
    </div>
  );
};

// ── 站点编辑器 ──
const StationEditor: React.FC<{
  isNew?: boolean;
  focusId: string;
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  onPatch: (id: string, partial: Partial<PsCipStation>) => void;
  onSelect: (focus: PsCipFocus | null) => void;
}> = ({ isNew, focusId, stations, pipelines, onPatch, onSelect }) => {
  const s = stations.find((st) => st.id === focusId);
  if (!s) return null;
  const refs = stationReferences(s.id, pipelines);
  return (
    <>
      {!isNew && (
        <IdentitySection
          rows={[
            { label: '编号', value: s.code },
            { label: '名称', value: s.name },
            { label: '部门', value: s.department },
            { label: '容量', value: '1', note: '容量恒为 1,同刻只洗一条管线,不可改(D20)' },
          ]}
        />
      )}
      <Divider />
      {isNew && (
        <>
          <WxbFormField label="编号" required>
            <WxbInput value={s.code} onChange={(e) => onPatch(s.id, { code: e.target.value })} placeholder="如 CIP-S4" />
          </WxbFormField>
          <WxbFormField label="名称" required>
            <WxbInput value={s.name} onChange={(e) => onPatch(s.id, { name: e.target.value })} placeholder="如 CIP 清洗站 4" />
          </WxbFormField>
          <WxbFormField label="部门">
            <WxbInput value={s.department} onChange={(e) => onPatch(s.id, { department: e.target.value })} placeholder="如 下游 / 跨部门" />
          </WxbFormField>
        </>
      )}
      <WxbFormField label="仅作备站(emergencyOnly)" helpText="开启后引擎默认不往这排,仅人工应急时启用(D20)">
        <WxbSwitch
          checked={!!s.emergencyOnly}
          onChange={(checked) => onPatch(s.id, { emergencyOnly: checked })}
          checkedChildren="备站"
          unCheckedChildren="主站可用"
        />
      </WxbFormField>
      <div className="psrm-reverse">
        <div className="psrm-reverse-title">被谁路由</div>
        {refs.asPrimary.length === 0 && refs.asBackup.length === 0 && <div className="psrm-muted">暂无管线引用</div>}
        {refs.asPrimary.map((p) => (
          <button key={`pp-${p.id}`} type="button" className="psrm-reverse-chip" onClick={() => onSelect({ kind: 'pipeline', id: p.id })}>
            {p.code} <span className="psrm-reverse-role">主站</span>
          </button>
        ))}
        {refs.asBackup.map((p) => (
          <button key={`bb-${p.id}`} type="button" className="psrm-reverse-chip" onClick={() => onSelect({ kind: 'pipeline', id: p.id })}>
            {p.code} <span className="psrm-reverse-role backup">备站</span>
          </button>
        ))}
      </div>
    </>
  );
};

// ── 管线编辑器 ──
const PipelineEditor: React.FC<{
  focusId: string;
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  equipment: PsCipEquipment[];
  onPatch: (id: string, partial: Partial<PsPipeline>) => void;
  onSelect: (focus: PsCipFocus | null) => void;
}> = ({ focusId, stations, pipelines, equipment, onPatch, onSelect }) => {
  const p = pipelines.find((pp) => pp.id === focusId);
  if (!p) return null;
  const eqs = pipelineEquipment(p.id, equipment);
  const primaryOptions = stations.map((s) => ({
    value: s.id,
    label: s.emergencyOnly ? `${s.code}(仅备站,不能当主站)` : s.code,
    disabled: !!s.emergencyOnly,
  }));
  const backupOptions = stations
    .filter((s) => s.id !== p.primaryStationId)
    .map((s) => ({ value: s.id, label: s.code }));
  const backupEqPrimary = !!p.backupStationId && p.backupStationId === p.primaryStationId;
  return (
    <>
      <Divider />
      <WxbFormField label="管线编号" required>
        <WxbInput value={p.code} onChange={(e) => onPatch(p.id, { code: e.target.value })} placeholder="如 M4" />
      </WxbFormField>
      <WxbFormField label="管线名称">
        <WxbInput value={p.name} onChange={(e) => onPatch(p.id, { name: e.target.value })} placeholder="如 管线 M4(DSP)" />
      </WxbFormField>
      <WxbFormField label="主站(引擎只往这排)" required error={!p.primaryStationId ? '每条管线必须有主站' : undefined}>
        <WxbSelect
          value={p.primaryStationId || undefined}
          placeholder="选择主站"
          options={primaryOptions}
          onChange={(v) => onPatch(p.id, { primaryStationId: v as string })}
        />
      </WxbFormField>
      <WxbFormField label="备站(人工应急)" error={backupEqPrimary ? '备站不能与主站相同' : undefined} helpText="可空;引擎默认不排,主站满时人工启用">
        <WxbSelect
          value={p.backupStationId || undefined}
          placeholder="无"
          allowClear
          options={backupOptions}
          onChange={(v) => onPatch(p.id, { backupStationId: (v as string) || undefined })}
        />
      </WxbFormField>
      <div className="psrm-reverse">
        <div className="psrm-reverse-title">挂载设备(只读)</div>
        {eqs.length === 0 && <div className="psrm-muted">暂无设备挂载</div>}
        {eqs.map((e) => (
          <button key={e.id} type="button" className="psrm-reverse-chip" onClick={() => onSelect({ kind: 'equipment', id: e.id })}>
            {e.code}
          </button>
        ))}
      </div>
    </>
  );
};

// ── 设备编辑器 ──
const EquipmentEditor: React.FC<{
  isNew?: boolean;
  focusId: string;
  equipment: PsCipEquipment[];
  pipelines: PsPipeline[];
  onPatch: (id: string, partial: Partial<PsCipEquipment>) => void;
}> = ({ isNew, focusId, equipment, pipelines, onPatch }) => {
  const eq = equipment.find((e) => e.id === focusId);
  if (!eq) return null;
  return (
    <>
      {!isNew && (
        <IdentitySection
          rows={[
            { label: '编号', value: eq.code },
            { label: '名称', value: eq.name },
            { label: '类型', value: PS_CIP_EQUIP_TYPE_LABEL[eq.type] },
          ]}
        />
      )}
      <Divider />
      {isNew && (
        <>
          <WxbFormField label="编号" required>
            <WxbInput value={eq.code} onChange={(e) => onPatch(eq.id, { code: e.target.value })} placeholder="如 T1816" />
          </WxbFormField>
          <WxbFormField label="名称" required>
            <WxbInput value={eq.name} onChange={(e) => onPatch(eq.id, { name: e.target.value })} placeholder="如 储罐 T1816" />
          </WxbFormField>
        </>
      )}
      <WxbFormField label="挂载管线(决定走哪条 CIP 路由)" required>
        <WxbSelect
          value={eq.pipelineId || undefined}
          placeholder="选择管线"
          options={pipelines.map((p) => ({ value: p.id, label: p.code }))}
          onChange={(v) => onPatch(eq.id, { pipelineId: v as string })}
        />
      </WxbFormField>
    </>
  );
};

const Divider: React.FC = () => (
  <div className="psrm-drawer-divider">
    <span />
    以下为排产专属配置
    <span />
  </div>
);

const LockGlyph: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
    <rect x="3" y="6" width="8" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M4.5 6 V4.2 a2.5 2.5 0 0 1 5 0 V6" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const TrashGlyph: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2.5 3.5 h9 M5.5 3.5 V2.2 h3 V3.5 M3.5 3.5 l0.6 8 h5.8 l0.6 -8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RouteGlyph: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="psrm-conseq-glyph">
    <circle cx="3.5" cy="3.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="12.5" cy="12.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3.5 5.5 V9 a2 2 0 0 0 2 2 H10.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export default PsCipEditDrawerBody;
