import React, { useState } from 'react';
import { Typography, Button, Space, message, Radio, DatePicker } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { PlusOutlined, UnorderedListOutlined, BarChartOutlined } from '@ant-design/icons';
import CommandRail from '../components/Navigation/CommandRail';
import TaskPoolList from '../components/TaskPool/TaskPoolList';
import TaskFormModal from '../components/TaskPool/TaskFormModal';
import TaskPoolGantt from '../components/TaskPool/Gantt/TaskPoolGantt';
import { StandaloneTask } from '../components/TaskPool/types';

const { Title, Text } = Typography;

const TaskPoolPage: React.FC = () => {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTask, setEditingTask] = useState<StandaloneTask | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');
    const [generateMonth, setGenerateMonth] = useState(dayjs().add(1, 'month'));

    const handleCreate = () => {
        setEditingTask(null);
        setModalVisible(true);
    };

    const handleEdit = (task: StandaloneTask) => {
        setEditingTask(task);
        setModalVisible(true);
    };

    const handleModalSuccess = () => {
        setModalVisible(false);
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
            <CommandRail width={80} />

            <div className="flex-1 flex flex-col ml-[80px] h-full overflow-hidden">
                {/* Header Area */}
                <div className="flex-none px-8 pt-8 pb-4">
                    <div className="flex justify-between items-start mb-6 w-full max-w-7xl mx-auto">
                        <div>
                            <Title level={2} style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>
                                任务池
                            </Title>
                            <Text type="secondary" style={{ fontSize: '15px', marginTop: 4, display: 'block' }}>
                                管理非批次相关的周期性、弹性窗口及临时排班任务
                            </Text>
                        </div>

                        <Space size="middle">
                            <Space.Compact>
                                <DatePicker
                                    picker="month"
                                    value={generateMonth}
                                    onChange={val => val && setGenerateMonth(val)}
                                    allowClear={false}
                                    size="large"
                                    style={{ borderRadius: '8px 0 0 8px' }}
                                />
                                <Button
                                    onClick={async () => {
                                        try {
                                            const res = await axios.post('/api/standalone-tasks/generate-recurring', {
                                                target_month: generateMonth.format('YYYY-MM')
                                            });
                                            message.success(`成功生成 ${res.data.generated_count} 个任务实例`);
                                            setRefreshTrigger(prev => prev + 1);
                                        } catch (e: any) {
                                            message.error('生成失败: ' + e.message);
                                        }
                                    }}
                                    size="large"
                                    style={{ borderRadius: '0 8px 8px 0' }}
                                >
                                    周期生成
                                </Button>
                            </Space.Compact>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleCreate}
                                size="large"
                                style={{ borderRadius: 8 }}
                            >
                                新增任务
                            </Button>
                        </Space>
                    </div>

                    <div className="w-full max-w-7xl mx-auto">
                        <Radio.Group
                            value={viewMode}
                            onChange={e => setViewMode(e.target.value)}
                            optionType="button"
                            buttonStyle="solid"
                        >
                            <Radio.Button value="list"><UnorderedListOutlined /> 列表视图</Radio.Button>
                            <Radio.Button value="gantt"><BarChartOutlined /> 甘特图视图</Radio.Button>
                        </Radio.Group>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-auto px-8 pb-8">
                    <div className="w-full max-w-7xl mx-auto h-full">
                        {viewMode === 'list' ? (
                            <TaskPoolList
                                onEditTask={handleEdit}
                                onRefreshTriggered={refreshTrigger}
                            />
                        ) : (
                            <TaskPoolGantt />
                        )}
                    </div>
                </div>
            </div>

            <TaskFormModal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                onSuccess={handleModalSuccess}
                initialValues={editingTask}
            />
        </div>
    );
};

export default TaskPoolPage;
