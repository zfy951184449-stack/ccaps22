import React, { useState, useEffect } from 'react';
import { Modal, Table, Tag, message, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface QualifiedPersonnelModalProps {
    visible: boolean;
    onCancel: () => void;
    operationId: number;
    positionNumber: number;
    requirements?: {
        qualification_name: string;
        required_level: number;
        is_mandatory: boolean;
    }[];
}

interface Personnel {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    department: string; // Team
    qualifications: string;
}

const QualifiedPersonnelModal: React.FC<QualifiedPersonnelModalProps> = ({
    visible,
    onCancel,
    operationId,
    positionNumber,
    requirements
}) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Personnel[]>([]);

    useEffect(() => {
        if (visible && operationId && positionNumber) {
            fetchPersonnel();
        } else {
            setData([]);
        }
    }, [visible, operationId, positionNumber]);

    const fetchPersonnel = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/calendar/operations/${operationId}/recommended-personnel?position_number=${positionNumber}`);
            if (!response.ok) {
                throw new Error('Failed to fetch personnel');
            }
            const result = await response.json();
            if (Array.isArray(result)) {
                setData(result);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error('Error fetching personnel:', error);
            message.error('Failed to load qualified personnel');
        } finally {
            setLoading(false);
        }
    };

    const columns: ColumnsType<Personnel> = [
        {
            title: 'Name',
            key: 'name',
            render: (_, record) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{record.employee_name}</span>
                    <span style={{ color: '#999', marginLeft: 8, fontSize: '12px' }}>{record.employee_code}</span>
                </div>
            ),
        },
        {
            title: 'Team',
            dataIndex: 'department',
            key: 'department',
            width: 120,
        },
        {
            title: 'Qualifications',
            key: 'qualifications',
            render: (_, record) => {
                if (!record.qualifications) return '-';
                // Highlight mandatory quals if possible, or just show all
                // Backend returns "QualName(Level)" string
                const quals = record.qualifications.split(', ');
                return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {quals.map((q, idx) => (
                            <Tag key={idx} style={{ margin: 0, fontSize: '11px' }}>{q}</Tag>
                        ))}
                    </div>
                );
            }
        }
    ];

    return (
        <Modal
            title={`Qualified Personnel - Position ${positionNumber}`}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={700}
            bodyStyle={{ padding: '0 24px 24px' }}
        >
            <div style={{ marginBottom: 16, color: '#666', fontSize: '13px' }}>
                Showing personnel who meet all mandatory requirements for this position.
                {requirements && requirements.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        <strong>Requirements: </strong>
                        {requirements.map((r, i) => (
                            <Tag key={i} color={r.is_mandatory ? 'red' : 'default'} style={{ fontSize: '11px' }}>
                                {r.qualification_name} (Lv{r.required_level})
                            </Tag>
                        ))}
                    </div>
                )}
            </div>

            <Table
                columns={columns}
                dataSource={data}
                rowKey="employee_id"
                loading={loading}
                pagination={false}
                size="small"
                scroll={{ y: 400 }}
                locale={{ emptyText: <Empty description="No qualified personnel found" /> }}
            />
        </Modal>
    );
};

export default QualifiedPersonnelModal;
