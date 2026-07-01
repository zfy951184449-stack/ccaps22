import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../config/database', () => ({
  default: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

import app from '../server';
import pool from '../config/database';

const mockPool = pool as unknown as {
  execute: ReturnType<typeof vi.fn>;
};

const qualificationRows = [
  {
    operation_id: 42,
    position_number: 1,
    qualification_id: 10,
    qualification_name: '无菌操作',
    min_level: 2,
    is_mandatory: 1,
  },
  {
    operation_id: 42,
    position_number: 1,
    qualification_id: 20,
    qualification_name: '设备点检',
    min_level: 3,
    is_mandatory: 0,
  },
  {
    operation_id: 42,
    position_number: 2,
    qualification_id: 10,
    qualification_name: '无菌操作',
    min_level: 4,
    is_mandatory: 1,
  },
];

const employeeQualificationRows = [
  {
    employee_qualification_id: 101,
    employee_id: 1,
    employee_code: 'E001',
    employee_name: '张三',
    department_name: '生产部',
    team_name: 'USP',
    unit_name: 'USP一组',
    position_name: '操作员',
    qualification_id: 10,
    qualification_name: '无菌操作',
    qualification_level: 3,
  },
  {
    employee_qualification_id: 102,
    employee_id: 1,
    employee_code: 'E001',
    employee_name: '张三',
    department_name: '生产部',
    team_name: 'USP',
    unit_name: 'USP一组',
    position_name: '操作员',
    qualification_id: 20,
    qualification_name: '设备点检',
    qualification_level: 1,
  },
  {
    employee_qualification_id: 201,
    employee_id: 2,
    employee_code: 'E002',
    employee_name: '李四',
    department_name: '生产部',
    team_name: 'USP',
    unit_name: 'USP二组',
    position_name: '操作员',
    qualification_id: 10,
    qualification_name: '无菌操作',
    qualification_level: 1,
  },
  {
    employee_qualification_id: 301,
    employee_id: 3,
    employee_code: 'E003',
    employee_name: '王五',
    department_name: '生产部',
    team_name: 'USP',
    unit_name: 'USP三组',
    position_name: '班组长',
    qualification_id: 10,
    qualification_name: '无菌操作',
    qualification_level: 5,
  },
];

describe('operation qualified personnel details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM operations') && sql.includes('WHERE id = ?')) {
        return [[{
          id: 42,
          operation_code: 'OP-00042',
          operation_name: '细胞复苏',
          required_people: 2,
        }], []];
      }

      if (sql.includes('FROM operation_qualification_requirements oqr')) {
        return [qualificationRows, []];
      }

      if (sql.includes('FROM employees e')) {
        return [employeeQualificationRows, []];
      }

      return [[], []];
    });
  });

  it('returns exact qualified counts using mandatory requirements', async () => {
    const response = await request(app).get('/api/operations/qualified-personnel');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ 42: [2, 1] });
  });

  it('returns personnel details per position and keeps optional requirements non-blocking', async () => {
    const response = await request(app).get('/api/operations/42/qualified-personnel-details');

    expect(response.status).toBe(200);
    expect(response.body.operation_code).toBe('OP-00042');
    expect(response.body.positions).toHaveLength(2);

    expect(response.body.positions[0].qualified_count).toBe(2);
    expect(response.body.positions[0].personnel.map((person: any) => person.employee_name)).toEqual(['张三', '王五']);
    expect(response.body.positions[0].requirements.map((requirement: any) => requirement.is_mandatory)).toEqual([true, false]);
    expect(response.body.positions[0].personnel[0].qualifications[0].id).toBe(101);

    expect(response.body.positions[1].qualified_count).toBe(1);
    expect(response.body.positions[1].personnel.map((person: any) => person.employee_code)).toEqual(['E003']);
  });
});
