import React from 'react';
import type { WxbDataTableProps } from '../wxb-ui';
import { WxbBadge, WxbButton, WxbDataTable, WxbPopconfirm } from '../wxb-ui';
import { Employee } from '../../types/organizationWorkbench';
import { DeleteIcon, EditIcon } from './OrgWorkbenchIcons';

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
        if (s === 'ACTIVE') return <WxbBadge status="success" variant="bar" label="Active" />;
        if (s === 'VACATION' || s === 'ON LEAVE') return <WxbBadge status="warning" variant="bar" label="On Leave" />;
        if (s === 'RESIGNED') return <WxbBadge status="error" variant="bar" label="Resigned" />;
        return <WxbBadge status="neutral" variant="bar" label={status} />;
    };

    const columns: WxbDataTableProps<Employee>['columns'] = [
        {
            title: 'Name',
            dataIndex: 'employee_name',
            key: 'employee_name',
            render: (text: string) => <span className="orgwb-table-name">{text}</span>
        },
        {
            title: 'ID',
            dataIndex: 'employee_code',
            key: 'employee_code',
            render: (text: string) => <span className="orgwb-table-code">{text}</span>
        },
        {
            title: 'Position',
            key: 'position',
            render: (_: any, record: Employee) => (
                <span className="orgwb-table-position">
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
                <div className="orgwb-table-actions">
                    <WxbButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="orgwb-icon-button"
                        aria-label={`Edit ${record.employee_name}`}
                        onClick={() => onEdit(record)}
                    >
                        <EditIcon />
                    </WxbButton>
                    <WxbPopconfirm
                        title="Remove employee?"
                        description="Are you sure you want to remove this employee?"
                        onConfirm={() => onDelete(record.id)}
                        okText="Yes"
                        cancelText="No"
                    >
                        <WxbButton
                            type="button"
                            variant="danger"
                            size="sm"
                            className="orgwb-icon-button"
                            aria-label={`Delete ${record.employee_name}`}
                        >
                            <DeleteIcon />
                        </WxbButton>
                    </WxbPopconfirm>
                </div>
            )
        }
    ];

    return (
        <WxbDataTable<Employee>
            rowKey="id"
            columns={columns}
            dataSource={data}
            loading={loading}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            size="middle"
            className="orgwb-employee-table"
            density="standard"
            emptyState={{ description: 'No employees in this organization unit' }}
        />
    );
};

export default EmployeeTable;
