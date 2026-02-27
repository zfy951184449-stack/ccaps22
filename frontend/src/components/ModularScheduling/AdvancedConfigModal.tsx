/**
 * 高级配置弹窗组件
 * 
 * 用于配置求解器高级参数：时间限制、线程数、对称性破缺等
 */

import React from 'react';
import {
    Modal,
    Form,
    InputNumber,
    Switch,
    Select,
    Space,
    Typography,
    Divider,
    Tooltip,
} from 'antd';
import {
    ThunderboltOutlined,
    ClockCircleOutlined,
    ApartmentOutlined,
    ExperimentOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

// 高级配置类型
export interface AdvancedConfig {
    timeLimitSeconds: number;       // 求解时间限制
    numThreads: number;             // 线程数
    enableSymmetryBreaking: boolean; // 对称性破缺
    enablePreprocessing: boolean;   // 预处理
    searchStrategy: 'DEFAULT' | 'FIRST_SOLUTION' | 'BEST_BOUND';
    logLevel: 'NONE' | 'PROGRESS' | 'DETAILED';
}

// 默认配置
export const DEFAULT_ADVANCED_CONFIG: AdvancedConfig = {
    timeLimitSeconds: 60,
    numThreads: 4,
    enableSymmetryBreaking: true,
    enablePreprocessing: true,
    searchStrategy: 'DEFAULT',
    logLevel: 'PROGRESS',
};

interface AdvancedConfigModalProps {
    visible: boolean;
    config: AdvancedConfig;
    onCancel: () => void;
    onConfirm: (config: AdvancedConfig) => void;
}

const AdvancedConfigModal: React.FC<AdvancedConfigModalProps> = ({
    visible,
    config,
    onCancel,
    onConfirm,
}) => {
    const [form] = Form.useForm();

    // 打开时重置表单
    React.useEffect(() => {
        if (visible) {
            form.setFieldsValue(config);
        }
    }, [visible, config, form]);

    const handleOk = () => {
        form.validateFields().then((values) => {
            onConfirm(values);
        });
    };

    return (
        <Modal
            title={
                <Space>
                    <ThunderboltOutlined />
                    高级配置
                </Space>
            }
            open={visible}
            onCancel={onCancel}
            onOk={handleOk}
            okText="应用"
            cancelText="取消"
            width={480}
        >
            <Form
                form={form}
                layout="vertical"
                size="small"
                initialValues={config}
            >
                <Divider orientation="left" plain style={{ margin: '8px 0' }}>
                    <Space>
                        <ClockCircleOutlined />
                        <Text type="secondary">性能设置</Text>
                    </Space>
                </Divider>

                <Form.Item
                    name="timeLimitSeconds"
                    label={
                        <Tooltip title="求解器最大运行时间，超时将返回当前最优解">
                            求解时间限制 (秒)
                        </Tooltip>
                    }
                    rules={[{ required: true }]}
                >
                    <InputNumber
                        min={10}
                        max={3600}
                        step={10}
                        style={{ width: '100%' }}
                        addonAfter="秒"
                    />
                </Form.Item>

                <Form.Item
                    name="numThreads"
                    label={
                        <Tooltip title="并行求解线程数，建议设为 CPU 核心数">
                            线程数
                        </Tooltip>
                    }
                    rules={[{ required: true }]}
                >
                    <InputNumber
                        min={1}
                        max={16}
                        step={1}
                        style={{ width: '100%' }}
                    />
                </Form.Item>

                <Divider orientation="left" plain style={{ margin: '8px 0' }}>
                    <Space>
                        <ExperimentOutlined />
                        <Text type="secondary">优化策略</Text>
                    </Space>
                </Divider>

                <Form.Item
                    name="enableSymmetryBreaking"
                    label={
                        <Tooltip title="消除对称解，减少搜索空间">
                            对称性破缺
                        </Tooltip>
                    }
                    valuePropName="checked"
                >
                    <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                </Form.Item>

                <Form.Item
                    name="enablePreprocessing"
                    label={
                        <Tooltip title="预先计算候选人和冲突表">
                            数据预处理
                        </Tooltip>
                    }
                    valuePropName="checked"
                >
                    <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                </Form.Item>

                <Form.Item
                    name="searchStrategy"
                    label="搜索策略"
                >
                    <Select
                        options={[
                            { label: '默认 (平衡)', value: 'DEFAULT' },
                            { label: '快速首解', value: 'FIRST_SOLUTION' },
                            { label: '最优边界', value: 'BEST_BOUND' },
                        ]}
                    />
                </Form.Item>

                <Divider orientation="left" plain style={{ margin: '8px 0' }}>
                    <Space>
                        <ApartmentOutlined />
                        <Text type="secondary">日志设置</Text>
                    </Space>
                </Divider>

                <Form.Item
                    name="logLevel"
                    label="日志级别"
                >
                    <Select
                        options={[
                            { label: '无日志', value: 'NONE' },
                            { label: '进度日志', value: 'PROGRESS' },
                            { label: '详细日志', value: 'DETAILED' },
                        ]}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default AdvancedConfigModal;
