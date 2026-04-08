import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Breadcrumb, Button, Input, message, Spin, Tabs, Space, Modal } from 'antd';
import { SearchOutlined, PlusOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';

import OrgTree from '../components/OrganizationWorkbench/OrgTree';
import EmployeeTable from '../components/OrganizationWorkbench/EmployeeTable';
import EditEmployeeModalV2 from '../components/OrganizationWorkbench/EditEmployeeModalV2';
import OrgUnitSelectorModal from '../components/OrganizationWorkbench/OrgUnitSelectorModal';
import UnavailabilityTab from '../components/UnavailabilityTab';
import AddUnitModal from '../components/OrganizationWorkbench/AddUnitModal';
import {
  OrganizationHierarchyResult,
  OrganizationUnitNode,
  Employee
} from '../types/organizationWorkbench';

const { TabPane } = Tabs;

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

  // --- Effects ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
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
      if (hierRes.data.units.length > 0 && !selectedUnitId) {
        setSelectedUnitId(hierRes.data.units[0].id);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to load organization data');
    } finally {
      setLoadingHierarchy(false);
      setLoadingEmployees(false);
    }
  };

  const reloadEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await axios.get<Employee[]>('/api/employees');
      setEmployees(res.data);
    } catch (err) {
      message.error('Failed to refresh employee list');
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
  const getDescendantIds = (unitId: number): number[] => {
    const ids = [unitId];
    const node = unitMap.get(unitId);
    if (node && node.children) {
      node.children.forEach(child => {
        ids.push(...getDescendantIds(child.id));
      });
    }
    return ids;
  };

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
  }, [employees, selectedUnitId, searchText, unitMap]);


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
      message.success('Employee deleted');
      reloadEmployees();
      fetchData(); // Refresh counts
    } catch (err) {
      message.error('Deletetion failed');
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    Modal.confirm({
      title: 'Delete Organization Unit?',
      content: 'This action cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await axios.delete(`/api/org-structure/units/${unitId}`);
          message.success('Unit deleted');
          if (selectedUnitId === unitId) setSelectedUnitId(null);
          fetchData();
        } catch (err: any) {
          console.error(err);
          message.error(err.response?.data?.message || 'Failed to delete unit');
        }
      }
    });
  };

  const selectedUnit = selectedUnitId ? unitMap.get(selectedUnitId) : null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 backdrop-blur">
          <span className="font-semibold text-gray-800 text-lg tracking-tight">Organization</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
          {loadingHierarchy ? (
            <div className="flex justify-center p-10"><Spin /></div>
          ) : (
            <OrgTree
              units={hierarchy?.units || []}
              onSelect={handleSelectUnit}
              selectedKeys={selectedUnitId ? [selectedUnitId] : []}
              onExpand={handleExpand}
              expandedKeys={expandedKeys}
              autoExpandParent={autoExpandParent}
              onDelete={handleDeleteUnit}
            />
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white">
          <Button block icon={<PlusOutlined />} className="text-gray-600" onClick={() => setIsAddUnitModalVisible(true)}>
            Add Unit
          </Button>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">

        {/* Header */}
        <div className="h-14 border-b border-gray-200 flex items-center px-6 bg-white shrink-0 gap-4">
          {!selectedUnit ? (
            <span className="text-gray-400">Select an organization unit to view details</span>
          ) : (
            <Breadcrumb separator=">">
              {breadcrumbItems.map(node => (
                <Breadcrumb.Item key={node.id} className="text-sm font-medium">
                  {node.unitName}
                </Breadcrumb.Item>
              ))}
            </Breadcrumb>
          )}
        </div>

        {/* Workspace */}
        {selectedUnit && (
          <div className="flex-1 p-6 overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800 m-0">{selectedUnit.unitName}</h1>
                <span className="bg-blue-100 text-blue-700 px-3 py-0.5 rounded-full text-xs font-semibold">
                  {filteredEmployees.length} Members
                </span>
              </div>

              <Space>
                <Button icon={<DownloadOutlined />}>Export</Button>
                <Button icon={<UploadOutlined />}>Import</Button>
                <Button type="primary" icon={<PlusOutlined />}>Add Employee</Button>
              </Space>
            </div>

            <Tabs
              defaultActiveKey="employees"
              className="mb-4"
              items={[
                {
                  label: 'Employees', key: 'employees', children: (
                    <>
                      <div className="mb-4 flex items-center gap-2">
                        <Input
                          placeholder="Search employees by name or ID..."
                          prefix={<SearchOutlined className="text-gray-400" />}
                          className="max-w-md"
                          value={searchText}
                          onChange={e => setSearchText(e.target.value)}
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
      </div>

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
        parentUnitId={selectedUnitId}
        allUnits={hierarchy?.units || []}
      />
    </div>
  );
};
export default OrganizationWorkbenchPage;
