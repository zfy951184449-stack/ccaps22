import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Input,
  Select,
  Button,
  Tooltip,
  Statistic,
  Row,
  Col,
  Progress,
  message,
  Switch,
  Badge,
  Typography,
  Popover,
  Segmented,
  Popconfirm,
  Spin
} from 'antd';
import { 
  SearchOutlined, 
  DownloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { employeeQualificationApi } from '../services/api';

const { Text } = Typography;
const { Option } = Select;

interface Employee {
  id: number;
  employee_code: string;
  employee_name: string;
  department: string;
  position: string;
}

interface Qualification {
  id: number;
  qualification_name: string;
}

interface MatrixData {
  id: number;
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
  employee_name: string;
  employee_code: string;
  qualification_name: string;
}

interface MatrixResponse {
  employees: Employee[];
  qualifications: Qualification[];
  matrix: MatrixData[];
}

interface Statistics {
  totalStats: {
    total_employees: number;
    total_qualifications: number;
    total_assignments: number;
    avg_level: number;
  };
  levelDistribution: Array<{
    qualification_level: number;
    count: number;
  }>;
  qualificationCoverage: Array<{
    id: number;
    qualification_name: string;
    assigned_count: number;
    total_employees: number;
    coverage_percentage: number;
  }>;
  employeeCompleteness: Array<{
    id: number;
    employee_name: string;
    employee_code: string;
    assigned_qualifications: number;
    total_qualifications: number;
    completeness_percentage: number;
  }>;
}

const QualificationMatrix: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixData[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [searchText, setSearchText] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<number | undefined>();
  const [showEmptyRows, setShowEmptyRows] = useState(true);
  const [compactView, setCompactView] = useState(false);
  const [editingCell, setEditingCell] = useState<{ employeeId: number; qualificationId: number } | null>(null);
  const [pendingLevel, setPendingLevel] = useState<number>(3);
  const [cellLoading, setCellLoading] = useState(false);

  const matrixMap = useMemo(() => {
    const map = new Map<string, MatrixData>();
    matrixData.forEach((item) => {
      const key = `${item.employee_id}-${item.qualification_id}`;
      map.set(key, item);
    });
    return map;
  }, [matrixData]);

  const fetchMatrixData = async () => {
    setLoading(true);
    try {
      const [matrixResponse, statsResponse] = await Promise.all([
        axios.get<MatrixResponse>('/api/qualification-matrix'),
        axios.get<Statistics>('/api/qualification-matrix/statistics')
      ]);
      
      setEmployees(matrixResponse.data.employees);
      setQualifications(matrixResponse.data.qualifications);
      setMatrixData(matrixResponse.data.matrix);
      setStatistics(statsResponse.data);
    } catch (error) {
      message.error('获取资质矩阵数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrixData();
  }, []);

  const getMatrixItem = (employeeId: number, qualificationId: number): MatrixData | null => {
    const key = `${employeeId}-${qualificationId}`;
    return matrixMap.get(key) || null;
  };

  const getLevelColor = (level: number | null): string => {
    if (level === null) return 'default';
    const colors = ['', 'red', 'orange', 'gold', 'green', 'blue'];
    return colors[level] || 'default';
  };

  const getLevelIcon = (level: number | null) => {
    if (level === null) return <CloseCircleOutlined />;
    return level >= 4 ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />;
  };

  const getEmployeeCompleteness = (employeeId: number): number => {
    if (!statistics) return 0;
    const employee = statistics.employeeCompleteness.find(emp => emp.id === employeeId);
    return employee ? Number(employee.completeness_percentage) || 0 : 0;
  };

  const getQualificationCoverage = (qualificationId: number): number => {
    if (!statistics) return 0;
    const qualification = statistics.qualificationCoverage.find(qual => qual.id === qualificationId);
    return qualification ? Number(qualification.coverage_percentage) || 0 : 0;
  };

  // 过滤员工数据
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = !searchText || 
      employee.employee_name.toLowerCase().includes(searchText.toLowerCase()) ||
      employee.employee_code.toLowerCase().includes(searchText.toLowerCase());
    
    const matchesDepartment = !departmentFilter || employee.department === departmentFilter;
    
    if (!showEmptyRows) {
      const hasQualifications = matrixData.some(item => item.employee_id === employee.id);
      if (!hasQualifications) return false;
    }
    
    return matchesSearch && matchesDepartment;
  });

  // 获取部门列表
  const departments = Array.from(new Set(employees.map(emp => emp.department).filter(Boolean)));

  // 过滤资质数据
  const filteredQualifications = qualifications.filter(qualification => {
    if (levelFilter) {
      // 如果有等级过滤，检查是否有员工在此资质上达到该等级
      const hasLevel = matrixData.some(
        item => item.qualification_id === qualification.id && item.qualification_level === levelFilter
      );
      return hasLevel;
    }
    return true;
  });

  // 创建矩阵表格列 - 员工作为列头
  const columns = [
    {
      title: '资质信息',
      dataIndex: 'qualification_info',
      key: 'qualification_info',
      width: 200,
      fixed: 'left' as const,
      render: (_: any, qualification: Qualification) => {
        const coverage = getQualificationCoverage(qualification.id);
        return (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
              {qualification.qualification_name}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>
              资质ID: {qualification.id}
            </div>
            <Progress 
              percent={coverage} 
              size="small" 
              status={coverage > 80 ? 'success' : coverage > 50 ? 'normal' : 'exception'}
              format={(percent) => `${percent}%`}
            />
          </div>
        );
      },
    },
    ...filteredEmployees.map(employee => ({
      title: (
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            writingMode: 'vertical-lr' as const, 
            textOrientation: 'mixed',
            height: '120px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            lineHeight: 1.2
          }}>
            {employee.employee_name}
          </div>
          <div style={{ fontSize: '10px', color: '#666', marginTop: 4 }}>
            {employee.employee_code}
          </div>
          <div style={{ fontSize: '10px', color: '#666' }}>
            {Math.round(getEmployeeCompleteness(employee.id))}%
          </div>
        </div>
      ),
      dataIndex: `employee_${employee.id}`,
      key: `employee_${employee.id}`,
      width: compactView ? 60 : 80,
      align: 'center' as const,
      render: (_: any, qualification: Qualification) => {
        const matrixItem = getMatrixItem(employee.id, qualification.id);
        const level = matrixItem?.qualification_level ?? null;
        const isActiveCell =
          editingCell?.employeeId === employee.id && editingCell?.qualificationId === qualification.id;

        const handleOpenEditor = () => {
          setEditingCell({ employeeId: employee.id, qualificationId: qualification.id });
          setPendingLevel(level ?? 3);
        };

        const handleCloseEditor = () => {
          setEditingCell((current) =>
            current && current.employeeId === employee.id && current.qualificationId === qualification.id
              ? null
              : current,
          );
          setPendingLevel(3);
        };

        const handleCreate = async () => {
          if (cellLoading) return;
          setCellLoading(true);
          try {
            const response = await employeeQualificationApi.create({
              employee_id: employee.id,
              qualification_id: qualification.id,
              qualification_level: pendingLevel,
            });
            const newItem = response.data as MatrixData;
            setMatrixData((prev) => [...prev, newItem]);
            if (statistics) {
              fetchMatrixData();
            }
            message.success('资质已添加');
            handleCloseEditor();
          } catch (error: any) {
            const errMsg = error?.response?.data?.error || '添加资质失败';
            message.error(errMsg);
          } finally {
            setCellLoading(false);
          }
        };

        const resolveMatrixRecord = async (): Promise<MatrixData | null> => {
          const current = getMatrixItem(employee.id, qualification.id);
          if (current?.id) {
            return current;
          }

          try {
            const response = await employeeQualificationApi.getByEmployeeId(employee.id);
            const fallback = (response.data || []).find(
              (item) => item.qualification_id === qualification.id,
            );

            if (fallback && fallback.id) {
              const normalized: MatrixData = {
                id: fallback.id,
                employee_id: fallback.employee_id,
                qualification_id: fallback.qualification_id,
                qualification_level: fallback.qualification_level,
                employee_name: employee.employee_name,
                employee_code: employee.employee_code,
                qualification_name: qualification.qualification_name,
              };

              setMatrixData((prev) => {
                const filtered = prev.filter(
                  (item) => !(item.employee_id === employee.id && item.qualification_id === qualification.id),
                );
                return [...filtered, normalized];
              });
              return normalized;
            }
          } catch (error) {
            console.error('Failed to resolve qualification record', error);
          }

          return null;
        };

        const handleUpdate = async () => {
          if (cellLoading) return;
          const record = await resolveMatrixRecord();
          if (!record) {
            message.error('未找到资质记录');
            return;
          }
          if (record.qualification_level === pendingLevel) {
            message.info('等级未变化');
            return;
          }
          setCellLoading(true);
          try {
            await employeeQualificationApi.update(record.id, {
              employee_id: record.employee_id,
              qualification_id: record.qualification_id,
              qualification_level: pendingLevel,
            });
            setMatrixData((prev) =>
              prev.map((item) =>
                item.employee_id === record.employee_id && item.qualification_id === record.qualification_id
                  ? { ...item, id: record.id, qualification_level: pendingLevel }
                  : item,
              ),
            );
            message.success('资质等级已更新');
            handleCloseEditor();
          } catch (error: any) {
            const errMsg = error?.response?.data?.error || '更新资质失败';
            message.error(errMsg);
          } finally {
            setCellLoading(false);
          }
        };

        const handleDelete = async () => {
          if (cellLoading) return;
          const record = await resolveMatrixRecord();
          if (!record) {
            message.error('未找到资质记录');
            return;
          }
          setCellLoading(true);
          try {
            await employeeQualificationApi.delete(record.id);
            setMatrixData((prev) =>
              prev.filter(
                (item) => !(item.employee_id === record.employee_id && item.qualification_id === record.qualification_id),
              ),
            );
            message.success('已移除资质');
            handleCloseEditor();
          } catch (error: any) {
            const errMsg = error?.response?.data?.error || '移除资质失败';
            message.error(errMsg);
          } finally {
            setCellLoading(false);
          }
        };

        const content = (
          <div style={{ minWidth: 200 }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>
                {employee.employee_name} - {qualification.qualification_name}
              </Text>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Text style={{ marginRight: 8 }}>资质等级</Text>
              <Segmented
                options={[1, 2, 3, 4, 5].map((lvl) => ({ label: `${lvl}级`, value: lvl }))}
                value={pendingLevel}
                onChange={(value) => setPendingLevel(Number(value))}
              />
            </div>
            <Space>
              {matrixItem ? (
                <Button type="primary" onClick={handleUpdate} loading={cellLoading}>
                  保存
                </Button>
              ) : (
                <Button type="primary" onClick={handleCreate} loading={cellLoading}>
                  添加
                </Button>
              )}
              {matrixItem && (
                <Popconfirm
                  title="确认移除资质？"
                  onConfirm={handleDelete}
                  okText="移除"
                  cancelText="取消"
                  disabled={cellLoading}
                >
                  <Button danger loading={cellLoading} disabled={cellLoading}>
                    移除
                  </Button>
                </Popconfirm>
              )}
              <Button onClick={handleCloseEditor}>取消</Button>
            </Space>
          </div>
        );

        if (level === null) {
          return (
            <Popover
              content={content}
              trigger="click"
              open={isActiveCell}
              onOpenChange={(visible) => {
                if (visible) {
                  handleOpenEditor();
                } else {
                  handleCloseEditor();
                }
              }}
            >
              <Tooltip title={`${employee.employee_name} 未获得 ${qualification.qualification_name} 资质`}>
                <div
                  style={{
                    width: '100%',
                    height: compactView ? '30px' : '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                    border: '1px dashed #d9d9d9',
                    cursor: 'pointer',
                  }}
                >
                  <CloseCircleOutlined style={{ color: '#ccc' }} />
                </div>
              </Tooltip>
            </Popover>
          );
        }

        return (
          <Popover
            content={content}
            trigger="click"
            open={isActiveCell}
            onOpenChange={(visible) => {
              if (visible) {
                handleOpenEditor();
              } else {
                handleCloseEditor();
              }
            }}
          >
            <Tooltip title={`${employee.employee_name} - ${qualification.qualification_name}: ${level}级`}>
              <Spin spinning={isActiveCell && cellLoading} size="small">
                <Badge count={level} size="small">
                  <div
                    style={{
                      width: '100%',
                      height: compactView ? '30px' : '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor:
                        getLevelColor(level) === 'default' ? '#f0f0f0' : 'rgba(24, 144, 255, 0.1)',
                      borderRadius: '4px',
                      border: `2px solid ${
                        getLevelColor(level) === 'default' ? '#d9d9d9' : '#1890ff'
                      }`,
                      cursor: 'pointer',
                    }}
                  >
                    <Tag
                      color={getLevelColor(level)}
                      icon={getLevelIcon(level)}
                      style={{ margin: 0, fontSize: compactView ? '10px' : '12px' }}
                    >
                      {level}
                    </Tag>
                  </div>
                </Badge>
              </Spin>
            </Tooltip>
          </Popover>
        );
      },
    })),
  ];

  return (
    <div style={{ padding: '0' }}>
      {/* 统计信息卡片 */}
      {statistics && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="总员工数"
                value={statistics.totalStats.total_employees}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="总资质数"
                value={statistics.totalStats.total_qualifications}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="资质分配数"
                value={statistics.totalStats.total_assignments}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="平均等级"
                value={Number(statistics.totalStats.avg_level || 0).toFixed(1)}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 过滤控制面板 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Input
              placeholder="搜索员工姓名或工号"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Select
              placeholder="选择部门"
              style={{ width: '100%' }}
              value={departmentFilter}
              onChange={setDepartmentFilter}
              allowClear
            >
              {departments.map(dept => (
                <Option key={dept} value={dept}>{dept}</Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="资质等级"
              style={{ width: '100%' }}
              value={levelFilter}
              onChange={setLevelFilter}
              allowClear
            >
              {[1, 2, 3, 4, 5].map(level => (
                <Option key={level} value={level}>{level}级</Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Space>
              <Text style={{ fontSize: '12px' }}>显示空行</Text>
              <Switch
                size="small"
                checked={showEmptyRows}
                onChange={setShowEmptyRows}
                checkedChildren={<EyeOutlined />}
                unCheckedChildren={<EyeInvisibleOutlined />}
              />
            </Space>
          </Col>
          <Col span={4}>
            <Space>
              <Text style={{ fontSize: '12px' }}>紧凑视图</Text>
              <Switch
                size="small"
                checked={compactView}
                onChange={setCompactView}
              />
            </Space>
          </Col>
          <Col span={2}>
            <Button 
              icon={<DownloadOutlined />} 
              size="small"
              onClick={() => message.info('导出功能开发中')}
            >
              导出
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 矩阵表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredQualifications}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 项资质`,
            pageSize: 20,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 300 + filteredEmployees.length * (compactView ? 60 : 80), y: 600 }}
          size={compactView ? 'small' : 'middle'}
          bordered
        />
      </Card>
    </div>
  );
};

export default QualificationMatrix;
