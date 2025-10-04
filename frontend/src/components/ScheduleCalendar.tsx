import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Badge, 
  Select, 
  Button, 
  Space, 
  Modal, 
  Form, 
  DatePicker,
  message,
  Card,
  Tag,
  Tooltip,
  Input
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { PersonnelSchedule, Employee, ShiftType } from '../types';
import dayjs, { Dayjs } from 'dayjs';

const { Option } = Select;

const ScheduleCalendar: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [schedules, setSchedules] = useState<PersonnelSchedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [form] = Form.useForm();

  // 获取指定日期的排班数据
  const getSchedulesForDate = (date: Dayjs): PersonnelSchedule[] => {
    const dateStr = date.format('YYYY-MM-DD');
    return schedules.filter(schedule => 
      schedule.schedule_date === dateStr &&
      (selectedEmployee ? schedule.employee_id === selectedEmployee : true)
    );
  };

  // 渲染日历单元格内容
  const dateCellRender = (date: Dayjs) => {
    const daySchedules = getSchedulesForDate(date);
    
    return (
      <div style={{ fontSize: '12px' }}>
        {daySchedules.map(schedule => (
          <div key={schedule.id} style={{ marginBottom: '2px' }}>
            <Tooltip 
              title={`${schedule.employee_name} - ${schedule.shift_name} (${schedule.start_time}-${schedule.end_time})`}
            >
              <Tag 
                color={getStatusColor(schedule.status)}
                style={{ fontSize: '10px', margin: '1px 0' }}
              >
                {schedule.employee_name?.substring(0, 3)} - {schedule.shift_name?.substring(0, 2)}
              </Tag>
            </Tooltip>
          </div>
        ))}
        {daySchedules.length > 3 && (
          <div style={{ color: '#666', fontSize: '10px' }}>
            +{daySchedules.length - 3}更多...
          </div>
        )}
      </div>
    );
  };

  // 获取状态对应的颜色
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'SCHEDULED': return 'blue';
      case 'CONFIRMED': return 'green';
      case 'IN_PROGRESS': return 'orange';
      case 'COMPLETED': return 'purple';
      case 'CANCELLED': return 'red';
      default: return 'default';
    }
  };

  // 处理日期选择
  const onDateSelect = (date: Dayjs) => {
    setSelectedDate(date);
    // 可以在这里加载该日期的详细排班信息
  };

  // 处理新增排班
  const handleAddSchedule = () => {
    form.resetFields();
    form.setFieldsValue({
      schedule_date: selectedDate,
    });
    setModalVisible(true);
  };

  // 处理模态框确认
  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      // TODO: 实现排班创建功能
      message.success('排班创建成功（占位符）');
      setModalVisible(false);
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  // 处理模态框取消
  const handleModalCancel = () => {
    setModalVisible(false);
    form.resetFields();
  };

  // TODO: 从API加载数据
  useEffect(() => {
    // TODO: 加载员工数据
    // setEmployees([]);
    
    // TODO: 加载班次类型数据  
    // setShiftTypes([]);
    
    // TODO: 加载排班数据
    // setSchedules([]);
  }, []);

  return (
    <div>
      {/* 工具栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="选择员工（可选）"
            style={{ width: 200 }}
            allowClear
            value={selectedEmployee}
            onChange={setSelectedEmployee}
          >
            {employees.map(emp => (
              <Option key={emp.id} value={emp.id}>
                {emp.employee_name} ({emp.employee_code})
              </Option>
            ))}
          </Select>
          
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={handleAddSchedule}
          >
            新增排班
          </Button>
          
          <Button icon={<EyeOutlined />}>
            查看冲突
          </Button>
          
          <Button>
            批量排班
          </Button>
        </Space>
      </Card>

      {/* 选中日期信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div>
          <strong>选中日期：</strong>{selectedDate.format('YYYY年MM月DD日')}
          <span style={{ marginLeft: 16 }}>
            <strong>排班数量：</strong>{getSchedulesForDate(selectedDate).length}
          </span>
        </div>
        
        {/* 显示当天排班详情 */}
        <div style={{ marginTop: 8 }}>
          {getSchedulesForDate(selectedDate).map(schedule => (
            <Tag 
              key={schedule.id} 
              color={getStatusColor(schedule.status)}
              style={{ marginBottom: 4 }}
            >
              {schedule.employee_name} - {schedule.shift_name} ({schedule.start_time}-{schedule.end_time})
            </Tag>
          ))}
        </div>
      </Card>

      {/* 日历 */}
      <Calendar
        value={selectedDate}
        onSelect={onDateSelect}
        dateCellRender={dateCellRender}
        mode={viewMode}
      />

      {/* 新增排班模态框 */}
      <Modal
        title="新增排班"
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="schedule_date"
            label="排班日期"
            rules={[{ required: true, message: '请选择排班日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="employee_id"
            label="员工"
            rules={[{ required: true, message: '请选择员工' }]}
          >
            <Select placeholder="选择员工">
              {employees.map(emp => (
                <Option key={emp.id} value={emp.id}>
                  {emp.employee_name} ({emp.employee_code})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="shift_type_id"
            label="班次类型"
            rules={[{ required: true, message: '请选择班次类型' }]}
          >
            <Select placeholder="选择班次类型">
              {shiftTypes.map(shift => (
                <Option key={shift.id} value={shift.id}>
                  {shift.shift_name} ({shift.start_time}-{shift.end_time})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="notes"
            label="备注"
          >
            <Input.TextArea rows={3} placeholder="排班备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ScheduleCalendar;