/**
 * 排班 V2 服务测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataAssembler } from '../services/schedulingV2/dataAssembler';
import { ResultParser } from '../services/schedulingV2/resultParser';
import { PersistenceService } from '../services/schedulingV2/persistenceService';
import {
  SolverRequest,
  SolverResponse,
  SolverConfig,
  DEFAULT_SOLVER_CONFIG,
} from '../types/schedulingV2';

// Mock pool
vi.mock('../config/database', () => ({
  default: {
    execute: vi.fn(),
    getConnection: vi.fn(() => ({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      execute: vi.fn(),
      release: vi.fn(),
    })),
  },
}));

describe('Scheduling V2 Services', () => {
  describe('DataAssembler', () => {
    describe('fetchOperationDemands', () => {
      it('should return empty array for empty batch ids', async () => {
        const result = await DataAssembler.fetchOperationDemands([]);
        expect(result).toEqual([]);
      });
    });

    describe('fetchSharedPreferences', () => {
      it('should return empty array for empty batch ids', async () => {
        const result = await DataAssembler.fetchSharedPreferences([]);
        expect(result).toEqual([]);
      });
    });

    describe('fetchLockedOperations', () => {
      it('should return empty array for empty batch ids', async () => {
        const result = await DataAssembler.fetchLockedOperations([]);
        expect(result).toEqual([]);
      });
    });
  });

  describe('ResultParser', () => {
    const mockSolverResponse: SolverResponse = {
      request_id: 'test-001',
      status: 'OPTIMAL',
      summary: '求解成功',
      assignments: [
        { operation_plan_id: 1, position_number: 1, employee_id: 101 },
        { operation_plan_id: 2, position_number: 1, employee_id: 102 },
      ],
      shift_plans: [
        {
          employee_id: 101,
          date: '2025-01-15',
          plan_type: 'WORK',
          plan_hours: 8,
          shift_id: 1,
          shift_code: 'DAY',
          shift_name: '常日班',
          shift_nominal_hours: 8,
          is_night_shift: false,
          operations: [
            {
              operation_plan_id: 1,
              planned_start: '2025-01-15T09:00:00',
              planned_end: '2025-01-15T10:00:00',
              duration_minutes: 60,
            },
          ],
          workshop_minutes: 60,
          is_overtime: false,
          is_buffer: false,
        },
        {
          employee_id: 102,
          date: '2025-01-15',
          plan_type: 'WORK',
          plan_hours: 8,
          shift_id: 1,
          shift_code: 'DAY',
          shift_name: '常日班',
          shift_nominal_hours: 8,
          is_night_shift: false,
          operations: [
            {
              operation_plan_id: 2,
              planned_start: '2025-01-15T14:00:00',
              planned_end: '2025-01-15T16:00:00',
              duration_minutes: 120,
            },
          ],
          workshop_minutes: 120,
          is_overtime: false,
          is_buffer: false,
        },
      ],
      hours_summaries: [
        {
          employee_id: 101,
          month: '2025-01',
          scheduled_hours: 168,
          standard_hours: 176,
          hours_deviation: -8,
          workshop_hours: 24,
          overtime_hours: 0,
          work_days: 21,
          rest_days: 10,
          buffer_days: 0,
          is_within_bounds: true,
        },
      ],
      warnings: [],
    };

    describe('parse', () => {
      it('should parse solver response correctly', () => {
        const result = ResultParser.parse(mockSolverResponse);
        
        expect(result.assignments.length).toBe(2);
        expect(result.shiftPlans.length).toBe(2);
        expect(result.summary.totalAssignments).toBe(2);
        expect(result.summary.totalShiftPlans).toBe(2);
        expect(result.summary.status).toBe('OPTIMAL');
      });

      it('should parse assignment records with correct status', () => {
        const result = ResultParser.parse(mockSolverResponse);
        
        result.assignments.forEach(assignment => {
          expect(assignment.assignmentStatus).toBe('PLANNED');
          expect(assignment.isLocked).toBe(false);
        });
      });

      it('should parse shift plan records with correct category', () => {
        const result = ResultParser.parse(mockSolverResponse);
        
        result.shiftPlans.forEach(plan => {
          expect(plan.planCategory).toBe('WORK');
        });
      });
    });

    describe('validate', () => {
      it('should return valid for correct parsed result', () => {
        const parsed = ResultParser.parse(mockSolverResponse);
        const validation = ResultParser.validate(parsed);
        
        expect(validation.valid).toBe(true);
        expect(validation.errors.length).toBe(0);
      });

      it('should detect missing assignments', () => {
        const emptyResponse: SolverResponse = {
          ...mockSolverResponse,
          status: 'FEASIBLE',
          assignments: [],
        };
        
        const parsed = ResultParser.parse(emptyResponse);
        const validation = ResultParser.validate(parsed);
        
        expect(validation.warnings.length).toBeGreaterThan(0);
      });
    });
  });

  describe('SolverConfig', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SOLVER_CONFIG.monthly_hours_lower_offset).toBe(16);
      expect(DEFAULT_SOLVER_CONFIG.monthly_hours_upper_offset).toBe(16);
      expect(DEFAULT_SOLVER_CONFIG.max_consecutive_workdays).toBe(6);
      expect(DEFAULT_SOLVER_CONFIG.night_rest_soft_days).toBe(2);
      expect(DEFAULT_SOLVER_CONFIG.enforce_monthly_hours).toBe(true);
      expect(DEFAULT_SOLVER_CONFIG.minimize_triple_holiday_staff).toBe(true);
    });

    it('should allow config override', () => {
      const customConfig: Partial<SolverConfig> = {
        monthly_hours_lower_offset: 20,
        max_consecutive_workdays: 5,
      };
      
      const merged = {
        ...DEFAULT_SOLVER_CONFIG,
        ...customConfig,
      };
      
      expect(merged.monthly_hours_lower_offset).toBe(20);
      expect(merged.max_consecutive_workdays).toBe(5);
      expect(merged.monthly_hours_upper_offset).toBe(16); // unchanged
    });
  });
});

describe('Integration Tests', () => {
  describe('Request/Response Flow', () => {
    it('should have matching type structures', () => {
      // 验证类型结构完整性
      const sampleRequest: SolverRequest = {
        request_id: 'test-integration-001',
        window: {
          start_date: '2025-01-01',
          end_date: '2025-01-31',
        },
        operation_demands: [
          {
            operation_plan_id: 1,
            batch_id: 100,
            batch_code: 'BATCH-001',
            operation_id: 10,
            operation_code: 'OP-001',
            operation_name: '测试操作',
            planned_start: '2025-01-15T09:00:00',
            planned_end: '2025-01-15T10:00:00',
            planned_duration_minutes: 60,
            required_people: 2,
            position_qualifications: [
              { position_number: 1, qualifications: [{ qualification_id: 1, min_level: 1 }] },
            ],
            is_locked: false,
          },
        ],
        employee_profiles: [
          {
            employee_id: 101,
            employee_code: 'EMP-001',
            employee_name: '测试员工',
            org_role: 'FRONTLINE',
            qualifications: [
              {
                qualification_id: 1,
                qualification_code: 'Q-001',
                qualification_name: '资质A',
                level: 2,
              },
            ],
          },
        ],
        calendar: [
          {
            date: '2025-01-15',
            is_workday: true,
            is_triple_salary: false,
            standard_hours: 8,
          },
        ],
        shift_definitions: [
          {
            shift_id: 1,
            shift_code: 'DAY',
            shift_name: '常日班',
            start_time: '08:30',
            end_time: '17:00',
            nominal_hours: 8,
            is_cross_day: false,
            is_night_shift: false,
            priority: 0,
          },
        ],
        config: DEFAULT_SOLVER_CONFIG,
        shared_preferences: [],
        locked_operations: [],
        locked_shifts: [],
        employee_unavailability: [],
        historical_shifts: [],
        target_batch_ids: [100],
      };

      // 确保请求结构正确
      expect(sampleRequest.request_id).toBeDefined();
      expect(sampleRequest.window.start_date).toBe('2025-01-01');
      expect(sampleRequest.operation_demands.length).toBe(1);
      expect(sampleRequest.employee_profiles[0].qualifications.length).toBe(1);
    });
  });
});

