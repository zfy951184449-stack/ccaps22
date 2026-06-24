import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import locale from 'antd/es/date-picker/locale/zh_CN';
import {
    WxbAlert,
    WxbButton,
    WxbDatePicker,
    WxbDivider,
    WxbInput,
    WxbInputNumber,
    WxbModal,
    WxbSegmented,
    WxbSelect,
    WxbSwitch,
    WxbTabs,
    WxbTextarea,
    wxbToast,
} from '../../wxb-ui';
import type { GanttBatch } from './types';
import './CreateIndependentOperationModal.css';

// What the right-click landing point hands us. Everything is best-effort: the modal
// selectors are the source of truth, this just pre-fills "where you clicked".
export interface CreateOpPrefill {
    batchId: number | null;
    stageId: number | null;
    stageName: string | null;
    resourceNodeId: number | null;
    resourceName: string | null;
    startTime: Dayjs | null;
}

interface CatalogOperation {
    id: number;
    operation_code: string;
    operation_name: string;
    standard_time: number;
    required_people?: number | null;
}

interface EquipmentNode {
    id: number;
    node_name: string;
    node_class: string;
    equipment_system_type?: string | null;
    equipment_class?: string | null;
    is_active?: boolean;
}

interface QualificationOption {
    id: number;
    qualification_name: string;
}

// One configured qualification requirement for a single position. The new op's
// requirements are stored per-position (mirrors the operation-management editor), so a
// 2-person op can require different qualifications for 位置 1 vs 位置 2.
interface QualRow {
    clientId: number;
    qualificationId: number | null;
    minLevel: number;
    isMandatory: boolean;
}

// Mirror the gantt's equipment label (node name + "系统类型 · 设备类别" suffix).
const equipmentLabel = (n: EquipmentNode): string => {
    const suffix = [n.equipment_system_type, n.equipment_class].filter(Boolean).join(' · ');
    return suffix ? `${n.node_name} (${suffix})` : n.node_name;
};

interface CreateIndependentOperationModalProps {
    visible: boolean;
    batches: GanttBatch[];
    prefill: CreateOpPrefill | null;
    onClose: () => void;
    onCreated: () => void;
    getContainer?: () => HTMLElement;
}

type SourceMode = 'existing' | 'new';

const CreateIndependentOperationModal: React.FC<CreateIndependentOperationModalProps> = ({
    visible,
    batches,
    prefill,
    onClose,
    onCreated,
    getContainer,
}) => {
    const [mode, setMode] = useState<SourceMode>('new');
    const [catalog, setCatalog] = useState<CatalogOperation[]>([]);
    const [equipment, setEquipment] = useState<EquipmentNode[]>([]);
    const [qualOptions, setQualOptions] = useState<QualificationOption[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const qualSeq = useRef(0);

    // Target lane
    const [batchId, setBatchId] = useState<number | null>(null);
    const [stageId, setStageId] = useState<number | null>(null);
    const [resourceNodeId, setResourceNodeId] = useState<number | null>(null);
    const [resourceName, setResourceName] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<Dayjs | null>(null);

    // "existing" source
    const [selectedOperationId, setSelectedOperationId] = useState<number | null>(null);
    // "new" source
    const [opName, setOpName] = useState('');
    const [opDuration, setOpDuration] = useState<number | null>(2);
    const [opPeople, setOpPeople] = useState<number | null>(1);
    const [opDesc, setOpDesc] = useState('');
    // Qualification requirements keyed by position number (1..required_people).
    const [positionQuals, setPositionQuals] = useState<Record<number, QualRow[]>>({});
    const [activePosition, setActivePosition] = useState(1);

    const [errors, setErrors] = useState<{ start?: string; name?: string; op?: string; batch?: string }>({});

    // Pull the lookups the modal needs when it opens: operations catalog (for "选择已有"),
    // equipment nodes (设备 dropdown) and the qualification master (资质 dropdown).
    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        axios.get('/api/operations')
            .then((res) => { if (!cancelled) setCatalog(res.data ?? []); })
            .catch(() => { if (!cancelled) setCatalog([]); });
        // Flat list; keep only real devices (EQUIPMENT_UNIT), not SITE/LINE/ROOM containers.
        axios.get('/api/resource-nodes?tree=false')
            .then((res) => {
                if (cancelled) return;
                const rows: EquipmentNode[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
                setEquipment(rows.filter((n) => n.node_class === 'EQUIPMENT_UNIT' && n.is_active !== false));
            })
            .catch(() => { if (!cancelled) setEquipment([]); });
        axios.get('/api/operation-qualifications/available')
            .then((res) => { if (!cancelled) setQualOptions(res.data ?? []); })
            .catch(() => { if (!cancelled) setQualOptions([]); });
        return () => { cancelled = true; };
    }, [visible]);

    // Re-seed the form from the clicked landing point each time the modal opens.
    useEffect(() => {
        if (!visible) return;
        const seededBatch = prefill?.batchId ?? (batches.length === 1 ? batches[0].id : null);
        setBatchId(seededBatch);
        setStageId(prefill?.stageId ?? null);
        setResourceNodeId(prefill?.resourceNodeId ?? null);
        setResourceName(prefill?.resourceName ?? null);
        setStartTime(prefill?.startTime ?? null);
        setMode('new');
        setSelectedOperationId(null);
        setOpName('');
        setOpDuration(2);
        setOpPeople(1);
        setOpDesc('');
        setPositionQuals({});
        setActivePosition(1);
        setErrors({});
    }, [visible, prefill, batches]);

    const batchOptions = useMemo(
        () => batches.map((b) => ({ value: b.id, label: `${b.code} ${b.name}`.trim() })),
        [batches],
    );

    const stageOptions = useMemo(() => {
        const batch = batches.find((b) => b.id === batchId);
        return (batch?.stages ?? []).map((s) => ({ value: s.id, label: s.name }));
    }, [batches, batchId]);

    const selectedCatalogOp = useMemo(
        () => catalog.find((op) => op.id === selectedOperationId) ?? null,
        [catalog, selectedOperationId],
    );

    // Effective duration / people depend on the chosen source mode.
    const duration = mode === 'existing'
        ? (selectedCatalogOp?.standard_time ?? 0)
        : (opDuration ?? 0);
    const requiredPeople = mode === 'existing'
        ? (selectedCatalogOp?.required_people ?? 1)
        : (opPeople ?? 1);

    const computedEnd = startTime && duration > 0 ? startTime.add(duration, 'hour') : null;

    // Positions = required people of the new op; the qualification editor shows one tab each.
    const positionCount = Math.max(1, Math.round(opPeople || 1));
    useEffect(() => {
        if (activePosition > positionCount) setActivePosition(1);
    }, [positionCount, activePosition]);

    const equipOptions = useMemo(() => {
        const opts = equipment.map((n) => ({ value: n.id, label: equipmentLabel(n) }));
        // Keep the right-clicked node selectable even if it isn't an EQUIPMENT_UNIT.
        if (resourceNodeId && !equipment.some((n) => n.id === resourceNodeId)) {
            opts.unshift({ value: resourceNodeId, label: resourceName || `#${resourceNodeId}` });
        }
        return opts;
    }, [equipment, resourceNodeId, resourceName]);

    const handleEquipChange = (value: number | null) => {
        if (value == null) {
            setResourceNodeId(null);
            setResourceName(null);
            return;
        }
        const node = equipment.find((n) => n.id === value);
        setResourceNodeId(value);
        setResourceName(node ? node.node_name : resourceName);
    };

    const addQualRow = (pos: number) =>
        setPositionQuals((prev) => ({
            ...prev,
            [pos]: [
                ...(prev[pos] ?? []),
                { clientId: (qualSeq.current += 1), qualificationId: null, minLevel: 1, isMandatory: true },
            ],
        }));
    const updateQualRow = (pos: number, clientId: number, patch: Partial<QualRow>) =>
        setPositionQuals((prev) => ({
            ...prev,
            [pos]: (prev[pos] ?? []).map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)),
        }));
    const removeQualRow = (pos: number, clientId: number) =>
        setPositionQuals((prev) => ({
            ...prev,
            [pos]: (prev[pos] ?? []).filter((r) => r.clientId !== clientId),
        }));
    // Copy a position's requirements to the next position (fresh clientIds), mirroring the
    // operation-management editor's "复制到下一位置".
    const copyQualToNext = (pos: number) =>
        setPositionQuals((prev) => ({
            ...prev,
            [pos + 1]: (prev[pos] ?? []).map((r) => ({ ...r, clientId: (qualSeq.current += 1) })),
        }));

    const renderQualPanel = (pos: number) => {
        const rows = positionQuals[pos] ?? [];
        return (
            <div className="create-indep-op__qual-panel">
                {rows.length === 0 ? (
                    <div className="create-indep-op__qual-empty">该岗位暂无资质要求（不限定持证）</div>
                ) : (
                    <div className="create-indep-op__qual-hint">资质 · 最低等级(1–5) · 是否必须</div>
                )}
                {rows.map((row) => (
                    <div className="create-indep-op__qual-row" key={row.clientId}>
                        <WxbSelect
                            className="create-indep-op__qual-name"
                            showSearch
                            placeholder="选择资质"
                            value={row.qualificationId ?? undefined}
                            onChange={(value) => updateQualRow(pos, row.clientId, { qualificationId: (value as number) ?? null })}
                            filterOption={(input, option) =>
                                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={qualOptions.map((q) => ({ value: q.id, label: q.qualification_name }))}
                            getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
                        />
                        <WxbInputNumber
                            style={{ width: 88 }}
                            min={1}
                            max={5}
                            step={1}
                            value={row.minLevel}
                            onChange={(value) => updateQualRow(pos, row.clientId, { minLevel: (value as number) ?? 1 })}
                        />
                        <WxbSwitch
                            checked={row.isMandatory}
                            checkedChildren="必须"
                            unCheckedChildren="可选"
                            onChange={(checked) => updateQualRow(pos, row.clientId, { isMandatory: checked })}
                        />
                        <WxbButton variant="ghost" size="sm" onClick={() => removeQualRow(pos, row.clientId)}>
                            删除
                        </WxbButton>
                    </div>
                ))}
                <div className="create-indep-op__qual-actions">
                    <WxbButton variant="secondary" size="sm" onClick={() => addQualRow(pos)}>
                        + 添加资质要求
                    </WxbButton>
                    {pos < positionCount && (
                        <WxbButton variant="ghost" size="sm" onClick={() => copyQualToNext(pos)}>
                            复制到位置 {pos + 1}
                        </WxbButton>
                    )}
                </div>
            </div>
        );
    };

    const handleBatchChange = (value: number) => {
        setBatchId(value);
        // Stage / equipment belong to a batch+stage; clear them when the batch changes.
        setStageId(null);
        setResourceNodeId(null);
        setResourceName(null);
    };

    const handleStageChange = (value: number) => {
        // Equipment isn't stage-scoped in the data model, so changing the stage leaves the
        // chosen 设备 alone — the dropdown below lets the user pick any device independently.
        setStageId(value);
    };

    const validate = (): boolean => {
        const next: typeof errors = {};
        if (!batchId) next.batch = '请选择批次';
        if (!startTime) next.start = '请选择计划开始时间';
        if (mode === 'existing' && !selectedOperationId) next.op = '请选择一个操作';
        if (mode === 'new' && !opName.trim()) next.name = '请输入操作名称';
        if (mode === 'new' && (!opDuration || opDuration <= 0)) next.op = '工时必须大于 0';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate() || !startTime || !batchId) return;
        setSubmitting(true);
        try {
            let operationId = selectedOperationId;
            let effectiveDuration = duration;
            let effectivePeople = requiredPeople;

            // "新建" mode mints a catalog operation first (reuses the master endpoint),
            // so the batch_operation_plans FK to operations is satisfied.
            if (mode === 'new') {
                const created = await axios.post('/api/operations', {
                    operation_name: opName.trim(),
                    standard_time: opDuration,
                    required_people: opPeople ?? 1,
                    description: opDesc.trim() || undefined,
                });
                operationId = created.data?.id;
                effectiveDuration = opDuration ?? 0;
                effectivePeople = opPeople ?? 1;

                // Persist qualification requirements per position. The OQR table is keyed by
                // position, so each 位置 gets its own list (replace-all). Only positions with
                // at least one selected qualification are written. min_level + is_mandatory
                // only — required_level is a dead column.
                if (operationId) {
                    const positions = Math.max(1, Math.round(effectivePeople || 1));
                    for (let p = 1; p <= positions; p += 1) {
                        const quals = (positionQuals[p] ?? [])
                            .filter((r) => r.qualificationId != null)
                            .map((r) => ({
                                qualification_id: r.qualificationId,
                                min_level: Math.min(5, Math.max(1, Math.round(r.minLevel || 1))),
                                is_mandatory: r.isMandatory ? 1 : 0,
                            }));
                        if (quals.length > 0) {
                            await axios.put(`/api/operation-qualifications/${operationId}/position/${p}`, { qualifications: quals });
                        }
                    }
                }
            }

            if (!operationId) {
                wxbToast.error('未能确定操作，请重试');
                setSubmitting(false);
                return;
            }

            const start = startTime;
            const end = start.add(effectiveDuration, 'hour');

            await axios.post('/api/v5/gantt/operations', {
                batch_plan_id: batchId,
                operation_id: operationId,
                stage_id: stageId ?? undefined,
                resource_node_id: resourceNodeId ?? undefined,
                startDate: start.format('YYYY-MM-DD HH:mm:ss'),
                endDate: end.format('YYYY-MM-DD HH:mm:ss'),
                plannedDuration: effectiveDuration,
                requiredPeople: effectivePeople,
            });

            wxbToast.success('已在落点新增操作');
            onCreated();
            onClose();
        } catch (error: any) {
            wxbToast.error(error?.response?.data?.error || '新增操作失败，请重试');
        } finally {
            setSubmitting(false);
        }
    };

    const footer = (
        <div className="create-indep-op__footer">
            <WxbButton variant="ghost" onClick={onClose}>取消</WxbButton>
            <WxbButton disabled={submitting} onClick={handleSubmit}>
                {submitting ? '新增中...' : '新增操作'}
            </WxbButton>
        </div>
    );

    return (
        <WxbModal
            title="新增操作"
            open={visible}
            onCancel={onClose}
            footer={footer}
            getContainer={getContainer}
            width={620}
            destroyOnClose
        >
            <WxbAlert className="create-indep-op__alert" title="模版外的独立操作">
                这条操作只加到当前批次（不写回工艺模版），落点的阶段 / 设备与时间已按你右键的位置预填，可在下方调整。
            </WxbAlert>

            <WxbDivider className="create-indep-op__divider" label="落点" />

            <div className="create-indep-op__row">
                <WxbSelect
                    label="批次"
                    showSearch
                    optionFilterProp="label"
                    placeholder="选择批次"
                    value={batchId ?? undefined}
                    error={errors.batch}
                    onChange={(value) => handleBatchChange(value as number)}
                    options={batchOptions}
                    getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
                />
                <WxbSelect
                    label="阶段"
                    showSearch
                    optionFilterProp="label"
                    placeholder={batchId ? '选择阶段（可空）' : '请先选批次'}
                    value={stageId ?? undefined}
                    disabled={!batchId}
                    allowClear
                    onChange={(value) => handleStageChange(value as number)}
                    options={stageOptions}
                    getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
                />
            </div>

            <WxbSelect
                label="落点设备"
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder="选择设备（可空 = 不绑定）"
                value={resourceNodeId ?? undefined}
                onChange={(value) => handleEquipChange((value as number) ?? null)}
                options={equipOptions}
                getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
            />

            <WxbDatePicker
                label="计划开始时间"
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                locale={locale}
                style={{ width: '100%' }}
                value={startTime}
                error={errors.start}
                onChange={(date) => { setStartTime(date as Dayjs | null); setErrors((e) => ({ ...e, start: undefined })); }}
                getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
            <div className="create-indep-op__end">
                预计结束：{computedEnd ? computedEnd.format('YYYY-MM-DD HH:mm') : '—'}（工时 {duration || 0} 小时，自动计算）
            </div>

            <WxbDivider className="create-indep-op__divider" label="操作内容" />

            <WxbSegmented
                className="create-indep-op__mode"
                value={mode}
                onChange={(value) => { setMode(value as SourceMode); setErrors((e) => ({ ...e, op: undefined, name: undefined })); }}
                options={[
                    { label: '新建操作', value: 'new' },
                    { label: '选择已有', value: 'existing' },
                ]}
            />

            {mode === 'existing' ? (
                <WxbSelect
                    label="选择操作"
                    showSearch
                    placeholder="搜索并选择已有操作..."
                    value={selectedOperationId ?? undefined}
                    error={errors.op}
                    onChange={(value) => { setSelectedOperationId((value as number) ?? null); setErrors((e) => ({ ...e, op: undefined })); }}
                    filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={catalog.map((op) => ({
                        value: op.id,
                        label: `${op.operation_code} - ${op.operation_name} (工时 ${op.standard_time}h)`,
                    }))}
                    getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
                />
            ) : (
                <>
                    <WxbInput
                        label="操作名称"
                        placeholder="请输入操作名称"
                        maxLength={100}
                        value={opName}
                        error={errors.name}
                        onChange={(e) => { setOpName(e.target.value); setErrors((er) => ({ ...er, name: undefined })); }}
                    />
                    <div className="create-indep-op__row">
                        <WxbInputNumber
                            label="工时（小时）"
                            min={0.1}
                            max={72}
                            step={0.1}
                            style={{ width: '100%' }}
                            value={opDuration ?? undefined}
                            error={errors.op}
                            onChange={(value) => { setOpDuration(value as number); setErrors((e) => ({ ...e, op: undefined })); }}
                        />
                        <WxbInputNumber
                            label="需要人数"
                            min={1}
                            max={50}
                            step={1}
                            style={{ width: '100%' }}
                            value={opPeople ?? undefined}
                            onChange={(value) => setOpPeople(value as number)}
                        />
                    </div>
                    <WxbTextarea
                        label="操作描述（可选）"
                        rows={2}
                        value={opDesc}
                        onChange={(e) => setOpDesc(e.target.value)}
                    />

                    <WxbDivider className="create-indep-op__divider" label="资质要求（按岗位分别配置，可选）" />

                    {positionCount === 1 ? (
                        renderQualPanel(1)
                    ) : (
                        <WxbTabs
                            activeKey={String(activePosition)}
                            onChange={(key) => setActivePosition(Number(key))}
                            items={Array.from({ length: positionCount }, (_, i) => i + 1).map((pos) => ({
                                key: String(pos),
                                label: `位置 ${pos}${(positionQuals[pos]?.length ?? 0) > 0 ? ` (${positionQuals[pos]!.length})` : ''}`,
                                children: renderQualPanel(pos),
                            }))}
                        />
                    )}
                </>
            )}
        </WxbModal>
    );
};

export default CreateIndependentOperationModal;
