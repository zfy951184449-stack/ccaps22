import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import type { WxbDataTableProps } from './wxb-ui/DataTable/DataTable';
import { employeeQualificationApi } from '../services/api';
import {
  WxbButton,
  WxbDataTable,
  WxbFilterBar,
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
  WxbPopover,
  WxbSegmented,
  WxbSelect,
  WxbSpinner,
  WxbSwitch,
  WxbTag,
  WxbTooltip,
  wxbToast,
} from './wxb-ui';
import './QualificationMatrix.css';

type MatrixIconName = 'download' | 'refresh';

interface Employee {
  id: number;
  employee_code: string;
  employee_name: string;
  department_id?: number | null;
  department: string;
  team_id?: number | null;
  team_name?: string | null;
  position: string;
}

interface Qualification {
  id: number;
  qualification_name: string;
}

interface MatrixData {
  id: number;
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
  employee_name: string;
  employee_code: string;
  qualification_name: string;
}

interface MatrixResponse {
  employees: Employee[];
  qualifications: Qualification[];
  matrix: MatrixData[];
}

interface Statistics {
  totalStats: {
    total_employees: number;
    total_qualifications: number;
    total_assignments: number;
    avg_level: number;
  };
  levelDistribution: Array<{
    qualification_level: number;
    count: number;
  }>;
  qualificationCoverage: Array<{
    id: number;
    qualification_name: string;
    assigned_count: number;
    total_employees: number;
    coverage_percentage: number;
  }>;
  employeeCompleteness: Array<{
    id: number;
    employee_name: string;
    employee_code: string;
    assigned_qualifications: number;
    total_qualifications: number;
    completeness_percentage: number;
  }>;
}

interface EmployeeQualificationRecord {
  id?: number;
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
}

const LEVEL_OPTIONS = [1, 2, 3, 4, 5];
const LEVEL_SEGMENT_OPTIONS = LEVEL_OPTIONS.map((level) => ({ label: `${level}级`, value: String(level) }));
const DEFAULT_EMPLOYEE_COLUMN_LIMIT = 24;
const MOBILE_EMPLOYEE_COLUMN_LIMIT = 4;
const MOBILE_MATRIX_MEDIA_QUERY = '(max-width: 768px)';
const DEFAULT_QUALIFICATION_PAGE_SIZE = 20;

const getMatrixCellKey = (employeeId: number, qualificationId: number) => `${employeeId}-${qualificationId}`;

const useMediaQuery = (query: string) => {
  const getInitialValue = () => (
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  );
  const [matches, setMatches] = useState(getInitialValue);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const apiError = error as { response?: { data?: { error?: string } } };
  return apiError.response?.data?.error || fallback;
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MatrixIcon: React.FC<{ name: MatrixIconName }> = ({ name }) => {
  const paths: Record<MatrixIconName, React.ReactNode> = {
    download: (
      <>
        <path d="M12 4v10" />
        <path d="m8 10 4 4 4-4" />
        <path d="M5 20h14" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 12a8 8 0 0 1-13.5 5.8" />
        <path d="M4 12A8 8 0 0 1 17.5 6.2" />
        <path d="M17 3v4h-4" />
        <path d="M7 21v-4h4" />
      </>
    ),
  };

  return (
    <svg className="qualification-matrix-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
};

const QualificationMatrix: React.FC = () => {
  const isNarrowViewport = useMediaQuery(MOBILE_MATRIX_MEDIA_QUERY);
  const baseEmployeeColumnLimit = isNarrowViewport ? MOBILE_EMPLOYEE_COLUMN_LIMIT : DEFAULT_EMPLOYEE_COLUMN_LIMIT;
  const cellButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixData[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [searchText, setSearchText] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [teamFilter, setTeamFilter] = useState<string | undefined>();
  const [showEmptyRows, setShowEmptyRows] = useState(true);
  const [compactView, setCompactView] = useState(true);
  const [employeeColumnLimit, setEmployeeColumnLimit] = useState(baseEmployeeColumnLimit);
  const [qualificationCurrentPage, setQualificationCurrentPage] = useState(1);
  const [qualificationPageSize, setQualificationPageSize] = useState(DEFAULT_QUALIFICATION_PAGE_SIZE);
  const [editingCell, setEditingCell] = useState<{ employeeId: number; qualificationId: number } | null>(null);
  const [keyboardCell, setKeyboardCell] = useState<{ employeeId: number; qualificationId: number } | null>(null);
  const [pendingLevel, setPendingLevel] = useState<number>(3);
  const [cellLoading, setCellLoading] = useState(false);
  const employeeColumnWidth = isNarrowViewport ? 48 : compactView ? 44 : 52;
  const qualificationColumnWidth = isNarrowViewport ? 132 : compactView ? 160 : 180;

  const fetchMatrixData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [matrixResponse, statsResponse] = await Promise.all([
        axios.get<MatrixResponse>('/api/qualification-matrix'),
        axios.get<Statistics>('/api/qualification-matrix/statistics'),
      ]);

      setEmployees(matrixResponse.data.employees || []);
      setQualifications(matrixResponse.data.qualifications || []);
      setMatrixData(matrixResponse.data.matrix || []);
      setStatistics(statsResponse.data);
    } catch {
      setLoadError(true);
      wxbToast.error('获取资质矩阵数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrixData();
  }, [fetchMatrixData]);

  const matrixMap = useMemo(() => {
    const map = new Map<string, MatrixData>();
    matrixData.forEach((item) => {
      map.set(`${item.employee_id}-${item.qualification_id}`, item);
    });
    return map;
  }, [matrixData]);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((employee) => employee.department).filter(Boolean))),
    [employees],
  );

  const teams = useMemo(
    () => Array.from(new Set(
      employees
        .filter((employee) => !departmentFilter || employee.department === departmentFilter)
        .map((employee) => employee.team_name)
        .filter(Boolean),
    )) as string[],
    [departmentFilter, employees],
  );

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const matchesSearch = !normalizedSearch
      || employee.employee_name.toLowerCase().includes(normalizedSearch)
      || employee.employee_code.toLowerCase().includes(normalizedSearch);
    const matchesDepartment = !departmentFilter || employee.department === departmentFilter;
    const matchesTeam = !teamFilter || employee.team_name === teamFilter;

    if (!showEmptyRows) {
      const hasQualifications = matrixData.some((item) => item.employee_id === employee.id);
      if (!hasQualifications) return false;
    }

    return matchesSearch && matchesDepartment && matchesTeam;
  }), [departmentFilter, employees, matrixData, normalizedSearch, teamFilter, showEmptyRows]);

  useEffect(() => {
    setEmployeeColumnLimit(baseEmployeeColumnLimit);
    setEditingCell(null);
  }, [baseEmployeeColumnLimit, departmentFilter, normalizedSearch, teamFilter, showEmptyRows]);

  useEffect(() => {
    if (teamFilter && !teams.includes(teamFilter)) {
      setTeamFilter(undefined);
    }
  }, [teamFilter, teams]);

  const displayedEmployees = useMemo(
    () => filteredEmployees.slice(0, employeeColumnLimit),
    [employeeColumnLimit, filteredEmployees],
  );

  const filteredQualifications = qualifications;

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(filteredQualifications.length / qualificationPageSize));
    if (qualificationCurrentPage > pageCount) {
      setQualificationCurrentPage(pageCount);
    }
  }, [filteredQualifications.length, qualificationCurrentPage, qualificationPageSize]);

  useEffect(() => {
    if (!keyboardCell) return;

    const employeeVisible = displayedEmployees.some((employee) => employee.id === keyboardCell.employeeId);
    const qualificationVisible = filteredQualifications.some(
      (qualification) => qualification.id === keyboardCell.qualificationId,
    );

    if (!employeeVisible || !qualificationVisible) {
      setKeyboardCell(null);
    }
  }, [displayedEmployees, filteredQualifications, keyboardCell]);

  const firstCellKey = useMemo(() => {
    const firstEmployee = displayedEmployees[0];
    const firstQualification = filteredQualifications[0];
    return firstEmployee && firstQualification ? getMatrixCellKey(firstEmployee.id, firstQualification.id) : null;
  }, [displayedEmployees, filteredQualifications]);

  const keyboardCellKey = keyboardCell
    ? getMatrixCellKey(keyboardCell.employeeId, keyboardCell.qualificationId)
    : null;
  const activeRovingCellKey = keyboardCellKey || firstCellKey;

  const focusMatrixCell = useCallback((employeeId: number, qualificationId: number) => {
    const key = getMatrixCellKey(employeeId, qualificationId);
    setKeyboardCell({ employeeId, qualificationId });
    window.requestAnimationFrame(() => {
      cellButtonRefs.current.get(key)?.focus();
    });
  }, []);

  const moveMatrixFocus = useCallback((
    employeeId: number,
    qualificationId: number,
    employeeDelta: number,
    qualificationDelta: number,
  ) => {
    const employeeIndex = displayedEmployees.findIndex((employee) => employee.id === employeeId);
    const qualificationIndex = filteredQualifications.findIndex((qualification) => qualification.id === qualificationId);
    if (employeeIndex < 0 || qualificationIndex < 0) return;

    const nextEmployee = displayedEmployees[Math.max(0, Math.min(
      displayedEmployees.length - 1,
      employeeIndex + employeeDelta,
    ))];
    const nextQualification = filteredQualifications[Math.max(0, Math.min(
      filteredQualifications.length - 1,
      qualificationIndex + qualificationDelta,
    ))];

    if (!nextEmployee || !nextQualification) return;
    if (nextEmployee.id === employeeId && nextQualification.id === qualificationId) return;

    focusMatrixCell(nextEmployee.id, nextQualification.id);
  }, [displayedEmployees, filteredQualifications, focusMatrixCell]);

  const getMatrixItem = useCallback((employeeId: number, qualificationId: number): MatrixData | null => {
    return matrixMap.get(`${employeeId}-${qualificationId}`) || null;
  }, [matrixMap]);

  const totalEmployees = statistics?.totalStats.total_employees ?? employees.length;
  const totalQualifications = statistics?.totalStats.total_qualifications ?? qualifications.length;
  const totalAssignments = statistics?.totalStats.total_assignments ?? matrixData.length;
  const avgLevel = toFiniteNumber(statistics?.totalStats.avg_level).toFixed(1);

  const columns: WxbDataTableProps<Qualification>['columns'] = [
    {
      title: '资质信息',
      dataIndex: 'qualification_info',
      key: 'qualification_info',
      width: qualificationColumnWidth,
      fixed: 'left',
      render: (_: unknown, qualification: Qualification) => {
        return (
          <div className="matrix-qualification-cell">
            <div className="matrix-qualification-name">{qualification.qualification_name}</div>
            <div className="matrix-qualification-meta">
              <span>资质ID: {qualification.id}</span>
            </div>
          </div>
        );
      },
    },
    ...displayedEmployees.map((employee) => ({
      title: (
        <div className="matrix-employee-header">
          <div className="matrix-employee-name">{employee.employee_name}</div>
        </div>
      ),
      dataIndex: `employee_${employee.id}`,
      key: `employee_${employee.id}`,
      width: employeeColumnWidth,
      align: 'center' as const,
      render: (_: unknown, qualification: Qualification) => {
        const matrixItem = getMatrixItem(employee.id, qualification.id);
        const level = matrixItem?.qualification_level ?? null;
        const isActiveCell =
          editingCell?.employeeId === employee.id && editingCell?.qualificationId === qualification.id;

        const handleOpenEditor = () => {
          setEditingCell({ employeeId: employee.id, qualificationId: qualification.id });
          setPendingLevel(level ?? 3);
        };

        const handleCloseEditor = () => {
          setEditingCell((current) =>
            current && current.employeeId === employee.id && current.qualificationId === qualification.id
              ? null
              : current,
          );
          setPendingLevel(3);
        };

        const resolveMatrixRecord = async (): Promise<MatrixData | null> => {
          const current = getMatrixItem(employee.id, qualification.id);
          if (current?.id) return current;

          try {
            const response = await employeeQualificationApi.getByEmployeeId(employee.id);
            const fallback = (response.data || []).find(
              (item: EmployeeQualificationRecord) => item.qualification_id === qualification.id,
            );

            if (!fallback?.id) return null;

            return {
              id: fallback.id,
              employee_id: fallback.employee_id,
              qualification_id: fallback.qualification_id,
              qualification_level: fallback.qualification_level,
              employee_name: employee.employee_name,
              employee_code: employee.employee_code,
              qualification_name: qualification.qualification_name,
            };
          } catch {
            return null;
          }
        };

        const handleCreate = async () => {
          if (cellLoading) return;
          setCellLoading(true);

          try {
            await employeeQualificationApi.create({
              employee_id: employee.id,
              qualification_id: qualification.id,
              qualification_level: pendingLevel,
            });
            wxbToast.success('资质已添加');
            handleCloseEditor();
            await fetchMatrixData();
          } catch (error) {
            wxbToast.error(getApiErrorMessage(error, '添加资质失败'));
          } finally {
            setCellLoading(false);
          }
        };

        const handleUpdate = async () => {
          if (cellLoading) return;
          const record = await resolveMatrixRecord();

          if (!record) {
            wxbToast.error('未找到资质记录');
            return;
          }

          if (record.qualification_level === pendingLevel) {
            wxbToast.info('等级未变化');
            return;
          }

          setCellLoading(true);

          try {
            await employeeQualificationApi.update(record.id, {
              employee_id: record.employee_id,
              qualification_id: record.qualification_id,
              qualification_level: pendingLevel,
            });
            wxbToast.success('资质等级已更新');
            handleCloseEditor();
            await fetchMatrixData();
          } catch (error) {
            wxbToast.error(getApiErrorMessage(error, '更新资质失败'));
          } finally {
            setCellLoading(false);
          }
        };

        const handleDelete = async () => {
          if (cellLoading) return;
          const record = await resolveMatrixRecord();

          if (!record) {
            wxbToast.error('未找到资质记录');
            return;
          }

          setCellLoading(true);

          try {
            await employeeQualificationApi.delete(record.id);
            wxbToast.success('已移除资质');
            handleCloseEditor();
            await fetchMatrixData();
          } catch (error) {
            wxbToast.error(getApiErrorMessage(error, '移除资质失败'));
          } finally {
            setCellLoading(false);
          }
        };

        const editorContent = (
          <div className="matrix-cell-editor">
            <div className="matrix-cell-editor-title">{employee.employee_name}</div>
            <div className="matrix-cell-editor-subtitle">{qualification.qualification_name}</div>
            <div className="matrix-cell-editor-field">
              <span className="matrix-cell-editor-label">资质等级</span>
              <WxbSegmented
                size="sm"
                value={String(pendingLevel)}
                options={LEVEL_SEGMENT_OPTIONS}
                onChange={(value) => setPendingLevel(Number(value))}
              />
            </div>
            <div className="matrix-cell-editor-actions">
              {matrixItem ? (
                <WxbButton type="button" variant="primary" size="sm" onClick={handleUpdate} disabled={cellLoading}>
                  保存
                </WxbButton>
              ) : (
                <WxbButton type="button" variant="primary" size="sm" onClick={handleCreate} disabled={cellLoading}>
                  添加
                </WxbButton>
              )}
              {matrixItem && (
                <WxbButton type="button" variant="danger" size="sm" onClick={handleDelete} disabled={cellLoading}>
                  移除
                </WxbButton>
              )}
              <WxbButton type="button" variant="secondary" size="sm" onClick={handleCloseEditor} disabled={cellLoading}>
                取消
              </WxbButton>
            </div>
          </div>
        );

        const cellClassName = [
          'matrix-cell',
          compactView ? 'is-compact' : '',
          level === null ? 'matrix-cell-empty' : `matrix-cell-level-${level}`,
          isActiveCell ? 'is-active' : '',
        ].filter(Boolean).join(' ');
        const tooltipTitle = level === null
          ? `${employee.employee_name} 未获得 ${qualification.qualification_name} 资质`
          : `${employee.employee_name} - ${qualification.qualification_name}: ${level}级`;
        const cellKey = getMatrixCellKey(employee.id, qualification.id);
        const isRovingCell = cellKey === activeRovingCellKey;

        return (
          <WxbPopover
            content={editorContent}
            trigger="click"
            open={isActiveCell}
            onOpenChange={(visible) => {
              if (visible) {
                handleOpenEditor();
              } else {
                handleCloseEditor();
              }
            }}
          >
            <WxbTooltip title={tooltipTitle}>
              <WxbButton
                type="button"
                variant="ghost"
                size={isNarrowViewport ? 'lg' : 'md'}
                tabIndex={isRovingCell ? 0 : -1}
                className={cellClassName}
                aria-label={tooltipTitle}
                aria-expanded={isActiveCell}
                ref={(node) => {
                  if (node) {
                    cellButtonRefs.current.set(cellKey, node);
                  } else {
                    cellButtonRefs.current.delete(cellKey);
                  }
                }}
                onClick={() => {
                  setKeyboardCell({ employeeId: employee.id, qualificationId: qualification.id });
                  handleOpenEditor();
                }}
                onFocus={() => setKeyboardCell({ employeeId: employee.id, qualificationId: qualification.id })}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    moveMatrixFocus(employee.id, qualification.id, -1, 0);
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    moveMatrixFocus(employee.id, qualification.id, 1, 0);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveMatrixFocus(employee.id, qualification.id, 0, -1);
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveMatrixFocus(employee.id, qualification.id, 0, 1);
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    const targetEmployee = displayedEmployees[0];
                    const targetQualification = event.ctrlKey ? filteredQualifications[0] : qualification;
                    if (targetEmployee && targetQualification) {
                      focusMatrixCell(targetEmployee.id, targetQualification.id);
                    }
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    const targetEmployee = displayedEmployees[displayedEmployees.length - 1];
                    const targetQualification = event.ctrlKey
                      ? filteredQualifications[filteredQualifications.length - 1]
                      : qualification;
                    if (targetEmployee && targetQualification) {
                      focusMatrixCell(targetEmployee.id, targetQualification.id);
                    }
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setKeyboardCell({ employeeId: employee.id, qualificationId: qualification.id });
                    handleOpenEditor();
                  }
                }}
              >
                {isActiveCell && cellLoading ? (
                  <WxbSpinner size={16} />
                ) : level === null ? (
                  <span className="matrix-cell-empty-mark">-</span>
                ) : (
                  <span className="matrix-cell-value">{level}</span>
                )}
              </WxbButton>
            </WxbTooltip>
          </WxbPopover>
        );
      },
    })),
  ];

  return (
    <WxbPageShell
      size="full"
      gap="md"
      className={`qualification-matrix-page ${compactView ? 'is-compact' : ''}`}
    >
      <WxbPageHeader
        eyebrow="Master Data"
        title="资质矩阵"
        description="按员工与资质维护等级，供资质匹配、人员排班和求解约束复用。"
        meta={(
          <>
            <WxbTag color="blue">{totalEmployees} 员工</WxbTag>
            <WxbTag color="green">{totalQualifications} 资质</WxbTag>
            <WxbTag color="cyan">{totalAssignments} 分配</WxbTag>
            <WxbTag color="neutral">均级 {avgLevel}</WxbTag>
          </>
        )}
        actions={(
          <WxbButton type="button" variant="secondary" onClick={fetchMatrixData} disabled={loading}>
            <MatrixIcon name="refresh" />
            {loading ? '刷新中...' : '刷新'}
          </WxbButton>
        )}
      />

      <WxbPageSection variant="framed" density="compact" className="qualification-matrix-section">
        <WxbFilterBar
          className="qualification-matrix-filter"
          search={{
            value: searchText,
            onChange: setSearchText,
            placeholder: '搜索员工姓名或工号',
            width: 220,
          }}
          filters={(
            <>
              <div className="matrix-filter-control">
                <WxbSelect
                  placeholder="全部部门"
                  value={departmentFilter}
                  allowClear
                  options={departments.map((department) => ({ label: department, value: department }))}
                  onChange={(value) => {
                    setDepartmentFilter(value ? String(value) : undefined);
                    setTeamFilter(undefined);
                  }}
                />
              </div>
              <div className="matrix-filter-control matrix-filter-control-team">
                <WxbSelect
                  placeholder="全部班组"
                  value={teamFilter}
                  allowClear
                  disabled={teams.length === 0}
                  options={teams.map((team) => ({ label: team, value: team }))}
                  onChange={(value) => setTeamFilter(value ? String(value) : undefined)}
                />
              </div>
              <label className="matrix-switch-control">
                <span>显示空行</span>
                <WxbSwitch
                  checked={showEmptyRows}
                  onChange={(checked) => setShowEmptyRows(checked)}
                  aria-label="显示空行"
                />
              </label>
              <label className="matrix-switch-control">
                <span>紧凑视图</span>
                <WxbSwitch
                  checked={compactView}
                  onChange={(checked) => setCompactView(checked)}
                  aria-label="紧凑视图"
                />
              </label>
            </>
          )}
          resultCount={filteredQualifications.length}
          resultLabel="项资质"
          summary={`显示 ${displayedEmployees.length}/${filteredEmployees.length} 名员工`}
          actions={(
            <>
              {displayedEmployees.length < filteredEmployees.length && (
                <WxbButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEmployeeColumnLimit((current) => current + baseEmployeeColumnLimit)}
                >
                  更多员工
                </WxbButton>
              )}
              <WxbButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => wxbToast.info('导出功能开发中')}
              >
                <MatrixIcon name="download" />
                导出
              </WxbButton>
            </>
          )}
        />

        <WxbDataTable<Qualification>
          className="qualification-matrix-table"
          columns={columns}
          dataSource={filteredQualifications}
          rowKey="id"
          loading={loading}
          density={compactView ? 'compact' : 'standard'}
          emptyState={{
            description: '暂无匹配资质',
          }}
          errorState={loadError ? {
            title: '资质矩阵加载失败',
            description: '请检查后端服务或稍后重试。',
            action: (
              <WxbButton type="button" variant="secondary" size="sm" onClick={fetchMatrixData}>
                重新加载
              </WxbButton>
            ),
          } : undefined}
          pagination={{
            current: qualificationCurrentPage,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 项资质`,
            pageSize: qualificationPageSize,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, nextPageSize) => {
              const safePageSize = nextPageSize || DEFAULT_QUALIFICATION_PAGE_SIZE;
              const pageSizeChanged = safePageSize !== qualificationPageSize;

              setQualificationPageSize(safePageSize);
              setQualificationCurrentPage(pageSizeChanged ? 1 : page);
            },
          }}
          scroll={{
            x: Math.max(
              isNarrowViewport ? 420 : 820,
              qualificationColumnWidth + displayedEmployees.length * employeeColumnWidth,
            ),
            y: isNarrowViewport ? 'calc(100vh - 420px)' : 'calc(100vh - 340px)',
          }}
        />
      </WxbPageSection>
    </WxbPageShell>
  );
};

export default QualificationMatrix;
