import axios from 'axios';
import { saveAs } from 'file-saver';

export type TemplateWorkbookImportMode = 'create' | 'replace';

export interface TemplateWorkbookIssue {
  severity: 'blocking' | 'warning';
  sheet: string;
  row?: number;
  field?: string;
  code: string;
  message: string;
}

export interface TemplateWorkbookActionSummary {
  template_code: string;
  template_name: string;
  action: TemplateWorkbookImportMode;
  target_template_id: number | null;
  blocked_reason?: string | null;
}

export interface TemplateWorkbookTemplateResult {
  template_code: string;
  template_name: string;
  action: TemplateWorkbookImportMode;
  template_id: number | null;
  total_days: number | null;
  status: 'validated' | 'imported';
}

export interface TemplateWorkbookMutationResult {
  workbook_version: number;
  mode: TemplateWorkbookImportMode;
  dry_run: boolean;
  can_import: boolean;
  summary: {
    template_count: number;
    stage_count: number;
    operation_count: number;
    constraint_count: number;
    share_group_count: number;
    share_group_member_count: number;
    resource_binding_count: number;
    resource_requirement_count: number;
  };
  template_actions: TemplateWorkbookActionSummary[];
  template_results: TemplateWorkbookTemplateResult[];
  blocking_errors: TemplateWorkbookIssue[];
  warnings: TemplateWorkbookIssue[];
}

const client = axios.create({
  baseURL: '/api',
});

const parseFileName = (contentDisposition?: string): string => {
  if (!contentDisposition) {
    return '工艺模板.xlsx';
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return '工艺模板.xlsx';
};

const buildWorkbookFormData = (file: File, mode: TemplateWorkbookImportMode) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  return formData;
};

export const exportTemplateWorkbook = async (templateId: number): Promise<void> => {
  const response = await client.get(`/process-templates/${templateId}/workbook/export`, {
    responseType: 'blob',
  });
  const fileName = parseFileName(response.headers['content-disposition']);
  saveAs(response.data, fileName);
};

export const previewTemplateWorkbookImport = async (
  file: File,
  mode: TemplateWorkbookImportMode,
): Promise<TemplateWorkbookMutationResult> => {
  const response = await client.post<TemplateWorkbookMutationResult>(
    '/process-templates/workbook/preview',
    buildWorkbookFormData(file, mode),
  );
  return response.data;
};

export const importTemplateWorkbook = async (
  file: File,
  mode: TemplateWorkbookImportMode,
): Promise<TemplateWorkbookMutationResult> => {
  const response = await client.post<TemplateWorkbookMutationResult>(
    '/process-templates/workbook/import',
    buildWorkbookFormData(file, mode),
  );
  return response.data;
};
