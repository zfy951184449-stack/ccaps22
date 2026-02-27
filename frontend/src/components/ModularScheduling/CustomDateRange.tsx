import React from 'react';
import { DatePicker, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface CustomDateRangeProps {
    value: [Dayjs, Dayjs] | null;
    onChange: (dates: [Dayjs, Dayjs] | null) => void;
    disabled?: boolean;
}

export const CustomDateRange: React.FC<CustomDateRangeProps> = ({
    value,
    onChange,
    disabled = false,
}) => {
    // 禁止选择过去的日期（可选）
    // const disabledDate = (current: Dayjs) => {
    //   return current && current < dayjs().startOf('day');
    // };

    return (
        <div style={{
            padding: '24px',
            background: '#fafafa',
            borderRadius: '8px',
            border: '1px dashed #d9d9d9',
            marginBottom: '16px'
        }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                    <Text strong>选择排班时间窗口</Text>
                    <div style={{ color: '#8c8c8c', fontSize: '13px', marginTop: '4px' }}>
                        系统将自动获取该时间段内所有激活的操作进行排班。
                        <br />
                        对于跨越边界的共享组，系统会自动处理历史约束。
                    </div>
                </div>

                <RangePicker
                    value={value}
                    onChange={(dates) => onChange(dates as [Dayjs, Dayjs] | null)}
                    disabled={disabled}
                    style={{ width: '100%' }}
                    size="large"
                    format="YYYY-MM-DD"
                    allowClear
                />
            </Space>
        </div>
    );
};
