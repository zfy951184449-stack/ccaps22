import * as XLSX from 'xlsx';

export interface QualificationMatrixExportEmployee {
  id: number;
  employee_code: string;
  employee_name: string;
  department?: string | null;
  team_name?: string | null;
  position?: string | null;
}

export interface QualificationMatrixExportQualification {
  id: number;
  qualification_name: string;
}

export interface QualificationMatrixExportItem {
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
}

export interface QualificationMatrixExportFilters {
  searchText?: string;
  department?: string;
  team?: string;
  qualifications?: string[];
  showEmptyRows: boolean;
}

export interface QualificationMatrixExportPayload {
  employees: QualificationMatrixExportEmployee[];
  qualifications: QualificationMatrixExportQualification[];
  matrixData: QualificationMatrixExportItem[];
  filters: QualificationMatrixExportFilters;
}

type SheetCellValue = string | number;

const MATRIX_SHEET_NAME = '资质矩阵';
const EMPLOYEE_SHEET_NAME = '员工信息';

const getStamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
};

const formatDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
};

const getFilterSummary = (filters: QualificationMatrixExportFilters) => [
  `搜索: ${filters.searchText?.trim() || '全部'}`,
  `部门: ${filters.department || '全部'}`,
  `班组: ${filters.team || '全部'}`,
  `资质: ${filters.qualifications?.length ? filters.qualifications.join('、') : '全部'}`,
  `显示空行: ${filters.showEmptyRows ? '是' : '否'}`,
].join(' | ');

const getMatrixKey = (employeeId: number, qualificationId: number) => `${employeeId}-${qualificationId}`;

export const exportQualificationMatrixToExcel = ({
  employees,
  qualifications,
  matrixData,
  filters,
}: QualificationMatrixExportPayload): void => {
  const workbook = XLSX.utils.book_new();
  const exportedEmployeeIds = new Set(employees.map((employee) => employee.id));
  const exportedQualificationIds = new Set(qualifications.map((qualification) => qualification.id));
  const exportedMatrixData = matrixData.filter((item) =>
    exportedEmployeeIds.has(item.employee_id) && exportedQualificationIds.has(item.qualification_id),
  );
  const levelByCell = new Map(
    exportedMatrixData.map((item) => [
      getMatrixKey(item.employee_id, item.qualification_id),
      item.qualification_level,
    ]),
  );
  const exportTime = new Date();

  const matrixRows: SheetCellValue[][] = [
    ['资质矩阵导出'],
    ['导出时间', formatDateTime(exportTime)],
    ['筛选条件', getFilterSummary(filters)],
    ['统计', `${qualifications.length} 项资质 / ${employees.length} 名员工 / ${exportedMatrixData.length} 条分配记录`],
    [],
    ['资质ID', '资质名称', ...employees.map((employee) => employee.employee_name)],
    ['', '', ...employees.map((employee) => employee.employee_code || '')],
    ...qualifications.map((qualification) => [
      qualification.id,
      qualification.qualification_name,
      ...employees.map((employee) => {
        const level = levelByCell.get(getMatrixKey(employee.id, qualification.id));
        return level ?? '-';
      }),
    ]),
  ];

  const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
  matrixSheet['!cols'] = [
    { wch: 10 },
    { wch: 36 },
    ...employees.map(() => ({ wch: 12 })),
  ];
  matrixSheet['!rows'] = [
    { hpt: 24 },
    { hpt: 18 },
    { hpt: 18 },
    { hpt: 18 },
    { hpt: 8 },
    { hpt: 28 },
    { hpt: 20 },
  ];
  matrixSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, employees.length + 1) } },
  ];
  XLSX.utils.book_append_sheet(workbook, matrixSheet, MATRIX_SHEET_NAME);

  const employeeRows: SheetCellValue[][] = [
    ['姓名', '工号', '部门', '班组', '岗位'],
    ...employees.map((employee) => [
      employee.employee_name,
      employee.employee_code || '',
      employee.department || '',
      employee.team_name || '',
      employee.position || '',
    ]),
  ];
  const employeeSheet = XLSX.utils.aoa_to_sheet(employeeRows);
  employeeSheet['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, employeeSheet, EMPLOYEE_SHEET_NAME);

  XLSX.writeFile(workbook, `资质矩阵_${getStamp()}.xlsx`);
};
