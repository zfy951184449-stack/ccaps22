import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import axios from 'axios';
import { Employee } from '../types/organizationWorkbench';
import {
    WxbAvatar,
    WxbButton,
    WxbDataTable,
    type WxbDataTableProps,
    WxbPopconfirm,
    WxbSearchInput,
    WxbTag,
    wxbToast,
} from './wxb-ui';
import { DeleteIcon, EditIcon, PlusIcon } from './OrganizationWorkbench/OrgWorkbenchIcons';
import UnavailabilityModal, { type UnavailabilityRecord } from './UnavailabilityModal';

interface UnavailabilityTabProps {
    unitId?: number | null;
    employees: Employee[];
}

const UnavailabilityTab: React.FC<UnavailabilityTabProps> = ({ unitId, employees }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<UnavailabilityRecord[]>([]);
    const [searchText, setSearchText] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState<UnavailabilityRecord | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params: { unitId?: number } = {};
            if (unitId) {
                params.unitId = unitId;
            }
            const res = await axios.get('/api/unavailability', { params });
            setData(res.data);
        } catch (err) {
            console.error(err);
            wxbToast.error('Failed to load unavailability records');
        } finally {
            setLoading(false);
        }
    }, [unitId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDelete = useCallback(async (id: number) => {
        try {
            await axios.delete(`/api/unavailability/${id}`);
            wxbToast.success('Record deleted');
            fetchData();
        } catch (err) {
            console.error(err);
            wxbToast.error('Failed to delete record');
        }
    }, [fetchData]);

    const getReasonColor = (code: string): React.ComponentProps<typeof WxbTag>['color'] => {
        switch (code) {
            case 'AL': return 'green';
            case 'SL': return 'red';
            case 'PL': return 'amber';
            default: return 'neutral';
        }
    };

    const filteredData = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();
        if (!normalizedSearch) return data;
        return data.filter(item =>
            item.employeeName.toLowerCase().includes(normalizedSearch) ||
            item.notes?.toLowerCase().includes(normalizedSearch)
        );
    }, [data, searchText]);

    const columns: WxbDataTableProps<UnavailabilityRecord>['columns'] = [
        {
            title: 'Employee',
            key: 'employee',
            render: (_, record) => (
                <div className="orgwb-employee-cell">
                    <WxbAvatar
                        size={28}
                        initials={record.employeeName[0]}
                        className="orgwb-unavailability-avatar"
                    />
                    <span className="orgwb-table-name">{record.employeeName}</span>
                </div>
            )
        },
        {
            title: 'Start Date',
            dataIndex: 'startDate',
            key: 'startDate',
            render: (text: string) => dayjs(text).format('YYYY-MM-DD'),
            sorter: (a, b) => dayjs(a.startDate).unix() - dayjs(b.startDate).unix()
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
                <WxbTag color={getReasonColor(record.reasonCode)}>{text}</WxbTag>
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
            render: (_, record) => (
                <div className="orgwb-table-actions">
                    <WxbButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="orgwb-icon-button"
                        aria-label={`Edit ${record.employeeName}`}
                        onClick={() => {
                            setEditingRecord(record);
                            setModalVisible(true);
                        }}
                    >
                        <EditIcon />
                    </WxbButton>
                    <WxbPopconfirm
                        title="Delete Record?"
                        description="Are you sure you want to delete this unavailability record?"
                        okText="Delete"
                        cancelText="Cancel"
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <WxbButton
                            type="button"
                            variant="danger"
                            size="sm"
                            className="orgwb-icon-button"
                            aria-label={`Delete ${record.employeeName}`}
                        >
                            <DeleteIcon />
                        </WxbButton>
                    </WxbPopconfirm>
                </div>
            )
        }
    ];

    return (
        <div className="orgwb-unavailability">
            <div className="orgwb-unavailability-toolbar">
                <WxbSearchInput
                    placeholder="Search employees or notes"
                    value={searchText}
                    onChange={setSearchText}
                    className="orgwb-unavailability-search"
                    allowClear
                />

                <WxbButton
                    type="button"
                    variant="primary"
                    onClick={() => {
                        setEditingRecord(null);
                        setModalVisible(true);
                    }}
                >
                    <PlusIcon />
                    Add Unavailability
                </WxbButton>
            </div>

            <WxbDataTable<UnavailabilityRecord>
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                className="orgwb-unavailability-table"
                emptyState={{ description: 'No unavailable periods found' }}
            />

            <UnavailabilityModal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                onSuccess={() => {
                    setModalVisible(false);
                    fetchData();
                }}
                editingRecord={editingRecord}
                employees={employees}
            />
        </div>
    );
};

export default UnavailabilityTab;
