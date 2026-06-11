import React, { useState, useEffect } from 'react';
import { message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { WxbDataTable, WxbEmpty, WxbModal, WxbTag } from '../wxb-ui';

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
                <div className="solver-v5-person-cell">
                    <span>{record.employee_name}</span>
                    <small>{record.employee_code}</small>
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
                    <div className="solver-v5-tag-list">
                        {quals.map((q, idx) => (
                            <WxbTag key={idx}>{q}</WxbTag>
                        ))}
                    </div>
                );
            }
        }
    ];

    return (
        <WxbModal
            title={`合格人员 - 岗位 ${positionNumber}`}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={700}
            className="solver-v5-qualified-modal"
        >
            <div className="solver-v5-modal-note">
                展示满足该岗位所有必需资质要求的人员。
                {requirements && requirements.length > 0 && (
                    <div className="solver-v5-tag-list">
                        <strong>资质要求：</strong>
                        {requirements.map((r, i) => (
                            <WxbTag key={i} color={r.is_mandatory ? 'red' : 'neutral'}>
                                {r.qualification_name} (Lv{r.required_level})
                            </WxbTag>
                        ))}
                    </div>
                )}
            </div>

            <WxbDataTable<Personnel>
                columns={columns}
                dataSource={data}
                rowKey="employee_id"
                loading={loading}
                pagination={false}
                size="small"
                density="compact"
                scroll={{ y: 400 }}
                locale={{ emptyText: <WxbEmpty description="未找到合格人员" /> }}
            />
        </WxbModal>
    );
};

export default QualifiedPersonnelModal;
