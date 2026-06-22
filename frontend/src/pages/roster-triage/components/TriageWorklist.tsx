import React from 'react';
import dayjs from 'dayjs';
import { WxbButton } from '../../../components/wxb-ui';
import ShiftIcon from '../../personnel-scheduling/components/ShiftIcon';
import { batchColorClass } from '../../personnel-scheduling/shiftVisual';
import { TriageItem, TriageVacancy, vacancySeverity } from '../triageModel';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export type DrawerTab = 'assign' | 'swap' | 'reinforce';

interface Props {
    items: TriageItem[];
    onOpen: (item: TriageItem, tab: DrawerTab) => void;
}

const MoonGlyph = () => (
    <svg className="rt-sev-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);
const LockGlyph = () => (
    <svg className="rt-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
);

const SeverityBadge: React.FC<{ vac: TriageVacancy }> = ({ vac }) => (
    <span className={`rt-sev rt-sev--${vacancySeverity(vac.vacancy)}`}>
        {vac.isNight && <MoonGlyph />}缺&nbsp;{vac.vacancy}
    </span>
);

const Pips: React.FC<{ filled: number; required: number }> = ({ filled, required }) => {
    const cap = Math.min(required, 8);
    return (
        <span className="rt-team">
            <span className="rt-pips" aria-hidden="true">
                {Array.from({ length: cap }, (_, i) => (
                    <span key={i} className={`rt-pip ${i < filled ? '' : 'rt-pip--empty'}`} />
                ))}
            </span>
            <span className="rt-team-tx">同岗 {filled}/{required}</span>
        </span>
    );
};

const dateLabel = (date: string) => {
    const d = dayjs(date);
    return `${d.format('M/D')} 周${WEEKDAYS[d.day()]}`;
};

/** 排班工单流:缺口/超载逐行;行可点可键盘操作(Enter/Space 开抽屉),行内按钮直接动作。 */
const TriageWorklist: React.FC<Props> = ({ items, onOpen }) => {
    const rowKey = (e: React.KeyboardEvent, item: TriageItem, tab: DrawerTab) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item, tab); }
    };

    return (
        <div className="rt-rows">
            {items.map((item) => {
                if (item.kind === 'VACANCY') {
                    const v = item;
                    return (
                        <div
                            key={v.id}
                            className="rt-row"
                            role="button"
                            tabIndex={0}
                            aria-label={`${dateLabel(v.date)} ${v.shiftName || ''} ${v.operationName} 缺${v.vacancy}人 回车指派`}
                            onClick={() => onOpen(v, 'assign')}
                            onKeyDown={(e) => rowKey(e, v, 'assign')}
                        >
                            <SeverityBadge vac={v} />
                            <div className="rt-row-main">
                                <div className="rt-row-l1">
                                    <span className="rt-shift-ico">{v.shiftKind && <ShiftIcon kind={v.shiftKind} />}</span>
                                    <span className="rt-row-tx">{dateLabel(v.date)} · {v.shiftName || '班次'} {v.startTime}–{v.endTime}</span>
                                    {v.isLocked && <LockGlyph />}
                                </div>
                                <div className="rt-row-l2">
                                    {v.batchCode && <span className={`rt-batch-tag ${batchColorClass(v.batchCode)}`}>{v.batchCode}</span>}
                                    <span className="rt-row-tx">{[v.operationName, v.stageName].filter(Boolean).join(' · ')}</span>
                                    <Pips filled={v.filled} required={v.required} />
                                </div>
                            </div>
                            <div className="rt-row-actions">
                                <WxbButton variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); onOpen(v, 'assign'); }}>指派</WxbButton>
                                <WxbButton variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpen(v, 'reinforce'); }}>报增援</WxbButton>
                            </div>
                        </div>
                    );
                }
                const o = item;
                return (
                    <div
                        key={o.id}
                        className="rt-row rt-row--overload"
                        role="button"
                        tabIndex={0}
                        aria-label={`${dateLabel(o.date)} ${o.employeeName} 时段重叠 ${o.overlapCount} 处 回车查看`}
                        onClick={() => onOpen(o, 'swap')}
                        onKeyDown={(e) => rowKey(e, o, 'swap')}
                    >
                        <span className="rt-sev rt-sev--s2">超载</span>
                        <div className="rt-row-main">
                            <div className="rt-row-l1"><span className="rt-row-tx">{dateLabel(o.date)} · {o.employeeName}</span></div>
                            <div className="rt-row-l2"><span className="rt-row-tx">{o.operations.map((op) => op.name).join(' / ')} · 时段重叠 {o.overlapCount} 处</span></div>
                        </div>
                        <div className="rt-row-actions">
                            <WxbButton variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpen(o, 'swap'); }}>调整</WxbButton>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default TriageWorklist;
