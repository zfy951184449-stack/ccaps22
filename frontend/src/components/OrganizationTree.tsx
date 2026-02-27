import React, { useMemo } from 'react';
import { Tree, Typography, Space, Tag, Empty } from 'antd';
import {
    ApartmentOutlined,
    TeamOutlined,
    DownOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { OrgHierarchyResponse, OrgUnitNode } from '../types';

const { Text } = Typography;

interface OrganizationTreeProps {
    structure: OrgHierarchyResponse | null;
    selectedUnitId: number | null;
    onSelect: (unitId: number, type: 'DEPARTMENT' | 'TEAM') => void;
    className?: string;
}

const OrganizationTree: React.FC<OrganizationTreeProps> = ({
    structure,
    selectedUnitId,
    onSelect,
    className,
}) => {
    const treeData = useMemo<DataNode[]>(() => {
        if (!structure?.units) return [];

        const mapUnitToNode = (unit: OrgUnitNode): DataNode => {
            const isDept = unit.unitType === 'DEPARTMENT';
            const icon = isDept ? <ApartmentOutlined /> : <TeamOutlined />;

            return {
                key: unit.id,
                title: (
                    <Space>
                        <span style={{ color: unit.isActive ? 'inherit' : '#999' }}>
                            {unit.unitName}
                        </span>
                        {!unit.isActive && <Tag color="default" style={{ fontSize: 10, lineHeight: '18px' }}>停用</Tag>}
                        <span style={{ fontSize: 12, color: '#888' }}>
                            ({unit.memberCount})
                        </span>
                    </Space>
                ),
                icon,
                children: unit.children?.length ? unit.children.map(mapUnitToNode) : undefined,
                // @ts-ignore: Custom data for event handling
                data: { type: unit.unitType },
            };
        };

        return structure.units.map(mapUnitToNode);
    }, [structure]);

    if (!structure) {
        return <Empty description="加载中..." image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
        <div className={`p-4 h-full flex flex-col ${className}`} style={{
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(0,0,0,0.05)'
        }}>
            <div className="mb-4 px-2">
                <Text strong style={{ fontSize: 16 }}>Organization</Text>
            </div>

            <div className="flex-1 overflow-y-auto">
                <Tree
                    showIcon
                    blockNode
                    defaultExpandAll
                    switcherIcon={<DownOutlined />}
                    treeData={treeData}
                    selectedKeys={selectedUnitId ? [selectedUnitId] : []}
                    onSelect={(selectedKeys, info) => {
                        if (selectedKeys.length > 0) {
                            const unitId = Number(selectedKeys[0]);
                            const type = (info.node as any).data?.type;
                            onSelect(unitId, type);
                        }
                    }}
                    className="bg-transparent"
                    style={{ background: 'transparent' }}
                />
            </div>
        </div>
    );
};

export default OrganizationTree;
