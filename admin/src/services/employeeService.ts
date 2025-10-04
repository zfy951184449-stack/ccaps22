import apiClient from './apiClient'
import type { PersonnelSummary } from '../types/personnel'

export const fetchEmployees = async () => {
  const response = await apiClient.get<PersonnelSummary[]>('/employees')
  return response.data
}

export const updateEmployeeWorkloadProfile = async (
  employeeId: number,
  payload: { baselinePct: number; upperPct: number }
) => {
  await apiClient.put(`/employees/${employeeId}/workload-profile`, payload)
}
