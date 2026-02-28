import React from 'react';
import { Typography } from 'antd';
import CommandRail from '../components/Navigation/CommandRail';
import TaskPoolGantt from '../components/TaskPool/Gantt/TaskPoolGantt';

const { Title, Text } = Typography;

const ScheduleOverviewPage: React.FC = () => {
    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
            <CommandRail width={80} />

            <div className="flex-1 flex flex-col ml-[80px] h-full overflow-hidden">
                {/* Header Area */}
                <div className="flex-none px-8 pt-8 pb-4">
                    <div className="w-full max-w-[1600px] mx-auto">
                        <Title level={2} style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>
                            排班总览
                        </Title>
                        <Text type="secondary" style={{ fontSize: '15px', marginTop: 4, display: 'block' }}>
                            统一视图：批次排班与独立任务的全局概览，识别负荷与冲突
                        </Text>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden px-8 pb-8">
                    <div className="w-full max-w-[1600px] mx-auto h-full">
                        <TaskPoolGantt />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleOverviewPage;
