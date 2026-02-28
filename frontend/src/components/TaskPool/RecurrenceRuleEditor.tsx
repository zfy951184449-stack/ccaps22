import React from 'react';
import { Form, Select, InputNumber, Checkbox, Space, Typography } from 'antd';

const { Text } = Typography;

export interface RecurrenceRule {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval: number;
    days?: number[]; // 1=Mon...7=Sun for WEEKLY, or 1-31 for MONTHLY
}

interface RecurrenceRuleEditorProps {
    value?: RecurrenceRule;
    onChange?: (val: RecurrenceRule) => void;
}

const RecurrenceRuleEditor: React.FC<RecurrenceRuleEditorProps> = ({ value, onChange }) => {
    const triggerChange = (changedValue: Partial<RecurrenceRule>) => {
        if (onChange) {
            onChange({
                freq: 'WEEKLY',
                interval: 1,
                ...value,
                ...changedValue,
            });
        }
    };

    const freq = value?.freq || 'WEEKLY';
    const interval = value?.interval || 1;
    const days = value?.days || [];

    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
                <Text>每</Text>
                <InputNumber
                    min={1}
                    max={365}
                    value={interval}
                    onChange={(val) => triggerChange({ interval: val || 1 })}
                    style={{ width: 80 }}
                />
                <Select
                    value={freq}
                    onChange={(val) => triggerChange({ freq: val, days: [] })}
                    style={{ width: 100 }}
                    options={[
                        { label: '周 (WEEKLY)', value: 'WEEKLY' },
                        { label: '月 (MONTHLY)', value: 'MONTHLY' },
                        { label: '天 (DAILY)', value: 'DAILY' },
                    ]}
                />
            </Space>

            {freq === 'WEEKLY' && (
                <Checkbox.Group
                    options={[
                        { label: '周一', value: 1 },
                        { label: '周二', value: 2 },
                        { label: '周三', value: 3 },
                        { label: '周四', value: 4 },
                        { label: '周五', value: 5 },
                        { label: '周六', value: 6 },
                        { label: '周日', value: 7 },
                    ]}
                    value={days}
                    onChange={(checkedValues) => triggerChange({ days: checkedValues as number[] })}
                />
            )}

            {freq === 'MONTHLY' && (
                <div>
                    <Text type="secondary">请选择每月的日期（1-31）：</Text>
                    <br />
                    <Select
                        mode="multiple"
                        style={{ width: '100%', marginTop: 8 }}
                        placeholder="选择日期"
                        value={days}
                        onChange={(val) => triggerChange({ days: val })}
                        options={Array.from({ length: 31 }, (_, i) => ({
                            label: `${i + 1}日`,
                            value: i + 1,
                        }))}
                    />
                </div>
            )}
        </Space>
    );
};

export default RecurrenceRuleEditor;
