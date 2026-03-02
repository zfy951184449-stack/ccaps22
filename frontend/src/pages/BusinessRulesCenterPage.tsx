import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { operationApi } from '../services/api';
import { operationResourceRequirementsApi, platformApi, resourcesApi } from '../services/platformApi';
import { Operation } from '../types';
import {
  OperationResourceRequirement,
  PlatformBusinessRulesCoverage,
  Resource,
} from '../types/platform';
import { MissingRulePanel, RuleCoverageCards } from '../components/Platform/PlatformPanels';
import { RequirementEditDrawer } from '../components/Platform/PlatformEditors';

const { Search } = Input;

const BusinessRulesCenterPage: React.FC = () => {
  const [coverage, setCoverage] = useState<PlatformBusinessRulesCoverage | null>(null);
  const [requirements, setRequirements] = useState<OperationResourceRequirement[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [domainFilter, setDomainFilter] = useState<string | undefined>();
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string | undefined>();
  const [candidateFilter, setCandidateFilter] = useState<'ALL' | 'MISSING'>('ALL');
  const [editingRequirement, setEditingRequirement] = useState<OperationResourceRequirement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadData = async () => {
    const [coverageData, requirementData, operationData, resourceData] = await Promise.all([
      platformApi.getRuleCoverage(),
      operationResourceRequirementsApi.list(),
      operationApi.getAll().then((response) => response.data),
      resourcesApi.list(),
    ]);
    setCoverage(coverageData);
    setRequirements(requirementData);
    setOperations(operationData);
    setResources(resourceData);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await loadData();
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filteredRequirements = useMemo(() => {
    return requirements.filter((requirement) => {
      if (searchValue) {
        const query = searchValue.toLowerCase();
        const matched =
          (requirement.operationCode ?? '').toLowerCase().includes(query) ||
          (requirement.operationName ?? '').toLowerCase().includes(query);
        if (!matched) {
          return false;
        }
      }

      if (resourceTypeFilter && requirement.resourceType !== resourceTypeFilter) {
        return false;
      }

      if (candidateFilter === 'MISSING' && requirement.candidateResources.length > 0) {
        return false;
      }

      if (domainFilter && coverage) {
        const isMissingRuleForDomain = coverage.missingRuleOperations.some(
          (item) => item.operationId === requirement.operationId && item.domainCode === domainFilter,
        );
        if (!isMissingRuleForDomain && !coverage.coverageByDomain.some((item) => item.domainCode === domainFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [candidateFilter, coverage, domainFilter, requirements, resourceTypeFilter, searchValue]);

  const columns: ColumnsType<OperationResourceRequirement> = [
    { title: '操作', key: 'operation', render: (_, record) => `${record.operationCode ?? '-'} / ${record.operationName ?? record.operationId}` },
    { title: '资源类型', dataIndex: 'resourceType', key: 'resourceType', render: (value: string) => <Tag>{value}</Tag> },
    { title: '数量', dataIndex: 'requiredCount', key: 'requiredCount' },
    {
      title: '约束',
      key: 'flags',
      render: (_, record) => (
        <Space wrap>
          <Tag color={record.isMandatory ? 'error' : 'default'}>{record.isMandatory ? '硬约束' : '软约束'}</Tag>
          <Tag color={record.requiresExclusiveUse ? 'blue' : 'default'}>{record.requiresExclusiveUse ? '独占' : '可共享'}</Tag>
        </Space>
      ),
    },
    {
      title: '候选资源',
      key: 'candidateResources',
      render: (_, record) => (
        <Space wrap>
          {record.candidateResources.length ? record.candidateResources.map((resource) => <Tag key={resource.id}>{resource.resourceCode}</Tag>) : <Tag color="gold">缺候选绑定</Tag>}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setEditingRequirement(record);
              setDrawerOpen(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            onClick={() => {
              setEditingRequirement({
                ...record,
                id: 0,
              });
              setDrawerOpen(true);
            }}
          >
            复制规则
          </Button>
        </Space>
      ),
    },
  ];

  const handleSaveRequirement = async (payload: any) => {
    if (editingRequirement && editingRequirement.id) {
      await operationResourceRequirementsApi.update(editingRequirement.id, payload);
      message.success('规则已更新');
    } else {
      await operationResourceRequirementsApi.create(payload);
      message.success('规则已创建');
    }
    setDrawerOpen(false);
    setEditingRequirement(null);
    await loadData();
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="业务规则中心"
        description="统一查看资源需求覆盖、候选资源绑定覆盖，以及平台仍缺失的主数据和规则定义。"
      />

      <RuleCoverageCards coverage={coverage} />

      <Card
        title="资源规则表"
        extra={
          <Button
            type="primary"
            onClick={() => {
              setEditingRequirement(null);
              setDrawerOpen(true);
            }}
          >
            新增规则
          </Button>
        }
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Search placeholder="搜索操作编码 / 名称" allowClear value={searchValue} onChange={(event) => setSearchValue(event.target.value)} style={{ width: 260 }} />
            <Select
              allowClear
              placeholder="资源类型"
              value={resourceTypeFilter}
              onChange={setResourceTypeFilter}
              style={{ width: 160 }}
              options={[
                { value: 'ROOM', label: '房间' },
                { value: 'EQUIPMENT', label: '设备' },
                { value: 'VESSEL_CONTAINER', label: '容器/储罐' },
                { value: 'TOOLING', label: '器具' },
                { value: 'STERILIZATION_RESOURCE', label: '灭菌资源' },
              ]}
            />
            <Select
              allowClear
              placeholder="业务域"
              value={domainFilter}
              onChange={setDomainFilter}
              style={{ width: 140 }}
              options={[{ value: 'USP' }, { value: 'DSP' }, { value: 'SPI' }, { value: 'MAINT' }]}
            />
            <Select
              value={candidateFilter}
              onChange={setCandidateFilter}
              style={{ width: 160 }}
              options={[
                { value: 'ALL', label: '全部规则' },
                { value: 'MISSING', label: '缺候选绑定' },
              ]}
            />
          </Space>
          <Table rowKey={(record) => `${record.id}-${record.resourceType}`} loading={loading} columns={columns} dataSource={filteredRequirements} pagination={{ pageSize: 10 }} />
        </Space>
      </Card>

      <MissingRulePanel coverage={coverage} />

      <RequirementEditDrawer
        open={drawerOpen}
        requirement={editingRequirement}
        operations={operations}
        resources={resources}
        onClose={() => {
          setDrawerOpen(false);
          setEditingRequirement(null);
        }}
        onSubmit={handleSaveRequirement}
      />
    </Space>
  );
};

export default BusinessRulesCenterPage;
