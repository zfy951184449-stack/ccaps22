import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, List, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { operationResourceRequirementsApi } from '../services/platformApi';
import { OperationResourceRequirement } from '../types/platform';

const { Paragraph, Text } = Typography;

const columns: ColumnsType<OperationResourceRequirement> = [
  { title: '操作', key: 'operation', render: (_, record) => record.operationName ?? record.operationCode ?? record.operationId },
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
];

const BusinessRulesCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const [requirements, setRequirements] = useState<OperationResourceRequirement[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await operationResourceRequirementsApi.list();
      setRequirements(data);
    };

    void load();
  }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="业务规则中心"
        description="该页面把现有资质、班次、操作约束和新增资源约束统一收口到平台视图中，避免规则散落在多个页面。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="资源需求规则" value={requirements.length} />
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              操作与资源映射数量，用于衡量资源主数据建模覆盖率。
            </Paragraph>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="核心规则页" value={4} />
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              资质矩阵、班次定义、操作约束、资源约束统一收口。
            </Paragraph>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="跨部门重点" value={3} />
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              USP、DSP、SP&I 需要共享同一个资源约束模型。
            </Paragraph>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="规则导航">
            <List
              dataSource={[
                { label: '资质矩阵', action: () => navigate('/qualification-matrix') },
                { label: '班次定义', action: () => navigate('/shift-definitions') },
                { label: '操作约束', action: () => navigate('/operation-constraints') },
                { label: '资源中心', action: () => navigate('/resource-center') },
              ]}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button key={item.label} type="link" onClick={item.action}>
                      打开
                    </Button>,
                  ]}
                >
                  <Text>{item.label}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="资源约束样例">
            <Table rowKey="id" columns={columns} dataSource={requirements} pagination={{ pageSize: 6 }} />
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default BusinessRulesCenterPage;
