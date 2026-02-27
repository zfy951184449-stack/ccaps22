import React, { useMemo } from 'react';
import { Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
    FolderOutlined,
    TeamOutlined,
    ClusterOutlined,
    DeploymentUnitOutlined,
    MoreOutlined,
    DeleteOutlined
} from '@ant-design/icons';
import { OrganizationUnitNode } from '../../types/organizationWorkbench';
import { Dropdown, MenuProps } from 'antd';

interface OrgTreeProps {
    units: OrganizationUnitNode[];
    onSelect: (selectedKeys: React.Key[], info: any) => void;
    selectedKeys: React.Key[];
    onExpand?: (expandedKeys: React.Key[]) => void;
    expandedKeys?: React.Key[];
    autoExpandParent?: boolean;
    onDelete?: (unitId: number) => void;
}

const OrgTree: React.FC<OrgTreeProps> = ({
    units,
    onSelect,
    selectedKeys,
    onExpand,
    expandedKeys,
    autoExpandParent,
    onDelete
}) => {

    const treeData = useMemo(() => {
        const mapNode = (node: OrganizationUnitNode): DataNode => {
            const isLeaf = !node.children || node.children.length === 0;

            // Visual Logic
            let icon = <FolderOutlined className="text-blue-500" />;
            const isDept = node.unitType === 'DEPARTMENT';

            if (node.unitType === 'TEAM') icon = <TeamOutlined className="text-indigo-500" />;
            if (node.unitType === 'GROUP') icon = <ClusterOutlined className="text-purple-500" />;
            if (node.unitType === 'SHIFT') icon = <DeploymentUnitOutlined className="text-gray-500" />;

            const menuItems: MenuProps['items'] = [
                {
                    key: 'delete',
                    label: 'Delete Unit',
                    icon: <DeleteOutlined />,
                    danger: true,
                    disabled: (node.children && node.children.length > 0) || node.memberCount > 0,
                    onClick: (e) => {
                        e.domEvent.stopPropagation();
                        if (onDelete) onDelete(node.id);
                    }
                }
            ];

            const titleNode = (
                <span className="flex items-center gap-1.5 py-0.5 transition-colors duration-200 whitespace-nowrap overflow-hidden group w-full">
                    <span className={`
                        ${isDept ? 'font-semibold text-gray-800' : 'font-medium text-gray-600'}
                        tracking-tight truncate
                    `}>
                        {node.unitName}
                    </span>
                    {node.memberCount > 0 && (
                        <span className="flex-shrink-0 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            {node.memberCount}
                        </span>
                    )}
                </span>
            );

            return {
                key: node.id,
                title: onDelete ? (
                    <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
                        {titleNode}
                    </Dropdown>
                ) : titleNode,
                icon,
                children: node.children.map(mapNode),
                isLeaf
            };
        };

        return units.map(mapNode);
    }, [units, onDelete]);

    return (
        <div className="py-2">
            <style>{`
                .ant-tree-node-content-wrapper {
                    display: flex !important;
                    align-items: center !important;
                    min-height: 28px !important;
                }
                .ant-tree-iconEle {
                    height: 28px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center;
                    margin-right: 4px !important;
                }
                .ant-tree-title {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                }
            `}</style>
            <Tree
                showIcon
                showLine={{ showLeafIcon: false }}
                blockNode
                defaultExpandAll
                treeData={treeData}
                onSelect={onSelect}
                selectedKeys={selectedKeys}
                onExpand={onExpand}
                expandedKeys={expandedKeys}
                autoExpandParent={autoExpandParent}
                className="bg-transparent text-sm"
                height={600} // Virtual scroll support
            />
        </div>
    );
};

export default OrgTree;
