import React, { useMemo } from 'react';
import type { DataNode } from 'antd/es/tree';
import type { MenuProps } from 'antd';
import { WxbDropdown, WxbTag, WxbTree } from '../wxb-ui';
import { OrganizationUnitNode } from '../../types/organizationWorkbench';
import {
    DeleteIcon,
    EditIcon,
    FolderIcon,
    GroupIcon,
    MoveIcon,
    PlusIcon,
    ShiftIcon,
    TeamIcon,
} from './OrgWorkbenchIcons';

interface OrgTreeProps {
    units: OrganizationUnitNode[];
    onSelect: (selectedKeys: React.Key[], info: any) => void;
    selectedKeys: React.Key[];
    onExpand?: (expandedKeys: React.Key[]) => void;
    expandedKeys?: React.Key[];
    autoExpandParent?: boolean;
    onDelete?: (unitId: number) => void;
    onEdit?: (unit: OrganizationUnitNode) => void;
    onAddChild?: (parentId: number) => void;
    onMove?: (unitId: number) => void;
}

const OrgTree: React.FC<OrgTreeProps> = ({
    units,
    onSelect,
    selectedKeys,
    onExpand,
    expandedKeys,
    autoExpandParent,
    onDelete,
    onEdit,
    onAddChild,
    onMove
}) => {

    const treeData = useMemo(() => {
        const mapNode = (node: OrganizationUnitNode): DataNode => {
            const isLeaf = !node.children || node.children.length === 0;

            let icon = <FolderIcon className="orgwb-tree-icon orgwb-tree-icon--department" />;
            const isDept = node.unitType === 'DEPARTMENT';

            if (node.unitType === 'TEAM') icon = <TeamIcon className="orgwb-tree-icon orgwb-tree-icon--team" />;
            if (node.unitType === 'GROUP') icon = <GroupIcon className="orgwb-tree-icon orgwb-tree-icon--group" />;
            if (node.unitType === 'SHIFT') icon = <ShiftIcon className="orgwb-tree-icon orgwb-tree-icon--shift" />;

            const menuItems: MenuProps['items'] = [
                {
                    key: 'edit',
                    label: 'Edit Unit',
                    icon: <EditIcon />,
                    onClick: (e) => {
                        e.domEvent.stopPropagation();
                        if (onEdit) onEdit(node);
                    }
                },
                {
                    key: 'add-child',
                    label: 'Add Sub-Unit',
                    icon: <PlusIcon />,
                    onClick: (e) => {
                        e.domEvent.stopPropagation();
                        if (onAddChild) onAddChild(node.id);
                    }
                },
                {
                    key: 'move',
                    label: 'Move To...',
                    icon: <MoveIcon />,
                    onClick: (e) => {
                        e.domEvent.stopPropagation();
                        if (onMove) onMove(node.id);
                    }
                },
                { type: 'divider' },
                {
                    key: 'delete',
                    label: 'Delete Unit',
                    icon: <DeleteIcon />,
                    danger: true,
                    disabled: (node.children && node.children.length > 0) || node.memberCount > 0,
                    onClick: (e) => {
                        e.domEvent.stopPropagation();
                        if (onDelete) onDelete(node.id);
                    }
                }
            ];

            const titleNode = (
                <span className="orgwb-tree-title">
                    <span className={isDept ? 'orgwb-tree-title-text orgwb-tree-title-text--strong' : 'orgwb-tree-title-text'}>
                        {node.unitName}
                    </span>
                    {node.memberCount > 0 && (
                        <WxbTag className="orgwb-tree-count" color="neutral">{node.memberCount}</WxbTag>
                    )}
                </span>
            );

            return {
                key: node.id,
                title: (onDelete || onEdit || onAddChild || onMove) ? (
                    <WxbDropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
                        {titleNode}
                    </WxbDropdown>
                ) : titleNode,
                icon,
                children: node.children.map(mapNode),
                isLeaf
            };
        };

        return units.map(mapNode);
    }, [units, onAddChild, onDelete, onEdit, onMove]);

    return (
        <div className="orgwb-tree-shell">
            <WxbTree
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
                className="orgwb-tree"
                height={600}
            />
        </div>
    );
};

export default OrgTree;
