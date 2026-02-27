/**
 * V3 求解结果展示组件
 * 
 * 包含 6 个 Tab:
 * 1. 求解摘要 - 操作覆盖率、人员利用率、公平性评分
 * 2. 岗位分配 - 按操作展示岗位分配详情
 * 3. 班次计划 - 员工×日期矩阵显示班次
 * 4. 工时统计 - 每位员工工时数据
 * 5. 未分配岗位 - 未满足需求的岗位列表
 * 6. 冲突分析 - 软约束违规详情
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    Tabs,
    Card,
    Table,
    Statistic,
    Row,
    Col,
    Tag,
    Alert,
    Button,
    Space,
    Empty,
    Progress,
    message,
    Spin,
    Tooltip,
} from 'antd';
import {
    CheckCircleOutlined,
    WarningOutlined,
    CloseCircleOutlined,
    UserOutlined,
    ClockCircleOutlined,
    CalendarOutlined,
    ExclamationCircleOutlined,
    ExportOutlined,
    SaveOutlined,
} from '@ant-design/icons';

const { TabPane } = Tabs;

// 类型定义
interface AssignmentData {
    operation_plan_id: number;
    operation_name: string;
    batch_code: string;
    position_number: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    planned_start: string;
    planned_end: string;
}

interface ShiftPlanData {
    employee_id: number;
    employee_name: string;
    plan_date: string;
    shift_name: string;
    is_night_shift: boolean;
    plan_hours: number;
}

interface WorkHoursData {
    employee_id: number;
    employee_name: string;
    total_hours: number;
    night_shifts: number;
    day_shifts: number;
    rest_days: number;
}

interface UnassignedPosition {
    operation_plan_id: number;
    operation_name: string;
    batch_code: string;
    position_number: number;
    required_qualifications: string[];
}

interface Violation {
    type: string;
    description: string;
    employee_name?: string;
    date?: string;
    penalty: number;
}

interface SolveResultSummary {
    total_operations: number;
    assigned_operations: number;
    total_positions: number;
    assigned_positions: number;
    coverage_rate: number;
    utilization_rate: number;
    fairness_score: string;
    night_shift_variance: number;
    hours_variance: number;
    violation_count: number;
    objective_value: number;
    solve_time_seconds: number;
}

interface SolveResultV3Props {
    visible: boolean;
    onClose: () => void;
    runId: number | null;
    onApply?: () => void;
}

const SolveResultV3: React.FC<SolveResultV3Props> = ({
    visible,
    onClose,
    runId,
    onApply,
}) => {
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [activeTab, setActiveTab] = useState('summary');

    // 数据状态
    const [summary, setSummary] = useState<SolveResultSummary | null>(null);
    const [assignments, setAssignments] = useState<AssignmentData[]>([]);
    const [shiftPlans, setShiftPlans] = useState<ShiftPlanData[]>([]);
    const [workHours, setWorkHours] = useState<WorkHoursData[]>([]);
    const [unassigned, setUnassigned] = useState<UnassignedPosition[]>([]);
    const [violations, setViolations] = useState<Violation[]>([]);

    // 加载结果数据
    const loadResult = useCallback(async () => {
        if (!runId) return;

        setLoading(true);
        try {
            const response = await fetch(`/api/v3/scheduling/runs/${runId}/result`);
            const data = await response.json();

            if (data.success) {
                const result = data.data;

                // 设置分配数据
                setAssignments(result.assignments || []);
                setShiftPlans(result.shift_plans || []);

                // 计算摘要
                const totalPositions = assignments.length + (result.unassigned?.length || 0);
                setSummary({
                    total_operations: result.summary?.total_operations || 0,
                    assigned_operations: result.summary?.assigned_operations || 0,
                    total_positions: totalPositions,
                    assigned_positions: assignments.length,
                    coverage_rate: result.summary?.coverage_rate ||
                        (totalPositions > 0 ? (result.assignments?.length / totalPositions) * 100 : 0),
                    utilization_rate: result.summary?.utilization_rate || 85,
                    fairness_score: result.summary?.fairness_score || '良好',
                    night_shift_variance: result.summary?.night_shift_variance || 0,
                    hours_variance: result.summary?.hours_variance || 0,
                    violation_count: result.violations?.length || 0,
                    objective_value: result.objective_value || 0,
                    solve_time_seconds: result.solve_time_seconds || 0,
                });

                // 计算工时统计
                if (result.shift_plans) {
                    const hoursMap = new Map<number, WorkHoursData>();
                    result.shift_plans.forEach((sp: ShiftPlanData) => {
                        if (!hoursMap.has(sp.employee_id)) {
                            hoursMap.set(sp.employee_id, {
                                employee_id: sp.employee_id,
                                employee_name: sp.employee_name,
                                total_hours: 0,
                                night_shifts: 0,
                                day_shifts: 0,
                                rest_days: 0,
                            });
                        }
                        const data = hoursMap.get(sp.employee_id)!;
                        data.total_hours += sp.plan_hours;
                        if (sp.is_night_shift) {
                            data.night_shifts++;
                        } else if (sp.plan_hours > 0) {
                            data.day_shifts++;
                        } else {
                            data.rest_days++;
                        }
                    });
                    setWorkHours(Array.from(hoursMap.values()));
                }

                setUnassigned(result.unassigned || []);
                setViolations(result.violations || []);
            }
        } catch (error) {
            console.error('加载结果失败:', error);
            message.error('加载结果失败');
        } finally {
            setLoading(false);
        }
    }, [runId]);

    useEffect(() => {
        if (visible && runId) {
            loadResult();
        }
    }, [visible, runId, loadResult]);

    // 应用到系统
    const handleApply = async () => {
        if (!runId) return;

        setApplying(true);
        try {
            const response = await fetch(`/api/v3/scheduling/runs/${runId}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await response.json();

            if (data.success) {
                message.success('结果已成功应用到系统');
                onApply?.();
                onClose();
            } else {
                message.error(data.error || '应用失败');
            }
        } catch (error) {
            message.error('应用失败');
        } finally {
            setApplying(false);
        }
    };

    // Tab 1: 求解摘要
    const renderSummary = () => (
        <div>
            <Row gutter={[16, 16]}>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="操作覆盖率"
                            value={summary?.coverage_rate || 0}
                            precision={1}
                            suffix="%"
                            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                        />
                        <Progress
                            percent={summary?.coverage_rate || 0}
                            status={summary?.coverage_rate === 100 ? 'success' : 'active'}
                            showInfo={false}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="人员利用率"
                            value={summary?.utilization_rate || 0}
                            precision={1}
                            suffix="%"
                            prefix={<UserOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="公平性评分"
                            value={summary?.fairness_score || '-'}
                            prefix={
                                summary?.fairness_score === '优' ?
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
                                    <WarningOutlined style={{ color: '#faad14' }} />
                            }
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="软约束违规"
                            value={summary?.violation_count || 0}
                            suffix="项"
                            valueStyle={{ color: summary?.violation_count ? '#ff4d4f' : '#52c41a' }}
                            prefix={<ExclamationCircleOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Card title="求解详情" style={{ marginTop: 16 }}>
                <Row gutter={16}>
                    <Col span={8}>
                        <Statistic title="目标函数值" value={summary?.objective_value || 0} />
                    </Col>
                    <Col span={8}>
                        <Statistic
                            title="求解耗时"
                            value={summary?.solve_time_seconds || 0}
                            suffix="秒"
                            precision={1}
                        />
                    </Col>
                    <Col span={8}>
                        <Statistic
                            title="已分配/总岗位"
                            value={`${summary?.assigned_positions || 0}/${summary?.total_positions || 0}`}
                        />
                    </Col>
                </Row>
            </Card>
        </div>
    );

    // Tab 2: 岗位分配
    const renderAssignments = () => {
        const columns = [
            { title: '操作名称', dataIndex: 'operation_name', key: 'operation_name' },
            { title: '批次', dataIndex: 'batch_code', key: 'batch_code', width: 120 },
            {
                title: '岗位',
                dataIndex: 'position_number',
                key: 'position_number',
                width: 80,
                render: (v: number) => `#${v + 1}`,
            },
            { title: '员工', dataIndex: 'employee_name', key: 'employee_name' },
            { title: '员工编号', dataIndex: 'employee_code', key: 'employee_code' },
            {
                title: '时间',
                key: 'time',
                render: (_: any, r: AssignmentData) => (
                    <span>{r.planned_start?.substring(11, 16)} - {r.planned_end?.substring(11, 16)}</span>
                ),
            },
        ];

        return (
            <Table
                dataSource={assignments}
                columns={columns}
                rowKey={(r) => `${r.operation_plan_id}-${r.position_number}`}
                size="small"
                pagination={{ pageSize: 15 }}
            />
        );
    };

    // Tab 3: 班次计划
    const renderShiftPlans = () => {
        const columns = [
            { title: '员工', dataIndex: 'employee_name', key: 'employee_name' },
            { title: '日期', dataIndex: 'plan_date', key: 'plan_date' },
            {
                title: '班次',
                dataIndex: 'shift_name',
                key: 'shift_name',
                render: (v: string, r: ShiftPlanData) => (
                    <Tag color={r.is_night_shift ? 'purple' : 'blue'}>{v}</Tag>
                ),
            },
            { title: '工时', dataIndex: 'plan_hours', key: 'plan_hours', render: (v: number) => `${v}h` },
        ];

        return (
            <Table
                dataSource={shiftPlans}
                columns={columns}
                rowKey={(r) => `${r.employee_id}-${r.plan_date}`}
                size="small"
                pagination={{ pageSize: 15 }}
            />
        );
    };

    // Tab 4: 工时统计
    const renderWorkHours = () => {
        const columns = [
            { title: '员工', dataIndex: 'employee_name', key: 'employee_name' },
            {
                title: '总工时',
                dataIndex: 'total_hours',
                key: 'total_hours',
                render: (v: number) => `${v}h`,
                sorter: (a: WorkHoursData, b: WorkHoursData) => a.total_hours - b.total_hours,
            },
            {
                title: '夜班次数',
                dataIndex: 'night_shifts',
                key: 'night_shifts',
                render: (v: number) => <Tag color="purple">{v}</Tag>,
            },
            {
                title: '白班次数',
                dataIndex: 'day_shifts',
                key: 'day_shifts',
                render: (v: number) => <Tag color="blue">{v}</Tag>,
            },
            { title: '休息天数', dataIndex: 'rest_days', key: 'rest_days' },
        ];

        return (
            <Table
                dataSource={workHours}
                columns={columns}
                rowKey="employee_id"
                size="small"
                pagination={{ pageSize: 15 }}
            />
        );
    };

    // Tab 5: 未分配岗位
    const renderUnassigned = () => {
        if (unassigned.length === 0) {
            return <Empty description="所有岗位均已分配" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        }

        const columns = [
            { title: '操作名称', dataIndex: 'operation_name', key: 'operation_name' },
            { title: '批次', dataIndex: 'batch_code', key: 'batch_code' },
            {
                title: '岗位',
                dataIndex: 'position_number',
                key: 'position_number',
                render: (v: number) => `#${v + 1}`,
            },
            {
                title: '所需资质',
                dataIndex: 'required_qualifications',
                key: 'required_qualifications',
                render: (quals: string[]) => quals?.map(q => <Tag key={q}>{q}</Tag>),
            },
        ];

        return (
            <>
                <Alert
                    type="warning"
                    message={`共有 ${unassigned.length} 个岗位未分配`}
                    style={{ marginBottom: 16 }}
                />
                <Table
                    dataSource={unassigned}
                    columns={columns}
                    rowKey={(r) => `${r.operation_plan_id}-${r.position_number}`}
                    size="small"
                    pagination={{ pageSize: 10 }}
                />
            </>
        );
    };

    // Tab 6: 冲突分析
    const renderViolations = () => {
        if (violations.length === 0) {
            return <Empty description="无软约束违规" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        }

        const columns = [
            {
                title: '类型',
                dataIndex: 'type',
                key: 'type',
                render: (v: string) => {
                    const typeMap: Record<string, { color: string; text: string }> = {
                        'NON_WORKDAY': { color: 'orange', text: '非工作日上班' },
                        'SUPERVISOR_WORK': { color: 'blue', text: '主管干活' },
                        'NIGHT_REST': { color: 'purple', text: '夜班休息不足' },
                        'CONSECUTIVE': { color: 'red', text: '连续工作' },
                    };
                    const config = typeMap[v] || { color: 'default', text: v };
                    return <Tag color={config.color}>{config.text}</Tag>;
                },
            },
            { title: '描述', dataIndex: 'description', key: 'description' },
            { title: '员工', dataIndex: 'employee_name', key: 'employee_name' },
            { title: '日期', dataIndex: 'date', key: 'date' },
            {
                title: '惩罚分',
                dataIndex: 'penalty',
                key: 'penalty',
                render: (v: number) => <span style={{ color: '#ff4d4f' }}>-{v}</span>,
            },
        ];

        return (
            <>
                <Alert
                    type="info"
                    message={`共有 ${violations.length} 项软约束违规`}
                    description="这些是软约束违规，不影响方案可行性，但会降低优化分数"
                    style={{ marginBottom: 16 }}
                />
                <Table
                    dataSource={violations}
                    columns={columns}
                    rowKey={(_, i) => `violation-${i}`}
                    size="small"
                    pagination={{ pageSize: 10 }}
                />
            </>
        );
    };

    return (
        <Modal
            title="V3 求解结果"
            open={visible}
            onCancel={onClose}
            width={1000}
            footer={
                <Space>
                    <Button onClick={onClose}>关闭</Button>
                    <Button
                        icon={<ExportOutlined />}
                        onClick={() => message.info('导出功能开发中')}
                    >
                        导出 Excel
                    </Button>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleApply}
                        loading={applying}
                    >
                        应用到系统
                    </Button>
                </Space>
            }
        >
            <Spin spinning={loading}>
                <Tabs activeKey={activeTab} onChange={setActiveTab}>
                    <TabPane
                        tab={<span><CheckCircleOutlined />求解摘要</span>}
                        key="summary"
                    >
                        {renderSummary()}
                    </TabPane>
                    <TabPane
                        tab={<span><UserOutlined />岗位分配 ({assignments.length})</span>}
                        key="assignments"
                    >
                        {renderAssignments()}
                    </TabPane>
                    <TabPane
                        tab={<span><CalendarOutlined />班次计划</span>}
                        key="shifts"
                    >
                        {renderShiftPlans()}
                    </TabPane>
                    <TabPane
                        tab={<span><ClockCircleOutlined />工时统计</span>}
                        key="hours"
                    >
                        {renderWorkHours()}
                    </TabPane>
                    <TabPane
                        tab={
                            <span>
                                <WarningOutlined />
                                未分配 ({unassigned.length})
                            </span>
                        }
                        key="unassigned"
                    >
                        {renderUnassigned()}
                    </TabPane>
                    <TabPane
                        tab={
                            <span>
                                <ExclamationCircleOutlined />
                                冲突分析 ({violations.length})
                            </span>
                        }
                        key="violations"
                    >
                        {renderViolations()}
                    </TabPane>
                </Tabs>
            </Spin>
        </Modal>
    );
};

export default SolveResultV3;
