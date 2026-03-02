import React, { useMemo, useState } from 'react';
import { Empty, Segmented, Slider, Space, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  PlatformTimelineDependency,
  PlatformTimelineItem,
  PlatformTimelineLane,
} from '../../types/platform';
import './PlatformTimelineBoard.css';

const { Text } = Typography;

interface PlatformTimelineBoardProps {
  lanes: PlatformTimelineLane[];
  items: PlatformTimelineItem[];
  dependencies?: PlatformTimelineDependency[];
  windowStart?: string;
  windowEnd?: string;
  selectedItemId?: string | null;
  onItemClick?: (item: PlatformTimelineItem) => void;
  onItemDoubleClick?: (item: PlatformTimelineItem) => void;
  toolbarExtras?: React.ReactNode;
  emptyDescription?: string;
}

const VIEW_PRESETS = {
  week: 72,
  biweek: 44,
  month: 24,
} as const;

const formatDayLabel = (value: dayjs.Dayjs) => value.format('MM-DD');

const PlatformTimelineBoard: React.FC<PlatformTimelineBoardProps> = ({
  lanes,
  items,
  dependencies = [],
  windowStart,
  windowEnd,
  selectedItemId,
  onItemClick,
  onItemDoubleClick,
  toolbarExtras,
  emptyDescription = '当前时间窗内暂无可展示数据',
}) => {
  const [dayWidth, setDayWidth] = useState<number>(VIEW_PRESETS.biweek);

  const computedWindow = useMemo(() => {
    if (windowStart && windowEnd) {
      return {
        start: dayjs(windowStart),
        end: dayjs(windowEnd),
      };
    }

    if (items.length === 0) {
      const start = dayjs().startOf('day');
      return {
        start,
        end: start.add(14, 'day'),
      };
    }

    const start = items.reduce((min, item) => {
      const value = dayjs(item.startDatetime);
      return value.isBefore(min) ? value : min;
    }, dayjs(items[0].startDatetime)).startOf('day');
    const end = items.reduce((max, item) => {
      const value = dayjs(item.endDatetime);
      return value.isAfter(max) ? value : max;
    }, dayjs(items[0].endDatetime)).endOf('day');

    return {
      start,
      end,
    };
  }, [items, windowEnd, windowStart]);

  const totalDays = Math.max(1, computedWindow.end.diff(computedWindow.start, 'day') + 1);

  const dayMarkers = useMemo(
    () =>
      Array.from({ length: totalDays }).map((_, index) => {
        const value = computedWindow.start.add(index, 'day');
        return {
          key: value.format('YYYY-MM-DD'),
          label: formatDayLabel(value),
        };
      }),
    [computedWindow.start, totalDays],
  );

  const dependencyCountMap = useMemo(() => {
    const next = new Map<string, number>();
    dependencies.forEach((dependency) => {
      next.set(dependency.fromItemId, (next.get(dependency.fromItemId) ?? 0) + 1);
      next.set(dependency.toItemId, (next.get(dependency.toItemId) ?? 0) + 1);
    });
    return next;
  }, [dependencies]);

  const itemsByLane = useMemo(() => {
    const next = new Map<string, PlatformTimelineItem[]>();
    lanes.forEach((lane) => next.set(lane.id, []));
    items.forEach((item) => {
      const current = next.get(item.laneId) ?? [];
      current.push(item);
      next.set(item.laneId, current);
    });
    next.forEach((laneItems) => laneItems.sort((left, right) => dayjs(left.startDatetime).valueOf() - dayjs(right.startDatetime).valueOf()));
    return next;
  }, [items, lanes]);

  if (lanes.length === 0) {
    return (
      <div className="platform-timeline-board">
        <div className="platform-timeline-empty">
          <Empty description={emptyDescription} />
        </div>
      </div>
    );
  }

  return (
    <div className="platform-timeline-board" style={{ ['--platform-day-width' as string]: `${dayWidth}px` }}>
      <div className="platform-timeline-toolbar">
        <Space size="large" wrap>
          <Segmented
            value={
              dayWidth >= VIEW_PRESETS.week
                ? 'week'
                : dayWidth >= VIEW_PRESETS.biweek
                  ? 'biweek'
                  : 'month'
            }
            options={[
              { label: '周视图', value: 'week' },
              { label: '双周', value: 'biweek' },
              { label: '月视图', value: 'month' },
            ]}
            onChange={(value) => setDayWidth(VIEW_PRESETS[value as keyof typeof VIEW_PRESETS])}
          />
          <Space size={8}>
            <Text type="secondary">缩放</Text>
            <Slider min={18} max={88} value={dayWidth} onChange={setDayWidth} style={{ width: 160 }} />
          </Space>
          <Text type="secondary">
            {computedWindow.start.format('YYYY-MM-DD HH:mm')} 至 {computedWindow.end.format('YYYY-MM-DD HH:mm')}
          </Text>
        </Space>
        {toolbarExtras}
      </div>

      <div className="platform-timeline-scroll">
        <div className="platform-timeline-canvas" style={{ minWidth: 220 + totalDays * dayWidth }}>
          <div className="platform-timeline-header" style={{ gridTemplateColumns: `220px repeat(${totalDays}, ${dayWidth}px)` }}>
            <div className="platform-timeline-label">
              <Text strong>Lane</Text>
            </div>
            {dayMarkers.map((marker) => (
              <div className="platform-timeline-day" key={marker.key}>
                {marker.label}
              </div>
            ))}
          </div>

          {lanes.map((lane) => (
            <div className="platform-timeline-lane" key={lane.id} style={{ gridTemplateColumns: `220px ${totalDays * dayWidth}px` }}>
              <div className="platform-timeline-label">
                <Space direction="vertical" size={0}>
                  <Text strong>{lane.label}</Text>
                  <Space size={4} wrap>
                    {lane.groupLabel ? <Tag>{lane.groupLabel}</Tag> : null}
                    {lane.domainCode ? <Tag color="blue">{lane.domainCode}</Tag> : null}
                    {lane.laneType ? <Tag>{lane.laneType}</Tag> : null}
                  </Space>
                </Space>
              </div>
              <div className="platform-timeline-track">
                {(itemsByLane.get(lane.id) ?? []).map((item) => {
                  const startHours = Math.max(0, dayjs(item.startDatetime).diff(computedWindow.start, 'hour', true));
                  const durationHours = Math.max(1 / 6, dayjs(item.endDatetime).diff(dayjs(item.startDatetime), 'hour', true));
                  const left = (startHours / 24) * dayWidth;
                  const width = Math.max(18, (durationHours / 24) * dayWidth);
                  const dependencyCount = dependencyCountMap.get(item.id) ?? 0;

                  return (
                    <Tooltip
                      key={item.id}
                      title={
                        <Space direction="vertical" size={0}>
                          <Text>{item.title}</Text>
                          {item.subtitle ? <Text type="secondary">{item.subtitle}</Text> : null}
                          <Text type="secondary">
                            {dayjs(item.startDatetime).format('MM-DD HH:mm')} - {dayjs(item.endDatetime).format('MM-DD HH:mm')}
                          </Text>
                        </Space>
                      }
                    >
                      <div
                        className={[
                          'platform-timeline-item',
                          selectedItemId === item.id ? 'is-selected' : '',
                          item.isConflicted ? 'is-conflicted' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ left, width, backgroundColor: item.color }}
                        onClick={() => onItemClick?.(item)}
                        onDoubleClick={() => onItemDoubleClick?.(item)}
                      >
                        <div className="platform-timeline-item__title">{item.title}</div>
                        {item.subtitle ? <div className="platform-timeline-item__subtitle">{item.subtitle}</div> : null}
                        <div className="platform-timeline-item__flags">
                          {item.isConflicted ? <span className="platform-timeline-item__flag">冲突</span> : null}
                          {item.maintenanceBlocked ? <span className="platform-timeline-item__flag">维护</span> : null}
                          {dependencyCount > 0 ? <span className="platform-timeline-item__flag">依赖 {dependencyCount}</span> : null}
                        </div>
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlatformTimelineBoard;
