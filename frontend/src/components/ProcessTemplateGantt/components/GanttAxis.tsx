import React from 'react';
import { Button, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { TOKENS, HEADER_HEIGHT } from '../constants';
import { DailyPeak } from '../hooks/usePeakPersonnel';

interface GanttAxisProps {
    startDay: number;
    endDay: number;
    hourWidth: number;
    baseDate?: string; // ISO 日期字符串，用于显示实际日期
    expandedDay?: number | null;
    originalStartDay?: number;
    originalEndDay?: number;
    onDayDoubleClick?: (dayNumber: number) => void;
    onCollapseDay?: () => void;
    onPrevDay?: () => void;
    onNextDay?: () => void;
    dailyPeaks?: Map<number, DailyPeak>; // 每日峰值数据
}

export const GanttAxis: React.FC<GanttAxisProps> = ({
    startDay,
    endDay,
    hourWidth,
    baseDate,
    expandedDay = null,
    originalStartDay,
    originalEndDay,
    onDayDoubleClick,
    onCollapseDay,
    onPrevDay,
    onNextDay,
    dailyPeaks
}) => {
    const totalDays = endDay - startDay + 1;
    const totalWidth = totalDays * 24 * hourWidth;
    const isExpanded = expandedDay !== null;

    // 边界检查
    const canGoPrev = isExpanded && originalStartDay !== undefined && expandedDay > originalStartDay;
    const canGoNext = isExpanded && originalEndDay !== undefined && expandedDay < originalEndDay;

    return (
        <div
            style={{
                width: totalWidth,
                minWidth: totalWidth,
                height: HEADER_HEIGHT,
                backgroundColor: TOKENS.card,
                borderBottom: `1px solid ${TOKENS.border}`,
                display: 'flex',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
        >
            {Array.from({ length: totalDays }, (_, index) => {
                const dayNumber = startDay + index;
                const dayWidth = 24 * hourWidth;

                return (
                    <div
                        key={`day-${dayNumber}`}
                        style={{
                            width: dayWidth,
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            flexShrink: 0,
                            borderRight: `1px solid ${TOKENS.border}`
                        }}
                    >
                        {/* Peak Color Bar */}
                        {dailyPeaks && (() => {
                            const peakData = dailyPeaks.get(dayNumber);
                            return peakData && peakData.peak > 0 ? (
                                <div
                                    style={{
                                        height: 4,
                                        background: peakData.color,
                                        transition: 'background 0.3s ease'
                                    }}
                                />
                            ) : (
                                <div style={{ height: 4, background: 'transparent' }} />
                            );
                        })()}
                        {/* Day Header */}
                        <div
                            onDoubleClick={() => onDayDoubleClick?.(dayNumber)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                background: dayNumber === 0 ? 'rgba(37, 99, 235, 0.08)' :
                                    isExpanded ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                                fontWeight: dayNumber === 0 || isExpanded ? 700 : 600,
                                fontSize: isExpanded ? 14 : 12,
                                color: dayNumber === 0 || isExpanded ? TOKENS.primary : TOKENS.textSecondary,
                                borderBottom: `1px solid ${TOKENS.border}`,
                                cursor: 'pointer',
                                transition: 'background 0.2s ease',
                                userSelect: 'none'
                            }}
                        >
                            {isExpanded && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<LeftOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCollapseDay?.();
                                    }}
                                    style={{
                                        color: TOKENS.primary,
                                        fontSize: 12,
                                        padding: '0 4px'
                                    }}
                                >
                                    返回
                                </Button>
                            )}
                            {isExpanded && canGoPrev && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<LeftOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPrevDay?.();
                                    }}
                                    style={{ color: TOKENS.primary, padding: '0 4px' }}
                                    title="上一天"
                                />
                            )}
                            <span>
                                {baseDate
                                    ? dayjs(baseDate).add(dayNumber, 'day').format('MM-DD')
                                    : `Day ${dayNumber}`
                                }
                            </span>
                            {/* Peak Badge */}
                            {dailyPeaks && (() => {
                                const peakData = dailyPeaks.get(dayNumber);
                                return peakData && peakData.peak > 0 ? (
                                    <Tooltip title={`峰值人数: ${peakData.peak} (${peakData.peakHour}:00)`}>
                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 2,
                                                fontSize: 10,
                                                padding: '1px 4px',
                                                borderRadius: 4,
                                                background: peakData.color,
                                                color: '#333',
                                                fontWeight: 600,
                                                transition: 'background 0.3s ease'
                                            }}
                                        >
                                            <TeamOutlined style={{ fontSize: 9 }} />
                                            {peakData.peak}
                                        </span>
                                    </Tooltip>
                                ) : null;
                            })()}
                            {isExpanded && <span style={{ fontSize: 11, opacity: 0.7 }}>(展开视图)</span>}
                            {isExpanded && canGoNext && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<RightOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onNextDay?.();
                                    }}
                                    style={{ color: TOKENS.primary, padding: '0 4px' }}
                                    title="下一天"
                                />
                            )}
                        </div>

                        {/* Hour Header */}
                        <div style={{ display: 'flex', height: 18 }}>
                            {Array.from({ length: 24 }, (_, h) => {
                                const isWorkHour = h >= 9 && h < 17;
                                // 展开模式下显示更多小时标签
                                const showLabel = isExpanded || (hourWidth > 16 && (h % 2 === 0 || hourWidth > 30));

                                return (
                                    <div
                                        key={`h-${h}`}
                                        style={{
                                            width: hourWidth,
                                            height: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: isExpanded ? 11 : 9,
                                            color: isWorkHour ? TOKENS.primary : TOKENS.secondary,
                                            background: isWorkHour ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                                            borderRight: `1px solid ${TOKENS.border}`,
                                            opacity: 0.8,
                                            fontWeight: isExpanded ? 500 : 400
                                        }}
                                    >
                                        {showLabel ? `${h}:00` : ''}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
