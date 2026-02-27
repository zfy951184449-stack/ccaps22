import React from 'react';
import { Segmented } from 'antd';
import { AppstoreOutlined, CalendarOutlined } from '@ant-design/icons';
import { SchedulingMode } from '../../../../backend/src/types/schedulingV2';

// 由于不能直接从后端导入类型（虽然在同一个 monorepo，但前端通常不直接引用后端文件）
// 我们在 types.ts 中定义类型，这里使用本地定义的或者字符串
export type SolveMode = 'BATCH' | 'TIME_RANGE';

interface SolveModePickerProps {
    value: SolveMode;
    onChange: (value: SolveMode) => void;
    disabled?: boolean;
}

export const SolveModePicker: React.FC<SolveModePickerProps> = ({
    value,
    onChange,
    disabled = false,
}) => {
    return (
        <div style={{ marginBottom: 16 }}>
            <Segmented
                options={[
                    {
                        label: (
                            <div style={{ padding: '0 8px' }}>
                                <AppstoreOutlined /> 按批次排班
                            </div>
                        ),
                        value: 'BATCH',
                    },
                    {
                        label: (
                            <div style={{ padding: '0 8px' }}>
                                <CalendarOutlined /> 按时间段排班
                            </div>
                        ),
                        value: 'TIME_RANGE',
                    },
                ]}
                value={value}
                onChange={onChange as any}
                disabled={disabled}
                size="large"
            />
        </div>
    );
};
