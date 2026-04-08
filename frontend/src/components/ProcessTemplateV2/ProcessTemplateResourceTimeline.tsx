import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tooltip } from 'antd';
import {
    ApartmentOutlined,
    ClusterOutlined,
    DeploymentUnitOutlined,
    LeftOutlined,
    ProjectOutlined,
    ReloadOutlined,
    ScheduleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { ProcessTemplate, StageOperation } from '../ProcessTemplateGantt/types';

interface ProcessTemplateResourceTimelineProps {
    template: ProcessTemplate;
    onBack: () => void;
}

const API_BASE_URL = '/api';
const SUITE_HEADER_HEIGHT = 40;
const EQUIPMENT_HEADER_HEIGHT = 40;
const STICKY_HEADER_OFFSET = SUITE_HEADER_HEIGHT + EQUIPMENT_HEADER_HEIGHT;

// 模拟资源层级数据（符合 HIG 概念设计图）
const MOCK_RESOURCE_HIERARCHY = [
    {
        suiteName: 'Upstream Suite 1',
        equipments: [
            { id: 'eq-1', name: '2000L SUB', type: 'SUB' },
            { id: 'eq-2', name: 'Wave Bioreactor', type: 'Wave' },
        ]
    },
    {
        suiteName: 'Downstream Suite 1',
        equipments: [
            { id: 'eq-3', name: 'Chromatography Skid', type: 'Skid' },
            { id: 'eq-4', name: 'UF/DF Skid', type: 'Skid' }
        ]
    }
];

// 模拟带有背景色的块
const getBlockColor = (index: number) => {
    const colors = [
        'bg-blue-500',
        'bg-purple-500',
        'bg-indigo-600',
        'bg-green-500',
        'bg-orange-500'
    ];
    return colors[index % colors.length];
};

const ProcessTemplateResourceTimeline: React.FC<ProcessTemplateResourceTimelineProps> = ({
    template,
    onBack
}) => {
    const [loading, setLoading] = useState(true);
    const [operations, setOperations] = useState<StageOperation[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const stagesRes = await axios.get(`${API_BASE_URL}/process-templates/${template.id}/stages`);
            const stages = stagesRes.data;

            let allOps: StageOperation[] = [];
            for (const stage of stages) {
                const opsRes = await axios.get(`${API_BASE_URL}/process-templates/stages/${stage.id}/operations`);
                allOps = [...allOps, ...opsRes.data];
            }
            setOperations(allOps);
        } catch (err) {
            console.error('Error loading operations', err);
            setOperations([]);
            setErrorMessage('工序数据加载失败，请重试。');
        } finally {
            setLoading(false);
        }
    }, [template.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // 根据总天数生成 Y 轴时间刻度
    const timeScale = useMemo(() => {
        const days = [];
        for (let d = 1; d <= template.total_days; d++) {
            const hours = [];
            for (let h = 0; h < 24; h++) {
                hours.push(`${h.toString().padStart(2, '0')}:00`);
            }
            days.push({ day: d, hours });
        }
        return days;
    }, [template.total_days]);

    // 获得所有扁平化的设备数组，以便渲染操作网格的列
    const flatEquipments = useMemo(() => {
        return MOCK_RESOURCE_HIERARCHY.flatMap(suite => suite.equipments);
    }, []);

    const indexedOperations = useMemo(
        () => operations.map((operation, index) => ({ operation, index })),
        [operations]
    );

    const summaryCards = useMemo(() => ([
        {
            label: '总周期',
            value: `${template.total_days} 天`,
            icon: <ScheduleOutlined className="text-sky-600" />
        },
        {
            label: '工序数',
            value: `${operations.length}`,
            icon: <ProjectOutlined className="text-emerald-600" />
        },
        {
            label: 'Suite',
            value: `${MOCK_RESOURCE_HIERARCHY.length}`,
            icon: <ClusterOutlined className="text-amber-600" />
        },
        {
            label: '设备数',
            value: `${flatEquipments.length}`,
            icon: <DeploymentUnitOutlined className="text-violet-600" />
        }
    ]), [flatEquipments.length, operations.length, template.total_days]);

    // 绘制单个操作块
    const renderOperationBlock = (op: StageOperation, index: number) => {
        // 假设它绑定到第一个设备进行演示
        const eqIndex = index % flatEquipments.length;
        const startHour = op.recommended_time || 0;
        const duration = op.standard_time || 2;

        return (
            <Tooltip title={op.operation_name} key={op.id}>
                <div
                    className={`absolute left-0 right-0 mx-2 ${getBlockColor(index)} rounded-xl p-2 text-white shadow-lg shadow-blue-500/20 cursor-pointer hover:brightness-110 transition-all z-10`}
                    style={{
                        top: `${startHour * 32}px`,
                        height: `${duration * 32 - 4}px`, // 留出一点边距
                    }}
                >
                    <div className="text-xs font-semibold truncate">{op.operation_name}</div>
                    <div className="text-[10px] opacity-80 mt-0.5 truncate flex justify-between">
                        <span>{`${startHour.toString().padStart(2, '0')}:00-${(startHour + duration).toString().padStart(2, '0')}:00`}</span>
                        <span className="bg-white/20 px-1 rounded">{flatEquipments[eqIndex].type}</span>
                    </div>
                </div>
            </Tooltip>
        );
    };

    return (
        <div className="h-full flex flex-col gap-4 pb-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
            <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-5 py-5 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onBack}
                            className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700"
                        >
                            <LeftOutlined />
                        </button>

                        <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-wide text-white">
                                    {template.template_code}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                                    {template.team_name || '未分配单元'}
                                </span>
                            </div>

                            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                                {template.template_name}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {template.description || '暂无工艺描述。当前时间轴采用模拟资源层级，用于集中展示工艺工序在资源维度上的排布。'}
                            </p>

                            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
                                <button
                                    type="button"
                                    onClick={loadData}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
                                >
                                    <ReloadOutlined />
                                    刷新工序
                                </button>
                                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-slate-500">
                                    <ApartmentOutlined className="text-slate-400" />
                                    资源列按 Suite / 设备分层展示
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 xl:min-w-[440px]">
                        {summaryCards.map(card => (
                            <div
                                key={card.label}
                                className="rounded-2xl border border-white bg-white/85 px-4 py-3 shadow-sm"
                            >
                                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                                    <span>{card.label}</span>
                                    {card.icon}
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-slate-900">
                                    {card.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {errorMessage && (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span>{errorMessage}</span>
                            <button
                                type="button"
                                onClick={loadData}
                                className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
                            >
                                重试
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <section className="flex min-h-[680px] flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                {loading ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                        正在加载工序时间轴...
                    </div>
                ) : operations.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
                        当前模版暂无可展示的工序数据。
                    </div>
                ) : (
                    <div className="flex flex-1 overflow-auto bg-gradient-to-br from-white via-slate-50 to-sky-50/40">
                        {/* Y 轴时间 */}
                        <div className="sticky left-0 z-20 w-20 shrink-0 border-r border-slate-200 bg-white shadow-[4px_0_12px_rgba(15,23,42,0.04)]">
                            <div
                                className="border-b border-slate-200 bg-slate-50"
                                style={{ height: `${STICKY_HEADER_OFFSET}px` }}
                            />

                            {timeScale.map(d => (
                                <div key={`day-${d.day}`}>
                                    <div
                                        className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
                                        style={{ position: 'sticky', top: STICKY_HEADER_OFFSET, zIndex: 10 }}
                                    >
                                        Day {d.day}
                                    </div>
                                    {d.hours.map(hr => (
                                        <div
                                            key={hr}
                                            className="flex h-8 items-center justify-end border-b border-slate-100 px-3 text-[11px] text-slate-400"
                                        >
                                            {hr.split(':')[0]}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* X 轴资源和网格 */}
                        <div className="relative min-w-max flex-1">
                            <div
                                className="sticky top-0 z-20 flex border-b border-slate-200 bg-white"
                                style={{ height: `${SUITE_HEADER_HEIGHT}px` }}
                            >
                                {MOCK_RESOURCE_HIERARCHY.map(suite => (
                                    <div
                                        key={suite.suiteName}
                                        className="flex items-center justify-center border-r border-slate-200 px-3 text-xs font-semibold text-slate-700"
                                        style={{ minWidth: `${suite.equipments.length * 160}px`, flex: 1 }}
                                    >
                                        {suite.suiteName}
                                    </div>
                                ))}
                            </div>

                            <div
                                className="sticky z-20 flex border-b border-slate-200 bg-slate-50/95 shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur"
                                style={{ top: `${SUITE_HEADER_HEIGHT}px`, height: `${EQUIPMENT_HEADER_HEIGHT}px` }}
                            >
                                {flatEquipments.map(eq => (
                                    <div
                                        key={eq.id}
                                        className="flex w-40 items-center justify-center border-r border-slate-200 px-3 text-xs font-medium text-slate-600"
                                        style={{ minWidth: '160px', flex: 1 }}
                                    >
                                        {eq.name}
                                    </div>
                                ))}
                            </div>

                            <div className="relative flex">
                                {flatEquipments.map((eq, eqIdx) => (
                                    <div
                                        key={`col-${eq.id}`}
                                        className="relative flex-1 border-r border-slate-200"
                                        style={{ minWidth: '160px' }}
                                    >
                                        {timeScale.map(d => (
                                            <div key={`col-${eq.id}-day-${d.day}`} className="relative">
                                                <div className="h-9 border-b border-slate-200 bg-slate-50/80" />
                                                <div className="relative">
                                                    {d.hours.map(hr => (
                                                        <div key={hr} className="h-8 border-b border-slate-100" />
                                                    ))}
                                                    {indexedOperations
                                                        .filter(({ operation, index }) => (
                                                            operation.operation_day === d.day &&
                                                            index % flatEquipments.length === eqIdx
                                                        ))
                                                        .map(({ operation, index }) => renderOperationBlock(operation, index))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

export default ProcessTemplateResourceTimeline;
