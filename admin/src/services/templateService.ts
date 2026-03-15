import apiClient from './apiClient'
import type { TemplateListResponse } from '../types/template'
import type {
  ProcessTemplateWorkbookData,
  ProcessTemplateWorkbookImportPayload,
  ProcessTemplateWorkbookImportResult
} from '../types/templateWorkbook'

export const fetchTemplates = async () => {
  const response = await apiClient.get<TemplateListResponse>('/process-templates')
  return response.data
}

export const exportTemplateWorkbook = async (templateIds?: number[]) => {
  const response = await apiClient.get<ProcessTemplateWorkbookData>('/process-templates/workbook/export', {
    params: templateIds && templateIds.length ? { template_ids: templateIds.join(',') } : undefined
  })
  return response.data
}

export const importTemplateWorkbook = async (payload: ProcessTemplateWorkbookImportPayload) => {
  const response = await apiClient.post<ProcessTemplateWorkbookImportResult>(
    '/process-templates/workbook/import',
    payload
  )
  return response.data
}
