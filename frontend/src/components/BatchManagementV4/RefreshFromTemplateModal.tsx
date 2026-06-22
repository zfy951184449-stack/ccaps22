import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    WxbButton,
    WxbCheckbox,
    WxbEmpty,
    WxbIcon,
    WxbModal,
    WxbSpinner,
    WxbTag,
    wxbToast,
} from '../wxb-ui';
import {
    batchPlanApi,
    type BatchRefreshChangedOp,
    type BatchRefreshOp,
    type BatchRefreshPreview,
} from '../../services/api';

interface RefreshFromTemplateModalProps {
    batchId: number | null;
    visible: boolean;
    onClose: () => void;
    onApplied: () => void;
}

const fmtDateTime = (value: string | number | null | undefined): string =>
    value === null || value === undefined || value === '' ? '—' : dayjs(value).format('MM-DD HH:mm');

const fmtFieldValue = (field: string, value: string | number | null): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (field.includes('datetime')) return fmtDateTime(value);
    return String(value);
};

const opLabel = (op: { stage_name: string | null; operation_name: string | null; operation_code: string | null }) => {
    const main = op.operation_name || op.operation_code || '未命名操作';
    return op.stage_name ? `${op.stage_name} · ${main}` : main;
};

const RefreshFromTemplateModal: React.FC<RefreshFromTemplateModalProps> = ({
    batchId,
    visible,
    onClose,
    onApplied,
}) => {
    const [preview, setPreview] = useState<BatchRefreshPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // 可勾选的工序 = 新增 + 移除 + 未锁定的变更(锁定的变更只展示不应用)
    const selectableIds = useMemo<number[]>(() => {
        if (!preview) return [];
        return [
            ...preview.added.map((o) => o.template_schedule_id),
            ...preview.removed.map((o) => o.template_schedule_id),
            ...preview.changed.filter((o) => !o.is_locked).map((o) => o.template_schedule_id),
        ];
    }, [preview]);

    const changeCount = preview
        ? preview.added.length + preview.removed.length + preview.changed.length
        : 0;

    useEffect(() => {
        if (!visible || !batchId) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        setPreview(null);
        batchPlanApi
            .refreshPreview(batchId)
            .then((data) => {
                if (cancelled) return;
                setPreview(data);
                // 默认全选所有可应用的差异
                const next = new Set<number>([
                    ...data.added.map((o) => o.template_schedule_id),
                    ...data.removed.map((o) => o.template_schedule_id),
                    ...data.changed.filter((o) => !o.is_locked).map((o) => o.template_schedule_id),
                ]);
                setSelected(next);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err?.response?.data?.error || '生成刷新预览失败');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [visible, batchId]);

    const toggle = useCallback((id: number, checked: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
    const someSelected = selectableIds.some((id) => selected.has(id));

    const toggleAll = useCallback((checked: boolean) => {
        setSelected(checked ? new Set(selectableIds) : new Set());
    }, [selectableIds]);

    const handleApply = useCallback(async () => {
        if (!batchId || selected.size === 0) return;
        setApplying(true);
        try {
            const result = await batchPlanApi.refresh(batchId, { scheduleIds: Array.from(selected) });
            const parts = [`新增 ${result.added}`, `变更 ${result.changed}`, `移除 ${result.removed}`];
            if (result.skippedLocked > 0) parts.push(`跳过锁定 ${result.skippedLocked}`);
            wxbToast.success(`已从模版刷新：${parts.join(' · ')}`);
            onApplied();
        } catch (err: any) {
            wxbToast.error(err?.response?.data?.error || '从模版刷新失败');
        } finally {
            setApplying(false);
        }
    }, [batchId, selected, onApplied]);

    const blocked = preview ? !preview.canRefresh : false;
    const canApply = !!preview && preview.canRefresh && changeCount > 0;

    const footer = (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <WxbButton variant="ghost" onClick={onClose}>
                {canApply ? '取消' : '关闭'}
            </WxbButton>
            {canApply && (
                <WxbButton variant="primary" onClick={handleApply} disabled={applying || selected.size === 0}>
                    {applying ? '应用中...' : `应用所选 (${selected.size})`}
                </WxbButton>
            )}
        </div>
    );

    return (
        <WxbModal
            open={visible}
            title="从模版刷新批次"
            onCancel={onClose}
            footer={footer}
            width={680}
            centered
        >
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {loading && <WxbSpinner tip="正在对比模版差异..." />}

                {!loading && error && (
                    <WxbEmpty description={error} />
                )}

                {!loading && !error && preview && (
                    <>
                        <div style={{ marginBottom: 12, color: 'var(--wx-fg-2)', fontSize: 13 }}>
                            批次 <strong style={{ color: 'var(--wx-fg-1)' }}>{preview.batch.batch_code}</strong>
                            {preview.batch.template_name ? ` · 模版「${preview.batch.template_name}」` : ''}
                            {preview.batch.day0_date ? ` · Day0 ${preview.batch.day0_date}` : ''}
                        </div>

                        {blocked && (
                            <WxbEmpty
                                image={<WxbIcon name="quarantine" size={40} />}
                                description={preview.blockReason || '该批次当前不可刷新'}
                            />
                        )}

                        {!blocked && changeCount === 0 && (
                            <WxbEmpty
                                image={<WxbIcon name="release" size={40} />}
                                description="该批次已与当前模版一致，无需刷新。"
                            />
                        )}

                        {!blocked && changeCount > 0 && (
                            <>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '8px 0',
                                        borderBottom: '1px solid var(--wx-border)',
                                        marginBottom: 8,
                                    }}
                                >
                                    <WxbCheckbox
                                        checked={allSelected}
                                        indeterminate={!allSelected && someSelected}
                                        onChange={toggleAll}
                                        disabled={selectableIds.length === 0}
                                    >
                                        全选
                                    </WxbCheckbox>
                                    <span style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>
                                        新增 {preview.summary.added} · 变更 {preview.summary.changed} · 移除 {preview.summary.removed} · 未变 {preview.summary.unchanged}
                                        {preview.summary.locked > 0 ? ` · 锁定 ${preview.summary.locked}` : ''}
                                    </span>
                                </div>

                                {/* 新增工序 */}
                                {preview.added.map((op: BatchRefreshOp) => (
                                    <div key={`add-${op.template_schedule_id}`} style={rowStyle}>
                                        <WxbCheckbox
                                            checked={selected.has(op.template_schedule_id)}
                                            onChange={(c) => toggle(op.template_schedule_id, c)}
                                        />
                                        <WxbTag color="green">新增</WxbTag>
                                        <div style={bodyStyle}>
                                            <div style={titleStyle}>{opLabel(op)}</div>
                                            <div style={metaStyle}>
                                                {fmtDateTime(op.planned_start_datetime)} 开始 · {op.required_people ?? '—'} 人
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* 变更工序 */}
                                {preview.changed.map((op: BatchRefreshChangedOp) => (
                                    <div key={`chg-${op.template_schedule_id}`} style={rowStyle}>
                                        <WxbCheckbox
                                            checked={selected.has(op.template_schedule_id)}
                                            disabled={op.is_locked}
                                            onChange={(c) => toggle(op.template_schedule_id, c)}
                                        />
                                        <WxbTag color="amber">变更</WxbTag>
                                        <div style={bodyStyle}>
                                            <div style={titleStyle}>
                                                {opLabel(op)}
                                                {op.is_locked && (
                                                    <WxbTag color="neutral" style={{ marginLeft: 6 }}>锁定 · 跳过</WxbTag>
                                                )}
                                            </div>
                                            <div style={metaStyle}>
                                                {op.fields.map((f) => (
                                                    <span key={f.field} style={{ marginRight: 12 }}>
                                                        {f.label}：
                                                        <span style={{ color: 'var(--wx-fg-3)' }}>{fmtFieldValue(f.field, f.from)}</span>
                                                        {' → '}
                                                        <span style={{ color: 'var(--wx-fg-1)' }}>{fmtFieldValue(f.field, f.to)}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* 移除工序 */}
                                {preview.removed.map((op: BatchRefreshOp) => (
                                    <div key={`del-${op.template_schedule_id}`} style={rowStyle}>
                                        <WxbCheckbox
                                            checked={selected.has(op.template_schedule_id)}
                                            onChange={(c) => toggle(op.template_schedule_id, c)}
                                        />
                                        <WxbTag color="red">移除</WxbTag>
                                        <div style={bodyStyle}>
                                            <div style={titleStyle}>{opLabel(op)}</div>
                                            <div style={metaStyle}>该操作已从模版删除，将一并移除</div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>
        </WxbModal>
    );
};

const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid var(--wx-border)',
};
const bodyStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
const titleStyle: React.CSSProperties = { fontSize: 13, color: 'var(--wx-fg-1)', fontWeight: 500 };
const metaStyle: React.CSSProperties = { fontSize: 12, color: 'var(--wx-fg-2)', marginTop: 2 };

export default RefreshFromTemplateModal;
