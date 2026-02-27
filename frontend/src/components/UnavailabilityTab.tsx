import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Input, DatePicker, Avatar, Tag, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import { Employee } from '../types/organizationWorkbench';
import UnavailabilityModal from './UnavailabilityModal';

interface UnavailabilityRecord {
    id: number;
    employeeId: number;
    employeeName: string;
    startDate: string;
    endDate: string;
    reasonCode: string;
    reasonLabel: string;
    notes: string;
    createdAt: string;
}

interface UnavailabilityTabProps {
    unitId?: number | null;
    employees: Employee[]; // Passed from parent to allow filtering/selection
}

const UnavailabilityTab: React.FC<UnavailabilityTabProps> = ({ unitId, employees }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<UnavailabilityRecord[]>([]);
    const [searchText, setSearchText] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState<UnavailabilityRecord | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (unitId) {
                params.unitId = unitId;
            }
            // If we want to filter by date range later, add here
            const res = await axios.get('http://localhost:3001/api/unavailability', { params });
            setData(res.data);
        } catch (err) {
            console.error(err);
            message.error('Failed to load unavailability records');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [unitId]); // Refetch when unit changes, valid since API filters by unitId

    const handleDelete = (id: number) => {
        Modal.confirm({
            title: 'Delete Record?',
            content: 'Are you sure you want to delete this unavailability record?',
            okText: 'Delete',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await axios.delete(`http://localhost:3001/api/unavailability/${id}`);
                    message.success('Record deleted');
                    fetchData();
                } catch (err) {
                    message.error('Failed to delete record');
                }
            }
        });
    };

    const getReasonColor = (code: string) => {
        switch (code) {
            case 'AL': return 'green'; // Annual Leave
            case 'SL': return 'red';   // Sick Leave
            case 'PL': return 'gold';  // Personal Leave
            default: return 'default';
        }
    };

    const filteredData = data.filter(item =>
        item.employeeName.toLowerCase().includes(searchText.toLowerCase()) ||
        item.notes?.toLowerCase().includes(searchText.toLowerCase())
    );

    const columns = [
        {
            title: 'Employee',
            key: 'employee',
            render: (_: any, record: UnavailabilityRecord) => (
                <Space>
                    <Avatar style={{ backgroundColor: '#1890ff' }}>{record.employeeName[0]}</Avatar>
                    <span className="font-medium">{record.employeeName}</span>
                </Space>
            )
        },
        {
            title: 'Start Date',
            dataIndex: 'startDate',
            key: 'startDate',
            render: (text: string) => dayjs(text).format('YYYY-MM-DD'),
            sorter: (a: UnavailabilityRecord, b: UnavailabilityRecord) => dayjs(a.startDate).unix() - dayjs(b.startDate).unix()
        },
        {
            title: 'End Date',
            dataIndex: 'endDate',
            key: 'endDate',
            render: (text: string) => dayjs(text).format('YYYY-MM-DD')
        },
        {
            title: 'Reason',
            dataIndex: 'reasonLabel',
            key: 'reasonLabel',
            render: (text: string, record: UnavailabilityRecord) => (
                <Tag color={getReasonColor(record.reasonCode)}>{text}</Tag>
            )
        },
        {
            title: 'Notes',
            dataIndex: 'notes',
            key: 'notes',
            ellipsis: true
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: UnavailabilityRecord) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => {
                            setEditingRecord(record);
                            setModalVisible(true);
                        }}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    />
                </Space>
            )
        }
    ];

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <Space>
                    <Input
                        prefix={<SearchOutlined className="text-gray-400" />}
                        placeholder="Search employees or notes"
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="w-64"
                        allowClear
                    />
                    {/* Can add Date Range filter here if needed */}
                </Space>

                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    shape="round"
                    onClick={() => {
                        setEditingRecord(null);
                        setModalVisible(true);
                    }}
                >
                    Add Unavailability
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                className="glass-table" // Assuming global css or just standard antd
            />

            <UnavailabilityModal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                onSuccess={() => {
                    setModalVisible(false);
                    fetchData();
                }}
                editingRecord={editingRecord}
                employees={employees} // Pass full list for picker
            />
        </div>
    );
};

export default UnavailabilityTab;
