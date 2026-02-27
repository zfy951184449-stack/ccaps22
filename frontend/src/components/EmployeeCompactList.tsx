import React from 'react';
import { Table, Button, Space, Tag, Avatar, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Employee } from '../types';

const { Text } = Typography;

interface EmployeeCompactListProps {
    employees: Employee[];
    loading: boolean;
    onEdit: (employee: Employee) => void;
    onDelete: (employee: Employee) => void;
}

const orgRoleColors: Record<string, string> = {
    FRONTLINE: 'default',
    SHIFT_LEADER: 'blue',
    GROUP_LEADER: 'cyan',
    TEAM_LEADER: 'geekblue',
    DEPT_MANAGER: 'purple',
};

const orgRoleLabels: Record<string, string> = {
    FRONTLINE: 'Frontline',
    SHIFT_LEADER: 'Shift Leader',
    GROUP_LEADER: 'Group Leader',
    TEAM_LEADER: 'Team Leader',
    DEPT_MANAGER: 'Dept Manager',
};

const EmployeeCompactList: React.FC<EmployeeCompactListProps> = ({
    employees,
    loading,
    onEdit,
    onDelete,
}) => {
    const columns: ColumnsType<Employee> = [
        {
            title: 'Name',
            dataIndex: 'employee_name',
            key: 'employee_name',
            width: 200,
            render: (text, record) => (
                <Space>
                    {/* No Avatar as requested, but maybe a text or icon fallback if needed? 
               Plan said "No avatars/photos". We stick to text. 
               Maybe bold name + code. */}
                    <Text strong>{text}</Text>
                </Space>
            ),
            sorter: (a, b) => a.employee_name.localeCompare(b.employee_name),
        },
        {
            title: 'ID',
            dataIndex: 'employee_code',
            key: 'employee_code',
            width: 120,
            render: (text) => <Text type="secondary" style={{ fontSize: 13 }}>#{text}</Text>,
            sorter: (a, b) => String(a.employee_code).localeCompare(String(b.employee_code)),
        },
        {
            title: 'Role',
            dataIndex: 'org_role',
            key: 'org_role',
            width: 150,
            render: (role) => (
                <Tag color={orgRoleColors[role] || 'default'} style={{ borderRadius: 10, border: 'none' }}>
                    {orgRoleLabels[role] || role}
                </Tag>
            ),
            filters: Object.keys(orgRoleLabels).map(key => ({ text: orgRoleLabels[key], value: key })),
            onFilter: (value, record) => record.org_role === value,
        },
        {
            title: 'Team/Dept',
            key: 'unit',
            render: (_, record) => (
                <Space direction="vertical" size={0} style={{ fontSize: 12 }}>
                    {record.primary_team_name ? <Text>{record.primary_team_name}</Text> : null}
                    {record.department_name ? <Text type="secondary">{record.department_name}</Text> : null}
                </Space>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            fixed: 'right',
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => onEdit(record)}
                        className="hover:text-blue-500"
                    />
                    <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => onDelete(record)}
                    />
                </Space>
            ),
        },
    ];

    return (
        <div className="bg-white/50 backdrop-blur-xl rounded-2xl shadow-sm border border-white/20 overflow-hidden h-full flex flex-col">
            <Table
                columns={columns}
                dataSource={employees}
                rowKey="id"
                size="small"
                pagination={{
                    pageSize: 20,
                    showSizeChanger: true,
                    hideOnSinglePage: false,
                    size: 'small'
                }}
                loading={loading}
                scroll={{ y: 'calc(100vh - 240px)' }} // Adaptive height
                className="glass-table"
                // Row styling for zebra striping if needed, AntD has striped prop or CSS
                rowClassName={(_, index) => index % 2 === 0 ? 'bg-white/40' : 'bg-transparent'}
            />
        </div>
    );
};

export default EmployeeCompactList;
