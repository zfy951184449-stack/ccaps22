import React, { useCallback, useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  WxbBreadcrumb,
  WxbButton,
  WxbModal,
  WxbSearchInput,
  WxbSpinner,
  WxbTabs,
  WxbTag,
  wxbToast,
} from '../components/wxb-ui';

import OrgTree from '../components/OrganizationWorkbench/OrgTree';
import EmployeeTable from '../components/OrganizationWorkbench/EmployeeTable';
import EditEmployeeModalV2 from '../components/OrganizationWorkbench/EditEmployeeModalV2';
import CreateEmployeeModal from '../components/OrganizationWorkbench/CreateEmployeeModal';
import EditUnitModal from '../components/OrganizationWorkbench/EditUnitModal';
import OrgUnitSelectorModal from '../components/OrganizationWorkbench/OrgUnitSelectorModal';
import UnavailabilityTab from '../components/UnavailabilityTab';
import AddUnitModal from '../components/OrganizationWorkbench/AddUnitModal';
import {
  DownloadIcon,
  PlusIcon,
  UploadIcon,
} from '../components/OrganizationWorkbench/OrgWorkbenchIcons';
import {
  OrganizationHierarchyResult,
  OrganizationUnitNode,
  Employee
} from '../types/organizationWorkbench';
import './OrganizationWorkbenchPage.css';

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

const OrganizationWorkbenchPage: React.FC = () => {
  // --- State ---
  const [hierarchy, setHierarchy] = useState<OrganizationHierarchyResult | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);

  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Tree Expansion State
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);

  const [searchText, setSearchText] = useState('');

  // Modal State
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Add Unit Modal
  const [isAddUnitModalVisible, setIsAddUnitModalVisible] = useState(false);
  const [addUnitParentId, setAddUnitParentId] = useState<number | null>(null);

  // Create Employee Modal
  const [isCreateEmployeeModalVisible, setIsCreateEmployeeModalVisible] = useState(false);

  // Edit Unit Modal
  const [isEditUnitModalVisible, setIsEditUnitModalVisible] = useState(false);
  const [editingUnit, setEditingUnit] = useState<OrganizationUnitNode | null>(null);

  // Move Unit Modal
  const [isMoveUnitModalVisible, setIsMoveUnitModalVisible] = useState(false);
  const [movingUnitId, setMovingUnitId] = useState<number | null>(null);
  const [deleteUnitId, setDeleteUnitId] = useState<number | null>(null);
  const [deletingUnit, setDeletingUnit] = useState(false);

  const fetchData = useCallback(async () => {
    setLoadingHierarchy(true);
    setLoadingEmployees(true);
    try {
      const [hierRes, empRes] = await Promise.all([
        axios.get<OrganizationHierarchyResult>('/api/org-structure/tree'),
        axios.get<Employee[]>('/api/employees')
      ]);
      setHierarchy(hierRes.data);
      setEmployees(empRes.data);

      // Expand all nodes by default
      const allKeys = getAllKeys(hierRes.data.units);
      setExpandedKeys(allKeys);

      // Default select the first root unit if available
      if (hierRes.data.units.length > 0) {
        setSelectedUnitId((current) => current ?? hierRes.data.units[0].id);
      }
    } catch (err) {
      console.error(err);
      wxbToast.error('Failed to load organization data');
    } finally {
      setLoadingHierarchy(false);
      setLoadingEmployees(false);
    }
  }, []);

  // --- Effects ---
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const reloadEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await axios.get<Employee[]>('/api/employees');
      setEmployees(res.data);
    } catch (err) {
      wxbToast.error('Failed to refresh employee list');
    } finally {
      setLoadingEmployees(false);
    }
  };

  // --- Logic ---

  // Flatten tree to find unit details efficiently
  const unitMap = useMemo(() => {
    const map = new Map<number, OrganizationUnitNode>();
    if (!hierarchy) return map;

    const traverse = (nodes: OrganizationUnitNode[]) => {
      nodes.forEach(node => {
        map.set(node.id, node);
        if (node.children) traverse(node.children);
      });
    };
    traverse(hierarchy.units);
    return map;
  }, [hierarchy]);

  // Find descendants for recursive filtering
  const getDescendantIds = useCallback((unitId: number): number[] => {
    const ids = [unitId];
    const node = unitMap.get(unitId);
    if (node && node.children) {
      node.children.forEach(child => {
        ids.push(...getDescendantIds(child.id));
      });
    }
    return ids;
  }, [unitMap]);

  // Filtered Employees
  const filteredEmployees = useMemo(() => {
    let result = employees;

    // 1. Filter by Unit (Recursive)
    if (selectedUnitId) {
      const targetIds = new Set(getDescendantIds(selectedUnitId));
      result = result.filter(e => e.unit_id && targetIds.has(e.unit_id));
    }

    // 2. Filter by Search Text
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(e =>
        e.employee_name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q)
      );
    }

    return result;
  }, [employees, getDescendantIds, selectedUnitId, searchText]);


  // Breadcrumbs
  const breadcrumbItems = useMemo(() => {
    if (!selectedUnitId) return [];

    // Naive way to build path: requires parent pointers or traversing from root
    // Since we have a top-down tree, we can build a path map simpler during traversal or search now.
    // For simplicity/speed in this MVP, let's just show the current Unit Name or a mock path.
    // A proper implementation would keep parent references or search the tree structure.

    const path: OrganizationUnitNode[] = [];
    let currentId: number | null = selectedUnitId;

    // We can't easily go up without parent pointers in the map unless we added them.
    // unitMap node has parentId!

    while (currentId) {
      const node = unitMap.get(currentId);
      if (node) {
        path.unshift(node);
        currentId = node.parentId;
      } else {
        break;
      }
    }
    return path;
  }, [selectedUnitId, unitMap]);

  // --- Handlers ---
  const handleExpand = (newExpandedKeys: React.Key[]) => {
    setExpandedKeys(newExpandedKeys);
    setAutoExpandParent(false);
  };

  const handleSelectUnit = (keys: React.Key[]) => {
    if (keys.length > 0) {
      setSelectedUnitId(Number(keys[0]));
    }
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/api/employees/${id}`);
      wxbToast.success('Employee deleted');
      reloadEmployees();
      fetchData(); // Refresh counts
    } catch (err) {
      wxbToast.error('Deletion failed');
    }
  };

  const handleDeleteUnit = (unitId: number) => {
    setDeleteUnitId(unitId);
  };

  const confirmDeleteUnit = async () => {
    if (!deleteUnitId) return;
    setDeletingUnit(true);
    try {
      await axios.delete(`/api/org-structure/units/${deleteUnitId}`);
      wxbToast.success('Unit deleted');
      if (selectedUnitId === deleteUnitId) setSelectedUnitId(null);
      setDeleteUnitId(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      wxbToast.error(err.response?.data?.message || 'Failed to delete unit');
    } finally {
      setDeletingUnit(false);
    }
  };

  const handleEditUnit = (unit: OrganizationUnitNode) => {
    setEditingUnit(unit);
    setIsEditUnitModalVisible(true);
  };

  const handleAddChildUnit = (parentId: number) => {
    setAddUnitParentId(parentId);
    setIsAddUnitModalVisible(true);
  };

  const handleMoveUnit = (unitId: number) => {
    setMovingUnitId(unitId);
    setIsMoveUnitModalVisible(true);
  };

  const handleMoveUnitSelect = async (newParentId: number) => {
    if (!movingUnitId) return;
    try {
      await axios.put(`/api/org-structure/units/${movingUnitId}`, {
        parent_id: newParentId,
      });
      wxbToast.success('Unit moved successfully');
      setIsMoveUnitModalVisible(false);
      setMovingUnitId(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      wxbToast.error(err?.response?.data?.message || 'Failed to move unit');
    }
  };

  const selectedUnit = selectedUnitId ? unitMap.get(selectedUnitId) : null;

  return (
    <div className="orgwb">

      {/* Left Sidebar */}
      <aside className="orgwb-sidebar">
        <div className="orgwb-sidebar-header">
          <span className="orgwb-sidebar-title">Organization</span>
        </div>

        <div className="orgwb-sidebar-body">
          {loadingHierarchy ? (
            <div className="orgwb-loading"><WxbSpinner size={28} /></div>
          ) : (
            <OrgTree
              units={hierarchy?.units || []}
              onSelect={handleSelectUnit}
              selectedKeys={selectedUnitId ? [selectedUnitId] : []}
              onExpand={handleExpand}
              expandedKeys={expandedKeys}
              autoExpandParent={autoExpandParent}
              onDelete={handleDeleteUnit}
              onEdit={handleEditUnit}
              onAddChild={handleAddChildUnit}
              onMove={handleMoveUnit}
            />
          )}
        </div>

        <div className="orgwb-sidebar-footer">
          <WxbButton type="button" variant="secondary" className="orgwb-block-button" onClick={() => {
            setAddUnitParentId(selectedUnitId);
            setIsAddUnitModalVisible(true);
          }}>
            <PlusIcon />
            Add Unit
          </WxbButton>
        </div>
      </aside>

      {/* Right Content */}
      <main className="orgwb-main">

        {/* Header */}
        <div className="orgwb-breadcrumb-bar">
          {!selectedUnit ? (
            <span className="orgwb-muted">Select an organization unit to view details</span>
          ) : (
            <WxbBreadcrumb
              separator=">"
              items={breadcrumbItems.map((node) => ({
                label: node.unitName,
                onClick: () => setSelectedUnitId(node.id),
              }))}
            />
          )}
        </div>

        {/* Workspace */}
        {selectedUnit && (
          <div className="orgwb-workspace">
            <div className="orgwb-workspace-header">
              <div className="orgwb-title-group">
                <h1 className="orgwb-title">{selectedUnit.unitName}</h1>
                <WxbTag color="blue">{filteredEmployees.length} Members</WxbTag>
              </div>

              <div className="orgwb-toolbar">
                <WxbButton type="button" variant="secondary">
                  <DownloadIcon />
                  Export
                </WxbButton>
                <WxbButton type="button" variant="secondary">
                  <UploadIcon />
                  Import
                </WxbButton>
                <WxbButton type="button" variant="primary" onClick={() => setIsCreateEmployeeModalVisible(true)}>
                  <PlusIcon />
                  Add Employee
                </WxbButton>
              </div>
            </div>

            <WxbTabs
              defaultActiveKey="employees"
              className="orgwb-tabs"
              items={[
                {
                  label: 'Employees', key: 'employees', children: (
                    <>
                      <div className="orgwb-filter-row">
                        <WxbSearchInput
                          placeholder="Search employees by name or ID..."
                          className="orgwb-search"
                          value={searchText}
                          onChange={setSearchText}
                          allowClear
                        />
                      </div>
                      <EmployeeTable
                        data={filteredEmployees}
                        loading={loadingEmployees}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    </>
                  )
                },
                { label: 'Overview', key: 'overview', disabled: true },
                { label: 'Rules', key: 'rules', disabled: true },
                {
                  label: 'Unavailable Periods', key: 'unavailability', children: (
                    <UnavailabilityTab
                      unitId={selectedUnitId}
                      employees={employees} // or filteredEmployees if you want to restrict to unit
                    />
                  )
                },
              ]}
            />
          </div>
        )}
      </main>

      <EditEmployeeModalV2
        visible={isModalVisible}
        employee={editingEmployee}
        onCancel={() => setIsModalVisible(false)}
        onSuccess={() => {
          setIsModalVisible(false);
          reloadEmployees();
        }}
      />

      <AddUnitModal
        visible={isAddUnitModalVisible}
        onCancel={() => setIsAddUnitModalVisible(false)}
        onSuccess={() => {
          setIsAddUnitModalVisible(false);
          fetchData();
        }}
        parentUnitId={addUnitParentId}
        allUnits={hierarchy?.units || []}
      />

      <CreateEmployeeModal
        visible={isCreateEmployeeModalVisible}
        onCancel={() => setIsCreateEmployeeModalVisible(false)}
        onSuccess={() => {
          setIsCreateEmployeeModalVisible(false);
          reloadEmployees();
          fetchData(); // Refresh counts
        }}
        defaultUnitId={selectedUnitId}
        defaultUnitName={selectedUnit?.unitName || null}
      />

      <EditUnitModal
        visible={isEditUnitModalVisible}
        onCancel={() => setIsEditUnitModalVisible(false)}
        onSuccess={() => {
          setIsEditUnitModalVisible(false);
          fetchData();
        }}
        unit={editingUnit}
        allUnits={hierarchy?.units || []}
      />

      <OrgUnitSelectorModal
        visible={isMoveUnitModalVisible}
        onCancel={() => {
          setIsMoveUnitModalVisible(false);
          setMovingUnitId(null);
        }}
        onSelect={handleMoveUnitSelect}
        title="Move Unit To..."
      />

      <WxbModal
        open={deleteUnitId !== null}
        title="Delete Organization Unit?"
        onCancel={() => setDeleteUnitId(null)}
        onOk={confirmDeleteUnit}
        okText={deletingUnit ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        okVariant="danger"
        confirmLoading={deletingUnit}
      >
        <p className="orgwb-confirm-copy">This action cannot be undone.</p>
      </WxbModal>
    </div>
  );
};
export default OrganizationWorkbenchPage;
