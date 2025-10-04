import apiClient from './apiClient'
import type { TemplateListResponse } from '../types/template'

export const fetchTemplates = async () => {
  const response = await apiClient.get<TemplateListResponse>('/process-templates')
  return response.data
}
