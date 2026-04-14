import React, { useMemo, useState, useCallback } from 'react';
import { Input, Popover, Modal, Radio, Empty, message } from 'antd';
import {
    SearchOutlined, UserOutlined, CheckCircleOutlined,
    ExclamationCircleOutlined, MinusCircleOutlined,
    ClockCircleOutlined, TeamOutlined, WarningOutlined,
    DownOutlined, RightOutlined, SwapOutlined, DeleteOutlined,
    StarFilled, InfoCircleOutlined, AppstoreOutlined, ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import '../SolverV4.css';

// ══════════════════════════════════════
// Types
// ══════════════════════════════════════

interface Position {
    position_number: number;
    status: 'ASSIGNED' | 'UNASSIGNED';
    employee?: { id: number; name: string; code: string };
}

interface Operation {
    operation_plan_id: number;
    batch_code: string;
    operation_name: string;
    planned_start: string;
    planned_end: string;
    required_people?: number;
    share_group_ids?: string;
    share_group_name?: string;
    status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
    positions?: Position[];
}

interface ShiftAssignment {
    employee_id: number;
    employee_name: string;
    employee_code?: string;
    date: string;
    shift_id: number;
    shift_name: string;
    start_time?: string;
    end_time?: string;
    nominal_hours?: number;
    plan_type?: string;
    is_night_shift?: boolean;
}

interface ShiftOption {
    shift_id: number;
    shift_name: string;
    shift_code?: string;
    nominal_hours: number;
    start_time?: string;
    end_time?: string;
    is_night_shift?: boolean;
}

type CandidateTier = 'RECOMMENDED' | 'NEEDS_SHIFT' | 'RESTING';

interface Candidate {
    employee_id: number;
    employee_name: string;
    employee_code?: string;
    shift_name: string;
    shift_id: number;
    start_time?: string;
    end_time?: string;
    nominal_hours?: number;
    plan_type?: string;
    tier: CandidateTier;
}

interface AssignmentsViewProps {
    operations: Operation[];
    shiftAssignments: ShiftAssignment[];
    shiftOptions: ShiftOption[];
    onAssign: (opId: number, posNum: number, empId: number) => void;
    onUnassign: (opId: number, posNum: number) => void;
    onAssignWithShiftChange: (
        opId: number, posNum: number, empId: number,
        newShiftId: number, date: string
    ) => void;
}

// ══════════════════════════════════════
// Helpers
// ══════════════════════════════════════

const STATUS_ORDER: Record<string, number> = { UNASSIGNED: 0, PARTIAL: 1, COMPLETE: 2 };
const TIER_ORDER: Record<CandidateTier, number> = { RECOMMENDED: 0, NEEDS_SHIFT: 1, RESTING: 2 };

const formatDateRange = (start: string, end: string): string => {
    const s = dayjs(start);
    const e = dayjs(end);
    if (s.format('MM/DD') === e.format('MM/DD')) {
        return `${s.format('MM/DD')} ${s.format('HH:mm')}-${e.format('HH:mm')}`;
    }
    return `${s.format('MM/DD HH:mm')} - ${e.format('MM/DD HH:mm')}`;
};

function parseTimeToMinutes(t: string | undefined): number {
    if (!t) return -1;
    const parts = t.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
}

function isShiftCoveringOp(
    shift: { start_time?: string; end_time?: string; nominal_hours?: number; plan_type?: string },
    op: Operation
): boolean {
    if (!shift.start_time || !shift.end_time) return false;
    if (shift.plan_type === 'REST' || (shift.nominal_hours || 0) <= 0.01) return false;

    const opS = dayjs(op.planned_start);
    const opE = dayjs(op.planned_end);
    const opStartMin = opS.hour() * 60 + opS.minute();
    const opEndMin = opE.hour() * 60 + opE.minute();

    const shiftStartMin = parseTimeToMinutes(shift.start_time);
    const shiftEndMin = parseTimeToMinutes(shift.end_time);
    if (shiftStartMin < 0 || shiftEndMin < 0) return false;

    // Overnight shift (e.g. 22:00–06:00)
    if (shiftEndMin <= shiftStartMin) {
        if (opEndMin <= opStartMin) {
            // Both overnight — op must fit inside shift window
            return opStartMin >= shiftStartMin && opEndMin <= shiftEndMin;
        }
        // Day op can't be fully covered by a night shift in general
        return false;
    }

    // Day shift
    if (opEndMin <= opStartMin) return false; // overnight op not covered by day shift
    return opStartMin >= shiftStartMin && opEndMin <= shiftEndMin;
}

function findBestCoveringShift(shiftOptions: ShiftOption[], op: Operation): ShiftOption | null {
    return shiftOptions.find(s => {
        if (!s.start_time || !s.end_time || s.nominal_hours <= 0) return false;
        return isShiftCoveringOp(s as any, op);
    }) || null;
}

// ══════════════════════════════════════
// Component
// ══════════════════════════════════════

const AssignmentsView: React.FC<AssignmentsViewProps> = ({
    operations, shiftAssignments, shiftOptions,
    onAssign, onUnassign, onAssignWithShiftChange
}) => {
    const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
    const [searchText, setSearchText] = useState('');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    // Shift-linkage confirmation modal state
    const [shiftConfirm, setShiftConfirm] = useState<{
        opId: number; posNum: number; empId: number; empName: string;
        currentShift: string; suggestedShift: ShiftOption | null; date: string;
    } | null>(null);
    const [shiftAction, setShiftAction] = useState<'change' | 'force'>('change');

    // ── Computed ──

    const selectedOp = useMemo(() =>
        operations.find(op => op.operation_plan_id === selectedOpId) || null,
        [operations, selectedOpId]);

    // Auto-select first problem op on mount
    React.useEffect(() => {
        if (selectedOpId !== null) return; // already selected
        const first = operations.find(op => op.status !== 'COMPLETE') || operations[0];
        if (first) setSelectedOpId(first.operation_plan_id);
    }, [operations]); // eslint-disable-line react-hooks/exhaustive-deps

    const problemOps = useMemo(() =>
        operations.filter(op => op.status !== 'COMPLETE')
            .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
        [operations]);

    // Only COMPLETE ops go into groups
    const groupedData = useMemo(() => {
        const groups: Record<string, { name: string; ops: Operation[] }> = {};
        const independent: Operation[] = [];
        const standalone: Operation[] = [];

        operations.filter(op => op.status === 'COMPLETE').forEach(op => {
            if (op.batch_code === 'STANDALONE') {
                standalone.push(op);
            } else if (op.share_group_ids) {
                const key = op.share_group_ids;
                if (!groups[key]) groups[key] = { name: op.share_group_name || '未命名组', ops: [] };
                groups[key].ops.push(op);
            } else {
                independent.push(op);
            }
        });
        return { groups, independent, standalone };
    }, [operations]);

    // ── Candidate Calculation ──

    const getCandidates = useCallback((op: Operation): Candidate[] => {
        const opDate = op.planned_start?.slice(0, 10);
        if (!opDate) return [];

        const alreadyAssigned = new Set(
            op.positions?.filter(p => p.status === 'ASSIGNED' && p.employee)
                .map(p => p.employee!.id) || []
        );

        const empMap = new Map<number, ShiftAssignment>();
        shiftAssignments.filter(s => s.date === opDate).forEach(s => {
            if (!alreadyAssigned.has(s.employee_id)) empMap.set(s.employee_id, s);
        });

        return Array.from(empMap.values()).map(s => ({
            employee_id: s.employee_id,
            employee_name: s.employee_name,
            employee_code: s.employee_code,
            shift_name: s.shift_name,
            shift_id: s.shift_id,
            start_time: s.start_time,
            end_time: s.end_time,
            nominal_hours: s.nominal_hours,
            plan_type: s.plan_type,
            tier: ((): CandidateTier => {
                if (s.plan_type === 'REST' || (s.nominal_hours || 0) <= 0.01) return 'RESTING';
                if (isShiftCoveringOp(s, op)) return 'RECOMMENDED';
                return 'NEEDS_SHIFT';
            })(),
        })).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    }, [shiftAssignments]);

    // ── Handlers ──

    const handleSelectCandidate = useCallback((op: Operation, posNum: number, candidate: Candidate) => {
        if (candidate.tier === 'RECOMMENDED') {
            onAssign(op.operation_plan_id, posNum, candidate.employee_id);
            message.success(`已将 ${candidate.employee_name} 分配到 ${op.operation_name} 岗位${posNum}`);
        } else {
            // NEEDS_SHIFT or RESTING → show shift confirmation dialog
            const suggestedShift = findBestCoveringShift(shiftOptions, op);
            setShiftConfirm({
                opId: op.operation_plan_id, posNum,
                empId: candidate.employee_id,
                empName: candidate.employee_name,
                currentShift: candidate.tier === 'RESTING'
                    ? '休息'
                    : `${candidate.shift_name} (${candidate.start_time || ''}-${candidate.end_time || ''})`,
                suggestedShift,
                date: op.planned_start.slice(0, 10),
            });
            setShiftAction(suggestedShift ? 'change' : 'force');
        }
    }, [onAssign, shiftOptions]);

    const handleConfirmShiftChange = useCallback(() => {
        if (!shiftConfirm) return;

        if (shiftAction === 'change' && shiftConfirm.suggestedShift) {
            onAssignWithShiftChange(
                shiftConfirm.opId, shiftConfirm.posNum, shiftConfirm.empId,
                shiftConfirm.suggestedShift.shift_id, shiftConfirm.date
            );
            message.success(`已分配 ${shiftConfirm.empName} 并调整班次为 ${shiftConfirm.suggestedShift.shift_name}`);
        } else {
            onAssign(shiftConfirm.opId, shiftConfirm.posNum, shiftConfirm.empId);
            message.warning(`已分配 ${shiftConfirm.empName}，但班次可能无法覆盖操作时间`);
        }
        setShiftConfirm(null);
    }, [shiftConfirm, shiftAction, onAssign, onAssignWithShiftChange]);

    const handleRemove = useCallback((op: Operation, posNum: number) => {
        const pos = op.positions?.find(p => p.position_number === posNum);
        Modal.confirm({
            title: '确认移除',
            content: `确定将 ${pos?.employee?.name || ''} 从 ${op.operation_name} 岗位${posNum} 移除？`,
            okText: '移除',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => {
                onUnassign(op.operation_plan_id, posNum);
                message.info(`已移除 ${pos?.employee?.name || ''} 的分配`);
            },
        });
    }, [onUnassign]);

    const toggleGroup = (key: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    // ── Filter ──

    const filterOps = (ops: Operation[]) => {
        if (!searchText) return ops;
        const q = searchText.toLowerCase();
        return ops.filter(op =>
            op.batch_code.toLowerCase().includes(q) ||
            op.operation_name.toLowerCase().includes(q)
        );
    };

    // ══════════════════════════════════════
    // Render: Candidate Popover
    // ══════════════════════════════════════

    const renderCandidateSelector = (op: Operation, posNum: number) => {
        const candidates = getCandidates(op);
        const recommended = candidates.filter(c => c.tier === 'RECOMMENDED');
        const needsShift = candidates.filter(c => c.tier === 'NEEDS_SHIFT');
        const resting = candidates.filter(c => c.tier === 'RESTING');

        if (candidates.length === 0) {
            return <div className="asgn-cand-empty">当天无可用候选人</div>;
        }

        return (
            <div className="asgn-cand-list">
                {recommended.length > 0 && (
                    <>
                        <div className="asgn-cand-tier rec">推荐（班次覆盖操作时间）</div>
                        {recommended.map(c => (
                            <div key={c.employee_id} className="asgn-cand-row rec"
                                onClick={() => handleSelectCandidate(op, posNum, c)}>
                                <StarFilled style={{ color: '#f59e0b', fontSize: 11 }} />
                                <span className="asgn-cand-name">{c.employee_name}</span>
                                <span className="asgn-cand-meta">
                                    {c.shift_name} {c.start_time}-{c.end_time}
                                </span>
                            </div>
                        ))}
                    </>
                )}
                {needsShift.length > 0 && (
                    <>
                        <div className="asgn-cand-tier warn">需调整班次</div>
                        {needsShift.map(c => (
                            <div key={c.employee_id} className="asgn-cand-row warn"
                                onClick={() => handleSelectCandidate(op, posNum, c)}>
                                <WarningOutlined style={{ color: '#f59e0b', fontSize: 11 }} />
                                <span className="asgn-cand-name">{c.employee_name}</span>
                                <span className="asgn-cand-meta">
                                    当前: {c.shift_name} {c.start_time}-{c.end_time}
                                </span>
                            </div>
                        ))}
                    </>
                )}
                {resting.length > 0 && (
                    <>
                        <div className="asgn-cand-tier rest">当天休息</div>
                        {resting.map(c => (
                            <div key={c.employee_id} className="asgn-cand-row rest"
                                onClick={() => handleSelectCandidate(op, posNum, c)}>
                                <MinusCircleOutlined style={{ color: '#9ca3af', fontSize: 11 }} />
                                <span className="asgn-cand-name">{c.employee_name}</span>
                                <span className="asgn-cand-meta">REST</span>
                            </div>
                        ))}
                    </>
                )}
                <div className="asgn-cand-footer">
                    <InfoCircleOutlined /> 请确认所选人员具备此操作所需资质
                </div>
            </div>
        );
    };

    // ══════════════════════════════════════
    // Render: Left Panel – Operation List
    // ══════════════════════════════════════

    const renderOpListItem = (op: Operation) => {
        const isSelected = selectedOpId === op.operation_plan_id;
        const assigned = op.positions?.filter(p => p.status === 'ASSIGNED').length || 0;
        const total = op.positions?.length || op.required_people || 1;
        const dotCls = op.status === 'COMPLETE' ? 'success' : op.status === 'PARTIAL' ? 'warning' : 'error';
        const isStandalone = op.batch_code === 'STANDALONE';

        return (
            <div key={op.operation_plan_id}
                className={`asgn-list-item ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedOpId(op.operation_plan_id)}>
                <span className={`asgn-list-dot ${dotCls}`} />
                <span className="asgn-list-name" title={op.operation_name}>{op.operation_name}</span>
                {isStandalone ? (
                    <span className="asgn-standalone-tag">独立</span>
                ) : (
                    <span className="asgn-list-batch">{op.batch_code}</span>
                )}
                <span className={`asgn-list-ratio ${assigned < total ? 'short' : ''}`}>
                    {assigned}/{total}人
                </span>
            </div>
        );
    };

    // ══════════════════════════════════════
    // Render: Right Panel – Detail
    // ══════════════════════════════════════

    const renderDetailPanel = () => {
        if (!selectedOp) {
            return (
                <div className="asgn-detail-empty">
                    <AppstoreOutlined style={{ fontSize: 32, color: '#d1d5db' }} />
                    <span>选择一个操作查看详情</span>
                </div>
            );
        }

        const assigned = selectedOp.positions?.filter(p => p.status === 'ASSIGNED').length || 0;
        const total = selectedOp.positions?.length || selectedOp.required_people || 1;
        const isStandalone = selectedOp.batch_code === 'STANDALONE';
        const statusMap: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
            COMPLETE: { cls: 'success', label: '已覆盖', icon: <CheckCircleOutlined /> },
            PARTIAL: { cls: 'warning', label: '部分覆盖', icon: <ExclamationCircleOutlined /> },
            UNASSIGNED: { cls: 'error', label: '未覆盖', icon: <MinusCircleOutlined /> },
        };
        const st = statusMap[selectedOp.status];

        return (
            <div className="asgn-detail-content">
                {/* Header */}
                <h3 className="asgn-detail-title">{selectedOp.operation_name}</h3>
                {isStandalone ? (
                    <span className="asgn-standalone-tag" style={{ fontSize: 12 }}>
                        <ToolOutlined style={{ marginRight: 4 }} />独立任务
                    </span>
                ) : (
                    <span className="asgn-detail-batch">{selectedOp.batch_code}</span>
                )}

                {/* Meta */}
                <div className="asgn-detail-meta">
                    <span className={`assign-status-pill ${st.cls}`}>{st.icon} {st.label}</span>
                    <span className="asgn-detail-meta-item">
                        <ClockCircleOutlined /> {formatDateRange(selectedOp.planned_start, selectedOp.planned_end)}
                    </span>
                    {selectedOp.share_group_name && (
                        <span className="asgn-detail-group-tag">组: {selectedOp.share_group_name}</span>
                    )}
                </div>

                {/* Positions */}
                <div className="asgn-detail-positions">
                    <div className="asgn-detail-pos-header">
                        <span><TeamOutlined /> 岗位分配</span>
                        <span className="asgn-detail-pos-count">{assigned}/{total} 已分配</span>
                    </div>

                    {selectedOp.positions?.map(pos => (
                        <div key={pos.position_number}
                            className={`asgn-detail-pos-row ${pos.status === 'ASSIGNED' ? 'filled' : 'empty'}`}>
                            <span className={`assign-pos-dot ${pos.status === 'ASSIGNED' ? 'filled' : 'empty'}`} />
                            <span className="asgn-detail-pos-label">岗位{pos.position_number}</span>

                            {pos.status === 'ASSIGNED' && pos.employee ? (
                                <>
                                    <span className="asgn-detail-pos-emp">
                                        <UserOutlined /> {pos.employee.name}
                                        <span className="asgn-detail-pos-code">({pos.employee.code})</span>
                                    </span>
                                    <div className="asgn-detail-pos-actions">
                                        <Popover content={renderCandidateSelector(selectedOp, pos.position_number)}
                                            trigger="click" placement="bottomRight" destroyTooltipOnHide>
                                            <button className="asgn-act-btn swap"><SwapOutlined /> 更换</button>
                                        </Popover>
                                        <button className="asgn-act-btn remove"
                                            onClick={() => handleRemove(selectedOp, pos.position_number)}>
                                            <DeleteOutlined /> 移除
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <span className="asgn-detail-pos-vacant">空缺</span>
                                    <div className="asgn-detail-pos-actions">
                                        <Popover content={renderCandidateSelector(selectedOp, pos.position_number)}
                                            trigger="click" placement="bottomRight" destroyTooltipOnHide>
                                            <button className="asgn-act-btn assign"><UserOutlined /> 分配 ▾</button>
                                        </Popover>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="asgn-detail-footer">
                    需求 {total}人 &nbsp;|&nbsp; 已分配 {assigned}人 &nbsp;|&nbsp; 空缺 {total - assigned}人
                </div>
            </div>
        );
    };

    // ══════════════════════════════════════
    // Main Render
    // ══════════════════════════════════════

    if (operations.length === 0) {
        return <Empty description="暂无工序数据" style={{ padding: 40 }} />;
    }

    return (
        <div className="asgn-master-detail">
            {/* ── Left: List ── */}
            <div className="asgn-list-panel">
                <div className="asgn-list-top">
                    <Input placeholder="搜索操作或批次..." prefix={<SearchOutlined />}
                        value={searchText} onChange={e => setSearchText(e.target.value)}
                        size="small" allowClear className="asgn-list-search" />
                </div>

                <div className="asgn-list-body">
                    {/* Problem Zone */}
                    {problemOps.length > 0 && (
                        <div className="asgn-list-section">
                            <div className="asgn-list-sec-hdr problem">
                                <WarningOutlined /> 需处理 ({problemOps.length})
                            </div>
                            {filterOps(problemOps).map(renderOpListItem)}
                        </div>
                    )}

                    {/* Grouped */}
                    {Object.entries(groupedData.groups).map(([key, group]) => {
                        const filtered = filterOps(group.ops);
                        if (filtered.length === 0) return null;
                        const collapsed = collapsedGroups.has(key);
                        return (
                            <div key={key} className="asgn-list-section">
                                <div className="asgn-list-sec-hdr" onClick={() => toggleGroup(key)}>
                                    {collapsed ? <RightOutlined /> : <DownOutlined />}
                                    <span className="assign-group-dot success" />
                                    {group.name} ({filtered.length})
                                </div>
                                {!collapsed && filtered.map(renderOpListItem)}
                            </div>
                        );
                    })}

                    {/* Standalone Tasks */}
                    {groupedData.standalone.length > 0 && (() => {
                        const filtered = filterOps(groupedData.standalone);
                        if (filtered.length === 0) return null;
                        const collapsed = collapsedGroups.has('_standalone');
                        return (
                            <div className="asgn-list-section">
                                <div className="asgn-list-sec-hdr standalone" onClick={() => toggleGroup('_standalone')}>
                                    {collapsed ? <RightOutlined /> : <DownOutlined />}
                                    <ToolOutlined style={{ color: '#722ed1', marginLeft: 4 }} />
                                    独立任务 ({filtered.length})
                                </div>
                                {!collapsed && filtered.map(renderOpListItem)}
                            </div>
                        );
                    })()}

                    {/* Independent */}
                    {groupedData.independent.length > 0 && (() => {
                        const filtered = filterOps(groupedData.independent);
                        if (filtered.length === 0) return null;
                        const collapsed = collapsedGroups.has('_ind');
                        return (
                            <div className="asgn-list-section">
                                <div className="asgn-list-sec-hdr" onClick={() => toggleGroup('_ind')}>
                                    {collapsed ? <RightOutlined /> : <DownOutlined />}
                                    独立工序 ({filtered.length})
                                </div>
                                {!collapsed && filtered.map(renderOpListItem)}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* ── Right: Detail ── */}
            <div className="asgn-detail-panel">
                {renderDetailPanel()}
            </div>

            {/* ── Shift Confirmation Modal ── */}
            <Modal
                title={<><WarningOutlined style={{ color: '#f59e0b' }} /> 班次调整确认</>}
                open={!!shiftConfirm}
                onCancel={() => setShiftConfirm(null)}
                onOk={handleConfirmShiftChange}
                okText="确认分配"
                cancelText="取消"
                width={480}
            >
                {shiftConfirm && (
                    <div className="asgn-shift-confirm">
                        <p><strong>{shiftConfirm.empName}</strong> 当天班次：{shiftConfirm.currentShift}</p>
                        <p>操作时间范围：{selectedOp
                            ? formatDateRange(selectedOp.planned_start, selectedOp.planned_end)
                            : ''}</p>
                        <p style={{ color: '#d97706' }}>当前班次无法覆盖此操作的执行时间。</p>

                        <Radio.Group value={shiftAction} onChange={e => setShiftAction(e.target.value)}
                            style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '16px 0' }}>
                            {shiftConfirm.suggestedShift ? (
                                <Radio value="change">
                                    将 {shiftConfirm.empName} 改为{' '}
                                    <strong>{shiftConfirm.suggestedShift.shift_name}</strong>
                                    {' '}({shiftConfirm.suggestedShift.start_time}-{shiftConfirm.suggestedShift.end_time})
                                    <span className="asgn-recommend-tag">推荐</span>
                                </Radio>
                            ) : (
                                <Radio value="change" disabled>无可用覆盖班次</Radio>
                            )}
                            <Radio value="force">
                                仅分配人员，不调整班次
                                <span style={{ color: '#f59e0b', marginLeft: 4 }}>⚠️ 将产生覆盖异常</span>
                            </Radio>
                        </Radio.Group>

                        <div className="asgn-shift-info-box">
                            <InfoCircleOutlined /> 此操作将同时更新排班矩阵中{' '}
                            {shiftConfirm.empName} {shiftConfirm.date} 的班次
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default React.memo(AssignmentsView);
