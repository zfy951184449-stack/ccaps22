import React, { useCallback, useEffect, useState } from 'react';
import {
    WxbBadge,
    WxbEmpty,
    WxbIcon,
    WxbModal,
    WxbSpinner,
    wxbToast,
} from '../wxb-ui';
import { batchPlanApi, type BatchRefreshPreview } from '../../services/api';
import type { BatchPlan } from '../../types';

interface BulkRefreshModalProps {
    visible: boolean;
    batches: BatchPlan[];   // only DRAFT batches
    onClose: () => void;
    onApplied: () => void;
}

interface PreviewItem {
    batch: BatchPlan;
    preview: BatchRefreshPreview | null;
    error: string | null;
}

const BulkRefreshModal: React.FC<BulkRefreshModalProps> = ({
    visible,
    batches,
    onClose,
    onApplied,
}) => {
    const [items, setItems] = useState<PreviewItem[]>([]);
    const [loadingPreviews, setLoadingPreviews] = useState(false);
    const [applying, setApplying] = useState(false);

    useEffect(() => {
        if (!visible || batches.length === 0) return;

        let cancelled = false;
        setLoadingPreviews(true);
        setItems(batches.map((b) => ({ batch: b, preview: null, error: null })));

        Promise.all(
            batches.map((batch) =>
                batchPlanApi
                    .refreshPreview(batch.id)
                    .then((preview) => ({ batch, preview, error: null } satisfies PreviewItem))
                    .catch((err) => ({
                        batch,
                        preview: null,
                        error: err?.response?.data?.error || '对比失败',
                    } satisfies PreviewItem)),
            ),
        ).then((results) => {
            if (!cancelled) {
                setItems(results);
                setLoadingPreviews(false);
            }
        });

        return () => { cancelled = true; };
    }, [visible, batches]);

    // batches that actually have changes and can be refreshed
    const actionable = items.filter(
        (item) =>
            item.preview?.canRefresh &&
            (item.preview.summary.added + item.preview.summary.removed + item.preview.summary.changed) > 0,
    );

    const handleApply = useCallback(async () => {
        if (actionable.length === 0) return;
        setApplying(true);
        const results = await Promise.allSettled(
            actionable.map((item) => {
                const p = item.preview!;
                const scheduleIds = [
                    ...p.added.map((o) => o.template_schedule_id),
                    ...p.removed.map((o) => o.template_schedule_id),
                    ...p.changed.filter((o) => !o.is_locked).map((o) => o.template_schedule_id),
                ];
                return batchPlanApi.refresh(item.batch.id, { scheduleIds });
            }),
        );
        setApplying(false);

        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - succeeded;
        if (failed === 0) {
            wxbToast.success(`已批量刷新 ${succeeded} 个批次`);
        } else {
            wxbToast.warning(`${succeeded} 个成功，${failed} 个失败`);
        }
        onApplied();
    }, [actionable, onApplied]);

    const footer = (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
                className="wxb-btn wxb-btn--ghost"
                onClick={onClose}
                type="button"
            >
                {actionable.length > 0 ? '取消' : '关闭'}
            </button>
            {actionable.length > 0 && (
                <button
                    className="wxb-btn wxb-btn--primary"
                    onClick={handleApply}
                    disabled={applying || loadingPreviews}
                    type="button"
                >
                    {applying ? '应用中...' : `全部应用 (${actionable.length} 个批次)`}
                </button>
            )}
        </div>
    );

    return (
        <WxbModal
            open={visible}
            title="批量刷新批次"
            onCancel={onClose}
            footer={footer}
            width={560}
            centered
        >
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {loadingPreviews && (
                    <WxbSpinner tip={`正在对比 ${batches.length} 个批次的模版差异...`} />
                )}

                {!loadingPreviews && items.length === 0 && (
                    <WxbEmpty description="没有可刷新的批次" />
                )}

                {!loadingPreviews && items.length > 0 && (
                    <>
                        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--wx-fg-2)' }}>
                            已选 {batches.length} 个草稿批次，其中{' '}
                            <strong style={{ color: 'var(--wx-fg-1)' }}>{actionable.length} 个</strong>{' '}
                            有待同步的变更。
                        </div>
                        {items.map((item) => {
                            const s = item.preview?.summary;
                            const changeCount = s ? s.added + s.removed + s.changed : 0;
                            const blocked = item.preview ? !item.preview.canRefresh : false;
                            const hasError = !!item.error;

                            return (
                                <div
                                    key={item.batch.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '8px 0',
                                        borderBottom: '1px solid var(--wx-border)',
                                    }}
                                >
                                    <WxbIcon name="batch-record" size={16} style={{ color: 'var(--wx-fg-3)', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--wx-fg-1)' }}>
                                            {item.batch.batch_code}
                                        </div>
                                        {item.batch.day0_date && (
                                            <div style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>
                                                Day0 {item.batch.day0_date}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ flexShrink: 0 }}>
                                        {hasError && (
                                            <WxbBadge status="error" variant="bar" label={item.error!} />
                                        )}
                                        {!hasError && blocked && (
                                            <WxbBadge status="warning" variant="bar" label={item.preview!.blockReason || '不可刷新'} />
                                        )}
                                        {!hasError && !blocked && changeCount === 0 && (
                                            <WxbBadge status="neutral" variant="bar" label="无变更" />
                                        )}
                                        {!hasError && !blocked && changeCount > 0 && (
                                            <WxbBadge
                                                status="info"
                                                variant="bar"
                                                label={[
                                                    s!.added > 0 && `新增 ${s!.added}`,
                                                    s!.changed > 0 && `变更 ${s!.changed}`,
                                                    s!.removed > 0 && `移除 ${s!.removed}`,
                                                ].filter(Boolean).join(' · ')}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </WxbModal>
    );
};

export default BulkRefreshModal;
