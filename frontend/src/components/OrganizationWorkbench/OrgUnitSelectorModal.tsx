import React, { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { WxbModal, WxbSpinner, wxbToast } from '../wxb-ui';
import OrgTree from './OrgTree';
import { OrganizationHierarchyResult, OrganizationUnitNode } from '../../types/organizationWorkbench';

interface OrgUnitSelectorModalProps {
    visible: boolean;
    onCancel: () => void;
    onSelect: (unitId: number, unitName: string) => void;
    title?: string;
}

const getAllKeys = (nodes: OrganizationUnitNode[]): number[] => {
    let keys: number[] = [];
    nodes.forEach(node => {
        keys.push(node.id);
        if (node.children) {
            keys = [...keys, ...getAllKeys(node.children)];
        }
    });
    return keys;
};

const OrgUnitSelectorModal: React.FC<OrgUnitSelectorModalProps> = ({
    visible,
    onCancel,
    onSelect,
    title = "Select Organization Unit"
}) => {
    const [hierarchy, setHierarchy] = useState<OrganizationHierarchyResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

    const fetchHierarchy = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get<OrganizationHierarchyResult>('/api/org-structure/tree');
            setHierarchy(res.data);
            // Default expand all
            setExpandedKeys(getAllKeys(res.data.units));
        } catch (err) {
            console.error(err);
            wxbToast.error('Failed to load organization tree');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (visible && !hierarchy) {
            fetchHierarchy();
        }
    }, [visible, hierarchy, fetchHierarchy]);

    const handleSelect = (selectedKeys: React.Key[], info: any) => {
        if (selectedKeys.length > 0) {
            const unitId = Number(selectedKeys[0]);

            // Safer way: find node in hierarchy.
            const node = findNode(hierarchy?.units || [], unitId);

            if (node) {
                onSelect(unitId, node.unitName);
                onCancel();
            }
        }
    };

    const findNode = (nodes: OrganizationUnitNode[], id: number): OrganizationUnitNode | null => {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = findNode(node.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    return (
        <WxbModal
            title={title}
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={500}
            className="orgwb-selector-modal"
        >
            <div className="orgwb-selector-body">
                {loading ? (
                    <div className="orgwb-selector-loading">
                        <WxbSpinner size={28} />
                    </div>
                ) : (
                    <OrgTree
                        units={hierarchy?.units || []}
                        onSelect={handleSelect}
                        selectedKeys={[]}
                        expandedKeys={expandedKeys}
                        onExpand={(keys) => setExpandedKeys(keys)}
                        autoExpandParent={true}
                    />
                )}
            </div>
        </WxbModal>
    );
};

export default OrgUnitSelectorModal;
