import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    WxbDrawer, WxbTabs, WxbButton, WxbTag, WxbAvatar, WxbInput, WxbPopconfirm, wxbToast
} from '../../../components/wxb-ui';
import { RosterCalendarResponse } from '../../personnel-scheduling/types';
import { TriageItem, TriageVacancy, deriveCandidates } from '../triageModel';
import { rosterTriageService, TRIAGE_WRITES_STUBBED } from '../../../services/rosterTriageService';
import { DrawerTab } from './TriageWorklist';

interface Props {
    open: boolean;
    item: TriageItem | null;
    initialTab: DrawerTab;
    data: RosterCalendarResponse | null;
    unitId: number | null;
    onClose: () => void;
    onChanged: () => void;
}

const initials = (name: string) => {
    const n = name || '';
    return n.length >= 3 ? n.slice(0, 1) + n.slice(-1) : n.slice(-2);
};

const ROLE_LABEL: Record<string, string> = {
    FRONTLINE: '一线员工', SHIFT_LEADER: '班长', GROUP_LEADER: '组长', TEAM_LEADER: 'Team 主管', DEPT_MANAGER: '部门经理'
};

const StubNote = () => (
    TRIAGE_WRITES_STUBBED ? (
        <div className="rt-stub-note" style={{ marginBottom: 12 }}>
            <span>写操作后端未接入:此处仅本地记录,刷新后以真实排班为准。</span>
        </div>
    ) : null
);

const VacancyBody: React.FC<{ vac: TriageVacancy; data: RosterCalendarResponse | null; unitId: number | null; initialTab: DrawerTab; onDone: () => void }> = ({ vac, data, unitId, initialTab, onDone }) => {
    const [note, setNote] = useState('');
    const candidates = useMemo(() => deriveCandidates(data, vac), [data, vac]);

    const filledPos = new Set(vac.team.map((m) => m.positionNumber).filter((p): p is number => p != null));
    const gaps: number[] = [];
    for (let p = 1; p <= vac.required; p++) if (!filledPos.has(p)) gaps.push(p);
    const nextGap = gaps[0] ?? vac.filled + 1;

    const workEligible = data
        ? data.employees.filter((e) => !vac.team.some((m) => m.employeeId === e.id) && e.days[vac.date]?.shift?.type === 'WORK').length
        : 0;
    const hidden = Math.max(0, workEligible - candidates.length);

    const doAssign = async (employeeId: number, positionNumber: number) => {
        await rosterTriageService.assign({ operationPlanId: vac.operationPlanId, employeeId, positionNumber });
        wxbToast.info(TRIAGE_WRITES_STUBBED ? '已记录指派,待后端接入' : '指派成功');
        onDone();
    };
    const doReinforce = async () => {
        await rosterTriageService.reinforce({
            unitId, date: vac.date, role: vac.team[0]?.role || 'FRONTLINE',
            requiredPeople: vac.vacancy, neededBy: vac.startTime, note
        });
        wxbToast.info(TRIAGE_WRITES_STUBBED ? '已提交增援,待后端接入' : '已提交增援');
        onDone();
    };

    const assignTab = (
        <div>
            <StubNote />
            <div className="rt-dw-section-label">岗位需求 {vac.required} 人 · 已配 {vac.filled} 人</div>
            <div className="rt-dw-posrow">
                {vac.team.map((m) => (
                    <span key={m.employeeId} className="rt-dw-pos rt-dw-pos--filled" title={m.name}>{initials(m.name)}</span>
                ))}
                {gaps.map((p) => <span key={`g${p}`} className="rt-dw-pos rt-dw-pos--gap">{p}</span>)}
            </div>

            {vac.isLocked && (
                <div className="rt-stub-note" style={{ marginBottom: 12 }}>
                    <span>此班为锁定钉子,指派将覆盖锁定,请确认。</span>
                </div>
            )}

            <div className="rt-dw-section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>推荐人选</span><span style={{ color: 'var(--wx-fg-3)' }}>当班空闲优先</span>
            </div>
            {candidates.length === 0 ? (
                <div className="rt-dw-hidden">本组当日无可用人选,建议改用「报增援」跨组补人。</div>
            ) : (
                candidates.slice(0, 12).map((c) => (
                    <div key={c.employeeId} className="rt-cand">
                        <WxbAvatar initials={initials(c.name)} size={30} />
                        <div className="rt-cand-main">
                            <div className="rt-cand-name">{c.name}<span className="rt-cand-code">{c.code} · {ROLE_LABEL[c.role] || c.role}</span></div>
                            <div className="rt-cand-meta">本班 {c.shiftHours}h · {c.fullyIdle ? '全天空闲' : `已排 ${c.opCount} 项`}</div>
                        </div>
                        <WxbPopconfirm
                            title={vac.isLocked ? '此班为锁定钉子,确认覆盖指派?' : `确认把 ${c.name} 指派到岗位 ${nextGap}?`}
                            okText="确认" cancelText="取消"
                            onConfirm={() => doAssign(c.employeeId, nextGap)}
                        >
                            <WxbButton variant="secondary" size="sm">指派到岗位 {nextGap}</WxbButton>
                        </WxbPopconfirm>
                    </div>
                ))
            )}
            {hidden > 0 && (
                <div className="rt-dw-hidden">
                    <svg className="rt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" /></svg>
                    {hidden} 人因同时段已有排班冲突,已隐藏
                </div>
            )}
        </div>
    );

    const reinforceTab = (
        <div>
            <StubNote />
            <div className="rt-form-row"><span className="rt-form-label">缺口数</span><WxbInput value={String(vac.vacancy)} disabled /></div>
            <div className="rt-form-row"><span className="rt-form-label">需求岗位</span><WxbInput value={ROLE_LABEL[vac.team[0]?.role] || vac.team[0]?.role || '一线员工'} disabled /></div>
            <div className="rt-form-row"><span className="rt-form-label">期望到岗</span><WxbInput value={`${dayjs(vac.date).format('M月D日')} ${vac.startTime}`} disabled /></div>
            <div className="rt-form-row"><span className="rt-form-label">备注</span><WxbInput value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="补充说明(选填)" /></div>
            <WxbButton variant="primary" onClick={doReinforce}>提交增援</WxbButton>
        </div>
    );

    const swapTab = (
        <div>
            <StubNote />
            <div className="rt-dw-section-label">当前在岗 {vac.filled} 人</div>
            {vac.team.map((m) => (
                <div key={m.employeeId} className="rt-cand">
                    <WxbAvatar initials={initials(m.name)} size={30} />
                    <div className="rt-cand-main">
                        <div className="rt-cand-name">{m.name}<span className="rt-cand-code">岗位 {m.positionNumber ?? '—'}</span></div>
                    </div>
                    <WxbButton variant="ghost" size="sm" disabled>移出 / 对调</WxbButton>
                </div>
            ))}
            <div className="rt-dw-hidden" style={{ marginTop: 8 }}>调班(对调岗位)将在后端接口就绪后开放;当前可先用「指派」补位。</div>
        </div>
    );

    return (
        <WxbTabs
            items={[
                { key: 'assign', label: '指派', children: assignTab },
                { key: 'swap', label: '调班', children: swapTab },
                { key: 'reinforce', label: '报增援', children: reinforceTab }
            ]}
            defaultActiveKey={initialTab}
        />
    );
};

/** 处置抽屉:缺口→指派/调班/报增援;超载→展示重叠操作。 */
const ActionDrawer: React.FC<Props> = ({ open, item, initialTab, data, unitId, onClose, onChanged }) => {
    const onDone = () => { onChanged(); onClose(); };

    const title = item
        ? item.kind === 'VACANCY' ? `处置缺口 · ${item.operationName}` : `超载 · ${item.employeeName}`
        : '';

    return (
        <WxbDrawer open={open} onClose={onClose} title={title} width={460} placement="right" key={`${item?.id || 'none'}-${initialTab}`}>
            {item?.kind === 'VACANCY' && (
                <>
                    <div className="rt-dw-head">
                        {item.batchCode && <WxbTag>{item.batchCode}</WxbTag>}
                        <span>{dayjs(item.date).format('M月D日')} · {item.shiftName || '班次'} {item.startTime}–{item.endTime}</span>
                        <WxbTag color="red">缺 {item.vacancy} 人</WxbTag>
                    </div>
                    <VacancyBody vac={item} data={data} unitId={unitId} initialTab={initialTab} onDone={onDone} />
                </>
            )}
            {item?.kind === 'OVERLOAD' && (
                <div>
                    <div className="rt-dw-head">
                        <span>{dayjs(item.date).format('M月D日')} · {item.employeeName} · 时段重叠 {item.overlapCount} 处</span>
                    </div>
                    <div className="rt-dw-section-label">当日操作</div>
                    {item.operations.map((op, i) => (
                        <div key={i} className="rt-cand">
                            <div className="rt-cand-main">
                                <div className="rt-cand-name">{op.name}</div>
                                <div className="rt-cand-meta">{op.startTime}–{op.endTime}</div>
                            </div>
                        </div>
                    ))}
                    <div className="rt-dw-hidden" style={{ marginTop: 8 }}>请将其中一项改派他人,或调整时段以消除重叠。</div>
                </div>
            )}
        </WxbDrawer>
    );
};

export default ActionDrawer;
