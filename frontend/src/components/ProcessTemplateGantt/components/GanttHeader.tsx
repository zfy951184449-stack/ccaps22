import React from 'react';
import { Button, Space, Tooltip, Slider, Typography, Tag } from 'antd';
import {
    ArrowLeftOutlined,
    ZoomOutOutlined,
    CompressOutlined,
    ZoomInOutlined,
    SaveOutlined,
    SafetyOutlined,
    TeamOutlined
} from '@ant-design/icons';
import { ProcessTemplate } from '../types';
import { TOKENS, TITLE_BAR_HEIGHT } from '../constants';

const { Text } = Typography;

interface GanttHeaderProps {
    template: ProcessTemplate;
    onBack: () => void;
    zoomScale: number;
    setZoomScale: (value: number) => void;
    handleZoomIn: () => void;
    handleZoomOut: () => void;
    handleZoomReset: () => void;
    isDirty: boolean;
    handleSaveTemplate: () => void;
    handleAutoSchedule: () => void;
    scheduling: boolean;
    // 共享组面板控制
    onToggleSharePanel?: () => void;
    shareGroupCount?: number;
}

export const GanttHeader: React.FC<GanttHeaderProps> = ({
    template,
    onBack,
    zoomScale,
    setZoomScale,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    isDirty,
    handleSaveTemplate,
    handleAutoSchedule,
    scheduling,
    onToggleSharePanel,
    shareGroupCount = 0
}) => {
    return (
        <div
            style={{
                padding: '12px 20px',
                background: TOKENS.card,
                borderBottom: `1px solid ${TOKENS.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: TITLE_BAR_HEIGHT
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={onBack}
                    type="default"
                    style={{ borderRadius: 8, marginRight: 4 }}
                >
                    返回
                </Button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Text style={{ fontSize: 18, fontWeight: 600, color: TOKENS.textPrimary }}>
                        增强甘特图编辑器
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: 500, color: TOKENS.textSecondary }}>
                        {template.template_code || template.template_name}
                    </Text>
                </div>
                {isDirty && <Tag color="orange" style={{ marginLeft: 8 }}>未保存</Tag>}
            </div>

            <Space size={16} align="center">
                {/* 共享组面板按钮 */}
                {onToggleSharePanel && (
                    <Tooltip title="管理人员共享组">
                        <Button
                            icon={<TeamOutlined />}
                            onClick={onToggleSharePanel}
                            style={{
                                borderRadius: 8,
                                borderColor: '#1890ff',
                                color: '#1890ff'
                            }}
                        >
                            共享组 {shareGroupCount > 0 && <Tag color="blue" style={{ marginLeft: 4, marginRight: 0 }}>{shareGroupCount}</Tag>}
                        </Button>
                    </Tooltip>
                )}

                <Space.Compact>
                    <Tooltip title="缩小">
                        <Button
                            size="small"
                            icon={<ZoomOutOutlined />}
                            onClick={handleZoomOut}
                            disabled={zoomScale <= 0.1}
                        />
                    </Tooltip>
                    <Tooltip title="重置缩放">
                        <Button
                            size="small"
                            icon={<CompressOutlined />}
                            onClick={handleZoomReset}
                            disabled={zoomScale === 1.0}
                        />
                    </Tooltip>
                    <Tooltip title="放大">
                        <Button
                            size="small"
                            icon={<ZoomInOutlined />}
                            onClick={handleZoomIn}
                            disabled={zoomScale >= 5.0}
                        />
                    </Tooltip>
                </Space.Compact>

                <div style={{ width: 140, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Slider
                        min={0.1}
                        max={5.0}
                        step={0.1}
                        value={zoomScale}
                        onChange={setZoomScale}
                        style={{ flex: 1 }}
                        tooltip={{
                            formatter: (value) => `${Math.round((value || 1) * 100)}%`
                        }}
                    />
                    <Text style={{ fontSize: 12, minWidth: 40, textAlign: 'right', color: TOKENS.textSecondary }}>
                        {Math.round(zoomScale * 100)}%
                    </Text>
                </div>

                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    style={{ borderRadius: 8, height: 36, paddingInline: 16 }}
                    onClick={handleSaveTemplate}
                    disabled={!isDirty}
                >
                    保存模板
                </Button>
                <Button
                    icon={<SafetyOutlined />}
                    style={{ borderRadius: 8, height: 36, paddingInline: 16, borderColor: TOKENS.primary, color: TOKENS.primary }}
                    onClick={handleAutoSchedule}
                    loading={scheduling}
                >
                    自动排程
                </Button>
            </Space>
        </div>
    );
};
