/**
 * 排产 · 状态机「转移图」段:可视化编辑画布。
 *
 * 直接在图上改:从一个状态拖到另一个 = 建转移;点边 = 改;点节点 = 改名/从此加转移/删;
 * 点泳道头 = 改属性名。动作/时长/前置等图上画不出来的字段,用贴着元素的浮层填。
 * 不在表格里编辑——转移表降级为可折叠只读对照。状态/属性都是自由词表(可输新值)。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WxbButton,
  WxbDataTable,
  WxbInput,
  WxbInputNumber,
  WxbSelect,
  WxbTag,
  wxbToast,
} from '../wxb-ui';
import ProdStateMachineGraph, { atZh, stZh, type ConnectIntent, type NodeIntent, type AttrIntent } from './ProdStateMachineGraph';
import { prodResourceApi, type SmTemplateRow, type SmTransitionRow } from '../../services/prodResourceApi';

interface Props {
  templates: SmTemplateRow[];
  selectedId: number | null;
  onSelectedIdChange: (id: number | null) => void;
}

const COMMON_ACTIONS = ['CIP', 'RIP', 'SIP', 'USE', 'INSTALL'];
const DURATION_COLS = ['cip_duration_minutes', 'rip_duration_minutes', 'sip_duration_minutes'];
const START_COLS = ['dht_hours'];
const VALIDITY_COLS = ['cht_hours', 'rht_hours', 'sht_hours'];

type TxnForm = {
  attribute: string; from_state: string; action: string; to_state: string;
  duration_minutes: number | null; start_within_hours: number | null; produces_validity_hours: number | null;
  duration_col: string | null; start_within_col: string | null; produces_validity_col: string | null;
  requires_attr: string | null; requires_states: string[];
  sort_order: number; note: string | null;
};
const emptyForm = (): TxnForm => ({
  attribute: '', from_state: '', action: '', to_state: '',
  duration_minutes: null, start_within_hours: null, produces_validity_hours: null,
  duration_col: null, start_within_col: null, produces_validity_col: null,
  requires_attr: null, requires_states: [], sort_order: 0, note: null,
});

type Editor = { mode: 'create' | 'edit'; id: number | null; x: number; y: number };
type NodeMenu = { attribute: string; state: string; x: number; y: number; renaming: boolean; val: string };
type AttrMenu = { attribute: string; x: number; y: number; renaming: boolean; val: string };

const reqText = (t: SmTransitionRow): string => {
  if (!t.requires_json) return '—';
  const parts: string[] = [];
  for (const [attr, states] of Object.entries(t.requires_json)) for (const s of states) parts.push(`${atZh(attr)}=${stZh(s)}`);
  return parts.length ? `需先 ${parts.join('、')}` : '—';
};

/** 可选可输的单值组合框(antd tags 模式,封顶 1 个值)。 */
const ComboSelect: React.FC<{ label?: string; value: string; options: string[]; placeholder?: string; zh?: (v: string) => string; onChange: (v: string) => void; }> = ({ label, value, options, placeholder, zh, onChange }) => (
  <WxbSelect
    label={label} mode="tags" value={value ? [value] : []} placeholder={placeholder ?? '选择或直接输入新值'}
    options={options.map((o) => ({ label: zh && zh(o) !== o ? `${zh(o)}(${o})` : o, value: o }))}
    onChange={(arr: unknown) => { const a = Array.isArray(arr) ? (arr as string[]) : []; onChange(a.length ? String(a[a.length - 1]).trim() : ''); }}
    style={{ width: '100%' }}
  />
);

/** 贴着鼠标的浮层卡(固定定位,夹在视口内)。点背景关闭。 */
const FloatCard: React.FC<{ x: number; y: number; width: number; onClose: () => void; children: React.ReactNode }> = ({ x, y, width, onClose, children }) => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.max(8, Math.min(x, vw - width - 8));
  const top = Math.max(8, Math.min(y, vh - 80));
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'transparent' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'fixed', left, top, width, zIndex: 1201, maxHeight: '80vh', overflow: 'auto', background: 'var(--wx-surface-1, #fff)', border: '1px solid var(--wx-border, #e5e7eb)', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.18)', padding: 14 }}
      >
        {children}
      </div>
    </>
  );
};

const ProdStateMachineView: React.FC<Props> = ({ templates, selectedId, onSelectedIdChange }) => {
  const [transitions, setTransitions] = useState<SmTransitionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState<TxnForm>(emptyForm());
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nodeMenu, setNodeMenu] = useState<NodeMenu | null>(null);
  const [attrMenu, setAttrMenu] = useState<AttrMenu | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [busy, setBusy] = useState(false);
  const highlightId = editor?.mode === 'edit' ? editor.id : null;
  const txnById = useRef(new Map<number, SmTransitionRow>());

  useEffect(() => {
    if (selectedId == null && templates.length) {
      const first = [...templates].sort((a, b) => a.sort_order - b.sort_order)[0];
      if (first) onSelectedIdChange(first.id);
    }
  }, [templates, selectedId, onSelectedIdChange]);

  const loadTransitions = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const rows = await prodResourceApi.listTransitions(id);
      txnById.current = new Map(rows.map((r) => [r.id, r]));
      setTransitions(rows);
    } catch (err) { wxbToast.error(`加载转移规则失败:${(err as Error).message}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (selectedId != null) loadTransitions(selectedId);
    else setTransitions([]);
    setEditor(null); setNodeMenu(null); setAttrMenu(null);
  }, [selectedId, loadTransitions]);

  const template = useMemo(() => templates.find((t) => t.id === selectedId) ?? null, [templates, selectedId]);
  const templateOpts = useMemo(() => [...templates].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)).map((t) => ({ label: `${t.name}(${t.code})${t.is_active ? '' : ' · 停用'}`, value: t.id })), [templates]);

  const attrOptions = useMemo(() => Array.from(new Set(transitions.map((t) => t.attribute))).filter(Boolean), [transitions]);
  const allStates = useMemo(() => Array.from(new Set(transitions.flatMap((t) => [t.from_state, t.to_state]))).filter(Boolean), [transitions]);
  const statesOfAttr = useCallback((attr: string | null) => {
    if (!attr) return allStates;
    const uniq = Array.from(new Set(transitions.filter((t) => t.attribute === attr).flatMap((t) => [t.from_state, t.to_state]))).filter(Boolean);
    return uniq.length ? uniq : allStates;
  }, [transitions, allStates]);

  const danglingReq = useMemo(() => {
    const attrSet = new Set(attrOptions);
    const stateByAttr = new Map<string, Set<string>>();
    for (const t of transitions) {
      if (!stateByAttr.has(t.attribute)) stateByAttr.set(t.attribute, new Set());
      stateByAttr.get(t.attribute)!.add(t.from_state); stateByAttr.get(t.attribute)!.add(t.to_state);
    }
    const out: string[] = [];
    for (const t of transitions) {
      if (!t.requires_json) continue;
      for (const [attr, states] of Object.entries(t.requires_json)) {
        if (!attrSet.has(attr)) { out.push(`${t.action}:前置属性「${atZh(attr)}」不存在`); continue; }
        for (const s of states) if (!stateByAttr.get(attr)?.has(s)) out.push(`${t.action}:前置状态「${atZh(attr)}=${stZh(s)}」不存在`);
      }
    }
    return out;
  }, [transitions, attrOptions]);

  const setF = (patch: Partial<TxnForm>) => setForm((s) => ({ ...s, ...patch }));
  const closeAll = () => { setEditor(null); setNodeMenu(null); setAttrMenu(null); };

  const openCreate = (x: number, y: number, prefill?: Partial<TxnForm>) => {
    setForm({ ...emptyForm(), sort_order: (transitions.length + 1) * 10, ...prefill });
    setMore(false); setNodeMenu(null); setAttrMenu(null);
    setEditor({ mode: 'create', id: null, x, y });
  };
  const openEdit = (id: number, x: number, y: number) => {
    const t = txnById.current.get(id);
    if (!t) return;
    let reqAttr: string | null = null; let reqStates: string[] = [];
    if (t.requires_json) { const f = Object.entries(t.requires_json)[0]; if (f) { reqAttr = f[0]; reqStates = f[1] ?? []; } }
    setForm({
      attribute: t.attribute, from_state: t.from_state, action: t.action, to_state: t.to_state,
      duration_minutes: t.duration_minutes, start_within_hours: t.start_within_hours, produces_validity_hours: t.produces_validity_hours,
      duration_col: t.duration_col, start_within_col: t.start_within_col, produces_validity_col: t.produces_validity_col,
      requires_attr: reqAttr, requires_states: reqStates, sort_order: t.sort_order, note: t.note,
    });
    setMore(false); setNodeMenu(null); setAttrMenu(null);
    setEditor({ mode: 'edit', id, x, y });
  };

  // ── 图上交互意图 ──
  const onConnect = useCallback((i: ConnectIntent) => {
    openCreate(i.clientX, i.clientY, { attribute: i.attribute, from_state: i.from_state, to_state: i.to_state ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitions]);
  const onEditEdge = useCallback((id: number, x: number, y: number) => openEdit(id, x, y), []);
  const onNodeClick = useCallback((i: NodeIntent) => { setEditor(null); setAttrMenu(null); setNodeMenu({ attribute: i.attribute, state: i.state, x: i.clientX, y: i.clientY, renaming: false, val: i.state }); }, []);
  const onAttrClick = useCallback((i: AttrIntent) => { setEditor(null); setNodeMenu(null); setAttrMenu({ attribute: i.attribute, x: i.clientX, y: i.clientY, renaming: false, val: i.attribute }); }, []);

  const save = async () => {
    if (!editor || selectedId == null) return;
    const f = form;
    const miss = ([['属性', f.attribute], ['起始态', f.from_state], ['动作', f.action], ['目标态', f.to_state]] as const).filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);
    if (miss.length) { wxbToast.error(`请填写:${miss.join('、')}`); return; }
    const requires_json = f.requires_attr && f.requires_states.length ? { [f.requires_attr]: f.requires_states } : null;
    const payload: Partial<SmTransitionRow> = {
      attribute: f.attribute.trim(), from_state: f.from_state.trim(), action: f.action.trim().toUpperCase(), to_state: f.to_state.trim(),
      duration_minutes: f.duration_minutes ?? null, start_within_hours: f.start_within_hours ?? null, produces_validity_hours: f.produces_validity_hours ?? null,
      duration_col: f.duration_col ?? null, start_within_col: f.start_within_col ?? null, produces_validity_col: f.produces_validity_col ?? null,
      requires_json, sort_order: f.sort_order ?? 0, note: f.note ?? null,
    };
    setSaving(true);
    try {
      if (editor.mode === 'create') await prodResourceApi.createTransition(selectedId, payload);
      else if (editor.id != null) await prodResourceApi.updateTransition(editor.id, payload);
      wxbToast.success('已保存'); setEditor(null); loadTransitions(selectedId);
    } catch (err: any) { wxbToast.error(err?.response?.data?.error || `保存失败:${err?.message}`); }
    finally { setSaving(false); }
  };

  const removeTxn = async (id: number) => {
    if (selectedId == null) return;
    setSaving(true);
    try { await prodResourceApi.deleteTransition(id); wxbToast.success('已删除'); setEditor(null); loadTransitions(selectedId); }
    catch (err: any) { wxbToast.error(err?.response?.data?.error || `删除失败:${err?.message}`); }
    finally { setSaving(false); }
  };

  // 改状态名:级联本属性内所有引用(from/to)+ 前置引用
  const renameState = async (attr: string, oldName: string, newName: string) => {
    const nn = newName.trim();
    if (!nn || nn === oldName || selectedId == null) { setNodeMenu(null); return; }
    setBusy(true);
    try {
      for (const t of transitions.filter((t) => t.attribute === attr && (t.from_state === oldName || t.to_state === oldName))) {
        const patch: Partial<SmTransitionRow> = {};
        if (t.from_state === oldName) patch.from_state = nn;
        if (t.to_state === oldName) patch.to_state = nn;
        await prodResourceApi.updateTransition(t.id, patch);
      }
      for (const t of transitions.filter((t) => t.requires_json && (t.requires_json as any)[attr]?.includes(oldName))) {
        const rj: Record<string, string[]> = { ...(t.requires_json as any) };
        rj[attr] = rj[attr].map((s) => (s === oldName ? nn : s));
        await prodResourceApi.updateTransition(t.id, { requires_json: rj });
      }
      wxbToast.success('已改名'); setNodeMenu(null); loadTransitions(selectedId);
    } catch (err: any) { wxbToast.error(err?.response?.data?.error || `改名失败:${err?.message}`); }
    finally { setBusy(false); }
  };

  // 删状态:删掉本属性内所有触及它的转移
  const deleteState = async (attr: string, state: string) => {
    if (selectedId == null) return;
    const affected = transitions.filter((t) => t.attribute === attr && (t.from_state === state || t.to_state === state));
    setBusy(true);
    try {
      for (const t of affected) await prodResourceApi.deleteTransition(t.id);
      wxbToast.success(`已删状态及其 ${affected.length} 条转移`); setNodeMenu(null); loadTransitions(selectedId);
    } catch (err: any) { wxbToast.error(err?.response?.data?.error || `删除失败:${err?.message}`); }
    finally { setBusy(false); }
  };

  // 改属性名:本属性所有转移 attribute 改名 + 其它转移 requires 的键改名
  const renameAttr = async (oldName: string, newName: string) => {
    const nn = newName.trim();
    if (!nn || nn === oldName || selectedId == null) { setAttrMenu(null); return; }
    setBusy(true);
    try {
      for (const t of transitions.filter((t) => t.attribute === oldName)) await prodResourceApi.updateTransition(t.id, { attribute: nn });
      for (const t of transitions.filter((t) => t.requires_json && (t.requires_json as any)[oldName])) {
        const rj: Record<string, string[]> = { ...(t.requires_json as any) };
        rj[nn] = rj[oldName]; delete rj[oldName];
        await prodResourceApi.updateTransition(t.id, { requires_json: rj });
      }
      wxbToast.success('已改属性名'); setAttrMenu(null); loadTransitions(selectedId);
    } catch (err: any) { wxbToast.error(err?.response?.data?.error || `改名失败:${err?.message}`); }
    finally { setBusy(false); }
  };

  const colSelect = (label: string, key: 'duration_col' | 'start_within_col' | 'produces_validity_col', cols: string[]) => (
    <WxbSelect label={label} value={form[key] ?? undefined} allowClear placeholder="无(仅用模板默认)" options={cols.map((c) => ({ label: c, value: c }))} onChange={(v: any) => setF({ [key]: v ?? null } as Partial<TxnForm>)} style={{ width: '100%' }} />
  );

  const tableColumns = [
    { title: '属性', dataIndex: 'attribute', width: 90, render: (v: string) => atZh(v) },
    { title: '转移', key: 'tr', width: 210, render: (_: unknown, r: SmTransitionRow) => (<span><code>{stZh(r.from_state)}</code> <WxbTag color="blue">{r.action}</WxbTag> <code>{stZh(r.to_state)}</code></span>) },
    { title: '动作时长', key: 'dur', width: 100, render: (_: unknown, r: SmTransitionRow) => (r.duration_minutes != null ? `${r.duration_minutes} 分` : '—') },
    { title: '起始窗', key: 'sw', width: 90, render: (_: unknown, r: SmTransitionRow) => (r.start_within_hours != null ? `≤${r.start_within_hours} h` : '—') },
    { title: '有效期窗', key: 'pv', width: 90, render: (_: unknown, r: SmTransitionRow) => (r.produces_validity_hours != null ? `${r.produces_validity_hours} h` : '—') },
    { title: '前置', key: 'req', width: 150, render: (_: unknown, r: SmTransitionRow) => <span style={{ color: r.requires_json ? 'var(--wx-purple-700, #7e22ce)' : undefined }}>{reqText(r)}</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--wx-text-secondary, #64748b)' }}>模板</span>
        <WxbSelect value={selectedId ?? undefined} options={templateOpts} placeholder="选状态机模板" onChange={(v: any) => onSelectedIdChange(v == null ? null : Number(v))} style={{ width: 280 }} />
        <WxbButton variant="primary" size="sm" disabled={selectedId == null} onClick={(e: any) => openCreate(e.clientX, e.clientY)}>新增转移</WxbButton>
        {!!transitions.length && <span style={{ fontSize: 12, color: 'var(--wx-text-secondary, #94a3b8)' }}>共 {attrOptions.length} 属性 · {allStates.length} 状态 · {transitions.length} 转移</span>}
        {busy && <span style={{ fontSize: 12, color: 'var(--wx-blue-600, #2563eb)' }}>处理中…</span>}
        <span style={{ flex: 1 }} />
        <WxbButton variant="ghost" size="sm" onClick={() => setShowTable((s) => !s)}>{showTable ? '隐藏明细表' : '明细表'}</WxbButton>
      </div>

      {!!danglingReq.length && (
        <div style={{ fontSize: 12, color: 'var(--wx-amber-700, #b45309)', background: 'var(--wx-amber-50, #fffbeb)', border: '1px solid var(--wx-amber-200, #fde68a)', borderRadius: 8, padding: '6px 10px' }}>
          前置悬空(指向本模板不存在的属性/状态,引擎会忽略):{danglingReq.join(';')}
        </div>
      )}

      <ProdStateMachineGraph
        template={template} transitions={transitions} highlightedId={highlightId}
        editable onEditEdge={onEditEdge} onConnect={onConnect} onNodeClick={onNodeClick} onAttrClick={onAttrClick}
      />

      {showTable && !!transitions.length && (
        <WxbDataTable rowKey="id" loading={loading} columns={tableColumns} dataSource={transitions} pagination={false} />
      )}

      {/* 转移编辑浮层 */}
      {editor && (
        <FloatCard x={editor.x} y={editor.y} width={340} onClose={() => setEditor(null)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>{editor.mode === 'create' ? '新建转移' : '编辑转移'}</strong>
            <span style={{ fontSize: 12, color: 'var(--wx-text-secondary, #94a3b8)' }}>{template?.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ComboSelect label="属性" value={form.attribute} options={attrOptions} zh={atZh} placeholder="如 洁净度 / 灭菌 / 袋" onChange={(v) => setF({ attribute: v })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><ComboSelect label="起始态" value={form.from_state} options={statesOfAttr(form.attribute)} zh={stZh} onChange={(v) => setF({ from_state: v })} /></div>
              <div style={{ flex: 1 }}><ComboSelect label="目标态" value={form.to_state} options={statesOfAttr(form.attribute)} zh={stZh} onChange={(v) => setF({ to_state: v })} /></div>
            </div>
            <ComboSelect label="动作" value={form.action} options={COMMON_ACTIONS} onChange={(v) => setF({ action: v })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><WxbInputNumber label="时长(分)" value={form.duration_minutes ?? undefined} min={0} onChange={(v: any) => setF({ duration_minutes: v ?? null })} style={{ width: '100%' }} /></div>
              <div style={{ flex: 1 }}><WxbInputNumber label="起始窗(h)" value={form.start_within_hours ?? undefined} min={0} onChange={(v: any) => setF({ start_within_hours: v ?? null })} style={{ width: '100%' }} /></div>
              <div style={{ flex: 1 }}><WxbInputNumber label="有效期(h)" value={form.produces_validity_hours ?? undefined} min={0} onChange={(v: any) => setF({ produces_validity_hours: v ?? null })} style={{ width: '100%' }} /></div>
            </div>

            <button type="button" onClick={() => setMore((m) => !m)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--wx-blue-600, #2563eb)', cursor: 'pointer', fontSize: 12, padding: 0 }}>
              {more ? '收起更多 ▲' : '更多:前置 / 排序 / 备注 / 可覆盖列 ▼'}
            </button>
            {more && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--wx-border, #eef1f4)', paddingTop: 10 }}>
                <WxbSelect label="跨属性前置:需先满足的属性" value={form.requires_attr ?? undefined} allowClear placeholder="无前置" options={attrOptions.map((a) => ({ label: `${atZh(a)}(${a})`, value: a }))} onChange={(v: any) => setF({ requires_attr: v ?? null, requires_states: [] })} style={{ width: '100%' }} />
                {form.requires_attr && (
                  <WxbSelect label="的哪些状态" mode="multiple" value={form.requires_states} placeholder="选状态" options={statesOfAttr(form.requires_attr).map((s) => ({ label: `${stZh(s)}(${s})`, value: s }))} onChange={(v: any) => setF({ requires_states: Array.isArray(v) ? v : [] })} style={{ width: '100%' }} />
                )}
                <WxbInputNumber label="排序" value={form.sort_order} min={0} onChange={(v: any) => setF({ sort_order: v ?? 0 })} style={{ width: '100%' }} />
                <WxbInput label="备注" value={form.note ?? ''} onChange={(e) => setF({ note: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--wx-text-secondary, #94a3b8)' }}>高级:把时序值挂到设备/管线同名列,则单台设备可覆盖;留空仅用模板默认。</div>
                {colSelect('时长 可覆盖列', 'duration_col', DURATION_COLS)}
                {colSelect('起始窗 可覆盖列', 'start_within_col', START_COLS)}
                {colSelect('有效期窗 可覆盖列', 'produces_validity_col', VALIDITY_COLS)}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              {editor.mode === 'edit' && editor.id != null
                ? <WxbButton variant="ghost" size="sm" disabled={saving} onClick={() => removeTxn(editor.id!)}>删除</WxbButton>
                : <span />}
              <div style={{ display: 'flex', gap: 8 }}>
                <WxbButton variant="ghost" size="sm" onClick={() => setEditor(null)}>取消</WxbButton>
                <WxbButton variant="primary" size="sm" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</WxbButton>
              </div>
            </div>
          </div>
        </FloatCard>
      )}

      {/* 节点菜单浮层 */}
      {nodeMenu && (
        <FloatCard x={nodeMenu.x} y={nodeMenu.y} width={240} onClose={() => setNodeMenu(null)}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{atZh(nodeMenu.attribute)} · {stZh(nodeMenu.state)} <span style={{ fontWeight: 400, color: 'var(--wx-text-secondary, #94a3b8)' }}>({nodeMenu.state})</span></div>
          {!nodeMenu.renaming ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <WxbButton variant="ghost" size="sm" onClick={() => openCreate(nodeMenu.x, nodeMenu.y, { attribute: nodeMenu.attribute, from_state: nodeMenu.state })}>从此状态新建转移</WxbButton>
              <WxbButton variant="ghost" size="sm" onClick={() => setNodeMenu({ ...nodeMenu, renaming: true })}>改状态名</WxbButton>
              <WxbButton variant="ghost" size="sm" disabled={busy} onClick={() => deleteState(nodeMenu.attribute, nodeMenu.state)}>删除状态(连带其转移)</WxbButton>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <WxbInput label="新状态名" value={nodeMenu.val} autoFocus onChange={(e) => setNodeMenu({ ...nodeMenu, val: e.target.value })} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <WxbButton variant="ghost" size="sm" onClick={() => setNodeMenu({ ...nodeMenu, renaming: false })}>取消</WxbButton>
                <WxbButton variant="primary" size="sm" disabled={busy} onClick={() => renameState(nodeMenu.attribute, nodeMenu.state, nodeMenu.val)}>保存</WxbButton>
              </div>
            </div>
          )}
        </FloatCard>
      )}

      {/* 属性(泳道头)菜单浮层 */}
      {attrMenu && (
        <FloatCard x={attrMenu.x} y={attrMenu.y} width={240} onClose={() => setAttrMenu(null)}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>属性 · {atZh(attrMenu.attribute)} <span style={{ fontWeight: 400, color: 'var(--wx-text-secondary, #94a3b8)' }}>({attrMenu.attribute})</span></div>
          {!attrMenu.renaming ? (
            <WxbButton variant="ghost" size="sm" onClick={() => setAttrMenu({ ...attrMenu, renaming: true })}>改属性名</WxbButton>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <WxbInput label="新属性名" value={attrMenu.val} autoFocus onChange={(e) => setAttrMenu({ ...attrMenu, val: e.target.value })} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <WxbButton variant="ghost" size="sm" onClick={() => setAttrMenu({ ...attrMenu, renaming: false })}>取消</WxbButton>
                <WxbButton variant="primary" size="sm" disabled={busy} onClick={() => renameAttr(attrMenu.attribute, attrMenu.val)}>保存</WxbButton>
              </div>
            </div>
          )}
        </FloatCard>
      )}
    </div>
  );
};

export default ProdStateMachineView;
