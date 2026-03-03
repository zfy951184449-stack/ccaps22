import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Typography, Row, Col, Tooltip } from 'antd';
import {
    ProjectOutlined,
    FullscreenOutlined,
    ReloadOutlined,
    LeftOutlined,
    MobileOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { ProcessTemplate, StageOperation } from '../ProcessTemplateGantt/types';

interface ProcessTemplateResourceTimelineProps {
    template: ProcessTemplate;
    onBack: () => void;
}

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
    const containerRef = useRef<HTMLDivElement>(null);

    const API_BASE_URL = 'http://localhost:3001/api';

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // 先获取所有 stages
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
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [template.id]);

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

    // 渲染头部工具栏 (Apple HIG Glassmorphism)
    const renderHeader = () => (
        <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
            <div className="flex items-center space-x-4">
                <button
                    onClick={onBack}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-600"
                >
                    <LeftOutlined />
                </button>
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 m-0 tracking-tight flex items-center gap-2">
                        <ProjectOutlined className="text-blue-500" />
                        Biopharma CMO Process Editor
                    </h2>
                    <div className="text-xs text-gray-500 mt-1">San Francisco Pro Display, Semibold</div>
                </div>
            </div>
            <div className="flex items-center space-x-3">
                <button className="px-4 py-1.5 rounded-full bg-gray-100/80 hover:bg-gray-200 border border-gray-200 text-gray-700 text-sm font-medium transition-all flex items-center gap-2 shadow-sm">
                    <ReloadOutlined className="text-gray-400" /> Remix
                </button>
                <button className="w-8 h-8 rounded-full bg-gray-100/80 hover:bg-gray-200 border border-gray-200 text-gray-600 flex items-center justify-center transition-all shadow-sm">
                    <MobileOutlined />
                </button>
                <button className="w-8 h-8 rounded-full bg-gray-100/80 hover:bg-gray-200 border border-gray-200 text-gray-600 flex items-center justify-center transition-all shadow-sm">
                    <FullscreenOutlined />
                </button>
            </div>
        </div>
    );

    // 绘制单个操作块
    const renderOperationBlock = (op: StageOperation, index: number) => {
        // 假设它绑定到第一个设备进行演示
        const eqIndex = index % flatEquipments.length;
        const startHour = op.recommended_time || 0;
        const duration = op.standard_time || 2;
        const day = op.operation_day || 1;

        // 计算 Y 轴位置（每个小时高度为 32px，标题栏高度需要修正）
        // 一天有 24 小时
        // 还需要考量天数标题占用的空间或者直接平铺
        // 为了简单起见，这里假设网格是一个大 Grid
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
        <div className="h-full flex flex-col pt-2" style={{ minHeight: 'calc(100vh - 120px)' }}>
            <div className="flex-1 bg-white/60 backdrop-blur-2xl border border-gray-100 rounded-3xl overflow-hidden shadow-xl flex flex-col" style={{ minHeight: '800px' }}>
                {renderHeader()}

                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400">Loading timeframe...</div>
                ) : (
                    <div className="flex-1 overflow-auto bg-transparent relative flex" ref={containerRef}>

                        {/* Y轴 时间 */}
                        <div className="w-24 flex-shrink-0 bg-white/50 border-r border-gray-100 z-10 sticky left-0 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                            {/* 占位符对其 X轴 Header */}
                            <div className="h-16 border-b border-gray-100"></div>

                            {timeScale.map((d) => (
                                <div key={`day-${d.day}`}>
                                    <div className="px-3 py-2 text-sm font-semibold text-gray-800 bg-gray-50/50 border-b border-gray-100 sticky top-16 z-20 backdrop-blur-md">
                                        Day {d.day}
                                    </div>
                                    {d.hours.map((hr, idx) => (
                                        <div key={hr} className="h-8 border-b border-gray-100 px-3 text-[11px] text-gray-400 flex items-center justify-end">
                                            {hr.split(':')[0]}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* X轴 资源与主体网格 */}
                        <div className="flex-1 relative min-w-max">
                            {/* 头部：车间 Suite */}
                            <div className="h-8 flex bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-20">
                                {MOCK_RESOURCE_HIERARCHY.map((suite, idx) => (
                                    <div
                                        key={idx}
                                        className="flex-1 flex items-center justify-center text-xs font-semibold text-gray-700 border-r border-gray-100"
                                        style={{ minWidth: `${suite.equipments.length * 160}px` }}
                                    >
                                        {suite.suiteName}
                                    </div>
                                ))}
                            </div>
                            {/* 头部：设备 Equipment */}
                            <div className="h-8 flex bg-white/90 backdrop-blur-xl border-b border-gray-100 sticky top-8 z-20 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                                {flatEquipments.map((eq, idx) => (
                                    <div
                                        key={idx}
                                        className="flex-1 w-40 flex items-center justify-center text-xs font-medium text-gray-600 border-r border-gray-100"
                                        style={{ minWidth: '160px' }}
                                    >
                                        {eq.name}
                                    </div>
                                ))}
                            </div>

                            {/* 网格主体列 */}
                            <div className="flex relative">
                                {flatEquipments.map((eq, eqIdx) => (
                                    <div key={`col-${eq.id}`} className="flex-1 border-r border-gray-100 relative" style={{ minWidth: '160px' }}>
                                        {/* 渲染网格线 */}
                                        {timeScale.map((d) => (
                                            <div key={`col-${eq.id}-day-${d.day}`} className="relative">
                                                {/* Day Title Space */}
                                                <div className="h-[37px] bg-gray-50/30 border-b border-gray-100"></div>
                                                {/* Hours Space */}
                                                <div className="relative">
                                                    {d.hours.map((hr, hIdx) => (
                                                        <div key={hr} className="h-8 border-b border-gray-50/80"></div>
                                                    ))}
                                                    {/* 在这列渲染属于这天的操作块 (根据前面提到的假逻辑) */}
                                                    {operations.filter(op => op.operation_day === d.day && (operations.indexOf(op) % flatEquipments.length === eqIdx)).map(op => renderOperationBlock(op, operations.indexOf(op)))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProcessTemplateResourceTimeline;
