/**
 * CurrentOperationCard
 *
 * 运营总览看板 ·「当前正在进行」卡片。
 * 优先展示此刻正在进行的工序（计划时间窗包含当下）；若无，则退回最近即将开始的几条。
 * 阶段甘特只到阶段，本卡负责把「当前操作」具体到工序 + 配人状态。
 */
import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { WxbChartShell, WxbEmpty, WxbOverlay, WxbTag } from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui/Tag/Tag';
import type { CalendarOperation } from '../../services/calendarService';

const IconPlay = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
);

const STATUS_META: Record<CalendarOperation['assignment_status'], { label: string; color: WxbTagColor }> = {
    COMPLETE: { label: '配齐', color: 'green' },
    PARTIAL: { label: '部分', color: 'amber' },
    UNASSIGNED: { label: '缺人', color: 'red' },
};

interface CurrentOperationCardProps {
    operations: CalendarOperation[];
    loading?: boolean;
}

const fmt = (s: string) => dayjs(s).format('M/D HH:mm');

const CurrentOperationCard: React.FC<CurrentOperationCardProps> = ({ operations, loading = false }) => {
    const { items, mode } = useMemo(() => {
        const now = dayjs();
        const parsed = operations
            .filter((op) => op.planned_start_datetime && op.planned_end_datetime)
            .map((op) => ({ op, start: dayjs(op.planned_start_datetime), end: dayjs(op.planned_end_datetime) }));

        const running = parsed
            .filter((p) => !p.start.isAfter(now) && !p.end.isBefore(now))
            .sort((a, b) => a.start.valueOf() - b.start.valueOf());

        if (running.length > 0) {
            return { items: running.slice(0, 5), mode: 'running' as const };
        }

        const upcoming = parsed
            .filter((p) => p.start.isAfter(now))
            .sort((a, b) => a.start.valueOf() - b.start.valueOf());
        return { items: upcoming.slice(0, 5), mode: 'upcoming' as const };
    }, [operations]);

    return (
        <WxbChartShell
            icon={<IconPlay />}
            iconColor="teal"
            title={mode === 'running' ? '当前正在进行' : '即将开始'}
            subtitle={mode === 'running' ? '计划时间窗包含当下的工序' : '当前无进行中工序 · 最近将开始'}
        >
            <WxbOverlay loading={loading}>
                {items.length === 0 ? (
                    !loading && <WxbEmpty description="暂无进行中或即将开始的工序" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items.map(({ op, start, end }) => {
                            const meta = STATUS_META[op.assignment_status] ?? STATUS_META.UNASSIGNED;
                            return (
                                <div
                                    key={op.operation_plan_id}
                                    style={{
                                        border: '1px solid var(--wx-border, #E4EAF1)',
                                        borderRadius: 10,
                                        padding: '10px 12px',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--wx-ink, #0F1B2D)' }}>
                                            {op.batch_code} · {op.stage_name}
                                        </span>
                                        <WxbTag color={meta.color}>{meta.label}</WxbTag>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--wx-fg-2, #2D3D50)', marginBottom: 4 }}>
                                        {op.operation_name}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--wx-fg-4, #8898A8)' }}>
                                        <span>{fmt(start.format('YYYY-MM-DD HH:mm:ss'))}–{end.format('HH:mm')}</span>
                                        <span>需 {op.required_people} · 配 {op.assigned_people}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </WxbOverlay>
        </WxbChartShell>
    );
};

export default CurrentOperationCard;
