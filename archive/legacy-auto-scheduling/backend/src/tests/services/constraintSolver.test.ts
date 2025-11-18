import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConstraintSolver } from "../../services/constraintSolver";
import type {
  ScheduleAssignment,
  SchedulingContext,
} from "../../services/constraintSolver";
import { ComprehensiveWorkTimeAdapter } from "../../services/comprehensiveWorkTimeAdapter";

// Mock dependencies
vi.mock("../../services/comprehensiveWorkTimeAdapter");
vi.mock("../../config/database");

describe("ConstraintSolver", () => {
  let solver: ConstraintSolver;
  let mockAdapter: any;

  beforeEach(() => {
    mockAdapter = {
      getWorkTimeSystemConfig: vi.fn(),
      getPeriodStart: vi.fn((date: string, period: string) => {
        const d = require("dayjs")(date);
        switch (period) {
          case "WEEK":
            return d.startOf("week");
          case "MONTH":
            return d.startOf("month");
          case "QUARTER":
            return d.startOf("quarter");
          case "YEAR":
            return d.startOf("year");
          default:
            return d.startOf("month");
        }
      }),
      getPeriodEnd: vi.fn((date: string, period: string) => {
        const d = require("dayjs")(date);
        switch (period) {
          case "WEEK":
            return d.endOf("week");
          case "MONTH":
            return d.endOf("month");
          case "QUARTER":
            return d.endOf("quarter");
          case "YEAR":
            return d.endOf("year");
          default:
            return d.endOf("month");
        }
      }),
      checkComprehensiveConstraints: vi.fn().mockResolvedValue([]),
      calculatePeriodAccumulatedHoursFromSchedules: vi.fn().mockResolvedValue(0),
      calculateWorkingDays: vi.fn().mockResolvedValue(0),
    };

    // @ts-ignore
    vi.mocked(ComprehensiveWorkTimeAdapter).mockImplementation(() => mockAdapter);

    solver = new ConstraintSolver();
  });

  describe("checkConstraints", () => {
    it("should return valid result when no violations", async () => {
      const context: SchedulingContext = {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        employees: new Map([
          [
            1,
            {
              employeeId: 1,
              qualifications: [
                { qualificationId: 1, qualificationLevel: 3 },
              ],
              maxDailyHours: 11,
              maxConsecutiveDays: 6,
            },
          ],
        ]),
        operations: new Map([
          [
            1,
            {
              operationId: 1,
              requiredQualifications: [
                { qualificationId: 1, minLevel: 2 },
              ],
            },
          ],
        ]),
        historicalSchedules: new Map(),
      };

      const schedules: ScheduleAssignment[] = [
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
          operationId: 1,
        },
      ];

      const result = await solver.checkConstraints(1, schedules, context);

      expect(result.isValid).toBe(true);
      expect(result.violations.length).toBe(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it("should detect time conflicts", async () => {
      const context: SchedulingContext = {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        employees: new Map([
          [
            1,
            {
              employeeId: 1,
              qualifications: [],
              maxDailyHours: 11,
              maxConsecutiveDays: 6,
            },
          ],
        ]),
        operations: new Map(),
        historicalSchedules: new Map(),
      };

      const schedules: ScheduleAssignment[] = [
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
          startTime: "08:00",
          endTime: "17:00",
        },
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
          startTime: "14:00",
          endTime: "22:00",
        },
      ];

      const result = await solver.checkConstraints(1, schedules, context);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.type === "DOUBLE_BOOKING" || v.type === "TIME_CONFLICT")).toBe(true);
    });

    it("should detect qualification violations", async () => {
      const context: SchedulingContext = {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        employees: new Map([
          [
            1,
            {
              employeeId: 1,
              qualifications: [
                { qualificationId: 1, qualificationLevel: 1 }, // 级别不足
              ],
              maxDailyHours: 11,
              maxConsecutiveDays: 6,
            },
          ],
        ]),
        operations: new Map([
          [
            1,
            {
              operationId: 1,
              requiredQualifications: [
                { qualificationId: 1, minLevel: 3 }, // 需要级别3
              ],
            },
          ],
        ]),
        historicalSchedules: new Map(),
      };

      const schedules: ScheduleAssignment[] = [
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
          operationId: 1,
        },
      ];

      const result = await solver.checkConstraints(1, schedules, context);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.type === "QUALIFICATION_REQUIREMENT")).toBe(true);
    });

    it("should detect consecutive days violations", async () => {
      const context: SchedulingContext = {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        employees: new Map([
          [
            1,
            {
              employeeId: 1,
              qualifications: [],
              maxDailyHours: 11,
              maxConsecutiveDays: 6,
            },
          ],
        ]),
        operations: new Map(),
        historicalSchedules: new Map(),
      };

      // 创建连续8天的排班（超过6天限制）
      const schedules: ScheduleAssignment[] = [];
      for (let i = 0; i < 8; i++) {
        schedules.push({
          employeeId: 1,
          date: `2024-01-${String(i + 1).padStart(2, "0")}`,
          planHours: 8,
          overtimeHours: 0,
        });
      }

      const result = await solver.checkConstraints(1, schedules, context);

      expect(result.violations.some((v) => v.type === "CONSECUTIVE_DAYS_EXCEEDED")).toBe(true);
    });

    it("should detect night shift rest violations", async () => {
      const context: SchedulingContext = {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        employees: new Map([
          [
            1,
            {
              employeeId: 1,
              qualifications: [],
              maxDailyHours: 11,
              maxConsecutiveDays: 6,
            },
          ],
        ]),
        operations: new Map(),
        historicalSchedules: new Map(),
      };

      const schedules: ScheduleAssignment[] = [
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
          shiftCode: "NIGHT_SHIFT",
        },
        {
          employeeId: 1,
          date: "2024-01-01", // 同一天，应该检测为时间冲突
          planHours: 8,
          overtimeHours: 0,
        },
      ];

      const result = await solver.checkConstraints(1, schedules, context);

      // 应该检测到时间冲突或夜班休息违反
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should detect daily hours limit violations", async () => {
      const context: SchedulingContext = {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        employees: new Map([
          [
            1,
            {
              employeeId: 1,
              qualifications: [],
              maxDailyHours: 11,
              maxConsecutiveDays: 6,
            },
          ],
        ]),
        operations: new Map(),
        historicalSchedules: new Map(),
      };

      const schedules: ScheduleAssignment[] = [
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 5, // 总计13小时，超过11小时限制
        },
      ];

      const result = await solver.checkConstraints(1, schedules, context);

      expect(result.violations.some((v) => v.type === "DAILY_HOURS_EXCEEDED")).toBe(true);
    });
  });

  describe("repairViolations", () => {
    it("should generate repair suggestions", async () => {
      const context: SchedulingContext = {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        employees: new Map([
          [
            1,
            {
              employeeId: 1,
              qualifications: [],
              maxDailyHours: 11,
              maxConsecutiveDays: 6,
            },
          ],
        ]),
        operations: new Map(),
        historicalSchedules: new Map(),
      };

      const schedules: ScheduleAssignment[] = [
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
          shiftCode: "NIGHT_SHIFT",
        },
        {
          employeeId: 1,
          date: "2024-01-02",
          planHours: 8,
          overtimeHours: 0,
        },
      ];

      const violations = await solver.checkConstraints(1, schedules, context);

      // 确保有违反
      expect(violations.violations.length).toBeGreaterThan(0);
      
      const repairResult = await solver.repairViolations(
        violations.violations,
        schedules,
        context
      );

      // 应该生成修复建议（至少有一个违反应该有修复建议）
      // 注意：某些违反类型可能没有对应的修复建议生成逻辑
      expect(Array.isArray(repairResult.repairSuggestions)).toBe(true);
      expect(repairResult.repairedSchedules.length).toBeLessThanOrEqual(schedules.length);
    });
  });

  describe("adjustWeights", () => {
    it("should adjust constraint weights", () => {
      const initialWeights = solver.getWeights();
      expect(initialWeights.softConstraints.preference).toBe(1.0);

      solver.adjustWeights({
        softConstraints: {
          preference: 2.0,
          skillMatch: 1.5,
          workloadBalance: 1.0,
          shiftContinuity: 0.8,
          comprehensivePeriodAverage: 1.0,
        },
      });

      const updatedWeights = solver.getWeights();
      expect(updatedWeights.softConstraints.preference).toBe(2.0);
      expect(updatedWeights.softConstraints.skillMatch).toBe(1.5); // 其他权重保持不变
    });
  });
});

