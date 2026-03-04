import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  List,
  Segmented,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  AimOutlined,
  LinkOutlined,
  NodeIndexOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { processTemplateV2Api } from '../../services/processTemplateV2Api';
import {
  PendingBindingItem,
  PlannerOperation,
  ResourceNode,
  ResourceNodeFilterScope,
  TemplateResourcePlannerResponse,
} from './types';

const LEFT_WIDTH = 320;
const ROW_HEIGHT = 56;
const STAGE_COLORS = ['#0f766e', '#0369a1', '#7c3aed', '#ea580c', '#b91c1c', '#15803d'];

type TimelineRow = {
  node: ResourceNode;
  depth: number;
  isLeaf: boolean;
  expanded: boolean;
  isCollapsedAggregate: boolean;
};

type RenderBar = {
  key: string;
  title: string;
  startHour: number;
  endHour: number;
  color: string;
  subtitle?: string;
  operation?: PlannerOperation;
  aggregateCount?: number;
  aggregate?: boolean;
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const buildParentMap = (nodes: ResourceNode[]) => {
  const map = new Map<number, number | null>();
  const walk = (items: ResourceNode[]) => {
    items.forEach((item) => {
      map.set(item.id, item.parentId);
      walk(item.children ?? []);
    });
  };
  walk(nodes);
  return map;
};

const flattenNodes = (nodes: ResourceNode[]): ResourceNode[] => {
  const result: ResourceNode[] = [];
  const walk = (items: ResourceNode[]) => {
    items.forEach((item) => {
      result.push(item);
      walk(item.children ?? []);
    });
  };
  walk(nodes);
  return result;
};

const collectAncestorIds = (id: number, parentMap: Map<number, number | null>) => {
  const result = new Set<number>([id]);
  let current = parentMap.get(id) ?? null;
  while (current) {
    result.add(current);
    current = parentMap.get(current) ?? null;
  }
  return result;
};

const collectDescendantIds = (node: ResourceNode): Set<number> => {
  const result = new Set<number>([node.id]);
  const walk = (current: ResourceNode) => {
    current.children.forEach((child) => {
      result.add(child.id);
      walk(child);
    });
  };
  walk(node);
  return result;
};

const pruneTree = (
  nodes: ResourceNode[],
  includeIds: Set<number>,
  query: string,
): ResourceNode[] => {
  const normalizedQuery = normalizeText(query);
  return nodes
    .map((node) => {
      const nextChildren = pruneTree(node.children ?? [], includeIds, query);
      const matchedQuery =
        !normalizedQuery ||
        normalizeText(node.nodeName).includes(normalizedQuery) ||
        normalizeText(node.nodeCode).includes(normalizedQuery) ||
        normalizeText(node.boundResourceCode ?? '').includes(normalizedQuery) ||
        normalizeText(node.boundResourceName ?? '').includes(normalizedQuery);

      if (!includeIds.has(node.id) || (!matchedQuery && nextChildren.length === 0 && normalizedQuery)) {
        return null;
      }

      return {
        ...node,
        children: nextChildren,
      };
    })
    .filter((item): item is ResourceNode => Boolean(item));
};

const flattenVisibleRows = (
  nodes: ResourceNode[],
  expandedKeys: Set<number>,
  depth = 0,
): TimelineRow[] => {
  const rows: TimelineRow[] = [];
  nodes.forEach((node) => {
    const isLeaf = !node.children.length;
    const expanded = expandedKeys.has(node.id);
    rows.push({
      node,
      depth,
      isLeaf,
      expanded,
      isCollapsedAggregate: !isLeaf && !expanded,
    });
    if (!isLeaf && expanded) {
      rows.push(...flattenVisibleRows(node.children, expandedKeys, depth + 1));
    }
  });
  return rows;
};

const getStageColor = (stageOrder: number) => STAGE_COLORS[(Math.max(stageOrder, 1) - 1) % STAGE_COLORS.length];

const buildOperationBar = (operation: PlannerOperation): RenderBar => {
  const absoluteDay =
    Number(operation.stage_start_day ?? 0) +
    Number(operation.operation_day ?? 0) +
    Number(operation.recommended_day_offset ?? 0);
  const startHour = absoluteDay * 24 + Number(operation.recommended_time ?? 0);
  const duration = Number(operation.standard_time ?? 2);
  return {
    key: `operation-${operation.id}`,
    title: operation.operation_name,
    subtitle: `${operation.stage_name} / ${operation.defaultResourceCode ?? '未绑定资源'}`,
    startHour,
    endHour: startHour + Math.max(duration, 1),
    color: getStageColor(operation.stage_order),
    operation,
  };
};

const mergeBars = (bars: RenderBar[]): RenderBar[] => {
  if (!bars.length) {
    return [];
  }

  const sorted = [...bars].sort((left, right) => left.startHour - right.startHour);
  const result: RenderBar[] = [];
  let current = {
    ...sorted[0],
    key: `aggregate-${sorted[0].key}`,
    title: '聚合占用',
    aggregate: true,
    aggregateCount: 1,
  };

  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index];
    if (next.startHour <= current.endHour) {
      current.endHour = Math.max(current.endHour, next.endHour);
      current.aggregateCount = Number(current.aggregateCount ?? 1) + 1;
      continue;
    }
    result.push(current);
    current = {
      ...next,
      key: `aggregate-${next.key}`,
      title: '聚合占用',
      aggregate: true,
      aggregateCount: 1,
    };
  }
  result.push(current);
  return result;
};

const toTreeOptions = (nodes: ResourceNode[]): Array<{ value: number; label: string }> => {
  const options: Array<{ value: number; label: string }> = [];
  const walk = (items: ResourceNode[], prefix = '') => {
    items.forEach((node) => {
      if (!node.children.length && node.boundResourceId && node.isActive) {
        options.push({
          value: node.id,
          label: `${prefix}${node.nodeName} / ${node.boundResourceCode ?? '未挂资源'}`,
        });
      }
      walk(node.children, `${prefix}${node.nodeName} / `);
    });
  };
  walk(nodes);
  return options;
};

interface TemplateResourcePlannerTabProps {
  templateId: number;
  templateTeamId: number | null;
  active?: boolean;
  refreshKey?: number;
}

const TemplateResourcePlannerTab: React.FC<TemplateResourcePlannerTabProps> = ({
  templateId,
  templateTeamId,
  active = true,
  refreshKey = 0,
}) => {
  const [loading, setLoading] = useState(false);
  const [planner, setPlanner] = useState<TemplateResourcePlannerResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scope, setScope] = useState<ResourceNodeFilterScope>('referenced');
  const [searchValue, setSearchValue] = useState('');
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [hourWidth, setHourWidth] = useState(18);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());
  const [selectedOperation, setSelectedOperation] = useState<PlannerOperation | null>(null);
  const [bindingDrawerOpen, setBindingDrawerOpen] = useState(false);
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
  const [bindingNodeId, setBindingNodeId] = useState<number | null>(null);
  const [bindingSaving, setBindingSaving] = useState(false);

  const loadPlanner = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await processTemplateV2Api.getPlanner(templateId);
      setPlanner(response);
      setExpandedKeys(new Set(response.resourceTree.map((node) => node.id)));
    } catch (error) {
      console.error('Failed to load template resource planner:', error);
      setPlanner(null);
      setErrorMessage('资源节点视图加载失败，请确认资源节点迁移和绑定接口已启用。');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void loadPlanner();
  }, [active, loadPlanner, refreshKey]);

  const nodeList = useMemo(() => flattenNodes(planner?.resourceTree ?? []), [planner?.resourceTree]);
  const parentMap = useMemo(() => buildParentMap(planner?.resourceTree ?? []), [planner?.resourceTree]);
  const boundNodeIds = useMemo(
    () =>
      new Set(
        (planner?.operations ?? [])
          .filter((operation) => operation.defaultResourceNodeId)
          .map((operation) => Number(operation.defaultResourceNodeId)),
      ),
    [planner?.operations],
  );

  const scopedIds = useMemo(() => {
    if (!planner) {
      return new Set<number>();
    }

    if (scope === 'all') {
      return new Set(nodeList.map((node) => node.id));
    }

    if (scope === 'team' && templateTeamId) {
      const result = new Set<number>();
      nodeList.forEach((node) => {
        if (Number(node.ownerOrgUnitId) === Number(templateTeamId)) {
          collectAncestorIds(node.id, parentMap).forEach((id) => result.add(id));
          collectDescendantIds(node).forEach((id) => result.add(id));
        }
      });
      return result;
    }

    const result = new Set<number>();
    boundNodeIds.forEach((nodeId) => {
      collectAncestorIds(nodeId, parentMap).forEach((id) => result.add(id));
    });
    return result;
  }, [boundNodeIds, nodeList, parentMap, planner, scope, templateTeamId]);

  const filteredTree = useMemo(
    () => pruneTree(planner?.resourceTree ?? [], scopedIds, searchValue),
    [planner?.resourceTree, scopedIds, searchValue],
  );

  const visibleRows = useMemo(
    () => flattenVisibleRows(filteredTree, expandedKeys),
    [expandedKeys, filteredTree],
  );

  const leafNodeOptions = useMemo(() => toTreeOptions(planner?.resourceTree ?? []), [planner?.resourceTree]);

  const pendingItems = useMemo<PendingBindingItem[]>(() => {
    if (!planner) {
      return [];
    }

    return planner.operations
      .filter((operation) => operation.bindingStatus !== 'BOUND')
      .map((operation) => {
        const requirementTypes = new Set<string>(
          (operation.resource_requirements ?? []).map((item) => item.resource_type),
        );
        const suggestedNodes = nodeList.filter((node) => {
          if (node.children.length || !node.boundResourceId || !node.isActive) {
            return false;
          }
          if (!requirementTypes.size) {
            return true;
          }
          return requirementTypes.has(node.boundResourceType ?? '');
        });
        return {
          operation,
          suggestedNodes: suggestedNodes.slice(0, 8),
        };
      });
  }, [nodeList, planner]);

  const startDay = useMemo(() => {
    if (!planner?.operations.length) {
      return 0;
    }
    return Math.min(
      ...planner.operations.map(
        (operation) =>
          Number(operation.stage_start_day ?? 0) +
          Number(operation.operation_day ?? 0) +
          Number(operation.recommended_day_offset ?? 0),
      ),
    );
  }, [planner?.operations]);

  const endDay = useMemo(() => {
    if (!planner?.operations.length) {
      return Math.max(startDay, (planner?.template.total_days ?? 1) - 1);
    }
    const maxFromOps = planner.operations.reduce((max, operation) => {
      const absoluteDay =
        Number(operation.stage_start_day ?? 0) +
        Number(operation.operation_day ?? 0) +
        Number(operation.recommended_day_offset ?? 0);
      const duration = Number(operation.standard_time ?? 2);
      return Math.max(max, absoluteDay + Math.max(Math.ceil(duration / 24), 0));
    }, startDay);
    return Math.max(startDay, maxFromOps, startDay + Math.max((planner.template.total_days ?? 1) - 1, 0));
  }, [planner?.operations, planner?.template.total_days, startDay]);

  const totalDays = Math.max(1, endDay - startDay + 1);
  const timelineWidth = totalDays * 24 * hourWidth;

  const operationsByNodeId = useMemo(() => {
    const map = new Map<number, PlannerOperation[]>();
    (planner?.operations ?? []).forEach((operation) => {
      if (!operation.defaultResourceNodeId) {
        return;
      }
      const key = Number(operation.defaultResourceNodeId);
      const current = map.get(key) ?? [];
      current.push(operation);
      map.set(key, current);
    });
    return map;
  }, [planner?.operations]);

  const getRowBars = (row: TimelineRow): RenderBar[] => {
    if (row.isLeaf) {
      return (operationsByNodeId.get(row.node.id) ?? []).map(buildOperationBar);
    }

    if (!row.isCollapsedAggregate) {
      return [];
    }

    const descendantIds = collectDescendantIds(row.node);
    const bars: RenderBar[] = [];
    descendantIds.forEach((nodeId) => {
      (operationsByNodeId.get(nodeId) ?? []).forEach((operation) => bars.push(buildOperationBar(operation)));
    });
    return mergeBars(bars);
  };

  const openBindingEditor = (operation: PlannerOperation) => {
    setSelectedOperation(operation);
    setBindingNodeId(operation.defaultResourceNodeId);
    setBindingDrawerOpen(true);
  };

  const saveBinding = async () => {
    if (!selectedOperation) {
      return;
    }

    try {
      setBindingSaving(true);
      await processTemplateV2Api.updateTemplateScheduleBinding(selectedOperation.id, bindingNodeId ?? null);
      message.success('默认资源节点绑定已更新');
      setBindingDrawerOpen(false);
      await loadPlanner();
    } catch (error: any) {
      console.error('Failed to update binding:', error);
      message.error(error?.response?.data?.error || '更新默认资源节点绑定失败');
    } finally {
      setBindingSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[540px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <Spin />
      </div>
    );
  }

  if (errorMessage) {
    return <Alert type="error" showIcon message={errorMessage} />;
  }

  if (!planner) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16">
        <Empty description="当前模板暂无资源规划数据" />
      </div>
    );
  }

  if (showPendingOnly) {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Space wrap>
            <Button onClick={() => setShowPendingOnly(false)}>返回时间轴</Button>
            <Tag color="orange">待处理 {pendingItems.length}</Tag>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadPlanner()}>
            刷新
          </Button>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <List
            dataSource={pendingItems}
            locale={{ emptyText: '当前没有待绑定或异常工序' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="bind" type="link" onClick={() => openBindingEditor(item.operation)}>
                    绑定节点
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <span>{item.operation.operation_name}</span>
                      <Tag color={item.operation.bindingStatus === 'UNBOUND' ? 'orange' : 'red'}>
                        {item.operation.bindingStatus}
                      </Tag>
                    </Space>
                  }
                  description={
                    <div className="space-y-1 text-xs text-slate-500">
                      <div>{item.operation.stage_name}</div>
                      <div>{item.operation.bindingReason || '尚未分配默认资源节点'}</div>
                      {item.suggestedNodes.length > 0 ? (
                        <div>
                          推荐节点：
                          {item.suggestedNodes.map((node) => node.nodeName).join(' / ')}
                        </div>
                      ) : null}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </div>

        <Drawer
          title={selectedOperation ? `绑定默认资源节点 - ${selectedOperation.operation_name}` : '绑定默认资源节点'}
          open={bindingDrawerOpen}
          width={520}
          onClose={() => setBindingDrawerOpen(false)}
          extra={
            <Button type="primary" loading={bindingSaving} onClick={() => void saveBinding()}>
              保存绑定
            </Button>
          }
        >
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {selectedOperation ? (
              <Alert
                type="info"
                showIcon
                message={`${selectedOperation.stage_name} / ${selectedOperation.operation_name}`}
                description={selectedOperation.resource_summary || '当前工序尚未配置资源规则摘要'}
              />
            ) : null}
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择叶子资源节点"
              value={bindingNodeId ?? undefined}
              onChange={(value) => setBindingNodeId(value ?? null)}
              options={leafNodeOptions}
              style={{ width: '100%' }}
            />
          </Space>
        </Drawer>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-5 py-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-wide text-white">
                  资源节点视图
                </span>
                <Tag color="blue">默认资源落位</Tag>
              </div>
              <h3 className="mt-3 text-2xl font-semibold text-slate-900">房间 / 设备 / 组件时间轴</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Y 轴展示资源节点树，X 轴使用模板工艺时间轴。工序只有在绑定默认资源节点后，才会落到具体叶子节点。
              </p>
            </div>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => void loadPlanner()}>
                刷新
              </Button>
              <Button icon={<AimOutlined />} onClick={() => setPendingDrawerOpen(true)}>
                查看待绑定工序
              </Button>
            </Space>
          </div>

          {planner.warnings.length ? (
            <div className="mt-4 space-y-2">
              {planner.warnings.map((warning) => (
                <Alert key={warning} type="warning" showIcon message={warning} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">总工序数</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{planner.metrics.totalOperations}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">已绑定</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">{planner.metrics.boundOperations}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">未绑定</div>
            <div className="mt-2 text-2xl font-semibold text-amber-700">{planner.metrics.unboundOperations}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">无效绑定</div>
            <div className="mt-2 text-2xl font-semibold text-rose-700">{planner.metrics.invalidBindings}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Space wrap>
          <Segmented
            value={scope}
            onChange={(value) => setScope(value as ResourceNodeFilterScope)}
            options={[
              { label: '已引用节点', value: 'referenced' },
              { label: '模板团队节点', value: 'team' },
              { label: '全部节点', value: 'all' },
            ]}
          />
          <Input.Search
            allowClear
            placeholder="搜索节点 / 资源"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            style={{ width: 240 }}
          />
          <Tooltip title="切换为待处理工序列表">
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Switch checked={showPendingOnly} onChange={setShowPendingOnly} />
              仅看待绑定工序
            </span>
          </Tooltip>
        </Space>

        <Space wrap align="center">
          <Button onClick={() => setExpandedKeys(new Set(nodeList.map((node) => node.id)))}>展开全部</Button>
          <Button onClick={() => setExpandedKeys(new Set(filteredTree.map((node) => node.id)))}>折叠到根节点</Button>
          <span className="text-sm text-slate-500">缩放</span>
          <Slider
            min={10}
            max={28}
            step={2}
            value={hourWidth}
            onChange={(value) => setHourWidth(value)}
            style={{ width: 160 }}
          />
        </Space>
      </div>

      <div className="overflow-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        {!visibleRows.length ? (
          <div className="py-16">
            <Empty description="当前筛选条件下没有可展示的资源节点" />
          </div>
        ) : (
          <div style={{ minWidth: LEFT_WIDTH + timelineWidth }}>
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
              <div style={{ display: 'flex' }}>
                <div
                  className="sticky left-0 z-20 border-r border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                  style={{ width: LEFT_WIDTH }}
                >
                  资源节点
                </div>
                <div style={{ width: timelineWidth }}>
                  <div className="flex border-b border-slate-200 bg-slate-50">
                    {Array.from({ length: totalDays }, (_, index) => {
                      const day = startDay + index;
                      return (
                        <div
                          key={`planner-day-${day}`}
                          className="border-r border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
                          style={{ width: 24 * hourWidth }}
                        >
                          Day {day}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex bg-white">
                    {Array.from({ length: totalDays * 24 }, (_, index) => (
                      <div
                        key={`planner-hour-${index}`}
                        className="border-r border-slate-100 px-0.5 py-1 text-center text-[10px] text-slate-400"
                        style={{ width: hourWidth }}
                      >
                        {index % 4 === 0 ? index % 24 : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {visibleRows.map((row) => {
              const bars = getRowBars(row);
              return (
                <div key={row.node.id} style={{ display: 'flex', minHeight: ROW_HEIGHT }}>
                  <div
                    className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3"
                    style={{ width: LEFT_WIDTH }}
                  >
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: row.depth * 18 }}
                    >
                      {!row.isLeaf ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.node.id)) {
                                next.delete(row.node.id);
                              } else {
                                next.add(row.node.id);
                              }
                              return next;
                            })
                          }
                          className="h-6 w-6 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-500"
                        >
                          {row.expanded ? '-' : '+'}
                        </button>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300">
                          <ApartmentOutlined />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{row.node.nodeName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                          <Tag>{row.node.nodeClass}</Tag>
                          {row.node.boundResourceCode ? (
                            <span>{row.node.boundResourceCode}</span>
                          ) : (
                            <span>未挂资源</span>
                          )}
                          {!row.node.isActive ? <Tag color="red">停用</Tag> : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative border-b border-slate-100"
                    style={{
                      width: timelineWidth,
                      height: ROW_HEIGHT,
                      backgroundImage: `linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px)`,
                      backgroundSize: `${hourWidth}px 100%`,
                    }}
                  >
                    {bars.map((bar) => {
                      const left = (bar.startHour - startDay * 24) * hourWidth;
                      const width = Math.max((bar.endHour - bar.startHour) * hourWidth, 18);
                      return (
                        <Tooltip
                          key={bar.key}
                          title={
                            bar.aggregate
                              ? `聚合占用：${bar.aggregateCount ?? 1} 个子节点工序`
                              : `${bar.title}${bar.subtitle ? ` / ${bar.subtitle}` : ''}`
                          }
                        >
                          <button
                            type="button"
                            disabled={bar.aggregate}
                            onClick={() => bar.operation && openBindingEditor(bar.operation)}
                            className="absolute top-2 rounded-xl px-2 py-1 text-left text-white shadow-sm transition-all hover:-translate-y-0.5"
                            style={{
                              left,
                              width,
                              height: ROW_HEIGHT - 16,
                              background: bar.aggregate ? 'rgba(15,23,42,0.45)' : bar.color,
                              opacity: bar.aggregate ? 0.75 : 0.95,
                            }}
                          >
                            <div className="truncate text-xs font-semibold">
                              {bar.aggregate ? `聚合 ${bar.aggregateCount}` : bar.title}
                            </div>
                            {!bar.aggregate && bar.operation ? (
                              <div className="truncate text-[10px] opacity-80">
                                {bar.operation.bindingStatus}
                              </div>
                            ) : null}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Drawer
        title={selectedOperation ? `默认资源节点绑定 - ${selectedOperation.operation_name}` : '默认资源节点绑定'}
        open={bindingDrawerOpen}
        width={520}
        onClose={() => setBindingDrawerOpen(false)}
        extra={
          <Button type="primary" loading={bindingSaving} onClick={() => void saveBinding()}>
            保存绑定
          </Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {selectedOperation ? (
            <>
              <Alert
                type={selectedOperation.bindingStatus === 'BOUND' ? 'success' : 'warning'}
                showIcon
                message={`${selectedOperation.stage_name} / ${selectedOperation.operation_name}`}
                description={selectedOperation.bindingReason || selectedOperation.resource_summary || '为工序选择默认资源节点'}
              />
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <NodeIndexOutlined />
                  当前绑定状态：{selectedOperation.bindingStatus}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <LinkOutlined />
                  当前资源摘要：{selectedOperation.resource_summary || '未定义资源规则'}
                </div>
              </div>
            </>
          ) : null}
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择叶子资源节点"
            value={bindingNodeId ?? undefined}
            onChange={(value) => setBindingNodeId(value ?? null)}
            options={leafNodeOptions}
            style={{ width: '100%' }}
          />
        </Space>
      </Drawer>

      <Drawer
        title="待绑定与异常工序"
        open={pendingDrawerOpen}
        width={560}
        onClose={() => setPendingDrawerOpen(false)}
      >
        <List
          dataSource={pendingItems}
          locale={{ emptyText: '当前没有待绑定工序' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="bind"
                  type="link"
                  onClick={() => {
                    setPendingDrawerOpen(false);
                    openBindingEditor(item.operation);
                  }}
                >
                  绑定节点
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <span>{item.operation.operation_name}</span>
                    <Tag color={item.operation.bindingStatus === 'UNBOUND' ? 'orange' : 'red'}>
                      {item.operation.bindingStatus}
                    </Tag>
                  </Space>
                }
                description={
                  <div className="space-y-1 text-xs text-slate-500">
                    <div>{item.operation.stage_name}</div>
                    <div>{item.operation.bindingReason || '尚未绑定默认资源节点'}</div>
                    {item.suggestedNodes.length ? (
                      <div>推荐节点：{item.suggestedNodes.map((node) => node.nodeName).join(' / ')}</div>
                    ) : null}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
    </section>
  );
};

export default TemplateResourcePlannerTab;
