import React, { useCallback, useMemo, useState } from 'react';
import {
    WxbEmpty,
    WxbIcon,
    WxbModal,
    WxbSelect,
    wxbToast,
} from '../wxb-ui';
import { batchPlanApi } from '../../services/api';
import type { BatchPlan, BatchTemplateSummary } from '../../types';

interface BulkReplaceTemplateModalProps {
    visible: boolean;
    batches: BatchPlan[];           // only DRAFT batches
    templates: BatchTemplateSummary[];
    onClose: () => void;
    onApplied: () => void;
}

const BulkReplaceTemplateModal: React.FC<BulkReplaceTemplateModalProps> = ({
    visible,
    batches,
    templates,
    onClose,
    onApplied,
}) => {
    const [targetTemplateId, setTargetTemplateId] = useState<number | null>(null);
    const [applying, setApplying] = useState(false);

    const targetTemplate = useMemo(
        () => templates.find((t) => t.id === targetTemplateId) ?? null,
        [templates, targetTemplateId],
    );

    const handleClose = useCallback(() => {
        setTargetTemplateId(null);
        onClose();
    }, [onClose]);

    const handleApply = useCallback(async () => {
        if (!targetTemplateId) return;
        setApplying(true);

        const results = await Promise.allSettled(
            batches.map((batch) =>
                batchPlanApi.update(batch.id, {
                    batch_code: batch.batch_code,
                    batch_name: batch.batch_name,
                    template_id: targetTemplateId,
                    day0_date: batch.day0_date ?? batch.planned_start_date,
                    project_code: batch.project_code ?? null,
                    description: batch.description ?? null,
                    notes: batch.notes ?? null,
                    force_rebuild: true,
                }),
            ),
        );

        setApplying(false);

        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - succeeded;
        if (failed === 0) {
            wxbToast.success(`已批量替换模版：${succeeded} 个批次`);
        } else {
            const firstErr = (results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined)
                ?.reason?.response?.data?.error;
            wxbToast.warning(`${succeeded} 个成功，${failed} 个失败${firstErr ? `：${firstErr}` : ''}`);
        }

        setTargetTemplateId(null);
        onApplied();
    }, [batches, targetTemplateId, onApplied]);

    const footer = (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="wxb-btn wxb-btn--ghost" onClick={handleClose} type="button">
                取消
            </button>
            <button
                className="wxb-btn wxb-btn--primary"
                onClick={handleApply}
                disabled={!targetTemplateId || applying}
                type="button"
            >
                {applying ? '替换中...' : `替换模版 (${batches.length} 个批次)`}
            </button>
        </div>
    );

    return (
        <WxbModal
            open={visible}
            title="批量替换模版"
            onCancel={handleClose}
            footer={footer}
            width={560}
            centered
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 目标模版选择 */}
                <div>
                    <div style={{ fontSize: 13, color: 'var(--wx-fg-2)', marginBottom: 6 }}>
                        选择新模版
                    </div>
                    <WxbSelect
                        placeholder="请选择目标模版"
                        value={targetTemplateId ?? undefined}
                        onChange={(v) => setTargetTemplateId(v as number)}
                        options={templates.map((t) => ({
                            label: t.template_name ?? t.template_code,
                            value: t.id,
                        }))}
                        style={{ width: '100%' }}
                        showSearch
                        filterOption={(input, option) =>
                            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                    />
                </div>

                {/* 提示 */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '10px 12px',
                        background: 'var(--wx-amber-50, #fffbeb)',
                        border: '1px solid var(--wx-amber-200, #fde68a)',
                        borderRadius: 6,
                        fontSize: 13,
                        color: 'var(--wx-fg-2)',
                    }}
                >
                    <WxbIcon name="warning" size={14} style={{ color: 'var(--wx-amber-500, #f59e0b)', flexShrink: 0, marginTop: 1 }} />
                    <span>
                        替换模版会清空所选批次的现有工序计划，并按新模版重新生成。此操作仅适用于草稿批次，不可撤销。
                    </span>
                </div>

                {/* 批次列表 */}
                {batches.length === 0 ? (
                    <WxbEmpty description="没有可操作的草稿批次" />
                ) : (
                    <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                        <div style={{ fontSize: 12, color: 'var(--wx-fg-3)', marginBottom: 6 }}>
                            将替换以下 {batches.length} 个草稿批次
                        </div>
                        {batches.map((batch) => (
                            <div
                                key={batch.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '7px 0',
                                    borderBottom: '1px solid var(--wx-border)',
                                }}
                            >
                                <WxbIcon name="batch-record" size={15} style={{ color: 'var(--wx-fg-3)', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--wx-fg-1)' }}>
                                        {batch.batch_code}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>
                                        {batch.template_name ?? '未知模版'}
                                        {targetTemplate && (
                                            <>
                                                <span style={{ margin: '0 4px', color: 'var(--wx-fg-4)' }}>→</span>
                                                <span style={{ color: 'var(--wx-blue-600)' }}>{targetTemplate.template_name ?? targetTemplate.template_code}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {batch.day0_date && (
                                    <div style={{ fontSize: 12, color: 'var(--wx-fg-3)', flexShrink: 0 }}>
                                        Day0 {batch.day0_date}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </WxbModal>
    );
};

export default BulkReplaceTemplateModal;
