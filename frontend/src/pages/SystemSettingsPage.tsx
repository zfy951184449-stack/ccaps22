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
  Form,
  Switch,
  Modal,
  Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  KeyOutlined,
  CloudDownloadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  CloudSyncOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { systemSettingsApi, databaseApi, BackupInfo, BackupStatusResponse } from '../services/api';
import { HolidayServiceLogEntry, HolidayServiceStatus, SchedulingSettings } from '../types';

const { Text } = Typography;

const statusColorMap: Record<HolidayServiceLogEntry['status'], string> = {
  SUCCESS: 'success',
  PARTIAL: 'warning',
  FAILED: 'error',
};

type ConstraintRow = {
  key: string;
  name: string;
  category: string;
  status: string;
  detail: React.ReactNode;
};

const MAX_CONSECUTIVE_WORKDAYS = 6;

const SystemSettingsPage: React.FC = () => {
  const [status, setStatus] = useState<HolidayServiceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [targetYear, setTargetYear] = useState<number>(dayjs().year());
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configForm] = Form.useForm<SchedulingSettings>();
  const watchedConfig = Form.useWatch([], configForm) as SchedulingSettings | undefined;
  const configOverview = watchedConfig || configForm.getFieldsValue();

  // Database backup states
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // DB Config State
  const [dbConfig, setDbConfig] = useState<{ mode: 'cloud' | 'local'; host: string } | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [switchingDb, setSwitchingDb] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await systemSettingsApi.getHolidayStatus();
      setStatus(response);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '无法获取节假日服务状态');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSchedulingSettings = useCallback(async () => {
    setConfigLoading(true);
    try {
      const response = await systemSettingsApi.getSchedulingSettings();
      configForm.setFieldsValue(response);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '无法获取排班参数');
    } finally {
      setConfigLoading(false);
    }
  }, [configForm]);

  const loadBackupStatus = useCallback(async () => {
    setBackupLoading(true);
    try {
      const response = await databaseApi.getBackupStatus();
      setBackupStatus(response);
    } catch (error: any) {
      console.error('Failed to load backup status:', error);
    } finally {
      setBackupLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    loadSchedulingSettings();
    loadBackupStatus();
    loadDbConfig();
  }, [fetchStatus, loadSchedulingSettings, loadBackupStatus]);

  const loadDbConfig = async () => {
    setDbLoading(true);
    try {
      const data = await systemSettingsApi.getDbConfig();
      setDbConfig(data);
    } catch (e) {
      console.error(e);
      // message.error('无法获取数据库配置'); // Silent fail/retry better?
    } finally {
      setDbLoading(false);
    }
  };

  const handleSwitchDb = async (checked: boolean) => {
    const newMode = checked ? 'cloud' : 'local';
    const label = newMode === 'cloud' ? '云端 (Cloud)' : '本地 (Local)';

    Modal.confirm({
      title: '切换数据库环境',
      icon: <ExclamationCircleOutlined />,
      content: `确定要切换到 ${label} 吗？后端服务将自动重启，界面将在几秒后刷新。`,
      onOk: async () => {
        setSwitchingDb(true);
        try {
          await systemSettingsApi.updateDbConfig(newMode);
          message.info('服务正在重启，请稍候...');

          // Poll for recovery
          let retries = 0;
          const poll = setInterval(async () => {
            retries++;
            try {
              await systemSettingsApi.getDbConfig(); // Simple ping
              clearInterval(poll);
              message.success('连接已恢复');
              window.location.reload();
            } catch (e) {
              if (retries > 20) {
                clearInterval(poll);
                message.error('重连超时，请手动刷新页面');
                setSwitchingDb(false);
              }
            }
          }, 2000);

        } catch (error: any) {
          message.error(error.message || '切换失败');
          setSwitchingDb(false);
        }
      }
    });
  };

  const handleSyncDb = async (direction: 'up' | 'down') => {
    const label = direction === 'up' ? '本地 -> 云端 (覆盖)' : '云端 -> 本地 (覆盖)';
    const confirmMsg = direction === 'up'
      ? '确定要将本地数据库上传并覆盖云端吗？此操作不可逆！'
      : '确定要将云端数据库下载并覆盖本地吗？您的本地未保存更改将丢失。';

    const executeSync = async (force: boolean) => {
      setSyncing(true);
      try {
        const res = await systemSettingsApi.syncDb({ direction, force });
        message.success(res.message);
        // Refresh config just in case
        loadDbConfig();
      } catch (error: any) {
        if (error.response?.status === 409) {
          // Timestamp conflict
          const { sourceTime, targetTime } = error.response.data;
          Modal.confirm({
            title: '存在数据冲突',
            icon: <ExclamationCircleOutlined style={{ color: 'red' }} />,
            width: 500,
            content: (
              <div>
                <p>目标数据库似乎比源数据库更新！</p>
                <p><strong>源数据时间:</strong> {sourceTime}</p>
                <p><strong>目标数据时间:</strong> {targetTime}</p>
                <p style={{ color: 'red', marginTop: 10 }}>强制覆盖可能会导致新数据丢失。是否仍要继续？</p>
              </div>
            ),
            okText: '强制覆盖',
            okType: 'danger',
            onOk: () => executeSync(true) // Recursive call with force
          });
        } else {
          message.error(error.response?.data?.error || '同步失败');
        }
      } finally {
        setSyncing(false);
      }
    };

    Modal.confirm({
      title: `确认${label}`,
      icon: <ExclamationCircleOutlined />,
      content: confirmMsg,
      okType: 'danger',
      onOk: () => executeSync(false)
    });
  };

  const handleExportDatabase = async () => {
    setExporting(true);
    try {
      const result = await databaseApi.exportDatabase();
      message.success(`数据库已导出到 ${result.backup.filename} (${result.backup.sizeFormatted})`);
      await loadBackupStatus();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '导出数据库失败');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      message.warning('请输入有效密钥');
      return;
    }
    setSavingKey(true);
    try {
      const data = await systemSettingsApi.updateHolidayKey({ apiKey: apiKey.trim() });
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
      await systemSettingsApi.importHolidayYear({ year: targetYear });
      message.success(`已触发 ${targetYear} 年节假日导入`);
      await fetchStatus();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveSchedulingSettings = async () => {
    try {
      const values = await configForm.validateFields();
      setSavingConfig(true);
      await systemSettingsApi.updateSchedulingSettings(values as SchedulingSettings);
      message.success('排班参数已保存');
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      message.error(error?.response?.data?.error || '保存排班参数失败');
    } finally {
      setSavingConfig(false);
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

  const constraintColumns: ColumnsType<ConstraintRow> = useMemo(
    () => [
      { title: '约束项', dataIndex: 'name', key: 'name', width: 200 },
      { title: '类型', dataIndex: 'category', key: 'category', width: 120 },
      { title: '当前状态', dataIndex: 'status', key: 'status', width: 220 },
      { title: '说明', dataIndex: 'detail', key: 'detail' },
    ],
    [],
  );

  const constraintData: ConstraintRow[] = useMemo(() => {
    const tolerance = configOverview?.monthlyToleranceHours ?? '—';
    const nightPreferred = configOverview?.nightShiftPreferredRestDays ?? '—';
    const nightMinimum = configOverview?.nightShiftMinimumRestDays ?? '—';
    const tripleStrategy = configOverview?.minimizeTripleHolidayHeadcount ?? false;
    const tripleWeight = configOverview?.tripleHolidayPenaltyWeight ?? 0;
    const preferFrontline = configOverview?.preferFrontlineEmployees ?? false;
    const enforceMonthly = configOverview?.enforceMonthlyHours ?? true;
    const enforceNightRest = configOverview?.enforceNightRest ?? true;
    const enforceConsecutive = configOverview?.enforceConsecutiveLimit ?? true;
    const enforceQuarter = configOverview?.enforceQuarterHours ?? true;
    const enableWorkshopFairness = configOverview?.enableWorkshopFairness ?? false;
    const workshopTolerance = configOverview?.workshopFairnessToleranceHours ?? 0;
    const workshopWeight = configOverview?.workshopFairnessWeight ?? 0;

    return [
      {
        key: 'qualification',
        name: '资质匹配',
        category: '硬约束',
        status: '始终启用',
        detail: '员工必须满足操作设定的资质/等级，高等级可向下兼容但不能缺项。',
      },
      {
        key: 'locking',
        name: '锁定班次与操作',
        category: '硬约束',
        status: '锁定即生效',
        detail: '批次或人员界面锁定的班次/操作会被注入虚拟任务，求解器必须遵守。',
      },
      {
        key: 'timeOverlap',
        name: '时间冲突 & 共享',
        category: '硬约束',
        status: '始终启用',
        detail: '同一员工不可在重叠时间执行多操作；共享组成员必须出现在锚定操作中以满足共享需求。',
      },
      {
        key: 'monthlyHours',
        name: '月度工时控制',
        category: '硬约束',
        status: enforceMonthly ? `标准±${tolerance} 小时` : '已关闭',
        detail: '控制月度排班工时是否落在标准工时±容差范围内。',
      },
      {
        key: 'nightRest',
        name: '夜班休息',
        category: '硬约束',
        status: enforceNightRest ? `${nightPreferred} 天优选 / ${nightMinimum} 天最少` : '已关闭',
        detail: '控制夜班后在指定天数内不得再次排班。',
      },
      {
        key: 'consecutiveDays',
        name: '连续工作上限',
        category: '硬约束',
        status: enforceConsecutive ? `≤ ${MAX_CONSECUTIVE_WORKDAYS} 天` : '已关闭',
        detail: `限制员工连续排班不得超过 ${MAX_CONSECUTIVE_WORKDAYS} 天。`,
      },
      {
        key: 'tripleHoliday',
        name: '三倍节假日最少用工',
        category: '策略约束',
        status: tripleStrategy ? `已启用 (权重 ${tripleWeight})` : '已关闭',
        detail: '启用后，节假日会尽量用共享策略压缩排班人数，仅保留满足产能的最小人力。',
      },
      {
        key: 'frontline',
        name: '一线优先',
        category: '优化目标',
        status: preferFrontline ? '优先使用一线' : '允许管理层同权',
        detail: '开启时，仅在一线人手不足或不满足资质时才会调度管理层参与操作。',
      },
      {
        key: 'quarterHours',
        name: '季度工时下限',
        category: '硬约束',
        status: enforceQuarter ? '已启用' : '已关闭',
        detail: '确保季度累计排班工时达到标准工时；不足则判定为排班失败。',
      },
      {
        key: 'workshopFairness',
        name: '车间工时公平',
        category: '优化目标',
        status: enableWorkshopFairness
          ? `目标：离散最小 (容差 ${workshopTolerance}h, 权重 ${workshopWeight})`
          : '已关闭',
        detail: '同层级员工的月度车间工时将通过离散度约束/惩罚保持尽量平均。',
      },
    ];
  }, [configOverview]);

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

        {/* Database Config Card */}
        <Card
          title="数据库环境配置"
          extra={
            <Space>
              <Tag color={dbConfig?.mode === 'cloud' ? 'green' : 'blue'}>
                {dbConfig?.mode === 'cloud' ? '当前: 阿里云 (Cloud)' : '当前: 本地 (Local)'}
              </Tag>
              <Button icon={<ReloadOutlined />} onClick={loadDbConfig} loading={dbLoading} />
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Row gutter={24} align="middle">
              <Col span={12}>
                <Space>
                  <Text strong>环境切换:</Text>
                  <Switch
                    checked={dbConfig?.mode === 'cloud'}
                    checkedChildren="Cloud"
                    unCheckedChildren="Local"
                    onChange={handleSwitchDb}
                    loading={switchingDb || dbLoading}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    (切换将重启后端服务)
                  </Text>
                </Space>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">Host: {dbConfig?.host}</Text>
                </div>
              </Col>
              <Col span={12}>
                <Card size="small" title="数据同步 (Sync)" type="inner">
                  <Space split="|">
                    <Button
                      type="dashed"
                      icon={<CloudUploadOutlined />}
                      onClick={() => handleSyncDb('up')}
                      disabled={syncing}
                    >
                      同步至云端 (Loc → Cloud)
                    </Button>
                    <Button
                      type="dashed"
                      icon={<CloudDownloadOutlined />}
                      onClick={() => handleSyncDb('down')}
                      disabled={syncing}
                    >
                      同步至本地 (Cloud → Loc)
                    </Button>
                  </Space>
                  {syncing && <Spin size="small" style={{ marginLeft: 10 }} />}
                </Card>
              </Col>
            </Row>
          </Space>
        </Card>

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

        <Card
          title={
            <Space>
              <DatabaseOutlined />
              数据库备份
            </Space>
          }
          extra={
            <Button icon={<ReloadOutlined />} onClick={loadBackupStatus} loading={backupLoading}>
              刷新
            </Button>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="最新备份">
                {backupStatus?.latestBackup ? (
                  <Space>
                    <Text code>{backupStatus.latestBackup.filename}</Text>
                    <Text type="secondary">({backupStatus.latestBackup.sizeFormatted})</Text>
                  </Space>
                ) : (
                  <Text type="secondary">暂无备份</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="备份时间">
                {backupStatus?.latestBackup
                  ? dayjs(backupStatus.latestBackup.createdAt).format('YYYY-MM-DD HH:mm:ss')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="备份数量">
                {backupStatus?.totalBackups ?? 0} 个
              </Descriptions.Item>
              <Descriptions.Item label="备份目录">
                <Text code style={{ fontSize: 12 }}>
                  {backupStatus?.backupDir ?? 'database/backups/'}
                </Text>
              </Descriptions.Item>
            </Descriptions>
            <Space>
              <Button
                type="primary"
                icon={<DatabaseOutlined />}
                onClick={handleExportDatabase}
                loading={exporting}
              >
                立即导出
              </Button>
              <Text type="secondary">备份文件将保存到项目的 database/backups/ 目录，可通过 Git 同步到其他设备。</Text>
            </Space>
          </Space>
        </Card>

        <Card
          title="排班参数设置"
          extra={
            <Button icon={<ReloadOutlined />} onClick={loadSchedulingSettings} disabled={configLoading}>
              刷新
            </Button>
          }
        >
          <Spin spinning={configLoading}>
            <Form
              layout="vertical"
              form={configForm}
              initialValues={{
                monthlyToleranceHours: 16,
                nightShiftPreferredRestDays: 2,
                nightShiftMinimumRestDays: 1,
                minimizeTripleHolidayHeadcount: true,
                tripleHolidayPenaltyWeight: 10,
                preferFrontlineEmployees: true,
                enforceMonthlyHours: true,
                enforceNightRest: true,
                enforceConsecutiveLimit: true,
                enforceQuarterHours: true,
                enableWorkshopFairness: false,
                workshopFairnessToleranceHours: 8,
                workshopFairnessWeight: 1,
              }}
            >
              <Row gutter={24}>
                <Col xs={24} md={8}>
                  <Form.Item
                    label="月度工时容差 (小时)"
                    name="monthlyToleranceHours"
                    rules={[
                      { required: true, message: '请输入月度容差' },
                      { type: 'number', min: 0, max: 80, message: '范围 0~80 小时' },
                    ]}
                  >
                    <InputNumber min={0} max={80} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    label="夜班优选休息天数"
                    name="nightShiftPreferredRestDays"
                    rules={[
                      { required: true, message: '请输入优选休息天数' },
                      { type: 'number', min: 1, max: 7, message: '范围 1~7 天' },
                    ]}
                  >
                    <InputNumber min={1} max={7} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    label="夜班最少休息天数"
                    name="nightShiftMinimumRestDays"
                    dependencies={['nightShiftPreferredRestDays']}
                    rules={[
                      { required: true, message: '请输入最少休息天数' },
                      { type: 'number', min: 0, max: 7, message: '范围 0~7 天' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const preferred = getFieldValue('nightShiftPreferredRestDays');
                          if (value === undefined || preferred === undefined) {
                            return Promise.resolve();
                          }
                          if (value <= preferred) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('最少休息天数不能大于优选休息天数'));
                        },
                      }),
                    ]}
                  >
                    <InputNumber min={0} max={7} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="minimizeTripleHolidayHeadcount"
                label="三倍工资节假日优先安排最少人数"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Text type="secondary">
                启用后，求解器会在三倍工资节假日中尽量使用最少员工完成所有操作，除非资质或时段限制导致无法共享。
              </Text>
              <Form.Item
                name="tripleHolidayPenaltyWeight"
                label="三倍工资日权重"
                rules={[{ type: 'number', min: 0, message: '权重必须 ≥ 0' }]}
              >
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Text type="secondary">
                权重越高，节假日排班越倾向于由同一批员工承担，减少用工人数。
              </Text>

              <Form.Item
                name="preferFrontlineEmployees"
                label="优先安排一线员工"
                valuePropName="checked"
                style={{ marginTop: 16 }}
              >
                <Switch />
              </Form.Item>
              <Text type="secondary">
                开启后，符合资质的一线员工将优先被分配；仅当一线人手不足或不满足硬约束时，才会启用管理层补位。
              </Text>

              <Row gutter={24} style={{ marginTop: 24 }}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="enforceMonthlyHours"
                    label="启用月度工时约束"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Text type="secondary">
                    关闭后，月度工时将不再校验标准±容差。
                  </Text>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="enforceNightRest"
                    label="启用夜班休息约束"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Text type="secondary">
                    关闭后，夜班后的优选/最少休息限制不再生效。
                  </Text>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="enforceConsecutiveLimit"
                    label="启用连续工作上限"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Text type="secondary">
                    关闭后，系统不会阻止 7 天及以上的连续排班。
                  </Text>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="enforceQuarterHours"
                    label="启用季度工时约束"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Text type="secondary">
                    关闭后，季度累计工时不再检查是否达到标准值。
                  </Text>
                </Col>
              </Row>

              <Row gutter={24} style={{ marginTop: 24 }}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="enableWorkshopFairness"
                    label="启用车间工时公平"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Text type="secondary">
                    开启后，求解器会在同层级员工之间平衡月度车间工时，减少离散程度。
                  </Text>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="workshopFairnessToleranceHours"
                    label="公平容差 (小时)"
                    rules={[{ type: 'number', min: 0, message: '容差必须 ≥ 0' }]}
                  >
                    <InputNumber min={0} precision={1} style={{ width: '100%' }} />
                  </Form.Item>
                  <Text type="secondary">
                    设置为 0 表示仅作为软约束，不强制限制最大差值。
                  </Text>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="workshopFairnessWeight"
                    label="公平权重"
                    rules={[{ type: 'number', min: 0, message: '权重必须 ≥ 0' }]}
                  >
                    <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Text type="secondary">
                    权重越大，求解器越倾向于让同层级工时更平均。
                  </Text>
                </Col>
              </Row>

              <div style={{ marginTop: 16 }}>
                <Button type="primary" onClick={handleSaveSchedulingSettings} loading={savingConfig}>
                  保存排班参数
                </Button>
              </div>
            </Form>
          </Spin>
        </Card>

        <Card title="约束参数概览" bordered={false}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="月度工时容差 (h)">
              {configOverview?.monthlyToleranceHours ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="夜班优选休息 (天)">
              {configOverview?.nightShiftPreferredRestDays ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="夜班最少休息 (天)">
              {configOverview?.nightShiftMinimumRestDays ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="三倍工资日策略">
              {configOverview?.minimizeTripleHolidayHeadcount ? '最少人数优先' : '使用常规策略'}
              {configOverview?.minimizeTripleHolidayHeadcount && (
                <Text type="secondary">（权重 {configOverview?.tripleHolidayPenaltyWeight ?? 0}）</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="一线优先策略">
              {configOverview?.preferFrontlineEmployees ? '启用' : '关闭'}
            </Descriptions.Item>
            <Descriptions.Item label="月度工时约束">
              {configOverview?.enforceMonthlyHours ? '启用' : '关闭'}
            </Descriptions.Item>
            <Descriptions.Item label="夜班休息约束">
              {configOverview?.enforceNightRest ? '启用' : '关闭'}
            </Descriptions.Item>
            <Descriptions.Item label="连续上限约束">
              {configOverview?.enforceConsecutiveLimit ? '启用' : '关闭'}
            </Descriptions.Item>
            <Descriptions.Item label="季度工时约束">
              {configOverview?.enforceQuarterHours ? '启用' : '关闭'}
            </Descriptions.Item>
            <Descriptions.Item label="车间工时公平">
              {configOverview?.enableWorkshopFairness ? '启用' : '关闭'}
            </Descriptions.Item>
          </Descriptions>
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message="提示"
            description="该概览反映当前求解器读取的全局约束参数，修改并保存后会立即作用于新的自动排班任务。"
          />
        </Card>

        <Card title="求解器约束详情" style={{ marginBottom: 24 }}>
          <Table
            rowKey="key"
            columns={constraintColumns}
            dataSource={constraintData}
            pagination={false}
          />
        </Card>

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

export default SystemSettingsPage;
