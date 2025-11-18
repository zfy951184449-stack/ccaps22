import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Statistic,
  Space,
  Input,
  Button,
  Table,
  Tag,
  message,
  InputNumber,
  Descriptions,
  Alert,
  Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, KeyOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { systemMonitorApi } from '../services/api';
import { HolidayServiceLogEntry, HolidayServiceStatus } from '../types';

const { Text } = Typography;

const statusColorMap: Record<HolidayServiceLogEntry['status'], string> = {
  SUCCESS: 'success',
  PARTIAL: 'warning',
  FAILED: 'error',
};

const SystemMonitorPage: React.FC = () => {
  const [status, setStatus] = useState<HolidayServiceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [targetYear, setTargetYear] = useState<number>(dayjs().year());

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await systemMonitorApi.getHolidayStatus();
      setStatus(response);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '无法获取节假日服务状态');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      message.warning('请输入有效密钥');
      return;
    }
    setSavingKey(true);
    try {
      const data = await systemMonitorApi.updateHolidayKey({ apiKey: apiKey.trim() });
      message.success('密钥已更新');
      setApiKey('');
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              keyConfigured: true,
              maskedKey: data.maskedKey ?? prev.maskedKey,
            }
          : prev,
      );
    } catch (error: any) {
      message.error(error?.response?.data?.error || '更新密钥失败');
    } finally {
      setSavingKey(false);
    }
  };

  const handleImport = async () => {
    if (!Number.isFinite(targetYear) || targetYear < 2000 || targetYear > 2100) {
      message.warning('请输入 2000-2100 之间的年份');
      return;
    }
    setImporting(true);
    try {
      await systemMonitorApi.importHolidayYear({ year: targetYear });
      message.success(`已触发 ${targetYear} 年节假日导入`);
      await fetchStatus();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const columns: ColumnsType<HolidayServiceLogEntry> = useMemo(
    () => [
      {
        title: '时间',
        dataIndex: 'time',
        key: 'time',
        render: (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—'),
      },
      {
        title: '年份',
        dataIndex: 'year',
        key: 'year',
        width: 100,
      },
      {
        title: '来源',
        dataIndex: 'source',
        key: 'source',
        width: 120,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: HolidayServiceLogEntry['status']) => <Tag color={statusColorMap[value]}>{value}</Tag>,
      },
      {
        title: '记录数',
        dataIndex: 'records',
        key: 'records',
        width: 120,
      },
      {
        title: '备注 / 警告',
        dataIndex: 'message',
        key: 'message',
        ellipsis: true,
        render: (value?: string | null) => value || '—',
      },
    ],
    [],
  );

  const coverageDescription = useMemo(() => {
    if (!status) {
      return '暂无数据';
    }
    if (!status.coverage.minDate || !status.coverage.maxDate) {
      return '数据库尚未导入节假日数据';
    }
    return `${status.coverage.minDate} 至 ${status.coverage.maxDate}`;
  }, [status]);

  return (
    <Spin spinning={loading} tip="加载中...">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {!status?.keyConfigured && (
          <Alert
            type="warning"
            message="尚未配置天行API密钥，无法从官方来源获取节假日数据"
            showIcon
          />
        )}

        <Card
          title="天行API密钥"
          extra={
            <Space>
              <Text type={status?.keyConfigured ? 'success' : 'danger'}>
                {status?.keyConfigured ? `当前密钥：${status?.maskedKey ?? '已配置'}` : '未配置'}
              </Text>
              <Button icon={<ReloadOutlined />} type="text" onClick={fetchStatus} />
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Input.Password
              placeholder="请输入新的天行API密钥"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              prefix={<KeyOutlined />}
            />
            <Button type="primary" onClick={handleSaveKey} loading={savingKey} disabled={!apiKey.trim()}>
              保存密钥
            </Button>
            <Text type="secondary">密钥保存在后端数据库，仅用于节假日同步，不会暴露在前端日志中。</Text>
          </Space>
        </Card>

        <Row gutter={24}>
          <Col span={12}>
            <Card title="服务状态" extra={<Button icon={<ReloadOutlined />} onClick={fetchStatus}>刷新</Button>}>
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="最近成功时间"
                    value={status?.lastSuccessTime ? dayjs(status.lastSuccessTime).format('MM-DD HH:mm') : '—'}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="最近失败时间"
                    value={status?.lastFailureTime ? dayjs(status.lastFailureTime).format('MM-DD HH:mm') : '—'}
                  />
                </Col>
              </Row>
              <Descriptions column={1} style={{ marginTop: 16 }} size="small" bordered>
                <Descriptions.Item label="覆盖区间">{coverageDescription}</Descriptions.Item>
                <Descriptions.Item label="已导入年份">
                  <Space wrap>
                    {status?.coverage.years?.length
                      ? status.coverage.years.map((year) => <Tag key={year}>{year}</Tag>)
                      : '—'}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="手动导入">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space>
                  <InputNumber
                    value={targetYear}
                    min={2000}
                    max={2100}
                    onChange={(value) => setTargetYear(value ?? dayjs().year())}
                  />
                  <Button
                    type="primary"
                    icon={<CloudDownloadOutlined />}
                    onClick={handleImport}
                    loading={importing}
                  >
                    立即导入
                  </Button>
                </Space>
                <Text type="secondary">导入完成后会更新工作日历并记录到日志。</Text>
              </Space>
            </Card>
          </Col>
        </Row>

        <Card title="最近更新日志">
          <Table
            rowKey="id"
            dataSource={status?.recentLogs || []}
            columns={columns}
            pagination={{ pageSize: 8 }}
          />
        </Card>
      </Space>
    </Spin>
  );
};

export default SystemMonitorPage;
