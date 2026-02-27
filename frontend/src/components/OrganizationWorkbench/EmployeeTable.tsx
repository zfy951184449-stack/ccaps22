import React from 'react';
import { Table, Button, Badge, Space, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Employee } from '../../types/organizationWorkbench';

interface EmployeeTableProps {
    data: Employee[];
    loading: boolean;
    onEdit: (employee: Employee) => void;
    onDelete: (id: number) => void;
}

const EmployeeTable: React.FC<EmployeeTableProps> = ({
    data,
    loading,
    onEdit,
    onDelete
}) => {

    const getStatusBadge = (status: string) => {
        const s = status.toUpperCase();
        if (s === 'ACTIVE') return <Badge status="success" text="Active" />;
        if (s === 'VACATION' || s === 'ON LEAVE') return <Badge status="warning" text="On Leave" />;
        if (s === 'RESIGNED') return <Badge status="error" text="Resigned" />;
        return <Badge status="default" text={status} />;
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'employee_name',
            key: 'employee_name',
            render: (text: string) => <span className="font-semibold text-gray-900">{text}</span>
        },
        {
            title: 'ID',
            dataIndex: 'employee_code',
            key: 'employee_code',
            render: (text: string) => <span className="font-mono text-gray-500">{text}</span>
        },
        {
            title: 'Position',
            key: 'position',
            render: (_: any, record: Employee) => (
                <span className="text-gray-700">
                    {record.primary_role_name || record.org_role || 'N/A'}
                </span>
            )
        },
        {
            title: 'Status',
            dataIndex: 'employment_status',
            key: 'employment_status',
            render: (status: string) => getStatusBadge(status || 'ACTIVE')
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_: any, record: Employee) => (
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => onEdit(record)}
                    />
                    <Popconfirm
                        title="Remove employee?"
                        description="Are you sure you want to remove this employee?"
                        onConfirm={() => onDelete(record.id)}
                        okText="Yes"
                        cancelText="No"
                    >
                        <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                        />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <Table
            rowKey="id"
            columns={columns}
            dataSource={data}
            loading={loading}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            size="middle"
            className="border rounded-md bg-white border-gray-200 overflow-hidden"
        />
    );
};

export default EmployeeTable;
